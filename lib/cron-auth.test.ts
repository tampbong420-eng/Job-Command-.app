import assert from "node:assert/strict";
import test from "node:test";
import type { NextRequest } from "next/server";
import { cronAuthorized } from "./cron-auth";

function request(headers: Record<string, string>) {
  return { headers: { get: (key: string) => headers[key.toLowerCase()] || headers[key] || null } } as NextRequest;
}

test("production cron requires the bearer secret", () => {
  const prevSecret = process.env.CRON_SECRET;
  const prevVercel = process.env.VERCEL;
  process.env.CRON_SECRET = "field-cron";
  process.env.VERCEL = "1";
  try {
    assert.equal(cronAuthorized(request({})), false);
    assert.equal(cronAuthorized(request({ authorization: "Bearer field-cron" })), true);
  } finally {
    if (prevSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevSecret;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  }
});
