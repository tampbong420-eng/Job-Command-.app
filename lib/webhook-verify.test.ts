import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { constructStripeEvent, stripeSignatureValid } from "./stripe-signature";
import { candidateUrls, twilioRequestValid, twilioSignatureFor } from "./twilio-signature";
import { svixSignatureValid } from "./svix-signature";
import { isPlaceholderLine, realAnsweringLine } from "./answering-line";
import { sendOutcome, sendToast, NOT_SENT_LINE } from "./delivery-honest";
import { collapseTrail } from "./delivery-log";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

// Vectors below were made with the official SDKs (stripe, twilio, svix npm packages, Oct 2 2026),
// so this dependency-free code is proven to agree with what Stripe/Twilio/Resend actually send.
const STRIPE = {
  payload: '{"id":"evt_test_1","type":"checkout.session.completed","data":{"object":{"id":"cs_1"}}}',
  secret: "whsec_test_secret_go_public",
  header: "t=1790000000,v1=cce7281a4e465ec8a45b4f79e32ce32113af7871a3da09d38c677660395e623e",
};

test("stripe: matches stripe.webhooks.generateTestHeaderString; tamper, wrong secret, replay all fail", () => {
  const now = 1790000000 + 10;
  assert.ok(stripeSignatureValid(STRIPE.payload, STRIPE.header, STRIPE.secret, { toleranceSec: 300, nowSec: now }));
  const event = constructStripeEvent<{ id: string }>(STRIPE.payload, STRIPE.header, STRIPE.secret, now);
  assert.equal(event.id, "evt_test_1");
  assert.equal(stripeSignatureValid(STRIPE.payload.replace("cs_1", "cs_2"), STRIPE.header, STRIPE.secret, { nowSec: now }), false);
  assert.equal(stripeSignatureValid(STRIPE.payload, STRIPE.header, "whsec_other", { nowSec: now }), false);
  assert.equal(stripeSignatureValid(STRIPE.payload, STRIPE.header, STRIPE.secret, { toleranceSec: 300, nowSec: now + 400 }), false);
  assert.equal(stripeSignatureValid(STRIPE.payload, "", STRIPE.secret), false);
  assert.equal(stripeSignatureValid(STRIPE.payload, "t=1790000000", STRIPE.secret), false);
  assert.throws(() => constructStripeEvent(STRIPE.payload, STRIPE.header, "", now), /STRIPE_WEBHOOK_SECRET/);
  assert.throws(() => constructStripeEvent(STRIPE.payload, "t=1,v1=00", STRIPE.secret, now), /invalid/);
});

test("stripe: any v1 may match (secret roll), like the SDK", () => {
  const t = 1790000000;
  const good = createHmac("sha256", STRIPE.secret).update(`${t}.${STRIPE.payload}`).digest("hex");
  const header = `t=${t},v1=${"0".repeat(64)},v1=${good},v0=ignored`;
  assert.ok(stripeSignatureValid(STRIPE.payload, header, STRIPE.secret, { toleranceSec: 300, nowSec: t }));
});

test("twilio: form posts match twilio.validateRequest; JSON matches validateRequestWithBody", () => {
  const url = "https://jobcommand.example.com/api/webhooks/twilio";
  const params = { MessageSid: "SM1", MessageStatus: "delivered", To: "+13125550100" };
  const token = "twilio_test_token_123";
  assert.equal(twilioSignatureFor(token, url, params), "V9UY8lWpuNYrou4A5Z3YfSis3wc=");
  const rawBody = new URLSearchParams(params).toString();
  const form = { authToken: token, signature: "V9UY8lWpuNYrou4A5Z3YfSis3wc=", urls: [url], rawBody, contentType: "application/x-www-form-urlencoded" };
  assert.ok(twilioRequestValid(form));
  assert.equal(twilioRequestValid({ ...form, rawBody: rawBody.replace("delivered", "failed") }), false);
  assert.equal(twilioRequestValid({ ...form, authToken: "other" }), false);
  assert.equal(twilioRequestValid({ ...form, signature: "" }), false);

  const jurl = `${url}?bodySHA256=93a23971a914e5eacbf0a8d25154cda309c3c1c72fbb9914d47c60f3cb681588`;
  const json = { authToken: token, signature: "K26N4wVi8489aFfA+hFQFHdUzQI=", urls: [jurl], rawBody: '{"hello":"world"}', contentType: "application/json" };
  assert.ok(twilioRequestValid(json));
  assert.equal(twilioRequestValid({ ...json, rawBody: '{"hello":"there"}' }), false);
});

test("twilio: behind a proxy, the public APP_ORIGIN URL is tried too", () => {
  const urls = candidateUrls("http://10.0.0.5:3000/api/webhooks/twilio?x=1", "https://jobcommand.example.com/");
  assert.ok(urls.includes("https://jobcommand.example.com/api/webhooks/twilio?x=1"));
  assert.ok(urls.includes("http://10.0.0.5/api/webhooks/twilio?x=1"));
});

test("resend (svix): matches svix Webhook.sign; tamper and old timestamps fail", () => {
  const secret = "whsec_c3ZpeC10ZXN0LXNlY3JldC0zMi1ieXRlcy1sb25nISE=";
  const base = { secret, id: "msg_1", timestamp: "1790000000", rawBody: '{"hello":"world"}', nowSec: 1790000005 };
  assert.ok(svixSignatureValid({ ...base, signature: "v1,0odniYZSjoA8FksHs+Tz3vKU7aMP7US7UwfV8mjkVMs=" }));
  assert.ok(svixSignatureValid({ ...base, signature: "v1,bad= v1,0odniYZSjoA8FksHs+Tz3vKU7aMP7US7UwfV8mjkVMs=" }));
  assert.equal(svixSignatureValid({ ...base, rawBody: '{"hello":"x"}', signature: "v1,0odniYZSjoA8FksHs+Tz3vKU7aMP7US7UwfV8mjkVMs=" }), false);
  assert.equal(svixSignatureValid({ ...base, nowSec: 1790000900, signature: "v1,0odniYZSjoA8FksHs+Tz3vKU7aMP7US7UwfV8mjkVMs=" }), false);
  assert.equal(svixSignatureValid({ ...base, secret: "", signature: "v1,0odniYZSjoA8FksHs+Tz3vKU7aMP7US7UwfV8mjkVMs=" }), false);
});

test("webhook routes: no secret = 503, bad signature = rejected, never 'accept unsigned'", () => {
  const stripe = read("app/api/webhooks/stripe/route.ts");
  assert.match(stripe, /STRIPE_WEBHOOK_SECRET/);
  assert.match(stripe, /status: 503/);
  assert.match(stripe, /status: 400/);
  assert.doesNotMatch(stripe, /NODE_ENV/); // no "skip the check in dev" path
  const twilio = read("app/api/webhooks/twilio/route.ts");
  assert.match(twilio, /TWILIO_AUTH_TOKEN/);
  assert.match(twilio, /twilioRequestValid\(/);
  assert.match(twilio, /status: 503/);
  assert.match(twilio, /status: 403/);
  const resend = read("app/api/webhooks/resend/route.ts");
  assert.match(resend, /RESEND_WEBHOOK_SECRET/);
  assert.match(resend, /svixSignatureValid\(/);
  assert.match(resend, /status: 503/);
});

test("fake AI line: 555 numbers are never shown as the shop's line", () => {
  assert.equal(isPlaceholderLine("(312) 555-6199"), true);
  assert.equal(isPlaceholderLine("+1 312 555 0100"), true);
  assert.equal(isPlaceholderLine(""), true);
  assert.equal(realAnsweringLine("(312) 555-6199"), "");
  assert.equal(realAnsweringLine("(312) 867-5309"), "(312) 867-5309");
  const ws = read("components/command/EmployeeWorkspace.tsx");
  assert.match(ws, /realAnsweringLine\(/);
  assert.match(ws, /Not connected yet/);
  const setup = read("components/command/CompanySetup.tsx");
  assert.doesNotMatch(setup, /assignAnsweringLine\(/);
  const billing = read("components/command/BillingDesk.tsx");
  assert.doesNotMatch(billing, /555/);
});

test("no mock checkout: without Stripe nothing says subscribed or turns the $59 add-on on", () => {
  const actions = read("app/actions.ts");
  assert.doesNotMatch(actions, /applyCheckoutCompleted\(|recordMockPlan\(/);
  assert.match(actions, /notConnected: true as const/);
  const billing = read("lib/billing.ts");
  assert.match(billing, /canUseAnswering\(addonStatus\) && !String\(row\.stripeAddonSubId \|\| ""\)\.startsWith\("mock_"\)/);
  const desk = read("components/command/BillingDesk.tsx");
  assert.match(desk, /Payments aren\\u2019t connected yet|Payments aren’t connected yet/);
  assert.doesNotMatch(desk, /"[^"\n]*(4242|Bank linked|AI answering is on)[^"\n]*"/);
  // The add-on only goes active from a signed Stripe webhook.
  assert.match(read("lib/billing-store.ts"), /applyCheckoutCompleted\(row/);
});

test("email/text not connected: logged as 'Not sent', never a fake 'delivered'", () => {
  const store = read("lib/delivery-store.ts");
  assert.match(store, /result\.mock \? "queued"/);
  assert.doesNotMatch(store, /status: "delivered"/);
  const trail = collapseTrail([
    { id: "1", estimateId: "e1", channel: "email", status: "queued", provider: "mock", createdAt: "2026-10-02T15:00:00Z" },
  ], { e1: "EST-1" });
  assert.match(JSON.stringify(trail), /Not sent \(not connected yet\)/);
  assert.match(read("lib/estimate-followup.ts"), /if \(!canEmail && !canText\) return/);
});

test("send toasts: honest when nothing went out", () => {
  const off = { ok: true, mock: true, notConnected: true };
  const on = { ok: true, mock: false };
  assert.deepEqual(sendOutcome({ email: off, sms: off }), { sent: false, notConnected: true });
  assert.equal(sendToast({ email: off }, "Sent.").text, NOT_SENT_LINE);
  assert.equal(sendToast({ email: off }, "Sent.").kind, "message");
  assert.equal(sendToast({ email: on }, "Sent.").text, "Sent.");
  assert.match(sendToast({ email: on, sms: off }, "Sent.").text, /only one way went out/);
  for (const rel of ["components/command/EstimateSend.tsx", "components/command/JobFolder.tsx", "components/command/InvoiceStage.tsx"]) {
    assert.match(read(rel), /sendToast\(\s*result/, rel);
  }
});

test("card check not connected: no fake card form, no fake '$1 returned'", () => {
  const ui = read("components/signup/CardCheck.tsx");
  assert.match(ui, /CARD_CHECK_CONNECTED = Boolean\(PK\)/);
  assert.match(ui, /data-card-not-connected/);
  assert.doesNotMatch(ui, /last4: "4242"/);
  assert.match(ui, /Card check isn\\u2019t connected yet, so nothing was held or charged/);
  const route = read("app/api/setup/card-check/route.ts");
  assert.match(route, /body\.mock\?\.notConnected === true/);
  assert.match(route, /!stripeConfigured\(\) && body\.mock\?\.notConnected/);
});
