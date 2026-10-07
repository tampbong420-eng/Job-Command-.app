// Vercel build (vercel.json buildCommand). Local `npm run build` is unchanged and keeps SQLite.
// On Vercel the database must be hosted Postgres: SQLite in a function is a throwaway /tmp copy, so saves vanish.
// Schema changes are NOT pushed here (a preview build must never alter the shared database); run
// `npm run db:push:postgres` from a trusted machine instead. See DEPLOY-VERCEL.md.
import { execSync } from "node:child_process";
import { writePostgresSchema } from "./postgres-schema.mjs";

const url = process.env.DATABASE_URL || "";
const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (/^postgres(ql)?:\/\//i.test(url)) {
  const schema = writePostgresSchema();
  run(`npx prisma generate --schema "${schema}"`);
} else if (process.env.VERCEL === "1") {
  console.error("DATABASE_URL is not a Postgres URL. Connect the Neon database to this Vercel project first.");
  process.exit(1);
} else {
  run("npx prisma generate");
}
run("npx next build");
