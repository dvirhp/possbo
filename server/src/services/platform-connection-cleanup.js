import prisma from "../config/prisma.js";

/**
 * Remove data that was discovered through a Facebook connection.
 * Historical publications and campaigns are intentionally preserved; only
 * the current target catalogue is cleared so a reconnect starts from a clean
 * sync.
 */
export async function clearFacebookConnectionData(userId, { clearSession = true } = {}) {
  const operations = [
    prisma.facebookGroup.deleteMany({ where: { userId } }),
    prisma.userGroup.deleteMany({ where: { userId } }),
    prisma.groupSyncHistory.deleteMany({ where: { userId } }),
  ];

  if (clearSession) {
    operations.push(
      prisma.user.update({
        where: { id: userId },
        data: {
          facebookAccessToken: null,
          facebookStorageState: null,
          fbSessionValid: false,
        },
      }),
    );
  }

  await prisma.$transaction(operations);
}

/** Remove every target cached from a WhatsApp session. */
export async function clearWhatsAppConnectionData(userId, { clearSession = true } = {}) {
  const operations = [
    prisma.whatsAppContact.deleteMany({ where: { userId } }),
    prisma.whatsAppBroadcastList.deleteMany({ where: { userId } }),
  ];

  if (clearSession) {
    operations.push(
      prisma.whatsAppSession.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: { whatsappSessionConnected: false, whatsappSessionPhone: null },
      }),
    );
  }

  await prisma.$transaction(operations);
}
