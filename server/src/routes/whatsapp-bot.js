/**
 * WhatsApp Bot — Full campaign creation flow via Meta Cloud API
 */
import express from "express";
import prisma from "../config/prisma.js";
import { createLogger } from "../utils/logger.js";
import { sendText, sendButtons, markAsRead } from "../utils/whatsapp-bot-api.js";

// In sandbox mode, interactive buttons don't work with webhooks.
// Use text menus instead.
async function menu(phone, text, options) {
  let msg = text + "\n";
  options.forEach((opt, i) => { msg += `\n${i + 1}. ${opt.title}`; });
  msg += "\n\nשלח מספר:";
  // Store options in conversation for number-based lookup
  const conv = getConversation(phone);
  setConversation(phone, { menuOptions: options.map(o => o.id) });
  await sendText(phone, msg);
}

// Resolve number input to button ID
function resolveInput(input, conv) {
  const num = parseInt(input);
  const opts = conv?.menuOptions;
  if (num >= 1 && opts && num <= opts.length) return opts[num - 1];
  return input;
}
import { sendVerificationEmail } from "../utils/mailer.js";
import {
  getConversation, setConversation, clearConversation,
  getAuthenticatedUser, storePendingOTP, verifyOTP,
} from "../utils/whatsapp-bot-conversation.js";

const router = express.Router();
const log = createLogger("whatsapp-bot");

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
    log.info("Raw msg", JSON.stringify(msg));
    // Skip error webhooks (buttons not supported in sandbox)
    if (msg.errors) return;
    if (!input && msg.type !== "image") return;

    log.info("Incoming", { from, type: msg.type, input: input?.slice(0, 50) });

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
    if (msg.interactive?.type === "button_reply") return msg.interactive.button_reply.id;
    if (msg.interactive?.type === "list_reply") return msg.interactive.list_reply.id;
  }
  // Some Cloud API versions send button replies as type="button"
  if (msg.type === "button") return msg.button?.payload || msg.button?.text;
  return null;
}

// ─── Router ─────────────────────────────────────────────────────────────────
async function route(phone, input) {
  const conv = getConversation(phone);
  const userId = getAuthenticatedUser(phone);

  if (!userId) {
    await authFlow(phone, input, conv);
    return;
  }

  const step = conv?.step || "MAIN_MENU";

  // Global shortcuts
  if (input === "תפריט" || input === "menu" || input === "back") {
    setConversation(phone, { step: "MAIN_MENU", draft: undefined });
    await mainMenu(phone);
    return;
  }
  if (input === "disconnect") {
    clearConversation(phone);
    await sendText(phone, "התנתקת בהצלחה. שלח הודעה כדי להתחבר מחדש.");
    return;
  }

  try {
    const resolved = resolveInput(input, conv);
    log.info(`Step: ${step}, input: ${resolved}`);
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

  if (!step || step === "WELCOME") {
    setConversation(phone, { step: "AWAITING_ID" });
    await sendText(phone, "שלום! אני הבוט של Possbo.\n\nכדי להתחבר, שלח את מספר תעודת הזהות שלך (9 ספרות).");
    return;
  }

  if (step === "AWAITING_ID") {
    const id = input.replace(/\D/g, "");
    if (id.length !== 9) {
      await sendText(phone, "מספר תעודת זהות לא תקין. יש להזין 9 ספרות.");
      return;
    }
    const user = await prisma.user.findUnique({ where: { idNumber: id }, select: { id: true, email: true, name: true } });
    if (!user) {
      await sendText(phone, "לא נמצא חשבון עם תעודת הזהות הזו.\nיש להירשם באתר תחילה.");
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    storePendingOTP(phone, user.id, user.email, code);
    const masked = maskEmail(user.email);
    const sent = await sendVerificationEmail(user.email, code);
    if (!sent) { await sendText(phone, "שגיאה בשליחת המייל. נסה שוב."); return; }
    setConversation(phone, { step: "AWAITING_OTP", pendingName: user.name });
    await sendText(phone, `שלחתי קוד אימות למייל ${masked}\n\nמה הקוד? (6 ספרות)`);
    return;
  }

  if (step === "AWAITING_OTP") {
    const code = input.replace(/\D/g, "");
    if (code.length !== 6) { await sendText(phone, "קוד לא תקין. יש להזין 6 ספרות."); return; }
    const result = verifyOTP(phone, code);
    if (!result) { await sendText(phone, "קוד שגוי או שפג תוקפו."); return; }
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
  await sendText(phone, "מה תרצה לעשות?\n\n1. צור קמפיין\n2. הקמפיינים שלי\n3. סטטוס\n\nשלח מספר:");
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════
const steps = {
  MAIN_MENU: async (phone, userId, input) => {
    if (input === "1" || input === "create_campaign" || input === "צור קמפיין") { await startCampaign(phone); return; }
    if (input === "2" || input === "my_campaigns" || input === "הקמפיינים שלי") { await showCampaigns(phone, userId); return; }
    if (input === "3" || input === "status" || input === "סטטוס") { await showStatus(phone, userId); return; }
    await mainMenu(phone);
  },

  // ── Campaign: Name ──
  CAMP_NAME: async (phone, userId, input) => {
    if (input.length < 2) { await sendText(phone, "שם קצר מדי. נסה שוב:"); return; }
    updateDraft(phone, { title: input });
    setConversation(phone, { step: "CAMP_CONTENT" });
    await sendText(phone, "כתוב את תוכן הפוסט:");
  },

  // ── Campaign: Content ──
  CAMP_CONTENT: async (phone, userId, input) => {
    if (input.length < 3) { await sendText(phone, "תוכן קצר מדי. כתוב לפחות 3 תווים:"); return; }
    updateDraft(phone, { content: input });
    setConversation(phone, { step: "CAMP_WHATSAPP" });
    // Check if user has WhatsApp connected
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { whatsappNumber: true, whatsappMessage: true } });
    if (user?.whatsappNumber) {
      await menu(phone, "להוסיף קישור וואטסאפ לפוסט?", [
        { id: "wa_yes", title: "כן, הוסף וואטסאפ" },
        { id: "wa_no", title: "לא, המשך" },
      ]);
    } else {
      await menu(phone, "וואטסאפ לא מחובר.\nכדי להוסיף קישור וואטסאפ, חבר אותו באתר בהגדרות.", [
        { id: "wa_no", title: "המשך בלי וואטסאפ" },
      ]);
    }
  },

  // ── Campaign: WhatsApp link ──
  CAMP_WHATSAPP: async (phone, userId, input) => {
    if (input === "wa_yes") {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { whatsappNumber: true, whatsappMessage: true } });
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
    await menu(phone, "להוסיף תמונות?", [
      { id: "img_yes", title: "כן, שלח תמונות" },
      { id: "img_no", title: "המשך בלי תמונה" },
    ]);
  },

  // ── Campaign: Images ──
  CAMP_IMAGES: async (phone, userId, input) => {
    if (input === "img_yes") {
      await sendText(phone, "שלח עד 12 תמונות (ביחד בהודעה אחת).\nכשסיימת שלח 'סיום'.");
      setConversation(phone, { step: "CAMP_IMAGES_WAIT" });
      return;
    }
    if (input === "img_no") {
      setConversation(phone, { step: "CAMP_PREVIEW" });
      await showPreview(phone);
      return;
    }
    await menu(phone, "להוסיף תמונות?", [
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

    if (input === "plat_facebook") {
      setConversation(phone, { step: "CAMP_FB_TYPE" });
      await menu(phone, "פרסום בפייסבוק:", [
        { id: "fb_profile", title: "פרופיל אישי" },
        { id: "fb_groups", title: "קבוצות" },
      ]);
      return;
    }
    if (input === "plat_instagram") {
      if (!selected.includes("instagram")) selected.push("instagram");
      updateDraft(phone, { platforms: selected, igEnabled: true });
      await sendText(phone, "אינסטגרם נוסף!");
      await askMorePlatforms(phone, selected);
      return;
    }
    if (input === "plat_whatsapp") {
      if (!selected.includes("whatsapp")) selected.push("whatsapp");
      updateDraft(phone, { platforms: selected, waEnabled: true });
      await sendText(phone, "וואטסאפ נוסף!");
      await askMorePlatforms(phone, selected);
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
      await menu(phone, "תרצה לפרסם גם בקבוצות?", [
        { id: "also_groups_yes", title: "כן" },
        { id: "also_groups_no", title: "לא" },
      ]);
      return;
    }
    if (input === "fb_groups") {
      setConversation(phone, { step: "CAMP_GROUPS" });
      await showGroupList(phone, userId);
      return;
    }
  },

  // ── Also groups? ──
  CAMP_FB_ALSO_GROUPS: async (phone, userId, input) => {
    if (input === "also_groups_yes") {
      setConversation(phone, { step: "CAMP_GROUPS" });
      await showGroupList(phone, userId);
      return;
    }
    if (input === "also_groups_no") {
      const conv = getConversation(phone);
      await askMorePlatforms(phone, conv?.draft?.platforms || []);
      return;
    }
  },

  // ── Group selection ──
  CAMP_GROUPS: async (phone, userId, input, conv) => {
    const draft = conv?.draft || {};
    const groupIds = draft.groupIds || [];
    const groupNames = draft.groupNames || [];
    const available = draft.availableGroups || [];

    if (input === "groups_done") {
      if (!draft.platforms?.includes("fb_groups")) {
        const platforms = draft.platforms || [];
        platforms.push("fb_groups");
        updateDraft(phone, { platforms });
      }
      await askMorePlatforms(phone, draft.platforms || []);
      return;
    }

    if (input === "groups_all") {
      const all = await prisma.userGroup.findMany({
        where: { userId },
        include: { group: { select: { id: true, name: true } } },
      });
      updateDraft(phone, {
        groupIds: all.map(g => g.group.id),
        groupNames: all.map(g => g.group.name),
      });
      await sendText(phone, `נבחרו כל ${all.length} הקבוצות!`);
      if (!draft.platforms?.includes("fb_groups")) {
        const platforms = draft.platforms || [];
        platforms.push("fb_groups");
        updateDraft(phone, { platforms });
      }
      await askMorePlatforms(phone, getConversation(phone)?.draft?.platforms || []);
      return;
    }

    // Number selection
    const num = parseInt(input);
    if (num >= 1 && num <= available.length) {
      const g = available[num - 1];
      if (!groupIds.includes(g.id)) {
        groupIds.push(g.id);
        groupNames.push(g.name);
        updateDraft(phone, { groupIds, groupNames });
      }
      await sendText(phone, `נוספה: ${g.name}\nסה"כ ${groupIds.length} קבוצות`);
      await menu(phone, "להוסיף עוד קבוצה?", [
        { id: "groups_more", title: "הוסף עוד" },
        { id: "groups_done", title: "סיום בחירה" },
        { id: "groups_all", title: "בחר הכל" },
      ]);
      return;
    }

    if (input === "groups_more") {
      await showGroupList(phone, userId);
      return;
    }

    await showGroupList(phone, userId);
  },

  // ── More platforms? ──
  CAMP_MORE_PLATFORMS: async (phone, userId, input, conv) => {
    if (input === "more_yes") {
      setConversation(phone, { step: "CAMP_PLATFORM" });
      await askPlatform(phone, conv?.draft?.platforms || []);
      return;
    }
    if (input === "more_no") {
      setConversation(phone, { step: "CAMP_SCHEDULE" });
      await menu(phone, "מתי לפרסם?", [
        { id: "sched_now", title: "עכשיו" },
        { id: "sched_later", title: "תזמון לתאריך" },
      ]);
      return;
    }
  },

  // ── Schedule ──
  CAMP_SCHEDULE: async (phone, userId, input, conv) => {
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
  },

  // ── Date ──
  CAMP_DATE: async (phone, userId, input) => {
    const m = input.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!m) { await sendText(phone, "פורמט לא תקין. שלח DD/MM/YYYY:"); return; }
    const [, d, mo, y] = m;
    const date = new Date(`${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`);
    if (isNaN(date.getTime()) || date < new Date(new Date().toDateString())) {
      await sendText(phone, "תאריך לא תקין או בעבר. נסה שוב:");
      return;
    }
    updateDraft(phone, { scheduleDate: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}` });
    setConversation(phone, { step: "CAMP_TIME" });
    await sendText(phone, "שלח שעה (HH:MM):");
  },

  // ── Time ──
  CAMP_TIME: async (phone, userId, input) => {
    const m = input.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) { await sendText(phone, "פורמט לא תקין. שלח HH:MM:"); return; }
    const [, h, mi] = m;
    if (+h > 23 || +mi > 59) { await sendText(phone, "שעה לא תקינה."); return; }
    const conv = getConversation(phone);
    const draft = conv?.draft || {};
    const scheduledAt = new Date(`${draft.scheduleDate}T${h.padStart(2, "0")}:${mi}:00`);
    if (scheduledAt <= new Date()) { await sendText(phone, "הזמן חייב להיות בעתיד. שלח תאריך:"); setConversation(phone, { step: "CAMP_DATE" }); return; }
    updateDraft(phone, { scheduleTime: `${h.padStart(2, "0")}:${mi}`, scheduleMode: "scheduled" });
    await createCampaign(phone, userId);
  },

  CAMPAIGNS_LIST: async (phone, userId, input) => {
    if (input === "create_campaign") { await startCampaign(phone); return; }
    await mainMenu(phone);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function startCampaign(phone) {
  setConversation(phone, { step: "CAMP_NAME", draft: { groupIds: [], groupNames: [], platforms: [], images: [] } });
  await sendText(phone, "יצירת קמפיין חדש\n\nשלח את שם הקמפיין (רק עבורך, אינו מפורסם):");
}

function updateDraft(phone, data) {
  const conv = getConversation(phone);
  const draft = { ...(conv?.draft || {}), ...data };
  setConversation(phone, { draft });
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
  await menu(phone, "מה לעשות?", [
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
    setConversation(phone, { step: "CAMP_SCHEDULE" });
    await menu(phone, "כל הפלטפורמות נבחרו! מתי לפרסם?", [
      { id: "sched_now", title: "עכשיו" },
      { id: "sched_later", title: "תזמון לתאריך" },
    ]);
    return;
  }

  setConversation(phone, { step: "CAMP_PLATFORM" });
  await menu(phone, selected.length > 0
    ? "בחר פלטפורמה נוספת:"
    : "היכן תרצה לפרסם?\n(בחר אחד, בהמשך ניתן להוסיף עוד)",
    remaining.slice(0, 3),
  );
}

async function askMorePlatforms(phone, selected) {
  const allPlatforms = ["fb_profile", "fb_groups", "instagram", "whatsapp"];
  const hasMore = allPlatforms.some(p => !selected.includes(p));

  if (!hasMore) {
    setConversation(phone, { step: "CAMP_SCHEDULE" });
    await menu(phone, "מתי לפרסם?", [
      { id: "sched_now", title: "עכשיו" },
      { id: "sched_later", title: "תזמון לתאריך" },
    ]);
    return;
  }

  setConversation(phone, { step: "CAMP_MORE_PLATFORMS" });
  await menu(phone, "לפרסם בעוד פלטפורמות?", [
    { id: "more_yes", title: "כן" },
    { id: "more_no", title: "לא, המשך" },
  ]);
}

async function showGroupList(phone, userId) {
  const groups = await prisma.userGroup.findMany({
    where: { userId },
    include: { group: { select: { id: true, name: true, memberCount: true } } },
    orderBy: { group: { memberCount: "desc" } },
    take: 10,
  });

  if (groups.length === 0) {
    await sendText(phone, "אין קבוצות מסונכרנות. סנכרן באתר.");
    const conv = getConversation(phone);
    await askMorePlatforms(phone, conv?.draft?.platforms || []);
    return;
  }

  // Store for number-based selection
  updateDraft(phone, { availableGroups: groups.map(g => ({ id: g.group.id, name: g.group.name })) });

  let text = "בחר קבוצות (שלח מספר):\n\n";
  groups.forEach((ug, i) => {
    text += `${i + 1}. ${ug.group.name.slice(0, 35)} (${ug.group.memberCount || "?"} חברים)\n`;
  });
  text += "\nאו שלח 'הכל' לבחירת כולן";

  await sendText(phone, text);
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
    await sendText(phone, `תמונה ${images.length} נשמרה. שלח עוד או כתוב 'סיום'.`);
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
        title: draft.title || `קמפיין WA - ${new Date().toLocaleDateString("he-IL")}`,
        status: draft.scheduleMode === "now" ? "ACTIVE" : "SCHEDULED",
        publishToProfile: draft.publishToProfile || false,
        instagramEnabled: draft.igEnabled || false,
        whatsappEnabled: draft.waEnabled || false,
      },
    });

    let scheduledAt;
    if (draft.scheduleMode === "now") {
      scheduledAt = new Date(Date.now() + 30000);
    } else {
      scheduledAt = new Date(`${draft.scheduleDate}T${draft.scheduleTime}:00`);
    }

    let jobCount = 0;
    const groupIds = draft.groupIds || [];

    // Create jobs for groups
    for (const groupId of groupIds) {
      const pg = await prisma.postGroup.create({ data: { postId: post.id, groupId, userId } });
      await prisma.postGroupSchedule.create({
        data: { postGroupId: pg.id, frequencyType: "ONCE", startAt: scheduledAt, nextRunAt: scheduledAt, isActive: true },
      });
      await prisma.publicationJob.create({ data: { postGroupId: pg.id, scheduledAt } });
      jobCount++;
    }

    // Profile job
    if (draft.publishToProfile) jobCount++;

    setConversation(phone, { step: "MAIN_MENU", draft: undefined });

    const platforms = [];
    if (draft.publishToProfile) platforms.push("פרופיל");
    if (groupIds.length > 0) platforms.push(`${groupIds.length} קבוצות`);
    if (draft.igEnabled) platforms.push("אינסטגרם");
    if (draft.waEnabled) platforms.push("וואטסאפ");

    const timeText = draft.scheduleMode === "now" ? "מיידי" : `${draft.scheduleDate.split("-").reverse().join("/")} ${draft.scheduleTime}`;

    await sendText(phone, `הקמפיין נוצר בהצלחה!\n\nפלטפורמות: ${platforms.join(", ")}\nתזמון: ${timeText}`);
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
    select: { id: true, title: true, content: true, status: true, createdAt: true, postGroups: { select: { id: true } } },
  });
  if (campaigns.length === 0) {
    await menu(phone, "אין קמפיינים עדיין.", [{ id: "create_campaign", title: "צור קמפיין" }]);
    setConversation(phone, { step: "CAMPAIGNS_LIST" });
    return;
  }
  setConversation(phone, { step: "CAMPAIGNS_LIST" });
  const statusMap = { ACTIVE: "פעיל", SCHEDULED: "מתוזמן", PUBLISHED: "פורסם", PAUSED: "מושהה", DRAFT: "טיוטה" };
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
    prisma.publicationJob.count({ where: { postGroup: { userId }, status: "PENDING", scheduledAt: { gt: new Date() } } }),
  ]);
  await sendText(phone, `סטטוס:\n\nקמפיינים פעילים: ${active}\nפרסומים שבוצעו: ${published}\nממתינים: ${pending}`);
  await mainMenu(phone);
}

function maskEmail(email) {
  if (!email) return "***";
  const [l, d] = email.split("@");
  return l.length <= 2 ? `${l[0]}***@${d}` : `${l[0]}${l[1]}${"*".repeat(Math.min(l.length - 2, 5))}@${d}`;
}

export default router;
