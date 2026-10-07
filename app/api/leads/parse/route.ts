import { generateText, Output } from "ai";
import { z } from "zod";
import { leadInput } from "@/lib/ai-voice";
import { shopIndustry } from "@/lib/shop-trade";
import { parseLeadTalk } from "@/lib/lead-parse";
import { aiConfigured } from "@/lib/ai-config";
import { rejectRemovedLogin } from "@/lib/live-session";
import { aiAllowed } from "@/lib/ai-consent";

const schema = z.object({
  clientName: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  scopeOfWork: z.string().nullable(),
  preferredTimeline: z.string().nullable(),
});

export async function POST(request: Request) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const body = (await request.json()) as { text?: string };
  const text = String(body.text ?? "").trim();
  if (!text) return Response.json(parseLeadTalk(""));

  const local = parseLeadTalk(text);
  if (!aiAllowed(request.headers) || !aiConfigured()) {
    return Response.json(local);
  }

  try {
    const result = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({ schema }),
      ...leadInput(text, await shopIndustry()),
    });
    const output = result.output;
    return Response.json({
      clientName: output.clientName || local.clientName,
      phone: output.phone || local.phone,
      address: output.address || local.address,
      scopeOfWork: output.scopeOfWork || local.scopeOfWork,
      preferredTimeline: output.preferredTimeline || local.preferredTimeline,
    });
  } catch {
    return Response.json(local);
  }
}
