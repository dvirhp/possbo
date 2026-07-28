import prisma from "../config/prisma.js";
import { decrypt, encrypt } from "../utils/encryption.js";
import { sendInstagramReconnectEmail } from "../utils/mailer.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("instagram-token-refresh");
const REFRESH_WINDOW_DAYS = 30;
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 24 * 60 * 60;

async function notifyReconnectRequired(account, reason) {
  const notificationType = "INSTAGRAM_RECONNECT_REQUIRED";
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alreadyNotified = await prisma.notification.findFirst({
    where: {
      userId: account.userId,
      type: notificationType,
      createdAt: { gte: since },
    },
    select: { id: true },
  });

  if (alreadyNotified) return;

  await prisma.notification.create({
    data: {
      userId: account.userId,
      type: notificationType,
      title: "נדרש חיבור מחדש ל־Instagram",
      message:
        "לא הצלחנו לרענן את החיבור ל־Instagram. יש לחבר מחדש את החשבון בהגדרות.",
    },
  });
  await sendInstagramReconnectEmail(account.user.email, account.user.name);
  log.warn("Instagram reconnect notification sent", {
    userId: account.userId,
    accountId: account.id,
    reason,
  });
}

/**
 * Refresh active Instagram tokens that expire within 30 days.
 *
 * The scanner runs daily, while the expiry threshold makes each healthy
 * 60-day token refresh approximately once a month. No user interaction is
 * needed as long as the existing token remains valid.
 */
export async function refreshExpiringInstagramTokens() {
  const refreshBefore = new Date(
    Date.now() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const accounts = await prisma.connectedAccount.findMany({
    where: {
      provider: "INSTAGRAM",
      status: "ACTIVE",
      OR: [
        { tokenExpiresAt: null },
        { tokenExpiresAt: { lte: refreshBefore } },
      ],
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  const summary = {
    scanned: accounts.length,
    refreshed: 0,
    reconnectRequired: 0,
    errors: 0,
  };
  log.info("Starting Instagram token refresh scan", {
    accounts: accounts.length,
    refreshWindowDays: REFRESH_WINDOW_DAYS,
  });

  for (const account of accounts) {
    let accessToken;
    try {
      accessToken = decrypt(account.accessTokenEncrypted);
    } catch (error) {
      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: { status: "EXPIRED" },
      });
      summary.reconnectRequired++;
      log.error("Instagram token decrypt failed during refresh", error, {
        userId: account.userId,
        accountId: account.id,
      });
      await notifyReconnectRequired(account, "TOKEN_UNREADABLE");
      continue;
    }

    try {
      const params = new URLSearchParams({
        grant_type: "ig_refresh_token",
        access_token: accessToken,
      });
      const response = await fetch(
        `https://graph.instagram.com/refresh_access_token?${params}`,
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.access_token) {
        const apiMessage =
          data?.error?.message || data?.error_message || `HTTP ${response.status}`;
        const permanentAuthFailure =
          response.status === 400 || response.status === 401;

        log.error(
          "Instagram token refresh rejected",
          new Error(apiMessage),
          {
            userId: account.userId,
            accountId: account.id,
            httpStatus: response.status,
            errorType: data?.error?.type || data?.error_type,
          },
        );

        if (permanentAuthFailure) {
          await prisma.connectedAccount.update({
            where: { id: account.id },
            data: { status: "EXPIRED" },
          });
          summary.reconnectRequired++;
          await notifyReconnectRequired(account, "REFRESH_REJECTED");
        } else {
          summary.errors++;
        }
        continue;
      }

      const expiresIn = Number(
        data.expires_in || DEFAULT_EXPIRES_IN_SECONDS,
      );
      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEncrypted: encrypt(data.access_token),
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          status: "ACTIVE",
        },
      });
      summary.refreshed++;
      log.info("Instagram token refreshed", {
        userId: account.userId,
        accountId: account.id,
        expiresInDays: Math.round(expiresIn / 86400),
      });
    } catch (error) {
      summary.errors++;
      log.error("Instagram token refresh request failed", error, {
        userId: account.userId,
        accountId: account.id,
      });
    }
  }

  log.info("Instagram token refresh scan completed", summary);
  return summary;
}

