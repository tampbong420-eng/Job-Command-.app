import { NextResponse, type NextRequest } from "next/server";
import { sessionFromCookieHeader } from "@/lib/session";
import { can } from "@/lib/access";
import { hit, rateLimitHeaders } from "@/lib/rate-limit";

const PUBLIC = [
  /^\/api\/health$/,
  /^\/api\/diagnostics$/,
  /^\/api\/cron\//,
  /^\/api\/session/,
  /^\/api\/shop\/new$/,
  /^\/api\/setup\//,
  /^\/api\/upload\/logo$/,
  /^\/api\/webhooks\//,
  /^\/api\/setup-codes$/,
  /^\/api\/bypass$/,
  /^\/api\/init-db$/,
  /^\/api\/test-db$/,
  /^\/api\/setup-admin$/,
  /^\/api\/pin-gate$/,
  /^\/api\/tts$/,
];

const ADMIN = [
  /^\/api\/export\//,
  /^\/api\/alerts\/quiet/,
  /^\/api\/schedule\//,
  /^\/api\/docs\//,
  /^\/api\/leads\//,
];

function limited(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAction = Boolean(request.headers.get("next-action") || request.headers.get("Next-Action"));
  const result = hit(pathname, request.method, request.headers, isAction);
  const headers = rateLimitHeaders(result);
  if (result.ok) return { headers, blocked: false as const };
  return {
    headers,
    blocked: true as const,
    response: NextResponse.json(
      { error: "Too many requests. Wait a moment." },
      { status: 429, headers }
    ),
  };
}

export async function middleware(request: NextRequest) {
  const gate = limited(request);
  if (gate.blocked) return gate.response;

  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(gate.headers)) response.headers.set(key, value);
    return response;
  }
  if (PUBLIC.some((pattern) => pattern.test(pathname))) {
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(gate.headers)) response.headers.set(key, value);
    return response;
  }

  const session = await sessionFromCookieHeader(request.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: gate.headers });
  }
  if (ADMIN.some((pattern) => pattern.test(pathname)) && !can(session, "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: gate.headers });
  }
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(gate.headers)) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/|favicon.ico|uploads/|avatars/|sw.js|manifest.webmanifest).*)",
  ],
};
