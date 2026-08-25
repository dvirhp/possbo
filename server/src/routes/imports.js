import { Router } from "express";
import multer from "multer";
import prisma from "../config/prisma.js";
import { requireAuth } from "../utils/auth-middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { validateDraftCsv } from "../utils/csv-import.js";

const router = Router();
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => done(null, file.mimetype === "text/csv" || file.originalname.toLowerCase().endsWith(".csv")),
}).single("file");

function readCsv(req, res, next) {
  csvUpload(req, res, error => {
    if (error) return next(error);
    if (!req.file) return res.status(400).json({ error: "יש לבחור קובץ CSV" });
    next();
  });
}

router.post("/csv/preview", requireAuth, readCsv, (req, res) => {
  try {
    const result = validateDraftCsv(req.file.buffer.toString("utf8"));
    res.json({ ...result, validRows: result.rows.filter(row => row.valid).length, invalidRows: result.rows.filter(row => !row.valid).length });
  } catch (error) {
    res.status(400).json({ error: error.message === "UNCLOSED_QUOTE" ? "קובץ CSV מכיל מירכאות שלא נסגרו" : "קובץ CSV אינו תקין" });
  }
});

router.post("/csv/commit", requireAuth, readCsv, asyncHandler(async (req, res) => {
  let result;
  try { result = validateDraftCsv(req.file.buffer.toString("utf8")); }
  catch { return res.status(400).json({ error: "קובץ CSV אינו תקין" }); }
  if (result.errors.length) return res.status(422).json({ error: "יש לתקן את שגיאות הקובץ לפני הייבוא", ...result });
  const created = await prisma.$transaction(result.rows.map(row => prisma.post.create({
    data: {
      userId: req.user.id,
      title: row.title,
      content: row.content,
      location: row.location,
      isAnonymous: row.isAnonymous,
      status: "DRAFT",
      instagramEnabled: row.platform === "INSTAGRAM",
      whatsappEnabled: row.platform === "WHATSAPP",
      draftData: { importedFromCsv: true, platform: row.platform, importedAt: new Date().toISOString() },
    },
    select: { id: true, title: true, status: true },
  })));
  res.status(201).json({ success: true, imported: created.length, drafts: created });
}));

export default router;
