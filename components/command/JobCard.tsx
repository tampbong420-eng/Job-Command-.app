"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { setJobPipeline, updateJob } from "@/app/actions";
import { formatPhoneNumber } from "@/lib/phone-format";
import { StageRail } from "@/components/command/StageRail";
import { JobCover } from "@/components/command/JobCover";
import { documentTotals } from "@/lib/documents";
import { estimateStatusLabel, parseEstimateStatus } from "@/lib/estimate-status";
import { money } from "@/lib/format";
import { customerForJob, DISPATCH_OUTLINE, dispatchOutline, filledThrough, latestJobInvoice, readPipeFacts } from "@/lib/job-pipeline";
import type { JobStageKey } from "@/lib/page-theme";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, InvoiceDTO, JobDTO } from "@/lib/types";
import { photoBadge } from "@/lib/photo-cache";

export function JobTumbler({
  jobs,
  index,
  drag: _drag = 0,
  dragging: _dragging = false,
  customers,
  estimates,
  invoices,
  employees,
  now,
  actor,
  onIndex,
  onOpenStage,
  shop,
  editing = false,
  guideReady = false,
  guideOn = false,
  onGuide,
  showNav = true,
}: {
  showNav?: boolean;
  jobs: JobDTO[];
  index: number;
  drag?: number;
  dragging?: boolean;
  customers: CustomerDTO[];
  estimates: EstimateDTO[];
  invoices: InvoiceDTO[];
  employees: EmployeeDTO[];
  now: Date;
  actor: string;
  editing?: boolean;
  onIndex: (index: number) => void;
  onOpenStage: (jobId: string, key: JobStageKey) => void;
  shop?: string;
  guideReady?: boolean;
  guideOn?: boolean;
  onGuide?: () => void;
}) {
  const safe = jobs.length ? ((index % jobs.length) + jobs.length) % jobs.length : 0;

  if (!jobs.length) {
    return <p className="command-empty">No jobs yet. Tap New job.</p>;
  }

  return (
    <section className="job-tumbler-shell">
      <div className="job-tumbler-track">
        {jobs.length ? (
          <article className="job-card-slot on">
            <JobCard
              job={jobs[safe]}
              customer={customerForJob(jobs[safe], customers, estimates.find((item) => item.jobId === jobs[safe].id) || null)}
              estimate={estimates.find((item) => item.jobId === jobs[safe].id) || null}
              invoices={invoices}
              employees={employees}
              now={now}
              actor={actor}
              onOpenStage={onOpenStage}
              shop={shop}
              editing={editing}
              guideReady={guideReady}
              guideOn={guideOn}
              onGuide={onGuide}
              deck={jobs}
              deckIndex={safe}
              onDeckIndex={onIndex}
            />
          </article>
        ) : null}
      </div>
      {showNav ? (
        <JobTumblerNav
          jobs={jobs}
          index={safe}
          onIndex={onIndex}
          onPrev={() => onIndex((safe - 1 + jobs.length) % jobs.length)}
          onNext={() => onIndex((safe + 1) % jobs.length)}
        />
      ) : null}
    </section>
  );
}

/** ◀ dots ▶ between jobs. Sits inside each job card, right above the pipeline stages (Eric, 2026-10-03). */
export function JobTumblerNav({
  jobs,
  index,
  onIndex,
  onPrev,
  onNext,
  top = false,
}: {
  jobs: JobDTO[];
  index: number;
  onIndex: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  top?: boolean;
}) {
  if (!jobs.length) return null;
  const safe = ((index % jobs.length) + jobs.length) % jobs.length;
  // Eric's arrow style (2026-10-03): bold, slight flick, orange. Left points left, right points right.
  const arrowRight = (
    <svg viewBox="0 0 32 24" fill="currentColor" aria-hidden="true" className="tumbler-arrow">
      <path d="M2 10.5h18.6l-5.2-5.2L17 3.7 26.3 12 17 20.3l-1.6-1.6 5.2-5.2H2v-3z" />
    </svg>
  );
  const arrowLeft = (
    <svg viewBox="0 0 32 24" fill="currentColor" aria-hidden="true" className="tumbler-arrow">
      <path d="M30 10.5H11.4l5.2-5.2L15 3.7 5.7 12l9.3 8.3 1.6-1.6-5.2-5.2H30v-3z" />
    </svg>
  );
  return (
    <div className={`job-tumbler-nav${top ? " jobs-nav-top" : ""}`} data-jobs-nav-top={top ? "1" : undefined}>
      <button type="button" className="tumbler-step" onClick={onPrev} aria-label="Previous job">
        {arrowLeft}
      </button>
      <div className="job-tumbler-dots">
        {jobs.map((job, i) => (
          <button
            key={job.id}
            type="button"
            className={i === safe ? "on" : ""}
            aria-label={`Show ${job.client} · ${job.name}`}
            onClick={() => onIndex(i)}
          />
        ))}
      </div>
      <button type="button" className="tumbler-step" onClick={onNext} aria-label="Next job">
        {arrowRight}
      </button>
    </div>
  );
}

function JobCard({
  job,
  customer,
  estimate,
  invoices,
  employees,
  now,
  actor,
  onOpenStage,
  shop: _shop,
  editing = false,
  guideReady = false,
  guideOn = false,
  onGuide,
  deck,
  deckIndex = 0,
  onDeckIndex,
}: {
  job: JobDTO;
  customer: CustomerDTO | null;
  estimate: EstimateDTO | null;
  invoices: InvoiceDTO[];
  employees: EmployeeDTO[];
  now: Date;
  actor: string;
  editing?: boolean;
  onOpenStage: (jobId: string, key: JobStageKey) => void;
  shop?: string;
  guideReady?: boolean;
  guideOn?: boolean;
  onGuide?: () => void;
  deck?: JobDTO[];
  deckIndex?: number;
  onDeckIndex?: (index: number) => void;
}) {
  const facts = readPipeFacts({ job, customer, estimate, invoices, employees, now });
  const filled = filledThrough(job.pipeline, facts);
  const archived = filled >= 6;
  const who = customer?.name || job.client;
  const [client, setClient] = useState(who);
  const [jobName, setJobName] = useState(job.name);
  const [phone, setPhone] = useState(facts.phone);
  const [email, setEmail] = useState(facts.email);
  const [house, setHouse] = useState(facts.property);
  const [info, setInfo] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setClient(who);
    setJobName(job.name);
    setPhone(facts.phone);
    setEmail(facts.email);
    setHouse(facts.property);
    setInfo(false);
  }, [job.id, who, job.name, facts.phone, facts.email, facts.property]);

  function commit(patch: { name?: string; client?: string; address?: string; phone?: string; email?: string }) {
    startTransition(async () => {
      try {
        await updateJob({ jobId: job.id, actor, ...patch });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save that job.");
      }
    });
  }
  const outline = dispatchOutline(job.pipeline);

  if (archived) {
    return (
      <article className="job-card job-card-container command-card archived panel-locked" data-dispatch="closed">
        <b className="job-card-client app-title-main client-name">{who}</b>
        <span className="job-card-job">{job.name}</span>
        <JobCover jobId={job.id} photos={job.photos} clientName={who} small />
        <p className="card-label">Complete</p>
        <span>Collapsed · job file closed</span>
        <button
          type="button"
          className="ghost-action slim"
          onClick={() =>
            setJobPipeline({ jobId: job.id, pipeline: 5, actor }).catch((error) =>
              toast.error(error instanceof Error ? error.message : "Could not reopen.")
            )
          }
        >
          Pull back to paid
        </button>
      </article>
    );
  }

  return (
    <article
      className="job-card job-card-container command-card"
      data-dispatch={outline || undefined}
      style={outline ? { outlineColor: DISPATCH_OUTLINE[outline] } : undefined}
    >
      {/* Client name above the house; cover photo below it (Eric, 2026-10-03).
          Oldest photo (the bid-time front shot) becomes the cover automatically. Tap opens the gallery. */}
      <header className="job-card-contact">
        <p className="card-label section-label">Client</p>
        {editing ? (
          <input
            className="job-card-edit"
            aria-label="Client"
            value={client}
            onChange={(event) => setClient(event.target.value)}
            onBlur={() => {
              if (client.trim() && client.trim() !== who) commit({ client: client.trim() });
            }}
          />
        ) : (
          <div className="client-name-row">
            <h2 className="job-card-client app-title-main client-name">{client || who}</h2>
            <button
              type="button"
              className="client-info"
              aria-label="Client info"
              aria-expanded={info}
              onClick={() => setInfo((open) => !open)}
            >
              i
            </button>
          </div>
        )}
        {editing ? (
          <input
            className="job-card-edit"
            aria-label="Job name"
            value={jobName}
            onChange={(event) => setJobName(event.target.value)}
            onBlur={() => {
              if (jobName.trim() && jobName.trim() !== job.name) commit({ name: jobName.trim() });
            }}
          />
        ) : (
          <p className="job-card-job">{jobName || job.name}</p>
        )}
        {editing ? (
          <>
            <EditLine label="Phone" value={phone} onChange={(v) => setPhone(formatPhoneNumber(v))} onBlur={() => phone.trim() !== facts.phone && commit({ phone: phone.trim() })} autoFocus />
            <EditLine label="Email" value={email} onChange={setEmail} onBlur={() => email.trim() !== facts.email && commit({ email: email.trim() })} />
            <EditLine label="House" value={house} onChange={setHouse} onBlur={() => house.trim() !== facts.property && commit({ address: house.trim() })} />
          </>
        ) : info ? (
          <ClientFile
            phone={phone || facts.phone}
            email={email || facts.email}
            house={house || facts.property}
            jobName={jobName || job.name}
            jobCode={job.code}
            notes={job.notes}
            timeline={job.timeline}
            dueDate={job.dueDate}
            estimate={estimate}
            invoice={latestJobInvoice(invoices, job.id)}
          />
        ) : null}
        {job.photos.length ? <p className="job-card-photos">{photoBadge(job.photos.length)}</p> : null}
      </header>
      <JobCover jobId={job.id} photos={job.photos} clientName={who} hero />

      {/* Job arrows sit right above the pipeline stages now (Eric, 2026-10-03), not at the top. */}
      {deck && deck.length > 1 && onDeckIndex ? (
        <JobTumblerNav
          jobs={deck}
          index={deckIndex}
          onIndex={onDeckIndex}
          onPrev={() => onDeckIndex((deckIndex - 1 + deck.length) % deck.length)}
          onNext={() => onDeckIndex((deckIndex + 1) % deck.length)}
        />
      ) : null}
      <StageRail
        job={job}
        facts={facts}
        filled={filled}
        onOpenStage={onOpenStage}
        guideReady={guideReady}
        guideOn={guideOn}
        onGuide={onGuide}
      />
    </article>
  );
}

function EditLine({
  label,
  value,
  onChange,
  onBlur,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="job-card-line">
      <small>{label}</small>
      <input className="job-card-edit" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} autoFocus={autoFocus} />
    </label>
  );
}

function filedDate(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ClientFile({
  phone,
  email,
  house,
  jobName,
  jobCode,
  notes,
  timeline,
  dueDate,
  estimate,
  invoice,
}: {
  phone: string;
  email: string;
  house: string;
  jobName: string;
  jobCode: string;
  notes: string;
  timeline: string;
  dueDate: string | null;
  estimate: EstimateDTO | null;
  invoice: InvoiceDTO | null;
}) {
  const totals = estimate ? documentTotals(estimate.lines, estimate.taxRate) : null;
  return (
    <div className="client-info-card" role="region" aria-label="Client information">
      <ContactLine label="Phone" value={phone} href={phone ? `tel:${phone}` : undefined} empty="No phone on file" />
      <ContactLine label="Email" value={email} href={email ? `mailto:${email}` : undefined} empty="No email on file" />
      <ContactLine label="House" value={house} empty="No house on file" />
      <ContactLine label="Job" value={jobName} empty="No job name on file" />
      <ContactLine label="Job number" value={jobCode} empty="No job number on file" />
      <ContactLine label="Notes" value={notes} empty="No notes on file" />
      <ContactLine label="Timeline" value={timeline} empty="No timeline on file" />
      <ContactLine label="Due" value={filedDate(dueDate)} empty="No due date on file" />
      <ContactLine
        label="Estimate"
        value={
          estimate
            ? `${estimate.number} · ${estimateStatusLabel(parseEstimateStatus(estimate.status))}${totals ? ` · ${money(totals.total)}` : ""}`
            : ""
        }
        empty="No estimate on file"
      />
      <ContactLine label="Estimate terms" value={estimate?.terms || ""} empty="No estimate terms on file" />
      <ContactLine label="Signed by" value={estimate?.signedName || ""} empty="Not signed" />
      <ContactLine
        label="Invoice"
        value={invoice ? `${invoice.number} · ${invoice.status} · ${money(invoice.amount)}` : ""}
        empty="No invoice on file"
      />
      <ContactLine label="Invoice terms" value={invoice?.terms || ""} empty="No invoice terms on file" />
    </div>
  );
}

function ContactLine({
  label,
  value,
  href,
  empty,
}: {
  label: string;
  value: string;
  href?: string;
  empty: string;
}) {
  const inner = (
    <>
      <small>{label}</small>
      <span>{value || empty}</span>
    </>
  );
  if (href && value) {
    return (
      <a className="job-card-line" href={href}>
        {inner}
      </a>
    );
  }
  return <p className={`job-card-line${value ? "" : " miss"}`}>{inner}</p>;
}

export function sortJobDeck(
  jobs: JobDTO[],
  customers: CustomerDTO[],
  estimates: EstimateDTO[],
  invoices: InvoiceDTO[],
  employees: EmployeeDTO[],
  now: Date
) {
  return [...jobs].sort((a, b) => {
    const fillA = filledThrough(
      a.pipeline,
      readPipeFacts({
        job: a,
        customer: customerForJob(a, customers, estimates.find((item) => item.jobId === a.id) || null),
        estimate: estimates.find((item) => item.jobId === a.id) || null,
        invoices,
        employees,
        now,
      })
    );
    const fillB = filledThrough(
      b.pipeline,
      readPipeFacts({
        job: b,
        customer: customerForJob(b, customers, estimates.find((item) => item.jobId === b.id) || null),
        estimate: estimates.find((item) => item.jobId === b.id) || null,
        invoices,
        employees,
        now,
      })
    );
    if (fillA >= 6 && fillB < 6) return 1;
    if (fillB >= 6 && fillA < 6) return -1;
    return 0;
  });
}
