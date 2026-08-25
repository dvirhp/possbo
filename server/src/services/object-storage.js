import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client;
export const storageDriver = () => process.env.STORAGE_DRIVER || "local";

function s3() {
  client ||= new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: process.env.S3_ACCESS_KEY_ID ? {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    } : undefined,
  });
  return client;
}

export function objectKeyFromUploadPath(value) {
  return String(value || "").replace(/^https?:\/\/[^/]+/i, "").replace(/^\/?uploads\/?/i, "").replace(/^[/\\]+/, "").replace(/\\/g, "/");
}

export async function persistUpload(localPath, key, contentType) {
  if (storageDriver() !== "s3") return;
  await s3().send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: objectKeyFromUploadPath(key),
    Body: fs.createReadStream(localPath),
    ContentType: contentType || "application/octet-stream",
  }));
}

export async function publicObjectUrl(key) {
  const normalized = objectKeyFromUploadPath(key);
  if (process.env.S3_PUBLIC_BASE_URL) return `${process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${normalized.split("/").map(encodeURIComponent).join("/")}`;
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: normalized }), { expiresIn: 3600 });
}

export async function downloadObject(key, destinationPath) {
  const response = await s3().send(new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: objectKeyFromUploadPath(key),
  }));
  if (!response.Body) throw new Error("Object storage returned an empty body");
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  const temporaryPath = `${destinationPath}.${process.pid}.${Date.now()}.part`;
  try {
    await pipeline(response.Body, fs.createWriteStream(temporaryPath, { flags: "wx" }));
    await fs.promises.rename(temporaryPath, destinationPath).catch(async (error) => {
      if (error.code !== "EEXIST") throw error;
      await fs.promises.unlink(temporaryPath).catch(() => {});
    });
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {});
    throw error;
  }
  return destinationPath;
}

export function storageConfigured() {
  return storageDriver() === "s3" && Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}
