import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyWorkspace, gateWorkspace } from "./workspace-fallback";

test("signed-out gate payload keeps the look but drops shop data", () => {
  const full = emptyWorkspace(null);
  full.settings = {
    ...full.settings,
    businessName: "Top Gun Painting",
    ownerEmail: "owner@example.com",
    ownerPhone: "5015550142",
    shellTheme: "light",
    shellInk: "#ff69b4",
  };
  full.employees = [{ id: "e1" } as never];
  full.jobs = [{ id: "j1" } as never];
  const gate = gateWorkspace(full.settings);
  assert.equal(gate.settings.businessName, "Top Gun Painting");
  assert.equal(gate.settings.shellTheme, "light");
  assert.equal(gate.settings.shellInk, "#ff69b4");
  assert.equal(gate.settings.ownerEmail, "");
  assert.equal(gate.settings.ownerPhone, "");
  assert.deepEqual(gate.employees, []);
  assert.deepEqual(gate.jobs, []);
  assert.deepEqual(gate.customers, []);
  assert.deepEqual(gate.invoices, []);
  assert.equal(gate.session, null);
});

test("home page swaps in the gate payload for signed-out visitors", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /!session && workspace\.settings\.setupComplete/);
  assert.match(page, /gateWorkspace\(workspace\.settings\)/);
});

test("payroll snapshot writer is not exposed as a server action", () => {
  const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(actions, /export async function upsertPeriodSnapshot/);
});
