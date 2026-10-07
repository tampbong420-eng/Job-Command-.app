-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";
-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "photoUrl" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "payType" TEXT NOT NULL DEFAULT 'HOURLY',
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaryAnnual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baselineStartDate" TIMESTAMP(3) NOT NULL,
    "payFrequency" TEXT NOT NULL DEFAULT 'WEEKLY',
    "federalWithholdPct" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "stateWithholdPct" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "payMethod" TEXT NOT NULL DEFAULT '',
    "filingStatus" TEXT NOT NULL DEFAULT '',
    "allowances" INTEGER NOT NULL DEFAULT 0,
    "onboardedAt" TIMESTAMP(3),
    "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "employmentEndDate" TIMESTAMP(3),
    "depositRouting" TEXT NOT NULL DEFAULT '',
    "depositAccount" TEXT NOT NULL DEFAULT '',
    "depositAccountType" TEXT NOT NULL DEFAULT 'CHECKING',
    "ytdGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ytdFederalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ytdStateTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ytdNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ytdOvertime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "payFrequency" TEXT NOT NULL DEFAULT 'WEEKLY',
    "periodAnchor" TIMESTAMP(3) NOT NULL,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "ownerFirstName" TEXT NOT NULL DEFAULT '',
    "ownerLastName" TEXT NOT NULL DEFAULT '',
    "ownerEmail" TEXT NOT NULL DEFAULT '',
    "ownerPhone" TEXT NOT NULL DEFAULT '',
    "businessName" TEXT NOT NULL DEFAULT '',
    "businessAddress" TEXT NOT NULL DEFAULT '',
    "businessEmail" TEXT NOT NULL DEFAULT '',
    "industry" TEXT NOT NULL DEFAULT '',
    "businessSize" TEXT NOT NULL DEFAULT '',
    "acceptCard" BOOLEAN NOT NULL DEFAULT true,
    "acceptAch" BOOLEAN NOT NULL DEFAULT false,
    "acceptCash" BOOLEAN NOT NULL DEFAULT true,
    "depositPercent" INTEGER NOT NULL DEFAULT 0,
    "accountingSoftware" TEXT NOT NULL DEFAULT 'NONE',
    "companyPhone" TEXT NOT NULL DEFAULT '',
    "answeringLine" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT,
    "quietStart" TEXT NOT NULL DEFAULT '19:00',
    "quietEnd" TEXT NOT NULL DEFAULT '07:00',
    "vapidPublic" TEXT NOT NULL DEFAULT '',
    "vapidPrivate" TEXT NOT NULL DEFAULT '',
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "billingStatus" TEXT NOT NULL DEFAULT 'none',
    "stripeCustomerId" TEXT NOT NULL DEFAULT '',
    "stripeSubId" TEXT NOT NULL DEFAULT '',
    "stripeAddonSubId" TEXT NOT NULL DEFAULT '',
    "addonStatus" TEXT NOT NULL DEFAULT 'locked',
    "cardBrand" TEXT NOT NULL DEFAULT '',
    "cardLast4" TEXT NOT NULL DEFAULT '',
    "connectAccountId" TEXT NOT NULL DEFAULT '',
    "connectStatus" TEXT NOT NULL DEFAULT 'unlinked',
    "connectBankLast4" TEXT NOT NULL DEFAULT '',
    "cardCheckAt" TIMESTAMP(3),
    "cardCheckToken" TEXT NOT NULL DEFAULT '',
    "cardCheckPm" TEXT NOT NULL DEFAULT '',
    "cardCheckFingerprint" TEXT NOT NULL DEFAULT '',
    "trialGuard" TEXT NOT NULL DEFAULT '',
    "trialReminderSentAt" TIMESTAMP(3),
    "billingCheckedAt" TIMESTAMP(3),
    "planInterval" TEXT NOT NULL DEFAULT '',
    "renewsAt" TIMESTAMP(3),
    "renewalReminderAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT NOT NULL DEFAULT '',
    "estimatePrompt" TEXT NOT NULL DEFAULT '',
    "shellTheme" TEXT NOT NULL DEFAULT 'ink',
    "shellInk" TEXT NOT NULL DEFAULT '',
    "tradeLabel" TEXT NOT NULL DEFAULT '',
    "services" TEXT NOT NULL DEFAULT '',
    "serviceRadiusMi" INTEGER NOT NULL DEFAULT 30,
    "workDays" TEXT NOT NULL DEFAULT 'MON_FRI',
    "workStart" TEXT NOT NULL DEFAULT '07:00',
    "workEnd" TEXT NOT NULL DEFAULT '17:00',
    "laborRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "materialsMarkup" INTEGER NOT NULL DEFAULT 20,
    "estimateValidDays" INTEGER NOT NULL DEFAULT 30,
    "tradeDefaults" TEXT NOT NULL DEFAULT '',
    "licenseNumber" TEXT NOT NULL DEFAULT '',
    "insuranceCarrier" TEXT NOT NULL DEFAULT '',
    "laterDone" TEXT NOT NULL DEFAULT '',
    "reviewLink" TEXT NOT NULL DEFAULT '',
    "recoveryEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Boss" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "hasAppAccess" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "Boss_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "jobId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT 'Payment due upon completion. Net 15.',
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "publicToken" TEXT,
    "payUrl" TEXT NOT NULL DEFAULT '',
    "stripeSessionId" TEXT NOT NULL DEFAULT '',
    "stripePaymentIntent" TEXT NOT NULL DEFAULT '',
    "applicationFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT 'This estimate is valid for 30 days.',
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "publicToken" TEXT,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "changesAt" TIMESTAMP(3),
    "signedName" TEXT NOT NULL DEFAULT '',
    "clientNote" TEXT NOT NULL DEFAULT '',
    "sentEmail" BOOLEAN NOT NULL DEFAULT false,
    "sentSms" BOOLEAN NOT NULL DEFAULT false,
    "lastFollowUpAt" TIMESTAMP(3),
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "DeliveryEvent" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "customerId" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerId" TEXT NOT NULL DEFAULT '',
    "toAddress" TEXT NOT NULL DEFAULT '',
    "actor" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "DocLine" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT,
    "invoiceId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT '',
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "DocLine_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "customerId" TEXT,
    "address" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "timeline" TEXT NOT NULL DEFAULT '',
    "dueDate" TIMESTAMP(3),
    "pipeline" INTEGER NOT NULL DEFAULT 0,
    "leadCalledAt" TIMESTAMP(3),
    "prepChecklist" TEXT NOT NULL DEFAULT '{}',
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "JobPhoto" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "JobPhoto_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT 'Receipt',
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ServiceCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "ServiceCode_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "scheduledHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clockIn" TIMESTAMP(3),
    "clockOut" TIMESTAMP(3),
    "scheduledStart" TEXT,
    "scheduledEnd" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "jobId" TEXT,
    "kind" TEXT NOT NULL DEFAULT '',
    "serviceCodeId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "PayPeriod" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL,
    "regularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "regularPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimePay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reimbursements" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "federalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stateTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "PayPeriod_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "PayAdjustment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payPeriodId" TEXT,
    "jobId" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "PayAdjustment_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "JobCost" (
    "jobId" TEXT NOT NULL,
    "laborHoursBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborHoursActual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCostBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCostActual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "materialBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "materialActual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherActual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overLabor" BOOLEAN NOT NULL DEFAULT false,
    "overMaterial" BOOLEAN NOT NULL DEFAULT false,
    "learned" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "JobCost_pkey" PRIMARY KEY ("jobId")
);
-- CreateTable
CREATE TABLE "PriceMemory" (
    "key" TEXT NOT NULL,
    "avgRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "PriceMemory_pkey" PRIMARY KEY ("key")
);
-- CreateTable
CREATE TABLE "TrialClaim" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "valueHash" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'trial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrialClaim_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL DEFAULT '/',
    "jobId" TEXT,
    "employeeId" TEXT,
    "readAt" TIMESTAMP(3),
    "heldUntil" TIMESTAMP(3),
    "pushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CREW',
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "employeeId" TEXT,
    "inviteToken" TEXT,
    "pinMustChange" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CrewPing" (
    "employeeId" TEXT NOT NULL,
    "jobId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "CrewPing_pkey" PRIMARY KEY ("employeeId")
);
-- CreateTable
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'office',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AnsweringSettings" (
    "id" TEXT NOT NULL,
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
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnsweringSettings_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CallCard" (
    "id" TEXT NOT NULL,
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
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "meteredMonth" TEXT NOT NULL DEFAULT '',
    "customerId" TEXT,
    "jobId" TEXT,
    "timeEntryId" TEXT,
    "bookedDate" TEXT NOT NULL DEFAULT '',
    "bookedStart" TEXT NOT NULL DEFAULT '',
    "bookedEnd" TEXT NOT NULL DEFAULT '',
    "alertId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CallCard_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AnsweringUsage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    "month" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "messageCalls" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnsweringUsage_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AnsweringSlotLock" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnsweringSlotLock_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "PinReset" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL DEFAULT 'default',
    "accountId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ip" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PinReset_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastFailAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);
-- CreateIndex
CREATE INDEX "Employee_shopId_idx" ON "Employee"("shopId");
-- CreateIndex
CREATE INDEX "Boss_shopId_idx" ON "Boss"("shopId");
-- CreateIndex
CREATE INDEX "Customer_shopId_idx" ON "Customer"("shopId");
-- CreateIndex
CREATE UNIQUE INDEX "Invoice_publicToken_key" ON "Invoice"("publicToken");
-- CreateIndex
CREATE INDEX "Invoice_shopId_idx" ON "Invoice"("shopId");
-- CreateIndex
CREATE UNIQUE INDEX "Invoice_shopId_number_key" ON "Invoice"("shopId", "number");
-- CreateIndex
CREATE UNIQUE INDEX "Estimate_jobId_key" ON "Estimate"("jobId");
-- CreateIndex
CREATE UNIQUE INDEX "Estimate_publicToken_key" ON "Estimate"("publicToken");
-- CreateIndex
CREATE INDEX "Estimate_shopId_idx" ON "Estimate"("shopId");
-- CreateIndex
CREATE UNIQUE INDEX "Estimate_shopId_number_key" ON "Estimate"("shopId", "number");
-- CreateIndex
CREATE INDEX "DeliveryEvent_estimateId_createdAt_idx" ON "DeliveryEvent"("estimateId", "createdAt");
-- CreateIndex
CREATE INDEX "DeliveryEvent_customerId_createdAt_idx" ON "DeliveryEvent"("customerId", "createdAt");
-- CreateIndex
CREATE INDEX "DeliveryEvent_provider_providerId_idx" ON "DeliveryEvent"("provider", "providerId");
-- CreateIndex
CREATE INDEX "DeliveryEvent_shopId_idx" ON "DeliveryEvent"("shopId");
-- CreateIndex
CREATE INDEX "DocLine_shopId_idx" ON "DocLine"("shopId");
-- CreateIndex
CREATE INDEX "Job_customerId_idx" ON "Job"("customerId");
-- CreateIndex
CREATE INDEX "Job_shopId_idx" ON "Job"("shopId");
-- CreateIndex
CREATE UNIQUE INDEX "Job_shopId_code_key" ON "Job"("shopId", "code");
-- CreateIndex
CREATE INDEX "JobPhoto_jobId_createdAt_idx" ON "JobPhoto"("jobId", "createdAt");
-- CreateIndex
CREATE INDEX "JobPhoto_shopId_idx" ON "JobPhoto"("shopId");
-- CreateIndex
CREATE INDEX "Receipt_shopId_idx" ON "Receipt"("shopId");
-- CreateIndex
CREATE INDEX "ServiceCode_shopId_idx" ON "ServiceCode"("shopId");
-- CreateIndex
CREATE UNIQUE INDEX "ServiceCode_shopId_code_key" ON "ServiceCode"("shopId", "code");
-- CreateIndex
CREATE INDEX "TimeEntry_employeeId_date_idx" ON "TimeEntry"("employeeId", "date");
-- CreateIndex
CREATE INDEX "TimeEntry_employeeId_date_jobId_idx" ON "TimeEntry"("employeeId", "date", "jobId");
-- CreateIndex
CREATE INDEX "TimeEntry_shopId_idx" ON "TimeEntry"("shopId");
-- CreateIndex
CREATE INDEX "PayPeriod_employeeId_startDate_idx" ON "PayPeriod"("employeeId", "startDate");
-- CreateIndex
CREATE INDEX "PayPeriod_shopId_idx" ON "PayPeriod"("shopId");
-- CreateIndex
CREATE UNIQUE INDEX "PayPeriod_employeeId_startDate_endDate_key" ON "PayPeriod"("employeeId", "startDate", "endDate");
-- CreateIndex
CREATE INDEX "PayAdjustment_shopId_idx" ON "PayAdjustment"("shopId");
-- CreateIndex
CREATE INDEX "JobCost_shopId_idx" ON "JobCost"("shopId");
-- CreateIndex
CREATE INDEX "PriceMemory_shopId_idx" ON "PriceMemory"("shopId");
-- CreateIndex
CREATE INDEX "TrialClaim_valueHash_idx" ON "TrialClaim"("valueHash");
-- CreateIndex
CREATE UNIQUE INDEX "TrialClaim_kind_valueHash_key" ON "TrialClaim"("kind", "valueHash");
-- CreateIndex
CREATE INDEX "AuditLog_employeeId_createdAt_idx" ON "AuditLog"("employeeId", "createdAt");
-- CreateIndex
CREATE INDEX "AuditLog_shopId_idx" ON "AuditLog"("shopId");
-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");
-- CreateIndex
CREATE INDEX "Alert_heldUntil_readAt_idx" ON "Alert"("heldUntil", "readAt");
-- CreateIndex
CREATE INDEX "Alert_shopId_idx" ON "Alert"("shopId");
-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");
-- CreateIndex
CREATE UNIQUE INDEX "Account_employeeId_key" ON "Account"("employeeId");
-- CreateIndex
CREATE UNIQUE INDEX "Account_inviteToken_key" ON "Account"("inviteToken");
-- CreateIndex
CREATE INDEX "Account_role_idx" ON "Account"("role");
-- CreateIndex
CREATE INDEX "Account_shopId_idx" ON "Account"("shopId");
-- CreateIndex
CREATE INDEX "CrewPing_jobId_at_idx" ON "CrewPing"("jobId", "at");
-- CreateIndex
CREATE INDEX "CrewPing_shopId_idx" ON "CrewPing"("shopId");
-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_endpoint_key" ON "PushDevice"("endpoint");
-- CreateIndex
CREATE INDEX "PushDevice_shopId_idx" ON "PushDevice"("shopId");
-- CreateIndex
CREATE UNIQUE INDEX "AnsweringSettings_shopId_key" ON "AnsweringSettings"("shopId");
-- CreateIndex
CREATE UNIQUE INDEX "CallCard_retellCallId_key" ON "CallCard"("retellCallId");
-- CreateIndex
CREATE INDEX "CallCard_shopId_createdAt_idx" ON "CallCard"("shopId", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "AnsweringUsage_shopId_month_key" ON "AnsweringUsage"("shopId", "month");
-- CreateIndex
CREATE UNIQUE INDEX "AnsweringSlotLock_shopId_employeeId_date_start_key" ON "AnsweringSlotLock"("shopId", "employeeId", "date", "start");
-- CreateIndex
CREATE INDEX "PinReset_shopId_createdAt_idx" ON "PinReset"("shopId", "createdAt");
-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DocLine" ADD CONSTRAINT "DocLine_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DocLine" ADD CONSTRAINT "DocLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "JobPhoto" ADD CONSTRAINT "JobPhoto_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_serviceCodeId_fkey" FOREIGN KEY ("serviceCodeId") REFERENCES "ServiceCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PayAdjustment" ADD CONSTRAINT "PayAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PayAdjustment" ADD CONSTRAINT "PayAdjustment_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PayAdjustment" ADD CONSTRAINT "PayAdjustment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "JobCost" ADD CONSTRAINT "JobCost_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CrewPing" ADD CONSTRAINT "CrewPing_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CrewPing" ADD CONSTRAINT "CrewPing_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
