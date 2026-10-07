"use client";

import { DEPOSIT_CHOICES, depositIsChosen, payPrefsSummary, type PayPrefs } from "@/lib/pay-prefs";

const METHODS = [
  { key: "acceptCard" as const, label: "Credit / debit cards" },
  { key: "acceptAch" as const, label: "ACH bank transfer" },
  { key: "acceptCash" as const, label: "Cash / check tracking" },
];

export function PaymentPrefsForm({
  value,
  onChange,
}: {
  value: PayPrefs;
  onChange: (next: PayPrefs) => void;
}) {
  function toggle<K extends "acceptCard" | "acceptAch" | "acceptCash">(key: K) {
    onChange({ ...value, [key]: !value[key] });
  }

  return (
    <div className="pay-prefs" data-pay-prefs="1">
      <p className="card-label">Customer payments</p>
      <div className="choice-stack" data-pay-method-picker="1" role="group" aria-label="Customer payments">
        {METHODS.map((item) => {
          const selected = Boolean(value[item.key]);
          return (
            <button
              key={item.key}
              type="button"
              role="checkbox"
              className={selected ? "on" : ""}
              aria-checked={selected}
              aria-pressed={selected}
              aria-label={item.label}
              onClick={() => toggle(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p className="card-label">Deposit before work</p>
      <div className="choice-row" data-deposit-picker="1" role="radiogroup" aria-label="Deposit before work">
        {DEPOSIT_CHOICES.map((pct) => {
          const selected = depositIsChosen(value.depositPercent) && value.depositPercent === pct;
          const label = pct === 0 ? "None" : `${pct}%`;
          return (
            <button
              key={pct}
              type="button"
              role="radio"
              className={selected ? "on" : ""}
              aria-checked={selected}
              aria-pressed={selected}
              aria-label={label}
              onClick={() => onChange({ ...value, depositPercent: pct })}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="setup-preview">
        <b>Ready for Invoice Paid</b>
        <span>{payPrefsSummary(value)}</span>
        <small>Link the Stripe card reader and bank on Company after you start. This sets what invoices offer.</small>
      </div>
    </div>
  );
}
