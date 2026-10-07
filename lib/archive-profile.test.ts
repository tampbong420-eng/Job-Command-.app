import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// Eric 2026-10-02: gray Archive = only the jobs (houses); all pay on the employee profile; no Roster › Pay folder.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const ws = read("../components/command/EmployeeWorkspace.tsx");
const archive = read("../components/command/ArchiveJobs.tsx");
const pay = read("../components/command/ProfilePay.tsx");
const records = read("../components/command/OfficeRecords.tsx");
const css = read("../components/command/ProfileRecords.module.css");
const queries = read("./queries.ts");

test("Archive shows only closed jobs: address, customer, job name — no record files", () => {
  assert.equal(existsSync(new URL("../components/command/RecordFiles.tsx", import.meta.url)), false);
  assert.doesNotMatch(ws, /RecordFiles/);
  assert.match(archive, /job\.pipeline >= 6/);
  for (const field of ["job.address", "job.client", "job.name"]) assert.ok(archive.includes(field), field);
  for (const gone of ["Books", "Payroll", "Customers", "Invoices", "Receipts", "Materials", "Estimates", "Photos"]) {
    assert.doesNotMatch(archive, new RegExp(`>${gone}<|title="${gone}"`), gone);
  }
});

test("Roster has no Pay folder; old pay links land on the profile", () => {
  assert.match(ws, /type CrewFolder = "schedule" \| "profiles" \| "archive";/);
  assert.doesNotMatch(ws, /crew-folder pay/);
  assert.doesNotMatch(ws, /PayPane|PaymentLedger/);
  assert.match(ws, /initialTab === "pay" && session\?\.role !== "CREW"\) return "profiles"/);
  assert.match(ws, /openCrewFolder\("profiles", employeeId\)/);
});

test("profile carries every pay section and is boss-only (crew phones get EmployeeHome first)", () => {
  const pane = ws.slice(ws.indexOf("function CrewPane("), ws.indexOf("function SchedulePane("));
  assert.ok(pane.indexOf("if (solo)") > -1 && pane.indexOf("if (solo)") < pane.indexOf("<ProfilePay"));
  for (const action of ["updatePayConfig", "updateStartDate", "updateEmploymentRecord", "saveEmployeeDeposit", "payCurrentPeriod"]) {
    assert.match(pay, new RegExp(`${action}\\(`), action);
  }
  assert.match(pay, /Hourly/);
  assert.match(pay, /Salary/);
  assert.match(pay, /salaryAnnual/);
  assert.match(pay, /EMPLOYMENT_STATUSES/);
  assert.match(pay, /data-week-archive/);
  assert.match(pay, /ytdGross/);
  // Careful direct deposit wording: details on file, the app does not send the money.
  assert.match(pay, /It does not send the money/);
});

test("crew payloads still strip pay", () => {
  const strip = queries.slice(queries.indexOf("export function fieldEmployeeDTO"), queries.indexOf("export async function loadWorkspace"));
  for (const key of ["hourlyRate: 0", "salaryAnnual: 0", "ytdGross: 0", "ytdNet: 0", "payPeriods: []"]) assert.ok(strip.includes(key), key);
  assert.match(queries, /employees: self \? \[fieldEmployeeDTO\(self\)\] : \[\]/);
});

test("Office › Records keeps the files with no other home", () => {
  for (const title of ["Receipts", "Customers", "Invoices", "Materials"]) assert.match(records, new RegExp(`title="${title}"`), title);
  assert.match(records, /\/api\/receipts/);
  assert.match(records, /capture="environment"/);
  assert.match(ws, /<OfficeRecords /);
});

test("big, high-contrast styling: 48px+ taps, 16px+ text, no pastel fills", () => {
  for (const match of css.matchAll(/min-height:\s*(\d+)px/g)) assert.ok(Number(match[1]) >= 32, match[0]);
  for (const sel of [".toggle,\n.btn,\n.navBtn {\n  min-height: 52px", ".drop > summary {", ".house {"]) assert.ok(css.includes(sel), sel);
  for (const match of css.matchAll(/font-size:\s*(\d+)px/g)) {
    const n = Number(match[1]);
    // 14px only on the ▼ glyph.
    assert.ok(n >= 16 || css.slice(Math.max(0, match.index! - 80), match.index).includes('content: "▼"'), match[0]);
  }
  for (const pastel of ["#d9f99d", "#ecfccb", "#fef3c7", "#fde68a", "#e0f2fe", "#fce7f3", "#ede9fe", "#dcfce7"]) {
    assert.ok(!css.toLowerCase().includes(pastel), pastel);
  }
});
