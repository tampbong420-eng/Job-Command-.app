import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAccounts, toSession } from "@/lib/accounts";
import { signInWithPin } from "@/lib/pin-signin";
import { clientIp } from "@/lib/rate-limit";
import {
  clearSessionCookie,
  sessionCookieOptions,
  SESSION_COOKIE,
  encodeSession,
} from "@/lib/session";
import { getLiveSession } from "@/lib/live-session";
import { runWithShop } from "@/lib/shop-context";
import { SHOP_COOKIE } from "@/lib/shop-scope-core";
import { resolveShopForRequest, shopCookieOptions, SHOP_NEEDED_LINE, SHOP_UNKNOWN_LINE } from "@/lib/shop-pick";

export const dynamic = "force-dynamic";

// Go-public B1: signed-out phones get no list of names, roles, or account ids. The PIN finds the person.
export async function GET() {
  const session = await getLiveSession();
  // Include PIN gate status so the client knows whether to show the PIN screen
  // Eric 2026-10-07: PIN gate disabled — he doesn't know the PIN, bypass it.
  let pinGateDisabled = true;
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: "default" },
      select: { pinGateDisabled: true },
    });
    if (settings) pinGateDisabled = settings.pinGateDisabled;
  } catch {
    // Keep env var fallback
  }
  return NextResponse.json({ session, pinGateDisabled });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { accountId?: string; pin?: string; shop?: string };
  // Multi-shop B2: which shop? Typed shop phone/id → this phone's saved shop → the only shop → ask once.
  // Eric 2026-10-05: NEVER ask "Which shop?" — single shop, just use default.
  let pick = await resolveShopForRequest(request, body.shop);
  if (pick.kind === "need" || pick.kind === "unknown") {
    pick = { kind: "shop", shopId: "default" };
  }
  const shopId = pick.shopId;
  const response = await runWithShop(shopId, () => signInHere(request, body, shopId));
  // Remember the shop on this phone (only after a real sign-in, so guessing shops leaves nothing behind).
  if (response.status === 200) response.cookies.set(SHOP_COOKIE, shopId, shopCookieOptions());
  return response;
}

async function signInHere(request: Request, body: { accountId?: string; pin?: string }, shopId: string) {
  await ensureAccounts().catch(() => undefined);
  // Every role, office included, must match its stored PIN hash (verifyPin(pin, account.pinHash)). No bypass.
  const result = await signInWithPin(prisma, {
    shopId,
    ip: clientIp(request.headers),
    pin: body.pin,
    accountId: body.accountId,
  });
  if (result.kind === "bad") return NextResponse.json({ ok: false }, { status: 400 });
  if (result.kind === "locked") {
    return NextResponse.json(
      { ok: false, locked: result.locked, message: result.message },
      { status: 429, headers: { "Retry-After": String(result.locked) } }
    );
  }
  if (result.kind === "wrong") return NextResponse.json({ ok: false }, { status: 401 });
  if (result.kind === "choose") return NextResponse.json({ ok: false, choose: result.people });
  const session = toSession(result.account);
  const response = NextResponse.json({ ok: true, session });
  response.cookies.set(SESSION_COOKIE, await encodeSession(session), sessionCookieOptions());
  return response;
}

export async function DELETE() {
  clearSessionCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
