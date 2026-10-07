import { Prisma, PrismaClient } from "@prisma/client";
import { buildModelMap, foreignKeysIn, scopeSettingsArgs, scopeTenantArgs, TENANT_MODELS } from "@/lib/shop-scope-core";
import { currentShopId } from "@/lib/shop-context";
import { copyFileSync, existsSync } from "fs";
import { isAbsolute, join } from "path";

function resolveDatabaseUrl() {
  const raw = process.env.DATABASE_URL || "file:./prisma/dev.db";
  if (!raw.startsWith("file:")) return raw;
  if (process.env.VERCEL !== "1") return raw;
  const src = raw.replace(/^file:/, "");
  const abs = isAbsolute(src) ? src : join(process.cwd(), src);
  const dest = "/tmp/job-command.db";
  try {
    if (existsSync(abs) && !existsSync(dest)) copyFileSync(abs, dest);
  } catch {
    /* keep going; Prisma will surface a real connection error */
  }
  return existsSync(dest) ? `file:${dest}` : raw;
}

process.env.DATABASE_URL = resolveDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

/** Unscoped client: ONLY for code that must look across shops (finding which shop a public link, webhook or
 *  sign-in belongs to, cron loops, tests). Everything else uses `prisma`, which is locked to one shop. */
export const prismaAllShops =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBase = prismaAllShops;
}

const MODELS = buildModelMap(Prisma.dmmf.datamodel.models as never);
const delegate = (model: string) => (prismaAllShops as unknown as Record<string, { count: (args: unknown) => Promise<number> }>)[model.charAt(0).toLowerCase() + model.slice(1)];

/**
 * Multi-shop (go-public B2): every query on a shop's tables is limited to the current shop (lib/shop-context),
 * and a write can't point a foreign key (jobId, employeeId…) at another shop's row.
 */
export const prisma = prismaAllShops.$extends({
  name: "shop-scope",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (model === "AppSettings") return query(scopeSettingsArgs(operation, args, await currentShopId(), MODELS) as never);
        if (!TENANT_MODELS.has(model)) return query(args);
        const shopId = await currentShopId();
        const scoped = scopeTenantArgs(model, operation, args, shopId, MODELS);
        for (const ref of foreignKeysIn(model, operation, scoped, MODELS)) {
          // Blocks only rows that exist in ANOTHER shop (a row made earlier in the same transaction is invisible here).
          const elsewhere = await delegate(ref.target).count({ where: { id: ref.id, NOT: { shopId } } });
          if (elsewhere) throw new Error(`Not found in this shop: ${ref.target}`);
        }
        return query(scoped as never);
      },
    },
  },
});
