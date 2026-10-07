import assert from "node:assert/strict";
import test from "node:test";
import { compileInvoiceLines } from "./invoice-compile";
import { invoiceTone } from "./job-pipeline";
import { readStripeInvoiceId, resolveConnectDestination, splitInvoicePayment } from "./invoice-split";
import { stripeSignatureValid } from "./stripe-signature";
import { createHmac } from "crypto";
import type { EmployeeDTO, EstimateDTO } from "./types";

test("platform fee is 1 percent to Job Command", () => {
  const split = splitInvoicePayment(222);
  assert.equal(split.totalCents, 22200);
  assert.equal(split.feeCents, 222);
  assert.equal(split.contractorCents, 21978);
  assert.equal(split.feeDollars, 2.22);
  const small = splitInvoicePayment(10);
  assert.equal(small.feeCents, 10);
  assert.equal(small.contractorCents, 990);
  assert.equal(resolveConnectDestination("acct_shop"), "acct_shop");
});

test("invoice lines compile live labor hours onto the bid", () => {
  const estimate: EstimateDTO = {
    id: "est_1",
    number: "EST-1002",
    jobId: "job_lake",
    customerId: "cust_maya",
    status: "ACCEPTED",
    notes: "Fascia",
    terms: "",
    taxRate: 0,
    publicToken: "tok",
    sentAt: "2026-09-17T12:00:00.000Z",
    viewedAt: null,
    acceptedAt: "2026-09-17T13:00:00.000Z",
    changesAt: null,
    signedName: "Maya",
    clientNote: "",
    sentEmail: true,
    sentSms: true,
    lastFollowUpAt: null,
    followUpCount: 0,
    createdAt: "2026-09-16T12:00:00.000Z",
    lines: [
      { id: "l1", kind: "LABOR", description: "Paint labor", quantity: 8, unit: "hr", rate: 45, amount: 360 },
      { id: "m1", kind: "MATERIAL", description: "Duration", quantity: 4, unit: "gal", rate: 52, amount: 208 },
    ],
    deliveries: [],
  };
  const employees: EmployeeDTO[] = [
    {
      id: "emp_maya",
      firstName: "Maya",
      lastName: "Chen",
      jobTitle: "Painter",
      photoUrl: null,
      email: "",
      phone: "",
      payType: "HOURLY",
      hourlyRate: 45,
      salaryAnnual: 0,
      baselineStartDate: "2026-01-01",
      payFrequency: "WEEKLY",
      federalWithholdPct: 14,
      stateWithholdPct: 5,
      ytdGross: 0,
      ytdFederalTax: 0,
      ytdStateTax: 0,
      ytdNet: 0,
      ytdOvertime: 0,
      timeEntries: [
        {
          id: "t1",
          date: "2026-09-18",
          scheduledHours: 8,
          actualHours: 6.5,
          clockIn: "2026-09-18T13:00:00.000Z",
          clockOut: "2026-09-18T19:30:00.000Z",
          scheduledStart: "07:00",
          scheduledEnd: "15:00",
          status: "COMPLETE",
          jobId: "job_lake",
          serviceCodeId: null,
          notes: null,
          job: null,
          serviceCode: null,
        },
      ],
      payPeriods: [],
      adjustments: [
        {
          id: "a1",
          payPeriodId: null,
          jobId: "job_lake",
          type: "REIMBURSEMENT",
          category: "MATERIALS",
          description: "Tips",
          amount: 18,
        },
      ],
      auditLogs: [],
    },
  ];
  const lines = compileInvoiceLines({ estimate, employees, jobId: "job_lake", now: new Date("2026-09-18T20:00:00.000Z") });
  const labor = lines.find((line) => line.kind === "LABOR");
  assert.equal(labor?.quantity, 6.5);
  assert.equal(labor?.rate, 45);
  assert.ok(lines.some((line) => line.kind === "MATERIAL" && line.description === "Duration"));
  assert.ok(lines.some((line) => /job-site materials/i.test(line.description) && line.rate === 18));
});

test("stripe webhook reads the invoice id and verifies the signature", () => {
  const hit = readStripeInvoiceId({
    type: "checkout.session.completed",
    data: { object: { id: "cs_1", client_reference_id: "inv_1", metadata: { invoiceId: "inv_1" } } },
  });
  assert.equal(hit?.invoiceId, "inv_1");
  assert.equal(
    readStripeInvoiceId({
      type: "checkout.session.completed",
      data: { object: { id: "cs_bill", client_reference_id: "billing:base", metadata: { kind: "base" } } },
    }),
    null
  );
  const secret = "whsec_test";
  const body = "{\"id\":\"evt_1\"}";
  const timestamp = "1710000000";
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
  assert.equal(stripeSignatureValid(body, `t=${timestamp},v1=${digest}`, secret), true);
  assert.equal(stripeSignatureValid(body, `t=${timestamp},v1=deadbeef`, secret), false);
});

test("dark green is sent (partial) then paid (solid)", () => {
  assert.equal(invoiceTone({ invoiceSent: false, paid: false }), "empty");
  assert.equal(invoiceTone({ invoiceSent: true, paid: false }), "sent");
  assert.equal(invoiceTone({ invoiceSent: true, paid: true }), "paid");
});

test("stripe webhook signatures older than the tolerance are rejected (replay guard)", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';
  const timestamp = "1710000000";
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
  const header = `t=${timestamp},v1=${digest}`;
  assert.equal(stripeSignatureValid(body, header, secret, { toleranceSec: 300, nowSec: 1710000100 }), true);
  assert.equal(stripeSignatureValid(body, header, secret, { toleranceSec: 300, nowSec: 1710009999 }), false);
});
