"use client";

/**
 * "Your free trial ends Sun, Nov 1 · Then it's $199/mo until you cancel." Owner only, last 3 days of
 * the trial. Same words as the reminder email; its link (?billing=cancel-trial) opens the one-tap
 * cancel here even outside the 3 days.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelTrial } from "@/app/billing-trial-actions";
import type { BillingDTO } from "@/lib/billing";
import { trialEndingNotice } from "@/lib/trial-reminder";
import t from "@/components/command/trial-ending.module.css";

export function TrialEndingBanner({ billing }: { billing?: BillingDTO | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const notice = billing ? trialEndingNotice(billing) : null;

  useEffect(() => {
    const today = new Date().toDateString();
    try {
      setHidden(window.localStorage.getItem("jc-trial-banner-hide") === today);
    } catch {
      setHidden(false);
    }
    if (new URLSearchParams(window.location.search).get("billing") === "cancel-trial" && billing?.status === "trial") {
      setHidden(false);
      setConfirm(true);
    }
  }, [billing?.status]);

  if (done) {
    return (
      <div className={t.box} role="status" data-trial-canceled="1">
        <b className={t.title}>{done}</b>
      </div>
    );
  }
  if (!billing || billing.status !== "trial" || (!notice && !confirm) || (hidden && !confirm)) return null;

  function cancelNow() {
    setError("");
    startTransition(async () => {
      const result = await cancelTrial().catch(() => ({ ok: false as const, error: "Couldn’t cancel. Try again." }));
      if (!result.ok) return setError(result.error);
      setDone("Trial canceled. You won’t be charged.");
      toast.success("Trial canceled. You won’t be charged.");
      router.refresh();
    });
  }

  return (
    <div className={t.box} role="status" data-trial-ending="1">
      {confirm ? (
        <>
          <b className={t.title}>Cancel your free trial?</b>
          <span className={t.line}>
            You won’t be charged. Sending estimates and invoices locks today; crew clock-in keeps working.
          </span>
        </>
      ) : (
        <>
          <b className={t.title}>{notice?.title}</b>
          <span className={t.line}>{notice?.line}</span>
        </>
      )}
      {error ? <span className={t.error}>{error}</span> : null}
      <div className={t.row}>
        {confirm ? (
          <>
            <button type="button" className={`${t.btn} ${t.primary}`} disabled={pending} onClick={cancelNow} data-cancel-trial="1">
              {pending ? "Canceling…" : "Cancel trial — no charge"}
            </button>
            <button type="button" className={t.btn} onClick={() => setConfirm(false)}>
              Keep my trial
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${t.btn} ${t.primary}`}
              onClick={() => {
                try {
                  window.localStorage.setItem("jc-trial-banner-hide", new Date().toDateString());
                } catch {
                  /* private mode: hides for this visit */
                }
                setHidden(true);
              }}
            >
              Keep it
            </button>
            <button type="button" className={t.btn} onClick={() => setConfirm(true)}>
              Cancel — no charge
            </button>
          </>
        )}
      </div>
    </div>
  );
}
