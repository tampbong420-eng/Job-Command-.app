"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { completeEmployeeOnboard } from "@/app/actions";
import {
  FILING_STATUSES,
  FILING_STATUS_LABEL,
  PAY_METHOD_LABEL,
  type FilingStatus,
  type PayMethod,
} from "@/lib/employee-onboard";
import { shopBrand } from "@/lib/shop-brand";

export function EmployeeOnboard({
  token,
  firstName,
  shop,
}: {
  token?: string | null;
  firstName: string;
  shop?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod | "">("");
  const [filingStatus, setFilingStatus] = useState<FilingStatus | "">("");
  const [allowances, setAllowances] = useState("0");
  const shopName = shopBrand({ businessName: shop }).name;
  const who = firstName.trim() || "there";

  function submit() {
    if (pending) return;
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (pin !== pinAgain) {
      toast.error("The two PINs do not match.");
      return;
    }
    startTransition(async () => {
      try {
        await completeEmployeeOnboard({
          token: token || "",
          username,
          password,
          payMethod,
          filingStatus,
          allowances: Number(allowances || 0),
          pin,
        });
        toast.success("Account saved. Payroll has your withholdings.");
        router.replace("/?tab=crew");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save your account.");
      }
    });
  }

  return (
    <section className="access-gate employee-onboard" data-employee-onboard="1">
      <p className="card-label">First-time setup</p>
      <h1>Hi {who}</h1>
      <p>
        Create your login for {shopName}, pick how you get paid, and fill the W-2 withholdings payroll
        needs.
      </p>

      <label className="settings-field">
        Username
        <input
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label className="settings-field">
        Password
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="settings-field">
        Confirm password
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </label>

      <label className="settings-field">
        Pick your PIN (4 to 6 numbers)
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          data-onboard-pin="1"
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </label>
      <label className="settings-field">
        Type the PIN again
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pinAgain}
          onChange={(event) => setPinAgain(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </label>
      <p className="command-empty">You type this PIN to open the app on your phone. Not 0000 or 1234, and not the end of your phone number.</p>

      <p className="card-label">Payment preference</p>
      <div className="choice-stack">
        {(["W2", "CASH"] as const).map((method) => (
          <button
            key={method}
            type="button"
            className={payMethod === method ? "on" : ""}
            onClick={() => setPayMethod(method)}
          >
            {PAY_METHOD_LABEL[method]}
          </button>
        ))}
      </div>

      <p className="card-label">Tax withholdings</p>
      <label className="settings-field">
        Filing status
        <select
          value={filingStatus}
          onChange={(event) => setFilingStatus(event.target.value as FilingStatus)}
        >
          <option value="">Select status</option>
          {FILING_STATUSES.map((status) => (
            <option key={status} value={status}>
              {FILING_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-field">
        Exemptions / allowances
        <input
          inputMode="numeric"
          value={allowances}
          onChange={(event) => setAllowances(event.target.value.replace(/[^\d]/g, "").slice(0, 2))}
        />
      </label>

      <div className="setup-preview">
        <b>Goes to payroll</b>
        <span>
          {payMethod === "CASH"
            ? "Cash / alternative — no federal or state withhold. Still stored for year-end."
            : filingStatus === "EXEMPT"
              ? "Exempt — payroll withholds $0."
              : "W-2 withhold percents update from filing status and exemptions as soon as you save."}
        </span>
      </div>

      <button type="button" className="ghost-action" disabled={pending} onClick={submit}>
        {pending ? "Saving…" : "Save account"}
      </button>
    </section>
  );
}
