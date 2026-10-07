import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyMockPreview,
  MOCK_CLIENTS,
  MOCK_CREW,
  MOCK_JOBS,
  isMockSeedId,
  mockClientsAsDTO,
  mockCrewAsDTO,
  mockJobsAsDTO,
} from "./initial-data";
import { BLANK_SETUP_PAY_PREFS, clampDeposit, depositIsChosen, parsePayPrefs } from "./pay-prefs";

const setup = readFileSync(new URL("../components/command/CompanySetup.tsx", import.meta.url), "utf8");
const overlay = readFileSync(new URL("../hooks/use-workspace-overlay.ts", import.meta.url), "utf8");
const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
const voice = readFileSync(new URL("../hooks/use-voice.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const seed = readFileSync(new URL("./initial-data.ts", import.meta.url), "utf8");

test("setup people rows keep a stable key so mobile typing does not remount", () => {
  assert.match(setup, /key=\{`person-\$\{index\}`\}/);
  assert.doesNotMatch(setup, /key=\{`\$\{person\.firstName\}-\$\{index\}`\}/);
  assert.match(desk, /if \(setupOpen\) return;/);
  assert.match(desk, /tag === "INPUT"/);
  assert.match(voice, /typingInField/);
  assert.match(voice, /if \(typingInField\(\)\) return;/);
  assert.match(voice, /pickSpeakingVoice/);
  assert.match(voice, /utterance\.pitch = NATURAL_TTS\.pitch/);
  assert.match(voice, /utterance\.rate = NATURAL_TTS\.rate/);
});

test("first-run setup fields start blank with no example placeholders", () => {
  assert.match(setup, /useState\(""\)/);
  // Signup v2: fields start blank via signupFromSettings; card + cash start on (approved design), Next never blocks.
  assert.match(setup, /signupFromSettings\(settings\)/);
  assert.doesNotMatch(setup, /SETUP_PLACEHOLDERS/);
  assert.doesNotMatch(setup, /placeholder=/);
  assert.doesNotMatch(setup, /settings\.ownerFirstName/);
  assert.doesNotMatch(setup, /settings\.ownerPhone/);
  assert.doesNotMatch(setup, /value=\{SETUP_PLACEHOLDERS/);
  assert.doesNotMatch(setup, /value=\{MOCK_/);
  assert.match(setup, /settings\.setupComplete && settings\.industry/);
  assert.match(css, /\.setup-desk \.settings-field input::placeholder/);
  assert.match(css, /color:\s*#a1a1aa/);
  assert.equal(BLANK_SETUP_PAY_PREFS.acceptCard, false);
  assert.equal(BLANK_SETUP_PAY_PREFS.acceptCash, false);
  assert.equal(depositIsChosen(BLANK_SETUP_PAY_PREFS.depositPercent), false);
  assert.equal(clampDeposit(BLANK_SETUP_PAY_PREFS.depositPercent), 0);
  const liveDefault = parsePayPrefs(undefined);
  assert.equal(liveDefault.acceptCard, true);
});

test("mock seed is overlay-only and never Prisma or setup values", () => {
  assert.match(overlay, /applyMockPreview/);
  assert.match(overlay, /cacheWorkspace\(input\)/);
  assert.doesNotMatch(seed, /prisma/);
  assert.doesNotMatch(overlay, /prisma/);
  assert.doesNotMatch(setup, /applyMockPreview/);
  assert.equal(isMockSeedId("mock-job-cedar-exterior"), true);
  assert.equal(isMockSeedId("job_live"), false);
  const empty = applyMockPreview({
    jobs: [],
    customers: [],
    employees: [],
    setupComplete: true,
  });
  assert.equal(empty.jobs.length, MOCK_JOBS.length);
  assert.equal(empty.customers.length, MOCK_CLIENTS.length);
  assert.equal(empty.employees.length, MOCK_CREW.length);
  assert.ok(empty.jobs.every((job) => isMockSeedId(job.id)));
  assert.match(empty.jobs[0].timeline, /Sample crew:/);
  const duringSetup = applyMockPreview({
    jobs: [],
    customers: [],
    employees: [],
    setupComplete: false,
  });
  assert.equal(duringSetup.jobs.length, 0);
  assert.equal(duringSetup.customers.length, 0);
  const live = applyMockPreview({
    jobs: [{ ...mockJobsAsDTO()[0], id: "job_live", client: "Live Client", name: "Live job" }],
    customers: [{ ...mockClientsAsDTO()[0], id: "cust_live", name: "Live Client" }],
    employees: [{ ...mockCrewAsDTO()[0], id: "emp_live", firstName: "Live" }],
    setupComplete: true,
  });
  assert.equal(live.jobs.length, 1);
  assert.equal(live.jobs[0].id, "job_live");
  assert.equal(live.customers[0].id, "cust_live");
  assert.equal(live.employees[0].id, "emp_live");
  assert.equal(live.employees.every((person) => !isMockSeedId(person.id)), true);
  const ownerOnly = applyMockPreview({
    jobs: [],
    customers: [],
    employees: [{ ...mockCrewAsDTO()[0], id: "emp_live", firstName: "Live" }],
    setupComplete: true,
  });
  assert.ok(ownerOnly.employees.some((person) => person.id === "emp_live"));
  assert.ok(ownerOnly.employees.some((person) => isMockSeedId(person.id)));
  assert.equal(ownerOnly.jobs.length, MOCK_JOBS.length);
  assert.match(desk, /isMockSeedId\(employee\.id\)/);
  const pulseHits = [...css.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
  assert.match(css, /\.btn-next-action,\s*\.next-action-button \{[^}]*background-color:\s*#c9a227/);
  assert.match(setup, /onClick=\{\(\) => setState\(\(value\) => withTrade\(value, item\.id\)\)\}/);
  assert.match(setup, /onClick=\{\(\) => pickSize\(item\.id\)\}/);
  // Books moved out of signup (asked later in Office).
  assert.doesNotMatch(setup, /setBooks/);
});
