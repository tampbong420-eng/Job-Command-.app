// Server code. Where uploaded files (crew photos, logo, job photos, receipts) live.
// Local dev (no BLOB_READ_WRITE_TOKEN): files go to public/uploads/<rel> and the URL is /uploads/<rel>, exactly as before.
// Vercel (BLOB_READ_WRITE_TOKEN set by the connected Blob store): files go to Vercel Blob and the URL is the Blob URL,
// because a Vercel function cannot write to public/ and nothing written to disk survives the request.
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

export function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** Vercel Blob URLs look like https://<store>.public.blob.vercel-storage.com/uploads/... */
export function isBlobUrl(url: string | null | undefined) {
  return /^https:\/\/[a-z0-9-]+\.(public|private)\.blob\.vercel-storage\.com\//i.test(String(url || ""));
}

function localUploadsRoot() {
  return path.join(process.cwd(), "public", "uploads");
}

function safeRel(rel: string) {
  const clean = rel.replace(/^\/+/, "");
  if (!clean || clean.split("/").some((part) => part === ".." || part === "." || part === "")) {
    throw new Error("Bad upload path.");
  }
  return clean;
}

/** Save bytes as uploads/<rel>. Returns the URL to store in the database. */
export async function saveUpload(rel: string, bytes: Buffer, contentType?: string): Promise<string> {
  const clean = safeRel(rel);
  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`uploads/${clean}`, bytes, {
      access: "public",
      addRandomSuffix: true,
      contentType: contentType || undefined,
    });
    return blob.url;
  }
  const file = path.join(localUploadsRoot(), clean);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return `/uploads/${clean}`;
}

/** Remove a file this app uploaded. Never throws; unknown URLs are left alone. */
export async function deleteUpload(url: string | null | undefined) {
  const raw = String(url || "").split("?")[0];
  if (isBlobUrl(raw)) {
    if (!blobEnabled()) return;
    const { del } = await import("@vercel/blob");
    await del(raw).catch(() => undefined);
    return;
  }
  if (!raw.startsWith("/uploads/")) return;
  try {
    const file = path.join(localUploadsRoot(), safeRel(raw.slice("/uploads/".length)));
    await unlink(file).catch(() => undefined);
  } catch {
    /* bad path: ignore */
  }
}

/** Bytes of a stored upload (or any file under public/ for a root-relative URL). Null when missing. */
export async function readUpload(url: string | null | undefined): Promise<Buffer | null> {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (isBlobUrl(raw)) {
    try {
      const res = await fetch(raw);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  if (!raw.startsWith("/") || raw.includes("..")) return null;
  try {
    return await readFile(path.join(process.cwd(), "public", raw.split("?")[0].replace(/^\/+/, "")));
  } catch {
    return null;
  }
}

/** Delete every Blob under uploads/ (whole-shop delete). Returns how many were removed. 0 when Blob is off. */
export async function clearBlobUploads() {
  if (!blobEnabled()) return 0;
  const { list, del } = await import("@vercel/blob");
  let removed = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "uploads/", cursor, limit: 1000 });
    const urls = page.blobs.map((blob) => blob.url);
    if (urls.length) {
      await del(urls).catch(() => undefined);
      removed += urls.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return removed;
}

/** A logo URL that /api/upload/logo produced: /uploads/logo-<ms>.<ext> locally, or the same name on Blob. */
export function isAppLogoUrl(url: string) {
  if (/^\/uploads\/logo-\d+\.(png|jpe?g|webp|gif|svg)$/i.test(url)) return true;
  return (
    isBlobUrl(url) &&
    /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/uploads\/logo-\d+(-[A-Za-z0-9]+)?\.(png|jpe?g|webp|gif|svg)$/i.test(url)
  );
}
