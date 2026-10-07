/** Pure rules for the on-demand Stripe re-check (lib/billing-sync.ts). */
import { mapBaseSubscriptionStatus, type BillingRow } from "@/lib/billing";

const SLOW_MS = 6 * 60 * 60 * 1000;
const FAST_MS = 15 * 60 * 1000;

export type SyncRow = BillingRow & { billingCheckedAt?: Date | string | null };

/** Pure: should we ask Stripe now? */
export function billingSyncDue(row: SyncRow, now: Date, stripeOn: boolean) {
  if (!stripeOn) return false;
  if (!row.stripeSubId || !row.stripeSubId.startsWith("sub_")) return false;
  const last = row.billingCheckedAt ? new Date(row.billingCheckedAt).getTime() : 0;
  const end = row.trialEndsAt ? new Date(row.trialEndsAt).getTime() : 0;
  const nearEnd = end && Math.abs(end - now.getTime()) < 2 * 24 * 60 * 60 * 1000;
  return now.getTime() - last >= (nearEnd ? FAST_MS : SLOW_MS);
}

/** Pure: the patch for a live subscription (ignores a sub that belongs to another customer). */
export function billingSyncPatch(row: SyncRow, live: { status: string; customer: string } | null, now: Date) {
  const patch: Record<string, unknown> = { billingCheckedAt: now };
  if (!live || !live.status) return patch;
  if (live.customer && row.stripeCustomerId && live.customer !== row.stripeCustomerId) return patch;
  const status = mapBaseSubscriptionStatus(live.status);
  if (status !== row.billingStatus) patch.billingStatus = status;
  return patch;
}


/** customer.subscription.* for a different Stripe customer than this shop's: ignore it. */
export function subscriptionEventForOtherCustomer(type: string, object: Record<string, unknown>, rowCustomer: string) {
  if (!type.startsWith("customer.subscription")) return false;
  const eventCustomer = typeof object.customer === "string" ? object.customer : "";
  return Boolean(eventCustomer && rowCustomer && eventCustomer !== rowCustomer);
}
