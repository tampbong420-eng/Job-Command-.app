import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isTrivialPin, normalizePinDigits, pinMatchesPhone, pinProblem } from "./signup-pin";
import { UNSET_PIN_HASH, hashPin, storedPinIsPhoneTail, verifyPin } from "./pin";
import { afterFailure, afterSuccess, blankRow, lockedFor, lockMsFor } from "./login-throttle-core";
import { signInWithPin } from "./pin-signin";
import { changePinFor, pinSafetyFor } from "./pin-change";

/* Tiny in-memory stand-in for the Prisma models these helpers touch. */
function fakeDb(accounts: Array<Record<string, unknown>>, settings: Record<string, unknown> = {}, employees: Array<Record<string, unknown>> = []) {
  const throttle = new Map<string, Record<string, unknown>>();
  const audit: unknown[] = [];
  const match = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && "not" in (value as object)) return row[key] !== (value as { not: unknown }).not;
      return row[key] === value;
    });
  return {
    audit,
    throttle,
    accounts,
    account: {
      findFirst: async ({ where, include }: { where: Record<string, unknown>; include?: unknown }) => {
        const row = accounts.find((item) => match(item, where));
        if (!row) return null;
        return include ? { ...row, employee: employees.find((e) => e.id === row.employeeId) || null } : row;
      },
      findMany: async ({ where, include }: { where: Record<string, unknown>; include?: unknown }) =>
        accounts.filter((item) => match(item, where)).map((row) => (include ? { ...row, employee: employees.find((e) => e.id === row.employeeId) || null } : row)),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = accounts.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    employee: { findMany: async () => employees },
    appSettings: { findUnique: async () => settings },
    auditLog: { create: async (row: unknown) => audit.push(row) },
    loginThrottle: {
      findUnique: async ({ where }: { where: { key: string } }) => throttle.get(where.key) || null,
      deleteMany: async ({ where }: { where: { key: string } }) => throttle.delete(where.key),
      upsert: async ({ where, create, update }: { where: { key: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        throttle.set(where.key, { ...(throttle.get(where.key) || create), ...update, key: where.key });
      },
    },
  };
}

test("PIN rules: 4–6 numbers; 0000, 1234, runs, repeats and common PINs are refused", () => {
  assert.equal(normalizePinDigits("12"), "");
  assert.equal(normalizePinDigits("4827"), "4827");
  assert.equal(normalizePinDigits("482713"), "482713");
  assert.equal(normalizePinDigits("4827131"), "");
  for (const pin of ["0000", "1111", "1234", "4321", "9876", "6789", "123456", "654321", "1212", "4545", "2580", "1001", "4242", "7890", "098765"]) {
    assert.equal(isTrivialPin(pin), true, pin);
    assert.match(pinProblem(pin)!, /too easy/, pin);
  }
  assert.equal(pinProblem("4827"), null);
  assert.equal(pinProblem("390716"), null);
  assert.match(pinProblem("")!, /Pick a PIN/);
  assert.match(pinProblem("12")!, /4 to 6/);
});

test("PIN rules: the end of the shop's or the person's phone is refused (it's printed on invoices)", () => {
  const phones = ["501-555-0142", "(501) 617-5269", null];
  assert.equal(pinMatchesPhone("0142", phones), true);
  assert.equal(pinMatchesPhone("5269", phones), true);
  assert.equal(pinMatchesPhone("550142", phones), true);
  assert.equal(pinMatchesPhone("990142", phones), true); // 6 digits still ending in the phone's last 4
  assert.equal(pinMatchesPhone("4827", phones), false);
  assert.match(pinProblem("0142", phones)!, /phone number/);
});

test("a login with no PIN picked yet can never be opened", () => {
  assert.equal(verifyPin("1001", UNSET_PIN_HASH), false);
  assert.equal(verifyPin("", hashPin("4827")), false);
});

test("old phone-made PINs are detected for the 'please change your PIN' banner", () => {
  assert.equal(storedPinIsPhoneTail(hashPin("0142"), ["501-555-0142"]), true);
  assert.equal(storedPinIsPhoneTail(hashPin("4827"), ["501-555-0142"]), false);
  assert.equal(storedPinIsPhoneTail(UNSET_PIN_HASH, ["501-555-0142"]), false);
});

test("lockout core: 5 wrong → 5 min, then 10, 20 (backoff); right PIN clears the phone", () => {
  let row = blankRow("default|ip:1.2.3.4");
  const t0 = 1_000_000;
  for (let i = 0; i < 4; i += 1) row = afterFailure(row, t0 + i);
  assert.equal(lockedFor(row, t0 + 5), 0);
  row = afterFailure(row, t0 + 5);
  assert.equal(lockedFor(row, t0 + 5), 300);
  // after the lock runs out, five more wrong → 10 minutes
  let t = t0 + 5 + 300_000 + 1;
  for (let i = 0; i < 5; i += 1) row = afterFailure(row, t + i);
  assert.equal(lockedFor(row, t + 4), 600);
  assert.equal(lockMsFor(2), 20 * 60_000);
  assert.equal(lockMsFor(50), 24 * 60 * 60_000);
  assert.equal(afterSuccess(row), null);
  // the shop-wide counter needs 25 and keeps its backoff level on success
  let shop = blankRow("default|shop");
  for (let i = 0; i < 24; i += 1) shop = afterFailure(shop, t0 + i);
  assert.equal(lockedFor(shop, t0 + 24), 0);
  shop = afterFailure(shop, t0 + 25);
  assert.ok(lockedFor(shop, t0 + 25) > 0);
  t = 0;
});

test("PIN-first sign-in: the PIN finds the person; wrong PINs lock the phone out on the server", async () => {
  const db = fakeDb([
    { id: "office", role: "ADMIN", name: "Office", employeeId: null, pinHash: hashPin("4827") },
    { id: "crew1", role: "CREW", name: "Avery", employeeId: "e1", pinHash: hashPin("3961") },
    { id: "crew2", role: "CREW", name: "New hire", employeeId: "e2", pinHash: UNSET_PIN_HASH },
    { id: "gone", role: "CREW", name: "Gone", employeeId: "e3", pinHash: "REMOVED" },
  ]);
  const now = 5_000_000;
  const base = { shopId: "default", ip: "9.9.9.9", now };
  const ok = await signInWithPin(db, { ...base, pin: "3961" });
  assert.equal(ok.kind, "ok");
  assert.equal(ok.kind === "ok" && ok.account.id, "crew1");
  for (let i = 0; i < 4; i += 1) assert.equal((await signInWithPin(db, { ...base, pin: "1111" })).kind, "wrong");
  const fifth = await signInWithPin(db, { ...base, pin: "1111" });
  assert.equal(fifth.kind, "locked");
  // locked: even the right PIN is refused until the lock runs out
  assert.equal((await signInWithPin(db, { ...base, pin: "4827" })).kind, "locked");
  // another phone/IP is not locked by this one
  assert.equal((await signInWithPin(db, { ...base, ip: "8.8.8.8", pin: "4827" })).kind, "ok");
  const later = await signInWithPin(db, { ...base, now: now + 5 * 60_000 + 1000, pin: "4827" });
  assert.equal(later.kind, "ok");
});

test("PIN-first sign-in: two logins on one PIN → only those two names are shown", async () => {
  const db = fakeDb([
    { id: "a", role: "CREW", name: "Avery", employeeId: "e1", pinHash: hashPin("3961") },
    { id: "b", role: "CREW", name: "Casey", employeeId: "e2", pinHash: hashPin("3961") },
    { id: "c", role: "CREW", name: "Jordan", employeeId: "e3", pinHash: hashPin("7302") },
  ]);
  const out = await signInWithPin(db, { shopId: "default", ip: "1.1.1.1", pin: "3961" });
  assert.equal(out.kind, "choose");
  assert.deepEqual(out.kind === "choose" && out.people.map((p) => p.name), ["Avery", "Casey"]);
  const picked = await signInWithPin(db, { shopId: "default", ip: "1.1.1.1", pin: "3961", accountId: "b" });
  assert.equal(picked.kind === "ok" && picked.account.id, "b");
});

test("Change PIN: needs the current PIN, the new one twice, refuses easy/phone PINs, stores a hash", async () => {
  const db = fakeDb(
    [{ id: "office", role: "ADMIN", name: "Office", employeeId: null, pinHash: hashPin("0142") }],
    { companyPhone: "501-555-0142", ownerPhone: "501-617-5269" },
    [{ id: "e1", phone: "501-555-7788" }]
  );
  const go = (current: string, next: string, again = next) => changePinFor(db, { accountId: "office", shopId: "default", current, next, again });
  assert.match(((await go("9999", "4827")) as { error: string }).error, /current PIN is wrong/);
  assert.match(((await go("0142", "1234")) as { error: string }).error, /too easy/);
  assert.match(((await go("0142", "7788")) as { error: string }).error, /phone/);
  assert.match(((await go("0142", "5269")) as { error: string }).error, /phone/);
  assert.match(((await go("0142", "4827", "4828")) as { error: string }).error, /match/);
  assert.equal((await pinSafetyFor(db, { accountId: "office", role: "ADMIN", shopId: "default" })).mine, "phone");
  assert.deepEqual(await go("0142", "4827"), { ok: true });
  const stored = String(db.accounts[0].pinHash);
  assert.ok(!stored.includes("4827"));
  assert.equal(verifyPin("4827", stored), true);
  assert.equal(verifyPin("0142", stored), false);
  assert.equal((await pinSafetyFor(db, { accountId: "office", role: "ADMIN", shopId: "default" })).mine, "ok");
  assert.equal(db.audit.length, 1);
});

test("Change PIN: 5 wrong current PINs lock this login's PIN change out", async () => {
  const db = fakeDb([{ id: "office", role: "ADMIN", name: "Office", employeeId: null, pinHash: hashPin("4827") }]);
  let last: unknown = null;
  for (let i = 0; i < 5; i += 1) last = await changePinFor(db, { accountId: "office", shopId: "default", current: "0000", next: "3961", again: "3961", now: 1 });
  assert.ok((last as { locked?: number }).locked! > 0);
  const right = await changePinFor(db, { accountId: "office", shopId: "default", current: "4827", next: "3961", again: "3961", now: 2 });
  assert.equal(right.ok, false);
});

test("no PIN is ever made from a phone number, and the gate never lists people", () => {
  const accounts = readFileSync(new URL("./accounts.ts", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  const flow = readFileSync(new URL("./signup-flow.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/session/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const src of [accounts, actions]) assert.doesNotMatch(src, /hashPin\(pinFromPhone/);
  assert.doesNotMatch(flow, /slice\(-4\)/);
  assert.doesNotMatch(route, /listGatePeople/);
  assert.doesNotMatch(page, /listGatePeople\(\)/);
  const gate = readFileSync(new URL("../components/command/AccessGate.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(gate, /last 4 numbers of your phone/);
  const office = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(office, /<ChangePin office \/>/);
});
