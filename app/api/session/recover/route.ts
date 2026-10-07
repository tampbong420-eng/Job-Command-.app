import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";
import { emailConnected, sendEmail } from "@/lib/delivery";
import { finishPinReset, startPinReset } from "@/lib/pin-recovery";
import { toSession } from "@/lib/accounts";
import { encodeSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session";
import { runWithShop } from "@/lib/shop-context";
import { SHOP_COOKIE } from "@/lib/shop-scope-core";
import { resolveShopForRequest, shopCookieOptions, SHOP_NEEDED_LINE, SHOP_UNKNOWN_LINE } from "@/lib/shop-pick";

export const dynamic = "force-dynamic";

/**
 * Owner "Forgot PIN?" (public, signed-out). POST { action: "start" } sends a one-time 6-digit code to the owner
 * email + backup email (never says which exist). POST { action: "finish", code, next, again } sets the new PIN,
 * clears every lockout for the shop and signs this phone in. Works on any phone: nothing is tied to the old one.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string; code?: string; next?: string; again?: string; shop?: string };
  // Multi-shop B2: same shop choice as sign-in (typed shop phone → this phone's saved shop → the only shop).
  const pick = await resolveShopForRequest(request, body.shop);
  if (pick.kind === "need") return NextResponse.json({ ok: false, needShop: true, message: SHOP_NEEDED_LINE }, { status: 400 });
  if (pick.kind === "unknown") return NextResponse.json({ ok: false, needShop: true, unknownShop: true, message: SHOP_UNKNOWN_LINE }, { status: 400 });
  const shopId = pick.shopId;
  const response = await runWithShop(shopId, () => recoverHere(request, body, shopId));
  if (body.action === "finish" && response.status === 200) response.cookies.set(SHOP_COOKIE, shopId, shopCookieOptions());
  return response;
}

async function recoverHere(request: Request, body: { action?: string; code?: string; next?: string; again?: string }, shopId: string) {
  if (body.action === "start") {
    const result = await startPinReset(prisma, {
      shopId,
      ip: clientIp(request.headers),
      emailConnected: emailConnected(),
      dev: process.env.NODE_ENV !== "production",
      send: (to, code) =>
        sendEmail({
          to,
          subject: "Your jobcommand.app PIN reset code",
          text: `Your code is ${code}. It works for 15 minutes.\n\nOn the sign-in screen tap Forgot PIN?, type the code, then pick a new PIN.\n\nDidn't ask for this? Ignore this email. Your PIN has not changed.`,
          html: `<p style="font-size:18px">Your code is <b style="font-size:28px;letter-spacing:4px">${code}</b></p><p style="font-size:16px">It works for 15 minutes. On the sign-in screen tap <b>Forgot PIN?</b>, type the code, then pick a new PIN.</p><p style="font-size:16px">Didn't ask for this? Ignore this email. Your PIN has not changed.</p>`,
        }),
    });
    // devCode never leaves the server: it is only printed to the dev server log.
    if (!result.ok) return NextResponse.json({ ok: false, limited: true, message: result.line }, { status: 429 });
    // codeBox: show the code fields only when a code can exist (email connected, or dev with the code in the server log).
    return NextResponse.json({
      ok: true,
      emailConnected: result.emailConnected,
      codeBox: result.emailConnected || process.env.NODE_ENV !== "production",
      message: result.line,
    });
  }
  if (body.action === "finish") {
    const result = await finishPinReset(prisma, { shopId, code: body.code, next: body.next, again: body.again });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    const session = toSession(result.account);
    const response = NextResponse.json({ ok: true, session });
    response.cookies.set(SESSION_COOKIE, await encodeSession(session), sessionCookieOptions());
    return response;
  }
  return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
}
