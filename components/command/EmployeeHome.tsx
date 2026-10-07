"use client";

import { useMemo, useState } from "react";
import { Navigation } from "lucide-react";
import { toast } from "sonner";
import { ContactStrip } from "@/components/command/ContactStrip";
import { SiteMap } from "@/components/command/SiteMap";
import { SiteWeather } from "@/components/command/SiteWeather";
import { StatusChip } from "@/components/command/StatusChip";
import { useAlerts } from "@/hooks/use-alerts";
import { useSiteWeather } from "@/hooks/use-site-weather";
import { todaysStops } from "@/components/command/FieldDay";
import { clockTodayOffline } from "@/lib/offline/actions";
import { navigateUrl, shopAddress } from "@/lib/maps";
import { materialPrepItems, parsePrep } from "@/lib/job-prep";
import { deriveStatus, liveActualHours } from "@/lib/payroll";
import { formatTimeLabel } from "@/lib/schedule";
import { todayString } from "@/lib/dates";
import { ShiftTimers } from "@/components/command/ShiftTimers";
import { paidHoursAfterLunch, readStoredPauses, type ShiftPause, unpaidLunchHours } from "@/lib/shift-pause";
import { rollingSchedule, weekHourTotal, weekRange } from "@/lib/week-hours";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, JobDTO, PayrollSettingsDTO } from "@/lib/types";
import { AiPrivacySettings } from "@/components/command/AiConsent";
import { DeleteMyLogin } from "@/components/command/DeleteAccount";
import { ChangePin } from "@/components/command/ChangePin";

function bossPhone(settings: PayrollSettingsDTO) {
  return (
    settings.companyPhone?.trim() ||
    settings.ownerPhone?.trim() ||
    settings.bosses.find((boss) => boss.phone?.trim())?.phone ||
    ""
  );
}

function bossName(settings: PayrollSettingsDTO) {
  const named = `${settings.ownerFirstName || ""} ${settings.ownerLastName || ""}`.trim();
  if (named) return named;
  const boss = settings.bosses[0];
  if (boss) return `${boss.firstName} ${boss.lastName}`.trim();
  return "the shop";
}

export function EmployeeHome({
  employee,
  jobs,
  customers,
  estimates,
  settings,
  now,
  actor,
  onOpenStop,
}: {
  employee: EmployeeDTO;
  jobs: JobDTO[];
  customers: CustomerDTO[];
  estimates: EstimateDTO[];
  settings: PayrollSettingsDTO;
  now: Date;
  actor: string;
  onOpenStop: (jobId: string) => void;
}) {
  const today = todayString(now);
  const stops = todaysStops(employee, today);
  const todayEntry =
    employee.timeEntries.find((entry) => entry.date === today && entry.clockIn && !entry.clockOut) ||
    stops[0] ||
    employee.timeEntries.find((entry) => entry.date === today);
  const live = Boolean(todayEntry?.clockIn && !todayEntry?.clockOut);
  const actual = todayEntry ? liveActualHours(todayEntry, now) : 0;
  const status = todayEntry ? deriveStatus({ ...todayEntry, actualHours: actual }, now) : "SCHEDULED";
  const liveJobId = todayEntry?.jobId || stops[0]?.jobId || null;
  const liveJob = jobs.find((job) => job.id === liveJobId) || null;
  const siteAddress = (liveJob?.address || "").trim();
  const weather = useSiteWeather(siteAddress);
  const week = weekRange(now);
  const days = rollingSchedule(employee.timeEntries, now, 10);
  const [pauses, setPauses] = useState<ShiftPause[]>(() => readStoredPauses(employee.id, today));
  const unpaid = unpaidLunchHours(pauses, now.getTime());
  const hours = useMemo(() => {
    const raw = weekHourTotal(employee.timeEntries, now);
    return paidHoursAfterLunch(raw, pauses, now.getTime());
  }, [employee.timeEntries, now, pauses]);
  const shop = shopAddress(settings.businessAddress);
  const lead = bossPhone(settings);
  const { alerts, unread } = useAlerts();

  return (
    <section className="employee-home" data-employee-home="1" aria-label="Employee">
      <div className="employee-home-head">
        <img src={employee.photoUrl ?? "/avatars/generic.svg"} alt="" />
        <div>
          <p className="card-label">Field phone</p>
          <b>
            {employee.firstName} {employee.lastName}
          </b>
          <span>{employee.jobTitle}</span>
          <StatusChip status={status} />
        </div>
      </div>
      <div className="rolodex-actions">
        {live ? (
          <button
            type="button"
            className="ghost-action hours"
            onClick={() =>
              clockTodayOffline({
                employeeId: employee.id,
                action: "OUT",
                actor,
                unpaidHours: unpaid,
              }).catch((error) => toast.error(error instanceof Error ? error.message : "Clock-out failed."))
            }
          >
            Clock out
          </button>
        ) : (
          <button
            type="button"
            className="ghost-action clock-in"
            onClick={() =>
              clockTodayOffline({
                employeeId: employee.id,
                action: "IN",
                actor,
                jobId: todayEntry?.jobId,
              }).catch((error) => toast.error(error instanceof Error ? error.message : "Clock-in failed."))
            }
          >
            Clock in
          </button>
        )}
      </div>
      <p className="command-empty">
        {live
          ? "Location is sharing with the shop while you’re punched in."
          : "Open today’s jobs for the address, notes, and directions before you clock in. Punch in when you roll on site."}
      </p>
      <ShiftTimers employeeId={employee.id} date={today} live={live} onPauses={setPauses} />
      <section className="week-hours" data-week-hours="1">
        <p className="card-label">This week</p>
        <b>{hours} hr</b>
        <span>
          {week.start.slice(5)} – {week.end.slice(5)} · paid time
        </span>
        <p className="card-label">10-day schedule</p>
        <ol className="week-hours-days" data-rolling-schedule="10">
          {days.map((day) => {
            const logged = day.date === today ? paidHoursAfterLunch(day.loggedHours, pauses, now.getTime()) : day.loggedHours;
            return (
            <li key={day.date} className={day.date === today ? "on" : ""}>
              <b>{day.weekday}</b>
              <span>
                Logged {logged} hr
                {day.scheduledHours ? ` · Set ${day.scheduledHours} hr` : ""}
              </span>
              <small>
                {day.shift || "No shift on the board"}
                {day.jobs ? ` · ${day.jobs}` : ""}
              </small>
            </li>
            );
          })}
        </ol>
      </section>
      <section className="boss-line">
        <p className="card-label">Shop / lead</p>
        <b>{bossName(settings)}</b>
        <ContactStrip phone={lead} who={bossName(settings)} />
      </section>
      <section className="employee-alerts">
        <p className="card-label">Alerts</p>
        {alerts.slice(0, 4).length ? (
          <ul>
            {alerts.slice(0, 4).map((alert) => (
              <li key={alert.id}>
                <b>{alert.title}</b>
                <span>{alert.body}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="command-empty">Quiet. Dispatch and schedule notes land here and on the badge.</p>
        )}
        {unread ? <p className="command-empty">{unread} unread on the badge up top.</p> : null}
      </section>
      {siteAddress ? <SiteWeather status={weather.status} data={weather.data} address={siteAddress} /> : null}
      {siteAddress ? (
        <SiteMap
          address={siteAddress}
          coords={weather.data?.coords}
          origin={shop}
          compact
        />
      ) : null}
      <section className="employee-stops" data-pre-shift="1">
        <p className="card-label">Today’s jobs</p>
        {stops.length ? (
          <ol className="field-stops">
            {stops.map((entry, index) => {
              const job = jobs.find((item) => item.id === entry.jobId) || entry.job;
              if (!job) return null;
              const estimate = estimates.find((item) => item.jobId === job.id);
              const customer = customers.find((item) => item.id === job.customerId || item.name === job.client);
              const prep = parsePrep(job.prepChecklist);
              const materials = materialPrepItems(estimate);
              const prev = index === 0 ? shop : jobs.find((item) => item.id === stops[index - 1].jobId)?.address || shop;
              const onClock = Boolean(entry.clockIn && !entry.clockOut);
              return (
                <li key={entry.id} className={`field-stop${onClock ? " live" : ""}`}>
                  <button type="button" className="field-stop-hit" onClick={() => onOpenStop(job.id)}>
                    <span className="field-stop-num">{index + 1}</span>
                    <div>
                      <b className="client-name">{job.client}</b>
                      <span>{job.address || "No address on the card"}</span>
                      <small>
                        {formatTimeLabel(entry.scheduledStart)}–{formatTimeLabel(entry.scheduledEnd)}
                        {prep.dispatchNotes ? ` · ${prep.dispatchNotes}` : job.notes ? ` · ${job.notes}` : ""}
                      </small>
                    </div>
                  </button>
                  <div className="field-stop-actions">
                    <a className="job-nav" href={navigateUrl(job.address || "", prev)} target="_blank" rel="noreferrer">
                      <Navigation className="size-5" />
                      Navigate
                    </a>
                    <button type="button" className="ghost-action hours" onClick={() => onOpenStop(job.id)}>
                      On site
                    </button>
                  </div>
                  {customer?.phone ? (
                    <a className="field-call" href={`tel:${customer.phone}`}>
                      Call {customer.name.split(" ")[0]}
                    </a>
                  ) : null}
                  {prep.siteFeed?.notes ? <p className="employee-note">{prep.siteFeed.notes}</p> : null}
                  {materials.length ? (
                    <ul className="employee-mats">
                      {materials.map((item) => (
                        <li key={item.id} data-ready={prep.materials[item.id] ? "1" : "0"}>
                          {item.label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="field-empty">
            <h2>Today’s jobs</h2>
            <p>No stops packed for {employee.firstName} today. When the shop assigns a visit, directions, notes, and materials land here.</p>
          </div>
        )}
      </section>
      {/* App Store: crew can review the AI choice and delete their own login (5.1.2(i), 5.1.1(v)). */}
      <section className="employee-account" data-employee-account="1" aria-label="My account">
        <p className="card-label">My account</p>
        <ChangePin />
        <div className="company-block">
          <AiPrivacySettings />
        </div>
        <DeleteMyLogin />
      </section>
    </section>
  );
}
