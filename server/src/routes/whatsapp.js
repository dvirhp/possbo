import express from "express";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "baileys";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import crypto from "crypto";
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";
import { createLogger } from "../utils/logger.js";
import { encrypt, decrypt } from "../utils/encryption.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionsDir = path.join(__dirname, "../../whatsapp-sessions");

const router = express.Router();
const log = createLogger("whatsapp");

// In-memory store for active WA sockets per user
const activeSockets = new Map();
// In-memory store for QR data URLs per user (while connecting)
const pendingQRs = new Map();
// In-memory store for connection status
const connectionStatus = new Map();

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function getUserSessionDir(userId) {
  const dir = path.join(sessionsDir, userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function restoreSessionFromDB(userId, folder) {
  const stored = await prisma.whatsAppSession.findUnique({
    where: { userId },
  });
  if (!stored?.stateEncrypted) return false;

  const files = JSON.parse(decrypt(stored.stateEncrypted));
  await fsPromises.mkdir(folder, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([filename, base64]) =>
      fsPromises.writeFile(
        path.join(folder, path.basename(filename)),
        Buffer.from(base64, "base64"),
      ),
    ),
  );
  return true;
}

async function persistSessionToDB(userId, folder) {
  const entries = await fsPromises.readdir(folder, { withFileTypes: true });
  const files = {};
  // Read sequentially. Baileys sessions can contain hundreds of key files;
  // opening all of them concurrently exhausts Windows' file handle limit.
  for (const entry of entries.filter((item) => item.isFile())) {
    const data = await fsPromises.readFile(path.join(folder, entry.name));
    files[entry.name] = data.toString("base64");
  }
  const stateEncrypted = encrypt(JSON.stringify(files));
  await prisma.whatsAppSession.upsert({
    where: { userId },
    create: { userId, stateEncrypted },
    update: { stateEncrypted },
  });
}

/**
 * Sync groups from groupFetchAllParticipating() into the DB.
 */
async function saveGroupsToDB(userId, groups) {
  if (!groups || !Object.keys(groups).length) return;
  const ops = [];
  for (const [jid, group] of Object.entries(groups)) {
    const name = group.subject || "קבוצה ללא שם";
    const participantCount = group.participants?.length || 0;
    ops.push(
      prisma.whatsAppContact.upsert({
        where: { userId_waId: { userId, waId: jid } },
        create: { userId, waId: jid, name, isGroup: true, participantCount },
        update: { name, participantCount },
      }),
    );
  }
  if (ops.length) {
    try {
      await prisma.$transaction(ops);
      log.info("Saved WA groups to DB", { userId, count: ops.length });
    } catch (err) {
      log.error("Failed to save WA groups to DB", {
        userId,
        error: err.message,
      });
    }
  }
}

/**
 * Atomic file write: write to temp file, then rename.
 * Prevents corruption if process is killed mid-write.
 */
async function atomicWriteFile(filePath, data) {
  const tmpPath = filePath + ".tmp." + crypto.randomBytes(4).toString("hex");
  await fsPromises.writeFile(tmpPath, data);
  await fsPromises.rename(tmpPath, filePath);
}

/**
 * Wraps useMultiFileAuthState with atomic writes to prevent creds corruption.
 * Also creates a backup of creds.json before each save.
 */
async function useAtomicAuthState(userId, folder) {
  const localCreds = await fsPromises.stat(path.join(folder, "creds.json")).catch(() => null);
  if (!localCreds?.size) {
    await restoreSessionFromDB(userId, folder).catch((error) => {
      log.warn("Failed to restore WhatsApp session from DB", {
        userId,
        error: error.message,
      });
    });
  }
  const credsPath = path.join(folder, "creds.json");
  const backupPath = path.join(folder, "creds.backup.json");

  // If creds.json is missing/empty but backup exists, restore from backup
  try {
    const stat = await fsPromises.stat(credsPath).catch(() => null);
    if (!stat || stat.size === 0) {
      const backupStat = await fsPromises.stat(backupPath).catch(() => null);
      if (backupStat && backupStat.size > 0) {
        log.warn("creds.json missing/empty, restoring from backup", { folder });
        await fsPromises.copyFile(backupPath, credsPath);
      }
    }
  } catch {
    /* ignore */
  }

  const result = await useMultiFileAuthState(folder);

  // Override saveCreds with atomic version + backup
  const originalSaveCreds = result.saveCreds;
  let saveChain = Promise.resolve();
  result.saveCreds = () => {
    saveChain = saveChain.catch(() => {}).then(async () => {
    // First, save normally (Baileys internal logic)
    await originalSaveCreds();

    // Then create an atomic backup of the creds file
    try {
      const data = await fsPromises.readFile(credsPath, "utf-8");
      if (data && data.length > 10) {
        await atomicWriteFile(backupPath, data);
        await persistSessionToDB(userId, folder);
      }
    } catch {
      /* ignore backup errors */
    }
    });
    return saveChain;
  };

  return result;
}

/**
 * Initialize a Baileys socket for a user.
 */
async function initSocket(userId, { isRestore = false } = {}) {
  // Clean up existing socket if any
  const existing = activeSockets.get(userId);
  if (existing) {
    existing._intentionalClose = true; // Prevent reconnect loop
    try {
      existing.end();
    } catch {
      /* ignore */
    }
    activeSockets.delete(userId);
  }

  const sessionDir = getUserSessionDir(userId);
  const { state, saveCreds } = await useAtomicAuthState(userId, sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Possbo", "Chrome", "1.0.0"],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    shouldSyncHistoryMessage: () => true,
  });

  activeSockets.set(userId, sock);
  if (isRestore) sock._isRestore = true;

  // ── Listen for groups ──
  sock.ev.on("groups.upsert", async (groups) => {
    try {
      log.info("groups.upsert received", { userId, count: groups.length });
      const groupMap = {};
      for (const g of groups) {
        if (g.id) groupMap[g.id] = g;
      }
      await saveGroupsToDB(userId, groupMap);
    } catch (err) {
      log.error("Error in groups.upsert handler", {
        userId,
        error: err.message,
      });
    }
  });

  // ── Connection updates ──
  sock.ev.on("connection.update", async (update) => {
    try {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, {
            width: 280,
            margin: 2,
          });
          pendingQRs.set(userId, qrDataUrl);
          connectionStatus.set(userId, { status: "waiting_qr", qrDataUrl });
          log.info("QR code generated for user", { userId });

          // If this is a background session restore (nobody's watching the QR),
          // mark as disconnected so the UI shows "reconnect" instead of hanging.
          if (sock._isRestore) {
            log.warn(
              "Restored session requires QR — creds expired/corrupted, marking disconnected",
              { userId },
            );
            sock._intentionalClose = true;
            try {
              sock.end();
            } catch {
              /* ignore */
            }
            activeSockets.delete(userId);
            pendingQRs.delete(userId);
            connectionStatus.set(userId, { status: "disconnected" });
            try {
              await prisma.user.update({
                where: { id: userId },
                data: {
                  whatsappSessionConnected: false,
                  whatsappSessionPhone: null,
                },
              });
            } catch {
              /* ignore */
            }
          }
        } catch (err) {
          log.error("QR generation failed", { userId, error: err.message });
        }
      }

      if (connection === "open") {
        pendingQRs.delete(userId);
        const phone =
          sock.user?.id?.split(":")[0] || sock.user?.id?.split("@")[0] || null;
        connectionStatus.set(userId, { status: "connected", phone });
        log.info("WhatsApp connected", { userId, phone });

        try {
          await prisma.user.update({
            where: { id: userId },
            data: {
              whatsappSessionConnected: true,
              whatsappSessionPhone: phone,
            },
          });
        } catch (err) {
          log.error("Failed to save WA connection to DB", {
            userId,
            error: err.message,
          });
        }

        // Auto-sync groups on connect — retry up to 3 times
        (async () => {
          for (let attempt = 1; attempt <= 3; attempt++) {
            await new Promise((r) => setTimeout(r, attempt * 3000)); // 3s, 6s, 9s
            try {
              const groups = await sock.groupFetchAllParticipating();
              const count = Object.keys(groups).length;
              if (count > 0) {
                await saveGroupsToDB(userId, groups);
                log.info("Auto-sync groups succeeded", {
                  userId,
                  count,
                  attempt,
                });
                return;
              }
              log.debug("Auto-sync groups returned 0, retrying", {
                userId,
                attempt,
              });
            } catch (err) {
              log.warn("Auto-sync groups failed", {
                userId,
                error: err.message,
                attempt,
              });
            }
          }
        })();
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect =
          statusCode !== DisconnectReason.loggedOut && !sock._intentionalClose;

        log.info("WhatsApp connection closed", {
          userId,
          statusCode,
          shouldReconnect,
          intentional: !!sock._intentionalClose,
        });

        if (statusCode === DisconnectReason.loggedOut) {
          pendingQRs.delete(userId);
          connectionStatus.set(userId, { status: "disconnected" });
          activeSockets.delete(userId);
          try {
            await prisma.user.update({
              where: { id: userId },
              data: {
                whatsappSessionConnected: false,
                whatsappSessionPhone: null,
              },
            });
            if (fs.existsSync(sessionDir)) {
              fs.rmSync(sessionDir, { recursive: true, force: true });
            }
            await prisma.whatsAppSession.deleteMany({ where: { userId } });
          } catch {
            /* ignore */
          }
        } else if (shouldReconnect) {
          log.info("Attempting reconnect...", { userId });
          setTimeout(
            () =>
              initSocket(userId).catch((e) =>
                log.error("Reconnect failed", { userId, error: e.message }),
              ),
            3000,
          );
        }
      }
    } catch (err) {
      log.error("Error in connection.update handler", {
        userId,
        error: err.message,
      });
    }
  });

  sock.ev.on("creds.update", saveCreds);

  return sock;
}

/**
 * Restore existing sessions on server startup.
 */
export async function restoreWhatsAppSessions() {
  try {
    const users = await prisma.user.findMany({
      where: { whatsappSessionConnected: true },
      select: { id: true },
    });

    for (const user of users) {
      const sessionDir = getUserSessionDir(user.id);
      const localSessionExists = fs.existsSync(path.join(sessionDir, "creds.json"));
      const dbSessionExists = await prisma.whatsAppSession
        .findUnique({ where: { userId: user.id }, select: { id: true } })
        .then(Boolean);
      if (localSessionExists || dbSessionExists) {
        log.info("Restoring WA session", { userId: user.id });
        try {
          await initSocket(user.id, { isRestore: true });
        } catch (err) {
          log.error("Failed to restore WA session", {
            userId: user.id,
            error: err.message,
          });
        }
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            whatsappSessionConnected: false,
            whatsappSessionPhone: null,
          },
        });
      }
    }
  } catch (err) {
    log.error("Failed to restore WA sessions", { error: err.message });
  }
}

// ─── POST /whatsapp/connect — Start QR-based connection ──────────
router.post("/connect", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // If already connected, return current status
    const existingSock = activeSockets.get(userId);
    const existingStatus = connectionStatus.get(userId);
    if (existingSock && existingStatus?.status === "connected") {
      return res.json({
        success: true,
        connected: true,
        phone: existingStatus.phone,
      });
    }

    await initSocket(userId);

    let attempts = 0;
    while (!pendingQRs.has(userId) && attempts < 20) {
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    const qrDataUrl = pendingQRs.get(userId);
    if (qrDataUrl) {
      res.json({ success: true, qrDataUrl });
    } else {
      const status = connectionStatus.get(userId);
      if (status?.status === "connected") {
        res.json({ success: true, connected: true, phone: status.phone });
      } else {
        res.status(408).json({ error: "QR code generation timed out" });
      }
    }
  } catch (err) {
    log.error("Connect error", { error: err.message });
    res.status(500).json({ error: "שגיאה ביצירת חיבור וואטסאפ" });
  }
});

// ─── POST /whatsapp/connect-phone — Pairing code connection (mobile) ─
router.post("/connect-phone", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { phoneNumber } = req.body;

    if (!phoneNumber || !/^\d{10,15}$/.test(phoneNumber.replace(/\D/g, ""))) {
      return res.status(400).json({ error: "מספר טלפון לא תקין" });
    }

    // If already connected, return current status
    const existingSock = activeSockets.get(userId);
    const existingStatus = connectionStatus.get(userId);
    if (existingSock && existingStatus?.status === "connected") {
      return res.json({
        success: true,
        connected: true,
        phone: existingStatus.phone,
      });
    }

    await initSocket(userId);

    const sock = activeSockets.get(userId);
    if (!sock) {
      return res.status(500).json({ error: "שגיאה ביצירת חיבור" });
    }

    // Wait for socket to be ready (QR generation means socket is ready)
    let attempts = 0;
    while (!pendingQRs.has(userId) && attempts < 20) {
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    // Request pairing code instead of QR
    const digits = phoneNumber.replace(/\D/g, "");
    const pairingCode = await sock.requestPairingCode(digits);
    log.info("Pairing code generated", { userId, phone: digits });

    res.json({ success: true, pairingCode });
  } catch (err) {
    log.error("Connect-phone error", { error: err.message });
    res.status(500).json({ error: "שגיאה ביצירת קוד חיבור" });
  }
});

// ─── GET /whatsapp/status — Check connection status ──────────────
router.get("/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    let status = connectionStatus.get(userId);
    let sock = activeSockets.get(userId);

    if (status?.status === "connected" && sock) {
      res.json({ connected: true, phone: status.phone });
    } else if (status?.status === "waiting_qr") {
      res.json({ connected: false, qrDataUrl: pendingQRs.get(userId) || null });
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { whatsappSessionConnected: true, whatsappSessionPhone: true },
      });

      // A DB flag alone is not proof of a live connection. Restore the
      // encrypted session and wait briefly for Baileys to confirm it.
      if (user?.whatsappSessionConnected && !sock) {
        const storedSession = await prisma.whatsAppSession.findUnique({
          where: { userId },
          select: { id: true },
        });

        if (storedSession) {
          await initSocket(userId, { isRestore: true });
          for (let attempt = 0; attempt < 20; attempt++) {
            status = connectionStatus.get(userId);
            sock = activeSockets.get(userId);
            if (status?.status === "connected" && sock) {
              return res.json({ connected: true, phone: status.phone });
            }
            if (status?.status === "disconnected") break;
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }

        await prisma.user.update({
          where: { id: userId },
          data: {
            whatsappSessionConnected: false,
            whatsappSessionPhone: null,
          },
        });
        return res.json({ connected: false, phone: null });
      }

      res.json({
        connected: false,
        phone: null,
      });
    }
  } catch (err) {
    log.error("Status error", { error: err.message });
    res.status(500).json({ error: "שגיאה בבדיקת סטטוס" });
  }
});

// ─── POST /whatsapp/disconnect — Disconnect WhatsApp ─────────────
router.post("/disconnect", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const sock = activeSockets.get(userId);

    if (sock) {
      sock._intentionalClose = true;
      try {
        await Promise.race([
          sock.logout(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("logout timeout")), 5000),
          ),
        ]);
      } catch {
        /* ignore — timeout or already disconnected */
      }
      try {
        sock.end();
      } catch {
        /* ignore */
      }
      activeSockets.delete(userId);
    }

    pendingQRs.delete(userId);
    connectionStatus.delete(userId);

    const sessionDir = getUserSessionDir(userId);
    if (fs.existsSync(sessionDir)) {
      await fs.promises.rm(sessionDir, { recursive: true, force: true });
    }

    // Clean up DB — remove WA groups & update user
    await prisma.$transaction([
      prisma.whatsAppContact.deleteMany({ where: { userId, isGroup: true } }),
      prisma.whatsAppSession.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: { whatsappSessionConnected: false, whatsappSessionPhone: null },
      }),
    ]);

    log.info("WhatsApp disconnected", { userId });
    res.json({ success: true });
  } catch (err) {
    log.error("Disconnect error", { error: err.message });
    res.status(500).json({ error: "שגיאה בניתוק" });
  }
});

// ─── GET /whatsapp/groups — Get WA groups from DB ────────────────
router.get("/groups", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const groups = await prisma.whatsAppContact.findMany({
      where: { userId, isGroup: true },
      select: {
        id: true,
        waId: true,
        name: true,
        participantCount: true,
        profilePicUrl: true,
      },
      orderBy: { name: "asc" },
    });

    const formatted = groups.map((g) => ({
      id: g.waId,
      name: g.name || "קבוצה ללא שם",
      isGroup: true,
      participants: g.participantCount,
      profilePicUrl: g.profilePicUrl,
    }));

    res.json({ groups: formatted });
  } catch (err) {
    log.error("Groups error", { error: err.message });
    res.status(500).json({ error: "שגיאה בטעינת קבוצות" });
  }
});

// ─── POST /whatsapp/groups/sync — Re-sync groups from WhatsApp ───
router.post("/groups/sync", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const sock = activeSockets.get(userId);

    if (!sock) {
      return res.status(400).json({ error: "וואטסאפ לא מחובר" });
    }

    let groupCount = 0;
    try {
      const groups = await sock.groupFetchAllParticipating();
      groupCount = Object.keys(groups).length;
      await saveGroupsToDB(userId, groups);
    } catch (err) {
      log.debug("Sync groups failed", { error: err.message });
    }

    log.info("Groups sync completed", { userId, groupCount });
    res.json({ success: true, synced: { groups: groupCount } });
  } catch (err) {
    log.error("Sync error", { error: err.message });
    res.status(500).json({ error: "שגיאה בסנכרון קבוצות" });
  }
});

// ─── Backward compat: keep old endpoints working ─────────────────
router.get("/contacts", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const groups = await prisma.whatsAppContact.findMany({
      where: { userId, isGroup: true },
      select: {
        id: true,
        waId: true,
        name: true,
        participantCount: true,
        profilePicUrl: true,
      },
      orderBy: { name: "asc" },
    });
    const broadcastLists = await prisma.whatsAppBroadcastList.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });
    const formatted = [
      ...groups.map((g) => ({
        id: g.waId,
        name: g.name || "קבוצה ללא שם",
        isGroup: true,
        participants: g.participantCount,
        profilePicUrl: g.profilePicUrl,
      })),
      ...broadcastLists.map((bl) => ({
        id: `broadcast_${bl.id}`,
        name: bl.name,
        isBroadcast: true,
        members: bl.members,
        memberCount: bl.members?.length || 0,
      })),
    ];
    res.json({ contacts: formatted });
  } catch (err) {
    log.error("Contacts error", { error: err.message });
    res.status(500).json({ error: "שגיאה בטעינת נתונים" });
  }
});

router.post("/contacts/sync", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const sock = activeSockets.get(userId);
    if (!sock) return res.status(400).json({ error: "וואטסאפ לא מחובר" });

    let groupCount = 0;
    try {
      const groups = await sock.groupFetchAllParticipating();
      groupCount = Object.keys(groups).length;
      await saveGroupsToDB(userId, groups);
    } catch (err) {
      log.debug("Sync groups failed", { error: err.message });
    }

    res.json({ success: true, synced: { groups: groupCount } });
  } catch (err) {
    log.error("Sync error", { error: err.message });
    res.status(500).json({ error: "שגיאה בסנכרון" });
  }
});

// ─── BROADCAST LISTS CRUD ────────────────────────────────────────

// GET /whatsapp/broadcast-lists — Get all broadcast lists
router.get("/broadcast-lists", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const lists = await prisma.whatsAppBroadcastList.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ lists });
  } catch (err) {
    log.error("Broadcast lists error", { error: err.message });
    res.status(500).json({ error: "שגיאה בטעינת רשימות תפוצה" });
  }
});

// POST /whatsapp/broadcast-lists — Create a new broadcast list
router.post("/broadcast-lists", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, members } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "שם הרשימה חובה" });
    }
    if (!members?.length) {
      return res.status(400).json({ error: "יש להוסיף לפחות מספר אחד" });
    }
    if (members.length > 100) {
      return res
        .status(400)
        .json({ error: "ניתן להוסיף עד 100 אנשי קשר לרשימת תפוצה" });
    }

    // Validate & normalize phone numbers
    const normalizedMembers = members.map((m) => ({
      phone: String(m.phone).replace(/[^0-9]/g, ""),
      name: m.name?.trim() || null,
    }));

    const list = await prisma.whatsAppBroadcastList.create({
      data: {
        userId,
        name: name.trim(),
        members: normalizedMembers,
      },
    });

    log.info("Broadcast list created", {
      userId,
      listId: list.id,
      members: normalizedMembers.length,
    });
    res.json({ success: true, list });
  } catch (err) {
    log.error("Create broadcast list error", { error: err.message });
    res.status(500).json({ error: "שגיאה ביצירת רשימת תפוצה" });
  }
});

// PUT /whatsapp/broadcast-lists/:id — Update a broadcast list
router.put("/broadcast-lists/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, members } = req.body;

    // Verify ownership
    const existing = await prisma.whatsAppBroadcastList.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({ error: "רשימת תפוצה לא נמצאה" });
    }

    const updateData = {};
    if (name?.trim()) updateData.name = name.trim();
    if (members) {
      if (members.length > 100) {
        return res
          .status(400)
          .json({ error: "ניתן להוסיף עד 100 אנשי קשר לרשימת תפוצה" });
      }
      updateData.members = members.map((m) => ({
        phone: String(m.phone).replace(/[^0-9]/g, ""),
        name: m.name?.trim() || null,
      }));
    }

    const list = await prisma.whatsAppBroadcastList.update({
      where: { id },
      data: updateData,
    });

    log.info("Broadcast list updated", { userId, listId: id });
    res.json({ success: true, list });
  } catch (err) {
    log.error("Update broadcast list error", { error: err.message });
    res.status(500).json({ error: "שגיאה בעדכון רשימת תפוצה" });
  }
});

// DELETE /whatsapp/broadcast-lists/:id — Delete a broadcast list
router.delete("/broadcast-lists/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.whatsAppBroadcastList.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({ error: "רשימת תפוצה לא נמצאה" });
    }

    await prisma.whatsAppBroadcastList.delete({ where: { id } });

    log.info("Broadcast list deleted", { userId, listId: id });
    res.json({ success: true });
  } catch (err) {
    log.error("Delete broadcast list error", { error: err.message });
    res.status(500).json({ error: "שגיאה במחיקת רשימת תפוצה" });
  }
});

// ─── SEND MESSAGE ────────────────────────────────────────────────

/**
 * POST /whatsapp/send
 * Body: { jid, text, mediaUrl? }
 * Sends a text (optionally with image) to a WA group or individual.
 */
router.post("/send", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jid, text, mediaUrl } = req.body;

    if (!jid || !text?.trim()) {
      return res.status(400).json({ error: "jid ו-text נדרשים" });
    }

    // Strip wa.me links (not relevant when already in WhatsApp)
    const cleanText = text.replace(/\n*https?:\/\/wa\.me\/[^\s]*/g, "").trim();

    const sock = activeSockets.get(userId);
    if (!sock) {
      return res
        .status(400)
        .json({ error: "NO_WHATSAPP_SESSION", message: "וואטסאפ לא מחובר" });
    }

    let message;
    if (mediaUrl) {
      // Send image with caption
      const absoluteUrl = mediaUrl.startsWith("http")
        ? mediaUrl
        : path.join(__dirname, "../../", mediaUrl);
      message = { image: { url: absoluteUrl }, caption: cleanText };
    } else {
      message = { text: cleanText };
    }

    const result = await sock.sendMessage(jid, message);
    log.info("WA message sent", { userId, jid, messageId: result?.key?.id });

    res.json({
      success: true,
      messageId: result?.key?.id || null,
    });
  } catch (err) {
    log.error("WA send error", { error: err.message, jid: req.body?.jid });
    res.status(500).json({ error: "שגיאה בשליחת ההודעה" });
  }
});

/**
 * POST /whatsapp/send-broadcast
 * Body: { broadcastId, text, mediaUrl? }
 * Sends a message to all members of a broadcast list (one by one).
 */
router.post("/send-broadcast", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { broadcastId, text, mediaUrl } = req.body;

    if (!broadcastId || !text?.trim()) {
      return res.status(400).json({ error: "broadcastId ו-text נדרשים" });
    }

    // Strip wa.me links (not relevant when already in WhatsApp)
    const cleanText = text.replace(/\n*https?:\/\/wa\.me\/[^\s]*/g, "").trim();

    const sock = activeSockets.get(userId);
    if (!sock) {
      return res
        .status(400)
        .json({ error: "NO_WHATSAPP_SESSION", message: "וואטסאפ לא מחובר" });
    }

    // Get broadcast list
    const list = await prisma.whatsAppBroadcastList.findFirst({
      where: { id: broadcastId, userId },
    });
    if (!list) {
      return res.status(404).json({ error: "רשימת תפוצה לא נמצאה" });
    }

    const members = list.members || [];
    if (members.length === 0) {
      return res.status(400).json({ error: "רשימת התפוצה ריקה" });
    }

    let message;
    if (mediaUrl) {
      const absoluteUrl = mediaUrl.startsWith("http")
        ? mediaUrl
        : path.join(__dirname, "../../", mediaUrl);
      message = { image: { url: absoluteUrl }, caption: cleanText };
    } else {
      message = { text: cleanText };
    }

    let sent = 0;
    let failed = 0;
    for (const member of members) {
      let phone = String(member.phone).replace(/[^0-9]/g, "");
      if (!phone) {
        failed++;
        continue;
      }
      // Normalize local Israeli numbers (0xx → 972xx)
      if (phone.startsWith("0") && phone.length === 10) {
        phone = "972" + phone.slice(1);
      }
      const jid = `${phone}@s.whatsapp.net`;
      try {
        await sock.sendMessage(jid, message);
        sent++;
        // Small delay between messages to avoid rate limiting
        if (sent < members.length) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err) {
        log.warn("Broadcast send failed", {
          userId,
          phone,
          error: err.message,
        });
        failed++;
      }
    }

    log.info("Broadcast sent", {
      userId,
      broadcastId,
      sent,
      failed,
      total: members.length,
    });
    res.json({ success: true, sent, failed, total: members.length });
  } catch (err) {
    log.error("Broadcast send error", { error: err.message });
    res.status(500).json({ error: "שגיאה בשליחת הודעות" });
  }
});

/**
 * Get active socket for a user (used by other modules).
 * Only returns a socket if the connection is actually open (authenticated).
 */
export function getWhatsAppSocket(userId) {
  const sock = activeSockets.get(userId);
  if (!sock) return null;
  // Check connection status — only return if connected
  const status = connectionStatus.get(userId);
  if (status?.status !== "connected") return null;
  return sock;
}

/**
 * Gracefully close all active WA sockets (call on server shutdown).
 */
export async function closeAllWhatsAppSessions() {
  for (const [userId, sock] of activeSockets.entries()) {
    try {
      sock._intentionalClose = true;
      sock.end();
      log.info("Closed WA socket on shutdown", { userId });
    } catch {
      /* ignore */
    }
  }
  activeSockets.clear();
  connectionStatus.clear();
  pendingQRs.clear();
}

export default router;
