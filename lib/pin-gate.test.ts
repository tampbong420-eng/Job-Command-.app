import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// App Store readiness suites (package.json test list is owned by another worker right now).
import "./account-delete.test";
import "./ai-consent.test";
import "./ios-config.test";
import { devPinAutoTryAllowed, isLocalPreviewHost, pinGateEnabled } from "./pin-gate";

test("PIN gate is on in production and by default", () => {
  assert.equal(pinGateEnabled({ NODE_ENV: "production" }), true);
  assert.equal(pinGateEnabled({ NODE_ENV: "production", NEXT_PUBLIC_JC_DEV_SKIP_PIN: "1" }), true);
  assert.equal(pinGateEnabled({ NODE_ENV: "development" }), true);
  assert.equal(pinGateEnabled({ NODE_ENV: "test", NEXT_PUBLIC_JC_DEV_SKIP_PIN: "1" }), true);
  assert.equal(pinGateEnabled({}), true);
});

test("PIN skip only exists in next dev with an explicit opt-in", () => {
  assert.equal(pinGateEnabled({ NODE_ENV: "development", NEXT_PUBLIC_JC_DEV_SKIP_PIN: "1" }), false);
  assert.equal(pinGateEnabled({ NODE_ENV: "development", NEXT_PUBLIC_JC_DEV_SKIP_PIN: "true" }), true);
});

test("server never accepts an arbitrary PIN for office", () => {
  const route = readFileSync(new URL("../app/api/session/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /PIN_GATE_ENABLED/);
  assert.doesNotMatch(route, /role === "ADMIN"/);
  // PIN-first sign-in (go-public B1): every login is checked against its own stored hash.
  const signin = readFileSync(new URL("./pin-signin.ts", import.meta.url), "utf8");
  assert.match(signin, /verifyPin\(pin, row\.pinHash\)/);
  const yearEnd = readFileSync(new URL("../app/api/export/year-end/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(yearEnd, /!session && !PIN_GATE_ENABLED/);
});

test("the automatic office PIN try never runs off this computer (App Store review, phones, tunnel)", () => {
  assert.equal(isLocalPreviewHost("localhost"), true);
  assert.equal(isLocalPreviewHost("127.0.0.1"), true);
  assert.equal(isLocalPreviewHost("[::1]"), true);
  assert.equal(isLocalPreviewHost("jobcommand.app"), false);
  assert.equal(isLocalPreviewHost("192.168.1.20"), false);
  assert.equal(isLocalPreviewHost(""), false);
  // Gate on (production / no opt-in): never, even on localhost.
  assert.equal(devPinAutoTryAllowed(true, "localhost"), false);
  // Dev opt-in: only on localhost.
  assert.equal(devPinAutoTryAllowed(false, "localhost"), true);
  assert.equal(devPinAutoTryAllowed(false, "jobcommand.app"), false);
  const gate = readFileSync(new URL("../components/command/AccessGate.tsx", import.meta.url), "utf8");
  const tryAt = gate.indexOf('pin: "1001"');
  const hostCheck = gate.indexOf("devPinAutoTryAllowed(PIN_GATE_ENABLED, window.location.hostname)");
  assert.ok(hostCheck > 0 && hostCheck < tryAt, "host check must run before the 1001 attempt");
});
