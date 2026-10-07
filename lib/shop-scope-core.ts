// Multi-shop (go-public B2). Pure: rewrites Prisma query args so every read/write stays inside ONE shop.
// Used by the Prisma client extension in lib/prisma.ts; tests drive it directly.
//  - Tenant tables carry shopId (default "default" = Top Gun, the first shop). Reads/updates/deletes get
//    `shopId` added to `where`; creates get it in `data`, including nested creates (from Prisma's DMMF).
//  - AppSettings is the shop row itself (id = shopId): the app's many `where: { id: "default" }` calls are
//    pointed at the current shop.
//  - An explicit `shopId` in a where/data is kept (deliberate cross-shop code: answering webhooks, cron loops).

export const DEFAULT_SHOP = "default";
export const SHOP_COOKIE = "jc_shop";

export const TENANT_MODELS = new Set([
  "Employee", "Boss", "Customer", "Invoice", "Estimate", "DeliveryEvent", "DocLine", "Job", "JobPhoto", "Receipt",
  "ServiceCode", "TimeEntry", "PayPeriod", "PayAdjustment", "JobCost", "PriceMemory", "AuditLog", "Alert", "Account",
  "CrewPing", "PushDevice", "AnsweringSettings", "CallCard", "AnsweringUsage", "AnsweringSlotLock", "PinReset",
]);

export function validShopId(value: unknown) {
  const id = String(value ?? "");
  return /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : "";
}

type Field = { name: string; kind: string; type: string; isList?: boolean; relationFromFields?: readonly string[] };
export type ModelMap = Record<string, { relations: Record<string, string>; fks: Array<{ field: string; target: string }> }>;

export function buildModelMap(models: ReadonlyArray<{ name: string; fields: ReadonlyArray<Field> }>): ModelMap {
  const map: ModelMap = {};
  for (const model of models) {
    const relations: Record<string, string> = {};
    const fks: Array<{ field: string; target: string }> = [];
    for (const field of model.fields) {
      if (field.kind !== "object") continue;
      relations[field.name] = field.type;
      for (const fk of field.relationFromFields || []) fks.push({ field: fk, target: field.type });
    }
    map[model.name] = { relations, fks };
  }
  return map;
}

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
const each = (value: unknown, fn: (row: Obj) => Obj) => (Array.isArray(value) ? value.map((row) => (isObj(row) ? fn(row) : row)) : isObj(value) ? fn(value) : value);

function withWhere(where: unknown, shopId: string): Obj {
  const base = isObj(where) ? where : {};
  return base.shopId === undefined ? { ...base, shopId } : base;
}

/** data for a new row of `model` (+ nested writes). */
export function scopeCreateData(model: string, data: unknown, shopId: string, map: ModelMap): unknown {
  return each(data, (row) => {
    const out: Obj = { ...row };
    if (TENANT_MODELS.has(model) && out.shopId === undefined) out.shopId = shopId;
    return scopeNested(model, out, shopId, map);
  });
}

/** data for an update of `model`: only nested creates need the shop. */
export function scopeUpdateData(model: string, data: unknown, shopId: string, map: ModelMap): unknown {
  return each(data, (row) => scopeNested(model, { ...row }, shopId, map));
}

function scopeNested(model: string, row: Obj, shopId: string, map: ModelMap): Obj {
  const relations = map[model]?.relations || {};
  for (const [field, target] of Object.entries(relations)) {
    const ops = row[field];
    if (!isObj(ops)) continue;
    const next: Obj = { ...ops };
    if (next.create !== undefined) next.create = scopeCreateData(target, next.create, shopId, map);
    if (isObj(next.createMany)) next.createMany = { ...next.createMany, data: scopeCreateData(target, next.createMany.data, shopId, map) };
    if (next.connectOrCreate !== undefined)
      next.connectOrCreate = each(next.connectOrCreate, (item) => ({ ...item, create: scopeCreateData(target, item.create, shopId, map) }));
    if (next.upsert !== undefined)
      next.upsert = each(next.upsert, (item) => ({
        ...item,
        create: scopeCreateData(target, item.create, shopId, map),
        update: scopeUpdateData(target, item.update, shopId, map),
      }));
    if (next.update !== undefined)
      next.update = each(next.update, (item) => ("data" in item ? { ...item, data: scopeUpdateData(target, item.data, shopId, map) } : (scopeUpdateData(target, item, shopId, map) as Obj)));
    row[field] = next;
  }
  return row;
}

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
  "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany", "upsert",
]);

/** Rewrite one top-level query on a tenant model. */
export function scopeTenantArgs(model: string, operation: string, args: unknown, shopId: string, map: ModelMap): Obj {
  const out: Obj = isObj(args) ? { ...args } : {};
  if (WHERE_OPS.has(operation)) out.where = withWhere(out.where, shopId);
  if (operation === "create") out.data = scopeCreateData(model, out.data, shopId, map);
  if (operation === "createMany" || operation === "createManyAndReturn") out.data = scopeCreateData(model, out.data, shopId, map);
  if (operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") out.data = scopeUpdateData(model, out.data, shopId, map);
  if (operation === "upsert") {
    out.create = scopeCreateData(model, out.create, shopId, map);
    out.update = scopeUpdateData(model, out.update, shopId, map);
  }
  return out;
}

/** AppSettings is the shop row: `id: "default"` (and no id) means "this shop". */
export function scopeSettingsArgs(operation: string, args: unknown, shopId: string, map: ModelMap): Obj {
  const out: Obj = isObj(args) ? { ...args } : {};
  const point = (where: unknown): Obj => {
    const base = isObj(where) ? { ...where } : {};
    if (base.id === undefined || base.id === DEFAULT_SHOP) base.id = shopId;
    return base;
  };
  const pointData = (data: unknown) =>
    each(data, (row) => {
      const next: Obj = { ...row };
      if (next.id === undefined || next.id === DEFAULT_SHOP) next.id = shopId;
      return scopeNested("AppSettings", next, shopId, map);
    });
  if (WHERE_OPS.has(operation)) out.where = point(out.where);
  if (operation === "create" || operation === "createMany") out.data = pointData(out.data);
  if (operation === "upsert") out.create = pointData(out.create);
  return out;
}

/** Foreign keys a write sets directly (e.g. jobId) that point at tenant rows: must be in the same shop. */
export function foreignKeysIn(model: string, operation: string, args: unknown, map: ModelMap): Array<{ target: string; id: string }> {
  if (!isObj(args)) return [];
  const rows: unknown[] = [];
  if (operation === "create" || operation === "update" || operation === "updateMany") rows.push(args.data);
  if (operation === "createMany" || operation === "createManyAndReturn") rows.push(...(Array.isArray(args.data) ? args.data : [args.data]));
  if (operation === "upsert") rows.push(args.create, args.update);
  const seen = new Set<string>();
  const out: Array<{ target: string; id: string }> = [];
  for (const row of rows) {
    if (!isObj(row)) continue;
    for (const { field, target } of map[model]?.fks || []) {
      const value = row[field];
      if (typeof value !== "string" || !value || !TENANT_MODELS.has(target)) continue;
      const key = `${target}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ target, id: value });
    }
  }
  return out;
}
