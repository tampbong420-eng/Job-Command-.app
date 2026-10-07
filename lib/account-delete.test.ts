import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  REMOVED_PIN_HASH,
  SHOP_WIPE_KEEPS,
  SHOP_WIPE_ORDER,
  billingNoteAfterDelete,
  deletePhraseOk,
  liveSubscription,
  loginRemoved,
  uploadRelPath,
} from "./account-delete-core";
import { verifyPin } from "./pin";

test("second step needs the typed word DELETE", () => {
  assert.equal(deletePhraseOk("DELETE"), true);
  assert.equal(deletePhraseOk(" delete "), true);
  assert.equal(deletePhraseOk("DELET"), false);
  assert.equal(deletePhraseOk(""), false);
  assert.equal(deletePhraseOk(undefined), false);
});

test("a paid plan that would keep charging is spotted; mock checkouts never charge", () => {
  assert.equal(liveSubscription({ billingStatus: "active", stripeSubId: "sub_1" }).live, true);
  assert.equal(liveSubscription({ billingStatus: "trial", stripeSubId: "sub_1" }).live, true);
  assert.equal(liveSubscription({ billingStatus: "past_due", stripeSubId: "sub_1" }).live, true);
  assert.equal(liveSubscription({ billingStatus: "canceled", stripeSubId: "sub_1" }).live, false);
  assert.equal(liveSubscription({ billingStatus: "trial", stripeSubId: "" }).live, false);
  assert.equal(liveSubscription({ billingStatus: "active", stripeSubId: "mock_base_1" }).live, false);
  assert.deepEqual(liveSubscription({ stripeAddonSubId: "sub_a", addonStatus: "active" }), { live: true, base: false, addon: true });
  assert.equal(liveSubscription(null).live, false);
});

test("billing note keeps Stripe ids only, and says auto-cancel is not wired", () => {
  const note = billingNoteAfterDelete(
    { billingStatus: "active", stripeSubId: "sub_9", stripeCustomerId: "cus_9" },
    new Date("2026-10-02T12:00:00Z")
  );
  assert.ok(note);
  assert.match(note.newValue, /cus_9/);
  assert.match(note.newValue, /sub_9/);
  assert.match(note.newValue, /not wired/);
  assert.equal(billingNoteAfterDelete({ billingStatus: "none" }, new Date()), null);
});

test("removed crew login can never match a PIN", () => {
  assert.equal(verifyPin("0000", REMOVED_PIN_HASH), false);
  assert.equal(verifyPin("4242", REMOVED_PIN_HASH), false);
  assert.equal(loginRemoved({ pinHash: REMOVED_PIN_HASH }), true);
  assert.equal(loginRemoved({ pinHash: "salt:hash" }), false);
});

test("upload paths never escape the uploads folder", () => {
  assert.equal(uploadRelPath("/uploads/jobs/a.jpg"), "jobs/a.jpg");
  assert.equal(uploadRelPath("/uploads/../prisma/dev.db"), null);
  assert.equal(uploadRelPath("/avatars/a.png"), null);
  assert.equal(uploadRelPath(""), null);
});

test("the shop wipe covers every model in the schema (new models must be added or kept on purpose)", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1].charAt(0).toLowerCase() + m[1].slice(1));
  const covered = new Set<string>([...SHOP_WIPE_ORDER, ...SHOP_WIPE_KEEPS]);
  const missing = models.filter((model) => !covered.has(model));
  assert.deepEqual(missing, [], `add to SHOP_WIPE_ORDER or SHOP_WIPE_KEEPS: ${missing.join(", ")}`);
});

test("delete buttons: office on Company, crew on their own home; actions check the role server-side", () => {
  const actions = readFileSync(new URL("../app/account-actions.ts", import.meta.url), "utf8");
  assert.match(actions, /session\?\.role !== "ADMIN"/);
  assert.match(actions, /session\?\.role !== "CREW"/);
  assert.match(actions, /deletePhraseOk\(input\.confirm\)/);
  assert.doesNotMatch(actions, /billing-stripe|stripe\.subscriptions|cancelSubscription/i, "never calls Stripe");
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(desk, /<DeleteShopAccount \/>/);
  const home = readFileSync(new URL("../components/command/EmployeeHome.tsx", import.meta.url), "utf8");
  assert.match(home, /<DeleteMyLogin \/>/);
  const accounts = readFileSync(new URL("./accounts.ts", import.meta.url), "utf8");
  assert.match(accounts, /loginRemoved\(exists\)\) continue/);
  assert.match(accounts, /pinHash: \{ not: REMOVED_PIN_HASH \}/);
});

/* ---- On a throwaway DB copy (never the live DB): fresh schema in a temp folder, seeded here. ---- */
test("wipeShop and removeCrewLogin on a temp DB copy", { timeout: 120_000 }, async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "jc-delete-"));
  const dbFile = path.join(dir, "copy.db");
  const url = `file:${dbFile}`;
  assert.ok(dbFile.startsWith(tmpdir()), "test DB must live in the temp folder");
  const push = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
    { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" }
  );
  if (push.status !== 0) {
    t.skip(`prisma db push unavailable: ${(push.stderr || push.stdout).slice(0, 200)}`);
    return;
  }
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const uploads = path.join(dir, "uploads");
  mkdirSync(path.join(uploads, "jobs"), { recursive: true });
  writeFileSync(path.join(uploads, "jobs", "site.jpg"), "x");
  writeFileSync(path.join(uploads, "crew.jpg"), "x");
  try {
    const { removeCrewLogin, wipeShop } = await import("./account-delete");
    await db.appSettings.create({
      data: {
        id: "default",
        periodAnchor: new Date(),
        setupComplete: true,
        businessName: "Acme Plumbing",
        billingStatus: "active",
        stripeSubId: "sub_test",
        stripeCustomerId: "cus_test",
      },
    });
    const customer = await db.customer.create({ data: { name: "Linda Park" } as never });
    const job = await db.job.create({ data: { code: "AP-1", name: "Water heater", client: "Linda Park", customerId: customer.id } as never });
    await db.jobPhoto.create({ data: { jobId: job.id, url: "/uploads/jobs/site.jpg" } as never });
    const employee = await db.employee.create({
      data: { firstName: "Jordan", lastName: "Blake", jobTitle: "Plumber", baselineStartDate: new Date(), photoUrl: "/uploads/crew.jpg", phone: "9185550101" },
    });
    const crew = await db.account.create({ data: { role: "CREW", name: "Jordan Blake", employeeId: employee.id, pinHash: "a:b", inviteToken: "tok" } });
    await db.account.create({ data: { role: "ADMIN", name: "Sam Rivera", pinHash: "a:b" } });
    await db.auditLog.create({ data: { actor: "x", action: "y" } });
    const hasTrialClaim = Boolean((db as unknown as Record<string, unknown>).trialClaim);
    if (hasTrialClaim) {
      await (db as never as { trialClaim: { create(a: unknown): Promise<unknown> } }).trialClaim.create({
        data: { kind: "PHONE", valueHash: "h1" },
      });
    }

    // Crew deletes their own login: tombstone, invite gone, photo gone, payroll person stays.
    const removed = await removeCrewLogin(db, { accountId: crew.id, uploadsRoot: uploads });
    assert.equal(removed.ok, true);
    const tomb = await db.account.findUnique({ where: { id: crew.id } });
    assert.equal(tomb?.pinHash, REMOVED_PIN_HASH);
    assert.equal(tomb?.inviteToken, null);
    assert.equal((await db.employee.findUnique({ where: { id: employee.id } }))?.photoUrl, null);
    assert.ok(await db.employee.findUnique({ where: { id: employee.id } }), "payroll person stays");
    assert.equal(existsSync(path.join(uploads, "crew.jpg")), false);

    // Office deletes the shop.
    const result = await wipeShop(db, { uploadsRoot: uploads });
    assert.equal(result.subscription.live, true);
    assert.equal(result.billingNote, true);
    for (const model of SHOP_WIPE_ORDER) {
      const delegate = (db as unknown as Record<string, { count?: () => Promise<number> }>)[model];
      if (!delegate?.count) continue;
      const left = await delegate.count();
      if (model === "auditLog") assert.equal(left, 1, "only the billing note remains");
      else assert.equal(left, 0, `${model} should be empty`);
    }
    const note = await db.auditLog.findFirst();
    assert.match(note?.newValue || "", /sub_test/);
    assert.doesNotMatch(JSON.stringify(note), /Linda|Jordan|Acme|9185550101/, "billing note has no personal data");
    assert.deepEqual(readdirSync(uploads), [], "uploads emptied");
    if (hasTrialClaim) {
      const kept = await (db as never as { trialClaim: { count(): Promise<number> } }).trialClaim.count();
      assert.equal(kept, 1, "hashed trial checks are kept on purpose");
    }
  } finally {
    await db.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  }
});
