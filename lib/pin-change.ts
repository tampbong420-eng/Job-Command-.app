// Server only. Change your own PIN (go-public B1). Injected db so tests can run on a fake.
import { hashPin, normalizePin, pinIsSet, pinProblem, storedPinIsPhoneTail, verifyPin } from "@/lib/pin";
import { lockMessage } from "@/lib/login-throttle-core";
import { pinLockSeconds, recordPinFailure, recordPinSuccess } from "@/lib/login-throttle";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type PinChangeResult = { ok: true } | { ok: false; error: string; locked?: number };

/** Every phone a PIN must not end in: the shop's, the owner's, and every crew member's. */
export async function shopPhones(db: Db, shopId: string, scope: Record<string, unknown> = {}) {
  const row = await db.appSettings.findUnique({ where: { id: shopId } }).catch(() => null);
  const crew = (await db.employee.findMany({ where: scope, select: { phone: true } }).catch(() => [])) as { phone: string | null }[];
  return [row?.companyPhone, row?.ownerPhone, row?.answeringLine, ...crew.map((person) => person.phone)];
}

export async function changePinFor(
  db: Db,
  input: { accountId: string; shopId: string; current: unknown; next: unknown; again: unknown; now?: number; scope?: Record<string, unknown> }
): Promise<PinChangeResult> {
  const now = input.now ?? Date.now();
  // Wrong "current PIN" tries lock this login out the same way the gate does.
  const lockArgs = { shopId: input.shopId, ip: `change:${input.accountId}`, now, db };
  const waiting = await pinLockSeconds(lockArgs);
  if (waiting > 0) return { ok: false, error: lockMessage(waiting), locked: waiting };
  const account = await db.account.findFirst({ where: { id: input.accountId, ...(input.scope || {}) } });
  if (!account) return { ok: false, error: "Sign in again." };
  const current = normalizePin(input.current);
  if (pinIsSet(account.pinHash) && !(current && verifyPin(current, account.pinHash))) {
    const locked = await recordPinFailure(lockArgs);
    return { ok: false, error: locked > 0 ? lockMessage(locked) : "Your current PIN is wrong.", locked: locked || undefined };
  }
  const next = String(input.next ?? "").replace(/\D/g, "");
  const again = String(input.again ?? "").replace(/\D/g, "");
  const problem = pinProblem(next, await shopPhones(db, input.shopId, input.scope));
  if (problem) return { ok: false, error: problem };
  if (next !== again) return { ok: false, error: "The two new PINs don't match." };
  if (current && next === current) return { ok: false, error: "Pick a PIN that's different from the old one." };
  await recordPinSuccess(lockArgs);
  await db.account.update({ where: { id: account.id }, data: { pinHash: hashPin(next), pinMustChange: false } });
  await db.auditLog
    .create({
      data: {
        employeeId: account.employeeId || null,
        actor: account.name,
        action: "Changed sign-in PIN",
        field: "pin",
        ...(input.scope || {}),
      },
    })
    .catch(() => undefined);
  return { ok: true };
}

/** Is the PIN still the end of a phone number (old phone-made PINs)? For the "please change" banner. */
export async function pinSafetyFor(db: Db, input: { accountId: string; role: string; shopId: string; scope?: Record<string, unknown> }) {
  const account = await db.account.findFirst({ where: { id: input.accountId, ...(input.scope || {}) }, include: { employee: true } });
  if (!account) return { mine: "ok" as const, crewOnPhonePin: 0 };
  const row = await db.appSettings.findUnique({ where: { id: input.shopId } }).catch(() => null);
  const shop = [row?.companyPhone, row?.ownerPhone];
  const mine = !pinIsSet(account.pinHash)
    ? ("unset" as const)
    : account.pinMustChange
      ? ("reset" as const)
      : storedPinIsPhoneTail(account.pinHash, [...shop, account.employee?.phone])
      ? ("phone" as const)
      : ("ok" as const);
  let crewOnPhonePin = 0;
  if (input.role === "ADMIN") {
    const crew = await db.account.findMany({ where: { role: "CREW", ...(input.scope || {}) }, include: { employee: true } });
    for (const person of crew) {
      if (storedPinIsPhoneTail(person.pinHash, [person.employee?.phone, ...shop])) crewOnPhonePin += 1;
    }
  }
  return { mine, crewOnPhonePin };
}
