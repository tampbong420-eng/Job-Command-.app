/**
 * AI call answering — local simulator. Replays one sample call the way Retell would send it and proves the
 * whole path: inbound webhook → call_started → check_availability → book_estimate → a second caller trying
 * the same slot (refused) → call_ended (minutes + push alert) → call_analyzed (summary) → a retried
 * call_ended (no double count) → a forged request (401). Every request is signed with Retell's own SDK
 * (`sign`) and verified by our routes with the SDK's `verify`, exactly like production.
 *
 * Never touches the live shop DB unless you pass --db with that path on purpose.
 *
 *   npm run answering:sim                      # fresh throwaway DB (prisma db push into /tmp), seeded shop
 *   npm run answering:sim -- --copy prisma/dev.db   # throwaway COPY of a DB (real crew + schedule)
 *   npm run answering:sim -- --db /abs/path.db      # write into that DB (screenshots sandbox)
 *   npm run answering:sim -- --url http://127.0.0.1:43123 --key <RETELL_API_KEY on that server>
 *   add --cap-hit to start the month over the 200-minute cap (message-only call), --json for machine output.
 *
 * Run with: node --conditions=react-server --import tsx scripts/answering-simulate.ts
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type Json = Record<string, unknown>;

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const root = path.join(__dirname, "..");
const JSON_OUT = flag("--json");
const log = (...parts: unknown[]) => {
  if (!JSON_OUT) console.log(...parts);
};

function prepareDb(): { url: string; label: string } {
  const db = opt("--db");
  if (db) return { url: `file:${path.resolve(db)}`, label: `DB ${path.resolve(db)} (written on purpose)` };
  const dir = mkdtempSync(path.join(tmpdir(), "jc-answer-sim-"));
  const file = path.join(dir, "sim.db");
  const copy = opt("--copy");
  if (copy) {
    const src = path.resolve(copy);
    if (!existsSync(src)) throw new Error(`--copy ${src} not found`);
    copyFileSync(src, file);
    const sql = spawnSync("npx", ["prisma", "db", "execute", "--file", "prisma/answering-tables.sql", "--schema", "prisma/schema.prisma"], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: `file:${file}` },
      encoding: "utf8",
    });
    if (sql.status !== 0) throw new Error(`could not add answering tables to the copy: ${sql.stderr || sql.stdout}`);
    return { url: `file:${file}`, label: `throwaway copy of ${src} → ${file}` };
  }
  const push = spawnSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: `file:${file}` },
    encoding: "utf8",
  });
  if (push.status !== 0) throw new Error(`prisma db push failed: ${(push.stderr || push.stdout).slice(0, 400)}`);
  return { url: `file:${file}`, label: `fresh throwaway DB ${file}` };
}

async function main() {
  const remote = opt("--url");
  const key = opt("--key") || process.env.RETELL_API_KEY || "sim_local_retell_key_not_real";
  const now = new Date();
  const result: Json = { ok: false, steps: [] as Json[] };
  const steps = result.steps as Json[];
  const check = (name: string, ok: boolean, detail: unknown = "") => {
    steps.push({ name, ok, detail });
    log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
    if (!ok) throw new Error(`step failed: ${name}`);
  };

  const { sign } = await import("retell-sdk");
  let db: { label: string; url: string } | null = null;
  if (!remote) {
    db = prepareDb();
    process.env.DATABASE_URL = db.url;
    process.env.RETELL_API_KEY = key; // in-process server code verifies with this key
    log(`Database: ${db.label}`);
  } else {
    log(`Server: ${remote} (its RETELL_API_KEY must equal --key)`);
  }

  const { prisma } = await import("@/lib/prisma");
  const handlers = remote ? null : await import("@/lib/answering/handlers");

  // ---- shop setup on the throwaway DB: shop row, add-on on, an estimator, a job already on the schedule ----
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    await prisma.appSettings.create({
      data: { id: "default", periodAnchor: now, setupComplete: true, businessName: "Top Gun Painting", ownerFirstName: "Eric", ownerPhone: "501-555-0142", companyPhone: "501-555-0142", businessAddress: "Hot Springs, AR 71901", industry: "Painting", workDays: "MON_FRI", workStart: "07:00", workEnd: "17:00" },
    });
  }
  if (!remote) await prisma.appSettings.update({ where: { id: "default" }, data: { addonStatus: "active" } });
  let estimator = await prisma.employee.findFirst({ where: { employmentStatus: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!estimator) {
    estimator = await prisma.employee.create({ data: { firstName: "Sam", lastName: "Ellison", jobTitle: "Estimator", baselineStartDate: now } });
  }
  const shopRow = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const retellNumber = "+15015550199";
  await prisma.answeringSettings.upsert({ where: { shopId: "default" }, create: { shopId: "default", retellNumber, estimatorId: estimator.id }, update: { retellNumber, estimatorId: estimator.id, enabled: true } });

  const { shopClock, addDays, isWorkDay } = await import("@/lib/answering/slots");
  const { usageMonth } = await import("@/lib/answering/metering");
  const tz = "America/Chicago";
  let day = addDays(shopClock(now, tz).day, 1);
  while (!isWorkDay(day, shopRow?.workDays || "MON_FRI")) day = addDays(day, 1);
  // A job already on the estimator's schedule 7–11 AM that day: the AI must book around it (+ drive buffer).
  const blocker = await prisma.job.create({ data: { code: `SIM-${Date.now() % 100000}`, name: "Existing job (sim)", client: "Existing client" } });
  await prisma.timeEntry.create({ data: { employeeId: estimator.id, date: new Date(`${day}T00:00:00.000Z`), scheduledStart: "07:00", scheduledEnd: "11:00", scheduledHours: 4, jobId: blocker.id, kind: "JOB" } });

  const month = usageMonth(now, tz);
  if (flag("--cap-hit")) {
    await prisma.answeringUsage.upsert({ where: { shopId_month: { shopId: "default", month } }, create: { shopId: "default", month, seconds: 200 * 60, calls: 70 }, update: { seconds: 200 * 60 } });
  }
  const usageBefore = (await prisma.answeringUsage.findUnique({ where: { shopId_month: { shopId: "default", month } } }))?.seconds || 0;

  // ---- transport: in-process route handlers (default) or HTTP to a running server ----
  const send = async (pathName: string, body: Json, opts: { forge?: boolean } = {}) => {
    const raw = JSON.stringify(body);
    const signature = opts.forge ? await sign(raw, "wrong-key") : await sign(raw, key);
    const init = { method: "POST", headers: { "content-type": "application/json", "x-retell-signature": signature }, body: raw };
    let response: Response;
    if (remote) response = await fetch(`${remote.replace(/\/$/, "")}${pathName}`, init);
    else {
      const request = new Request(`http://sim.local${pathName}`, init);
      if (pathName === "/api/webhooks/retell/inbound") response = await handlers!.handleInbound(request, now);
      else if (pathName.startsWith("/api/webhooks/retell/tools/")) response = await handlers!.handleTool(request, pathName.split("/").pop()!, now);
      else response = await handlers!.handleCallEvent(request);
    }
    const text = await response.text();
    let json: Json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { text };
    }
    return { status: response.status, json };
  };

  const callId = `sim_${Date.now().toString(36)}`;
  const caller = "+15015550123";
  const startMs = now.getTime();
  const callObj = (extra: Json = {}) => ({ call_type: "phone_call", call_id: callId, agent_id: "agent_sim", from_number: caller, to_number: retellNumber, direction: "inbound", ...extra });

  // 1. inbound
  const inbound = await send("/api/webhooks/retell/inbound", { event: "call_inbound", event_timestamp: startMs, call_inbound: { call_id: callId, agent_id: "agent_sim", from_number: caller, to_number: retellNumber } });
  const ci = (inbound.json.call_inbound || {}) as Json;
  const vars = (ci.dynamic_variables || {}) as Json;
  const expectMode = flag("--cap-hit") ? "message" : "full";
  check("inbound webhook picks the call mode", inbound.status === 200 && vars.answer_mode === expectMode, `answer_mode=${vars.answer_mode}, shop_name=${vars.shop_name}`);
  const begin = ((ci.agent_override as Json)?.retell_llm as Json)?.begin_message;
  check("greeting carries the shop name variable", typeof begin === "string" && begin.includes("{{shop_name}}"), String(begin).slice(0, 80));

  // 2. call_started
  const started = await send("/api/webhooks/retell", { event: "call_started", call: callObj({ call_status: "ongoing", start_timestamp: startMs, retell_llm_dynamic_variables: vars }) });
  check("call_started accepted", started.status === 204);

  const turns = [
    { role: "agent", content: `Thanks for calling ${vars.shop_name}. This is the virtual assistant. I'm an AI, and this call is recorded so we get your details right. How can I help you today?` },
    { role: "user", content: "Hi, I need my house exterior painted. It's peeling pretty bad on the trim." },
    { role: "agent", content: "I can help with that. Can I get your name?" },
    { role: "user", content: "Linda Parker." },
    { role: "agent", content: "Thanks, Linda. Is this number, 501-555-0123, the best one to reach you?" },
    { role: "user", content: "Yes." },
    { role: "agent", content: "And the address for the job?" },
    { role: "user", content: "412 Whittington Avenue, Hot Springs." },
    { role: "agent", content: "Got it, 412 Whittington Avenue in Hot Springs. What day works for a free estimate?" },
    { role: "user", content: "Tomorrow would be great, any time." },
  ];

  if (expectMode === "message") {
    const blocked = await send("/api/webhooks/retell/tools/book_estimate", { name: "book_estimate", call: callObj({ retell_llm_dynamic_variables: vars }), args: { slot_id: `${day}T13:00`, caller_name: "Linda Parker", caller_phone: caller, address: "412 Whittington Ave, Hot Springs", job_type: "Exterior repaint" } });
    check("over the cap: booking is refused, message only", blocked.json.booked === false, String(blocked.json.result));
  } else {
    // 3. check_availability
    const avail = await send("/api/webhooks/retell/tools/check_availability", { name: "check_availability", call: callObj({ retell_llm_dynamic_variables: vars }), args: { preferred_date: day, part_of_day: "any" } });
    const slots = (avail.json.slots || []) as Array<{ slot_id: string; label: string }>;
    check("check_availability returns open slots", avail.status === 200 && slots.length > 0, slots.map((s) => s.label).join(" | "));
    const first = slots[0];
    const startHm = first.slot_id.slice(11);
    check("slots avoid the existing 7–11 AM job plus 30 min drive time", startHm >= "11:30", first.slot_id);

    // 4. book_estimate
    turns.push({ role: "agent", content: `I have ${slots.map((s) => s.label).slice(0, 2).join(", or ")}. Which works?` });
    turns.push({ role: "user", content: "The first one." });
    const book = await send("/api/webhooks/retell/tools/book_estimate", {
      name: "book_estimate",
      call: callObj({ retell_llm_dynamic_variables: vars }),
      args: { slot_id: first.slot_id, caller_name: "Linda Parker", caller_phone: "501-555-0123", address: "412 Whittington Ave, Hot Springs, AR", job_type: "Exterior repaint", details: "Two-story house, peeling trim, wants it done before winter.", preferred_time: "Tomorrow, any time" },
    });
    check("book_estimate books the visit", book.json.booked === true, String(book.json.result));
    turns.push({ role: "agent", content: String(book.json.result).replace(" Read this back to the caller.", "") });
    turns.push({ role: "user", content: "Perfect, thank you!" });

    // 4b. Retell retry of the same booking → same visit, not a second one.
    const retry = await send("/api/webhooks/retell/tools/book_estimate", { name: "book_estimate", call: callObj({ retell_llm_dynamic_variables: vars }), args: { slot_id: first.slot_id, caller_name: "Linda Parker", caller_phone: "501-555-0123", address: "412 Whittington Ave", job_type: "Exterior repaint" } });
    check("retried book_estimate does not double-book", retry.json.booked === true && String(retry.json.result).startsWith("Already booked"));

    // 5. a second caller grabs the same slot
    const other = `sim_other_${Date.now().toString(36)}`;
    await send("/api/webhooks/retell/inbound", { event: "call_inbound", call_inbound: { call_id: other, from_number: "+15015550777", to_number: retellNumber } });
    const clash = await send("/api/webhooks/retell/tools/book_estimate", {
      name: "book_estimate",
      call: { call_id: other, from_number: "+15015550777", to_number: retellNumber, retell_llm_dynamic_variables: { answer_mode: "full" } },
      args: { slot_id: first.slot_id, caller_name: "Second Caller", caller_phone: "5015550777", address: "1 Central Ave", job_type: "Interior" },
    });
    const alts = (clash.json.slots || []) as Array<{ slot_id: string }>;
    check("a second caller can't take the same slot", clash.json.booked === false && !alts.some((a) => a.slot_id === first.slot_id), String(clash.json.result).slice(0, 120));
  }

  // 6. call_ended (184 s)
  const endMs = startMs + 184_000;
  const ended = await send("/api/webhooks/retell", { event: "call_ended", call: callObj({ call_status: "ended", start_timestamp: startMs, end_timestamp: endMs, duration_ms: 184_000, disconnection_reason: "user_hangup", transcript_object: turns, recording_url: "https://example.invalid/sim-recording.wav", retell_llm_dynamic_variables: vars }) });
  check("call_ended accepted", ended.status === 204);

  // 7. call_analyzed
  const analyzed = await send("/api/webhooks/retell", {
    event: "call_analyzed",
    call: callObj({
      call_status: "ended",
      start_timestamp: startMs,
      end_timestamp: endMs,
      duration_ms: 184_000,
      transcript_object: turns,
      recording_url: "https://example.invalid/sim-recording.wav",
      retell_llm_dynamic_variables: vars,
      call_analysis: {
        call_summary: expectMode === "full" ? "Linda Parker wants her two-story house exterior repainted; the trim is peeling and she'd like it done before winter. Free estimate visit booked." : "Linda Parker called about an exterior repaint. Left a message asking for a call back.",
        user_sentiment: "Positive",
        call_successful: true,
        custom_analysis_data: { caller_name: "Linda Parker", callback_number: "501-555-0123", service_address: "412 Whittington Ave, Hot Springs, AR", job_type: "Exterior repaint", job_details: "Two-story, peeling trim, before winter.", preferred_time: "Tomorrow, any time", urgency: "normal", is_spam: false },
      },
    }),
  });
  check("call_analyzed accepted", analyzed.status === 204);

  // 8. retried call_ended → minutes counted once
  await send("/api/webhooks/retell", { event: "call_ended", call: callObj({ start_timestamp: startMs, end_timestamp: endMs, duration_ms: 184_000 }) });

  // 9. forged signature
  const forged = await send("/api/webhooks/retell/tools/book_estimate", { name: "book_estimate", call: callObj(), args: { slot_id: `${day}T15:00` } }, { forge: true });
  check("forged request is refused (401)", forged.status === 401);

  // ---- what the boss sees ----
  const card = await prisma.callCard.findUnique({ where: { retellCallId: callId } });
  check("Call Card saved", Boolean(card), card ? `${card.outcome} · ${card.callerName} · ${card.status}` : "");
  const usage = (await prisma.answeringUsage.findUnique({ where: { shopId_month: { shopId: "default", month } } }))?.seconds || 0;
  check("minutes counted once (184 s)", usage - usageBefore === 184, `${usageBefore}s → ${usage}s`);
  const alert = card?.alertId ? await prisma.alert.findUnique({ where: { id: card.alertId } }) : null;
  check("push alert raised for the boss", Boolean(alert), alert ? `${alert.title}: ${alert.body} → ${alert.href}` : String(card?.alertId));
  if (expectMode === "full") {
    const entry = card?.timeEntryId ? await prisma.timeEntry.findUnique({ where: { id: card.timeEntryId }, include: { job: true } }) : null;
    check("estimate visit on the combined schedule (kind ESTIMATE)", entry?.kind === "ESTIMATE", entry ? `${entry.date.toISOString().slice(0, 10)} ${entry.scheduledStart}-${entry.scheduledEnd} · ${entry.job?.code} ${entry.job?.name} · ${estimator.firstName}` : "");
    check("job lands as a called lead (red Lead step done)", Boolean(entry?.job?.leadCalledAt && entry?.job?.customerId));
  }
  result.ok = true;
  result.callCardId = card?.id;
  result.database = db?.label || remote;
  if (JSON_OUT) console.log(JSON.stringify(result));
  else log(`\nAll good. Call Card: /calls/${card?.id}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  if (JSON_OUT) console.log(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  else console.error("\nSimulator failed:", error?.message || error);
  process.exit(1);
});
