import "server-only";

/**
 * On-demand Stripe re-check (free-forever fix). The local row only trusts Stripe for "active":
 * if a webhook is missed, ensureBilling asks Stripe directly, at most every 6 hours (every
 * 15 minutes around the trial end, when the status is most likely to flip).
 */
import { billingSyncDue, billingSyncPatch, type SyncRow } from "@/lib/billing-sync-rules";
import { retrieveSubscription } from "@/lib/billing-stripe";
import { stripeConfigured } from "@/lib/stripe-rest";

export async function syncBillingFromStripe(row: SyncRow, now = new Date()) {
  if (!billingSyncDue(row, now, stripeConfigured())) return null;
  try {
    const live = await retrieveSubscription(row.stripeSubId);
    return billingSyncPatch(row, live, now);
  } catch {
    // Stripe down: don't hammer it; the webhook or the next window will catch up.
    return { billingCheckedAt: now };
  }
}
