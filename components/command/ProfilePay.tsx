"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  payCurrentPeriod,
  saveEmployeeDeposit,
  setPeriodApproval,
  updateEmploymentRecord,
  updatePayConfig,
  updateStartDate,
} from "@/app/actions";
import { formatDay, formatRange, periodNickname, todayString } from "@/lib/dates";
import { EMPLOYMENT_STATUSES, parseEmploymentStatus } from "@/lib/employment";
import { computePay, periodForCrew } from "@/lib/payroll";
import { hours, money } from "@/lib/format";
import { isMockSeedId } from "@/lib/initial-data";
import type { EmployeeDTO, PayFrequency, PayType, PayrollSettingsDTO } from "@/lib/types";
import s from "./ProfileRecords.module.css";

const FREQUENCY_LABEL: Record<PayFrequency, string> = {
  WEEKLY: "Every week",
  BIWEEKLY: "Every 2 weeks",
  ROLLING_3_WEEK: "Every 3 weeks",
};

/**
 * Everything about one person's pay, on their Roster profile (boss/office only — never mounted on crew
 * phones, and crew payloads are stripped in lib/queries.ts fieldEmployeeDTO). Replaced the old Roster › Pay
 * folder (PaymentLedger) on 2026-10-02 (Eric).
 */
export function ProfilePay({
  employee,
  settings,
  actor,
  now,
  periodOffset,
  onPeriodOffset,
  onChangePeriod,
}: {
  employee: EmployeeDTO;
  settings: PayrollSettingsDTO;
  actor: string;
  now: Date;
  periodOffset: number;
  onPeriodOffset: (offset: number) => void;
  onChangePeriod: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const mock = isMockSeedId(employee.id);
  const current = periodForCrew(settings, employee, now, periodOffset);
  const liveCurrent = useMemo(() => {
    const days = employee.timeEntries.filter((entry) => entry.date >= current.start && entry.date <= current.end);
    return computePay({
      payType: employee.payType,
      hourlyRate: employee.hourlyRate,
      salaryAnnual: employee.salaryAnnual,
      frequency: employee.payFrequency,
      federalWithholdPct: employee.federalWithholdPct,
      stateWithholdPct: employee.stateWithholdPct,
      baselineStartDate: settings.setupComplete ? settings.periodAnchor : employee.baselineStartDate,
      periodStart: current.start,
      periodEnd: current.end,
      days,
      adjustments: [],
      now,
    });
  }, [employee, settings, current.start, current.end, now]);

  const storedCurrent = employee.payPeriods.find(
    (period) => period.startDate === current.start && period.endDate === current.end
  );
  const paid = storedCurrent?.status === "PAID" || storedCurrent?.status === "APPROVED";
  const history = employee.payPeriods
    .filter((period) => !(period.startDate === current.start && period.endDate === current.end))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const frequency: PayFrequency = settings.setupComplete ? settings.payFrequency : employee.payFrequency;
  const nickname = periodNickname(frequency, periodOffset);
  const canPay = current.start <= todayString(now);
  const status = parseEmploymentStatus(employee.employmentStatus);
  const salary = employee.payType === "SALARY";

  function run(work: () => Promise<unknown>, done = "Saved.") {
    if (mock) {
      toast.error("Sample person. Add a real person to save.");
      return;
    }
    startTransition(async () => {
      try {
        await work();
        toast.success(done);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save.");
      }
    });
  }

  function savePay(next: { payType?: PayType; hourlyRate?: number; salaryAnnual?: number }) {
    run(() =>
      updatePayConfig({
        employeeId: employee.id,
        actor,
        payType: next.payType ?? employee.payType,
        hourlyRate: next.hourlyRate ?? employee.hourlyRate,
        salaryAnnual: next.salaryAnnual ?? employee.salaryAnnual,
        baselineStartDate: employee.baselineStartDate,
        payFrequency: employee.payFrequency,
        federalWithholdPct: employee.federalWithholdPct,
        stateWithholdPct: employee.stateWithholdPct,
      })
    );
  }

  return (
    <div className={s.wrap} data-profile-pay="1">
      {/* 1. Pay */}
      <section className={s.section} aria-labelledby={`${employee.id}-pay-h`}>
        <h2 className={s.head} id={`${employee.id}-pay-h`}>
          Pay
        </h2>
        <div className={s.pair} role="group" aria-label="Pay type">
          {(["HOURLY", "SALARY"] as const).map((type) => (
            <button
              key={type}
              type="button"
              className={s.toggle}
              aria-pressed={employee.payType === type}
              disabled={pending || paid}
              onClick={() => {
                if (employee.payType !== type) savePay({ payType: type });
              }}
            >
              {type === "HOURLY" ? "Hourly" : "Salary"}
            </button>
          ))}
        </div>
        <label className={s.field}>
          {salary ? "Salary ($ per year)" : "Pay rate ($ per hour)"}
          <input
            key={`${employee.id}-${employee.payType}-${salary ? employee.salaryAnnual : employee.hourlyRate}`}
            type="number"
            inputMode="decimal"
            step={salary ? "1" : "0.01"}
            min="0"
            data-pay-rate="1"
            defaultValue={salary ? employee.salaryAnnual : employee.hourlyRate}
            disabled={paid || pending}
            onBlur={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next) || next < 0) return;
              if (salary ? next === employee.salaryAnnual : next === employee.hourlyRate) return;
              savePay(salary ? { salaryAnnual: next } : { hourlyRate: next });
            }}
          />
        </label>
        {paid ? <p className={s.note}>This period is paid, so pay is locked. Tap Unlock below to change it.</p> : null}
        <div className={s.line}>
          <span>Paid</span>
          <b data-pay-frequency="1">{FREQUENCY_LABEL[frequency] || "Every week"}</b>
        </div>
        <button type="button" className={`${s.btn} ${s.ghost}`} onClick={onChangePeriod}>
          Change pay period (whole shop)
        </button>
      </section>

      {/* 2. Job record */}
      <section className={s.section} aria-labelledby={`${employee.id}-job-h`}>
        <h2 className={s.head} id={`${employee.id}-job-h`}>
          Job record
        </h2>
        <label className={s.field}>
          Start date
          <input
            key={`${employee.id}-start-${employee.baselineStartDate}`}
            type="date"
            data-start-date="1"
            defaultValue={employee.baselineStartDate}
            disabled={pending}
            onChange={(event) => {
              const value = event.target.value;
              if (!value || value === employee.baselineStartDate) return;
              run(() => updateStartDate({ employeeId: employee.id, baselineStartDate: value, actor }));
            }}
          />
        </label>
        <label className={s.field}>
          Status
          <select
            key={`${employee.id}-status-${status}`}
            data-employment-status="1"
            defaultValue={status}
            disabled={pending}
            onChange={(event) =>
              run(() =>
                updateEmploymentRecord({ employeeId: employee.id, actor, employmentStatus: event.target.value })
              )
            }
          >
            {EMPLOYMENT_STATUSES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          End date (leave blank if still working)
          <input
            key={`${employee.id}-end-${employee.employmentEndDate || ""}`}
            type="date"
            data-end-date="1"
            defaultValue={employee.employmentEndDate || ""}
            disabled={pending}
            onChange={(event) => {
              const value = event.target.value;
              if (value === (employee.employmentEndDate || "")) return;
              run(() =>
                updateEmploymentRecord({ employeeId: employee.id, actor, employmentEndDate: value || null })
              );
            }}
          />
        </label>
      </section>

      {/* 3. This pay period */}
      <section className={s.section} aria-labelledby={`${employee.id}-period-h`} data-week-pay="1">
        <h2 className={s.head} id={`${employee.id}-period-h`}>
          This pay period
        </h2>
        <div className={s.periodNav}>
          <button
            type="button"
            className={s.navBtn}
            onClick={() => onPeriodOffset(periodOffset - 1)}
            aria-label="Previous pay period"
          >
            ◀
          </button>
          <div className={s.periodLabel}>
            <b>{nickname}</b>
            <span>{formatRange(current.start, current.end)}</span>
          </div>
          <button
            type="button"
            className={s.navBtn}
            onClick={() => onPeriodOffset(periodOffset + 1)}
            aria-label="Next pay period"
          >
            ▶
          </button>
        </div>
        {periodOffset !== 0 ? (
          <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => onPeriodOffset(0)}>
            Back to this period
          </button>
        ) : null}
        <div className={s.line}>
          <span>Hours</span>
          <b>
            {hours(liveCurrent.actualHours)} hrs
            {liveCurrent.overtimeHours > 0 ? ` · ${hours(liveCurrent.overtimeHours)} OT` : ""}
          </b>
        </div>
        <div className={s.line}>
          <span>Net pay (after withholding)</span>
          <b className={s.big}>{money(paid && storedCurrent ? storedCurrent.netPay : liveCurrent.netPay)}</b>
        </div>
        <div className={s.line}>
          <span>Status</span>
          <b>{paid ? "Paid" : "Not paid"}</b>
        </div>
        {canPay ? (
          <button
            type="button"
            className={`${s.btn} ${s.pay}`}
            data-paid={paid ? "1" : undefined}
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  paid
                    ? setPeriodApproval({
                        employeeId: employee.id,
                        approved: false,
                        actor,
                        periodStart: current.start,
                        periodEnd: current.end,
                      })
                    : payCurrentPeriod({
                        employeeId: employee.id,
                        actor,
                        periodStart: current.start,
                        periodEnd: current.end,
                      }),
                paid ? "Unlocked." : "Marked paid."
              )
            }
          >
            {paid ? "Unlock this period" : "Mark paid"}
          </button>
        ) : null}
      </section>

      {/* 4. Direct deposit (details on file only — the app does not move money). */}
      <section className={s.section} aria-labelledby={`${employee.id}-dd-h`} data-direct-deposit="1">
        <h2 className={s.head} id={`${employee.id}-dd-h`}>
          Direct deposit
        </h2>
        <p className={s.note}>
          {employee.firstName}&apos;s bank details, kept on file for payday. jobcommand.app keeps the details and works
          out the pay. It does not send the money. Pay from your bank or payroll service.
        </p>
        <form
          className={s.wrap}
          style={{ marginTop: 0 }}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(
              () =>
                saveEmployeeDeposit({
                  employeeId: employee.id,
                  actor,
                  routing: String(data.get("routing") || ""),
                  account: String(data.get("account") || ""),
                  accountType: String(data.get("accountType") || "CHECKING") === "SAVINGS" ? "SAVINGS" : "CHECKING",
                }),
              "Direct deposit details saved."
            );
          }}
        >
          <label className={s.field}>
            Routing number{employee.depositRoutingLast4 ? ` (saved ····${employee.depositRoutingLast4})` : ""}
            <input
              name="routing"
              inputMode="numeric"
              autoComplete="off"
              key={`${employee.id}-routing-${employee.depositRoutingLast4 || ""}`}
            />
          </label>
          <label className={s.field}>
            Account number{employee.depositAccountLast4 ? ` (saved ····${employee.depositAccountLast4})` : ""}
            <input name="account" inputMode="numeric" autoComplete="off" key={`${employee.id}-account`} />
          </label>
          <label className={s.field}>
            Account type
            <select
              name="accountType"
              key={`${employee.id}-type-${employee.depositAccountType || ""}`}
              defaultValue={employee.depositAccountType || "CHECKING"}
            >
              <option value="CHECKING">Checking</option>
              <option value="SAVINGS">Savings</option>
            </select>
          </label>
          <button type="submit" className={s.btn} disabled={pending}>
            Save bank details
          </button>
        </form>
      </section>

      {/* 5. Week archive: each past period, then daily hours per job. */}
      <section className={s.section} aria-labelledby={`${employee.id}-weeks-h`} data-week-archive="1">
        <h2 className={s.head} id={`${employee.id}-weeks-h`}>
          Week archive
        </h2>
        {history.length ? (
          history.map((period) => {
            const done = period.status === "PAID" || period.status === "APPROVED";
            const days = employee.timeEntries
              .filter(
                (entry) =>
                  entry.date >= period.startDate &&
                  entry.date <= period.endDate &&
                  (entry.actualHours > 0 || entry.scheduledHours > 0)
              )
              .sort((a, b) => a.date.localeCompare(b.date));
            return (
              <details key={period.id} className={s.drop}>
                <summary>
                  {formatRange(period.startDate, period.endDate)}
                  <span>{money(done ? period.netPay : period.regularPay + period.overtimePay)}</span>
                </summary>
                <div className={s.dropBody}>
                  <div className={s.line}>
                    <span>{done ? "Paid" : "Not paid"}</span>
                    <b>
                      {hours(period.regularHours + period.overtimeHours)} hrs
                      {period.overtimeHours > 0 ? ` · ${hours(period.overtimeHours)} OT` : ""}
                    </b>
                  </div>
                  {days.length ? (
                    days.map((day) => (
                      <div key={day.id} className={s.dayRow}>
                        <span>
                          {formatDay(day.date, "EEE MMM d")}
                          {day.job ? ` · ${day.job.client || day.job.code} · ${day.job.name}` : ""}
                        </span>
                        <b>{hours(day.actualHours || day.scheduledHours)} hrs</b>
                      </div>
                    ))
                  ) : (
                    <p className={s.empty}>No hours that week.</p>
                  )}
                </div>
              </details>
            );
          })
        ) : (
          <p className={s.empty}>No past pay periods yet.</p>
        )}
      </section>

      {/* 6. Year to date */}
      <section className={s.section} aria-labelledby={`${employee.id}-ytd-h`} data-year-record="1">
        <h2 className={s.head} id={`${employee.id}-ytd-h`}>
          Year to date · {now.getUTCFullYear()}
        </h2>
        <div className={s.line}>
          <span>Wages</span>
          <b>{money(employee.ytdGross)}</b>
        </div>
        <div className={s.line}>
          <span>Federal withheld</span>
          <b>{money(employee.ytdFederalTax)}</b>
        </div>
        <div className={s.line}>
          <span>State withheld</span>
          <b>{money(employee.ytdStateTax)}</b>
        </div>
        <div className={s.line}>
          <span>Net paid</span>
          <b>{money(employee.ytdNet)}</b>
        </div>
        <p className={s.note}>Use this when you file. Not a substitute for a CPA.</p>
      </section>
    </div>
  );
}
