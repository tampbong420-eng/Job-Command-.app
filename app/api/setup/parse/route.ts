import { generateText, Output } from "ai";
import { z } from "zod";
import { setupInput } from "@/lib/ai-voice";
import {
  parseAccountingTalk,
  parseAccountTalk,
  parseBrandTalk,
  parsePayrollTalk,
  parsePeopleTalk,
  parsePhone,
  parseSizeTalk,
  type SetupDraft,
} from "@/lib/setup-parse";
import { parsePayTalk } from "@/lib/pay-prefs";
import { todayString } from "@/lib/dates";
import { aiConfigured } from "@/lib/ai-config";
import { aiAllowed } from "@/lib/ai-consent";

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string; step?: string };
  const text = String(body.text ?? "").trim();
  const step = String(body.step ?? "payroll");
  if (!text) return Response.json({});

  const local = parseStep(step, text);
  if (!aiAllowed(request.headers) || !aiConfigured()) {
    return Response.json(local);
  }

  try {
    const result = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({
        schema: z.object({
          firstName: z.string().nullable(),
          lastName: z.string().nullable(),
          email: z.string().nullable(),
          phone: z.string().nullable(),
          businessName: z.string().nullable(),
          address: z.string().nullable(),
          industry: z.string().nullable(),
          size: z.string().nullable(),
          accounting: z.enum(["QUICKBOOKS", "XERO", "OTHER", "NONE"]).nullable(),
          frequency: z.enum(["WEEKLY", "BIWEEKLY"]).nullable(),
          startWeekday: z.number().int().min(0).max(6).nullable(),
          periodStart: z.string().nullable(),
          people: z
            .array(
              z.object({
                firstName: z.string(),
                lastName: z.string(),
                phone: z.string().nullable(),
                jobTitle: z.string().nullable(),
                hourlyRate: z.number().nullable(),
              })
            )
            .nullable(),
        }),
      }),
      ...setupInput(step, text),
    });
    return Response.json({ ...local, ...stripNull(result.output) });
  } catch {
    return Response.json(local);
  }
}

function parseStep(step: string, text: string) {
  if (step === "account") return parseAccountTalk(text);
  if (step === "size" || step === "business" || step === "trade") return parseSizeTalk(text);
  if (step === "brand") return parseBrandTalk(text);
  if (step === "accounting") return { accounting: parseAccountingTalk(text) };
  if (step === "payroll") return parsePayrollTalk(text, todayString());
  if (step === "bosses" || step === "crew") return { people: parsePeopleTalk(text) };
  if (step === "phones") return { phone: parsePhone(text) };
  if (step === "payprefs") return parsePayTalk(text);
  if (step === "look") {
    const lower = text.toLowerCase();
    // Three choices: Auto, Lime Industrial ("ink"), Light.
    if (lower.includes("auto") || lower.includes("both") || lower.includes("switch")) return { shellTheme: "auto" };
    if (lower.includes("white") || lower.includes("light") || lower.includes("day")) return { shellTheme: "light" };
    if (
      lower.includes("lime") ||
      lower.includes("industrial") ||
      lower.includes("ink") ||
      lower.includes("dark") ||
      lower.includes("night") ||
      lower.includes("black")
    ) {
      return { shellTheme: "ink" };
    }
  }
  return {} as SetupDraft;
}

function stripNull(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => item != null)
  );
}
