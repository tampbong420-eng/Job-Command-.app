"use server";

/**
 * Server side of the new signup (signup v2). Kept out of app/actions.ts so the
 * shared file stays untouched: finishSignup wraps completeOnboarding and saves the
 * trade-profile columns in the same request.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { completeOnboarding } from "@/app/actions";
import { can } from "@/lib/access";
import { billingOnSetup } from "@/lib/billing";
import { cardCheckPassed } from "@/lib/card-check";
import { prisma } from "@/lib/prisma";
import { hit } from "@/lib/rate-limit";
import { getLiveSession } from "@/lib/live-session";
import { inviteKey, type SignupInvite } from "@/lib/signup-invites";
import { onlyKnownColumns, parseJsonList, shopProfilePatch, type ShopProfileInput } from "@/lib/signup-shop";
import { blockedCopy, guardBlocked, guardLabel, reasonFromLabel, type GuardDecision } from "@/lib/trial-guard";
import { checkTrialGuard, endTrialNow, recordTrialClaims, signupClaims } from "@/lib/trial-guard-store";
import { isAppLogoUrl } from "@/lib/upload-store";

type OnboardingInput = Parameters<typeof completeOnboarding>[0];

/** Columns the running Prisma client knows. A dev server started before `prisma db push` skips the new ones. */
function knownSettingsColumns(): string[] {
  return Object.values((Prisma as unknown as { AppSettingsScalarFieldEnum?: Record<string, string> }).AppSettingsScalarFieldEnum || {});
}

async function saveShop(patch: ShopProfileInput) {
  const data = onlyKnownColumns(shopProfilePatch(patch), knownSettingsColumns());
  if (!Object.keys(data).length) return false;
  await prisma.appSettings.update({ where: { id: "default" }, data });
  return true;
}

/** Same gate as completeOnboarding: first run (no admin / setup not done) or a signed-in admin. */
async function maySetUp() {
  const session = await getLiveSession();
  if (can(session, "admin")) return true;
  const admin = await prisma.account.findFirst({ where: { role: "ADMIN" } });
  if (!admin) return true;
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  return !(row?.setupComplete && row.businessName);
}

/**
 * One personal link per person added on "Add your people". Crew get their own /j/<token> sign-in
 * (the account completeOnboarding just made); bosses get the app address + the office PIN.
 */
async function signupInvites(onboarding: OnboardingInput, origin: string): Promise<SignupInvite[]> {
  const base = origin.replace(/\/$/, "");
  const invites: SignupInvite[] = [];
  const accounts = await prisma.account.findMany({ where: { role: "CREW" }, include: { employee: true } });
  for (const member of onboarding.crew) {
    if (!member.firstName.trim()) continue;
    const digits = (member.phone || "").replace(/\D/g, "");
    const hit = accounts.find(
      (row) =>
        row.employee &&
        row.inviteToken &&
        row.employee.firstName.trim().toLowerCase() === member.firstName.trim().toLowerCase() &&
        (row.employee.phone || "").replace(/\D/g, "") === digits
    );
    if (!hit?.inviteToken) continue;
    const person = { firstName: member.firstName.trim(), lastName: member.lastName.trim(), phone: member.phone?.trim() || "" };
    invites.push({ key: inviteKey(person), ...person, role: "crew", url: `${base}/j/${encodeURIComponent(hit.inviteToken)}` });
  }
  for (const boss of onboarding.bosses) {
    if (!boss.firstName.trim()) continue;
    const person = { firstName: boss.firstName.trim(), lastName: boss.lastName.trim(), phone: boss.phone?.trim() || "" };
    invites.push({ key: inviteKey(person), ...person, role: "boss", url: `${base}/` });
  }
  return invites;
}

/**
 * First run (a trial would start): the $1 card check must have passed in the last 2 hours with the
 * one-use token the phone holds, and the one-trial-per-business guard runs again on the final
 * answers. Blocked: setup is still saved, but no trial (expired → Subscribe $199/mo).
 */
export async function finishSignup(input: { onboarding: OnboardingInput; shop: ShopProfileInput; origin?: string; cardCheckToken?: string; deviceId?: string }) {
  if (!(await maySetUp())) return null;
  const before = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const trialWouldStart = billingOnSetup(before, new Date()) !== null;
  let decision: GuardDecision | null = null;
  const claims = signupClaims({
    cardHash: before?.cardCheckFingerprint || "",
    deviceId: input.deviceId,
    phone: input.onboarding.owner?.phone,
    email: input.onboarding.owner?.email,
    businessName: input.onboarding.business?.name,
    businessAddress: input.onboarding.business?.address,
  });
  if (trialWouldStart) {
    if (!cardCheckPassed(before, input.cardCheckToken)) {
      const error = new Error("Check your card first. It’s a $1 hold, returned right away.");
      error.name = "CardCheckNeeded";
      throw error;
    }
    decision = guardBlocked(before?.trialGuard)
      ? { allowed: false, reason: reasonFromLabel(before?.trialGuard), matched: [] }
      : await checkTrialGuard(claims, { customerId: before?.stripeCustomerId || "" });
  }
  if (decision && !decision.allowed) {
    // Close the window before setup runs so no trial is ever opened for a repeat card/shop.
    const now = new Date();
    await prisma.appSettings.update({
      where: { id: "default" },
      data: { trialStartedAt: now, trialEndsAt: now, billingStatus: "expired", trialGuard: guardLabel(decision) },
    });
  }
  const landing = await completeOnboarding(input.onboarding);
  if (!landing) return null;
  const saved = await saveShop(input.shop);
  let trialBlocked: (ReturnType<typeof blockedCopy> & { reason: string }) | null = null;
  if (decision && !decision.allowed) {
    await endTrialNow();
    trialBlocked = { reason: decision.reason, ...blockedCopy(decision.reason) };
  } else if (decision) {
    const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
    await recordTrialClaims(claims, decision.flagged.length ? "flagged" : "trial", row?.stripeCustomerId || "");
    await prisma.appSettings.update({ where: { id: "default" }, data: { cardCheckToken: "", trialGuard: guardLabel(decision) } });
  }
  if (decision) {
    await prisma.auditLog
      .create({ data: { actor: "Signup", action: decision.allowed ? "Free trial started" : "Free trial blocked (repeat)", field: "billing", newValue: guardLabel(decision) } })
      .catch(() => undefined);
  }
  const invites = input.origin ? await signupInvites(input.onboarding, input.origin).catch(() => []) : [];
  revalidatePath("/");
  return trialBlocked
    ? { ...landing, route: "billing" as const, href: "/?tab=company&billing=subscribe", verified: false, shopSaved: saved, invites, trialBlocked }
    : { ...landing, shopSaved: saved, invites, trialBlocked };
}

/** Invite texts go out through the owner's own Messages app; this records who got one. Admin only. */
export async function recordInvitesSent(input: { names: string[] }) {
  const session = await requireAdmin();
  if (!session) return { ok: false as const };
  const names = Array.from(new Set((input.names || []).map((name) => String(name).trim().slice(0, 80)).filter(Boolean))).slice(0, 50);
  for (const name of names) {
    await prisma.auditLog.create({
      data: { actor: session.name || "Owner", action: "Texted crew invite", field: "invite", newValue: name },
    });
  }
  return { ok: true as const, count: names.length };
}

async function requireAdmin() {
  const limited = hit("/", "POST", headers(), true);
  if (!limited.ok) throw new Error("Too many requests. Wait a moment.");
  const session = await getLiveSession();
  return can(session, "admin") ? session : null;
}

/** "Make it look official" sheet + finish-later checkmarks. Admin only. */
export async function saveShopExtras(input: {
  licenseNumber?: string;
  insuranceCarrier?: string;
  logoUrl?: string;
  laterDone?: string[];
  reviewLink?: string;
}) {
  if (!(await requireAdmin())) return { ok: false as const };
  if (input.logoUrl && isAppLogoUrl(input.logoUrl)) {
    await prisma.appSettings.update({ where: { id: "default" }, data: { logoUrl: input.logoUrl } });
  }
  const patch: ShopProfileInput = {};
  if (input.licenseNumber !== undefined) patch.licenseNumber = input.licenseNumber;
  if (input.insuranceCarrier !== undefined) patch.insuranceCarrier = input.insuranceCarrier;
  if (input.reviewLink !== undefined) patch.reviewLink = input.reviewLink;
  if (input.laterDone !== undefined) {
    const row = (await prisma.appSettings.findUnique({ where: { id: "default" } })) as Record<string, unknown> | null;
    patch.laterDone = Array.from(new Set([...parseJsonList(row?.laterDone), ...input.laterDone]));
  }
  const saved = await saveShop(patch);
  revalidatePath("/");
  return { ok: saved };
}

/**
 * "Make it look official" over the first estimate: ask once, before the first Send, only when the logo
 * or license is still missing. "Send without them" records official-asked so it never nags again.
 */
export async function officialPrompt() {
  if (!(await requireAdmin())) return { ask: false as const };
  const row = (await prisma.appSettings.findUnique({ where: { id: "default" } })) as Record<string, unknown> | null;
  if (!row) return { ask: false as const };
  const done = parseJsonList(row.laterDone);
  const license = typeof row.licenseNumber === "string" ? row.licenseNumber : "";
  const logo = typeof row.logoUrl === "string" ? row.logoUrl : "";
  if (done.includes("official-asked") || (license && logo)) return { ask: false as const };
  const industry = typeof row.industry === "string" ? row.industry : "";
  const address = typeof row.businessAddress === "string" ? row.businessAddress : "";
  return {
    ask: true as const,
    logoUrl: logo || null,
    licenseNumber: license,
    insuranceCarrier: typeof row.insuranceCarrier === "string" ? row.insuranceCarrier : "",
    licenseLabel: licenseLabelFor(address),
    industry,
  };
}

/** "AR contractor license #" from the shop's address state; plain "Contractor license #" otherwise. */
function licenseLabelFor(address: string) {
  const state = address.match(/,\s*([A-Z]{2})\b(?:\s+\d{5})?\s*$/)?.[1] || address.match(/\b([A-Z]{2})\s+\d{5}\b/)?.[1] || "";
  return state ? `${state} contractor license #` : "Contractor license #";
}
