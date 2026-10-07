import { NextRequest, NextResponse } from "next/server";
import { deleteUpload, saveUpload } from "@/lib/upload-store";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { associateJobClient } from "@/lib/client-store";
import { rejectRemovedLogin } from "@/lib/live-session";
import { cleanPhoto } from "@/lib/photo-clean";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const form = await request.formData();
  const jobId = String(form.get("jobId") ?? "");
  const caption = String(form.get("caption") ?? "").trim();
  const file = form.get("file");
  // Smart Job Photos metadata (Phase 1)
  const latitude = form.get("latitude") ? parseFloat(String(form.get("latitude"))) : null;
  const longitude = form.get("longitude") ? parseFloat(String(form.get("longitude"))) : null;
  const takenBy = String(form.get("takenBy") ?? "").trim() || null;
  const category = String(form.get("category") ?? "").trim() || null;
  if (!jobId || !(file instanceof File)) {
    return NextResponse.json({ error: "Job and photo are required." }, { status: 400 });
  }
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  // Go-public: strip GPS/camera tags before storing (public URL must not reveal the house's location).
  // GPS coords are stored separately in the database (latitude/longitude fields), not in the image EXIF.
  const clean = cleanPhoto(Buffer.from(await file.arrayBuffer()));
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
  const filename = `${jobId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40)}-${Date.now()}.${clean.ext}`;
  const url = await saveUpload(`jobs/${filename}`, clean.bytes, clean.mime);
  const photo = await prisma.jobPhoto.create({
    data: {
      jobId,
      url,
      caption,
      latitude: latitude && !isNaN(latitude) ? latitude : null,
      longitude: longitude && !isNaN(longitude) ? longitude : null,
      takenBy,
      category,
    },
  });
  await associateJobClient(jobId);
  revalidatePath("/");
  return NextResponse.json({
    id: photo.id,
    url: photo.url,
    caption: photo.caption,
    createdAt: photo.createdAt.toISOString(),
    latitude: photo.latitude,
    longitude: photo.longitude,
    takenBy: photo.takenBy,
    category: photo.category,
  });
}

export async function DELETE(request: NextRequest) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Photo id required." }, { status: 400 });
  const photo = await prisma.jobPhoto.findUnique({ where: { id } });
  if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  await prisma.jobPhoto.delete({ where: { id } });
  await deleteUpload(photo.url);
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
