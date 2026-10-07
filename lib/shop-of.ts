// Server only. Public links (quote, pay, crew invite), webhooks and cron run signed out, so they find the
// right shop from the thing they point at, then run inside that shop (runWithShop). Multi-shop, go-public B2.
import { prismaAllShops } from "@/lib/prisma";
import { runWithShop } from "@/lib/shop-context";
import { DEFAULT_SHOP } from "@/lib/shop-scope-core";

type Kind = "estimate" | "invoice" | "invite";

export async function shopOfToken(kind: Kind, token: string | null | undefined): Promise<string | null> {
  const t = String(token || "").trim();
  if (!t) return null;
  const select = { shopId: true } as const;
  const row =
    kind === "estimate"
      ? await prismaAllShops.estimate.findUnique({ where: { publicToken: t }, select })
      : kind === "invoice"
        ? await prismaAllShops.invoice.findUnique({ where: { publicToken: t }, select })
        : await prismaAllShops.account.findUnique({ where: { inviteToken: t }, select });
  return row?.shopId || null;
}

/** Run fn inside the shop that owns this public link. Unknown link → the first shop (the lookup then misses
 *  and the page shows its normal "not valid" state). */
export async function inShopOfToken<T>(kind: Kind, token: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  const shop = await shopOfToken(kind, token);
  // Await INSIDE the shop: a Prisma query only runs when awaited, and must run while the shop is pinned.
  return runWithShop(shop || DEFAULT_SHOP, async () => await fn());
}

/** Every shop id that has settings (cron loops). Always includes the first shop. */
export async function allShopIds(): Promise<string[]> {
  const rows = await prismaAllShops.appSettings.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } }).catch(() => []);
  const ids = rows.map((r) => r.id);
  return ids.includes(DEFAULT_SHOP) ? ids : [DEFAULT_SHOP, ...ids];
}

/** Run fn once per shop, in that shop. Errors in one shop don't stop the others. */
export async function forEachShop<T>(fn: (shopId: string) => Promise<T>): Promise<Array<{ shopId: string; result?: T; error?: string }>> {
  const out: Array<{ shopId: string; result?: T; error?: string }> = [];
  for (const shopId of await allShopIds()) {
    try {
      out.push({ shopId, result: await runWithShop(shopId, async () => await fn(shopId)) });
    } catch (e) {
      out.push({ shopId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

type StripeEventLike = { type?: string; data?: { object?: Record<string, unknown> } };

/** Which shop a signed Stripe event belongs to: metadata.shopId (we tag every checkout / Connect account),
 *  else the invoice id, else the shop whose customer / subscription / Connect account it names.
 *  null = no shop matches (when there is more than one shop, the event is ignored rather than guessed). */
export async function shopOfStripeEvent(event: StripeEventLike, invoiceId?: string | null): Promise<string | null> {
  const object = event.data?.object || {};
  const meta = (object.metadata && typeof object.metadata === "object" ? object.metadata : {}) as Record<string, unknown>;
  const tagged = typeof meta.shopId === "string" ? meta.shopId.trim() : "";
  if (tagged && (await prismaAllShops.appSettings.count({ where: { id: tagged } }))) return tagged;
  if (invoiceId) {
    const inv = await prismaAllShops.invoice.findUnique({ where: { id: invoiceId }, select: { shopId: true } });
    if (inv) return inv.shopId;
  }
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const customer = str(object.customer);
  const subscription = str(object.subscription) || (event.type?.startsWith("customer.subscription") ? str(object.id) : "");
  const account = event.type?.startsWith("account.") ? str(object.id) : "";
  const or: Array<Record<string, string>> = [];
  if (customer) or.push({ stripeCustomerId: customer });
  if (subscription) or.push({ stripeSubId: subscription }, { stripeAddonSubId: subscription });
  if (account) or.push({ connectAccountId: account });
  if (or.length) {
    const hit = await prismaAllShops.appSettings.findFirst({ where: { OR: or }, select: { id: true } });
    if (hit) return hit.id;
  }
  const ids = await allShopIds();
  return ids.length === 1 ? ids[0] : null;
}

/** Which shop sent the email/text a delivery receipt (Resend / Twilio) is about. */
export async function shopOfProviderId(providerId: string): Promise<string | null> {
  const id = String(providerId || "").trim();
  if (!id) return null;
  const row = await prismaAllShops.deliveryEvent.findFirst({ where: { providerId: id }, orderBy: { createdAt: "desc" }, select: { shopId: true } });
  return row?.shopId || null;
}
