import prisma from "../config/prisma.js";
import { sendPublicationNotificationEmail } from "./mailer.js";
import { createLogger } from "./logger.js";

const log = createLogger("notifications");

const DEFAULTS = {
  enabled: true,
  emailOnSuccess: true,
  emailOnFailure: true,
  emailOnSchedule: false,
  pushOnSuccess: true,
  pushOnFailure: true,
  pushOnSchedule: false,
};

const EVENT_CONFIG = {
  success: {
    emailKey: "emailOnSuccess",
    pushKey: "pushOnSuccess",
    type: "PUBLICATION_SUCCESS",
    title: "פרסום הצליח",
  },
  failure: {
    emailKey: "emailOnFailure",
    pushKey: "pushOnFailure",
    type: "PUBLICATION_FAILED",
    title: "פרסום נכשל",
  },
  schedule: {
    emailKey: "emailOnSchedule",
    pushKey: "pushOnSchedule",
    type: "PUBLICATION_SCHEDULED",
    title: "קמפיין תוזמן",
  },
};

function platformLabel(targetType, platform) {
  if (platform === "INSTAGRAM" || targetType === "INSTAGRAM") return "Instagram";
  if (platform === "WHATSAPP" || targetType === "WHATSAPP") return "WhatsApp";
  if (targetType === "PROFILE") return "פרופיל Facebook";
  return "Facebook";
}

export async function dispatchPublicationNotification({
  userId,
  event,
  postTitle = "",
  targetType = "",
  platform = "",
  target = "",
  scheduledAt = null,
  errorMessage = "",
}) {
  const config = EVENT_CONFIG[event];
  if (!userId || !config) return { inApp: false, email: false };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, notificationSettings: true },
  });
  if (!user) return { inApp: false, email: false };

  const settings = { ...DEFAULTS, ...(user.notificationSettings || {}) };
  if (!settings.enabled) return { inApp: false, email: false };

  const resolvedPlatform = platformLabel(targetType, platform);
  const campaignName = postTitle || "קמפיין ללא שם";
  const message = event === "success"
    ? `${campaignName} פורסם בהצלחה ב-${resolvedPlatform}${target ? ` - ${target}` : ""}.`
    : event === "failure"
      ? `${campaignName} לא פורסם ב-${resolvedPlatform}${target ? ` - ${target}` : ""}${errorMessage ? `: ${errorMessage}` : "."}`
      : `${campaignName} תוזמן${scheduledAt ? ` ל-${new Date(scheduledAt).toLocaleString("he-IL")}` : ""}.`;

  let inApp = false;
  let email = false;

  if (settings[config.pushKey]) {
    await prisma.notification.create({
      data: { userId, type: config.type, title: config.title, message },
    });
    inApp = true;
  }

  if (settings[config.emailKey] && user.email) {
    email = await sendPublicationNotificationEmail({
      to: user.email,
      name: user.name,
      event,
      postTitle: campaignName,
      platform: resolvedPlatform,
      target,
      scheduledAt,
      errorMessage,
    });
  }

  log.info("Publication notification dispatched", {
    userId, event, inApp, email,
  });
  return { inApp, email };
}
