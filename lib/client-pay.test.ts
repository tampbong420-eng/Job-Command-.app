import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cardPaymentsReady, clientPayView, shopContactEmail, shopContactPhone, telHref } from "./client-pay";
import { invoiceMail } from "./estimate-copy";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

function fnBody(source: string, signature: string) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing ${signature}`);
  const next = source.indexOf("\nexport ", start + signature.length);
  return source.slice(start, next < 0 ? undefined : next);
}

test("card payments need a Stripe key AND the shop's own payout account", () => {
  assert.equal(cardPaymentsReady({ stripeKey: false, connectAccountId: "acct_1", connectStatus: "complete" }), false);
  assert.equal(cardPaymentsReady({ stripeKey: true }), false, "no payout account = money would land in the platform");
  assert.equal(cardPaymentsReady({ stripeKey: true, connectAccountId: "acct_1", connectStatus: "pending" }), false);
  assert.equal(cardPaymentsReady({ stripeKey: true, connectAccountId: "acct_1", connectStatus: "complete" }), true);
  assert.equal(cardPaymentsReady({ stripeKey: true, envConnectAccountId: "acct_env" }), true);
  assert.equal(
    cardPaymentsReady({ stripeKey: true, connectAccountId: "acct_1", connectStatus: "complete", acceptCard: false }),
    false,
    "shop turned card payments off"
  );
});

test("the client page only says Paid when the invoice row is PAID (audit bug 4)", () => {
  assert.equal(clientPayView({ status: "PAID", returnedFromCheckout: false, cardReady: false }), "paid");
  assert.equal(clientPayView({ status: "PENDING", returnedFromCheckout: false, cardReady: false }), "not-set-up");
  assert.equal(clientPayView({ status: "PENDING", returnedFromCheckout: false, cardReady: true }), "card");
  // ?paid=1 is typed into a URL by anyone: it never becomes "paid".
  assert.equal(clientPayView({ status: "PENDING", returnedFromCheckout: true, cardReady: true }), "processing");
  assert.equal(clientPayView({ status: "PENDING", returnedFromCheckout: true, cardReady: false }), "not-set-up");
  assert.equal(clientPayView({ status: "DRAFT", returnedFromCheckout: true, cardReady: true }), "processing");
});

test("client pay code paths never mark an invoice paid", () => {
  const actions = read("app/actions.ts");
  assert.ok(!actions.includes("clientPayInvoice"), "the old mark-paid-on-tap action is gone");
  const start = fnBody(actions, "export async function startInvoiceCardPayment(");
  assert.ok(!/markInvoicePaid|status:\s*"PAID"|advanceJobPipeline/.test(start));
  const opener = fnBody(read("lib/send-invoice.ts"), "export async function openClientCardCheckout(");
  assert.ok(!/markInvoicePaid|"PAID"\s*[,}]|status:/.test(opener.replace(/invoice\.status === "PAID"/g, "")));
  const client = read("app/p/[token]/PayClient.tsx");
  assert.ok(!/markInvoicePaid|clientPayInvoice|toast\.success\(\s*"Paid/.test(client));
});

test("the client never sees the Job Command platform fee", () => {
  const page = read("app/p/[token]/page.tsx") + read("app/p/[token]/PayClient.tsx");
  assert.ok(!/Job Command fee|1%|feeDollars|splitInvoicePayment/.test(page));
  const mail = invoiceMail({ who: "Ann", jobName: "Porch", total: "$280.00", url: "https://x/p/t", fee: "$2.80" });
  assert.ok(!/2\.80|1%|fee/i.test(mail.text + mail.html + mail.sms));
});

test("invoice email is honest when card payments are not set up", () => {
  const ready = invoiceMail({ who: "Ann", jobName: "Porch", total: "$280.00", url: "https://x/p/t" });
  assert.match(ready.text, /Pay by card/);
  const off = invoiceMail({ who: "Ann", jobName: "Porch", total: "$280.00", url: "https://x/p/t", cardReady: false });
  assert.ok(!/Pay by card/.test(off.text + off.html));
  assert.match(off.text, /View your invoice/);
  assert.match(off.html, /View invoice/);
});

test("no checkout without a payout destination", () => {
  const source = read("lib/invoice-pay.ts");
  assert.match(source, /!stripeSecret\(\) \|\| split\.totalCents < 50 \|\| !destination/);
});

test("shop contact for the not-set-up state", () => {
  assert.equal(telHref("(501) 555-0142"), "tel:5015550142");
  assert.equal(telHref("12"), "");
  assert.equal(shopContactPhone({ companyPhone: "", ownerPhone: "501-555-0142" }), "501-555-0142");
  assert.equal(shopContactPhone({ companyPhone: "501 555 0100", ownerPhone: "501-555-0142" }), "501 555 0100");
  assert.equal(shopContactEmail({ businessEmail: "nope", ownerEmail: "o@shop.com" }), "o@shop.com");
});

test("the app splash never covers the client's invoice or estimate page", () => {
  const burst = read("components/command/LogoBurst.tsx");
  assert.match(burst, /isClientDocumentPath\(pathname\)\) return null/);
  assert.match(burst, /\^\\\/\(p\|e\)\\\//);
});
