/**
 * PIN gate. Always on in production and by default everywhere.
 *
 * Development-only convenience: `next dev` with NEXT_PUBLIC_JC_DEV_SKIP_PIN=1 tries the
 * documented office fallback PIN (1001) automatically so a local preview opens straight to
 * the desk. The server still verifies that PIN like any other login — it never accepts an
 * arbitrary PIN for office — and if the PIN does not match, the normal gate shows.
 *
 * App Store safety: even with that opt-in, the auto-try only runs when the page itself is opened on
 * this computer (localhost / 127.0.0.1). A phone, App Store reviewer, or tunnel visitor
 * (jobcommand.app) never gets an automatic PIN attempt — they always see the normal PIN gate.
 */
export function pinGateEnabled(env: { NODE_ENV?: string; NEXT_PUBLIC_JC_DEV_SKIP_PIN?: string; NEXT_PUBLIC_JC_DISABLE_PIN?: string } = {}) {
  if (env.NEXT_PUBLIC_JC_DISABLE_PIN === "1") return false;
  return !(env.NODE_ENV === "development" && env.NEXT_PUBLIC_JC_DEV_SKIP_PIN === "1");
}

export const PIN_GATE_ENABLED = pinGateEnabled({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_JC_DEV_SKIP_PIN: process.env.NEXT_PUBLIC_JC_DEV_SKIP_PIN,
  NEXT_PUBLIC_JC_DISABLE_PIN: process.env.NEXT_PUBLIC_JC_DISABLE_PIN,
});

/** Temporary owner bypass is on (preview only): the PIN gate is off entirely. */
export const PIN_BYPASS_ALL = process.env.NEXT_PUBLIC_JC_DISABLE_PIN === "1";

/** Hostnames that count as "this computer" for the dev-only PIN auto-try. */
export function isLocalPreviewHost(hostname: string | null | undefined) {
  const host = String(hostname || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/** The automatic office-PIN try: next dev + explicit opt-in + opened on localhost. Never anywhere else. */
export function devPinAutoTryAllowed(gateEnabled: boolean, hostname: string | null | undefined) {
  return !gateEnabled && isLocalPreviewHost(hostname);
}
