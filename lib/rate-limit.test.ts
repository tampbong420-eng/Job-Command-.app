import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimiter, ruleFor, clientIp } from "./rate-limit";

test("sliding window allows the limit then blocks until it rolls", () => {
  let now = 1_000_000;
  const { consume } = createRateLimiter(() => now);
  assert.equal(consume("pin:1", 3, 10_000).ok, true);
  assert.equal(consume("pin:1", 3, 10_000).ok, true);
  const last = consume("pin:1", 3, 10_000);
  assert.equal(last.ok, true);
  assert.equal(last.remaining, 0);
  const blocked = consume("pin:1", 3, 10_000);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  now += 10_001;
  assert.equal(consume("pin:1", 3, 10_000).ok, true);
});

test("keys do not share a bucket", () => {
  const { consume } = createRateLimiter(() => 5);
  assert.equal(consume("api:a", 1, 1000).ok, true);
  assert.equal(consume("api:a", 1, 1000).ok, false);
  assert.equal(consume("api:b", 1, 1000).ok, true);
});

test("PIN logins are tighter than shop API traffic", () => {
  const pin = ruleFor("/api/session", "POST");
  const api = ruleFor("/api/weather", "GET");
  const ping = ruleFor("/api/crew-ping", "POST");
  const action = ruleFor("/", "POST", true);
  assert.equal(pin.bucket, "pin");
  assert.ok(pin.limit < api.limit);
  assert.ok(pin.windowMs > api.windowMs);
  assert.equal(ping.limit, 90);
  assert.equal(action.bucket, "action");
  assert.equal(ruleFor("/api/webhooks/stripe", "POST").bucket, "webhook");
});

test("client IP prefers the first forwarded address", () => {
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.9, 10.0.0.1",
    "x-real-ip": "10.0.0.1",
  });
  assert.equal(clientIp(headers), "203.0.113.9");
});
