import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hashPin, verifyPin } from "./pin";
import { signInWithPin } from "./pin-signin";
import { pinSafetyFor, changePinFor } from "./pin-change";
import {
  RESET_BAD_CODE,
  RESET_NOT_CONNECTED_LINE,
  RESET_SENT_LINE,
  crewLoginsFor,
  finishPinReset,
  recoveryTargets,
  resetCrewPinFor,
  saveRecoveryEmailsFor,
  startPinReset,
} from "./pin-recovery";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
type Row = Record<string, unknown>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, want]) => {
    const have = row[key];
    if (want && typeof want === "object" && !(want instanceof Date)) {
      const op = want as Record<string, unknown>;
      if ("not" in op) return have !== op.not;
      if ("gt" in op) return have instanceof Date && have.getTime() > (op.gt as Date).getTime();
      if ("startsWith" in op) return String(have).startsWith(String(op.startsWith));
      if ("in" in op) return (op.in as unknown[]).includes(have);
    }
    return have === want;
  });
}

function table(rows: Row[]) {
  return {
    rows,
    findFirst: async ({ where, orderBy }: { where?: Row; orderBy?: Row; include?: unknown }) => {
      const hits = rows.filter((r) => matches(r, where));
      if (orderBy && "createdAt" in orderBy && orderBy.createdAt === "desc") hits.sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
      return hits[0] || null;
    },
    findUnique: async ({ where }: { where: Row }) => rows.find((r) => matches(r, where)) || null,
    findMany: async ({ where }: { where?: Row } = {}) => rows.filter((r) => matches(r, where)),
    count: async ({ where }: { where?: Row }) => rows.filter((r) => matches(r, where)).length,
    create: async ({ data }: { data: Row }) => {
      const row = { createdAt: new Date(), attempts: 0, usedAt: null, ...data };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows.find((r) => matches(r, where))!;
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hits = rows.filter((r) => matches(r, where));
      hits.forEach((r) => Object.assign(r, data));
      return { count: hits.length };
    },
    deleteMany: async ({ where }: { where: Row }) => {
      const keep = rows.filter((r) => !matches(r, where));
      const count = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count };
    },
    upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
      const row = rows.find((r) => matches(r, where));
      if (row) Object.assign(row, update);
      else rows.push({ ...create });
    },
  };
}

function shop(opts: { ownerEmail?: string; recoveryEmail?: string } = {}) {
  const settings: Row = { id: "default", ownerEmail: opts.ownerEmail ?? "jobcommandofficial@gmail.com", recoveryEmail: opts.recoveryEmail ?? "topgungold49@gmail.com", companyPhone: "501-555-0142", ownerPhone: "501-555-0142" };
  const db = {
    account: table([
      { id: "owner", role: "ADMIN", name: "Eric", employeeId: null, pinHash: hashPin("4827"), pinMustChange: false, createdAt: new Date(1) },
      { id: "casey", role: "CREW", name: "Casey", employeeId: "e1", pinHash: hashPin("7391"), pinMustChange: false, createdAt: new Date(2) },
      { id: "gone", role: "CREW", name: "Gone", employeeId: "e2", pinHash: "REMOVED", pinMustChange: false, createdAt: new Date(3) },
    ]),
    appSettings: table([settings]),
    employee: table([{ id: "e1", phone: "501-555-0148" }]),
    pinReset: table([]),
    loginThrottle: table([]),
    auditLog: table([]),
  };
  return db;
}

function starter(db: ReturnType<typeof shop>, over: Partial<Parameters<typeof startPinReset>[1]> = {}) {
  const sent: Array<{ to: string; code: string }> = [];
  const logs: string[] = [];
  const run = (extra: Partial<Parameters<typeof startPinReset>[1]> = {}) =>
    startPinReset(db, {
      shopId: "default",
      ip: "10.0.0.1",
      emailConnected: true,
      dev: false,
      send: async (to, code) => sent.push({ to, code }),
      log: (line) => logs.push(line),
      ...over,
      ...extra,
    });
  return { sent, logs, run };
}

test("recovery targets: owner email + backup email, deduped, junk dropped", () => {
  assert.deepEqual(recoveryTargets({ ownerEmail: "JobCommandOfficial@gmail.com ", recoveryEmail: "topgungold49@gmail.com" }), [
    "jobcommandofficial@gmail.com",
    "topgungold49@gmail.com",
  ]);
  assert.deepEqual(recoveryTargets({ ownerEmail: "a@b.co", recoveryEmail: "a@b.co" }), ["a@b.co"]);
  assert.deepEqual(recoveryTargets({ ownerEmail: "nope", recoveryEmail: "" }), []);
});

test("forgot PIN: code goes to BOTH emails, only a hash is stored, expires in 15 min", async () => {
  const db = shop();
  const { sent, run } = starter(db);
  const result = await run({ now: 1_000_000 });
  assert.equal(result.ok, true);
  assert.deepEqual(sent.map((row) => row.to), ["jobcommandofficial@gmail.com", "topgungold49@gmail.com"]);
  assert.equal(sent[0].code, sent[1].code);
  assert.match(sent[0].code, /^\d{6}$/);
  const row = db.pinReset.rows[0];
  assert.ok(!JSON.stringify(row).includes(sent[0].code));
  assert.equal((row.expiresAt as Date).getTime(), 1_000_000 + 15 * 60_000);
});

test("forgot PIN: same answer whether or not emails exist (never reveals which emails are on file)", async () => {
  const withEmails = await starter(shop()).run();
  const noEmails = await starter(shop({ ownerEmail: "", recoveryEmail: "" })).run();
  assert.equal(withEmails.ok && withEmails.line, RESET_SENT_LINE);
  assert.equal(noEmails.ok && noEmails.line, RESET_SENT_LINE);
  assert.doesNotMatch(RESET_SENT_LINE, /@/);
  const route = read("app/api/session/recover/route.ts");
  assert.doesNotMatch(route, /devCode: result|ownerEmail|recoveryEmail/);
});

test("forgot PIN: rate limited per phone (3 / 15 min) and per shop (5 / hour)", async () => {
  const db = shop();
  const { run } = starter(db);
  const now = 5_000_000;
  for (let i = 0; i < 3; i += 1) assert.equal((await run({ now: now + i })).ok, true);
  assert.equal((await run({ now: now + 3 })).ok, false);
  assert.equal((await run({ now: now + 4, ip: "10.0.0.2" })).ok, true);
  assert.equal((await run({ now: now + 5, ip: "10.0.0.3" })).ok, true);
  assert.equal((await run({ now: now + 6, ip: "10.0.0.4" })).ok, false); // 5 for the shop this hour
  assert.equal((await run({ now: now + 61 * 60_000, ip: "10.0.0.4" })).ok, true);
});

test("email not connected: honest line; dev logs the code server-side only; production makes no code", async () => {
  const dev = shop();
  const d = starter(dev, { emailConnected: false, dev: true });
  const r1 = await d.run();
  assert.equal(r1.ok && r1.emailConnected, false);
  assert.equal(r1.ok && r1.line, RESET_NOT_CONNECTED_LINE);
  assert.equal(d.sent.length, 0);
  assert.match(d.logs[0], /DEV ONLY.*code \d{6}/);
  const prod = shop();
  const p = starter(prod, { emailConnected: false, dev: false });
  const r2 = await p.run();
  assert.equal(r2.ok && r2.line, RESET_NOT_CONNECTED_LINE);
  assert.equal(prod.pinReset.rows.length, 0);
  assert.equal(p.logs.length, 0);
  assert.match(read("app/api/session/recover/route.ts"), /dev: process\.env\.NODE_ENV !== "production"/);
});

test("reset: right code + good PIN sets the PIN, clears every lockout, and signs in on a NEW phone", async () => {
  const db = shop();
  const { sent, run } = starter(db);
  const now = 9_000_000;
  // The shop is locked out (phones + shop-wide).
  db.loginThrottle.rows.push(
    { key: "default|ip:10.0.0.9", failures: 5, lockCount: 3, lockedUntil: new Date(now + 3_600_000), lastFailAt: new Date(now) },
    { key: "default|shop", failures: 25, lockCount: 2, lockedUntil: new Date(now + 3_600_000), lastFailAt: new Date(now) }
  );
  assert.equal((await signInWithPin(db, { shopId: "default", ip: "10.0.0.9", pin: "4827", now })).kind, "locked");
  await run({ now });
  const code = sent[0].code;
  assert.equal((await finishPinReset(db, { shopId: "default", code, next: "1234", again: "1234", now })).ok, false); // easy PIN refused
  assert.equal((await finishPinReset(db, { shopId: "default", code, next: "8604", again: "8605", now })).ok, false);
  const done = await finishPinReset(db, { shopId: "default", code, next: "8604", again: "8604", now: now + 1000 });
  assert.equal(done.ok, true);
  assert.equal(done.ok && done.account.id, "owner");
  assert.ok(verifyPin("8604", String(db.account.rows[0].pinHash)));
  assert.equal(db.loginThrottle.rows.length, 0);
  // A brand-new phone (new IP, no cookie) signs in with shop + new PIN. Nothing ties it to the old device.
  const fresh = await signInWithPin(db, { shopId: "default", ip: "172.16.0.50", pin: "8604", now: now + 2000 });
  assert.equal(fresh.kind, "ok");
  // The code is one-time.
  assert.deepEqual(await finishPinReset(db, { shopId: "default", code, next: "9517", again: "9517", now: now + 3000 }), { ok: false, error: RESET_BAD_CODE });
});

test("reset: wrong codes count; 5 wrong kills the code; expired codes fail; a new code replaces the old", async () => {
  const db = shop();
  const { sent, run } = starter(db);
  const now = 20_000_000;
  await run({ now });
  const code = sent[0].code;
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(await finishPinReset(db, { shopId: "default", code: wrong, next: "8604", again: "8604", now }), { ok: false, error: RESET_BAD_CODE });
  }
  assert.equal((await finishPinReset(db, { shopId: "default", code, next: "8604", again: "8604", now })).ok, false);

  await run({ now: now + 10, ip: "10.0.0.5" });
  const late = sent[2].code; // two emails per code (owner + backup)
  assert.equal((await finishPinReset(db, { shopId: "default", code: late, next: "8604", again: "8604", now: now + 16 * 60_000 })).ok, false);

  await run({ now: now + 20, ip: "10.0.0.6" });
  const older = sent[4].code;
  await run({ now: now + 30, ip: "10.0.0.7" });
  const newest = sent[6].code;
  if (older !== newest) {
    assert.equal((await finishPinReset(db, { shopId: "default", code: older, next: "8604", again: "8604", now: now + 40 })).ok, false);
  }
  assert.equal((await finishPinReset(db, { shopId: "default", code: newest, next: "8604", again: "8604", now: now + 50 })).ok, true);
});

test("office resets a crew PIN: hashed, easy PINs refused, crew asked to pick their own, removed logins skipped", async () => {
  const db = shop();
  assert.deepEqual((await crewLoginsFor(db)).map((row) => row.name), ["Casey"]);
  assert.equal((await resetCrewPinFor(db, { shopId: "default", actor: "Eric", accountId: "owner", next: "5826", again: "5826" })).ok, false);
  assert.equal((await resetCrewPinFor(db, { shopId: "default", actor: "Eric", accountId: "gone", next: "5826", again: "5826" })).ok, false);
  assert.equal((await resetCrewPinFor(db, { shopId: "default", actor: "Eric", accountId: "casey", next: "0148", again: "0148" })).ok, false); // phone tail
  const ok = await resetCrewPinFor(db, { shopId: "default", actor: "Eric", accountId: "casey", next: "5826", again: "5826" });
  assert.equal(ok.ok, true);
  const casey = db.account.rows[1];
  assert.ok(verifyPin("5826", String(casey.pinHash)));
  assert.equal(casey.pinMustChange, true);
  assert.equal((await signInWithPin(db, { shopId: "default", ip: "10.1.1.1", pin: "5826" })).kind, "ok");
  assert.equal((await pinSafetyFor(db, { accountId: "casey", role: "CREW", shopId: "default" })).mine, "reset");
  assert.equal((await changePinFor(db, { accountId: "casey", shopId: "default", current: "5826", next: "9173", again: "9173" })).ok, true);
  assert.equal(casey.pinMustChange, false);
});

test("recovery emails: office edits both; bad or same emails refused", async () => {
  const db = shop();
  assert.equal((await saveRecoveryEmailsFor(db, { shopId: "default", actor: "Eric", ownerEmail: "", recoveryEmail: "x@y.co" })).ok, false);
  assert.equal((await saveRecoveryEmailsFor(db, { shopId: "default", actor: "Eric", ownerEmail: "a@b.co", recoveryEmail: "nope" })).ok, false);
  assert.equal((await saveRecoveryEmailsFor(db, { shopId: "default", actor: "Eric", ownerEmail: "a@b.co", recoveryEmail: "A@b.co" })).ok, false);
  const ok = await saveRecoveryEmailsFor(db, { shopId: "default", actor: "Eric", ownerEmail: " JobCommandOfficial@gmail.com", recoveryEmail: "topgungold49@gmail.com" });
  assert.deepEqual(ok, { ok: true, ownerEmail: "jobcommandofficial@gmail.com", recoveryEmail: "topgungold49@gmail.com" });
});

test("wiring: Forgot PIN on the gate, office-only actions, public recover route, schema", () => {
  assert.match(read("components/command/AccessGate.tsx"), /Forgot PIN\?/);
  assert.match(read("components/command/ForgotPin.tsx"), /data-forgot-not-connected/);
  assert.match(RESET_NOT_CONNECTED_LINE, /Email isn\u2019t connected yet/);
  const actions = read("app/pin-actions.ts");
  for (const name of ["saveRecoveryEmails", "listCrewLogins", "resetCrewPin", "getRecoveryEmails"]) {
    assert.match(actions, new RegExp(`export async function ${name}\\([^)]*\\)[^{]*\\{[\\s\\S]{0,120}officeOnly\\(\\)`), name);
  }
  assert.match(read("middleware.ts"), /\^\\\/api\\\/session/);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /recoveryEmail\s+String\s+@default\(""\)/);
  assert.match(schema, /pinMustChange Boolean\s+@default\(false\)/);
  assert.match(schema, /model PinReset \{[\s\S]*codeHash[\s\S]*expiresAt/);
});
