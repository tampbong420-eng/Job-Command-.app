import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { filledThrough, invoiceStageWord, jobPayStatus, shortMoney, stageComplete, type PipeFacts } from "./job-pipeline";

const inv = (status: "DRAFT" | "PENDING" | "PAID", amount: number, sent = true, jobId = "j1") => ({
  jobId,
  status,
  amount,
  sentAt: sent ? "2026-10-01T15:00:00.000Z" : null,
});

test("job pay status reads every invoice on the job, not just the newest (audit bug 5)", () => {
  assert.equal(jobPayStatus([], "j1").state, "none");
  assert.equal(jobPayStatus([inv("PENDING", 280, false)], "j1").state, "unsent");
  assert.deepEqual(jobPayStatus([inv("PENDING", 280)], "j1"), { state: "owed", billed: 280, paidSoFar: 0, owed: 280 });
  // Deposit paid, balance invoice open: partial, not paid.
  const dep = jobPayStatus([inv("PAID", 1250), inv("PENDING", 3750)], "j1");
  assert.deepEqual(dep, { state: "partial", billed: 5000, paidSoFar: 1250, owed: 3750 });
  // Newest paid but an older one still open: still partial.
  assert.equal(jobPayStatus([inv("PENDING", 100), inv("PAID", 50)], "j1").state, "partial");
  assert.equal(jobPayStatus([inv("PAID", 100), inv("PAID", 50)], "j1").state, "paid");
  // Drafts and other jobs don't count.
  assert.equal(jobPayStatus([inv("PAID", 100), inv("DRAFT", 999), inv("PENDING", 5, true, "other")], "j1").state, "paid");
  // Cents add up exactly.
  assert.equal(jobPayStatus([inv("PENDING", 0.1), inv("PENDING", 0.2)], "j1").owed, 0.3);
});

test("the Invoice bar says the money state, never a bare 'Paid' while money is owed", () => {
  assert.equal(invoiceStageWord(jobPayStatus([inv("PENDING", 280)], "j1"), true), "Owes $280");
  assert.equal(invoiceStageWord(jobPayStatus([inv("PAID", 1250), inv("PENDING", 3750.5)], "j1"), true), "$3,750.50 left");
  assert.equal(invoiceStageWord(jobPayStatus([inv("PENDING", 280, false)], "j1"), false), "Not sent");
  assert.equal(invoiceStageWord(undefined, false), "Not sent");
  assert.equal(invoiceStageWord(jobPayStatus([inv("PAID", 280)], "j1"), true), "Paid ✓");
  assert.equal(shortMoney(12450), "$12,450");
  const rail = readFileSync(join(__dirname, "../components/command/StageRail.tsx"), "utf8");
  assert.match(rail, /invoiceStageWord\(facts\.pay, facts\.invoiceSent\)/);
});

test("a partly paid job does not clear the Invoice stage", () => {
  const base: PipeFacts = {
    phone: "1", email: "", property: "x", leadCalled: true, appointment: true, estimateReady: true,
    estimateSent: true, estimateViewed: true, estimateApproved: true, estimateChanges: false, startDate: true,
    crewAssigned: true, materialsReady: true, onSite: true, onSiteNames: [], invoiceSent: true, paid: false,
  };
  const partial = jobPayStatus([inv("PAID", 1250), inv("PENDING", 3750)], "j1");
  const facts = { ...base, paid: partial.state === "paid", pay: partial };
  assert.equal(stageComplete(5, facts), false);
  assert.equal(filledThrough(4, facts), 4);
  const full = jobPayStatus([inv("PAID", 1250), inv("PAID", 3750)], "j1");
  assert.equal(filledThrough(4, { ...base, paid: full.state === "paid", pay: full }), 5);
});
