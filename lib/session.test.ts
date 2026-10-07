import assert from "node:assert/strict";
import test from "node:test";
import { decodeSession, encodeSession, cookieSecureFlag, sessionCookieOptions } from "./session";
import type { SessionDTO } from "./types";

const office: SessionDTO = {
  accountId: "acc_office",
  role: "ADMIN",
  name: "Eric Stlawrence",
  employeeId: null,
};

test("session cookie round-trips an office login", async () => {
  const token = await encodeSession(office, 1_000_000);
  const session = await decodeSession(token, 1_000_001);
  assert.deepEqual(session, office);
});

test("tampered session cookie is rejected", async () => {
  const token = await encodeSession(office, 1_000_000);
  const broken = token.slice(0, -2) + "aa";
  assert.equal(await decodeSession(broken, 1_000_001), null);
});

test("expired session cookie is rejected", async () => {
  const token = await encodeSession(office, 1_000_000);
  assert.equal(await decodeSession(token, 1_000_000 + 60 * 60 * 24 * 31 * 1000), null);
});

test("session cookie is HttpOnly, Secure in production, and SameSite=Strict", () => {
  const options = sessionCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "strict");
  assert.equal(options.path, "/");
  assert.equal(cookieSecureFlag({ NODE_ENV: "production" }), true);
  assert.equal(cookieSecureFlag({ VERCEL: "1" }), true);
  assert.equal(cookieSecureFlag({ NODE_ENV: "development" }), false);
});
