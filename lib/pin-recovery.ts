// Server only. Owner "Forgot PIN?" by email code + office resets a crew PIN (go-public, Eric 10:34 AM CT).
// Injected db so tests can run on a fake. The owner is never locked out by a lost phone: sign-in needs only the
// shop + PIN (no device binding), and a lost PIN comes back through a one-time code sent to the owner email AND
// the backup email. Only a hash of the code is stored.
import { createHash, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { hashPin, pinProblem } from "@/lib/pin";
import { REMOVED_PIN_HASH } from "@/lib/account-delete-core";
import { shopPhones } from "@/lib/pin-change";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const RESET_CODE_TTL_MS = 15 * 60_000;
export const RESET_MAX_ATTEMPTS = 5;
export const RESET_PER_IP_15MIN = 3;
export const RESET_PER_SHOP_HOUR = 5;

/** Same words whether or not the shop has an email on file, so the screen never tells which emails exist. */
export const RESET_SENT_LINE =
  "If this shop has an office email on file, a 6-digit code is on its way to it and to the backup email. It works for 15 minutes.";
export const RESET_NOT_CONNECTED_LINE =
  "Email isn\u2019t connected yet, so no code could be sent. Your PIN has not changed.";
export const RESET_BAD_CODE = "That code is wrong or too old. Ask for a new one.";
export const RESET_LIMITED = "Too many codes asked for. Try again in an hour.";

export function cleanEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase().slice(0, 200);
}

export function emailProblem(value: string) {
  if (!value) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? null : "That doesn\u2019t look like an email address.";
}

export function recoveryTargets(row: { ownerEmail?: string | null; recoveryEmail?: string | null } | null | undefined) {
  return [...new Set([cleanEmail(row?.ownerEmail), cleanEmail(row?.recoveryEmail)].filter((email) => email && !emailProblem(email)))];
}

export function resetCodeHash(resetId: string, code: string) {
  return createHash("sha256").update(`pin-reset:${resetId}:${code}`).digest("hex");
}

function sameHex(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** The owner's office login (the ADMIN login that isn't tied to an employee). */
export async function ownerAccount(db: Db, scope: Record<string, unknown> = {}) {
  return db.account.findFirst({ where: { role: "ADMIN", employeeId: null, pinHash: { not: REMOVED_PIN_HASH }, ...scope }, orderBy: { createdAt: "asc" } });
}

export type StartResult = { ok: true; emailConnected: boolean; line: string; devCode?: string } | { ok: false; limited: true; line: string };

export async function startPinReset(
  db: Db,
  input: {
    shopId: string;
    ip: string;
    now?: number;
    emailConnected: boolean;
    dev: boolean;
    send: (to: string, code: string) => Promise<unknown>;
    log?: (line: string) => void;
    scope?: Record<string, unknown>;
  }
): Promise<StartResult> {
  const now = input.now ?? Date.now();
  const [perShop, perIp] = await Promise.all([
    db.pinReset.count({ where: { shopId: input.shopId, createdAt: { gt: new Date(now - 60 * 60_000) } } }),
    db.pinReset.count({ where: { shopId: input.shopId, ip: input.ip, createdAt: { gt: new Date(now - 15 * 60_000) } } }),
  ]);
  if (perShop >= RESET_PER_SHOP_HOUR || perIp >= RESET_PER_IP_15MIN) return { ok: false, limited: true, line: RESET_LIMITED };

  const sentLine = input.emailConnected ? RESET_SENT_LINE : RESET_NOT_CONNECTED_LINE;
  // No email connected in production: nothing could arrive, so don't make a code at all.
  if (!input.emailConnected && !input.dev) return { ok: true, emailConnected: false, line: sentLine };

  const settings = await db.appSettings.findUnique({ where: { id: input.shopId } }).catch(() => null);
  const owner = await ownerAccount(db, input.scope);
  const targets = recoveryTargets(settings);
  // Same answer either way (doesn't reveal whether this shop has emails on file).
  if (!owner || !targets.length) return { ok: true, emailConnected: input.emailConnected, line: sentLine };

  // A new code replaces any older one.
  await db.pinReset.updateMany({
    where: { shopId: input.shopId, usedAt: null, expiresAt: { gt: new Date(now) } },
    data: { expiresAt: new Date(now) },
  });
  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.pinReset.create({
    data: {
      id,
      shopId: input.shopId,
      accountId: owner.id,
      codeHash: resetCodeHash(id, code),
      expiresAt: new Date(now + RESET_CODE_TTL_MS),
      ip: input.ip,
      createdAt: new Date(now),
    },
  });
  if (input.emailConnected) {
    for (const to of targets) await input.send(to, code).catch(() => undefined);
  } else if (input.dev) {
    // Dev only (never in production): there is no email key, so print the code where only the developer sees it.
    (input.log || console.info)(`[pin reset — DEV ONLY, email not connected] code ${code} (expires in 15 min)`);
  }
  await db.auditLog
    .create({ data: { actor: "Sign-in screen", action: "Forgot PIN: reset code asked for", field: "pin", ...(input.scope || {}) } })
    .catch(() => undefined);
  return { ok: true, emailConnected: input.emailConnected, line: sentLine, ...(input.dev && !input.emailConnected ? { devCode: code } : {}) };
}

export type FinishResult =
  | { ok: true; account: { id: string; role: string; name: string; employeeId: string | null; pinHash: string } }
  | { ok: false; error: string };

export async function finishPinReset(
  db: Db,
  input: { shopId: string; code: unknown; next: unknown; again: unknown; now?: number; scope?: Record<string, unknown> }
): Promise<FinishResult> {
  const now = input.now ?? Date.now();
  const code = String(input.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "Type the 6-digit code from the email." };
  const row = await db.pinReset.findFirst({
    where: { shopId: input.shopId, usedAt: null, expiresAt: { gt: new Date(now) } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, error: RESET_BAD_CODE };
  if (!sameHex(resetCodeHash(row.id, code), row.codeHash)) {
    const attempts = Number(row.attempts || 0) + 1;
    await db.pinReset.update({
      where: { id: row.id },
      data: attempts >= RESET_MAX_ATTEMPTS ? { attempts, expiresAt: new Date(now) } : { attempts },
    });
    return { ok: false, error: RESET_BAD_CODE };
  }
  const next = String(input.next ?? "").replace(/\D/g, "");
  const again = String(input.again ?? "").replace(/\D/g, "");
  const problem = pinProblem(next, await shopPhones(db, input.shopId, input.scope));
  if (problem) return { ok: false, error: problem };
  if (next !== again) return { ok: false, error: "The two new PINs don't match." };
  const account = await db.account.findFirst({ where: { id: row.accountId, ...(input.scope || {}) } });
  if (!account || account.pinHash === REMOVED_PIN_HASH) return { ok: false, error: RESET_BAD_CODE };

  const pinHash = hashPin(next);
  await db.account.update({ where: { id: account.id }, data: { pinHash, pinMustChange: false } });
  await db.pinReset.update({ where: { id: row.id }, data: { usedAt: new Date(now) } });
  await db.pinReset.updateMany({ where: { shopId: input.shopId, usedAt: null }, data: { expiresAt: new Date(now) } });
  // A good reset clears every PIN lockout for this shop (phones and the shop-wide counter).
  await db.loginThrottle.deleteMany({ where: { key: { startsWith: `${input.shopId}|` } } });
  await db.auditLog
    .create({ data: { actor: account.name, action: "PIN reset with email code", field: "pin", ...(input.scope || {}) } })
    .catch(() => undefined);
  return { ok: true, account: { ...account, pinHash } };
}

/** Office › Reset a crew PIN. The crew member signs in with it once, then is asked to pick their own. */
export async function resetCrewPinFor(
  db: Db,
  input: { shopId: string; actor: string; accountId: string; next: unknown; again: unknown; scope?: Record<string, unknown> }
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const account = await db.account.findFirst({ where: { id: String(input.accountId || ""), role: "CREW", ...(input.scope || {}) } });
  if (!account || account.pinHash === REMOVED_PIN_HASH) return { ok: false, error: "Pick a crew member." };
  const next = String(input.next ?? "").replace(/\D/g, "");
  const again = String(input.again ?? "").replace(/\D/g, "");
  const problem = pinProblem(next, await shopPhones(db, input.shopId, input.scope));
  if (problem) return { ok: false, error: problem };
  if (next !== again) return { ok: false, error: "The two PINs don't match." };
  await db.account.update({ where: { id: account.id }, data: { pinHash: hashPin(next), pinMustChange: true } });
  await db.auditLog
    .create({
      data: {
        employeeId: account.employeeId || null,
        actor: input.actor,
        action: `Office reset ${account.name}'s PIN`,
        field: "pin",
        ...(input.scope || {}),
      },
    })
    .catch(() => undefined);
  return { ok: true, name: account.name };
}

export async function crewLoginsFor(db: Db, scope: Record<string, unknown> = {}) {
  const rows = (await db.account.findMany({
    where: { role: "CREW", pinHash: { not: REMOVED_PIN_HASH }, ...scope },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })) as { id: string; name: string }[];
  return rows;
}

export async function saveRecoveryEmailsFor(
  db: Db,
  input: { shopId: string; actor: string; ownerEmail: unknown; recoveryEmail: unknown; scope?: Record<string, unknown> }
): Promise<{ ok: true; ownerEmail: string; recoveryEmail: string } | { ok: false; error: string }> {
  const ownerEmail = cleanEmail(input.ownerEmail);
  const recoveryEmail = cleanEmail(input.recoveryEmail);
  if (!ownerEmail) return { ok: false, error: "Type the owner email. Forgot PIN sends the code there." };
  const problem = emailProblem(ownerEmail) || emailProblem(recoveryEmail);
  if (problem) return { ok: false, error: problem };
  if (recoveryEmail && recoveryEmail === ownerEmail) return { ok: false, error: "Use a different email for the backup." };
  await db.appSettings.update({ where: { id: input.shopId }, data: { ownerEmail, recoveryEmail } });
  await db.auditLog
    .create({ data: { actor: input.actor, action: "Changed PIN recovery emails", field: "recoveryEmail", ...(input.scope || {}) } })
    .catch(() => undefined);
  return { ok: true, ownerEmail, recoveryEmail };
}
