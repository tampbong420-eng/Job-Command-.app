import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { resolveStreetViewUrl } from "./street-view";

type DbCache = {
  instance: DatabaseSync | null;
  file: string | null;
};

const globalForDb = globalThis as typeof globalThis & {
  __jobCommandDb?: DbCache;
};

function cache(): DbCache {
  if (!globalForDb.__jobCommandDb) {
    globalForDb.__jobCommandDb = { instance: null, file: null };
  }
  return globalForDb.__jobCommandDb;
}

export function defaultDbPath(): string {
  return (
    process.env.JOB_COMMAND_DB ??
    path.join(process.cwd(), "data", "job-command.sqlite")
  );
}

const BASE_TABLES = `
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  assigned_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

// SQLite cannot add UNIQUE inline via ALTER TABLE, so unique_link_token
// uniqueness is enforced with an index after the column exists.
const SQLITE_ADDITIONS = [
  "ALTER TABLE employees ADD COLUMN unique_link_token TEXT",
  "ALTER TABLE employees ADD COLUMN is_on_clock INTEGER DEFAULT 0",
  "ALTER TABLE employees ADD COLUMN current_lat REAL",
  "ALTER TABLE employees ADD COLUMN current_lng REAL",
  "ALTER TABLE jobs ADD COLUMN customer_name TEXT",
  "ALTER TABLE jobs ADD COLUMN customer_phone TEXT",
  "ALTER TABLE jobs ADD COLUMN address TEXT",
  "ALTER TABLE jobs ADD COLUMN street_view_url TEXT",
  "ALTER TABLE jobs ADD COLUMN boss_notes TEXT",
  "ALTER TABLE jobs ADD COLUMN required_supplies TEXT",
  `CREATE UNIQUE INDEX IF NOT EXISTS employees_unique_link_token
    ON employees (unique_link_token)`,
];

const TIME_ENTRIES_TABLE = `
CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  clocked_in_at TEXT NOT NULL,
  clocked_out_at TEXT
);
CREATE INDEX IF NOT EXISTS time_entries_employee_idx
  ON time_entries (employee_id, clocked_in_at);
`;

function isIgnorableAlterError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("duplicate column name") ||
    text.includes("already exists")
  );
}

export function newLinkToken(): string {
  return randomBytes(18).toString("base64url");
}

export function migrate(db: DatabaseSync): void {
  db.exec(BASE_TABLES);
  for (const statement of SQLITE_ADDITIONS) {
    try {
      db.exec(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isIgnorableAlterError(message)) throw error;
    }
  }
  db.exec(TIME_ENTRIES_TABLE);
}

function seedIfEmpty(db: DatabaseSync): void {
  const count = db.prepare("SELECT COUNT(*) AS n FROM employees").get() as {
    n: number;
  };
  if (count.n > 0) return;

  const now = new Date().toISOString();
  const ericId = randomUUID();
  const rickyId = randomUUID();
  const dinaId = randomUUID();
  const jobId = randomUUID();
  const address = "123 Painted Post Rd, Hot Springs, AR";

  const insertEmployee = db.prepare(`
    INSERT INTO employees (
      id, name, role, phone, unique_link_token, is_on_clock,
      current_lat, current_lng, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
  `);

  insertEmployee.run(
    ericId,
    "Eric St. Lawrence",
    "Field Worker / Contractor",
    "501-555-0108",
    newLinkToken(),
    0,
    now,
    now,
  );
  insertEmployee.run(
    rickyId,
    "Ricky",
    "Lead tech",
    "501-555-0142",
    newLinkToken(),
    1,
    now,
    now,
  );
  insertEmployee.run(
    dinaId,
    "Dina",
    "Crew",
    "501-555-0198",
    newLinkToken(),
    0,
    now,
    now,
  );

  db.prepare(
    `INSERT INTO time_entries (id, employee_id, clocked_in_at, clocked_out_at)
     VALUES (?, ?, ?, NULL)`,
  ).run(randomUUID(), rickyId, now);

  db.prepare(`
    INSERT INTO jobs (
      id, title, status, assigned_employee_id,
      customer_name, customer_phone, address, street_view_url,
      boss_notes, required_supplies, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    jobId,
    "Northline Properties",
    "assigned",
    ericId,
    "John Doe",
    "501-555-0192",
    address,
    resolveStreetViewUrl(address, null),
    "Make sure drop cloths cover all perimeter landscaping. Use exterior grade primer on south-facing trim.",
    "2x Graco TrueCoat 360, 5 gal Exterior Satin White, 3x Blue Tape rolls, Ladder stabilizer.",
    now,
    now,
  );
}

function open(file: string): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  if (process.env.JOB_COMMAND_SEED !== "0") {
    seedIfEmpty(db);
  }
  return db;
}

export function getDb(file = defaultDbPath()): DatabaseSync {
  const slot = cache();
  if (!slot.instance || slot.file !== file) {
    slot.instance?.close();
    slot.instance = open(file);
    slot.file = file;
  }
  return slot.instance;
}

export function closeDb(): void {
  const slot = cache();
  slot.instance?.close();
  slot.instance = null;
  slot.file = null;
}

export function toBool(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}

export function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toStr(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
