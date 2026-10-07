# Deploying Job Command to Vercel

Local dev is unchanged: SQLite (`prisma/dev.db`), uploads in `public/uploads/`, `npm run dev`.

On Vercel the app needs two hosted pieces, because a Vercel function has no lasting disk:

| Piece | Vercel project env | What uses it |
| --- | --- | --- |
| Postgres (Neon, Vercel Marketplace, free) | `DATABASE_URL` (pooled) | every Prisma read/write |
| Vercel Blob store (free) | `BLOB_READ_WRITE_TOKEN` (added when the store is connected) | crew photos, logo, job photos, receipts (`lib/upload-store.ts`) |

Other env on Vercel: `SESSION_SECRET`, `CRON_SECRET`, `TRIAL_GUARD_SECRET` (random). AI goes through the
Vercel AI Gateway with the deployment's OIDC token, no key (`lib/ai-config.ts`). No Stripe keys: billing
stays in mock mode.

## How the build picks Postgres

`vercel.json` sets `buildCommand: npm run build:vercel` → `scripts/vercel-build.mjs`:

1. `scripts/postgres-schema.mjs` writes `prisma/schema.postgres.prisma` (gitignored) from `prisma/schema.prisma`
   with `provider = "postgresql"`. `schema.prisma` stays the only schema anyone edits.
2. `prisma generate --schema prisma/schema.postgres.prisma`, then `next build`.
3. On Vercel, a non-Postgres `DATABASE_URL` fails the build on purpose (SQLite saves would vanish).

Running `npm run build:vercel` on your own machine with a Postgres `DATABASE_URL` regenerates the Prisma client
for Postgres; run `npx prisma generate` afterwards to get the SQLite client back for `npm run dev` / `npm test`.

The build never changes the database. After a schema change, from a trusted machine:

```bash
DATABASE_URL="<direct (non-pooler) Postgres URL>" npm run db:push:postgres
```

`db push` refuses destructive changes unless you add `--accept-data-loss` yourself.

## Copying a SQLite database into an empty Postgres

```bash
cp prisma/dev.db /tmp/shop-copy.db            # never point it at the live file
DATABASE_URL="<direct URL>" npm run db:push:postgres
SQLITE_FILE=/tmp/shop-copy.db POSTGRES_URL="<direct URL>" npm run db:copy-to-postgres
```

The copy refuses to write into a database that already has rows and prints a per-table count check.

## Cron

Vercel Hobby allows only daily cron jobs, so `vercel.json` runs estimate follow-up, alerts, and job cost once a
day (14:00–14:15 UTC, 9 AM Central). Hourly needs Vercel Pro (`0 *`, `5 *`, `15 *`).

## Lint

`next.config.mjs` sets `eslint.ignoreDuringBuilds` because a few unused-variable lint errors in shared files
fail `next build`. Type errors still fail the build; run `npm run lint` to see the lint list.
