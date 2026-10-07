import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { bankContext, decryptField, encryptField, isEncryptedField, parseFieldKey } from "./field-crypto";

process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
const KEY = parseFieldKey(process.env.FIELD_ENCRYPTION_KEY);

test("bank numbers: AES-256-GCM round trip, random IV, nothing readable at rest", () => {
  const ctx = bankContext("emp1", "depositAccount");
  const a = encryptField("000123456789", ctx, KEY);
  const b = encryptField("000123456789", ctx, KEY);
  assert.ok(isEncryptedField(a));
  assert.notEqual(a, b); // fresh IV every time
  assert.ok(!a.includes("123456789"));
  assert.equal(decryptField(a, ctx, KEY), "000123456789");
  assert.equal(encryptField("", ctx, KEY), "");
});

test("bank numbers: wrong key, wrong row, or tampering reads as blank (never garbage)", () => {
  const ctx = bankContext("emp1", "depositRouting");
  const sealed = encryptField("111000025", ctx, KEY);
  assert.equal(decryptField(sealed, ctx, randomBytes(32)), "");
  assert.equal(decryptField(sealed, bankContext("emp2", "depositRouting"), KEY), "");
  const flipped = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
  assert.equal(decryptField(flipped, ctx, KEY), "");
  assert.equal(decryptField(sealed, ctx, null), "");
});

test("bank numbers: no key → refuse to save (never falls back to plain text)", () => {
  assert.throws(() => encryptField("111000025", "x", null), /FIELD_ENCRYPTION_KEY/);
  // old plain rows still read until the migration runs
  assert.equal(decryptField("111000025", "x", KEY), "111000025");
  assert.equal(parseFieldKey("short"), null);
  assert.equal(parseFieldKey("ab".repeat(32))?.length, 32);
});

test("migration encrypts plain rows in place and is safe to run twice", async () => {
  const { sealPlainBankRows } = await import("./bank-migrate");
  const { readBank, bankForScreen } = await import("./bank-fields");
  const rows = [
    { id: "e1", depositRouting: "111000025", depositAccount: "000123456789" },
    { id: "e2", depositRouting: "", depositAccount: "" },
  ];
  const db = {
    employee: {
      findMany: async () => rows.map((row) => ({ ...row })),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, string> }) => Object.assign(rows.find((r) => r.id === where.id)!, data),
    },
  };
  assert.deepEqual(await sealPlainBankRows(db), { checked: 2, sealed: 1 });
  assert.ok(isEncryptedField(rows[0].depositRouting) && isEncryptedField(rows[0].depositAccount));
  assert.equal(rows[1].depositAccount, "");
  assert.deepEqual(readBank(rows[0]), { routing: "111000025", account: "000123456789" });
  assert.deepEqual(bankForScreen(rows[0]), { depositRoutingLast4: "0025", depositAccountLast4: "6789" });
  assert.deepEqual(await sealPlainBankRows(db), { checked: 2, sealed: 0 });
});

test("the phone never gets full bank numbers; saving goes through the encryptor", () => {
  const queries = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  const types = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/command/ProfilePay.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(queries, /depositRouting: employee\.depositRouting/);
  assert.match(queries, /bankForScreen\(employee\)/);
  assert.doesNotMatch(types, /depositRouting\?: string/);
  assert.match(actions, /sealBank\(current\.id/);
  assert.doesNotMatch(actions, /depositAccount: account,/);
  assert.doesNotMatch(ui, /defaultValue=\{employee\.depositRouting/);
});
