import { NextRequest, NextResponse } from "next/server";
import { saveUpload } from "@/lib/upload-store";
import { updatePhoto } from "@/app/actions";
import { rejectRemovedLogin } from "@/lib/live-session";
import { cleanPhoto } from "@/lib/photo-clean";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const form = await request.formData();
  const employeeId = String(form.get("employeeId") ?? "");
  const actor = String(form.get("actor") ?? "Office");
  const file = form.get("file");
  if (!employeeId || !(file instanceof File)) {
    return NextResponse.json({ error: "Photo file and employee are required." }, { status: 400 });
  }

  // Go-public: type from the file's bytes (no SVG: it can carry script), location/camera tags stripped.
  const clean = cleanPhoto(Buffer.from(await file.arrayBuffer()));
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
  const safeId = employeeId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "photo";
  const filename = `${safeId}-${Date.now()}.${clean.ext}`;
  const photoUrl = await saveUpload(filename, clean.bytes, clean.mime);
  await updatePhoto(employeeId, photoUrl, actor);
  return NextResponse.json({ photoUrl });
}
