"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startInvoiceCardPayment } from "@/app/actions";
import { telHref, type ClientPayView } from "@/lib/client-pay";
import s from "@/app/p/[token]/pay.module.css";

/**
 * The client's pay block. It never marks anything paid: "Pay by card" only opens
 * a real Stripe Checkout, and only when the shop's card payments are set up.
 */
export function PayClient({
  token,
  view,
  total,
  shopName,
  phone,
  email,
  paidOn,
}: {
  token: string;
  view: ClientPayView;
  total: string;
  shopName: string;
  phone: string;
  email: string;
  paidOn: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [blocked, setBlocked] = useState("");
  const tel = telHref(phone);

  const contact =
    tel || email ? (
      <div className={s.contactRow}>
        {tel ? (
          <a className={s.contactButton} href={tel}>
            Call {phone}
          </a>
        ) : null}
        {email ? (
          <a className={s.contactButton} href={`mailto:${email}`} aria-label={`Email ${shopName} at ${email}`}>
            Send an email
          </a>
        ) : null}
      </div>
    ) : null;

  if (view === "paid") {
    return (
      <section className={s.paid} data-pay-state="paid">
        <h2>Paid ✓</h2>
        <p>{paidOn ? `Payment received ${paidOn}. Thank you.` : "Payment received. Thank you."}</p>
      </section>
    );
  }

  if (view === "processing") {
    return (
      <section className={s.processing} data-pay-state="processing">
        <h2>Thanks — your payment is processing</h2>
        <p>This page will show Paid as soon as your card payment clears. You don’t need to pay again.</p>
        <button type="button" className={s.secondary} onClick={() => router.refresh()}>
          Check again
        </button>
      </section>
    );
  }

  if (view === "not-set-up" || blocked) {
    return (
      <section className={s.notice} data-pay-state="not-set-up" role="status">
        <h2>Card payments are not set up yet</h2>
        <p>
          {blocked && blocked !== "not-set-up"
            ? blocked
            : `Please contact ${shopName} to pay this invoice (${total}).`}
        </p>
        {contact}
      </section>
    );
  }

  return (
    <section className={s.contactRow} data-pay-state="card">
      <button
        type="button"
        className={s.payButton}
        aria-busy={pending}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startInvoiceCardPayment({ token }).catch(() => null);
            if (result?.ok) {
              window.location.assign(result.url);
              return;
            }
            if (result?.reason === "paid") {
              router.refresh();
              return;
            }
            setBlocked(result?.message || "not-set-up");
          })
        }
      >
        {pending ? "Opening secure card page…" : `Pay ${total} by card`}
      </button>
      {contact}
    </section>
  );
}
