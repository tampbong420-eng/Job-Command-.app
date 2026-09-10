import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { closeDb, getDb } from "../lib/db";
import {
  clockEmployee,
  createEmployee,
  listCrewDirectory,
} from "../lib/employees";
import { getHoursSummary, listTimeEntries } from "../lib/hours";
import { createJob } from "../lib/jobs";

function withDb() {
  process.env.JOB_COMMAND_SEED = "0";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "job-command-portal-"));
  const file = path.join(dir, "test.sqlite");
  process.env.JOB_COMMAND_DB = file;
  closeDb();
  getDb(file);
  return dir;
}

test("crew directory hides unique login tokens and reports clock state", () => {
  const dir = withDb();
  const ricky = createEmployee({ name: "Ricky", role: "Lead" });
  const dina = createEmployee({ name: "Dina", role: "Crew" });
  clockEmployee(ricky.id, true);

  const directory = listCrewDirectory(dina.id);
  assert.equal(directory.length, 1);
  assert.equal(directory[0]?.name, "Ricky");
  assert.equal(directory[0]?.onClock, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(directory[0], "unique_link_token"),
    false,
  );

  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("clock in/out records time entries used for hours tracking", () => {
  const dir = withDb();
  const employee = createEmployee({ name: "Alex Rivera" });
  clockEmployee(employee.id, true);
  const open = listTimeEntries(employee.id);
  assert.equal(open.length, 1);
  assert.equal(open[0]?.clocked_out_at, null);

  clockEmployee(employee.id, false);
  const closed = listTimeEntries(employee.id);
  assert.equal(closed[0]?.clocked_out_at !== null, true);

  const hours = getHoursSummary(employee.id);
  assert.equal(hours.clockedInAt, null);
  assert.ok(hours.todaySeconds >= 0);

  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("employee jobs still expose boss notes and required supplies", () => {
  const dir = withDb();
  const employee = createEmployee({ name: "Riley" });
  const job = createJob({
    title: "Northline Properties",
    customer_name: "John Doe",
    customer_phone: "501-555-0192",
    address: "123 Painted Post Rd, Hot Springs, AR",
    boss_notes: "Cover landscaping with drop cloths.",
    required_supplies: "2x sprayers, exterior satin white",
    assigned_employee_id: employee.id,
  });

  assert.equal(job.title, "Northline Properties");
  assert.match(job.boss_notes ?? "", /drop cloths/);
  assert.match(job.required_supplies ?? "", /sprayers/);

  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
