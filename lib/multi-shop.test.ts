import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildModelMap, foreignKeysIn, scopeSettingsArgs, scopeTenantArgs } from "./shop-scope-core";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const MAP = buildModelMap([
  { name: "Invoice", fields: [{ name: "lines", kind: "object", type: "DocLine", isList: true, relationFromFields: [] }, { name: "job", kind: "object", type: "Job", relationFromFields: ["jobId"] }] },
  { name: "DocLine", fields: [{ name: "invoice", kind: "object", type: "Invoice", relationFromFields: ["invoiceId"] }] },
  { name: "Job", fields: [] },
  { name: "AppSettings", fields: [] },
]);

test("scope rules: where gets shopId, creates (and nested creates) get shopId, explicit shopId is kept", () => {
  assert.deepEqual(scopeTenantArgs("Job", "findMany", { where: { status: "OPEN" } }, "shopA", MAP), { where: { status: "OPEN", shopId: "shopA" } });
  assert.deepEqual(scopeTenantArgs("Job", "findUnique", { where: { id: "j1" } }, "shopA", MAP), { where: { id: "j1", shopId: "shopA" } });
  assert.deepEqual(scopeTenantArgs("Job", "deleteMany", {}, "shopA", MAP), { where: { shopId: "shopA" } });
  assert.deepEqual(scopeTenantArgs("Job", "count", undefined, "shopA", MAP), { where: { shopId: "shopA" } });
  const created = scopeTenantArgs("Invoice", "create", { data: { number: "1", lines: { create: [{ label: "a" }, { label: "b" }] } } }, "shopA", MAP);
  assert.deepEqual(created.data, { number: "1", shopId: "shopA", lines: { create: [{ label: "a", shopId: "shopA" }, { label: "b", shopId: "shopA" }] } });
  const many = scopeTenantArgs("Invoice", "update", { where: { id: "i" }, data: { lines: { createMany: { data: [{ label: "x" }] } } } }, "shopA", MAP);
  assert.deepEqual(many.data, { lines: { createMany: { data: [{ label: "x", shopId: "shopA" }] } } });
  assert.deepEqual(scopeTenantArgs("Job", "findMany", { where: { shopId: "shopB" } }, "shopA", MAP), { where: { shopId: "shopB" } });
  const up = scopeTenantArgs("Job", "upsert", { where: { id: "j" }, create: { code: "1" }, update: { code: "2" } }, "shopA", MAP);
  assert.deepEqual(up, { where: { id: "j", shopId: "shopA" }, create: { code: "1", shopId: "shopA" }, update: { code: "2" } });
});

test("AppSettings: id 'default' (and no id) means the current shop", () => {
  assert.deepEqual(scopeSettingsArgs("findUnique", { where: { id: "default" } }, "shopA", MAP), { where: { id: "shopA" } });
  assert.deepEqual(scopeSettingsArgs("upsert", { where: { id: "default" }, create: { id: "default", x: 1 }, update: { x: 2 } }, "shopA", MAP), {
    where: { id: "shopA" },
    create: { id: "shopA", x: 1 },
    update: { x: 2 },
  });
  assert.deepEqual(scopeSettingsArgs("findFirst", {}, "shopA", MAP), { where: { id: "shopA" } });
  assert.deepEqual(scopeSettingsArgs("findUnique", { where: { id: "shopB" } }, "shopA", MAP), { where: { id: "shopB" } });
});

test("foreign keys a write sets directly are listed for the cross-shop check", () => {
  assert.deepEqual(foreignKeysIn("Invoice", "create", { data: { jobId: "j9", number: "1" } }, MAP), [{ target: "Job", id: "j9" }]);
  assert.deepEqual(foreignKeysIn("Invoice", "update", { data: { jobId: null } }, MAP), []);
});

/* ---- Real Prisma on a throwaway DB (never the live DB): shop A can't read or write shop B. ---- */
test("two shops on one database: no reads or writes across shops", { timeout: 180_000 }, async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "jc-shops-"));
  const url = `file:${path.join(dir, "shops.db")}`;
  const push = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
  });
  if (push.status !== 0) {
    t.skip(`prisma db push unavailable: ${(push.stderr || push.stdout).slice(0, 200)}`);
    return;
  }
  const before = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  const g = globalThis as unknown as { prismaBase?: unknown };
  const savedBase = g.prismaBase;
  delete g.prismaBase;
  // Fresh module instance bound to the temp DB.
  const { prisma, prismaAllShops } = await import(`./prisma.ts?shops=${Date.now()}`);
  const { runWithShop } = await import("./shop-context");
  try {
    const seed = async (shopId: string, name: string) => {
      await prismaAllShops.appSettings.create({ data: { id: shopId, periodAnchor: new Date(), businessName: name, setupComplete: true } });
      const employee = await prismaAllShops.employee.create({ data: { shopId, firstName: name, lastName: "Crew", jobTitle: "Painter", baselineStartDate: new Date(), depositAccount: "" } });
      const customer = await prismaAllShops.customer.create({ data: { shopId, name: `${name} customer` } });
      const job = await prismaAllShops.job.create({ data: { shopId, code: "J-1", name: `${name} job`, client: customer.name, customerId: customer.id } });
      const invoice = await prismaAllShops.invoice.create({ data: { shopId, number: "INV-1", jobId: job.id, customerId: customer.id, amount: 500, dueDate: new Date() } });
      const photo = await prismaAllShops.jobPhoto.create({ data: { shopId, jobId: job.id, url: `/uploads/jobs/${name}.jpg` } });
      const period = await prismaAllShops.payPeriod.create({
        data: { shopId, employeeId: employee.id, startDate: new Date("2026-09-01"), endDate: new Date("2026-09-14"), frequency: "BIWEEKLY", grossPay: 1000 },
      });
      const account = await prismaAllShops.account.create({ data: { shopId, role: "ADMIN", name: `${name} owner`, pinHash: "a:b" } });
      return { employee, customer, job, invoice, photo, period, account };
    };
    const a = await seed("shopA", "Alpha");
    const b = await seed("shopB", "Bravo");

    await runWithShop("shopA", async () => {
      // Reads: lists, by id, counts, settings.
      assert.deepEqual((await prisma.job.findMany()).map((row: { id: string }) => row.id), [a.job.id]);
      assert.equal(await prisma.job.findUnique({ where: { id: b.job.id } }), null);
      assert.equal(await prisma.customer.findFirst({ where: { name: "Bravo customer" } }), null);
      assert.equal(await prisma.employee.count(), 1);
      assert.equal(await prisma.invoice.count(), 1);
      assert.equal(await prisma.jobPhoto.count(), 1);
      assert.deepEqual((await prisma.payPeriod.findMany()).map((row: { id: string }) => row.id), [a.period.id]);
      assert.equal((await prisma.appSettings.findUnique({ where: { id: "default" } }))?.businessName, "Alpha");
      const withJob = await prisma.invoice.findFirst({ include: { job: true } });
      assert.equal(withJob?.job?.name, "Alpha job");
      // Writes on B's rows by id fail; bulk writes only touch A.
      await assert.rejects(prisma.job.update({ where: { id: b.job.id }, data: { name: "hacked" } }));
      await assert.rejects(prisma.employee.delete({ where: { id: b.employee.id } }));
      assert.equal((await prisma.payPeriod.updateMany({ data: { grossPay: 1 } })).count, 1);
      assert.equal((await prisma.jobPhoto.deleteMany({})).count, 1);
      // Creates land in A; pointing a new row at B's job is refused.
      const created = await prisma.customer.create({ data: { name: "New A customer" } });
      assert.equal(created.shopId, "shopA");
      await assert.rejects(prisma.jobPhoto.create({ data: { jobId: b.job.id, url: "/x.jpg" } }), /Not found in this shop/);
      await assert.rejects(prisma.timeEntry.create({ data: { employeeId: b.employee.id, date: new Date() } }), /Not found in this shop/);
      // Per-shop numbers: A can reuse a code B already has.
      const second = await prisma.job.create({ data: { code: "J-2", name: "Alpha 2", client: "x" } });
      assert.equal(second.shopId, "shopA");
      // Nested creates inherit the shop.
      const inv = await prisma.invoice.create({
        data: { number: "INV-2", jobId: a.job.id, customerId: a.customer.id, amount: 10, dueDate: new Date(), lines: { create: [{ description: "Paint" }] } },
        include: { lines: true },
      });
      assert.equal(inv.lines[0].shopId, "shopA");
    });

    // Shop B is untouched.
    const bJob = await prismaAllShops.job.findUnique({ where: { id: b.job.id } });
    assert.equal(bJob?.name, "Bravo job");
    assert.equal(await prismaAllShops.jobPhoto.count({ where: { shopId: "shopB" } }), 1);
    assert.equal((await prismaAllShops.payPeriod.findUnique({ where: { id: b.period.id } }))?.grossPay, 1000);
    assert.equal(await prismaAllShops.employee.count({ where: { shopId: "shopB" } }), 1);

    // Signed-out entry points find the right shop: public links, Stripe events, cron loops.
    const shopOf = await import("./shop-of");
    await prismaAllShops.invoice.update({ where: { id: b.invoice.id }, data: { publicToken: "pay-link-bravo" } });
    assert.equal(await shopOf.shopOfToken("invoice", "pay-link-bravo"), "shopB");
    assert.equal(await shopOf.shopOfToken("invoice", "no-such-link"), null);
    const seen = await runWithShop("shopA", () =>
      shopOf.inShopOfToken("invoice", "pay-link-bravo", () => prisma.invoice.findUnique({ where: { publicToken: "pay-link-bravo" } }))
    );
    assert.equal((seen as { id?: string } | null)?.id, b.invoice.id, "a Bravo pay link opens Bravo's invoice even on a phone last used for Alpha");
    await prismaAllShops.appSettings.update({ where: { id: "shopB" }, data: { stripeCustomerId: "cus_bravo", connectAccountId: "acct_bravo" } });
    assert.equal(await shopOf.shopOfStripeEvent({ type: "customer.subscription.updated", data: { object: { id: "sub_1", customer: "cus_bravo" } } }), "shopB");
    assert.equal(await shopOf.shopOfStripeEvent({ type: "account.updated", data: { object: { id: "acct_bravo" } } }), "shopB");
    assert.equal(await shopOf.shopOfStripeEvent({ type: "checkout.session.completed", data: { object: { metadata: { shopId: "shopA" } } } }), "shopA");
    assert.equal(await shopOf.shopOfStripeEvent({ type: "checkout.session.completed", data: { object: {} } }, b.invoice.id), "shopB");
    assert.equal(
      await shopOf.shopOfStripeEvent({ type: "customer.subscription.updated", data: { object: { id: "sub_9", customer: "cus_stranger" } } }),
      null,
      "with several shops an event nobody owns is ignored, never guessed"
    );
    const perShop = await shopOf.forEachShop(async () => prisma.job.count());
    const counts = Object.fromEntries(perShop.map((row) => [row.shopId, row.result]));
    assert.equal(counts.shopA, 2);
    assert.equal(counts.shopB, 1);

    const { wipeShop } = await import("./account-delete");
    await runWithShop("shopA", () => wipeShop(prisma, { uploadsRoot: path.join(dir, "uploads") }));
    assert.equal(await prismaAllShops.job.count({ where: { shopId: "shopA" } }), 0);
    assert.equal(await prismaAllShops.appSettings.count({ where: { id: "shopA" } }), 0);
    assert.equal(await prismaAllShops.job.count({ where: { shopId: "shopB" } }), 1);
    assert.equal(await prismaAllShops.account.count({ where: { shopId: "shopB" } }), 1);
    assert.equal((await prismaAllShops.appSettings.findUnique({ where: { id: "shopB" } }))?.businessName, "Bravo");
  } finally {
    await prismaAllShops.$disconnect();
    process.env.DATABASE_URL = before;
    if (savedBase) g.prismaBase = savedBase;
  }
});

test("which shop a signed-out phone signs in to: shop phone (any format) or id, saved choice, the only shop, else ask", async () => {
  const { matchShop, pickShop } = await import("./shop-pick-core");
  const rows = [
    { id: "default", companyPhone: "(501) 555-0142", ownerPhone: "501-555-0142" },
    { id: "s_bravo", companyPhone: "+1 312 555 0100", ownerPhone: "" },
  ];
  assert.equal(matchShop("5015550142", rows), "default");
  assert.equal(matchShop("(312) 555-0100", rows), "s_bravo");
  assert.equal(matchShop("s_bravo", rows), "s_bravo");
  assert.equal(matchShop("555", rows), null, "too short to mean a shop");
  assert.equal(matchShop("2025550199", rows), null);
  assert.equal(matchShop("5550100", [...rows, { id: "s_twin", companyPhone: "(212) 555-0100" }]), null, "two shops match: ask for more");
  assert.deepEqual(pickShop({ typed: "312-555-0100" }, rows), { kind: "shop", shopId: "s_bravo" });
  assert.deepEqual(pickShop({ typed: "999" }, rows), { kind: "unknown" });
  assert.deepEqual(pickShop({ cookie: "s_bravo" }, rows), { kind: "shop", shopId: "s_bravo" });
  assert.deepEqual(pickShop({ cookie: "s_gone" }, rows), { kind: "need" });
  assert.deepEqual(pickShop({}, rows), { kind: "need" });
  assert.deepEqual(pickShop({}, [rows[0]]), { kind: "shop", shopId: "default" }, "one shop: nothing to ask (Top Gun today)");
  assert.deepEqual(pickShop({}, []), { kind: "shop", shopId: "default" });
});

test("production never signs sessions with the key in the source code", async () => {
  const { sessionSecret } = await import("./session");
  const env = process.env as Record<string, string | undefined>;
  const saved = { NODE_ENV: env.NODE_ENV, SESSION_SECRET: env.SESSION_SECRET, CRON_SECRET: env.CRON_SECRET, DATABASE_URL: env.DATABASE_URL };
  try {
    delete env.SESSION_SECRET;
    delete env.CRON_SECRET;
    env.NODE_ENV = "production";
    env.DATABASE_URL = "postgresql://u:secret@db.example/jc";
    assert.notEqual(sessionSecret(), "job-command-local-session-v1");
    env.SESSION_SECRET = "set-by-eric";
    assert.equal(sessionSecret(), "set-by-eric");
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  }
});

test("wiring: public links, webhooks, cron and sign-in run in the right shop", () => {
  for (const page of ["app/e/[token]/page.tsx", "app/p/[token]/page.tsx", "app/j/[token]/page.tsx"]) {
    assert.match(read(page), /return inShopOfToken\("(estimate|invoice|invite)", props\.params\?\.token/, page);
  }
  const actions = read("app/actions.ts");
  for (const name of ["recordEstimateView", "clientApproveEstimate", "clientRequestEstimateChanges", "startInvoiceCardPayment", "completeEmployeeOnboard"]) {
    assert.match(actions, new RegExp(`export async function ${name}\\([^)]*\\)[^{]*\\{\\n[^\\n]*inShopOfToken|export async function ${name}\\([\\s\\S]{0,200}?inShopOfToken`), name);
  }
  assert.match(read("app/api/webhooks/stripe/route.ts"), /shopOfStripeEvent\(event, hit\?\.invoiceId\)/);
  assert.match(read("app/api/webhooks/twilio/route.ts"), /shopOfProviderId\(payload\.sid\)/);
  assert.match(read("app/api/webhooks/resend/route.ts"), /shopOfProviderId\(providerId\)/);
  for (const cron of ["alerts", "estimate-followup", "job-cost"]) assert.match(read(`app/api/cron/${cron}/route.ts`), /forEachShop\(/, cron);
  assert.match(read("app/api/session/route.ts"), /runWithShop\(shopId, \(\) => signInHere/);
  assert.match(read("app/api/session/recover/route.ts"), /runWithShop\(shopId, \(\) => recoverHere/);
  assert.doesNotMatch(read("app/pin-actions.ts"), /shopId: "default"/);
});

test("wiring: prisma is the shop-scoped client; sessions carry the shop", () => {
  const client = read("lib/prisma.ts");
  assert.match(client, /export const prisma = prismaAllShops\.\$extends/);
  assert.match(read("lib/accounts.ts"), /shopId: row\.shopId \|\| "default"/);
  assert.match(read("lib/shop-context.ts"), /if \(session\) return validShopId\(session\.shopId\) \|\| DEFAULT_SHOP/);
});
