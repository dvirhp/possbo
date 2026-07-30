/**
 * WhatsApp Bot — Full campaign creation flow via Meta Cloud API
 */
import express from "express";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";
import { invalidateDashboardCache } from "./analytics.js";
import { createLogger } from "../utils/logger.js";
import { dispatchPublicationNotification } from "../utils/notification-service.js";
import {
  sendText,
  sendImage,
  sendButtons,
  sendList,
  markAsRead,
} from "../utils/whatsapp-bot-api.js";

function normalizeMenuText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("he");
}

// Resolve a numeric reply, a WhatsApp button/list ID, or the visible option
// title typed manually by the user to the same internal action ID.
function resolveInput(input, conv) {
  const normalizedInput = normalizeMenuText(input);
  const num = Number.parseInt(normalizedInput, 10);
  const opts = conv?.menuOptions;
  if (
    Number.isInteger(num) &&
    String(num) === normalizedInput &&
    num >= 1 &&
    opts &&
    num <= opts.length
  ) {
    return opts[num - 1];
  }
  const actionFromTitle = conv?.menuOptionLabels?.[normalizedInput];
  if (actionFromTitle) return actionFromTitle;
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

const CAMPAIGN_EXIT_CONFIRM_STEPS = new Set([
  "CAMP_PREVIEW",
  "CAMP_PLATFORM",
  "CAMP_FB_ALSO_GROUPS",
  "CAMP_GROUPS",
  "CAMP_IG_TYPES",
  "CAMP_WA_SEARCH",
  "CAMP_WA_TARGETS",
  "CAMP_MORE_PLATFORMS",
  "CAMP_SCHEDULE",
  "CAMP_DATE",
  "CAMP_TIME",
  "CAMP_RECURRING_DAYS",
  "CAMP_RECURRING_TIME",
  "CAMP_RECURRING_START",
  "CAMP_RECURRING_END",
  "TARGET_SELECTOR_WAIT",
]);

async function interactiveMenu(phone, text, options) {
  const currentStep = getConversation(phone)?.step;
  const menuOptions = [...options];
  if (
    getAuthenticatedUser(phone) &&
    currentStep !== "MAIN_MENU" &&
    currentStep !== "MAIN_MENU_CONFIRM" &&
    !menuOptions.some((option) => option.id === "main_menu")
  ) {
    menuOptions.push({ id: "main_menu", title: "תפריט ראשי" });
  }

  setConversation(phone, {
    menuOptions: menuOptions.map((option) => option.id),
    menuOptionItems: menuOptions.map((option) => ({ ...option })),
    menuOptionLabels: Object.fromEntries(
      menuOptions.map((option) => [
        normalizeMenuText(option.title),
        option.id,
      ]),
    ),
  });

  const sendInteractive = async () => {
    if (menuOptions.length <= 3) {
      await sendButtons(phone, text, menuOptions);
      return;
    }
    await sendList(phone, text, "פתח רשימה", [
      {
        title: "אפשרויות",
        rows: menuOptions.slice(0, 10).map((option) => ({
          id: option.id,
          title: option.title.slice(0, 24),
          description: option.description?.slice(0, 72),
        })),
      },
    ]);
  };

  try {
    await sendInteractive();
  } catch (err) {
    if (err.message?.includes("(#131056)")) {
      log.warn("Interactive message rate limited; retrying", {
        optionCount: menuOptions.length,
      });
      for (const delayMs of [15_000, 20_000]) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        try {
          await sendInteractive();
          return;
        } catch (retryError) {
          if (!retryError.message?.includes("(#131056)")) throw retryError;
        }
      }
      throw err;
    }
    log.warn("Interactive message failed; using numbered text fallback", {
      error: err.message,
      optionCount: menuOptions.length,
    });
    const numberedOptions = menuOptions
      .map((option, index) => `${index + 1}. ${option.title}`)
      .join("\n");
    await sendText(phone, `${text}\n\n${numberedOptions}\n\nהשב עם מספר האפשרות.`);
  }
}
import {
  sendVerificationEmail,
  sendContactEmail,
} from "../utils/mailer.js";
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
const SUPPORT_EMAIL =
  process.env.CONTACT_EMAIL || process.env.SMTP_USER || "support@possbo-app.co.il";
const TARGET_SELECTOR_TTL_MS = 30 * 60 * 1000;
const targetSelectorSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of targetSelectorSessions) {
    if (session.expiresAt < now || session.completed) {
      targetSelectorSessions.delete(token);
    }
  }
}, 5 * 60 * 1000).unref();

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    ),
  ]);
}

async function sendInputPrompt(phone, text) {
  const menuHint = getAuthenticatedUser(phone)
    ? "\n\nאפשר לכתוב תפריט כדי לחזור לתפריט הראשי."
    : "";
  await sendText(phone, `${text}${menuHint}`);
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

router.get("/selection/:token", async (req, res) => {
  const session = targetSelectorSessions.get(req.params.token);
  if (!session || session.expiresAt < Date.now() || session.completed) {
    targetSelectorSessions.delete(req.params.token);
    return res.status(404).json({
      error: "קישור הבחירה אינו תקף או שפג תוקפו. חזור לבוט ובקש קישור חדש.",
    });
  }
  try {
    const data = await buildExternalTargetSelection(session);
    res.json(data);
  } catch (err) {
    log.error("Failed to load bot target selector", err);
    res.status(500).json({ error: "לא ניתן לטעון את היעדים כרגע." });
  }
});

router.post("/selection/:token", async (req, res) => {
  const session = targetSelectorSessions.get(req.params.token);
  if (!session || session.expiresAt < Date.now() || session.completed) {
    targetSelectorSessions.delete(req.params.token);
    return res.status(404).json({
      error: "קישור הבחירה אינו תקף או שפג תוקפו. חזור לבוט ובקש קישור חדש.",
    });
  }
  const selectedIds = Array.isArray(req.body?.selectedIds)
    ? [...new Set(req.body.selectedIds.filter((id) => typeof id === "string"))]
    : null;
  if (!selectedIds || selectedIds.length > 2000) {
    return res.status(400).json({ error: "הבחירה שנשלחה אינה תקינה." });
  }
  try {
    const selection = await buildExternalTargetSelection(session);
    const allowed = new Map(selection.items.map((item) => [item.id, item]));
    const selectedItems = selectedIds
      .map((id) => allowed.get(id))
      .filter(Boolean);
    session.completed = true;
    await applyExternalTargetSelection(session, selectedItems);
    targetSelectorSessions.delete(req.params.token);
    res.json({ success: true, selectedCount: selectedItems.length });
  } catch (err) {
    session.completed = false;
    log.error("Failed to save bot target selector", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "לא ניתן לשמור את הבחירה כרגע." });
    } else {
      await sendText(
        session.phone,
        "שמירת היעדים נכשלה. חזור לבוט ובקש קישור בחירה חדש.",
      );
    }
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
  let conv = getConversation(phone);
  let userId = getAuthenticatedUser(phone);

  // Conversation steps are intentionally short-lived, but authentication
  // must survive a restart, another server process, or an expired in-memory
  // session. Restore the verified user from the database before falling back
  // to the public welcome flow.
  if (!userId) {
    try {
      const persistedUser = await withTimeout(
        prisma.user.findUnique({
          where: { whatsappBotPhone: phone },
          select: { id: true },
        }),
        AUTH_DB_TIMEOUT_MS,
        "BOT_AUTH_RESTORE_TIMEOUT",
      );
      if (persistedUser) {
        userId = persistedUser.id;
        setConversation(phone, { userId, step: "MAIN_MENU" });
        conv = getConversation(phone);
      }
    } catch (err) {
      log.error("Failed to restore persisted bot authentication", err, {
        phone,
      });
    }
  }

  if (userId && MAIN_MENU_INPUTS.has(input)) {
    const currentStep = conv?.step || "MAIN_MENU";
    if (
      CAMPAIGN_EXIT_CONFIRM_STEPS.has(currentStep) &&
      conv?.draft &&
      currentStep !== "MAIN_MENU_CONFIRM"
    ) {
      const returnMenuItems = (conv.menuOptionItems || []).filter(
        (option) => option.id !== "main_menu",
      );
      setConversation(phone, {
        step: "MAIN_MENU_CONFIRM",
        returnStep: currentStep,
        returnMenuItems,
      });
      await interactiveMenu(
        phone,
        "הקמפיין עדיין לא נשמר. חזרה לתפריט הראשי תמחק את ההתקדמות הנוכחית. האם אתה בטוח?",
        [
          { id: "main_menu_confirm_exit", title: "כן, חזור לתפריט" },
          { id: "main_menu_keep_editing", title: "לא, המשך בקמפיין" },
        ],
      );
      return;
    }
    setConversation(phone, { step: "MAIN_MENU", draft: undefined });
    invalidateDashboardCache(userId);
    await mainMenu(phone);
    return;
  }

  if (!userId) {
    await authFlow(phone, input, conv);
    return;
  }

  const step = conv?.step || "MAIN_MENU";
  if (input === "disconnect") {
    await prisma.user
      .update({
        where: { id: userId },
        data: { whatsappBotPhone: null },
      })
      .catch((err) =>
        log.error("Failed to clear persisted bot authentication", err, {
          userId,
        }),
      );
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
    if (err.message?.includes("(#131056)")) {
      log.warn("Meta pair rate limit reached; suppressing misleading reply", {
        phone,
        step,
      });
      return;
    }
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
    setConversation(phone, { step: "WELCOME_MENU" });
    await sendText(
      phone,
      "היי! 👋 אני פוסבוט, העוזר הבוטי של אתר פוסבו 💜\nאני כאן כדי לעזור לך להכיר את המערכת, ליצור ולנהל פרסומים גם ישירות מתוך WhatsApp.",
    );
    await interactiveMenu(phone, "נעים להכיר! איך תרצה להתחיל?", [
      { id: "welcome_login", title: "התחברות" },
      { id: "welcome_about", title: "ספרו לי על האתר" },
    ]);
    return;
  }

  if (step === "WELCOME_MENU") {
    if (input === "welcome_login") {
      setConversation(phone, { step: "AWAITING_ID" });
      await sendInputPrompt(
        phone,
        "כדי להתחבר, שלח את מספר תעודת הזהות שלך (9 ספרות).",
      );
      return;
    }
    if (input === "welcome_about") {
      await showPublicAbout(phone);
      return;
    }
    await interactiveMenu(phone, "איך תרצה להתחיל?", [
      { id: "welcome_login", title: "התחברות" },
      { id: "welcome_about", title: "ספרו לי על האתר" },
    ]);
    return;
  }

  if (step === "WELCOME_ABOUT") {
    if (input === "welcome_login") {
      setConversation(phone, { step: "AWAITING_ID" });
      await sendInputPrompt(
        phone,
        "כדי להתחבר, שלח את מספר תעודת הזהות שלך (9 ספרות).",
      );
      return;
    }
    if (input === "welcome_register") {
      const clientUrl = String(process.env.CLIENT_URL || "").replace(/\/+$/, "");
      const hasPublicClientUrl =
        clientUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clientUrl);
      await sendText(
        phone,
        hasPublicClientUrl
          ? `להרשמה ל-Possbo:\n${clientUrl}/register\n\nלאחר ההרשמה חזור לכאן ולחץ על התחברות.`
          : `להרשמה יש לפתוח את אתר Possbo ולעבור לעמוד הרשמה.\nאם דרושה עזרה, אפשר לפנות אלינו: ${SUPPORT_EMAIL}\n\nלאחר ההרשמה חזור לכאן ולחץ על התחברות.`,
      );
      await showPublicAboutActions(phone);
      return;
    }
    await showPublicAboutActions(phone);
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
    // A WhatsApp number may authenticate only one account at a time. Clear a
    // stale link first, then persist the newly verified association.
    await prisma.$transaction([
      prisma.user.updateMany({
        where: {
          whatsappBotPhone: phone,
          id: { not: result.userId },
        },
        data: { whatsappBotPhone: null },
      }),
      prisma.user.update({
        where: { id: result.userId },
        data: { whatsappBotPhone: phone },
      }),
    ]);
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
  setConversation(phone, { step: "MAIN_MENU" });
  await interactiveMenu(phone, "מה תרצה לעשות?", [
    { id: "create_campaign", title: "צור קמפיין" },
    { id: "create_new_template", title: "צור טמפלייט" },
    { id: "my_campaigns", title: "הקמפיינים שלי" },
    { id: "status", title: "סטטוס" },
    { id: "tutorials", title: "הדרכות ועזרה" },
    { id: "contact_support", title: "יש לך שאלות?" },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════
const steps = {
  MAIN_MENU_CONFIRM: async (phone, userId, input, conv) => {
    if (input === "main_menu_confirm_exit") {
      setConversation(phone, {
        step: "MAIN_MENU",
        draft: undefined,
        returnStep: undefined,
        returnMenuItems: undefined,
      });
      invalidateDashboardCache(userId);
      await mainMenu(phone);
      return;
    }
    if (input === "main_menu_keep_editing") {
      const returnStep = conv?.returnStep || "CAMP_PREVIEW";
      const returnMenuItems = conv?.returnMenuItems || [];
      setConversation(phone, {
        step: returnStep,
        returnStep: undefined,
        returnMenuItems: undefined,
      });
      if (returnMenuItems.length > 0) {
        await interactiveMenu(
          phone,
          "ממשיכים מאותה נקודה. ההתקדמות בקמפיין נשמרה בשיחה.",
          returnMenuItems,
        );
      } else {
        await sendText(
          phone,
          "ממשיכים מאותה נקודה. שלח את הפרט שהתבקשת להזין כדי להמשיך.",
        );
      }
      return;
    }
    await interactiveMenu(
      phone,
      "הקמפיין עדיין לא נשמר. האם לחזור לתפריט הראשי ולמחוק את ההתקדמות?",
      [
        { id: "main_menu_confirm_exit", title: "כן, חזור לתפריט" },
        { id: "main_menu_keep_editing", title: "לא, המשך בקמפיין" },
      ],
    );
  },

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
      await showStatusPeriodMenu(phone);
      return;
    }
    if (input === "create_new_template" || input === "צור טמפלייט") {
      await startTemplateCreation(phone);
      return;
    }
    if (input === "tutorials" || input === "הדרכות ועזרה") {
      await showTutorialMenu(phone);
      return;
    }
    if (input === "contact_support" || input === "יש לך שאלות?") {
      await showContactMenu(phone);
      return;
    }
    await mainMenu(phone);
  },

  TEMPLATE_NAME: async (phone, userId, input) => {
    if (input.trim().length < 2) {
      await sendText(phone, "יש לתת לטמפלייט שם של לפחות 2 תווים.");
      return;
    }
    updateDraft(phone, { templateName: input.trim() });
    setConversation(phone, { step: "TEMPLATE_CONTENT" });
    await sendInputPrompt(phone, "כתוב את תוכן הטמפלייט:");
  },

  TEMPLATE_CONTENT: async (phone, userId, input) => {
    if (input.trim().length < 3) {
      await sendText(phone, "יש לכתוב תוכן של לפחות 3 תווים.");
      return;
    }
    updateDraft(phone, { content: input.trim() });
    setConversation(phone, { step: "TEMPLATE_TITLE_CHOICE" });
    await interactiveMenu(
      phone,
      "האם תרצה להגדיר גם שם קמפיין שיופיע כברירת מחדל? זה לא חובה.",
      [
        { id: "tpl_title_add", title: "כן, הוסף שם קמפיין" },
        { id: "tpl_title_skip", title: "דלג" },
      ],
    );
  },

  TEMPLATE_TITLE_CHOICE: async (phone, userId, input) => {
    if (input === "tpl_title_add") {
      setConversation(phone, { step: "TEMPLATE_TITLE" });
      await sendInputPrompt(phone, "מה יהיה שם הקמפיין שייווצר מהטמפלייט?");
      return;
    }
    if (input === "tpl_title_skip") {
      await askTemplateAnonymous(phone);
      return;
    }
    await steps.TEMPLATE_CONTENT(phone, userId, getConversation(phone)?.draft?.content || "");
  },

  TEMPLATE_TITLE: async (phone, userId, input) => {
    updateDraft(phone, { title: input.trim() || null });
    await askTemplateAnonymous(phone);
  },

  TEMPLATE_ANONYMOUS: async (phone, userId, input) => {
    if (!["tpl_anon_yes", "tpl_anon_no"].includes(input)) {
      await askTemplateAnonymous(phone);
      return;
    }
    updateDraft(phone, { isAnonymous: input === "tpl_anon_yes" });
    setConversation(phone, { step: "TEMPLATE_LOCATION_CHOICE" });
    await interactiveMenu(phone, "להוסיף מיקום לטמפלייט? לא חובה.", [
      { id: "tpl_location_add", title: "כן, הוסף מיקום" },
      { id: "tpl_location_skip", title: "דלג" },
    ]);
  },

  TEMPLATE_LOCATION_CHOICE: async (phone, userId, input) => {
    if (input === "tpl_location_add") {
      setConversation(phone, { step: "TEMPLATE_LOCATION" });
      await sendInputPrompt(phone, "כתוב את המיקום:");
      return;
    }
    if (input === "tpl_location_skip") {
      await askTemplateWhatsAppLink(phone, userId);
      return;
    }
    await interactiveMenu(phone, "להוסיף מיקום לטמפלייט? לא חובה.", [
      { id: "tpl_location_add", title: "כן, הוסף מיקום" },
      { id: "tpl_location_skip", title: "דלג" },
    ]);
  },

  TEMPLATE_LOCATION: async (phone, userId, input) => {
    updateDraft(phone, { location: input.trim() || null });
    await askTemplateWhatsAppLink(phone, userId);
  },

  TEMPLATE_WHATSAPP_LINK: async (phone, userId, input) => {
    if (input === "tpl_wa_skip") {
      updateDraft(phone, { whatsappText: null });
      await askTemplateImages(phone);
      return;
    }
    if (input === "tpl_wa_default") {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { whatsappMessage: true },
      });
      updateDraft(phone, { whatsappText: user?.whatsappMessage || "" });
      await askTemplateImages(phone);
      return;
    }
    if (input === "tpl_wa_custom") {
      setConversation(phone, { step: "TEMPLATE_WHATSAPP_TEXT" });
      await sendInputPrompt(
        phone,
        "כתוב את ההודעה שתיפתח למי שילחץ על קישור ה-WhatsApp:",
      );
      return;
    }
    await askTemplateWhatsAppLink(phone, userId);
  },

  TEMPLATE_WHATSAPP_TEXT: async (phone, userId, input) => {
    updateDraft(phone, { whatsappText: input.trim() });
    await askTemplateImages(phone);
  },

  TEMPLATE_IMAGES_CHOICE: async (phone, userId, input) => {
    if (input === "tpl_images_add") {
      setConversation(phone, { step: "TEMPLATE_IMAGES_WAIT" });
      await sendInputPrompt(
        phone,
        "שלח עד 12 תמונות. לאחר שסיימת כתוב סיום.",
      );
      return;
    }
    if (input === "tpl_images_skip") {
      await askTemplateTargets(phone);
      return;
    }
    await askTemplateImages(phone);
  },

  TEMPLATE_IMAGES_WAIT: async (phone, userId, input) => {
    if (["סיום", "done", "finish"].includes(input.toLowerCase())) {
      await askTemplateTargets(phone);
      return;
    }
    await sendText(phone, "שלח תמונה נוספת או כתוב סיום.");
  },

  TEMPLATE_TARGETS_CHOICE: async (phone, userId, input) => {
    if (input === "tpl_targets_add") {
      updateDraft(phone, { creatingTemplate: true });
      await askPlatform(phone, []);
      return;
    }
    if (input === "tpl_targets_skip") {
      await showNewTemplateSummary(phone);
      return;
    }
    await askTemplateTargets(phone);
  },

  TEMPLATE_SUMMARY: async (phone, userId, input) => {
    if (input === "tpl_save") {
      await saveNewTemplate(phone, userId);
      return;
    }
    if (input === "tpl_restart") {
      await startTemplateCreation(phone);
      return;
    }
    await showNewTemplateSummary(phone);
  },

  CONTACT_MENU: async (phone, userId, input) => {
    if (input === "contact_write") {
      setConversation(phone, { step: "CONTACT_MESSAGE" });
      await sendInputPrompt(phone, "כתוב את ההודעה שתרצה להעביר לצוות Possbo:");
      return;
    }
    if (input === "contact_email_only") {
      await sendText(phone, `המייל שלנו ליצירת קשר:\n${SUPPORT_EMAIL}`);
      await mainMenu(phone);
      return;
    }
    await showContactMenu(phone);
  },

  CONTACT_MESSAGE: async (phone, userId, input) => {
    const message = input.trim();
    if (message.length < 3) {
      await sendText(phone, "ההודעה קצרה מדי. כתוב לפחות 3 תווים.");
      return;
    }
    if (message.length > 5000) {
      await sendText(phone, "ההודעה ארוכה מדי. ניתן לשלוח עד 5,000 תווים.");
      return;
    }
    await sendBotContactRequest(phone, userId, message);
  },

  TUTORIAL_MENU: async (phone, userId, input) => {
    if (input === "tutorial_back") {
      await mainMenu(phone);
      return;
    }
    const topicId = input.replace(/^tutorial_/, "");
    if (BOT_TUTORIALS[topicId]) {
      await showTutorialTopic(phone, topicId);
      return;
    }
    await showTutorialMenu(phone);
  },

  TUTORIAL_TOPIC: async (phone, userId, input) => {
    if (input === "tutorial_topics") {
      await showTutorialMenu(phone);
      return;
    }
    if (input === "contact_support") {
      await showContactMenu(phone);
      return;
    }
    await showTutorialTopic(
      phone,
      getConversation(phone)?.tutorialTopic || "getting-started",
    );
  },

  CAMP_CREATE_MODE: async (phone, userId, input) => {
    if (input === "create_manual" || normalizeMenuText(input) === "יצירה עצמאית") {
      await startManualCampaign(phone);
      return;
    }
    if (input === "create_template" || normalizeMenuText(input) === "יצירה מתבנית") {
      await showTemplateList(phone, userId, 0);
      return;
    }
    if (input === "create_back") {
      setConversation(phone, { step: "MAIN_MENU", draft: undefined });
      await mainMenu(phone);
      return;
    }
    await showCampaignCreationOptions(phone);
  },

  CAMP_TEMPLATE_LIST: async (phone, userId, input, conv) => {
    if (input === "template_back") {
      await showCampaignCreationOptions(phone);
      return;
    }
    if (input === "template_next") {
      await showTemplateList(phone, userId, (conv?.templatePage || 0) + 1);
      return;
    }
    if (input === "template_prev") {
      await showTemplateList(
        phone,
        userId,
        Math.max(0, (conv?.templatePage || 0) - 1),
      );
      return;
    }
    if (input.startsWith("template_pick_")) {
      await loadTemplateDraft(phone, userId, input.slice("template_pick_".length));
      return;
    }
    await showTemplateList(phone, userId, conv?.templatePage || 0);
  },

  CAMP_TEMPLATE_REVIEW: async (phone, userId, input) => {
    if (input === "template_use") {
      await showPreview(phone);
      return;
    }
    if (input === "template_edit_title") {
      setConversation(phone, { step: "CAMP_TEMPLATE_EDIT_TITLE" });
      const currentTitle =
        getConversation(phone)?.draft?.title || "לא הוגדר שם";
      await sendInputPrompt(
        phone,
        `שם הקמפיין הנוכחי:\n${currentTitle}\n\nלאיזה שם תרצה להחליף?`,
      );
      return;
    }
    if (input === "template_edit_content") {
      setConversation(phone, { step: "CAMP_TEMPLATE_EDIT_CONTENT" });
      const currentContent =
        getConversation(phone)?.draft?.content || "לא הוגדר תוכן";
      await sendInputPrompt(
        phone,
        `תוכן הפוסט הנוכחי:\n${currentContent}\n\nשלח את התוכן החדש:`,
      );
      return;
    }
    if (input === "template_edit_images") {
      setConversation(phone, { step: "CAMP_TEMPLATE_IMAGES" });
      await showTemplateImageOptions(phone);
      return;
    }
    if (input === "template_edit_targets") {
      await showTemplateTargetActions(phone);
      return;
    }
    if (input === "template_choose_other") {
      await showTemplateList(phone, userId, 0);
      return;
    }
    await showTemplateReview(phone);
  },

  CAMP_TEMPLATE_EDIT_TITLE: async (phone, userId, input) => {
    if (input.trim().length < 2) {
      await sendText(phone, "השם קצר מדי. שלח שם חדש:");
      return;
    }
    updateDraft(phone, { title: input.trim() });
    await showTemplateReview(phone);
  },

  CAMP_TEMPLATE_EDIT_CONTENT: async (phone, userId, input) => {
    if (input.trim().length < 3) {
      await sendText(phone, "התוכן קצר מדי. שלח לפחות 3 תווים:");
      return;
    }
    updateDraft(phone, { content: input.trim() });
    await showTemplateReview(phone);
  },

  CAMP_TEMPLATE_IMAGES: async (phone, userId, input) => {
    if (input === "template_images_back") {
      await showTemplateReview(phone);
      return;
    }
    if (input === "template_images_remove_all") {
      updateDraft(phone, { images: [], templateImageUrls: [] });
      await showTemplateReview(phone);
      return;
    }
    if (input === "template_images_add") {
      updateDraft(phone, { returnToTemplateReview: true });
      setConversation(phone, { step: "CAMP_IMAGES_WAIT" });
      await sendInputPrompt(phone, "שלח עד 12 תמונות. כשסיימת כתוב 'סיום'.");
      return;
    }
    if (input === "template_images_replace") {
      updateDraft(phone, {
        images: [],
        templateImageUrls: [],
        returnToTemplateReview: true,
      });
      setConversation(phone, { step: "CAMP_IMAGES_WAIT" });
      await sendInputPrompt(
        phone,
        "התמונות הקיימות הוסרו. שלח תמונות חדשות, וכשסיימת כתוב סיום.",
      );
      return;
    }
    await showTemplateImageOptions(phone);
  },

  CAMP_TEMPLATE_TARGET_ACTIONS: async (phone, userId, input) => {
    if (input === "template_targets_back") {
      await showTemplateReview(phone);
      return;
    }
    if (input === "template_targets_remove") {
      await showTemplateTargetPlatformMenu(phone, "remove");
      return;
    }
    if (input === "template_targets_add") {
      await showTemplateTargetPlatformMenu(phone, "add");
      return;
    }
    if (input === "template_targets_replace") {
      updateDraft(phone, {
        platforms: [],
        groupIds: [],
        groupNames: [],
        publishToProfile: false,
        igEnabled: false,
        instagramPublishTypes: [],
        waEnabled: false,
        whatsappTargets: [],
        returnToTemplateReviewAfterTargets: true,
      });
      await sendText(phone, "כל יעדי הפרסום הקיימים הוסרו. כעת בחר יעדים חדשים.");
      await askPlatform(phone, []);
      return;
    }
    await showTemplateTargetActions(phone);
  },

  CAMP_TEMPLATE_TARGET_PLATFORM: async (phone, userId, input, conv) => {
    const mode = conv?.templateTargetMode;
    if (input === "template_target_platform_done") {
      await showTemplateTargetActions(phone);
      return;
    }
    const match = input.match(/^template_target_(add|remove)_(facebook|instagram|whatsapp)$/);
    if (!match || match[1] !== mode) {
      await showTemplateTargetPlatformMenu(phone, mode);
      return;
    }
    await showTemplateTargetItems(phone, userId, mode, match[2], 0);
  },

  CAMP_TEMPLATE_TARGET_ITEMS: async (phone, userId, input, conv) => {
    const mode = conv?.templateTargetMode;
    const platform = conv?.templateTargetPlatform;
    const page = conv?.templateTargetPage || 0;
    if (input === "template_target_items_done") {
      await showTemplateTargetPlatformMenu(phone, mode);
      return;
    }
    if (input === "template_target_items_prev") {
      await showTemplateTargetItems(phone, userId, mode, platform, page - 1);
      return;
    }
    if (input === "template_target_items_next") {
      await showTemplateTargetItems(phone, userId, mode, platform, page + 1);
      return;
    }
    if (input.startsWith("template_target_item_")) {
      const index = Number(input.slice("template_target_item_".length));
      const item = conv?.templateTargetPageItems?.[index];
      if (item) {
        applyTemplateTargetChange(phone, mode, item);
        await showTemplateTargetChangeConfirmation(
          phone,
          mode,
          platform,
          item,
        );
        return;
      }
      await showTemplateTargetItems(phone, userId, mode, platform, page);
      return;
    }
    await showTemplateTargetItems(phone, userId, mode, platform, page);
  },

  CAMP_TEMPLATE_TARGET_CONTINUE: async (phone, userId, input, conv) => {
    if (input === "template_target_change_more") {
      await showTemplateTargetItems(
        phone,
        userId,
        conv?.templateTargetMode,
        conv?.templateTargetPlatform,
        0,
      );
      return;
    }
    if (input === "template_target_change_done") {
      await showTemplateTargetPlatformMenu(phone, conv?.templateTargetMode);
      return;
    }
    await showTemplateTargetChangeConfirmation(
      phone,
      conv?.templateTargetMode,
      conv?.templateTargetPlatform,
      conv?.templateTargetLastItem,
    );
  },

  // ── Campaign: Name ──
  CAMP_NAME: async (phone, userId, input) => {
    if (input.length < 2) {
      await sendText(phone, "שם קצר מדי. נסה שוב:");
      return;
    }
    updateDraft(phone, { title: input });
    setConversation(phone, { step: "CAMP_CONTENT" });
    await sendInputPrompt(phone, "כתוב את תוכן הפוסט:");
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
      await sendInputPrompt(
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
      if (getConversation(phone)?.draft?.returnToTemplateReview) {
        updateDraft(phone, { returnToTemplateReview: false });
        await showTemplateReview(phone);
        return;
      }
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
      await askPlatform(phone, getConversation(phone)?.draft?.platforms || []);
      return;
    }
    if (input === "preview_edit") {
      if (getConversation(phone)?.draft?.templateId) {
        await showTemplateReview(phone);
      } else {
        await startManualCampaign(phone);
      }
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
      await finishTargetSelection(phone);
      return;
    }
    if (input === "plat_facebook") {
      await openExternalTargetSelector(phone, userId, "facebook", "campaign");
      return;
    }
    if (input === "plat_instagram") {
      setConversation(phone, { step: "CAMP_IG_TYPES" });
      await showInstagramTypes(phone);
      return;
    }
    if (input === "plat_whatsapp") {
      await openExternalTargetSelector(phone, userId, "whatsapp", "campaign");
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
        const index = targets.findIndex(
          (item) =>
            item.type === target.type &&
            normalizeBroadcastId(item.id) === normalizeBroadcastId(target.id),
        );
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
        const existing = targets.findIndex(
          (item) =>
            item.type === target.type &&
            normalizeBroadcastId(item.id) === normalizeBroadcastId(target.id),
        );
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
      await finishTargetSelection(phone);
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
      await sendInputPrompt(phone, "שלח תאריך (DD/MM/YYYY):");
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
      await sendInputPrompt(phone, "שלח שעת פרסום בפורמט HH:MM");
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
    await sendInputPrompt(phone, "שלח תאריך התחלה בפורמט DD/MM/YYYY");
  },

  CAMP_RECURRING_START: async (phone, userId, input) => {
    const value = parseBotDate(input);
    if (!value) {
      await sendText(phone, "תאריך לא תקין. שלח DD/MM/YYYY");
      return;
    }
    updateDraft(phone, { recurringStartDate: value });
    setConversation(phone, { step: "CAMP_RECURRING_END" });
    await sendInputPrompt(phone, "שלח תאריך סיום בפורמט DD/MM/YYYY");
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
    await sendInputPrompt(phone, "שלח שעה (HH:MM):");
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

  TARGET_SELECTOR_WAIT: async (phone, userId, input, conv) => {
    if (input === "selector_new_link") {
      await openExternalTargetSelector(
        phone,
        userId,
        conv?.selectorPlatform,
        conv?.selectorContext,
      );
      return;
    }
    await interactiveMenu(
      phone,
      "פתח את הקישור שנשלח, בחר יעדים ולחץ שמירה. לאחר השמירה אמשיך איתך כאן באופן אוטומטי.",
      [{ id: "selector_new_link", title: "צור קישור חדש" }],
    );
  },

  STATUS_PERIOD: async (phone, userId, input) => {
    const periods = {
      status_today: { days: 0, label: "היום" },
      status_week: { days: 7, label: "7 הימים האחרונים" },
      status_month: { days: 30, label: "30 הימים האחרונים" },
    };
    const selected = periods[input];
    if (!selected) {
      await showStatusPeriodMenu(phone);
      return;
    }
    await showStatusReport(phone, userId, selected);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function showPublicAbout(phone) {
  await sendText(
    phone,
    [
      "נעים מאוד, אנחנו Possbo 💜",
      "",
      "Possbo מרכזת במקום אחד את יצירת התוכן, בחירת הקהלים, התזמון והמעקב אחר פרסומים.",
      "",
      "מה אפשר לעשות במערכת?",
      "• ליצור קמפיינים באופן עצמאי או מתוך טמפלייט",
      "• ליצור תוכן בעזרת AI ולערוך אותו",
      "• לפרסם בפייסבוק לפרופיל ולקבוצות",
      "• לפרסם באינסטגרם לפיד, לסטורי ולרילס",
      "• לשלוח לקבוצות ולרשימות תפוצה ב-WhatsApp",
      "• לתזמן פרסום מיידי, חד-פעמי או חוזר",
      "• לשמור טמפלייטים לשימוש חוזר",
      "• לעקוב אחר סטטוסים, הצלחות, כשלים ומדדי פעילות",
      "• לנהל קמפיינים גם דרך פוסבוט ב-WhatsApp",
    ].join("\n"),
  );
  await showPublicAboutActions(phone);
}

async function showPublicAboutActions(phone) {
  setConversation(phone, { step: "WELCOME_ABOUT" });
  await interactiveMenu(phone, "רוצה להצטרף או שכבר יש לך חשבון?", [
    { id: "welcome_register", title: "הרשמה" },
    { id: "welcome_login", title: "התחברות" },
  ]);
}

async function startTemplateCreation(phone) {
  setConversation(phone, {
    step: "TEMPLATE_NAME",
    draft: {
      creatingTemplate: true,
      templateName: "",
      content: "",
      title: null,
      isAnonymous: false,
      location: null,
      whatsappText: null,
      images: [],
      platforms: [],
      groupIds: [],
      groupNames: [],
      publishToProfile: false,
      igEnabled: false,
      instagramPublishTypes: [],
      waEnabled: false,
      whatsappTargets: [],
    },
  });
  await sendInputPrompt(
    phone,
    "יצירת טמפלייט חדש 📝\n\nתחילה, איזה שם תרצה לתת לטמפלייט?\nשם ותוכן הם שדות החובה היחידים.",
  );
}

async function askTemplateAnonymous(phone) {
  setConversation(phone, { step: "TEMPLATE_ANONYMOUS" });
  await interactiveMenu(
    phone,
    "האם פרסומים מהטמפלייט יוגדרו כאנונימיים כברירת מחדל?",
    [
      { id: "tpl_anon_no", title: "לא" },
      { id: "tpl_anon_yes", title: "כן" },
    ],
  );
}

async function askTemplateWhatsAppLink(phone, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { whatsappNumber: true, whatsappMessage: true },
  });
  setConversation(phone, { step: "TEMPLATE_WHATSAPP_LINK" });
  if (!user?.whatsappNumber) {
    await interactiveMenu(
      phone,
      "לא מוגדר בחשבון מספר לקישור WhatsApp. ניתן להמשיך בלי קישור ולחבר אותו בהגדרות האתר.",
      [{ id: "tpl_wa_skip", title: "המשך בלי קישור" }],
    );
    return;
  }
  await interactiveMenu(
    phone,
    "להוסיף לטמפלייט קישור WhatsApp ליצירת קשר? לא חובה.",
    [
      { id: "tpl_wa_default", title: "כן, הודעת ברירת מחדל" },
      { id: "tpl_wa_custom", title: "כן, הודעה אחרת" },
      { id: "tpl_wa_skip", title: "לא, דלג" },
    ],
  );
}

async function askTemplateImages(phone) {
  setConversation(phone, { step: "TEMPLATE_IMAGES_CHOICE" });
  await interactiveMenu(phone, "להוסיף תמונות לטמפלייט? לא חובה.", [
    { id: "tpl_images_add", title: "הוסף תמונות" },
    { id: "tpl_images_skip", title: "דלג" },
  ]);
}

async function askTemplateTargets(phone) {
  setConversation(phone, { step: "TEMPLATE_TARGETS_CHOICE" });
  await interactiveMenu(
    phone,
    "להגדיר יעדי פרסום קבועים לטמפלייט? אפשר גם לבחור אותם רק בעת יצירת קמפיין.",
    [
      { id: "tpl_targets_add", title: "כן, בחר יעדים" },
      { id: "tpl_targets_skip", title: "לא, שמור ללא יעדים" },
    ],
  );
}

async function showNewTemplateSummary(phone) {
  const draft = getConversation(phone)?.draft || {};
  const imageCount = draft.images?.length || 0;
  setConversation(phone, { step: "TEMPLATE_SUMMARY" });
  await sendText(
    phone,
    [
      "סיכום הטמפלייט החדש:",
      "",
      `שם הטמפלייט: ${draft.templateName}`,
      `תוכן: ${draft.content}`,
      `שם קמפיין: ${draft.title || "לא הוגדר"}`,
      `פרסום אנונימי: ${draft.isAnonymous ? "כן" : "לא"}`,
      `מיקום: ${draft.location || "לא הוגדר"}`,
      `קישור WhatsApp: ${draft.whatsappText != null ? "כן" : "לא"}`,
      `תמונות: ${imageCount}`,
      formatTargetSummary(draft),
      "",
      "התזמון ייבחר בעת יצירת הקמפיין ואינו נשמר בטמפלייט.",
    ].join("\n"),
  );
  await interactiveMenu(phone, "לשמור את הטמפלייט?", [
    { id: "tpl_save", title: "שמור טמפלייט" },
    { id: "tpl_restart", title: "התחל מחדש" },
  ]);
}

async function saveNewTemplate(phone, userId) {
  const draft = getConversation(phone)?.draft || {};
  if (!draft.templateName?.trim() || !draft.content?.trim()) {
    await sendText(phone, "חסרים שם או תוכן. נתחיל מחדש.");
    await startTemplateCreation(phone);
    return;
  }
  await sendText(phone, "שומר את הטמפלייט...");
  try {
    const uploaded = [];
    for (const mediaId of draft.images || []) {
      const file = await downloadBotMedia(mediaId, "templates");
      uploaded.push(`/uploads/templates/${file.filename}`);
    }
    const template = await prisma.postTemplate.create({
      data: {
        userId,
        name: draft.templateName.trim(),
        content: draft.content.trim(),
        campaignTitle: draft.title?.trim() || null,
        isAnonymous: Boolean(draft.isAnonymous),
        location: draft.location?.trim() || null,
        whatsappText:
          draft.whatsappText == null ? null : String(draft.whatsappText),
        groupIds: draft.groupIds || [],
        imageUrls: uploaded,
        publishToProfile: Boolean(draft.publishToProfile),
        instagramEnabled: Boolean(draft.igEnabled),
        instagramPublishTypes: draft.igEnabled
          ? draft.instagramPublishTypes || []
          : [],
        storyMediaMode:
          draft.igEnabled &&
          draft.instagramPublishTypes?.includes("STORY")
            ? "first"
            : null,
        whatsappEnabled: Boolean(draft.waEnabled),
        whatsappTargets: draft.waEnabled
          ? draft.whatsappTargets || []
          : null,
      },
    });
    invalidateDashboardCache(userId);
    setConversation(phone, { step: "MAIN_MENU", draft: undefined });
    await sendText(
      phone,
      `הטמפלייט ${template.name} נוצר ונשמר בהצלחה! ✅\nהוא זמין כעת בעמוד הטמפלייטים וגם ביצירת קמפיין דרך הבוט.`,
    );
    await mainMenu(phone);
  } catch (err) {
    log.error("Failed to create template from WhatsApp bot", err, { userId });
    await sendText(
      phone,
      "לא הצלחתי לשמור את הטמפלייט כרגע. הפרטים נשמרו בשיחה ואפשר לנסות שוב.",
    );
    await showNewTemplateSummary(phone);
  }
}

async function showContactMenu(phone) {
  setConversation(phone, { step: "CONTACT_MENU" });
  await sendText(
    phone,
    `אנחנו כאן לעזור 😊\nהמייל של צוות Possbo:\n${SUPPORT_EMAIL}`,
  );
  await interactiveMenu(phone, "תרצה לצרף הודעה כדי שהצוות יחזור אליך?", [
    { id: "contact_write", title: "כן, כתוב הודעה" },
    { id: "contact_email_only", title: "לא, הצג רק את המייל" },
  ]);
}

async function sendBotContactRequest(phone, userId, message) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!user?.email) {
    await sendText(
      phone,
      `לא מוגדרת כתובת אימייל בחשבון. ניתן לפנות אלינו ישירות:\n${SUPPORT_EMAIL}`,
    );
    await mainMenu(phone);
    return;
  }
  try {
    await sendContactEmail({
      name: user.name || "משתמש Possbo",
      email: user.email,
      phone: user.phone || phone,
      subject: "פנייה מפוסבוט ב-WhatsApp",
      message,
      accountUser: { id: user.id, name: user.name, email: user.email },
    });
    await sendText(
      phone,
      "ההודעה נשלחה בהצלחה לצוות Possbo ✅\nנחזור אליך באמצעות פרטי הקשר שבחשבון.",
    );
  } catch (err) {
    log.error("Bot contact request failed", err, { userId });
    await sendText(
      phone,
      `שליחת ההודעה נכשלה כרגע. אפשר לפנות אלינו ישירות:\n${SUPPORT_EMAIL}`,
    );
  }
  await mainMenu(phone);
}

const BOT_TUTORIALS = {
  "getting-started": {
    title: "התחלה מהירה ודפי האתר",
    text: `Possbo מרכזת את כל תהליך הפרסום:

1. כתיבת תוכן והוספת מדיה, כותרת ומיקום.
2. בחירת יעדים בפייסבוק, אינסטגרם ו-WhatsApp.
3. פרסום מיידי, מתוזמן או חוזר.
4. בדיקת הסיכום ואישור הפרסום.

דפי האתר:
• דשבורד — סיכום, סטטיסטיקות, לוח שנה וקבוצות.
• קבוצות פייסבוק — סנכרון וניהול קבוצות.
• קמפיינים — כל הפרסומים והסטטוסים.
• יומן — הפרסומים המתוזמנים.
• סטטיסטיקות — חשיפה ומעורבות.
• טמפלייטים — תבניות לשימוש חוזר.
• יצירת פוסט בעזרת AI.
• דוחות וסיכום — היסטוריה וייצוא PDF.
• פידבק — שליחת משוב.`,
  },
  campaigns: {
    title: "קמפיינים והתקדמות פרסום",
    text: `קמפיין כולל תוכן, מדיה, יעדי הפצה, תזמונים וסטטוס לכל יעד.

כל קבוצת Facebook, פרופיל, סוג Instagram ויעד WhatsApp הם משימת פרסום נפרדת. מוצגת התקדמות לפי מספר היעדים, והקמפיין מסתיים רק לאחר שכל המשימות הסתיימו.

אפשר לראות הצלחות, כשלים, היסטוריית פרסום וקישורים לתוצאות. קישור לסטורי זמין כל עוד הסטורי פעיל, בדרך כלל עד 24 שעות.`,
  },
  platforms: {
    title: "Facebook, Instagram ו-WhatsApp",
    text: `Facebook:
• פרסום לפרופיל אישי, לקבוצות או לשניהם.
• מסנכרנים קבוצות מהאתר ובוחרים אותן בקמפיין.

Instagram:
• נדרש חשבון Business או Creator מחובר.
• פיד דורש תמונה או וידאו.
• סטורי הוא בעיקר מדיה וניתן לבחור קובץ ראשון, הכול או קובץ מסוים.
• ריל דורש וידאו.

WhatsApp:
• מחברים ומסנכרנים דרך ההגדרות.
• אפשר לבחור קבוצות ורשימות תפוצה.
• אפשר לשמור מספר והודעת ברירת מחדל לקישור WhatsApp.

לכל פלטפורמה ניתן להגדיר תזמון עצמאי.`,
  },
  templates: {
    title: "טמפלייטים ויצירת תוכן ב-AI",
    text: `טמפלייט הוא תבנית מוכנה לפרסום מהיר עם תוכן, מדיה ויעדי תפוצה.

אפשר ליצור טמפלייט באתר או ישירות דרך פוסבוט. התזמון אינו נשמר בטמפלייט ונבחר ביצירת הקמפיין.

כלי ה-AI:
1. בוחרים סוג פוסט.
2. ממלאים מוצר או שירות, קהל ויתרון.
3. בוחרים טון וקריאה לפעולה.
4. מייצרים ועורכים את התוצאה.

לתוצאה טובה כדאי להיות ספציפיים, להגדיר קהל מדויק, לציין יתרון ייחודי ולהוסיף מחיר, מבצע או תאריך. אפשר להשתמש בפוסט לדוגמה כהשראה ולייצר גרסה נוספת.`,
  },
  scheduling: {
    title: "תזמון פרסומים",
    text: `קיימים שלושה מצבים:
• מיידי — פרסום עכשיו.
• מתוזמן — תאריך ושעה מסוימים.
• חוזר — טווח תאריכים, ימים ושעה אחת או יותר.

קבוצות Facebook, הפרופיל האישי ו-WhatsApp יכולים לצאת בזמנים שונים. גם פיד, סטורי וריל ב-Instagram יכולים לקבל תזמון נפרד.

השעות המומלצות במערכת מבוססות על הנתונים הזמינים בחשבון.`,
  },
  analytics: {
    title: "סטטיסטיקות, מדדים ודוחות",
    text: `עמוד הסטטיסטיקות מציג חשיפה ומעורבות לפי תקופה.

Instagram: פרסומים, צפיות, לייקים, תגובות, שיתופים וחשיפה בחלוקה לפיד, רילס וסטוריז.
Facebook: פרסומים, לייקים, תגובות וחשיפה משוערת לפי הנתונים האמינים הזמינים.

בדוחות מוצגים סך פרסומים, הצלחות, כשלים, אחוז הצלחה, פעילות אחרונה ותזמונים קרובים. ניתן לסנן ולייצא PDF.`,
  },
  settings: {
    title: "חיבורים והגדרות",
    text: `בהגדרות ניתן לנהל:
• פרופיל ופרטי התחברות.
• התראות.
• חיבור Facebook.
• חיבור Instagram מאובטח דרך Meta OAuth.
• חיבור WhatsApp, סנכרון קבוצות ורשימות תפוצה והודעת קישור.
• ערכת נושא בהירה או כהה.

אם חיבור פלטפורמה אינו פעיל, יש להתחבר מחדש ולסנכרן את היעדים.`,
  },
  troubleshoot: {
    title: "פתרון בעיות נפוצות",
    text: `• Facebook נכשל — בדוק את החיבור והתחבר מחדש אם צריך.
• Instagram נכשל — ודא שמחובר Business/Creator ושהמדיה מתאימה.
• סנכרון קבוצות נכשל — בדוק חיבור Facebook ונסה שוב.
• תזמון לא יצא — בדוק את סטטוס היעדים ואת החיבורים.
• מדיה לא עולה — נסה קובץ נתמך ובגודל סביר; ריל דורש וידאו.
• יעדי WhatsApp לא מופיעים — ודא שהחיבור פעיל ובצע סנכרון מחדש.
• Instagram נראה מחובר אך נכשל — בצע חיבור מחדש כדי לחדש הרשאה.`,
  },
};

async function showTutorialMenu(phone) {
  setConversation(phone, { step: "TUTORIAL_MENU" });
  await interactiveMenu(phone, "מרכז ההדרכות של Possbo — בחר נושא:", [
    { id: "tutorial_getting-started", title: "התחלה מהירה ודפי האתר" },
    { id: "tutorial_campaigns", title: "קמפיינים וסטטוסים" },
    { id: "tutorial_platforms", title: "פלטפורמות פרסום" },
    { id: "tutorial_templates", title: "טמפלייטים ו-AI" },
    { id: "tutorial_scheduling", title: "תזמון פרסומים" },
    { id: "tutorial_analytics", title: "סטטיסטיקות ודוחות" },
    { id: "tutorial_settings", title: "חיבורים והגדרות" },
    { id: "tutorial_troubleshoot", title: "פתרון בעיות" },
    { id: "tutorial_back", title: "חזרה" },
  ]);
}

async function showTutorialTopic(phone, topicId) {
  const topic = BOT_TUTORIALS[topicId] || BOT_TUTORIALS["getting-started"];
  setConversation(phone, { step: "TUTORIAL_TOPIC", tutorialTopic: topicId });
  await sendText(phone, `${topic.title}\n\n${topic.text}`);
  await interactiveMenu(phone, "מה תרצה לעשות עכשיו?", [
    { id: "tutorial_topics", title: "נושא הדרכה אחר" },
    { id: "contact_support", title: "צור קשר" },
  ]);
}

async function startCampaign(phone) {
  setConversation(phone, {
    step: "CAMP_CREATE_MODE",
    draft: undefined,
    templatePage: 0,
  });
  await showCampaignCreationOptions(phone);
}

async function showCampaignCreationOptions(phone) {
  setConversation(phone, { step: "CAMP_CREATE_MODE" });
  await interactiveMenu(phone, "איך תרצה ליצור את הקמפיין?", [
    { id: "create_template", title: "יצירה מתבנית" },
    { id: "create_manual", title: "יצירה עצמאית" },
    { id: "create_back", title: "חזרה לתפריט" },
  ]);
}

async function startManualCampaign(phone) {
  setConversation(phone, {
    step: "CAMP_NAME",
    draft: { groupIds: [], groupNames: [], platforms: [], images: [] },
  });
  await sendText(
    phone,
    "יצירת קמפיין חדש\n\nשלח את שם הקמפיין (רק עבורך, אינו מפורסם):",
  );
}

async function showTemplateList(phone, userId, requestedPage = 0) {
  // Six templates leave room for previous/next/back and the global main-menu
  // action while staying within WhatsApp's 10-row list limit.
  const pageSize = 6;
  const total = await prisma.postTemplate.count({ where: { userId } });
  if (!total) {
    await sendText(
      phone,
      "עדיין אין לך תבניות שמורות. אפשר ליצור תבניות בעמוד התבניות באתר.",
    );
    await showCampaignCreationOptions(phone);
    return;
  }

  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const page = Math.min(Math.max(0, requestedPage), lastPage);
  const templates = await prisma.postTemplate.findMany({
    where: { userId },
    orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
    skip: page * pageSize,
    take: pageSize,
    select: { id: true, name: true },
  });

  const options = templates.map((template) => ({
    id: `template_pick_${template.id}`,
    title: template.name,
  }));
  if (page > 0) options.push({ id: "template_prev", title: "תבניות קודמות" });
  if (page < lastPage) options.push({ id: "template_next", title: "תבניות נוספות" });
  options.push({ id: "template_back", title: "חזרה" });

  setConversation(phone, { step: "CAMP_TEMPLATE_LIST", templatePage: page });
  await interactiveMenu(phone, "בחר תבנית:", options);
}

function templatePlatforms(template) {
  const platforms = [];
  if (template.publishToProfile) platforms.push("fb_profile");
  if (template.groupIds?.length) platforms.push("fb_groups");
  if (template.instagramEnabled) platforms.push("instagram");
  if (template.whatsappEnabled) platforms.push("whatsapp");
  return platforms;
}

async function loadTemplateDraft(phone, userId, templateId) {
  const [template, user] = await Promise.all([
    prisma.postTemplate.findFirst({
      where: { id: templateId, userId },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { whatsappNumber: true },
    }),
  ]);
  if (!template) {
    await sendText(phone, "התבנית לא נמצאה או אינה זמינה.");
    await showTemplateList(phone, userId, 0);
    return;
  }

  const savedGroups = template.groupIds?.length
    ? await prisma.facebookGroup.findMany({
        where: { userId, groupId: { in: template.groupIds } },
        select: { groupId: true, groupName: true },
      })
    : [];
  const groupNameMap = new Map(
    savedGroups.map((group) => [group.groupId, group.groupName]),
  );
  const groupNames = (template.groupIds || []).map(
    (groupId) => groupNameMap.get(groupId) || groupId,
  );

  let content = template.content;
  let hasWhatsApp = false;
  if (template.whatsappText != null && user?.whatsappNumber) {
    const phoneNumber = user.whatsappNumber.replace(/[^0-9]/g, "");
    const waLink = `https://wa.me/${phoneNumber}${
      template.whatsappText
        ? `?text=${encodeURIComponent(template.whatsappText)}`
        : ""
    }`;
    if (!content.includes("wa.me/")) content = `${content}\n\n${waLink}`;
    hasWhatsApp = true;
  }

  setConversation(phone, {
    step: "CAMP_TEMPLATE_REVIEW",
    draft: {
      templateId: template.id,
      templateName: template.name,
      title: template.campaignTitle || template.name,
      content,
      hasWhatsApp,
      isAnonymous: template.isAnonymous,
      location: template.location,
      groupIds: template.groupIds || [],
      groupNames,
      platforms: templatePlatforms(template),
      images: [],
      templateImageUrls: template.imageUrls || [],
      publishToProfile: template.publishToProfile,
      igEnabled: template.instagramEnabled,
      instagramPublishTypes:
        template.instagramPublishTypes?.length > 0
          ? template.instagramPublishTypes
          : ["FEED"],
      waEnabled: template.whatsappEnabled,
      whatsappTargets: template.whatsappTargets || [],
    },
  });
  await prisma.postTemplate.update({
    where: { id: template.id },
    data: { usageCount: { increment: 1 } },
  });
  await showTemplateReview(phone);
}

async function showTemplateReview(phone) {
  const draft = getConversation(phone)?.draft || {};
  const imageCount =
    (draft.templateImageUrls?.length || 0) + (draft.images?.length || 0);
  const targetSummary = formatTargetSummary(draft);
  const reviewText = (
    `תבנית: ${draft.templateName || "ללא שם"}\n\n` +
    `שם הקמפיין: ${draft.title || "לא הוגדר"}\n` +
    `תוכן: ${draft.content || "לא הוגדר"}\n` +
    `תמונות: ${imageCount}\n` +
    `${targetSummary}\n\n` +
    "אפשר להמשיך עם התבנית או לשנות כל חלק. מה תרצה לעשות?"
  ).slice(0, 900);

  setConversation(phone, { step: "CAMP_TEMPLATE_REVIEW" });
  await interactiveMenu(
    phone,
    reviewText,
    [
      { id: "template_use", title: "המשך עם התבנית" },
      { id: "template_edit_title", title: "שינוי שם" },
      { id: "template_edit_content", title: "שינוי תוכן" },
      { id: "template_edit_images", title: "שינוי תמונות" },
      { id: "template_edit_targets", title: "שינוי יעדים" },
      { id: "template_choose_other", title: "בחירת תבנית אחרת" },
    ],
  );
}

async function showTemplateImageOptions(phone) {
  const draft = getConversation(phone)?.draft || {};
  const count =
    (draft.templateImageUrls?.length || 0) + (draft.images?.length || 0);
  if (count > 0) {
    await sendDraftPreviewImages(phone, draft);
  }
  await interactiveMenu(
    phone,
    count > 0
      ? `מוצגות ${Math.min(count, 4)} מתוך ${count} תמונות קיימות. מה תרצה לעשות?`
      : "אין כרגע תמונות בתבנית. מה תרצה לעשות?",
    [
      { id: "template_images_add", title: "הוסף על הקיימות" },
      { id: "template_images_remove_all", title: "הסר את כולן" },
      { id: "template_images_replace", title: "החלף בתמונות חדשות" },
      { id: "template_images_back", title: "חזרה לסקירה" },
    ],
  );
}

async function showTemplateTargetActions(phone) {
  const draft = getConversation(phone)?.draft || {};
  setConversation(phone, { step: "CAMP_TEMPLATE_TARGET_ACTIONS" });
  const options = [];
  if (hasAnyPublishTarget(draft)) {
    options.push({
      id: "template_targets_remove",
      title: "הסר יעד מסוים",
    });
  }
  options.push(
    { id: "template_targets_add", title: "הוסף על הקיימים" },
    { id: "template_targets_replace", title: "החלף את כל היעדים" },
    { id: "template_targets_back", title: "חזרה לסקירת התבנית" },
  );
  const summary = formatTargetSummary(draft);
  const menuText =
    summary.length > 720
      ? `${summary.slice(0, 720)}\nיעדים נוספים אינם מוצגים כאן.\n\nכיצד תרצה לשנות את יעדי הפרסום?`
      : `${summary}\n\nכיצד תרצה לשנות את יעדי הפרסום?`;
  await interactiveMenu(
    phone,
    menuText,
    options,
  );
}

async function openExternalTargetSelector(
  phone,
  userId,
  platform,
  context = "campaign",
) {
  const publicBase = String(process.env.WA_BOT_PUBLIC_URL || "").replace(
    /\/+$/,
    "",
  );
  if (!publicBase) {
    await sendText(
      phone,
      "כתובת הפיתוח הציבורית אינה זמינה כרגע. ודא שמנהרת Cloudflare פעילה.",
    );
    return;
  }
  for (const [token, session] of targetSelectorSessions) {
    if (
      session.phone === phone &&
      session.platform === platform &&
      !session.completed
    ) {
      targetSelectorSessions.delete(token);
    }
  }
  const token = crypto.randomBytes(32).toString("hex");
  targetSelectorSessions.set(token, {
    phone,
    userId,
    platform,
    context,
    completed: false,
    expiresAt: Date.now() + TARGET_SELECTOR_TTL_MS,
  });
  setConversation(phone, {
    step: "TARGET_SELECTOR_WAIT",
    selectorPlatform: platform,
    selectorContext: context,
  });
  const platformName = platform === "facebook" ? "Facebook" : "WhatsApp";
  await sendText(
    phone,
    `בחירת יעדי ${platformName} נפתחת במסך מאובטח עם חיפוש ובחירה מרובה.\n\nפתח את הקישור:\n${publicBase}/bot-targets/${token}\n\nאם נפתח תחילה מסך אזהרה של Pinggy, לחץ על Enter site (כניסה לאתר) כדי להמשיך למסך הבחירה.\n\nהקישור תקף ל-30 דקות ולשימוש אחד בלבד. לאחר בחירת היעדים חשוב ללחוץ על שמירה, ואז אמשיך איתך כאן אוטומטית.`,
  );
  await interactiveMenu(phone, "אם הקישור פג, אפשר ליצור קישור חדש:", [
    { id: "selector_new_link", title: "צור קישור חדש" },
  ]);
}

async function buildExternalTargetSelection(session) {
  const conv = getConversation(session.phone);
  if (!conv || getAuthenticatedUser(session.phone) !== session.userId) {
    throw new Error("BOT_SELECTOR_CONVERSATION_EXPIRED");
  }
  const draft = conv.draft || {};
  if (session.platform === "facebook") {
    const [savedGroups, memberships] = await Promise.all([
      prisma.facebookGroup.findMany({
        where: { userId: session.userId },
        select: {
          groupId: true,
          groupName: true,
          memberCount: true,
        },
        orderBy: { groupName: "asc" },
      }),
      prisma.userGroup.findMany({
        where: { userId: session.userId },
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
        orderBy: { group: { name: "asc" } },
      }),
    ]);
    const groupsById = new Map();
    for (const group of savedGroups) {
      groupsById.set(group.groupId, {
        id: group.groupId,
        name: group.groupName,
        memberCount: group.memberCount,
      });
    }
    for (const { group } of memberships) {
      const id = group.externalGroupId || group.id;
      if (!groupsById.has(id)) {
        groupsById.set(id, {
          id,
          name: group.name,
          memberCount: group.memberCount,
        });
      }
    }
    const facebookGroups = [...groupsById.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "he"),
    );
    const items = [
      {
        id: "profile",
        name: "פרופיל אישי",
        type: "profile",
        description: "פרסום בפרופיל Facebook האישי",
      },
      ...facebookGroups.map((group) => ({
        id: `group:${group.id}`,
        name: group.name,
        type: "group",
        description: group.memberCount
          ? `${group.memberCount.toLocaleString("he-IL")} חברים`
          : "קבוצת Facebook",
      })),
    ];
    return {
      platform: "facebook",
      title: "בחירת יעדי Facebook",
      subtitle: "בחר פרופיל אישי וקבוצות. אפשר לחפש ולסמן כמה יעדים.",
      items,
      selectedIds: [
        ...(draft.publishToProfile ? ["profile"] : []),
        ...(draft.groupIds || []).map((id) => `group:${id}`),
      ],
    };
  }

  const [groups, broadcasts] = await Promise.all([
    prisma.whatsAppContact.findMany({
      where: { userId: session.userId, isGroup: true },
      orderBy: { name: "asc" },
      select: { waId: true, name: true, participantCount: true },
    }),
    prisma.whatsAppBroadcastList.findMany({
      where: { userId: session.userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, members: true },
    }),
  ]);
  return {
    platform: "whatsapp",
    title: "בחירת יעדי WhatsApp",
    subtitle: "בחר קבוצות ורשימות תפוצה. אפשר לחפש ולסמן כמה יעדים.",
    items: [
      ...groups.map((group) => ({
        id: `group:${group.waId}`,
        name: group.name || "קבוצת WhatsApp",
        type: "group",
        description: group.participantCount
          ? `${group.participantCount.toLocaleString("he-IL")} משתתפים`
          : "קבוצת WhatsApp",
      })),
      ...broadcasts.map((list) => ({
        id: `broadcast:${list.id}`,
        name: list.name,
        type: "broadcast",
        description: `${Array.isArray(list.members) ? list.members.length : 0} נמענים`,
      })),
    ],
    selectedIds: (draft.whatsappTargets || []).map(
      (target) =>
        `${target.type}:${normalizeBroadcastId(target.id)}`,
    ),
  };
}

async function applyExternalTargetSelection(session, selectedItems) {
  const conv = getConversation(session.phone);
  if (!conv || getAuthenticatedUser(session.phone) !== session.userId) {
    throw new Error("BOT_SELECTOR_CONVERSATION_EXPIRED");
  }
  const draft = conv.draft || {};
  const platforms = [...(draft.platforms || [])];
  const setPlatform = (name, enabled) => {
    const index = platforms.indexOf(name);
    if (enabled && index < 0) platforms.push(name);
    if (!enabled && index >= 0) platforms.splice(index, 1);
  };

  if (session.platform === "facebook") {
    const profile = selectedItems.some((item) => item.id === "profile");
    const groups = selectedItems.filter((item) => item.type === "group");
    setPlatform("fb_profile", profile);
    setPlatform("fb_groups", groups.length > 0);
    updateDraft(session.phone, {
      platforms,
      publishToProfile: profile,
      groupIds: groups.map((item) => item.id.slice("group:".length)),
      groupNames: groups.map((item) => item.name),
    });
  } else {
    const targets = selectedItems.map((item) => {
      const separator = item.id.indexOf(":");
      return {
        type: item.id.slice(0, separator),
        id: item.id.slice(separator + 1),
        name: item.name,
      };
    });
    setPlatform("whatsapp", targets.length > 0);
    updateDraft(session.phone, {
      platforms,
      waEnabled: targets.length > 0,
      whatsappTargets: targets,
    });
  }

  if (session.context === "template_edit") {
    await showTemplateTargetActions(session.phone);
    return;
  }
  const updated = getConversation(session.phone)?.draft || {};
  await askMorePlatforms(session.phone, updated.platforms || []);
}

function hasTemplateTargetsForPlatform(draft, platform) {
  if (platform === "facebook") {
    return Boolean(draft.publishToProfile || draft.groupIds?.length);
  }
  if (platform === "instagram") {
    return Boolean(draft.igEnabled && draft.instagramPublishTypes?.length);
  }
  return Boolean(draft.waEnabled && draft.whatsappTargets?.length);
}

async function showTemplateTargetPlatformMenu(phone, mode) {
  const draft = getConversation(phone)?.draft || {};
  const labels = {
    add: "לאיזו פלטפורמה תרצה להוסיף יעד?",
    remove: "מאיזו פלטפורמה תרצה להסיר יעד?",
  };
  const options = ["facebook", "instagram", "whatsapp"]
    .filter(
      (platform) =>
        mode === "add" || hasTemplateTargetsForPlatform(draft, platform),
    )
    .map((platform) => ({
      id: `template_target_${mode}_${platform}`,
      title:
        platform === "facebook"
          ? "פייסבוק"
          : platform === "instagram"
            ? "אינסטגרם"
            : "וואטסאפ",
    }));
  options.push({
    id: "template_target_platform_done",
    title: mode === "remove" ? "סיום הסרת יעדים" : "סיום הוספת יעדים",
  });
  setConversation(phone, {
    step: "CAMP_TEMPLATE_TARGET_PLATFORM",
    templateTargetMode: mode,
  });
  await interactiveMenu(phone, labels[mode], options);
}

function normalizeBroadcastId(id) {
  return String(id || "").replace(/^broadcast_/, "");
}

async function buildTemplateTargetItems(userId, mode, platform, draft) {
  if (platform === "facebook") {
    if (mode === "remove") {
      const items = [];
      if (draft.publishToProfile) {
        items.push({ kind: "fb_profile", value: "profile", label: "פרופיל אישי" });
      }
      (draft.groupIds || []).forEach((id, index) => {
        items.push({
          kind: "fb_group",
          value: id,
          label: `קבוצה: ${draft.groupNames?.[index] || id}`,
        });
      });
      return items;
    }
    const groups = await prisma.facebookGroup.findMany({
      where: { userId },
      orderBy: { groupName: "asc" },
      select: { groupId: true, groupName: true },
    });
    const selectedIds = new Set(draft.groupIds || []);
    return [
      ...(!draft.publishToProfile
        ? [{ kind: "fb_profile", value: "profile", label: "פרופיל אישי" }]
        : []),
      ...groups
        .filter((group) => !selectedIds.has(group.groupId))
        .map((group) => ({
          kind: "fb_group",
          value: group.groupId,
          label: `קבוצה: ${group.groupName}`,
        })),
    ];
  }

  if (platform === "instagram") {
    const labels = { FEED: "פיד", STORY: "סטורי", REEL: "רילס" };
    const selected = new Set(draft.instagramPublishTypes || []);
    return ["FEED", "STORY", "REEL"]
      .filter((type) => (mode === "remove" ? selected.has(type) : !selected.has(type)))
      .map((type) => ({ kind: "ig_type", value: type, label: labels[type] }));
  }

  if (mode === "remove") {
    return (draft.whatsappTargets || []).map((target) => ({
      kind: "wa_target",
      value: `${target.type}:${target.id}`,
      label: `${target.type === "broadcast" ? "רשימת תפוצה" : "קבוצה"}: ${
        target.name || target.id
      }`,
    }));
  }
  const [groups, broadcasts] = await Promise.all([
    prisma.whatsAppContact.findMany({
      where: { userId, isGroup: true },
      orderBy: { name: "asc" },
      select: { waId: true, name: true },
    }),
    prisma.whatsAppBroadcastList.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const selected = new Set(
    (draft.whatsappTargets || []).map(
      (target) => `${target.type}:${normalizeBroadcastId(target.id)}`,
    ),
  );
  return [
    ...groups
      .filter((group) => !selected.has(`group:${group.waId}`))
      .map((group) => ({
        kind: "wa_target",
        value: `group:${group.waId}`,
        label: `קבוצה: ${group.name || "קבוצת WhatsApp"}`,
      })),
    ...broadcasts
      .filter((list) => !selected.has(`broadcast:${list.id}`))
      .map((list) => ({
        kind: "wa_target",
        value: `broadcast:${list.id}`,
        label: `רשימת תפוצה: ${list.name}`,
      })),
  ];
}

function applyTemplateTargetChange(phone, mode, item) {
  const draft = getConversation(phone)?.draft || {};
  const adding = mode === "add";
  const platforms = [...(draft.platforms || [])];
  const addPlatform = (value) => {
    if (!platforms.includes(value)) platforms.push(value);
  };
  const removePlatform = (value) => {
    const index = platforms.indexOf(value);
    if (index >= 0) platforms.splice(index, 1);
  };

  if (item.kind === "fb_profile") {
    if (adding) addPlatform("fb_profile");
    else removePlatform("fb_profile");
    updateDraft(phone, { platforms, publishToProfile: adding });
    return;
  }
  if (item.kind === "fb_group") {
    const groupIds = [...(draft.groupIds || [])];
    const groupNames = [...(draft.groupNames || [])];
    if (adding) {
      groupIds.push(item.value);
      groupNames.push(item.label.replace(/^קבוצה:\s*/, ""));
      addPlatform("fb_groups");
    } else {
      const index = groupIds.indexOf(item.value);
      if (index >= 0) {
        groupIds.splice(index, 1);
        groupNames.splice(index, 1);
      }
      if (!groupIds.length) removePlatform("fb_groups");
    }
    updateDraft(phone, { platforms, groupIds, groupNames });
    return;
  }
  if (item.kind === "ig_type") {
    const types = [...(draft.instagramPublishTypes || [])];
    if (adding && !types.includes(item.value)) types.push(item.value);
    if (!adding) {
      const index = types.indexOf(item.value);
      if (index >= 0) types.splice(index, 1);
    }
    if (types.length) addPlatform("instagram");
    else removePlatform("instagram");
    updateDraft(phone, {
      platforms,
      igEnabled: types.length > 0,
      instagramPublishTypes: types,
    });
    return;
  }
  const targets = [...(draft.whatsappTargets || [])];
  const separator = item.value.indexOf(":");
  const type = item.value.slice(0, separator);
  const id = item.value.slice(separator + 1);
  if (adding) {
    targets.push({
      type,
      id,
      name: item.label.replace(/^(קבוצה|רשימת תפוצה):\s*/, ""),
    });
  } else {
    const index = targets.findIndex(
      (target) =>
        target.type === type &&
        normalizeBroadcastId(target.id) === normalizeBroadcastId(id),
    );
    if (index >= 0) targets.splice(index, 1);
  }
  if (targets.length) addPlatform("whatsapp");
  else removePlatform("whatsapp");
  updateDraft(phone, {
    platforms,
    waEnabled: targets.length > 0,
    whatsappTargets: targets,
  });
}

async function showTemplateTargetChangeConfirmation(
  phone,
  mode,
  platform,
  item,
) {
  const remaining = await buildTemplateTargetItems(
    getAuthenticatedUser(phone),
    mode,
    platform,
    getConversation(phone)?.draft || {},
  );
  setConversation(phone, {
    step: "CAMP_TEMPLATE_TARGET_CONTINUE",
    templateTargetMode: mode,
    templateTargetPlatform: platform,
    templateTargetLastItem: item,
  });
  const action = mode === "remove" ? "הוסר" : "נוסף";
  const actionName = mode === "remove" ? "להסרה" : "להוספה";
  const finishName = mode === "remove" ? "סיום הסרה" : "סיום הוספה";
  const options = [];
  if (remaining.length) {
    options.push({
      id: "template_target_change_more",
      title: `בחר יעד נוסף ${actionName}`,
    });
  }
  options.push({
    id: "template_target_change_done",
    title: finishName,
  });
  await interactiveMenu(
    phone,
    `${item?.label || "היעד"} ${action} בהצלחה. ${
      remaining.length
        ? `באפשרותך לבחור יעד נוסף ${actionName} או ${finishName}.`
        : `לא נשארו יעדים נוספים ${actionName}.`
    }`,
    options,
  );
}

async function showTemplateTargetItems(phone, userId, mode, platform, page = 0) {
  if (["facebook", "whatsapp"].includes(platform)) {
    await openExternalTargetSelector(
      phone,
      userId,
      platform,
      "template_edit",
    );
    return;
  }
  const draft = getConversation(phone)?.draft || {};
  const items = await buildTemplateTargetItems(userId, mode, platform, draft);
  if (!items.length) {
    await showTemplateTargetPlatformMenu(phone, mode);
    return;
  }
  const pageSize = 6;
  const lastPage = Math.max(0, Math.ceil(items.length / pageSize) - 1);
  const safePage = Math.max(0, Math.min(page, lastPage));
  const pageItems = items.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const options = pageItems.map((item, index) => ({
    id: `template_target_item_${index}`,
    title: item.label,
  }));
  if (safePage > 0) {
    options.push({ id: "template_target_items_prev", title: "הקודמים" });
  }
  if (safePage < lastPage) {
    options.push({ id: "template_target_items_next", title: "הבאים" });
  }
  options.push({
    id: "template_target_items_done",
    title: mode === "remove" ? "סיום הסרה" : "סיום הוספה",
  });
  setConversation(phone, {
    step: "CAMP_TEMPLATE_TARGET_ITEMS",
    templateTargetMode: mode,
    templateTargetPlatform: platform,
    templateTargetPage: safePage,
    templateTargetPageItems: pageItems,
  });
  await interactiveMenu(
    phone,
    mode === "remove"
      ? "בחר יעד להסרה. לאחר ההסרה תוכל לבחור יעד נוסף:"
      : "בחר יעד להוספה. לאחר ההוספה תוכל לבחור יעד נוסף:",
    options,
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

function formatTargetSummary(draft = {}) {
  const lines = ["יעדים:"];
  const facebookParts = [];
  if (draft.publishToProfile) facebookParts.push("פרופיל אישי");
  if (draft.groupIds?.length) {
    const names = draft.groupNames?.length
      ? draft.groupNames
      : draft.groupIds;
    facebookParts.push(`קבוצות: ${names.join(", ")}`);
  }
  if (facebookParts.length) {
    lines.push(`פייסבוק: ${facebookParts.join(" + ")}`);
  }

  if (draft.igEnabled) {
    const typeNames = {
      STORY: "סטורי",
      FEED: "פיד",
      REEL: "רילס",
    };
    const types = (draft.instagramPublishTypes || ["FEED"]).map(
      (type) => typeNames[type] || type,
    );
    lines.push(`אינסטגרם: ${types.join(", ")}`);
  }

  if (draft.waEnabled) {
    const targets = draft.whatsappTargets || [];
    const groups = targets
      .filter((target) => target.type === "group")
      .map((target) => target.name || target.id);
    const broadcasts = targets
      .filter((target) => target.type === "broadcast")
      .map((target) => target.name || target.id);
    if (groups.length) lines.push(`וואטסאפ — קבוצות: ${groups.join(", ")}`);
    if (broadcasts.length) {
      lines.push(`וואטסאפ — רשימות תפוצה: ${broadcasts.join(", ")}`);
    }
    if (!groups.length && !broadcasts.length) {
      lines.push("וואטסאפ: לא נבחרו יעדים");
    }
  }

  if (lines.length === 1) lines.push("לא הוגדרו יעדי פרסום");
  return lines.join("\n");
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

async function sendDraftPreviewImages(phone, draft) {
  const publicBase = (
    process.env.WA_BOT_PUBLIC_URL ||
    process.env.MEDIA_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");
  const previewImages = [
    ...(draft.templateImageUrls || []).map((url) => ({
      link: /^https?:\/\//i.test(url)
        ? url
        : publicBase
          ? `${publicBase}${url}`
          : null,
      fallbackUrl: publicBase ? `${publicBase}${url}` : url,
    })),
    ...(draft.images || []).map((id) => ({ id })),
  ].slice(0, 4);

  for (const image of previewImages) {
    if (!image.id && !image.link) {
      if (image.fallbackUrl) {
        await sendText(phone, `קישור לתמונה: ${image.fallbackUrl}`);
      }
      continue;
    }
    try {
      await sendImage(phone, image);
    } catch (err) {
      log.warn("Failed to send preview image", { error: err.message });
      if (image.fallbackUrl) {
        await sendText(phone, `לא ניתן להציג את התמונה. קישור: ${image.fallbackUrl}`);
      }
    }
  }
}

async function showPreview(phone) {
  const conv = getConversation(phone);
  const draft = conv?.draft || {};
  const imgCount =
    (draft.images?.length || 0) + (draft.templateImageUrls?.length || 0);
  setConversation(phone, { step: "CAMP_PREVIEW" });

  let preview = "תצוגה מקדימה:\n\n";
  preview += draft.content || "(ללא תוכן)";
  if (imgCount > 0) preview += `\n\n[${imgCount} תמונות]`;
  if (draft.hasWhatsApp) preview += "\n\n[קישור וואטסאפ מצורף]";
  preview += `\n\n${formatTargetSummary(draft)}`;

  await sendDraftPreviewImages(phone, draft);

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
    await finishTargetSelection(phone);
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
      id: list.id,
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
  if (!["CAMP_IMAGES_WAIT", "TEMPLATE_IMAGES_WAIT"].includes(conv?.step)) return;

  const draft = conv?.draft || {};
  const images = draft.images || [];
  const mediaId = msg.image?.id;
  if (mediaId && images.length < 12) {
    images.push(mediaId);
    updateDraft(phone, { images });
    await sendText(
      phone,
      `תמונה ${images.length} נשמרה. שלח עוד או כתוב סיום.`,
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
        isAnonymous: draft.isAnonymous || false,
        location: draft.location || null,
        templateName: draft.templateName || null,
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

    const templateImageUrls = draft.templateImageUrls || [];
    for (let index = 0; index < templateImageUrls.length; index++) {
      await prisma.postMedia.create({
        data: {
          postId: post.id,
          mediaType: "IMAGE",
          url: templateImageUrls[index],
          orderIndex: index,
        },
      });
    }

    for (let index = 0; index < (draft.images || []).length; index++) {
      const media = await downloadBotMedia(draft.images[index]);
      await prisma.postMedia.create({
        data: {
          postId: post.id,
          mediaType: "IMAGE",
          url: `/uploads/${media.filename}`,
          orderIndex: templateImageUrls.length + index,
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

    // The website dashboard caches its combined payload. Invalidate it as
    // soon as the bot finishes creating the campaign so the next refresh
    // includes the new campaign immediately.
    invalidateDashboardCache(userId);
    setConversation(phone, { step: "MAIN_MENU", draft: undefined });

    if (draft.scheduleMode !== "now" && jobCount > 0) {
      await dispatchPublicationNotification({
        userId,
        event: "schedule",
        postTitle: post.title || post.content?.slice(0, 80),
        scheduledAt,
      }).catch((notificationError) => {
        log.error("Bot schedule notification failed", notificationError, {
          userId,
          postId: post.id,
        });
      });
    }

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
      publishToProfile: true,
      instagramEnabled: true,
      instagramPublishType: true,
      whatsappEnabled: true,
      whatsappTargets: true,
      postGroups: {
        select: {
          groupId: true,
          group: { select: { name: true } },
        },
      },
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
  const campaignBlocks = campaigns.map((campaign, index) => {
    const title = (campaign.title || "קמפיין ללא שם").trim();
    const content = (campaign.content || "").replace(/\s+/g, " ").trim();
    const preview =
      content.length > 80 ? `${content.slice(0, 80).trim()}…` : content;
    const createdAt = new Intl.DateTimeFormat("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(campaign.createdAt);
    const targetSummary = formatTargetSummary({
      publishToProfile: campaign.publishToProfile,
      groupIds: campaign.postGroups.map((postGroup) => postGroup.groupId),
      groupNames: campaign.postGroups.map(
        (postGroup) => postGroup.group?.name || postGroup.groupId,
      ),
      igEnabled: campaign.instagramEnabled,
      instagramPublishTypes: campaign.instagramPublishType
        ? campaign.instagramPublishType.split(",").filter(Boolean)
        : campaign.instagramEnabled
          ? ["FEED"]
          : [],
      waEnabled: campaign.whatsappEnabled,
      whatsappTargets: Array.isArray(campaign.whatsappTargets)
        ? campaign.whatsappTargets
        : [],
    });
    return [
      `*${index + 1}. ${title}*`,
      `סטטוס: ${statusMap[campaign.status] || campaign.status}`,
      `נוצר בתאריך: ${createdAt}`,
      targetSummary,
      preview ? `תוכן: ${preview}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });
  const text = `📋 *הקמפיינים שלי*\n\n${campaignBlocks.join(
    "\n\n──────────\n\n",
  )}`;
  await sendText(phone, text);
  await mainMenu(phone);
}

async function showStatusPeriodMenu(phone) {
  setConversation(phone, { step: "STATUS_PERIOD" });
  await interactiveMenu(phone, "עבור איזו תקופה להציג סטטוס?", [
    { id: "status_today", title: "היום" },
    { id: "status_week", title: "7 ימים אחרונים" },
    { id: "status_month", title: "30 ימים אחרונים" },
  ]);
}

async function finishTargetSelection(phone) {
  const draft = getConversation(phone)?.draft || {};
  if (draft.creatingTemplate) {
    updateDraft(phone, { creatingTemplate: false });
    await showNewTemplateSummary(phone);
    return;
  }
  if (draft.returnToTemplateReviewAfterTargets) {
    updateDraft(phone, { returnToTemplateReviewAfterTargets: false });
    await showTemplateReview(phone);
    return;
  }
  await askSchedule(phone);
}

function statusPeriodStart(days) {
  const start = new Date();
  if (days === 0) {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setTime(Date.now() - days * 24 * 60 * 60 * 1000);
  }
  return start;
}

function formatStatusNumber(value) {
  return Number(value || 0).toLocaleString("he-IL");
}

async function showStatusReport(phone, userId, period) {
  const start = statusPeriodStart(period.days);
  const now = new Date();
  const [activeCampaigns, createdCampaigns, publications, pendingJobs] =
    await Promise.all([
      prisma.post.count({
        where: {
          userId,
          status: "ACTIVE",
          isPaused: false,
        },
      }),
      prisma.post.count({
        where: { userId, createdAt: { gte: start, lte: now } },
      }),
      prisma.publicationHistory.findMany({
        where: { userId, publishedAt: { gte: start, lte: now } },
        select: {
          postId: true,
          groupId: true,
          status: true,
          platform: true,
          targetType: true,
          post: { select: { whatsappTargets: true } },
          publicationJob: { select: { igPublishType: true } },
          metrics: {
            orderBy: { collectedAt: "desc" },
            take: 1,
            select: {
              likesCount: true,
              commentsCount: true,
              sharesCount: true,
              reachCount: true,
              impressionsCount: true,
              viewsCount: true,
              savesCount: true,
              repliesCount: true,
              totalInteractionsCount: true,
            },
          },
        },
      }),
      prisma.publicationJob.count({
        where: {
          status: { in: ["PENDING", "RUNNING"] },
          OR: [{ post: { userId } }, { postGroup: { userId } }],
        },
      }),
    ]);

  const successful = publications.filter(
    (publication) => publication.status === "SUCCESS",
  );
  const failed = publications.filter(
    (publication) => publication.status === "FAILED",
  );
  const uniqueCampaigns = new Set(publications.map((item) => item.postId)).size;
  const platformCounts = { FACEBOOK: 0, INSTAGRAM: 0, WHATSAPP: 0 };
  const instagramTypes = { FEED: 0, STORY: 0, REEL: 0 };
  const facebookGroups = new Set();
  let facebookProfile = 0;

  for (const publication of successful) {
    const platform =
      publication.platform ||
      (publication.targetType === "INSTAGRAM"
        ? "INSTAGRAM"
        : publication.targetType === "WHATSAPP"
          ? "WHATSAPP"
          : "FACEBOOK");
    if (Object.hasOwn(platformCounts, platform)) platformCounts[platform]++;
    if (platform === "FACEBOOK") {
      if (publication.targetType === "PROFILE") facebookProfile++;
      else if (publication.groupId) facebookGroups.add(publication.groupId);
    }
    if (platform === "INSTAGRAM") {
      const type = publication.publicationJob?.igPublishType || "FEED";
      if (Object.hasOwn(instagramTypes, type)) instagramTypes[type]++;
    }
  }

  const whatsappPosts = new Map();
  for (const publication of publications) {
    if (
      (publication.platform === "WHATSAPP" ||
        publication.targetType === "WHATSAPP") &&
      Array.isArray(publication.post?.whatsappTargets)
    ) {
      whatsappPosts.set(publication.postId, publication.post.whatsappTargets);
    }
  }
  const whatsappTargets = [...whatsappPosts.values()].flat();
  const whatsappGroups = new Set(
    whatsappTargets
      .filter((target) => target.type === "group")
      .map((target) => target.id),
  ).size;
  const broadcastLists = new Set(
    whatsappTargets
      .filter((target) => target.type === "broadcast")
      .map((target) => target.id),
  ).size;

  const totals = publications.reduce(
    (sum, publication) => {
      const metric = publication.metrics?.[0];
      if (!metric) return sum;
      sum.likes += metric.likesCount || 0;
      sum.comments += metric.commentsCount || 0;
      sum.shares += metric.sharesCount || 0;
      sum.reach += metric.reachCount || 0;
      sum.impressions += metric.impressionsCount || 0;
      sum.views += metric.viewsCount || 0;
      sum.saves += metric.savesCount || 0;
      sum.replies += metric.repliesCount || 0;
      sum.interactions +=
        metric.totalInteractionsCount ||
        (metric.likesCount || 0) +
          (metric.commentsCount || 0) +
          (metric.sharesCount || 0) +
          (metric.savesCount || 0) +
          (metric.repliesCount || 0);
      return sum;
    },
    {
      likes: 0,
      comments: 0,
      shares: 0,
      reach: 0,
      impressions: 0,
      views: 0,
      saves: 0,
      replies: 0,
      interactions: 0,
    },
  );

  const successRate = publications.length
    ? Math.round((successful.length / publications.length) * 100)
    : 0;
  const report = [
    `📊 *דוח פעילות — ${period.label}*`,
    "",
    "📌 *קמפיינים*",
    `קמפיינים פעילים כעת: ${formatStatusNumber(activeCampaigns)}`,
    `קמפיינים שנוצרו בתקופה: ${formatStatusNumber(createdCampaigns)}`,
    `קמפיינים עם פעילות בתקופה: ${formatStatusNumber(uniqueCampaigns)}`,
    `משימות ממתינות או פעילות: ${formatStatusNumber(pendingJobs)}`,
    "",
    "✅ *תוצאות פרסום*",
    `כל ניסיונות הפרסום: ${formatStatusNumber(publications.length)}`,
    `פרסומים שהצליחו: ${formatStatusNumber(successful.length)}`,
    `פרסומים שנכשלו: ${formatStatusNumber(failed.length)}`,
    `אחוז הצלחה: ${formatStatusNumber(successRate)}%`,
    "",
    "🌐 *חלוקה לפי פלטפורמה — פרסומים מוצלחים*",
    `פייסבוק: ${formatStatusNumber(platformCounts.FACEBOOK)}`,
    `• פרופיל אישי: ${formatStatusNumber(facebookProfile)}`,
    `• קבוצות שונות: ${formatStatusNumber(facebookGroups.size)}`,
    `אינסטגרם: ${formatStatusNumber(platformCounts.INSTAGRAM)}`,
    `• פיד: ${formatStatusNumber(instagramTypes.FEED)}`,
    `• סטורי: ${formatStatusNumber(instagramTypes.STORY)}`,
    `• רילס: ${formatStatusNumber(instagramTypes.REEL)}`,
    `וואטסאפ: ${formatStatusNumber(platformCounts.WHATSAPP)}`,
    `• קבוצות שנבחרו: ${formatStatusNumber(whatsappGroups)}`,
    `• רשימות תפוצה: ${formatStatusNumber(broadcastLists)}`,
    "",
    "📈 *חשיפה ומעורבות מתועדות*",
    `חשיפה: ${formatStatusNumber(totals.reach)}`,
    `הופעות: ${formatStatusNumber(totals.impressions)}`,
    `צפיות: ${formatStatusNumber(totals.views)}`,
    `לייקים: ${formatStatusNumber(totals.likes)}`,
    `תגובות: ${formatStatusNumber(totals.comments)}`,
    `שיתופים: ${formatStatusNumber(totals.shares)}`,
    `שמירות: ${formatStatusNumber(totals.saves)}`,
    `תגובות לסטורי: ${formatStatusNumber(totals.replies)}`,
    `סך מעורבויות: ${formatStatusNumber(totals.interactions)}`,
    "",
    "המדדים מבוססים על הנתונים האחרונים שנאספו מהפלטפורמות.",
  ].join("\n");

  await sendText(phone, report);
  setConversation(phone, { step: "STATUS_PERIOD" });
  await interactiveMenu(phone, "בחר תקופה אחרת או חזור לתפריט:", [
    { id: "status_today", title: "היום" },
    { id: "status_week", title: "7 ימים אחרונים" },
    { id: "status_month", title: "30 ימים אחרונים" },
  ]);
}

function maskEmail(email) {
  if (!email) return "***";
  const [l, d] = email.split("@");
  return l.length <= 2
    ? `${l[0]}***@${d}`
    : `${l[0]}${l[1]}${"*".repeat(Math.min(l.length - 2, 5))}@${d}`;
}

async function downloadBotMedia(mediaId, subdirectory = "") {
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
  const targetDirectory = subdirectory
    ? path.join(uploadsDir, subdirectory)
    : uploadsDir;
  await fs.mkdir(targetDirectory, { recursive: true });
  const filename = `wa-bot-${crypto.randomUUID()}${extension}`;
  await fs.writeFile(path.join(targetDirectory, filename), buffer);
  return { filename };
}

export default router;
