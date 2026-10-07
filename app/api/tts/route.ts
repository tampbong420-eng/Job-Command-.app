import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** ElevenLabs voices: Adam (male), Rachel (female). */
const VOICES = {
  male: "pNInz6obpgDQGcFmaJgB",
  female: "21m00Tcm4TlvDq8ikWAM",
} as const;

/**
 * Text-to-speech via ElevenLabs (Eric, 2026-10-04).
 * Replaces the robotic browser speechSynthesis with a real human voice.
 */
export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "TTS not configured" }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    gender?: "male" | "female";
  };
  const text = String(body.text || "").trim().slice(0, 1000);
  if (!text) return NextResponse.json({ ok: false, error: "No text" }, { status: 400 });

  const voiceId = VOICES[body.gender === "female" ? "female" : "male"];

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `TTS failed: ${res.status} ${err.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "Unknown" },
      { status: 500 }
    );
  }
}
