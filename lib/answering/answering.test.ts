import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { sign, verify } from "retell-sdk";
import { addDays, busyRanges, isWorkDay, openSlots, parsePartOfDay, parseSlotId, shopClock, slotIsOpen, slotLabel } from "./slots";
import { callSeconds, capState, planCall, usageMonth } from "./metering";
import { parseCallEvent, parseInbound, parseToolCall, transcriptTurns } from "./events";
import { FORWARDING_CARRIERS, forwardingCode, prettyUs, tenDigits, toE164 } from "./forwarding";
import { beginMessage, buildAgentConfig, buildLlmConfig, buildPhoneBinding, buildPrompt, POST_CALL_FIELDS, type ShopForAgent } from "./agent-config";
import { ANSWERING_MINUTES_CAP, FULL_CALL_MAX_MS, MESSAGE_CALL_MAX_MS, RETELL_PATHS, parsePhoneVoice } from "./config";
import { bookedLabel, chipFor, durationLabel, telLink } from "./view";

const root = path.join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const TZ = "America/Chicago";
const HOURS = { workDays: "MON_FRI", workStart: "07:00", workEnd: "17:00" };
// Fri Oct 2 2026, 9:48 AM Central
const NOW = new Date("2026-10-02T14:48:00Z");

test("shop clock and calendar helpers read the shop's own zone", () => {
  assert.deepEqual(shopClock(NOW, TZ), { day: "2026-10-02", minutes: 9 * 60 + 48 });
  assert.equal(shopClock(new Date("2026-10-03T04:30:00Z"), TZ).day, "2026-10-02"); // 11:30 PM Central
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(isWorkDay("2026-10-03", "MON_FRI"), false);
  assert.equal(isWorkDay("2026-10-03", "MON_SAT"), true);
  assert.equal(isWorkDay("2026-10-04", "MON_SAT"), false);
  assert.equal(isWorkDay("2026-10-04", "EVERY_DAY"), true);
  assert.equal(slotLabel("2026-10-06", "09:00"), "Tuesday, October 6 at 9 AM");
  assert.deepEqual(parseSlotId("2026-10-06T09:00"), { date: "2026-10-06", start: "09:00" });
  assert.equal(parseSlotId("tomorrow at 9"), null);
  assert.equal(parseSlotId("2026-10-06T25:00"), null);
  assert.equal(parsePartOfDay("Morning"), "morning");
  assert.equal(parsePartOfDay("PM"), "afternoon");
  assert.equal(parsePartOfDay(""), "any");
});

test("slots stay inside shop hours, need notice, and skip weekends", () => {
  // Same day: 9:48 AM + 2 h notice → first slot 12:00 at the earliest.
  const today = openSlots({ now: NOW, timeZone: TZ, hours: HOURS, rows: [], preferredDate: "2026-10-02" });
  assert.ok(today.length > 0);
  assert.ok(today[0].start >= "12:00", today[0].start);
  for (const slot of today) assert.ok(slot.end <= "17:00");
  // Saturday asked → nothing that day, falls through to Monday.
  const sat = openSlots({ now: NOW, timeZone: TZ, hours: HOURS, rows: [], preferredDate: "2026-10-03" });
  assert.equal(sat[0].date, "2026-10-05");
  // No preference → first opening on each of the next days.
  const soonest = openSlots({ now: NOW, timeZone: TZ, hours: HOURS, rows: [] });
  assert.deepEqual(soonest.map((s) => s.date), ["2026-10-02", "2026-10-05", "2026-10-06"]);
  // Morning / afternoon filters.
  const pm = openSlots({ now: NOW, timeZone: TZ, hours: HOURS, rows: [], preferredDate: "2026-10-05", partOfDay: "afternoon" });
  assert.ok(pm.every((s) => s.start >= "12:00"));
  const am = openSlots({ now: NOW, timeZone: TZ, hours: HOURS, rows: [], preferredDate: "2026-10-05", partOfDay: "morning" });
  assert.ok(am.every((s) => s.start < "12:00"));
  // Same-day offers are spread at least 2 hours apart.
  const mon = openSlots({ now: NOW, timeZone: TZ, hours: HOURS, rows: [], preferredDate: "2026-10-05" });
  assert.deepEqual(mon.map((s) => s.start), ["07:00", "09:00", "11:00"]);
});

test("the estimator is never double-booked: jobs, estimates, drive buffer, absences, untimed days", () => {
  const rows = [
    { date: "2026-10-05", start: "07:00", end: "11:00", scheduledHours: 4 }, // a job
    { date: "2026-10-05", start: "14:00", end: "15:00", scheduledHours: 1 }, // another estimate
  ];
  const base = { rows, hours: HOURS, estimateMinutes: 60, bufferMinutes: 30 };
  assert.equal(slotIsOpen({ day: "2026-10-05", start: "11:00", ...base }), false); // buffer after the job
  assert.equal(slotIsOpen({ day: "2026-10-05", start: "11:30", ...base }), true);
  assert.equal(slotIsOpen({ day: "2026-10-05", start: "12:30", ...base }), true); // ends 13:30, buffer to 14:00
  assert.equal(slotIsOpen({ day: "2026-10-05", start: "13:00", ...base }), false); // runs into the 2 PM estimate's buffer
  assert.equal(slotIsOpen({ day: "2026-10-05", start: "15:30", ...base }), true);
  assert.equal(slotIsOpen({ day: "2026-10-05", start: "16:30", ...base }), false); // would end after closing
  assert.equal(slotIsOpen({ day: "2026-10-05", start: "06:30", ...base }), false); // before opening
  // Absence or a day with hours but no times blocks the whole day.
  assert.equal(slotIsOpen({ day: "2026-10-06", start: "09:00", rows: [{ date: "2026-10-06", start: null, end: null, notes: "absence:SICK" }], hours: HOURS }), false);
  assert.equal(slotIsOpen({ day: "2026-10-06", start: "09:00", rows: [{ date: "2026-10-06", start: null, end: null, scheduledHours: 8 }], hours: HOURS }), false);
  assert.deepEqual(busyRanges([{ date: "2026-10-06", start: "22:00", end: "02:00" }], "2026-10-06", HOURS), [[22 * 60, 26 * 60]]);
  // Rows on other days don't matter.
  assert.equal(slotIsOpen({ day: "2026-10-07", start: "09:00", ...base }), true);
});

test("minutes: shop-calendar month, idempotent seconds, 200-minute cap → message only, hard ceiling → decline", () => {
  assert.equal(usageMonth(new Date("2026-11-01T04:30:00Z"), TZ), "2026-10"); // 11:30 PM Oct 31 Central
  assert.equal(callSeconds({ durationMs: 184_000 }), 184);
  assert.equal(callSeconds({ startMs: 1000, endMs: 62_500 }), 62);
  assert.equal(callSeconds({ startMs: 5000, endMs: 1000 }), 0);
  const fresh = capState(0);
  assert.equal(fresh.capMinutes, ANSWERING_MINUTES_CAP);
  assert.equal(fresh.overCap, false);
  const some = capState(37 * 60 + 5);
  assert.equal(some.usedMinutes, 38);
  assert.equal(some.leftMinutes, 162);
  assert.equal(capState(200 * 60).overCap, true);
  assert.equal(capState(400 * 60).overCeiling, true);
  assert.deepEqual(planCall({ addonActive: true, enabled: true, usedSeconds: 0 }), { mode: "full", reject: false, maxCallMs: FULL_CALL_MAX_MS, reason: "ok" });
  assert.equal(planCall({ addonActive: true, enabled: true, usedSeconds: 200 * 60 }).mode, "message");
  assert.equal(planCall({ addonActive: true, enabled: true, usedSeconds: 200 * 60 }).maxCallMs, MESSAGE_CALL_MAX_MS);
  assert.equal(planCall({ addonActive: false, enabled: true, usedSeconds: 0 }).reason, "addon_off");
  assert.equal(planCall({ addonActive: true, enabled: false, usedSeconds: 0 }).reason, "ai_off");
  assert.equal(planCall({ addonActive: true, enabled: true, usedSeconds: 400 * 60 }).reject, true);
});

test("Retell payloads parse defensively", () => {
  const ev = parseCallEvent({
    event: "call_analyzed",
    call: {
      call_id: "c1",
      from_number: "+15015550123",
      to_number: "+15015550199",
      start_timestamp: 1_000,
      end_timestamp: 185_000,
      recording_url: "https://x/rec.wav",
      transcript_object: [{ role: "agent", content: "Hi" }, { role: "user", content: "Hello" }, { role: "user", content: "" }],
      call_analysis: { call_summary: "Booked.", custom_analysis_data: { caller_name: "Linda", urgency: "URGENT", is_spam: "true" } },
      retell_llm_dynamic_variables: { answer_mode: "full" },
    },
  });
  assert.ok(ev);
  assert.equal(ev.durationSec, 184);
  assert.equal(ev.transcript.length, 2);
  assert.equal(ev.fields.callerName, "Linda");
  assert.equal(ev.fields.urgency, "urgent");
  assert.equal(ev.fields.isSpam, true);
  assert.equal(ev.dynamic.answer_mode, "full");
  assert.equal(parseCallEvent({ event: "call_ended" }), null);
  assert.deepEqual(transcriptTurns({ transcript: "Agent: Hi there\nUser: I need paint" }), [
    { role: "agent", text: "Hi there" },
    { role: "user", text: "I need paint" },
  ]);
  assert.deepEqual(parseInbound({ event: "call_inbound", call_inbound: { call_id: "c2", from_number: "+1", to_number: "+2" } }), { callId: "c2", agentId: "", from: "+1", to: "+2" });
  assert.equal(parseInbound({ event: "call_started" }), null);
  const tool = parseToolCall({ name: "book_estimate", call: { call_id: "c3", to_number: "+2" }, args: { slot_id: "x" } }, "book_estimate");
  assert.equal(tool.callId, "c3");
  assert.equal(tool.args.slot_id, "x");
});

test("Retell signature: the SDK verify accepts a real signature and rejects tampering, wrong key, and old timestamps", async () => {
  const body = JSON.stringify({ event: "call_ended", call: { call_id: "c1" } });
  const good = await sign(body, "key_1");
  assert.match(good, /^v=\d+,d=[0-9a-f]{64}$/);
  assert.equal(await verify(body, "key_1", good), true);
  assert.equal(await verify(body + " ", "key_1", good), false);
  assert.equal(await verify(body, "key_2", good), false);
  const digest = good.split(",d=")[1];
  assert.equal(await verify(body, "key_1", `v=${Date.now() - 10 * 60 * 1000},d=${digest}`), false);
  // Our check lives in lib/answering/signature.ts and every route goes through it before parsing.
  const sig = read("lib/answering/signature.ts");
  assert.match(sig, /from "retell-sdk"/);
  assert.match(sig, /await verify\(rawBody, key, signature\)/);
  assert.match(sig, /status: 503/); // no key = not connected = refuse
  const handlers = read("lib/answering/handlers.ts");
  assert.ok(handlers.indexOf("checkRetellSignature(raw") < handlers.indexOf("parseJson(raw)"));
});

test("forwarding codes fill in the 501 number and always offer a way to turn it off", () => {
  assert.equal(tenDigits("+1 (501) 555-0199"), "5015550199");
  assert.equal(toE164("501-555-0199"), "+15015550199");
  assert.equal(toE164("555-0199"), "");
  assert.equal(prettyUs("+15015550199"), "(501) 555-0199");
  const generic = FORWARDING_CARRIERS.find((c) => c.id === "generic")!;
  assert.equal(forwardingCode(generic, "+15015550199"), "**004*15015550199#");
  const verizon = FORWARDING_CARRIERS.find((c) => c.id === "verizon")!;
  assert.equal(forwardingCode(verizon, "(501) 555-0199"), "*715015550199");
  for (const carrier of FORWARDING_CARRIERS) assert.ok(carrier.off && carrier.note, carrier.id);
});

const SHOP: ShopForAgent = {
  shopName: "Top Gun Painting",
  ownerFirstName: "Eric",
  trade: "painting",
  services: ["Interior", "Exterior"],
  serviceArea: "Hot Springs, AR and about 30 miles around",
  timeZone: TZ,
  hoursLine: "Monday to Friday, 7 AM to 5 PM",
};

test("agent config: shop-name greeting with AI + recording disclosure, our two custom functions, honest guardrails", () => {
  assert.match(beginMessage("full"), /\{\{shop_name\}\}/);
  assert.match(beginMessage("full"), /I'm an AI/);
  assert.match(beginMessage("full"), /recorded/);
  assert.match(beginMessage("message"), /message/);
  const prompt = buildPrompt(SHOP);
  assert.match(prompt, /Never quote prices/);
  assert.match(prompt, /Never take card numbers/);
  assert.match(prompt, /911/);
  assert.match(prompt, /answer_mode is "message"/);
  const llm = buildLlmConfig(SHOP, "https://jobcommand.app/");
  const custom = llm.general_tools.filter((t) => t.type === "custom") as Array<{ name: string; url: string; method: string; parameters: { type: string } }>;
  assert.deepEqual(custom.map((t) => t.name), ["check_availability", "book_estimate"]);
  assert.equal(custom[0].url, "https://jobcommand.app/api/webhooks/retell/tools/check_availability");
  assert.equal(custom[1].url, "https://jobcommand.app" + RETELL_PATHS.tool("book_estimate"));
  for (const tool of custom) assert.equal(tool.parameters.type, "object");
  assert.equal(llm.start_speaker, "agent");
  const agent = buildAgentConfig({ shop: SHOP, llmId: "llm_1", voiceId: "11labs-Adrian", baseUrl: "https://jobcommand.app" });
  assert.deepEqual(agent.response_engine, { type: "retell-llm", llm_id: "llm_1" });
  assert.equal(agent.webhook_url, "https://jobcommand.app/api/webhooks/retell");
  assert.deepEqual(agent.webhook_events, ["call_started", "call_ended", "call_analyzed"]);
  assert.ok(POST_CALL_FIELDS.some((f) => f.name === "caller_name"));
  const bind = buildPhoneBinding({ agentId: "agent_1", baseUrl: "https://jobcommand.app", nickname: "x" });
  assert.equal(bind.inbound_webhook_url, "https://jobcommand.app/api/webhooks/retell/inbound");
  assert.deepEqual(bind.inbound_agents, [{ agent_id: "agent_1", weight: 1 }]);
  assert.equal(parsePhoneVoice("female"), "female");
  assert.equal(parsePhoneVoice("robot"), "male");
});

test("screens: office-only pages, big Call Back, minutes shown, honest 'Not connected yet'", () => {
  for (const rel of ["app/answering/page.tsx", "app/calls/page.tsx", "app/calls/[id]/page.tsx", "app/answering/actions.ts"]) {
    const src = read(rel);
    assert.match(src, /getLiveSession\(\)/, rel);
    assert.match(src, /can\(session, "admin"\)/, rel);
  }
  const setup = read("components/answering/AnsweringSetup.tsx");
  assert.match(setup, /Not connected yet/);
  assert.match(setup, /Minutes this month/);
  assert.match(setup, /Codes differ by carrier/);
  assert.match(read("components/answering/CallCardView.tsx"), /Call back/);
  const css = read("components/answering/answering.module.css");
  for (const match of css.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(match[1]) >= 16, `font-size ${match[1]}px`);
  for (const match of css.matchAll(/min-height:\s*(\d+)px/g)) assert.ok(Number(match[1]) >= 32, `min-height ${match[1]}px`);
  assert.match(css, /\.btn \{[^}]*min-height: 56px/);
  // Retell routes live under /api/webhooks (public in middleware) and go through the signed handlers.
  for (const rel of ["app/api/webhooks/retell/route.ts", "app/api/webhooks/retell/inbound/route.ts", "app/api/webhooks/retell/tools/[tool]/route.ts"]) {
    assert.match(read(rel), /from "@\/lib\/answering\/handlers"/, rel);
  }
  assert.match(read("middleware.ts"), /\^\\\/api\\\/webhooks\\\//);
  assert.equal(chipFor("BOOKED").tone, "booked");
  assert.equal(chipFor("MESSAGE").label, "Call back");
  assert.equal(durationLabel(184), "3 min 4 sec");
  assert.equal(bookedLabel("2026-10-06", "09:00", "10:00"), "Tuesday, October 6 · 9 AM – 10 AM");
  assert.equal(telLink("(501) 555-0123"), "tel:5015550123");
});

function runSim(extra: string[]) {
  return spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/answering-simulate.ts", "--json", ...extra], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, RETELL_API_KEY: "", DATABASE_URL: "" },
    timeout: 120_000,
  });
}

test("simulator: a sample call books an estimate end to end and makes a Call Card (fresh throwaway DB)", { timeout: 150_000 }, (t) => {
  if (!existsSync(path.join(root, "scripts/answering-simulate.ts"))) return t.skip("no simulator");
  const run = runSim([]);
  const line = (run.stdout || "").trim().split("\n").pop() || "{}";
  let out: { ok?: boolean; error?: string; steps?: Array<{ name: string; ok: boolean }>; database?: string } = {};
  try {
    out = JSON.parse(line);
  } catch {
    out = { ok: false, error: (run.stderr || run.stdout).slice(0, 400) };
  }
  if (!out.ok && /prisma db push failed/.test(out.error || "")) return t.skip(out.error);
  assert.equal(out.ok, true, out.error || run.stderr);
  assert.match(String(out.database), /throwaway/);
  const names = (out.steps || []).map((s) => s.name);
  for (const must of ["book_estimate books the visit", "a second caller can't take the same slot", "minutes counted once (184 s)", "push alert raised for the boss", "estimate visit on the combined schedule (kind ESTIMATE)", "forged request is refused (401)"]) {
    assert.ok(names.includes(must), must);
  }
});

test("simulator: over the 200-minute cap the AI only takes a message", { timeout: 150_000 }, (t) => {
  const run = runSim(["--cap-hit"]);
  const line = (run.stdout || "").trim().split("\n").pop() || "{}";
  let out: { ok?: boolean; error?: string; steps?: Array<{ name: string }> } = {};
  try {
    out = JSON.parse(line);
  } catch {
    out = { ok: false, error: (run.stderr || run.stdout).slice(0, 400) };
  }
  if (!out.ok && /prisma db push failed/.test(out.error || "")) return t.skip(out.error);
  assert.equal(out.ok, true, out.error || run.stderr);
  assert.ok((out.steps || []).some((s) => s.name === "over the cap: booking is refused, message only"));
});
