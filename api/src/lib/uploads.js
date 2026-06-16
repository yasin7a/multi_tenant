import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import multer from "multer";
import { ALLOWED_IMAGE_TYPES, UPLOADS_DIR } from "../config.js";

export async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export async function deleteProfileImage(imageUrl) {
  const normalized = normalizeImageUrl(imageUrl);
  if (!normalized?.startsWith("/api/uploads/")) return;
  const filename = path.basename(normalized);
  if (!filename || filename.includes("..")) return;
  const filepath = path.resolve(UPLOADS_DIR, filename);
  if (!filepath.startsWith(path.resolve(UPLOADS_DIR))) return;
  try {
    await fs.unlink(filepath);
  } catch {
    // ignore
  }
}

const storage = multer.diskStorage({
  async destination(_req, _file, cb) {
    try {
      await ensureUploadsDir();
      cb(null, UPLOADS_DIR);
    } catch (err) {
      cb(err, UPLOADS_DIR);
    }
  },
  filename(_req, file, cb) {
    const ext =
      file.mimetype === "image/jpeg"
        ? ".jpg"
        : file.mimetype === "image/png"
          ? ".png"
          : file.mimetype === "image/gif"
            ? ".gif"
            : file.mimetype === "image/webp"
              ? ".webp"
              : "";
    cb(null, `${randomBytes(16).toString("hex")}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(null, false);
    return cb(null, true);
  },
});

/** Legacy rows may use /uploads/... — API serves files at /api/uploads/... */
export function normalizeImageUrl(imageUrl) {
  if (!imageUrl) return null;
  const value = String(imageUrl).trim();
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/api/uploads/")) return value;
  if (value.startsWith("/uploads/")) return `/api${value}`;
  return value;
}

export function withNormalizedImage(user) {
  if (!user) return user;
  return { ...user, imageUrl: normalizeImageUrl(user.imageUrl) };
}
