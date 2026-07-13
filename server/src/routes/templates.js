import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../utils/async-handler.js";
import { imageFileFilter, MAX_FILE_SIZE } from "../utils/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads", "templates");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    import("fs").then((fs) => {
      fs.mkdirSync(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    });
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e6) + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: imageFileFilter,
});

const router = express.Router();
const prisma = new PrismaClient();

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}

// ─── List all templates for current user ─────────────────

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const templates = await prisma.postTemplate.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: "desc" },
    });
    res.json({ success: true, templates });
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
        scheduledDate: scheduledDate?.trim() || null,
        recurringDays: recurringDays ? JSON.parse(recurringDays) : [],
        recurringTimes: recurringTimes ? JSON.parse(recurringTimes) : [],
        dayTimes: dayTimes ? JSON.parse(dayTimes) : null,
        groupIds: groupIds ? JSON.parse(groupIds) : [],
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
    const kept = existingImages ? JSON.parse(existingImages) : [];
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
        scheduledDate: scheduledDate?.trim() || null,
        recurringDays: recurringDays ? JSON.parse(recurringDays) : [],
        recurringTimes: recurringTimes ? JSON.parse(recurringTimes) : [],
        dayTimes: dayTimes ? JSON.parse(dayTimes) : null,
        groupIds: groupIds ? JSON.parse(groupIds) : [],
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
