import webpush from "web-push";
import prisma from "../config/prisma.js";
import { createLogger } from "./logger.js";

const log = createLogger("web-push");

export function webPushEnabled() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function configure() {
  if (!webPushEnabled()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
}

export async function sendWebPushToUser(userId, payload) {
  if (!configure()) return { sent: 0, disabled: true };
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), { TTL: 60 * 60, urgency: payload.urgent ? "high" : "normal" });
      sent += 1;
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {});
      else log.warn("Push delivery failed", { userId, statusCode: error.statusCode, endpoint: subscription.endpoint.slice(0, 80) });
    }
  }));
  return { sent, disabled: false };
}
