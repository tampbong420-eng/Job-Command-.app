import assert from "node:assert/strict";
import test from "node:test";
import { can, fieldDock, ownsEmployee } from "./access";
import type { SessionDTO } from "./types";

const office: SessionDTO = {
  accountId: "a1",
  role: "ADMIN",
  name: "Office",
  employeeId: null,
};

const maya: SessionDTO = {
  accountId: "a2",
  role: "CREW",
  name: "Maya Chen",
  employeeId: "emp_maya",
};

test("crew cannot open payroll, company, or margins", () => {
  assert.equal(can(maya, "payroll"), false);
  assert.equal(can(maya, "company"), false);
  assert.equal(can(maya, "cost"), false);
  assert.equal(can(maya, "dispatch"), false);
  assert.equal(can(maya, "invoice"), false);
  assert.equal(can(maya, "estimate"), true);
  assert.equal(can(maya, "photos"), true);
  assert.equal(can(maya, "clock"), true);
});

test("office keeps the full dock", () => {
  assert.deepEqual([...fieldDock("ADMIN")], ["command", "crew", "schedule", "pay", "company"]);
  assert.deepEqual([...fieldDock("CREW")], ["command", "crew", "schedule"]);
});

test("crew can only act as themselves", () => {
  assert.equal(ownsEmployee(maya, "emp_maya"), true);
  assert.equal(ownsEmployee(maya, "emp_jordan"), false);
  assert.equal(ownsEmployee(office, "emp_jordan"), true);
  assert.equal(can(null, "photos"), false);
});
