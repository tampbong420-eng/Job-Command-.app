import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { closeDb, getDb, migrate } from "../lib/db";
import {
  clockEmployee,
  createEmployee,
  getEmployeeByToken,
} from "../lib/employees";
import { createJob, listJobsForEmployee } from "../lib/jobs";

const ADDITION_SQL = fs.readFileSync(
  path.join(process.cwd(), "db/migrations/002_employee_job_additions.sql"),
  "utf8",
);

const EXPECTED_STATEMENTS = [
  "ALTER TABLE employees ADD COLUMN unique_link_token VARCHAR(255) UNIQUE;",
  "ALTER TABLE employees ADD COLUMN is_on_clock BOOLEAN DEFAULT FALSE;",
  "ALTER TABLE employees ADD COLUMN current_lat FLOAT;",
  "ALTER TABLE employees ADD COLUMN current_lng FLOAT;",
  "ALTER TABLE jobs ADD COLUMN customer_name VARCHAR(255);",
  "ALTER TABLE jobs ADD COLUMN customer_phone VARCHAR(50);",
  "ALTER TABLE jobs ADD COLUMN address TEXT;",
  "ALTER TABLE jobs ADD COLUMN street_view_url TEXT;",
  "ALTER TABLE jobs ADD COLUMN boss_notes TEXT;",
  "ALTER TABLE jobs ADD COLUMN required_supplies TEXT;",
];

test("postgres addition migration matches the requested ALTER statements", () => {
  for (const statement of EXPECTED_STATEMENTS) {
    assert.match(
      ADDITION_SQL,
      new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
});

test("sqlite migrate adds employee and job columns, then stores values", () => {
  process.env.JOB_COMMAND_SEED = "0";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "job-command-"));
  const file = path.join(dir, "test.sqlite");
  process.env.JOB_COMMAND_DB = file;
  closeDb();
  const db = getDb(file);
  migrate(db);

  const employeeCols = new Set(
    (db.prepare("PRAGMA table_info(employees)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
  for (const column of [
    "unique_link_token",
    "is_on_clock",
    "current_lat",
    "current_lng",
  ]) {
    assert.equal(employeeCols.has(column), true, `missing employees.${column}`);
  }

  const jobCols = new Set(
    (db.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
  for (const column of [
    "customer_name",
    "customer_phone",
    "address",
    "street_view_url",
    "boss_notes",
    "required_supplies",
  ]) {
    assert.equal(jobCols.has(column), true, `missing jobs.${column}`);
  }

  const employee = createEmployee({ name: "Test Tech", phone: "555-0100" });
  assert.ok(employee.unique_link_token);
  assert.equal(employee.is_on_clock, false);
  assert.equal(employee.current_lat, null);

  const onClock = clockEmployee(employee.id, true, { lat: 27.95, lng: -82.45 });
  assert.equal(onClock?.is_on_clock, true);
  assert.equal(onClock?.current_lat, 27.95);
  assert.equal(onClock?.current_lng, -82.45);
  assert.equal(
    getEmployeeByToken(employee.unique_link_token as string)?.id,
    employee.id,
  );

  const job = createJob({
    customer_name: "Pat Customer",
    customer_phone: "555-0199",
    address: "400 N Ashley Dr, Tampa, FL",
    boss_notes: "Bring the 6ft ladder.",
    required_supplies: "Filter, capacitor",
    assigned_employee_id: employee.id,
  });
  assert.equal(job.customer_name, "Pat Customer");
  assert.equal(job.customer_phone, "555-0199");
  assert.match(job.address ?? "", /Ashley/);
  assert.match(job.street_view_url ?? "", /google\.com\/maps/);
  assert.equal(job.boss_notes, "Bring the 6ft ladder.");
  assert.equal(job.required_supplies, "Filter, capacitor");
  assert.equal(listJobsForEmployee(employee.id).length, 1);

  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
