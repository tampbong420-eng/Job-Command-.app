import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseEmployeeOnboard,
  parsePassword,
  parseUsername,
  withholdFromElection,
} from "./employee-onboard";

test("username and password rules", () => {
  assert.equal(parseUsername("Maya.Chen"), "maya.chen");
  assert.equal(parseUsername("ab"), "");
  assert.equal(parseUsername("bad name"), "");
  assert.equal(parsePassword("secret12"), "secret12");
  assert.equal(parsePassword("short"), "");
});

test("W-2 filing status and exemptions map to payroll withhold percents", () => {
  assert.deepEqual(
    withholdFromElection({ payMethod: "W2", filingStatus: "SINGLE", allowances: 0 }),
    { federalWithholdPct: 15, stateWithholdPct: 5 }
  );
  assert.deepEqual(
    withholdFromElection({ payMethod: "W2", filingStatus: "MARRIED", allowances: 2 }),
    { federalWithholdPct: 7, stateWithholdPct: 3.4 }
  );
  assert.deepEqual(
    withholdFromElection({ payMethod: "W2", filingStatus: "EXEMPT", allowances: 0 }),
    { federalWithholdPct: 0, stateWithholdPct: 0 }
  );
});

test("cash / alternative pay withholds nothing for payroll and W-2", () => {
  assert.deepEqual(
    withholdFromElection({ payMethod: "CASH", filingStatus: "SINGLE", allowances: 0 }),
    { federalWithholdPct: 0, stateWithholdPct: 0 }
  );
});

test("onboard parse requires username, password, pay method, and filing status", () => {
  const miss = parseEmployeeOnboard({
    token: "inv_1",
    username: "maya",
    password: "secret12",
  });
  assert.equal(miss.ok, false);

  const ok = parseEmployeeOnboard({
    token: "inv_1",
    username: "maya.chen",
    password: "secret12",
    payMethod: "W-2",
    filingStatus: "Head",
    allowances: "1",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.payMethod, "W2");
    assert.equal(ok.value.filingStatus, "HEAD");
    assert.equal(ok.value.allowances, 1);
    assert.equal(ok.value.username, "maya.chen");
  }
});

test("employee onboard stays on the invite page and crew gate, not pipeline cards", () => {
  const join = readFileSync(new URL("../app/j/[token]/page.tsx", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../components/command/EmployeeHome.tsx", import.meta.url), "utf8");
  const lead = readFileSync(new URL("../components/command/LeadStage.tsx", import.meta.url), "utf8");
  const estimate = readFileSync(new URL("../components/command/EstimateStage.tsx", import.meta.url), "utf8");
  const yellow = readFileSync(new URL("../components/command/YellowPrepStage.tsx", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../components/command/AccessGate.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/command/EmployeeOnboard.tsx", import.meta.url), "utf8");
  assert.match(join, /EmployeeOnboard/);
  assert.match(join, /AccessGate/);
  assert.match(join, /onboardedAt/);
  assert.match(desk, /EmployeeOnboard/);
  assert.match(desk, /!employee\.onboardedAt/);
  assert.match(form, /data-employee-onboard/);
  assert.match(form, /W-2/);
  assert.match(form, /Cash \/ alternative/);
  assert.match(form, /Filing status/);
  assert.match(form, /Exemptions/);
  assert.match(home, /Clock in/);
  assert.doesNotMatch(home, /EmployeeOnboard/);
  assert.doesNotMatch(lead, /EmployeeOnboard/);
  assert.doesNotMatch(estimate, /EmployeeOnboard/);
  assert.doesNotMatch(yellow, /EmployeeOnboard/);
  assert.match(gate, /Type your PIN, then tap Open/);
  assert.doesNotMatch(gate, /EmployeeOnboard/);
});
