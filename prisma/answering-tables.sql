-- AI call answering tables (additive). Applies only the four new tables + indexes, never touches existing tables.
-- SQLite: npx prisma db execute --file prisma/answering-tables.sql --schema prisma/schema.prisma
-- Postgres/production: use `npx prisma db push` instead (Prisma builds the same tables from schema.prisma).

-- CreateTable
CREATE TABLE IF NOT EXISTS "AnsweringSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "voice" TEXT NOT NULL DEFAULT 'male',
    "estimatorId" TEXT NOT NULL DEFAULT '',
    "estimateMinutes" INTEGER NOT NULL DEFAULT 60,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 30,
    "minutesCap" INTEGER NOT NULL DEFAULT 200,
    "retellAgentId" TEXT NOT NULL DEFAULT '',
    "retellLlmId" TEXT NOT NULL DEFAULT '',
    "retellNumber" TEXT NOT NULL DEFAULT '',
    "connectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CallCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    "retellCallId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL DEFAULT '',
    "fromNumber" TEXT NOT NULL DEFAULT '',
    "toNumber" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'full',
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "outcome" TEXT NOT NULL DEFAULT 'NEW',
    "callerName" TEXT NOT NULL DEFAULT '',
    "callerPhone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "jobType" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    "preferredTime" TEXT NOT NULL DEFAULT '',
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "summary" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT NOT NULL DEFAULT '[]',
    "recordingUrl" TEXT NOT NULL DEFAULT '',
    "endReason" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "meteredMonth" TEXT NOT NULL DEFAULT '',
    "customerId" TEXT,
    "jobId" TEXT,
    "timeEntryId" TEXT,
    "bookedDate" TEXT NOT NULL DEFAULT '',
    "bookedStart" TEXT NOT NULL DEFAULT '',
    "bookedEnd" TEXT NOT NULL DEFAULT '',
    "alertId" TEXT,
    "reviewedAt" DATETIME,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AnsweringUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    "month" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "messageCalls" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AnsweringSlotLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AnsweringSettings_shopId_key" ON "AnsweringSettings"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CallCard_retellCallId_key" ON "CallCard"("retellCallId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CallCard_shopId_createdAt_idx" ON "CallCard"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AnsweringUsage_shopId_month_key" ON "AnsweringUsage"("shopId", "month");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AnsweringSlotLock_shopId_employeeId_date_start_key" ON "AnsweringSlotLock"("shopId", "employeeId", "date", "start");
