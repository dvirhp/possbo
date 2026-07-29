/* global FormData */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
const log = createLogger("media-upload");

export function resolveUploadPath(mediaUrl) {
  const value = String(mediaUrl || "");
  const relativePath = value
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/?uploads\/?/i, "")
    .replace(/^[/\\]+/, "");
  const resolved = path.resolve(uploadsDir, relativePath);
  const uploadsRoot = `${path.resolve(uploadsDir)}${path.sep}`;
  if (resolved !== path.resolve(uploadsDir) && !resolved.startsWith(uploadsRoot)) {
    throw new Error("Invalid media path");
  }
  return resolved;
}

/**
 * Get a publicly accessible URL for a local media file.
 * Uses MEDIA_PUBLIC_URL env var if set (e.g., ngrok URL).
 * Otherwise, uploads the file to a temporary public hosting service.
 *
 * @param {string} localPath - Relative path like "/uploads/filename.png"
 * @returns {Promise<string>} Public URL accessible by Instagram's servers
 */
export async function getPublicMediaUrl(localPath) {
  // If a public base URL is configured (ngrok, production domain, etc.), use it directly
  const publicBase = process.env.MEDIA_PUBLIC_URL;
  if (publicBase) {
    return `${publicBase}${localPath}`;
  }

  // Upload to a public host that Instagram can access
  const absolutePath = resolveUploadPath(localPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Media file not found: ${absolutePath}`);
  }

  const fileBuffer = fs.readFileSync(absolutePath);
  const fileName = path.basename(absolutePath);

  // Try freeimage.host (iili.io) — verified to work with Instagram's servers
  const url = await uploadToFreeImage(fileBuffer, fileName);
  if (url) return url;

  // Fallback: try imgur (requires no auth for anonymous uploads via their API)
  const url2 = await uploadToImgur(fileBuffer, fileName);
  if (url2) return url2;

  throw new Error(
    "Failed to upload media to public URL. Set MEDIA_PUBLIC_URL env var (e.g., ngrok URL) to expose your server.",
  );
}

async function uploadToFreeImage(buffer, _fileName) {
  try {
    const base64 = buffer.toString("base64");
    const formData = new FormData();
    formData.append("source", base64);
    formData.append("type", "base64");
    formData.append("action", "upload");

    const res = await fetch(
      "https://freeimage.host/api/1/upload?key=6d207e02198a847aa98d0a2a901485a5",
      { method: "POST", body: formData },
    );

    const data = await res.json();
    if (data.image?.url) {
      log.info("Uploaded to freeimage.host", { url: data.image.url });
      return data.image.url;
    }
    log.warn("freeimage.host upload unexpected response", data?.status_txt);
  } catch (err) {
    log.warn("freeimage.host upload failed", err.message);
  }
  return null;
}

async function uploadToImgur(buffer, _fileName) {
  try {
    const base64 = buffer.toString("base64");
    const formData = new FormData();
    formData.append("image", base64);
    formData.append("type", "base64");
    formData.append("name", _fileName);

    const res = await fetch("https://api.imgur.com/3/image", {
      method: "POST",
      headers: { Authorization: "Client-ID 546c25a59c58ad7" },
      body: formData,
    });

    const data = await res.json();
    if (data.data?.link) {
      log.info("Uploaded to imgur", { url: data.data.link });
      return data.data.link;
    }
    log.warn("imgur upload unexpected response", data?.data?.error);
  } catch (err) {
    log.warn("imgur upload failed", err.message);
  }
  return null;
}
