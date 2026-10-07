/**
 * One-off (go-public): strip GPS / camera / XMP tags from photos ALREADY stored under public/uploads.
 * New uploads are cleaned on the way in (lib/photo-clean.ts). Safe to run more than once.
 *
 *   npx tsx scripts/clean-photo-metadata.ts            # dry run: lists what would change
 *   npx tsx scripts/clean-photo-metadata.ts --write    # cleans in place; originals copied to --backup dir first
 *   npx tsx scripts/clean-photo-metadata.ts --write --backup /workspace/backups/uploads-before-clean
 *
 * Vercel Blob: the deploy build that stores photos in Blob needs the same pass on the Blob store (list → get →
 * cleanPhoto → put the same pathname with allowOverwrite). The bytes logic is identical: import cleanPhoto.
 */
import { readdir, readFile, writeFile, mkdir, copyFile } from "fs/promises";
import path from "path";
import { cleanPhoto, detectPhotoType, stillHasLocationTags } from "../lib/photo-clean";

const args = process.argv.slice(2);
const write = args.includes("--write");
const backupAt = args.indexOf("--backup");
const backupDir = backupAt >= 0 ? args[backupAt + 1] : path.join(process.cwd(), "..", "backups", `uploads-before-clean-${Date.now()}`);
const root = path.join(process.cwd(), "public", "uploads");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

(async () => {
  const files = await walk(root);
  let tagged = 0;
  let cleaned = 0;
  let skipped = 0;
  for (const file of files) {
    const bytes = await readFile(file);
    if (!detectPhotoType(bytes)) {
      skipped += 1;
      continue;
    }
    if (!stillHasLocationTags(bytes)) continue;
    tagged += 1;
    const result = cleanPhoto(bytes);
    if (!result.ok) {
      console.log(`could not clean: ${path.relative(root, file)} (${result.error})`);
      continue;
    }
    console.log(`${write ? "cleaned" : "would clean"}: ${path.relative(root, file)}`);
    if (write) {
      const copy = path.join(backupDir, path.relative(root, file));
      await mkdir(path.dirname(copy), { recursive: true });
      await copyFile(file, copy);
      await writeFile(file, result.bytes);
      cleaned += 1;
    }
  }
  console.log(`${files.length} files, ${tagged} had location/camera tags, ${cleaned} cleaned, ${skipped} not photos${write ? `, originals in ${backupDir}` : " (dry run)"}`);
})();
