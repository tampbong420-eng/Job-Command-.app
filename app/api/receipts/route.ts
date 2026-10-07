import { NextRequest, NextResponse } from "next/server";
import { deleteUpload, saveUpload } from "@/lib/upload-store";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { officeOnlyApi } from "@/lib/office-guard";
import { cleanPhoto } from "@/lib/photo-clean";

export const runtime = "nodejs";

export async function GET() {
  // Office/boss only on the server (crew get 403 even by URL).
  const denied = await officeOnlyApi();
  if (denied) return denied;
  const receipts = await prisma.receipt.findMany({ orderBy: { takenAt: "desc" }, take: 80 });
  return NextResponse.json({
    receipts: receipts.map((receipt) => ({
      id: receipt.id,
      url: receipt.url,
      note: receipt.note,
      takenAt: receipt.takenAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  // Office/boss only on the server (crew get 403 even by URL).
  const denied = await officeOnlyApi();
  if (denied) return denied;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A photo is required." }, { status: 400 });
  }
  // Go-public: strip GPS/camera tags before storing; type from the bytes.
  const clean = cleanPhoto(Buffer.from(await file.arrayBuffer()));
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
  const filename = `receipt-${Date.now()}.${clean.ext}`;
  const url = await saveUpload(`receipts/${filename}`, clean.bytes, clean.mime);
  const receipt = await prisma.receipt.create({
    data: { url, note: "Receipt" },
  });
  revalidatePath("/");
  return NextResponse.json({
    id: receipt.id,
    url: receipt.url,
    note: receipt.note,
    takenAt: receipt.takenAt.toISOString(),
  });
}

export async function DELETE(request: NextRequest) {
  // Office/boss only on the server (crew get 403 even by URL).
  const denied = await officeOnlyApi();
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Receipt id required." }, { status: 400 });
  const receipt = await prisma.receipt.findUnique({ where: { id } });
  if (!receipt) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  await prisma.receipt.delete({ where: { id } });
  await deleteUpload(receipt.url);
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
