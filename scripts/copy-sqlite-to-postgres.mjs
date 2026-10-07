// One-time copy of a SQLite database (e.g. a COPY of prisma/dev.db) into an EMPTY Postgres database.
//   SQLITE_FILE=/abs/path/copy.db POSTGRES_URL=postgresql://... npm run db:copy-to-postgres
// Run `npm run db:push:postgres` (with DATABASE_URL=POSTGRES_URL) first so the tables exist.
// Reads with the normal SQLite Prisma client, writes with a Postgres client generated into a temp folder.
// Refuses to write if any target table already has rows. Never modifies the SQLite file.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { writePostgresSchema } from "./postgres-schema.mjs";

const require = createRequire(import.meta.url);
const sqliteFile = process.env.SQLITE_FILE && resolve(process.env.SQLITE_FILE);
const pgUrl = process.env.POSTGRES_URL || "";
if (!sqliteFile || !existsSync(sqliteFile)) throw new Error("Set SQLITE_FILE to an existing SQLite file (use a copy).");
if (!/^postgres(ql)?:\/\//.test(pgUrl)) throw new Error("Set POSTGRES_URL to the target Postgres URL.");

// Postgres client in its own folder so it never replaces the app's SQLite client (node_modules/.prisma).
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", ".jc-pg-client");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const schemaText = readFileSync(writePostgresSchema(), "utf8").replace(
  /generator\s+client\s*\{[^}]*\}/,
  `generator client {\n  provider = "prisma-client-js"\n  output   = "${join(out, "client").replace(/\\/g, "/")}"\n}`
);
const tmpSchema = join(out, "schema.prisma");
writeFileSync(tmpSchema, schemaText);
execSync(`npx prisma generate --schema "${tmpSchema}"`, { stdio: "inherit", env: { ...process.env, DATABASE_URL: pgUrl } });

const { PrismaClient: SqliteClient, Prisma } = require("@prisma/client");
const { PrismaClient: PgClient } = require(join(out, "client"));
const src = new SqliteClient({ datasourceUrl: `file:${sqliteFile}` });
const dst = new PgClient({ datasourceUrl: pgUrl });

// Parents before children, from the schema's relations.
const models = Prisma.dmmf.datamodel.models;
const deps = new Map(
  models.map((m) => [
    m.name,
    new Set(m.fields.filter((f) => f.relationFromFields?.length && f.type !== m.name).map((f) => f.type)),
  ])
);
const order = [];
const seen = new Set();
const visit = (name) => {
  if (seen.has(name)) return;
  seen.add(name);
  for (const dep of deps.get(name) || []) visit(dep);
  order.push(name);
};
models.forEach((m) => visit(m.name));
const delegate = (name) => name.charAt(0).toLowerCase() + name.slice(1);

try {
  for (const name of order) {
    const n = await dst[delegate(name)].count();
    if (n > 0) throw new Error(`Target table ${name} already has ${n} rows. Refusing to copy into a non-empty database.`);
  }
  const report = [];
  for (const name of order) {
    const model = models.find((m) => m.name === name);
    const scalars = model.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name);
    const rows = await src[delegate(name)].findMany();
    const clean = rows.map((row) => Object.fromEntries(scalars.filter((k) => k in row).map((k) => [k, row[k]])));
    for (let i = 0; i < clean.length; i += 500) {
      await dst[delegate(name)].createMany({ data: clean.slice(i, i + 500) });
    }
    const after = await dst[delegate(name)].count();
    report.push({ model: name, sqlite: rows.length, postgres: after, ok: after === rows.length });
  }
  console.table(report);
  if (report.some((r) => !r.ok)) process.exitCode = 1;
} finally {
  await src.$disconnect();
  await dst.$disconnect();
}
