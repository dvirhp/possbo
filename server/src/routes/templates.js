import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  imageFileFilter,
  MAX_FILE_SIZE,
  safeFilename,
} from "../utils/security.js";
import { requireAuth } from "../utils/auth-middleware.js";

// Safely parse a value that may be a JSON string (form-data) or already an object (JSON body)
function safeParse(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== "string") return val; // already parsed
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads", "templates");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    import("fs").then((fs) => {
      fs.mkdirSync(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    });
  },
  filename: (_req, file, cb) => cb(null, safeFilename(file.mimetype)),
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: imageFileFilter,
});

const router = express.Router();

// ─── List all templates for current user ─────────────────

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Fetch templates and all user's groups in parallel to reduce DB round-trips
    const [templates, userGroups] = await Promise.all([
      prisma.postTemplate.findMany({
        where: { userId: req.user.id },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.group.findMany({
        where: {
          OR: [
            { userGroups: { some: { userId: req.user.id } } },
            { postGroups: { some: { userId: req.user.id } } },
          ],
        },
        select: {
          id: true,
          externalGroupId: true,
          url: true,
          memberCount: true,
        },
      }),
    ]);

    // Build map keyed by id, externalGroupId, and extracted URL ID
    const memberMap = {};
    for (const g of userGroups) {
      memberMap[g.id] = g.memberCount || 0;
      if (g.externalGroupId) memberMap[g.externalGroupId] = g.memberCount || 0;
      const urlId = g.url?.match(/groups\/([^/?]+)/)?.[1];
      if (urlId) memberMap[urlId] = g.memberCount || 0;
    }

    // For any template groupIds not found via user's groups, do a targeted lookup
    const allGroupIds = [
      ...new Set(templates.flatMap((t) => t.groupIds || [])),
    ];
    const missingIds = allGroupIds.filter(
      (id) => !memberMap.hasOwnProperty(id),
    );
    if (missingIds.length > 0) {
      const extraGroups = await prisma.group.findMany({
        where: {
          OR: [
            { id: { in: missingIds } },
            { externalGroupId: { in: missingIds } },
          ],
        },
        select: {
          id: true,
          externalGroupId: true,
          url: true,
          memberCount: true,
        },
      });
      for (const g of extraGroups) {
        memberMap[g.id] = g.memberCount || 0;
        if (g.externalGroupId)
          memberMap[g.externalGroupId] = g.memberCount || 0;
        const urlId = g.url?.match(/groups\/([^/?]+)/)?.[1];
        if (urlId) memberMap[urlId] = g.memberCount || 0;
      }
    }

    const enriched = templates.map((t) => ({
      ...t,
      totalReach: (t.groupIds || []).reduce(
        (sum, id) => sum + (memberMap[id] || 0),
        0,
      ),
    }));

    res.json({ success: true, templates: enriched });
  }),
);

// ─── Get single template ─────────────────────────────────

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const template = await prisma.postTemplate.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.json({ success: true, template });
  }),
);

// ─── Create template ─────────────────────────────────────

router.post(
  "/",
  requireAuth,
  upload.array("images", 10),
  asyncHandler(async (req, res) => {
    const {
      name,
      content,
      campaignTitle,
      isAnonymous,
      location,
      whatsappText,
      scheduleMode,
      scheduledDate,
      recurringDays,
      recurringTimes,
      dayTimes,
      groupIds,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Template name is required" });
    }
    if (!content?.trim()) {
      return res.status(400).json({ error: "Template content is required" });
    }

    const imageUrls = (req.files || []).map(
      (f) => `/uploads/templates/${f.filename}`,
    );

    const template = await prisma.postTemplate.create({
      data: {
        userId: req.user.id,
        name: name.trim(),
        content: content.trim(),
        campaignTitle: campaignTitle?.trim() || null,
        isAnonymous: isAnonymous === "true" || isAnonymous === true,
        location: location?.trim() || null,
        whatsappText: whatsappText?.trim() || null,
        scheduleMode: scheduleMode || null,
        scheduledDate:
          typeof scheduledDate === "string"
            ? scheduledDate.trim() || null
            : null,
        recurringDays: safeParse(recurringDays, []),
        recurringTimes: safeParse(recurringTimes, []),
        dayTimes: safeParse(dayTimes, null),
        groupIds: safeParse(groupIds, []),
        imageUrls,
      },
    });

    res.status(201).json({ success: true, template });
  }),
);

// ─── Update template ─────────────────────────────────────

router.put(
  "/:id",
  requireAuth,
  upload.array("images", 10),
  asyncHandler(async (req, res) => {
    const existing = await prisma.postTemplate.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    const {
      name,
      content,
      campaignTitle,
      isAnonymous,
      location,
      whatsappText,
      scheduleMode,
      scheduledDate,
      recurringDays,
      recurringTimes,
      dayTimes,
      groupIds,
      existingImages,
    } = req.body;

    const newImageUrls = (req.files || []).map(
      (f) => `/uploads/templates/${f.filename}`,
    );
    const kept = safeParse(existingImages, []);
    const imageUrls = [...kept, ...newImageUrls];

    const template = await prisma.postTemplate.update({
      where: { id: req.params.id },
      data: {
        name: name?.trim() || existing.name,
        content: content?.trim() || existing.content,
        campaignTitle: campaignTitle?.trim() || null,
        isAnonymous: isAnonymous === "true" || isAnonymous === true,
        location: location?.trim() || null,
        whatsappText: whatsappText?.trim() || null,
        scheduleMode: scheduleMode || null,
        scheduledDate:
          typeof scheduledDate === "string"
            ? scheduledDate.trim() || null
            : null,
        recurringDays: safeParse(recurringDays, []),
        recurringTimes: safeParse(recurringTimes, []),
        dayTimes: safeParse(dayTimes, null),
        groupIds: safeParse(groupIds, []),
        imageUrls,
      },
    });

    res.json({ success: true, template });
  }),
);

// ─── Delete template ─────────────────────────────────────

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await prisma.postTemplate.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    await prisma.postTemplate.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  }),
);

// ─── Increment usage count (when creating campaign from template) ─

router.post(
  "/:id/use",
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await prisma.postTemplate.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    await prisma.postTemplate.update({
      where: { id: req.params.id },
      data: { usageCount: { increment: 1 } },
    });

    res.json({ success: true });
  }),
);

export default router;
