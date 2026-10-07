"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  openBillingPortal,
  refreshConnectAccount,
  startBillingCheckout,
  startConnectOnboarding,
} from "@/app/actions";
import {
  TRIAL_DAYS,
  annualMonthlyEquivalent,
  annualSavingsDollars,
  formatAnnualPlanPrice,
  formatFlatPlanPrice,
  formatPlanDollars,
  formatPlanForInterval,
  type BillingDTO,
  type BillingInterval,
} from "@/lib/billing";

const NOT_CONNECTED = "Payments aren\u2019t connected yet. Nothing was charged and nothing was turned on.";

function planStatus(billing: BillingDTO) {
  if (billing.status === "trial" && billing.trialDaysLeft > 0) {
    return billing.cardLast4
      ? `Trial · card on file · ${billing.trialDaysLeft} day${billing.trialDaysLeft === 1 ? "" : "s"} left`
      : `Free trial · ${billing.trialDaysLeft} day${billing.trialDaysLeft === 1 ? "" : "s"} left`;
  }
  if (billing.status === "active") return "Active · renews automatically until you cancel";
  if (billing.status === "past_due") return "Past due · update the card";
  if (billing.status === "expired") return "Trial ended · subscribe to keep sending";
  if (billing.status === "canceled") return "Canceled";
  return "Not started";
}

function endLabel(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function BillingDesk({ billing }: { billing: BillingDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [planInterval, setPlanInterval] = useState<BillingInterval>("month");
  const annualPrice = billing.basePriceAnnual;
  const chosenPrice = formatPlanForInterval(planInterval, billing.basePrice, annualPrice);
  const yearlySave = formatPlanDollars(annualSavingsDollars(billing.basePrice, annualPrice));
  const yearlyPerMonth = formatPlanDollars(annualMonthlyEquivalent(annualPrice));
  const trialPct = Math.max(0, Math.min(100, Math.round((billing.trialDaysLeft / TRIAL_DAYS) * 100)));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingFlag = params.get("billing");
    const connectFlag = params.get("connect");
    if (billingFlag === "success") toast.success("Subscription is on file.");
    if (billingFlag === "cancel") toast.error("Checkout was closed. Nothing charged.");
    if (billingFlag === "verify") {
      toast.message("Stripe has not confirmed the trial yet. Add a card here so sending stays unlocked after 14 days.");
    }
    if (connectFlag === "return" || connectFlag === "refresh") {
      startTransition(async () => {
        await refreshConnectAccount();
        router.refresh();
        toast.success("Bank link updated.");
      });
    }
  }, [router]);

  function go(kind: "base" | "addon") {
    startTransition(async () => {
      try {
        const next = await startBillingCheckout(kind, kind === "base" ? planInterval : undefined);
        // Go-public B4: honest when Stripe isn't connected (never a fake subscribed / add-on-on toast).
        if (next && "notConnected" in next && next.notConnected) {
          toast.message(NOT_CONNECTED);
          return;
        }
        if (!next?.url) throw new Error("Could not open checkout.");
        if (next.url.startsWith("/") || next.url.includes("tab=company")) {
          router.refresh();
          return;
        }
        window.location.href = next.url;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not open checkout.");
      }
    });
  }

  function portal() {
    startTransition(async () => {
      try {
        const next = await openBillingPortal();
        if (next && "notConnected" in next && next.notConnected) {
          toast.message(NOT_CONNECTED);
          return;
        }
        if (!next?.url) throw new Error("Could not open card settings.");
        if (next.url.includes("tab=company")) {
          router.refresh();
          return;
        }
        window.location.href = next.url;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not open card settings.");
      }
    });
  }

  function bank() {
    startTransition(async () => {
      try {
        const next = await startConnectOnboarding();
        if (next && "notConnected" in next && next.notConnected) {
          toast.message(NOT_CONNECTED);
          return;
        }
        if (!next?.url) throw new Error("Could not start bank linking.");
        if (next.url.includes("tab=company")) {
          router.refresh();
          return;
        }
        window.location.href = next.url;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not start bank linking.");
      }
    });
  }

  return (
    <div className="company-block billing-desk" data-billing-desk="1">
      <p className="card-label">Billing</p>
      {billing.mockMode ? (
        <div className="setup-preview" data-billing-not-connected="1" style={{ border: "2px solid #f97316", background: "#3b1405", color: "#fff7ed" }}>
          <b style={{ fontSize: 18, color: "#ffffff" }}>Payments aren&rsquo;t connected yet</b>
          <span style={{ fontSize: 16, color: "#fff7ed" }}>
            Subscribe, AI answering, card on file and bank link stay off until Stripe is connected. Nothing is charged.
          </span>
        </div>
      ) : null}
      <div className="setup-preview">
        <b data-flat-plan="1">
          jobcommand.app · {formatFlatPlanPrice(billing.basePrice)} or {formatAnnualPlanPrice(annualPrice)} flat-rate
        </b>
        <span>{planStatus(billing)}</span>
        {billing.status === "trial" && billing.trialDaysLeft > 0 ? (
          <>
            <div className="trial-meter" aria-hidden="true">
              <i style={{ width: `${trialPct}%` }} />
            </div>
            <small>
              Ends {endLabel(billing.trialEndsAt)}. Then {chosenPrice} if you subscribe. Crew clocks still work after that; sending
              quotes and invoices needs a card.
            </small>
          </>
        ) : null}
        {billing.trialExpired && !billing.baseUnlocked ? (
          <small>Crew phones still clock in. Office cannot send estimates or invoices until you subscribe.</small>
        ) : null}
      </div>

      {billing.status !== "active" ? (
        <div role="radiogroup" aria-label="Billing period" data-plan-interval={planInterval} className="plan-boxes">
          {(["month", "year"] as const).map((option) => {
            const on = planInterval === option;
            const yearly = option === "year";
            // Big plan boxes (Eric, 2026-10-02): large price number, more padding, room for the details.
            const big = yearly ? formatPlanDollars(annualPrice) : formatPlanDollars(billing.basePrice);
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={on}
                className={`ghost-action plan-box${on ? " on" : ""}`}
                data-plan-option={option}
                disabled={pending}
                onClick={() => setPlanInterval(option)}
              >
                <span className="plan-box-num" aria-hidden="true">
                  {big}
                  <small>{yearly ? "/yr" : "/mo"}</small>
                </span>
                <span className="plan-box-info">
                  <b>
                    {on ? "✓ " : ""}
                    {yearly ? "Yearly" : "Monthly"}
                  </b>
                  <span>{yearly ? `Save ${yearlySave} a year` : "Billed every month"}</span>
                  <span>{yearly ? `${yearlyPerMonth}/mo, billed once a year` : "Cancel anytime"}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {billing.status !== "active" ? (
        <button type="button" className="ghost-action slim" disabled={pending} onClick={() => go("base")}>
          {billing.status === "trial" && billing.cardLast4
            ? `Keep jobcommand.app after trial · ${chosenPrice}`
            : billing.status === "trial"
              ? `Subscribe · ${chosenPrice}`
              : `Subscribe to jobcommand.app · ${chosenPrice}`}
        </button>
      ) : null}

      <div className={`setup-preview${billing.canUseAnswering ? "" : " locked-addon"}`}>
        <b>AI answering service · +${billing.addonPrice}/mo</b>
        {billing.canUseAnswering ? (
          <span>Active. Set up the phone line under AI answering setup.</span>
        ) : (
          <span>Locked until purchased. The base trial does not include answering.</span>
        )}
      </div>
      {billing.canUseAnswering ? null : (
        <button type="button" className="ghost-action slim" disabled={pending} onClick={() => go("addon")}>
          Add answering line · ${billing.addonPrice}/mo
        </button>
      )}

      <div className="setup-preview">
        <b>Card on file</b>
        <span>
          {billing.cardLast4
            ? `${billing.cardBrand || "Card"} •••• ${billing.cardLast4}`
            : "No card yet"}
        </span>
      </div>
      <button type="button" className="ghost-action slim" disabled={pending} onClick={() => void portal()}>
        {billing.cardLast4 ? "Update card" : "Add a card"}
      </button>

      <div className="setup-preview">
        <b>Bank for client invoices</b>
        <span>
          {billing.connectStatus === "complete"
            ? `Linked •••• ${billing.connectBankLast4 || "****"}. Client pays you; jobcommand.app keeps 1%.`
            : billing.connectStatus === "pending"
              ? "Stripe Connect started — finish linking the bank."
              : "Link a bank so invoice card payments land in your account. jobcommand.app skims 1%."}
        </span>
      </div>
      <button type="button" className="ghost-action slim" disabled={pending} onClick={() => void bank()}>
        {billing.connectStatus === "complete" ? "Update bank account" : "Link bank account"}
      </button>

    </div>
  );
}
