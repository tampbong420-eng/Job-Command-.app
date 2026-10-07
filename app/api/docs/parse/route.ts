import { generateText, Output } from "ai";
import { z } from "zod";
import { crewTextInput, docsTalkTask } from "@/lib/ai-voice";
import { shopIndustry } from "@/lib/shop-trade";
import { parseDocumentTalk } from "@/lib/document-parse";
import { applyPricingRates } from "@/lib/photo-estimate";
import { loadPricingRates } from "@/lib/price-memory";
import { describeMarket, fetchMarketPricing } from "@/lib/market-pricing";
import { aiConfigured } from "@/lib/ai-config";
import { rejectRemovedLogin } from "@/lib/live-session";
import { aiAllowed } from "@/lib/ai-consent";

export async function POST(request: Request) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const body = (await request.json()) as { text?: string; stage?: string };
  const text = String(body.text ?? "").trim();
  if (!text) return Response.json({ lines: [] });

  const local = parseDocumentTalk(text);
  const orange = body.stage === "estimate";
  const memory = orange ? await loadPricingRates() : null;
  const market = orange && memory ? await fetchMarketPricing(memory) : null;
  const priced = market ? { ...local, lines: applyPricingRates(local.lines, market.rates) } : local;

  if (!aiAllowed(request.headers) || !aiConfigured()) {
    return Response.json({
      ...priced,
      market: market ? { copy: describeMarket(market), live: market.live } : null,
    });
  }

  try {
    const marketNote = market ? `\n\nHot Springs market check: ${describeMarket(market)}` : "";
    const industry = await shopIndustry();
    const result = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({
        schema: z.object({
          notes: z.string().nullable(),
          lines: z.array(
            z.object({
              kind: z.enum(["LABOR", "MATERIAL", "OTHER"]),
              description: z.string(),
              quantity: z.number(),
              unit: z.string(),
              rate: z.number(),
            })
          ),
        }),
      }),
      ...crewTextInput(`${docsTalkTask(industry)}${marketNote}`, text, industry),
    });
    const output = result.output;
    const lines = output.lines.length ? output.lines : priced.lines;
    return Response.json({
      notes: output.notes || priced.notes,
      lines: market ? applyPricingRates(lines, market.rates) : lines,
      market: market ? { copy: describeMarket(market), live: market.live } : null,
    });
  } catch {
    return Response.json({
      ...priced,
      market: market ? { copy: describeMarket(market), live: market.live } : null,
    });
  }
}
