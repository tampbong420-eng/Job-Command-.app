/**
 * Tag older schedule rows JOB / ESTIMATE from each job's current stage. Safe to re-run.
 *   npx tsx scripts/backfill-entry-kind.ts
 */
import { PrismaClient } from "@prisma/client";
import { backfillEntryKinds } from "../lib/entry-kind-backfill";

const prisma = new PrismaClient();

backfillEntryKinds(prisma)
  .then((result) => {
    console.log(
      result.tagged
        ? `Tagged ${result.tagged} schedule rows: ${result.estimate} estimate, ${result.job} job.`
        : "Nothing to tag. Every schedule row already has a kind."
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
