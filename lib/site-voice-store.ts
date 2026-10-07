import "server-only";

import { generateText, Output, transcribe } from "ai";
import { z } from "zod";
import { crewTextInput, siteTalkTask } from "@/lib/ai-voice";
import { shopIndustry } from "@/lib/shop-trade";
import { prisma } from "@/lib/prisma";
import { associateJobClient } from "@/lib/client-store";
import { DEFAULT_ESTIMATE_TERMS, type DocLineDraft } from "@/lib/documents";
import {
  mergeNotes,
  mergeTalkLines,
  parseSiteTalk,
  type SiteTalkDraft,
} from "@/lib/site-talk";
import { aiConfigured } from "@/lib/ai-config";

const schema = z.object({
  notes: z.string(),
  measurements: z.array(z.object({ label: z.string(), value: z.string() })),
  requests: z.array(z.string()),
  lines: z.array(
    z.object({
      kind: z.enum(["LABOR", "MATERIAL", "OTHER"]),
      description: z.string(),
      quantity: z.number(),
      rate: z.number(),
      unit: z.string(),
    })
  ),
});

async function speechToText(audio: Uint8Array, ai: boolean) {
  if (!ai) return "";
  if (!aiConfigured()) return "";
  try {
    const result = await transcribe({
      model: "openai/whisper-1",
      audio,
    });
    return result.text.trim();
  } catch {
    return "";
  }
}

async function enrichTalk(local: SiteTalkDraft, ai: boolean) {
  if (!ai) return local;
  if (!aiConfigured()) return local;
  try {
    const industry = await shopIndustry();
    const result = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({ schema }),
      ...crewTextInput(siteTalkTask(industry), local.transcript, industry),
    });
    const output = result.output;
    return {
      transcript: local.transcript,
      notes: output.notes || local.notes,
      measurements: output.measurements.length ? output.measurements : local.measurements,
      requests: output.requests.length ? output.requests : local.requests,
      lines: output.lines.length ? (output.lines as DocLineDraft[]) : local.lines,
    } satisfies SiteTalkDraft;
  } catch {
    return local;
  }
}

async function persistDraft(jobId: string, draft: SiteTalkDraft) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { estimate: { include: { lines: true } } },
  });
  if (!job) return draft;
  const notes = mergeNotes(job.notes, draft.notes);
  await prisma.job.update({ where: { id: job.id }, data: { notes } });

  if (draft.lines.length) {
    const existing = job.estimate;
    const currentLines: DocLineDraft[] = (existing?.lines || []).map((line) => ({
      kind: line.kind === "LABOR" || line.kind === "MATERIAL" ? line.kind : "OTHER",
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
    }));
    const lines = mergeTalkLines(currentLines, draft.lines);
    const estimateNotes = mergeNotes(existing?.notes || "", draft.notes);
    const estimate = existing
      ? await prisma.estimate.update({
          where: { id: existing.id },
          data: { notes: estimateNotes, customerId: existing.customerId || job.customerId },
        })
      : await prisma.estimate.create({
          data: {
            number: `EST-${1001 + (await prisma.estimate.count())}`,
            jobId: job.id,
            customerId: job.customerId,
            notes: estimateNotes,
            terms: DEFAULT_ESTIMATE_TERMS,
          },
        });
    await prisma.docLine.deleteMany({ where: { estimateId: estimate.id } });
    if (lines.length) {
      await prisma.docLine.createMany({
        data: lines.map((line, index) => ({
          estimateId: estimate.id,
          kind: line.kind,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          rate: line.rate,
          sortOrder: index,
        })),
      });
    }
  }

  await associateJobClient(jobId);
  return { ...draft, notes };
}

export async function ingestSiteVoice(input: {
  jobId: string;
  actor?: string;
  transcript?: string;
  audio?: Uint8Array;
  mime?: string;
  /** The person said yes to AI on this phone (aiAllowed). Off → Whisper and the model are skipped. */
  ai?: boolean;
}): Promise<SiteTalkDraft> {
  const ai = input.ai === true;
  const spoken = input.transcript?.trim() || (input.audio?.length ? await speechToText(input.audio, ai) : "");
  if (!spoken) return parseSiteTalk("");
  const draft = await enrichTalk(parseSiteTalk(spoken), ai);
  return persistDraft(input.jobId, draft);
}
