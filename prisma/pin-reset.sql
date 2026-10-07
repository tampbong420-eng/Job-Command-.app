-- Go-public: owner PIN recovery + office crew PIN reset (additive). SQLite; Postgres version in CONTEXT.md.
ALTER TABLE "AppSettings" ADD COLUMN "recoveryEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Account" ADD COLUMN "pinMustChange" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "PinReset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shopId" TEXT NOT NULL DEFAULT 'default',
  "accountId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" DATETIME NOT NULL,
  "usedAt" DATETIME,
  "ip" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PinReset_shopId_createdAt_idx" ON "PinReset"("shopId", "createdAt");
