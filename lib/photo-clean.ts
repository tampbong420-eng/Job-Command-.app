// Server only, no dependencies. Go-public: strip location (EXIF GPS) and every other camera/XMP/IPTC tag from
// uploaded photos BEFORE they are stored, so public photo URLs never give away where a customer's house is.
// The type is read from the file's own bytes (not the name or the browser's MIME), and the stored extension
// comes from that type, so a ".html" or SVG can never be uploaded as a "photo".
//  - JPEG: drops APP1 (EXIF/XMP), APP2 MPF, APP3–APP13, APP15 and comments, and anything after the end of the
//    image (extra MPF images carry their own EXIF). Keeps JFIF, ICC color and Adobe. Orientation is kept as a
//    one-tag EXIF block so photos stay the right way up.
//  - PNG: drops eXIf, tEXt, zTXt, iTXt, tIME. - WebP: drops EXIF and XMP chunks and clears their VP8X flags.
//  - GIF: kept as is (no EXIF). - HEIC, SVG and anything else: refused (can't be cleaned safely).

export type CleanPhoto = { ok: true; bytes: Buffer; ext: "jpg" | "png" | "webp" | "gif"; mime: string } | { ok: false; error: string };

export const PHOTO_TYPE_ERROR = "Upload a JPEG, PNG, WebP, or GIF photo.";

export function detectPhotoType(bytes: Buffer): "jpg" | "png" | "webp" | "gif" | "" {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length > 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (bytes.length > 6 && /^GIF8[79]a$/.test(bytes.toString("latin1", 0, 6))) return "gif";
  return "";
}

export function cleanPhoto(input: Buffer | Uint8Array): CleanPhoto {
  const bytes = Buffer.from(input);
  const type = detectPhotoType(bytes);
  try {
    if (type === "jpg") return { ok: true, bytes: cleanJpeg(bytes), ext: "jpg", mime: "image/jpeg" };
    if (type === "png") return { ok: true, bytes: cleanPng(bytes), ext: "png", mime: "image/png" };
    if (type === "webp") return { ok: true, bytes: cleanWebp(bytes), ext: "webp", mime: "image/webp" };
    if (type === "gif") return { ok: true, bytes, ext: "gif", mime: "image/gif" };
  } catch {
    return { ok: false, error: "That photo looks damaged. Try taking it again." };
  }
  return { ok: false, error: PHOTO_TYPE_ERROR };
}

/* ---------------- JPEG ---------------- */

function readOrientation(app1: Buffer): number {
  // app1 = segment payload after the 2-byte length: "Exif\0\0" + TIFF
  if (app1.toString("latin1", 0, 6) !== "Exif\0\0") return 1;
  const tiff = app1.subarray(6);
  const little = tiff.toString("latin1", 0, 2) === "II";
  const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at: number) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  const ifd = u32(4);
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function orientationSegment(orientation: number) {
  // Big-endian TIFF with one IFD0 entry: Orientation (0x0112, SHORT, 1).
  const tiff = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

export function cleanJpeg(bytes: Buffer): Buffer {
  const out: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let orientation = 1;
  let insertAt = 1; // after SOI (and after APP0 if present)
  let pos = 2;
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) throw new Error("bad marker");
    let marker = bytes[pos + 1];
    while (marker === 0xff) {
      pos += 1;
      marker = bytes[pos + 1];
    }
    if (marker === 0xd9) {
      out.push(Buffer.from([0xff, 0xd9]));
      break; // drop anything after the end of the image
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(bytes.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    const length = bytes.readUInt16BE(pos + 2);
    if (length < 2 || pos + 2 + length > bytes.length) throw new Error("bad length");
    const segment = bytes.subarray(pos, pos + 2 + length);
    const payload = bytes.subarray(pos + 4, pos + 2 + length);
    if (marker === 0xda) {
      // Start of scan: copy the header, then the entropy-coded data up to the next real marker.
      out.push(segment);
      let scan = pos + 2 + length;
      while (scan < bytes.length) {
        if (bytes[scan] === 0xff) {
          const next = bytes[scan + 1];
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7) && next !== 0xff) break;
        }
        scan += 1;
      }
      out.push(bytes.subarray(pos + 2 + length, scan));
      pos = scan;
      continue;
    }
    const drop =
      marker === 0xe1 || // EXIF / XMP (GPS lives here)
      (marker === 0xe2 && payload.toString("latin1", 0, 4) === "MPF\0") ||
      (marker >= 0xe3 && marker <= 0xed) || // APP3–APP13 (incl. Photoshop/IPTC)
      marker === 0xef ||
      marker === 0xfe; // comments
    if (marker === 0xe1 && orientation === 1) {
      try {
        orientation = readOrientation(payload);
      } catch {
        orientation = 1;
      }
    }
    if (!drop) {
      out.push(segment);
      if (marker === 0xe0 && out.length === 2) insertAt = 2;
    }
    pos += 2 + length;
  }
  if (orientation !== 1) out.splice(insertAt, 0, orientationSegment(orientation));
  return Buffer.concat(out);
}

/* ---------------- PNG ---------------- */

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

export function cleanPng(bytes: Buffer): Buffer {
  const out: Buffer[] = [bytes.subarray(0, 8)];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString("latin1", pos + 4, pos + 8);
    const end = pos + 12 + length;
    if (end > bytes.length) throw new Error("bad chunk");
    if (!PNG_DROP.has(type)) out.push(bytes.subarray(pos, end));
    pos = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(out);
}

/* ---------------- WebP ---------------- */

export function cleanWebp(bytes: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const fourcc = bytes.toString("latin1", pos, pos + 4);
    const size = bytes.readUInt32LE(pos + 4);
    const end = pos + 8 + size + (size % 2);
    if (pos + 8 + size > bytes.length) throw new Error("bad chunk");
    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const chunk = Buffer.from(bytes.subarray(pos, Math.min(end, bytes.length)));
      if (fourcc === "VP8X") chunk[8] &= ~(0x08 | 0x04); // clear EXIF + XMP flags
      chunks.push(chunk);
    }
    pos = end;
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(4 + body.length, 4);
  head.write("WEBP", 8, "latin1");
  return Buffer.concat([head, body]);
}

/** True if the bytes still hold EXIF/XMP/GPS markers (used by tests and the cleanup script's check). */
export function stillHasLocationTags(bytes: Buffer): boolean {
  const type = detectPhotoType(bytes);
  if (type === "jpg") {
    let pos = 2;
    while (pos + 4 <= bytes.length && bytes[pos] === 0xff) {
      const marker = bytes[pos + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = bytes.readUInt16BE(pos + 2);
      const payload = bytes.subarray(pos + 4, pos + 2 + length);
      if (marker === 0xe1) {
        if (payload.toString("latin1", 0, 6) !== "Exif\0\0") return true; // XMP
        if (payload.length > 6 + 26) return true; // more than the one Orientation tag
        if (payload.includes(Buffer.from([0x88, 0x25])) || payload.includes(Buffer.from([0x25, 0x88]))) return true; // GPS IFD pointer
      }
      if (marker >= 0xe3 && marker <= 0xed) return true;
      pos += 2 + length;
    }
    return false;
  }
  if (type === "png") return ["eXIf", "tEXt", "zTXt", "iTXt"].some((tag) => bytes.includes(Buffer.from(tag, "latin1")));
  if (type === "webp") return bytes.includes(Buffer.from("EXIF", "latin1")) || bytes.includes(Buffer.from("XMP ", "latin1"));
  return false;
}
