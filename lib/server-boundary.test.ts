import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "./legal";

const clientFiles = [
  "../components/command/InvoiceStage.tsx",
  "../components/command/BillingDesk.tsx",
  "../components/command/TalkStrip.tsx",
  "../components/command/CompanySetup.tsx",
  "../components/command/EmployeeWorkspace.tsx",
  "../components/command/SiteMap.tsx",
];

test("client screens never import Stripe secrets, Prisma, or the AI store", () => {
  for (const relative of clientFiles) {
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from "@\/lib\/invoice-pay"/);
    assert.doesNotMatch(source, /from "@\/lib\/stripe-rest"/);
    assert.doesNotMatch(source, /from "@\/lib\/billing-stripe"/);
    assert.doesNotMatch(source, /from "@\/lib\/billing-store"/);
    assert.doesNotMatch(source, /from "@\/lib\/prisma"/);
    assert.doesNotMatch(source, /from "@\/lib\/site-voice-store"/);
    assert.doesNotMatch(source, /from "@\/lib\/delivery"/);
    assert.doesNotMatch(source, /from "@\/lib\/maps-server"/);
    assert.doesNotMatch(source, /STRIPE_SECRET_KEY|OPENAI_API_KEY|AI_GATEWAY_API_KEY|DATABASE_URL|VAPID_PRIVATE/);
  }
});

test("fee math is client-safe; Stripe checkout is marked server-only", () => {
  const invoice = readFileSync(new URL("../components/command/InvoiceStage.tsx", import.meta.url), "utf8");
  const pay = readFileSync(new URL("./invoice-pay.ts", import.meta.url), "utf8");
  const rest = readFileSync(new URL("./stripe-rest.ts", import.meta.url), "utf8");
  const voice = readFileSync(new URL("./site-voice-store.ts", import.meta.url), "utf8");
  assert.match(invoice, /from "@\/lib\/invoice-split"/);
  assert.match(pay, /import "server-only"/);
  assert.match(rest, /import "server-only"/);
  assert.match(voice, /import "server-only"/);
});

test("terms cover trial, auto-renewal, Connect 1% fee, and job-site liability", () => {
  const text = TERMS_SECTIONS.map((section) => `${section.title} ${section.paragraphs.join(" ")}`).join("\n");
  assert.match(text, /30-day free trial/i);
  assert.match(text, /\$199 per month/);
  assert.match(text, /\$1,990 per year/);
  assert.match(text, /\$59 per month/);
  assert.match(text, /auto-renew|automatically each month/i);
  assert.match(text, /Cancel in Company/);
  assert.match(text, /merchant payouts/);
  assert.match(text, /1% platform fee/);
  assert.match(text, /Stripe Connect/);
  assert.match(text, /limitation of liability/i);
  assert.match(text, /GPS pins/);
  assert.match(text, /OSHA|safety/i);
  assert.match(text, /crew hour tracking/);
  assert.match(text, /job-site safety notes/i);
  const privacy = PRIVACY_SECTIONS.map((section) => section.paragraphs.join(" ")).join("\n");
  assert.match(privacy, /GPS pings/);
  assert.match(privacy, /Stripe/);
  assert.match(privacy, /server-side model/);
  assert.match(privacy, /HttpOnly/);
});

test("Android wrap sets FLAG_SECURE; web layout only no-ops the shield", () => {
  const android = readFileSync(new URL("../native/android/MainActivity.java", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const shield = readFileSync(new URL("../components/command/ScreenShield.tsx", import.meta.url), "utf8");
  const estimate = readFileSync(new URL("../components/command/EstimateStage.tsx", import.meta.url), "utf8");
  assert.match(android, /FLAG_SECURE/);
  assert.match(layout, /ScreenShield/);
  assert.match(shield, /Capacitor/);
  assert.doesNotMatch(estimate, /FLAG_SECURE|ScreenShield/);
});
import "./download-closed.test";
