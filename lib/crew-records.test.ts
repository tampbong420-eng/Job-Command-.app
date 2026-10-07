import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_EMPLOYMENT_STATUS,
  EMPLOYMENT_STATUSES,
  employmentStatusLabel,
  parseEmploymentStatus,
} from "./employment";

const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
const folder = readFileSync(new URL("../components/command/JobFolder.tsx", import.meta.url), "utf8");
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("./client-store.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const lead = readFileSync(new URL("../components/command/LeadStage.tsx", import.meta.url), "utf8");
const estimate = readFileSync(new URL("../components/command/EstimateStage.tsx", import.meta.url), "utf8");
const yellow = readFileSync(new URL("../components/command/YellowPrepStage.tsx", import.meta.url), "utf8");

test("employment status ids stay a closed set and default to active", () => {
  assert.equal(DEFAULT_EMPLOYMENT_STATUS, "ACTIVE");
  assert.deepEqual(
    EMPLOYMENT_STATUSES.map((item) => item.id),
    ["ACTIVE", "TEMPORARY", "QUIT", "FIRED", "LEAVE"]
  );
  assert.equal(parseEmploymentStatus("fired"), "FIRED");
  assert.equal(parseEmploymentStatus("nope"), "ACTIVE");
  assert.equal(employmentStatusLabel("LEAVE"), "Leave");
});

test("customer records on the job folder can be added and edited", () => {
  assert.match(folder, /data-customer-records="1"/);
  assert.match(folder, /persistCustomer/);
  assert.match(folder, /Homeowner/);
  assert.doesNotMatch(folder, /placeholder=/);
  assert.match(folder, /Customer address/);
  assert.doesNotMatch(folder, /readOnly/);
  assert.match(store, /input\.phone !== undefined \? input\.phone\.trim\(\)/);
  assert.doesNotMatch(lead, /readOnly/);
  assert.doesNotMatch(estimate, /readOnly/);
  assert.doesNotMatch(yellow, /readOnly/);
});

test("employee removal requires an official legal confirmation", () => {
  assert.match(desk, /data-employee-delete="1"/);
  assert.match(desk, /Permanent deletion of employee records/);
  assert.match(desk, /year-to-date wage amounts/);
  assert.match(desk, /tax audit/);
  assert.match(desk, /cannot be undone/);
  assert.match(desk, /data-employee-delete-ack="1"/);
  assert.match(desk, /disabled=\{pending \|\| !acknowledged\}/);
  assert.match(desk, /Permanently delete records/);
  assert.doesNotMatch(desk, /Hours and pay for this person go with them/);
});

// 2026-09-27 (CONTEXT.md): Eric cleared the crew card to photo, name, and clock boxes —
// "Hire date, end date, job title, Remove, and today's route are off this screen."
// The employment record stays in the data layer (schema, server action, year-end books).
test("employment status and end date stay in the data layer, off the cleared crew card", () => {
  assert.match(schema, /employmentStatus\s+String\s+@default\("ACTIVE"\)/);
  assert.match(schema, /employmentEndDate\s+DateTime\?/);
  assert.match(actions, /export async function updateEmploymentRecord/);
  assert.doesNotMatch(desk, /data-employment-track="1"/);
  assert.match(css, /\.employment-end-row/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(6\.75rem, 7\.5rem\)/);
  assert.doesNotMatch(lead, /data-employment-track/);
  assert.doesNotMatch(estimate, /data-employment-track/);
  assert.doesNotMatch(yellow, /data-employment-track/);
  const pulseHits = [...css.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
  assert.match(css, /\.btn-next-action,\s*\.next-action-button \{[^}]*background-color:\s*#c9a227/);
});
