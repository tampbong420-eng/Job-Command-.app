import type { NextRequest } from "next/server";

export function cronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.VERCEL !== "1";
  const auth = request.headers.get("authorization") || "";
  const header = request.headers.get("x-cron-secret") || "";
  return auth === `Bearer ${secret}` || header === secret;
}
