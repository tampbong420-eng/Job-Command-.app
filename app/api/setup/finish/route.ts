import { finishSignup } from "@/app/signup-actions";
import { appOrigin } from "@/lib/origin";

export const runtime = "nodejs";

/**
 * Signup v2 finish. A plain POST (not a server action) on purpose: a server action re-renders
 * the page in the same response, before the new session cookie is readable, which swapped the
 * "You're set" screen for the PIN gate. Here the cookie lands and the client stays on "done".
 */
export async function POST(request: Request) {
  let body: Parameters<typeof finishSignup>[0];
  try {
    body = (await request.json()) as Parameters<typeof finishSignup>[0];
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !body.onboarding || typeof body.onboarding !== "object") {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    const result = await finishSignup({
      onboarding: body.onboarding,
      shop: body.shop || {},
      origin: appOrigin(request),
      cardCheckToken: typeof body.cardCheckToken === "string" ? body.cardCheckToken : "",
      deviceId: typeof body.deviceId === "string" ? body.deviceId.slice(0, 120) : "",
    });
    if (!result) return Response.json({ error: "This shop is already set up. Sign in with your PIN instead." }, { status: 403 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === "CardCheckNeeded") {
      return Response.json({ error: error.message, cardCheck: true }, { status: 428 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Couldn’t finish setup." }, { status: 400 });
  }
}
