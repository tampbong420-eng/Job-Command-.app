/**
 * Go-public B5 one-off: encrypt Employee.depositRouting / depositAccount that are still plain text.
 * Idempotent. Back up the DB first (local: cp prisma/dev.db somewhere). Needs FIELD_ENCRYPTION_KEY
 * (local dev reads/makes it in .env.local; on Vercel/Postgres run it with the same key the app uses).
 *
 *   npx tsx scripts/encrypt-bank-fields.ts
 */
import { PrismaClient } from "@prisma/client";
import { sealPlainBankRows } from "../lib/bank-migrate";

const db = new PrismaClient();
sealPlainBankRows(db)
  .then((out) => console.log(`Checked ${out.checked} employees, encrypted ${out.sealed}.`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
