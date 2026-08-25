/**
 * Centralized file-upload middleware factory.
 *
 * Every route that accepts file uploads should use this module instead of
 * configuring Multer individually.  This ensures consistent file-size limits,
 * file-type validation, and directory management across the app.
 */
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { safeFilename, imageFileFilter, MAX_FILE_SIZE } from "./security.js";
import { persistUpload } from "../services/object-storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.join(__dirname, "..", "..", "uploads");

/**
 * Create a Multer instance that writes to `uploads/<category>`.
 * The target directory is created automatically if it doesn't exist.
 *
 * @param {string} [category=""] — subdirectory under `uploads/`
 * @returns {multer.Multer}
 */
function createMulter(category = "") {
  const targetDir = category ? path.join(uploadsDir, category) : uploadsDir;

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(targetDir, { recursive: true });
      cb(null, targetDir);
    },
    filename: (_req, file, cb) => cb(null, safeFilename(file.mimetype)),
  });

  return multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFileFilter,
  });
}

function persistFiles(category, req, res, next) {
  const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : req.file ? [req.file] : [];
  Promise.all(files.map((file) => persistUpload(file.path, category ? `${category}/${file.filename}` : file.filename, file.mimetype)))
    .then(() => next()).catch(next);
}

function withPersistence(middleware, category) {
  return (req, res, next) => middleware(req, res, (error) => {
    if (error) return next(error);
    persistFiles(category, req, res, next);
  });
}

/** Upload up to `maxFiles` images to `uploads/<category>`. */
export function uploadImages(category = "", maxFiles = 10) {
  return withPersistence(createMulter(category).array("images", maxFiles), category);
}

/** Upload a single image to `uploads/<category>`. */
export function uploadSingle(category = "", fieldName = "image") {
  return withPersistence(createMulter(category).single(fieldName), category);
}

/**
 * Multi-field upload — useful when the form sends different field names
 * (e.g. `images` + `igMedia_FEED` + `igMedia_STORY`).
 *
 * @param {string} category — subdirectory under uploads/
 * @param {Array<{name: string, maxCount: number}>} fields
 */
export function uploadFields(category = "", fields = []) {
  return withPersistence(createMulter(category).fields(fields), category);
}
