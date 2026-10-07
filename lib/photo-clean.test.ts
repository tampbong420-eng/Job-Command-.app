import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanPhoto, detectPhotoType, stillHasLocationTags, PHOTO_TYPE_ERROR } from "./photo-clean";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/photo-gps/${name}`, import.meta.url));
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
// Fixtures were made with Pillow: GPS 34°30'12.5"N 93°03'18.25"W, Make/Model, Orientation 6, XMP with GPS,
// and a comment with a street address. Checked separately with exifr + Pillow: cleaned files have no GPS
// and decode to the identical pixels.
const GPS_TEXT = ["GPSLatitude", "123 Main St", "iPhone 15", "Apple"];

function scanData(jpeg: Buffer) {
  const sos = jpeg.indexOf(Buffer.from([0xff, 0xda]));
  return jpeg.subarray(sos, jpeg.lastIndexOf(Buffer.from([0xff, 0xd9])) + 2);
}

test("JPEG: GPS, camera, XMP and comments gone; orientation kept; image data untouched", () => {
  for (const name of ["gps.jpg", "gps-progressive.jpg"]) {
    const raw = fixture(name);
    assert.ok(stillHasLocationTags(raw), name);
    const out = cleanPhoto(raw);
    assert.ok(out.ok, name);
    if (!out.ok) continue;
    assert.equal(out.ext, "jpg");
    assert.equal(stillHasLocationTags(out.bytes), false, name);
    for (const text of GPS_TEXT) assert.equal(out.bytes.includes(Buffer.from(text, "latin1")), false, `${name}: ${text}`);
    assert.equal(out.bytes.includes(Buffer.from([0x88, 0x25])), false, `${name}: GPS IFD pointer`);
    // One-tag EXIF with Orientation = 6 so the photo stays upright.
    assert.ok(out.bytes.includes(Buffer.from([0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06])), name);
    assert.ok(raw.includes(scanData(out.bytes).subarray(0, 64)), `${name}: scan data copied as-is`);
    assert.deepEqual([...out.bytes.subarray(-2)], [0xff, 0xd9]);
    // Idempotent.
    const again = cleanPhoto(out.bytes);
    assert.ok(again.ok && again.bytes.equals(out.bytes), name);
  }
  // Anything after the end of the image (MPF extra images with their own EXIF) is dropped.
  const prog = cleanPhoto(fixture("gps-progressive.jpg"));
  assert.ok(prog.ok && !prog.bytes.includes(Buffer.from("GPSJUNK", "latin1")));
});

test("PNG + WebP: eXIf / text / XMP chunks gone, image chunks kept", () => {
  const png = cleanPhoto(fixture("gps.png"));
  assert.ok(png.ok && png.ext === "png");
  if (png.ok) {
    assert.equal(stillHasLocationTags(png.bytes), false);
    assert.ok(png.bytes.includes(Buffer.from("IDAT", "latin1")) && png.bytes.includes(Buffer.from("IEND", "latin1")));
    for (const text of GPS_TEXT) assert.equal(png.bytes.includes(Buffer.from(text, "latin1")), false, text);
  }
  const webp = cleanPhoto(fixture("gps.webp"));
  assert.ok(webp.ok && webp.ext === "webp");
  if (webp.ok) {
    assert.equal(stillHasLocationTags(webp.bytes), false);
    assert.equal(webp.bytes.readUInt32LE(4), webp.bytes.length - 8); // RIFF size fixed
    assert.ok(webp.bytes.includes(Buffer.from("VP8", "latin1")));
    const vp8x = webp.bytes.indexOf(Buffer.from("VP8X", "latin1"));
    if (vp8x >= 0) assert.equal(webp.bytes[vp8x + 8] & 0x0c, 0);
  }
});

test("type comes from the bytes: SVG, HTML, HEIC and junk are refused whatever the name says", () => {
  assert.equal(detectPhotoType(Buffer.from("<svg onload=alert(1)>")), "");
  for (const bad of [Buffer.from("<html><script>alert(1)</script>"), Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), Buffer.from("\0\0\0\x18ftypheic\0\0\0\0"), Buffer.alloc(0)]) {
    const out = cleanPhoto(bad);
    assert.equal(out.ok, false);
    assert.equal(!out.ok && out.error, PHOTO_TYPE_ERROR);
  }
  const broken = cleanPhoto(fixture("gps.jpg").subarray(0, 40));
  assert.equal(broken.ok, false);
});

test("every upload route cleans before storing and names the file from the real type", () => {
  for (const rel of ["app/api/upload/route.ts", "app/api/jobs/photos/route.ts", "app/api/receipts/route.ts", "app/api/upload/logo/route.ts"]) {
    const src = read(rel);
    assert.match(src, /cleanPhoto\(Buffer\.from\(await file\.arrayBuffer\(\)\)\)/, rel);
    // deploy/vercel-pg: stored through lib/upload-store (Vercel Blob or public/uploads), always the cleaned bytes.
    assert.match(src, /saveUpload\([^)]*clean\.bytes, clean\.mime\)/, rel);
    assert.match(src, /\$\{clean\.ext\}/, rel);
    assert.doesNotMatch(src, /file\.name\.split/, rel);
  }
  const logo = read("app/api/upload/logo/route.ts");
  assert.match(logo, /setupOrOfficeApi\(\)/);
  assert.doesNotMatch(logo, /image\/svg/);
  assert.doesNotMatch(read("components/signup/OfficialSheet.tsx"), /image\/svg/);
  assert.match(read("lib/office-guard.ts"), /export async function setupOrOfficeApi/);
  assert.match(read("scripts/clean-photo-metadata.ts"), /--write/);
});
