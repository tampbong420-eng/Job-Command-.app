import { parseTalk } from "@/lib/commands";
import type { ShopCommand, ShopSnapshot, TalkResult } from "@/lib/types";
import { generateText, Output } from "ai";
import { z } from "zod";

const commandSchema: z.ZodType<ShopCommand> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set_status"),
    query: z.string(),
    status: z.enum(["lead", "pending", "in_progress", "completed"]),
  }),
  z.object({
    type: z.literal("delete_job"),
    query: z.string(),
  }),
  z.object({
    type: z.literal("create_estimate"),
    query: z.string(),
    amount: z.number(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal("create_timecard"),
    employee: z.string(),
    hours: z.number(),
    query: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal("open"),
    view: z.enum(["command", "hours", "jobs", "estimates", "timecards"]),
  }),
  z.object({
    type: z.literal("assign"),
    query: z.string(),
    employee: z.string(),
  }),
  z.object({
    type: z.literal("create_job"),
    customerName: z.string(),
    address: z.string().optional(),
    jobTitle: z.string().optional(),
    phone: z.string().optional(),
    status: z.enum(["lead", "pending", "in_progress", "completed"]).optional(),
  }),
]);

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string; snapshot?: ShopSnapshot };
  const text = body.text?.trim() ?? "";
  const snapshot = body.snapshot;
  if (!text || !snapshot) {
    return Response.json({ say: "Need a command.", commands: [] } satisfies TalkResult, {
      status: 400,
    });
  }

  const fallback = parseTalk(text, snapshot);
  const roster = snapshot.jobs
    .map((job) => `${job.customerName} | ${job.jobTitle} | ${job.status}`)
    .join("\n");
  const people = snapshot.crew.map((row) => row.name).join(", ");

  try {
    const { output } = await generateText({
      model: "openai/gpt-5.4-mini",
      output: Output.object({
        schema: z.object({
          say: z.string(),
          commands: z.array(commandSchema),
        }),
      }),
      prompt: `You run Job Command, a field-ops desk. Turn the boss's spoken request into commands that file work in the right place.

Customers:
${roster}

Crew: ${people}

Selected job: ${snapshot.selectedJobId ?? "none"}
Selected crew: ${snapshot.selectedCrewId ?? "none"}

Request: ${text}

Rules:
- New lead / pending / active / finished map to statuses lead, pending, in_progress, completed.
- Delete removes the customer card.
- Estimates and time cards must include the customer or crew name in query/employee.
- Prefer one or two commands. Keep say short.`,
    });
    if (output && output.commands.length > 0) {
      return Response.json(output satisfies TalkResult);
    }
  } catch {
    // Local parser still files status, estimates, and time cards without a key.
  }

  return Response.json(fallback);
}
