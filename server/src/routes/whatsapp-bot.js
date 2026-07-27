/**
 * WhatsApp Bot — Full campaign creation flow via Meta Cloud API
 */
import express from "express";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";
import { createLogger } from "../utils/logger.js";
import {
  sendText,
  sendButtons,
  sendList,
  markAsRead,
} from "../utils/whatsapp-bot-api.js";

// Resolve number input to button ID
function resolveInput(input, conv) {
  const num = parseInt(input);
  const opts = conv?.menuOptions;
  if (num >= 1 && opts && num <= opts.length) return opts[num - 1];
  return input;
}

const MAIN_MENU_INPUTS = new Set([
  "תפריט",
  "תפריט ראשי",
  "ראשי",
  "התחלה",
  "menu",
  "main_menu",
  "back",
  "חזור",
  "חזור לתפריט",
  "חזור לתפריט הראשי",
  "ביטול",
  "cancel",
]);

async function interactiveMenu(phone, text, options) {
  if (options.length <= 3) {
    await sendButtons(phone, text, options);
    return;
  }
  await sendList(phone, text, "פתח רשימה", [
    {
      title: "אפשרויות",
      rows: options.slice(0, 10).map((option) => ({
        id: option.id,
        title: option.title.slice(0, 24),
        description: option.description?.slice(0, 72),
      })),
    },
  ]);
}
import { sendVerificationEmail } from "../utils/mailer.js";
import {
  getConversation,
  setConversation,
  clearConversation,
  getAuthenticatedUser,
  storePendingOTP,
  verifyOTP,
} from "../utils/whatsapp-bot-conversation.js";

const router = express.Router();
const log = createLogger("whatsapp-bot");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "../../uploads");
const AUTH_DB_TIMEOUT_MS = 5_000;

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    ),
  ]);
}

// ─── Webhook verification ───────────────────────────────────────────────────
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WA_BOT_VERIFY_TOKEN) {
    log.info("Webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─── Webhook receiver ───────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  res.sendStatus(200);
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;
    const from = msg.from;
    markAsRead(msg.id);

    const input = extractInput(msg);
    // Skip error webhooks (buttons not supported in sandbox)
    if (msg.errors) return;
    if (!input && msg.type !== "image") return;

    log.info("Incoming WhatsApp webhook message", {
      from,
      type: msg.type,
      messageId: msg.id,
      hasInput: Boolean(input),
    });

    // Handle image messages separately
    if (msg.type === "image") {
      await handleImage(from, msg);
      return;
    }

    await route(from, input);
  } catch (err) {
    log.error("Webhook error", err);
  }
});

function extractInput(msg) {
  if (msg.type === "text") return msg.text?.body?.trim();
  if (msg.type === "interactive") {
    if (msg.interactive?.type === "button_reply")
      return msg.interactive.button_reply.id;
    if (msg.interactive?.type === "list_reply")
      return msg.interactive.list_reply.id;
  }
  // Some Cloud API versions send button replies as type="button"
  if (msg.type === "button") return msg.button?.payload || msg.button?.text;
  return null;
}

// ─── Router ─────────────────────────────────────────────────────────────────
async function route(phone, input) {
  const conv = getConversation(phone);
  const userId = getAuthenticatedUser(phone);

  if (userId && MAIN_MENU_INPUTS.has(input)) {
    setConversation(phone, { step: "MAIN_MENU", draft: undefined });
    await mainMenu(phone);
    return;
  }

  if (!userId) {
    await authFlow(phone, input, conv);
    return;
  }

  const step = conv?.step || "MAIN_MENU";
  if (input === "disconnect") {
    clearConversation(phone);
    await sendText(phone, "התנתקת בהצלחה. שלח הודעה כדי להתחבר מחדש.");
    return;
  }

  try {
    const resolved = resolveInput(input, conv);
    log.info("WhatsApp bot step resolved", {
      phone,
      step,
      inputType: resolved?.startsWith("plat_") ? "platform" : "text_or_action",
    });
    if (resolved.startsWith("plat_") && step !== "CAMP_PLATFORM") {
      await steps.CAMP_PLATFORM(phone, userId, resolved, conv);
      return;
    }
    const handler = steps[step];
    if (handler) {
      await handler(phone, userId, resolved, conv);
    } else {
      log.warn(`No handler for step: ${step}`);
      await mainMenu(phone);
    }
  } catch (err) {
    log.error(`Step ${step} error`, err);
    await sendText(phone, "אירעה שגיאה. שלח 'תפריט' לחזור.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════
async function authFlow(phone, input, conv) {
  const step = conv?.step;
  log.info("Auth flow", { phone, step: step || "WELCOME" });

  if (!step || step === "WELCOME") {
    setConversation(phone, { step: "AWAITING_ID" });
    await sendText(
      phone,
      "שלום! אני פוסבוט.\n\nכדי להתחבר, שלח את מספר תעודת הזהות שלך (9 ספרות).",
    );
    return;
  }

  if (step === "AWAITING_ID") {
    const id = input.replace(/\D/g, "");
    log.info("ID received", { phone, digitCount: id.length });
    if (id.length !== 9) {
      await sendText(phone, "מספר תעודת זהות לא תקין. יש להזין 9 ספרות.");
      return;
    }
    let user;
    try {
      user = await withTimeout(
        prisma.user.findUnique({
          where: { idNumber: id },
          select: { id: true, email: true, name: true },
        }),
        AUTH_DB_TIMEOUT_MS,
        "AUTH_DB_LOOKUP_TIMEOUT",
      );
    } catch (err) {
      log.error("Auth DB lookup failed", err, { phone });
      await sendText(
        phone,
        "יש כרגע בעיה בחיבור למסד הנתונים. נסה שוב בעוד רגע.",
      );
      return;
    }
    if (!user) {
      await sendText(
        phone,
        "לא נמצא חשבון עם תעודת הזהות הזו.\nיש להירשם באתר תחילה.",
      );
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    storePendingOTP(phone, user.id, user.email, code);
    const masked = maskEmail(user.email);
    const sent = await sendVerificationEmail(user.email, code);
    if (!sent) {
      await sendText(phone, "שגיאה בשליחת המייל. נסה שוב.");
      return;
    }
    setConversation(phone, { step: "AWAITING_OTP", pendingName: user.name });
    await sendText(
      phone,
      `שלחתי קוד אימות למייל ${masked}\n\nמה הקוד? (6 ספרות)`,
    );
    return;
  }

  if (step === "AWAITING_OTP") {
    const code = input.replace(/\D/g, "");
    if (code.length !== 6) {
      await sendText(phone, "קוד לא תקין. יש להזין 6 ספרות.");
      return;
    }
    const result = verifyOTP(phone, code);
    if (!result) {
      await sendText(phone, "קוד שגוי או שפג תוקפו.");
      return;
    }
    setConversation(phone, { userId: result.userId, step: "MAIN_MENU" });
    await sendText(phone, `מחובר! שלום ${conv?.pendingName || ""}`);
    await mainMenu(phone);
    return;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN MENU
// ═══════════════════════════════════════════════════════════════════════════════
async function mainMenu(phone) {
  await interactiveMenu(phone, "מה תרצה לעשות?", [
    { id: "create_campaign", title: "צור קמפיין" },
    { id: "my_campaigns", title: "הקמפיינים שלי" },
    { id: "status", title: "סטטוס" },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════
const steps = {
  MAIN_MENU: async (phone, userId, input) => {
    if (
      input === "1" ||
      input === "create_campaign" ||
      input === "צור קמפיין"
    ) {
      await startCampaign(phone);
      return;
    }
    if (
      input === "2" ||
      input === "my_campaigns" ||
      input === "הקמפיינים שלי"
    ) {
      await showCampaigns(phone, userId);
      return;
    }
    if (input === "3" || input === "status" || input === "סטטוס") {
      await showStatus(phone, userId);
      return;
    }
    await mainMenu(phone);
  },

  // ── Campaign: Name ──
  CAMP_NAME: async (phone, userId, input) => {
    if (input.length < 2) {
      await sendText(phone, "שם קצר מדי. נסה שוב:");
      return;
    }
    updateDraft(phone, { title: input });
    setConversation(phone, { step: "CAMP_CONTENT" });
    await sendText(phone, "כתוב את תוכן הפוסט:");
  },

  // ── Campaign: Content ──
  CAMP_CONTENT: async (phone, userId, input) => {
    if (input.length < 3) {
      await sendText(phone, "תוכן קצר מדי. כתוב לפחות 3 תווים:");
      return;
    }
    updateDraft(phone, { content: input });
    setConversation(phone, { step: "CAMP_WHATSAPP" });
    // Check if user has WhatsApp connected
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { whatsappNumber: true, whatsappMessage: true },
    });
    if (user?.whatsappNumber) {
      await interactiveMenu(phone, "להוסיף קישור וואטסאפ לפוסט?", [
        { id: "wa_yes", title: "כן, הוסף וואטסאפ" },
        { id: "wa_no", title: "לא, המשך" },
      ]);
    } else {
      await interactiveMenu(
        phone,
        "וואטסאפ לא מחובר.\nכדי להוסיף קישור וואטסאפ, חבר אותו באתר בהגדרות.",
        [{ id: "wa_no", title: "המשך בלי וואטסאפ" }],
      );
    }
  },

  // ── Campaign: WhatsApp link ──
  CAMP_WHATSAPP: async (phone, userId, input) => {
    if (input === "wa_yes") {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { whatsappNumber: true, whatsappMessage: true },
      });
      if (user?.whatsappNumber) {
        const waLink = `https://wa.me/${user.whatsappNumber}${user.whatsappMessage ? `?text=${encodeURIComponent(user.whatsappMessage)}` : ""}`;
        const conv = getConversation(phone);
        const draft = conv?.draft || {};
        draft.content = (draft.content || "") + `\n\n${waLink}`;
        draft.hasWhatsApp = true;
        updateDraft(phone, draft);
        await sendText(phone, "וואטסאפ נוסף בהצלחה!");
      }
    }
    setConversation(phone, { step: "CAMP_IMAGES" });
    await interactiveMenu(phone, "להוסיף תמונות?", [
      { id: "img_yes", title: "כן, שלח תמונות" },
      { id: "img_no", title: "המשך בלי תמונה" },
    ]);
  },

  // ── Campaign: Images ──
  CAMP_IMAGES: async (phone, userId, input) => {
    if (input === "img_yes") {
      await sendText(
        phone,
        "שלח עד 12 תמונות (ביחד בהודעה אחת).\nכשסיימת שלח 'סיום'.",
      );
      setConversation(phone, { step: "CAMP_IMAGES_WAIT" });
      return;
    }
    if (input === "img_no") {
      setConversation(phone, { step: "CAMP_PREVIEW" });
      await showPreview(phone);
      return;
    }
    await interactiveMenu(phone, "להוסיף תמונות?", [
      { id: "img_yes", title: "כן, שלח תמונות" },
      { id: "img_no", title: "המשך בלי תמונה" },
    ]);
  },

  // ── Campaign: Waiting for images ──
  CAMP_IMAGES_WAIT: async (phone, userId, input) => {
    if (input === "סיום" || input === "done" || input === "המשך") {
      setConversation(phone, { step: "CAMP_PREVIEW" });
      await showPreview(phone);
      return;
    }
    await sendText(phone, "שלח תמונות, או כתוב 'סיום' להמשיך.");
  },

  // ── Campaign: Preview ──
  CAMP_PREVIEW: async (phone, userId, input) => {
    if (input === "preview_publish") {
      setConversation(phone, { step: "CAMP_PLATFORM" });
      await askPlatform(phone, []);
      return;
    }
    if (input === "preview_edit") {
      await startCampaign(phone);
      return;
    }
    await showPreview(phone);
  },

  // ── Campaign: Platform selection ──
  CAMP_PLATFORM: async (phone, userId, input, conv) => {
    const draft = conv?.draft || {};
    const selected = draft.platforms || [];

    if (input === "platforms_done") {
      if (!hasAnyPublishTarget(draft)) {
        await askPlatform(phone, selected);
        return;
      }
      await askSchedule(phone);
      return;
    }
    if (input === "plat_facebook") {
      setConversation(phone, { step: "CAMP_FB_TYPE" });
      await interactiveMenu(phone, "פרסום בפייסבוק:", [
        { id: "fb_profile", title: "פרופיל אישי" },
        { id: "fb_groups", title: "קבוצות" },
      ]);
      return;
    }
    if (input === "plat_instagram") {
      setConversation(phone, { step: "CAMP_IG_TYPES" });
      await showInstagramTypes(phone);
      return;
    }
    if (input === "plat_whatsapp") {
      setConversation(phone, { step: "CAMP_WA_TARGETS" });
      await showWhatsAppTargets(phone, userId);
      return;
    }
    await askPlatform(phone, selected);
  },

  // ── Facebook type ──
  CAMP_FB_TYPE: async (phone, userId, input, conv) => {
    const draft = conv?.draft || {};
    const selected = draft.platforms || [];

    if (input === "fb_profile") {
      if (!selected.includes("fb_profile")) selected.push("fb_profile");
      updateDraft(phone, { platforms: selected, publishToProfile: true });
      await sendText(phone, "פרופיל אישי נוסף!");
      setConversation(phone, { step: "CAMP_FB_ALSO_GROUPS" });
      await interactiveMenu(phone, "תרצה לפרסם גם בקבוצות?", [
        { id: "also_groups_yes", title: "כן" },
        { id: "also_groups_no", title: "לא" },
      ]);
      return;
    }
    if (input === "fb_groups") {
      setConversation(phone, { step: "CAMP_GROUPS" });
      await showFacebookGroupPicker(phone, userId);
      return;
    }
  },

  // ── Also groups? ──
  CAMP_FB_ALSO_GROUPS: async (phone, userId, input) => {
    if (input === "also_groups_yes") {
      setConversation(phone, { step: "CAMP_GROUPS" });
      await showFacebookGroupPicker(phone, userId);
      return;
    }
    if (input === "also_groups_no") {
      const conv = getConversation(phone);
      await askMorePlatforms(phone, conv?.draft?.platforms || []);
      return;
    }
  },

  CAMP_IG_TYPES: async (phone, userId, input, conv) => {
    const draft = conv?.draft || {};
    const types = [...(draft.instagramPublishTypes || [])];
    const igOptions = ["FEED", "STORY", "REEL"];

    if (input === "ig_done") {
      await finishInstagramSelection(phone);
      return;
    }
    if (input === "ig_all") {
      updateDraft(phone, { instagramPublishTypes: igOptions });
      await showInstagramTypes(phone);
      return;
    }
    if (input === "ig_clear") {
      updateDraft(phone, { instagramPublishTypes: [] });
      await showInstagramTypes(phone);
      return;
    }

    const type = input.replace("ig_", "").toUpperCase();
    if (["FEED", "STORY", "REEL"].includes(type)) {
      const index = types.indexOf(type);
      if (index >= 0) types.splice(index, 1);
      else types.push(type);
      updateDraft(phone, { instagramPublishTypes: types });
      setConversation(phone, { step: "CAMP_IG_TYPES" });
      await showInstagramTypes(phone);
      return;
    }
    const selectedIndexes = parseSelectionInput(input, igOptions.length);
    if (selectedIndexes.length) {
      for (const index of selectedIndexes) {
        const selectedType = igOptions[index];
        const existing = types.indexOf(selectedType);
        if (existing >= 0) types.splice(existing, 1);
        else types.push(selectedType);
      }
      updateDraft(phone, { instagramPublishTypes: types });
      await showInstagramTypes(phone);
      return;
    }
    await showInstagramTypes(phone);
  },

  CAMP_IG_MORE: async (phone, userId, input, conv) => {
    if (
      input.startsWith("ig_") &&
      input !== "ig_more_yes" &&
      input !== "ig_more_no"
    ) {
      setConversation(phone, { step: "CAMP_IG_TYPES" });
      await steps.CAMP_IG_TYPES(phone, userId, input, conv);
      return;
    }
    if (input === "ig_more_yes") {
      setConversation(phone, { step: "CAMP_IG_TYPES" });
      await showInstagramTypes(phone);
      return;
    }
    if (input === "ig_more_no") {
      await finishInstagramSelection(phone);
      return;
    }
  },

  CAMP_WA_TARGETS: async (phone, userId, input, conv) => {
    const draft = conv?.draft || {};
    const targets = [...(draft.whatsappTargets || [])];
    const available = draft.availableWaTargets || [];
    if (input === "wa_targets_cancel") {
      const platforms = (draft.platforms || []).filter(
        (platform) => platform !== "whatsapp",
      );
      updateDraft(phone, {
        platforms,
        waEnabled: false,
        whatsappTargets: [],
        availableWaTargets: [],
      });
      await sendText(phone, "פרסום ב-WhatsApp בוטל.");
      await askMorePlatforms(phone, platforms);
      return;
    }
    if (input === "wa_targets_clear") {
      updateDraft(phone, { whatsappTargets: [] });
      await showWhatsAppTargets(phone, userId);
      return;
    }
    if (input === "wa_targets_all") {
      updateDraft(phone, { whatsappTargets: available });
      await showWhatsAppTargets(phone, userId);
      return;
    }
    if (input === "wa_targets_search") {
      setConversation(phone, { step: "CAMP_WA_SEARCH" });
      await sendText(phone, "כתוב חלק משם הקבוצה או רשימת התפוצה:");
      return;
    }
    if (input.startsWith("חפש ") || input.toLowerCase().startsWith("search ")) {
      const search = input.replace(/^(חפש|search)\s+/i, "").trim();
      updateDraft(phone, { waTargetSearch: search });
      await showWhatsAppTargets(phone, userId);
      return;
    }
    if (input === "wa_targets_done") {
      if (!targets.length) {
        await showWhatsAppTargets(phone, userId);
        return;
      }
      const platforms = [...(draft.platforms || [])];
      if (!platforms.includes("whatsapp")) platforms.push("whatsapp");
      updateDraft(phone, {
        platforms,
        waEnabled: true,
        whatsappTargets: targets,
      });
      await askMorePlatforms(phone, platforms);
      return;
    }
    if (input.startsWith("wa_target_")) {
      const id = input.slice("wa_target_".length);
      const target = available.find((item) => item.id === id);
      if (target) {
        const index = targets.findIndex((item) => item.id === target.id);
        if (index >= 0) targets.splice(index, 1);
        else targets.push(target);
        updateDraft(phone, { whatsappTargets: targets });
      }
    }
    const selectedIndexes = parseSelectionInput(input, available.length);
    if (selectedIndexes.length) {
      for (const index of selectedIndexes) {
        const target = available[index];
        if (!target) continue;
        const existing = targets.findIndex((item) => item.id === target.id);
        if (existing >= 0) targets.splice(existing, 1);
        else targets.push(target);
      }
      updateDraft(phone, { whatsappTargets: targets });
    }
    await showWhatsAppTargets(phone, userId);
  },

  CAMP_WA_SEARCH: async (phone, userId, input) => {
    updateDraft(phone, { waTargetSearch: input.trim() });
    setConversation(phone, { step: "CAMP_WA_TARGETS" });
    await showWhatsAppTargets(phone, userId);
  },

  // ── Group selection ──
  CAMP_GROUPS: async (phone, userId, input, conv) => {
    const draft = conv?.draft || {};
    const groupIds = draft.groupIds || [];
    const groupNames = draft.groupNames || [];
    const available = draft.availableGroups || [];

    if (input === "groups_clear") {
      updateDraft(phone, { groupIds: [], groupNames: [] });
      await showFacebookGroupPicker(phone, userId);
      return;
    }
    if (input.startsWith("חפש ") || input.toLowerCase().startsWith("search ")) {
      const search = input.replace(/^(חפש|search)\s+/i, "").trim();
      updateDraft(phone, { fbGroupSearch: search });
      await showFacebookGroupPicker(phone, userId);
      return;
    }
    if (input.startsWith("fb_group_")) {
      const id = input.slice("fb_group_".length);
      const g = available.find((item) => item.id === id);
      if (g) {
        const index = groupIds.indexOf(g.id);
        if (index >= 0) {
          groupIds.splice(index, 1);
          groupNames.splice(index, 1);
        } else {
          groupIds.push(g.id);
          groupNames.push(g.name);
        }
        updateDraft(phone, { groupIds, groupNames });
      }
      await showFacebookGroupPicker(phone, userId);
      return;
    }

    if (input === "groups_done") {
      if (!groupIds.length) {
        await showFacebookGroupPicker(phone, userId);
        return;
      }
      const platforms = [...(draft.platforms || [])];
      if (!platforms.includes("fb_groups")) {
        platforms.push("fb_groups");
      }
      updateDraft(phone, { platforms });
      await askMorePlatforms(phone, platforms);
      return;
    }

    if (input === "groups_all") {
      updateDraft(phone, {
        groupIds: available.map((group) => group.id),
        groupNames: available.map((group) => group.name),
      });
      await showFacebookGroupPicker(phone, userId);
      return;
    }

    const selectedIndexes = parseSelectionInput(input, available.length);
    if (selectedIndexes.length) {
      for (const index of selectedIndexes) {
        const group = available[index];
        const existing = groupIds.indexOf(group.id);
        if (existing >= 0) {
          groupIds.splice(existing, 1);
          groupNames.splice(existing, 1);
        } else {
          groupIds.push(group.id);
          groupNames.push(group.name);
        }
      }
      updateDraft(phone, { groupIds, groupNames });
      await showFacebookGroupPicker(phone, userId);
      return;
    }

    await showFacebookGroupPicker(phone, userId);
  },

  // ── More platforms? ──
  CAMP_MORE_PLATFORMS: async (phone, userId, input, conv) => {
    if (input === "more_yes") {
      setConversation(phone, { step: "CAMP_PLATFORM" });
      await askPlatform(phone, conv?.draft?.platforms || []);
      return;
    }
    if (input === "more_no") {
      await askSchedule(phone);
      return;
    }
  },

  // ── Schedule ──
  CAMP_SCHEDULE: async (phone, userId, input) => {
    if (input === "sched_now") {
      updateDraft(phone, { scheduleMode: "now" });
      await createCampaign(phone, userId);
      return;
    }
    if (input === "sched_later") {
      setConversation(phone, { step: "CAMP_DATE" });
      await sendText(phone, "שלח תאריך (DD/MM/YYYY):");
      return;
    }
    if (input === "sched_recurring") {
      updateDraft(phone, { scheduleMode: "recurring", recurringDays: [] });
      setConversation(phone, { step: "CAMP_RECURRING_DAYS" });
      await showRecurringDays(phone);
      return;
    }
  },

  CAMP_RECURRING_DAYS: async (phone, userId, input, conv) => {
    const days = [...(conv?.draft?.recurringDays || [])];
    if (input === "days_done") {
      if (!days.length) {
        await showRecurringDays(phone);
        return;
      }
      setConversation(phone, { step: "CAMP_RECURRING_TIME" });
      await sendText(phone, "שלח שעת פרסום בפורמט HH:MM");
      return;
    }
    if (input.startsWith("day_")) {
      const day = Number(input.slice(4));
      const index = days.indexOf(day);
      if (index >= 0) days.splice(index, 1);
      else days.push(day);
      updateDraft(phone, { recurringDays: days });
    }
    await showRecurringDays(phone);
  },

  CAMP_RECURRING_TIME: async (phone, userId, input) => {
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(input)) {
      await sendText(phone, "שעה לא תקינה. שלח HH:MM");
      return;
    }
    updateDraft(phone, { recurringTime: input.padStart(5, "0") });
    setConversation(phone, { step: "CAMP_RECURRING_START" });
    await sendText(phone, "שלח תאריך התחלה בפורמט DD/MM/YYYY");
  },

  CAMP_RECURRING_START: async (phone, userId, input) => {
    const value = parseBotDate(input);
    if (!value) {
      await sendText(phone, "תאריך לא תקין. שלח DD/MM/YYYY");
      return;
    }
    updateDraft(phone, { recurringStartDate: value });
    setConversation(phone, { step: "CAMP_RECURRING_END" });
    await sendText(phone, "שלח תאריך סיום בפורמט DD/MM/YYYY");
  },

  CAMP_RECURRING_END: async (phone, userId, input, conv) => {
    const value = parseBotDate(input);
    if (!value || value < conv?.draft?.recurringStartDate) {
      await sendText(phone, "תאריך סיום לא תקין. שלח DD/MM/YYYY");
      return;
    }
    updateDraft(phone, { recurringEndDate: value });
    await createCampaign(phone, userId);
  },

  // ── Date ──
  CAMP_DATE: async (phone, userId, input) => {
    const m = input.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!m) {
      await sendText(phone, "פורמט לא תקין. שלח DD/MM/YYYY:");
      return;
    }
    const [, d, mo, y] = m;
    const date = new Date(`${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`);
    if (isNaN(date.getTime()) || date < new Date(new Date().toDateString())) {
      await sendText(phone, "תאריך לא תקין או בעבר. נסה שוב:");
      return;
    }
    updateDraft(phone, {
      scheduleDate: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`,
    });
    setConversation(phone, { step: "CAMP_TIME" });
    await sendText(phone, "שלח שעה (HH:MM):");
  },

  // ── Time ──
  CAMP_TIME: async (phone, userId, input) => {
    const m = input.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) {
      await sendText(phone, "פורמט לא תקין. שלח HH:MM:");
      return;
    }
    const [, h, mi] = m;
    if (+h > 23 || +mi > 59) {
      await sendText(phone, "שעה לא תקינה.");
      return;
    }
    const conv = getConversation(phone);
    const draft = conv?.draft || {};
    const scheduledAt = new Date(
      `${draft.scheduleDate}T${h.padStart(2, "0")}:${mi}:00`,
    );
    if (scheduledAt <= new Date()) {
      await sendText(phone, "הזמן חייב להיות בעתיד. שלח תאריך:");
      setConversation(phone, { step: "CAMP_DATE" });
      return;
    }
    updateDraft(phone, {
      scheduleTime: `${h.padStart(2, "0")}:${mi}`,
      scheduleMode: "scheduled",
    });
    await createCampaign(phone, userId);
  },

  CAMPAIGNS_LIST: async (phone, userId, input) => {
    if (input === "create_campaign") {
      await startCampaign(phone);
      return;
    }
    await mainMenu(phone);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function startCampaign(phone) {
  setConversation(phone, {
    step: "CAMP_NAME",
    draft: { groupIds: [], groupNames: [], platforms: [], images: [] },
  });
  await sendText(
    phone,
    "יצירת קמפיין חדש\n\nשלח את שם הקמפיין (רק עבורך, אינו מפורסם):",
  );
}

function updateDraft(phone, data) {
  const conv = getConversation(phone);
  const draft = { ...(conv?.draft || {}), ...data };
  setConversation(phone, { draft });
}

function hasAnyPublishTarget(draft = {}) {
  return Boolean(
    draft.publishToProfile ||
    draft.groupIds?.length ||
    draft.igEnabled ||
    draft.waEnabled,
  );
}

function parseSelectionInput(input, max) {
  const selected = new Set();
  const parts = String(input || "")
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const min = Math.min(start, end);
      const maxValue = Math.max(start, end);
      for (let value = min; value <= maxValue; value++) {
        if (value >= 1 && value <= max) selected.add(value - 1);
      }
      continue;
    }

    const value = Number(part);
    if (Number.isInteger(value) && value >= 1 && value <= max) {
      selected.add(value - 1);
    }
  }

  return [...selected];
}

async function askSchedule(phone) {
  setConversation(phone, { step: "CAMP_SCHEDULE" });
  await interactiveMenu(phone, "מתי לפרסם?", [
    { id: "sched_now", title: "עכשיו" },
    { id: "sched_later", title: "תזמון לתאריך" },
    { id: "sched_recurring", title: "פרסום חוזר" },
  ]);
}

async function showPreview(phone) {
  const conv = getConversation(phone);
  const draft = conv?.draft || {};
  const imgCount = (draft.images || []).length;

  let preview = "תצוגה מקדימה:\n\n";
  preview += draft.content || "(ללא תוכן)";
  if (imgCount > 0) preview += `\n\n[${imgCount} תמונות]`;
  if (draft.hasWhatsApp) preview += "\n\n[קישור וואטסאפ מצורף]";

  await sendText(phone, preview);
  await interactiveMenu(phone, "מה לעשות?", [
    { id: "preview_publish", title: "המשך לפרסום" },
    { id: "preview_edit", title: "עריכת פוסט" },
  ]);
}

async function askPlatform(phone, selected) {
  const remaining = [];
  if (!selected.includes("fb_profile") && !selected.includes("fb_groups")) {
    remaining.push({ id: "plat_facebook", title: "פייסבוק" });
  }
  if (!selected.includes("instagram")) {
    remaining.push({ id: "plat_instagram", title: "אינסטגרם" });
  }
  if (!selected.includes("whatsapp")) {
    remaining.push({ id: "plat_whatsapp", title: "וואטסאפ" });
  }

  if (remaining.length === 0) {
    await askSchedule(phone);
    return;
  }

  const draft = getConversation(phone)?.draft || {};
  const options = [...remaining];
  if (hasAnyPublishTarget(draft)) {
    options.push({ id: "platforms_done", title: "סיום בחירה" });
  }

  setConversation(phone, { step: "CAMP_PLATFORM" });
  await interactiveMenu(
    phone,
    selected.length > 0
      ? "בחר פלטפורמה נוספת:"
      : "היכן תרצה לפרסם?\n(בחר אחד, בהמשך ניתן להוסיף עוד)",
    options,
  );
}

async function askMorePlatforms(phone, selected) {
  const allPlatforms = ["fb_profile", "fb_groups", "instagram", "whatsapp"];
  const hasMore = allPlatforms.some((p) => !selected.includes(p));

  if (!hasMore) {
    await askSchedule(phone);
    return;
  }

  setConversation(phone, { step: "CAMP_MORE_PLATFORMS" });
  await interactiveMenu(phone, "לפרסם בעוד פלטפורמות?", [
    { id: "more_yes", title: "כן" },
    { id: "more_no", title: "לא, המשך" },
  ]);
}

function buildNumberedSelectionText({ title, items, selectedIds, footer }) {
  const lines = [title, ""];
  items.forEach((item, index) => {
    const checked = selectedIds.has(item.id) ? "✓ " : "";
    const suffix = item.description ? ` - ${item.description}` : "";
    lines.push(`${index + 1}. ${checked}${item.name}${suffix}`);
  });
  lines.push("", footer);
  return lines.join("\n").slice(0, 3900);
}

async function showFacebookGroupPicker(phone, userId) {
  const conv = getConversation(phone);
  const draft = conv?.draft || {};
  const all = await prisma.userGroup.findMany({
    where: { userId },
    include: {
      group: {
        select: {
          id: true,
          externalGroupId: true,
          name: true,
          memberCount: true,
        },
      },
    },
    orderBy: { group: { memberCount: "desc" } },
  });
  if (!all.length) {
    await sendText(phone, "אין קבוצות Facebook שמורות. יש לסנכרן אותן באתר.");
    await askMorePlatforms(phone, draft.platforms || []);
    return;
  }
  const allGroups = all.map(({ group }) => ({
    id: group.externalGroupId || group.id,
    name: group.name,
    memberCount: group.memberCount,
    description: group.memberCount ? `${group.memberCount} חברים` : undefined,
  }));
  const search = (draft.fbGroupSearch || "").trim().toLocaleLowerCase("he");
  const available = search
    ? allGroups.filter((group) =>
        group.name.toLocaleLowerCase("he").includes(search),
      )
    : allGroups;
  updateDraft(phone, { availableGroups: available });
  const selected = draft.groupIds || [];
  const text = buildNumberedSelectionText({
    title: search
      ? `קבוצות Facebook עבור "${draft.fbGroupSearch}" (${selected.length} נבחרו)`
      : `בחר קבוצות Facebook (${selected.length} נבחרו)`,
    items: available,
    selectedIds: new Set(selected),
    footer:
      "שלח מספרים לבחירה/ביטול, למשל: 1,3,5 או 2-6.\nלחיפוש כתוב: חפש שם. כתוב תפריט לחזרה לתפריט הראשי.",
  });
  await sendText(phone, text);
  await interactiveMenu(phone, "פעולות לבחירת קבוצות:", [
    { id: "groups_done", title: `סיום (${selected.length})` },
    { id: "groups_all", title: "בחר הכל" },
    { id: "groups_clear", title: "נקה" },
  ]);
}

async function showInstagramTypes(phone) {
  const selected = getConversation(phone)?.draft?.instagramPublishTypes || [];
  const items = [
    { id: "FEED", name: "פוסט" },
    { id: "STORY", name: "סטורי" },
    { id: "REEL", name: "ריל" },
  ];
  const text = buildNumberedSelectionText({
    title: `בחר סוגי פרסום ב-Instagram (${selected.length} נבחרו)`,
    items,
    selectedIds: new Set(selected),
    footer:
      "שלח מספרים לבחירה/ביטול, למשל: 1,2 או 1-3.\nכתוב תפריט לחזרה לתפריט הראשי.",
  });
  setConversation(phone, { step: "CAMP_IG_TYPES" });
  await sendText(phone, text);
  await interactiveMenu(phone, "פעולות לבחירת Instagram:", [
    { id: "ig_done", title: `סיום (${selected.length})` },
    { id: "ig_all", title: "בחר הכל" },
    { id: "ig_clear", title: "נקה" },
  ]);
}

function formatInstagramTypes(types) {
  const labels = { FEED: "פוסט", STORY: "סטורי", REEL: "ריל" };
  return types.map((type) => labels[type]).join(", ");
}

async function finishInstagramSelection(phone) {
  const draft = getConversation(phone)?.draft || {};
  const types = draft.instagramPublishTypes || [];
  if (!types.length) {
    setConversation(phone, { step: "CAMP_IG_TYPES" });
    await showInstagramTypes(phone);
    return;
  }
  if (!(draft.images || []).length) {
    await sendText(phone, "פרסום ב-Instagram דורש לפחות תמונה אחת.");
    setConversation(phone, { step: "CAMP_IG_TYPES" });
    await showInstagramTypes(phone);
    return;
  }
  const platforms = [...(draft.platforms || [])];
  if (!platforms.includes("instagram")) platforms.push("instagram");
  updateDraft(phone, {
    platforms,
    igEnabled: true,
    instagramPublishTypes: types,
  });
  await sendText(phone, `Instagram נוסף: ${formatInstagramTypes(types)}.`);
  await askMorePlatforms(phone, platforms);
}

async function showRecurringDays(phone) {
  const selected = getConversation(phone)?.draft?.recurringDays || [];
  const names = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  await interactiveMenu(phone, "בחר ימי פרסום. לחיצה נוספת מבטלת בחירה.", [
    ...names.map((name, day) => ({
      id: `day_${day}`,
      title: `${selected.includes(day) ? "✓ " : ""}${name}`,
    })),
    { id: "days_done", title: `סיום (${selected.length} נבחרו)` },
  ]);
}

function parseBotDate(input) {
  const match = input.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function nextRecurringRun(days, time, startDate) {
  const [hours, minutes] = time.split(":").map(Number);
  const now = new Date();
  const cursor = startDate
    ? new Date(`${startDate}T${time}:00`)
    : new Date(now);
  cursor.setHours(hours, minutes, 0, 0);
  if (cursor < now) cursor.setTime(now.getTime());
  for (let offset = 0; offset <= 14; offset++) {
    const candidate = new Date(cursor);
    candidate.setDate(cursor.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate > now && days.includes(candidate.getDay())) return candidate;
  }
  return null;
}

async function showWhatsAppTargets(phone, userId) {
  const [groups, broadcasts] = await Promise.all([
    prisma.whatsAppContact.findMany({
      where: { userId, isGroup: true },
      orderBy: { name: "asc" },
    }),
    prisma.whatsAppBroadcastList.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    }),
  ]);
  const available = [
    ...groups.map((group) => ({
      id: group.waId,
      type: "group",
      name: group.name || "קבוצת WhatsApp",
      description: "קבוצה",
    })),
    ...broadcasts.map((list) => ({
      id: `broadcast_${list.id}`,
      type: "broadcast",
      name: list.name,
      description: "רשימת תפוצה",
    })),
  ];
  const conv = getConversation(phone);
  const selected = conv?.draft?.whatsappTargets || [];
  const search = (conv?.draft?.waTargetSearch || "")
    .trim()
    .toLocaleLowerCase("he");
  updateDraft(phone, { availableWaTargets: available });
  if (!available.length) {
    await sendText(
      phone,
      "אין קבוצות או רשימות תפוצה שמורות. יש לסנכרן או ליצור אותן באתר.",
    );
    await askMorePlatforms(phone, conv?.draft?.platforms || []);
    return;
  }
  const filtered = search
    ? available.filter((target) =>
        target.name.toLocaleLowerCase("he").includes(search),
      )
    : available;
  updateDraft(phone, { availableWaTargets: filtered });
  const text = buildNumberedSelectionText({
    title: search
      ? `יעדי WhatsApp עבור "${conv?.draft?.waTargetSearch || ""}" (${selected.length} נבחרו)`
      : `בחר יעדי WhatsApp (${selected.length} נבחרו)`,
    items: filtered,
    selectedIds: new Set(selected.map((item) => item.id)),
    footer:
      "שלח מספרים לבחירה/ביטול, למשל: 1,3,5 או 2-6.\nלחיפוש כתוב: חפש שם. כתוב תפריט לחזרה לתפריט הראשי.",
  });
  await sendText(phone, text);
  await interactiveMenu(phone, "פעולות לבחירת יעדים:", [
    { id: "wa_targets_done", title: `סיום (${selected.length})` },
    { id: "wa_targets_all", title: "בחר הכל" },
    { id: "wa_targets_clear", title: "נקה" },
  ]);
}

async function handleImage(phone, msg) {
  const conv = getConversation(phone);
  if (conv?.step !== "CAMP_IMAGES_WAIT") return;

  const draft = conv?.draft || {};
  const images = draft.images || [];
  const mediaId = msg.image?.id;
  if (mediaId && images.length < 12) {
    images.push(mediaId);
    updateDraft(phone, { images });
    await sendText(
      phone,
      `תמונה ${images.length} נשמרה. שלח עוד או כתוב 'סיום'.`,
    );
  } else if (images.length >= 12) {
    await sendText(phone, "הגעת למקסימום 12 תמונות. כתוב 'סיום' להמשיך.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE CAMPAIGN
// ═══════════════════════════════════════════════════════════════════════════════
async function createCampaign(phone, userId) {
  await sendText(phone, "יוצר קמפיין...");
  const conv = getConversation(phone);
  const draft = conv?.draft || {};

  try {
    const post = await prisma.post.create({
      data: {
        userId,
        content: draft.content || "",
        title:
          draft.title ||
          `קמפיין WA - ${new Date().toLocaleDateString("he-IL")}`,
        status: draft.scheduleMode === "now" ? "ACTIVE" : "SCHEDULED",
        publishToProfile: draft.publishToProfile || false,
        instagramEnabled: draft.igEnabled || false,
        whatsappEnabled: draft.waEnabled || false,
        instagramPublishType: draft.igEnabled
          ? (draft.instagramPublishTypes || ["FEED"]).join(",")
          : null,
        whatsappTargets: draft.waEnabled
          ? draft.whatsappTargets || []
          : undefined,
        campaignType:
          draft.scheduleMode === "recurring" ? "RECURRING" : "ONE_TIME",
        recurringDays: draft.recurringDays || [],
        recurringTime: draft.recurringTime || null,
        recurringTimes: draft.recurringTime ? [draft.recurringTime] : [],
        dayTimes: draft.recurringDays?.length
          ? Object.fromEntries(
              draft.recurringDays.map((day) => [day, [draft.recurringTime]]),
            )
          : undefined,
        recurringStart: draft.recurringStartDate
          ? new Date(`${draft.recurringStartDate}T00:00:00`)
          : null,
        recurringEnd: draft.recurringEndDate
          ? new Date(`${draft.recurringEndDate}T23:59:59`)
          : null,
      },
    });

    for (let index = 0; index < (draft.images || []).length; index++) {
      const media = await downloadBotMedia(draft.images[index]);
      await prisma.postMedia.create({
        data: {
          postId: post.id,
          mediaType: "IMAGE",
          url: `/uploads/${media.filename}`,
          orderIndex: index,
        },
      });
    }

    let scheduledAt;
    if (draft.scheduleMode === "now") {
      scheduledAt = new Date(Date.now() + 30000);
    } else if (draft.scheduleMode === "recurring") {
      scheduledAt = nextRecurringRun(
        draft.recurringDays || [],
        draft.recurringTime,
        draft.recurringStartDate,
      );
    } else {
      scheduledAt = new Date(`${draft.scheduleDate}T${draft.scheduleTime}:00`);
    }
    if (!scheduledAt) throw new Error("INVALID_SCHEDULE");
    const isRecurring = draft.scheduleMode === "recurring";
    const endAt = draft.recurringEndDate
      ? new Date(`${draft.recurringEndDate}T23:59:59`)
      : null;

    let jobCount = 0;
    const groupIds = draft.groupIds || [];

    // Create jobs for groups
    for (const groupId of groupIds) {
      const group = await prisma.group.findFirst({
        where: {
          OR: [{ id: groupId }, { externalGroupId: groupId }],
        },
      });
      if (!group) continue;
      const pg = await prisma.postGroup.create({
        data: { postId: post.id, groupId: group.id, userId },
      });
      if (draft.scheduleMode !== "now") {
        await prisma.postGroupSchedule.create({
          data: {
            postGroupId: pg.id,
            frequencyType: isRecurring ? "WEEKLY" : "ONCE",
            startAt: scheduledAt,
            nextRunAt: scheduledAt,
            endAt,
            isActive: true,
          },
        });
      }
      await prisma.publicationJob.create({
        data: { postGroupId: pg.id, scheduledAt },
      });
      jobCount++;
    }

    // Profile job
    if (draft.publishToProfile) {
      if (draft.scheduleMode !== "now") {
        await prisma.postGroupSchedule.create({
          data: {
            postId: post.id,
            targetType: "PROFILE",
            platform: "FACEBOOK",
            frequencyType: isRecurring ? "WEEKLY" : "ONCE",
            startAt: scheduledAt,
            nextRunAt: scheduledAt,
            endAt,
          },
        });
      }
      await prisma.publicationJob.create({
        data: { postId: post.id, scheduledAt, targetType: "PROFILE" },
      });
      jobCount++;
    }

    if (draft.igEnabled) {
      const account = await prisma.connectedAccount.findFirst({
        where: { userId, provider: "INSTAGRAM", status: "ACTIVE" },
      });
      if (!account) throw new Error("INSTAGRAM_NOT_CONNECTED");
      for (const igType of draft.instagramPublishTypes || ["FEED"]) {
        if (draft.scheduleMode !== "now") {
          await prisma.postGroupSchedule.create({
            data: {
              postId: post.id,
              targetType: "INSTAGRAM",
              platform: "INSTAGRAM",
              igPublishType: igType,
              frequencyType: isRecurring ? "WEEKLY" : "ONCE",
              startAt: scheduledAt,
              nextRunAt: scheduledAt,
              endAt,
            },
          });
        }
        await prisma.publicationJob.create({
          data: {
            postId: post.id,
            scheduledAt,
            targetType: "INSTAGRAM",
            platform: "INSTAGRAM",
            igPublishType: igType,
          },
        });
        jobCount++;
      }
    }

    if (draft.waEnabled && draft.whatsappTargets?.length) {
      if (draft.scheduleMode !== "now") {
        await prisma.postGroupSchedule.create({
          data: {
            postId: post.id,
            targetType: "WHATSAPP",
            platform: "WHATSAPP",
            frequencyType: isRecurring ? "WEEKLY" : "ONCE",
            startAt: scheduledAt,
            nextRunAt: scheduledAt,
            endAt,
          },
        });
      }
      await prisma.publicationJob.create({
        data: {
          postId: post.id,
          scheduledAt,
          targetType: "WHATSAPP",
          platform: "WHATSAPP",
        },
      });
      jobCount++;
    }

    setConversation(phone, { step: "MAIN_MENU", draft: undefined });

    const platforms = [];
    if (draft.publishToProfile) platforms.push("פרופיל");
    if (groupIds.length > 0) platforms.push(`${groupIds.length} קבוצות`);
    if (draft.igEnabled) platforms.push("אינסטגרם");
    if (draft.waEnabled) platforms.push("וואטסאפ");

    const timeText =
      draft.scheduleMode === "now"
        ? "מיידי"
        : draft.scheduleMode === "recurring"
          ? `חוזר ב-${draft.recurringTime}`
          : `${draft.scheduleDate.split("-").reverse().join("/")} ${draft.scheduleTime}`;

    await sendText(
      phone,
      `הקמפיין נוצר בהצלחה!\n\nפלטפורמות: ${platforms.join(", ")}\nיעדי פרסום: ${jobCount}\nתזמון: ${timeText}`,
    );
    await mainMenu(phone);
  } catch (err) {
    log.error("Campaign creation failed", err);
    await sendText(phone, "שגיאה ביצירת הקמפיין.");
    setConversation(phone, { step: "MAIN_MENU", draft: undefined });
    await mainMenu(phone);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW CAMPAIGNS & STATUS
// ═══════════════════════════════════════════════════════════════════════════════
async function showCampaigns(phone, userId) {
  const campaigns = await prisma.post.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      title: true,
      content: true,
      status: true,
      createdAt: true,
      postGroups: { select: { id: true } },
    },
  });
  if (campaigns.length === 0) {
    await interactiveMenu(phone, "אין קמפיינים עדיין.", [
      { id: "create_campaign", title: "צור קמפיין" },
    ]);
    setConversation(phone, { step: "CAMPAIGNS_LIST" });
    return;
  }
  setConversation(phone, { step: "CAMPAIGNS_LIST" });
  const statusMap = {
    ACTIVE: "פעיל",
    SCHEDULED: "מתוזמן",
    PUBLISHED: "פורסם",
    PAUSED: "מושהה",
    DRAFT: "טיוטה",
  };
  let text = "הקמפיינים שלך:\n\n";
  campaigns.forEach((c, i) => {
    const preview = (c.title || c.content || "").slice(0, 30);
    text += `${i + 1}. [${statusMap[c.status] || c.status}] ${preview}${preview.length >= 30 ? "..." : ""} (${c.postGroups.length} קבוצות)\n`;
  });
  await sendText(phone, text);
  await mainMenu(phone);
}

async function showStatus(phone, userId) {
  const [active, published, pending] = await Promise.all([
    prisma.post.count({ where: { userId, status: "ACTIVE" } }),
    prisma.publicationHistory.count({ where: { userId, status: "SUCCESS" } }),
    prisma.publicationJob.count({
      where: {
        postGroup: { userId },
        status: "PENDING",
        scheduledAt: { gt: new Date() },
      },
    }),
  ]);
  await sendText(
    phone,
    `סטטוס:\n\nקמפיינים פעילים: ${active}\nפרסומים שבוצעו: ${published}\nממתינים: ${pending}`,
  );
  await mainMenu(phone);
}

function maskEmail(email) {
  if (!email) return "***";
  const [l, d] = email.split("@");
  return l.length <= 2
    ? `${l[0]}***@${d}`
    : `${l[0]}${l[1]}${"*".repeat(Math.min(l.length - 2, 5))}@${d}`;
}

async function downloadBotMedia(mediaId) {
  const headers = {
    Authorization: `Bearer ${process.env.WA_BOT_ACCESS_TOKEN}`,
  };
  const metadataResponse = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`,
    { headers },
  );
  if (!metadataResponse.ok) throw new Error("BOT_MEDIA_METADATA_FAILED");
  const metadata = await metadataResponse.json();
  const mediaResponse = await fetch(metadata.url, { headers });
  if (!mediaResponse.ok) throw new Error("BOT_MEDIA_DOWNLOAD_FAILED");
  const contentLength = Number(
    mediaResponse.headers.get("content-length") || 0,
  );
  if (contentLength > 15 * 1024 * 1024) throw new Error("BOT_MEDIA_TOO_LARGE");
  const contentType = mediaResponse.headers.get("content-type") || "image/jpeg";
  const extensions = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  const extension = extensions[contentType.split(";")[0]];
  if (!extension) throw new Error("BOT_MEDIA_TYPE_NOT_ALLOWED");
  const buffer = Buffer.from(await mediaResponse.arrayBuffer());
  if (buffer.length > 15 * 1024 * 1024) throw new Error("BOT_MEDIA_TOO_LARGE");
  await fs.mkdir(uploadsDir, { recursive: true });
  const filename = `wa-bot-${crypto.randomUUID()}${extension}`;
  await fs.writeFile(path.join(uploadsDir, filename), buffer);
  return { filename };
}

export default router;
