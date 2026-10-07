import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getLiveSession } from "@/lib/live-session";
import { can } from "@/lib/access";
import { ingestSiteVoice } from "@/lib/site-voice-store";
import { aiAllowed } from "@/lib/ai-consent";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await getLiveSession();
  if (!can(session, "estimate")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const jobId = String(form.get("jobId") ?? "").trim();
  if (!jobId) return NextResponse.json({ error: "Job is required." }, { status: 400 });

  const transcript = String(form.get("transcript") ?? "").trim();
  const file = form.get("file");
  let audio: Uint8Array | undefined;
  let mime: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Keep the clip under 8 MB." }, { status: 400 });
    }
    audio = new Uint8Array(await file.arrayBuffer());
    mime = file.type || "audio/webm";
  }

  const draft = await ingestSiteVoice({
    jobId,
    actor: session?.name,
    transcript,
    audio,
    mime,
    ai: aiAllowed(request.headers),
  });
  revalidatePath("/");
  return NextResponse.json(draft);
}
