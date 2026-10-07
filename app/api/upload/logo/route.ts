import { NextRequest, NextResponse } from "next/server";
import { saveUpload } from "@/lib/upload-store";
import { cleanPhoto } from "@/lib/photo-clean";
import { setupOrOfficeApi } from "@/lib/office-guard";

export const runtime = "nodejs";

/**
 * Company logo (signup "Make it look official" + Office). Go-public: only the office or an owner in first-run
 * setup may upload; the type comes from the file's bytes (JPEG/PNG/WebP/GIF — no SVG, it can carry script);
 * the stored name ends in that type, and camera/location tags are stripped.
 */
export async function POST(request: NextRequest) {
  const denied = await setupOrOfficeApi();
  if (denied) return denied;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Logo file required." }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "That logo is too big. Use one under 8 MB." }, { status: 400 });
  const clean = cleanPhoto(Buffer.from(await file.arrayBuffer()));
  if (!clean.ok) return NextResponse.json({ error: "Upload a JPEG, PNG, or WebP logo." }, { status: 400 });
  const filename = `logo-${Date.now()}.${clean.ext}`;
  const logoUrl = await saveUpload(filename, clean.bytes, clean.mime);
  return NextResponse.json({ logoUrl });
}
