import { generateText, Output } from "ai";
import { z } from "zod";
import { crewVoiceForTrade, orangePhotoPrompt, photoPrompt } from "@/lib/ai-voice";
import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/upload-store";
import { applyPricingRates, estimateFromSitePhotos, type PhotoEstimateDraft } from "@/lib/photo-estimate";
import { describePricing, loadPricingRates } from "@/lib/price-memory";
import { shouldAutoFillEstimate } from "@/lib/photo-cache";
import { mergeTalkLines } from "@/lib/site-talk";
import { describeMarket, fetchMarketPricing, type MarketSnapshot } from "@/lib/market-pricing";
import { isPricedLine, type DocLineDraft } from "@/lib/documents";
import { aiConfigured } from "@/lib/ai-config";
import { rejectRemovedLogin } from "@/lib/live-session";
import { aiAllowed } from "@/lib/ai-consent";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  notes: z.string(),
  measurements: z.array(z.object({ label: z.string(), value: z.string() })),
  lines: z.array(
    z.object({
      kind: z.enum(["LABOR", "MATERIAL", "OTHER"]),
      description: z.string(),
      quantity: z.number(),
      unit: z.string(),
      rate: z.number(),
    })
  ),
});

export async function POST(request: Request) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const body = (await request.json().catch(() => ({}))) as {
    jobId?: string;
    photoIds?: string[];
    stage?: string;
    speech?: string;
  };
  const jobId = String(body.jobId || "");
  if (!jobId) return Response.json({ error: "Job is required." }, { status: 400 });

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { photos: { orderBy: { createdAt: "desc" } }, estimate: { include: { lines: { orderBy: { sortOrder: "asc" } } } } },
  });
  if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
  if (!shouldAutoFillEstimate(job.estimate?.status)) {
    return Response.json({ skipped: true, status: job.estimate?.status || "DRAFT" });
  }

  const wanted = new Set(body.photoIds || []);
  const photos = wanted.size
    ? job.photos.filter((photo) => wanted.has(photo.id))
    : job.photos;
  if (!photos.length) {
    return Response.json({ error: "Snap property photos before building the estimate." }, { status: 400 });
  }

  const orange = body.stage === "estimate";
  const memory = await loadPricingRates();
  const market: MarketSnapshot | null = orange ? await fetchMarketPricing(memory) : null;
  const rates = market?.rates || memory;
  const currentLines: DocLineDraft[] = (job.estimate?.lines || []).map((line) => ({
    kind: line.kind === "LABOR" || line.kind === "MATERIAL" ? line.kind : "OTHER",
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    rate: line.rate,
  }));
  const local = estimateFromSitePhotos(
    {
      jobName: job.name,
      client: job.client,
      address: job.address,
      notes: [job.notes, body.speech].filter(Boolean).join(" "),
      photoCount: photos.length,
    },
    rates
  );
  local.lines = mergeTalkLines(currentLines.filter(isPricedLine), local.lines.filter(isPricedLine));

  const briefing = {
    market: market
      ? {
          live: market.live,
          region: market.region,
          copy: describeMarket(market),
        }
      : null,
  };

  if (!aiAllowed(request.headers) || !aiConfigured()) {
    return Response.json({ ...local, ...briefing, status: job.estimate?.status || "DRAFT" });
  }

  try {
    const images = await Promise.all(
      photos.slice(0, 4).map(async (photo) => {
        const bytes = await readUpload(photo.url);
        if (!bytes) throw new Error(`Photo missing: ${photo.url}`);
        const mime = photo.url.endsWith(".png") ? "image/png" : "image/jpeg";
        return `data:${mime};base64,${bytes.toString("base64")}`;
      })
    );

    const shop = await prisma.appSettings.findUnique({ where: { id: "default" } });
    const prompt = orange
      ? orangePhotoPrompt(
          {
            code: job.code,
            name: job.name,
            client: job.client,
            address: job.address,
            notes: job.notes,
          },
          describeMarket(market!),
          String(body.speech || ""),
          shop?.industry
        )
      : photoPrompt(
          {
            code: job.code,
            name: job.name,
            client: job.client,
            address: job.address,
            notes: job.notes,
          },
          describePricing(rates),
          shop?.industry
        );

    const result = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({ schema }),
      system: crewVoiceForTrade(shop?.industry),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...images.map((image) => ({ type: "image" as const, image })),
          ],
        },
      ],
    });

    const output = result.output;
    const draft: PhotoEstimateDraft = {
      source: "ai",
      notes: output.notes || local.notes,
      measurements: output.measurements.length ? output.measurements : local.measurements,
      lines: mergeTalkLines(
        currentLines.filter(isPricedLine),
        applyPricingRates(output.lines.length ? output.lines : local.lines, rates).filter(isPricedLine)
      ),
    };
    return Response.json({ ...draft, ...briefing, status: job.estimate?.status || "DRAFT" });
  } catch {
    return Response.json({ ...local, ...briefing, status: job.estimate?.status || "DRAFT" });
  }
}
