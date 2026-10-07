/**
 * Deploy branch one-off (go-public B3 on Vercel Blob): strip GPS / camera / XMP tags from photos ALREADY in the
 * Vercel Blob store under uploads/. New uploads are cleaned on the way in (lib/photo-clean.ts). Safe to rerun.
 * Needs BLOB_READ_WRITE_TOKEN in the environment (never printed).
 *
 *   npx tsx scripts/clean-blob-photo-metadata.ts                          # dry run
 *   npx tsx scripts/clean-blob-photo-metadata.ts --write --backup <dir>   # originals copied to <dir> first
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { cleanPhoto, detectPhotoType, stillHasLocationTags } from "../lib/photo-clean";

const args = process.argv.slice(2);
const write = args.includes("--write");
const backupAt = args.indexOf("--backup");
const backupDir = backupAt >= 0 ? args[backupAt + 1] : "";

(async () => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is not set.");
  if (write && !backupDir) throw new Error("--write needs --backup <dir>.");
  const { list, put } = await import("@vercel/blob");
  let cursor: string | undefined;
  let total = 0, tagged = 0, cleaned = 0, skipped = 0;
  do {
    const page = await list({ prefix: "uploads/", cursor, limit: 1000 });
    for (const blob of page.blobs) {
      total += 1;
      const res = await fetch(blob.url);
      if (!res.ok) { console.log(`could not read: ${blob.pathname} (${res.status})`); continue; }
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!detectPhotoType(bytes)) { skipped += 1; continue; }
      if (!stillHasLocationTags(bytes)) continue;
      tagged += 1;
      const result = cleanPhoto(bytes);
      if (!result.ok) { console.log(`could not clean: ${blob.pathname} (${result.error})`); continue; }
      console.log(`${write ? "cleaning" : "would clean"}: ${blob.pathname}`);
      if (write) {
        const copy = path.join(backupDir, blob.pathname);
        await mkdir(path.dirname(copy), { recursive: true });
        await writeFile(copy, bytes);
        await put(blob.pathname, result.bytes, {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: result.mime,
        });
        cleaned += 1;
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  console.log(`${total} blobs, ${tagged} had location/camera tags, ${cleaned} cleaned, ${skipped} not photos${write ? "" : " (dry run)"}`);
})().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
