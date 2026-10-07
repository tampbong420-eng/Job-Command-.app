"use client";

import { sendToast } from "@/lib/delivery-honest";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useSwipeNav } from "@/hooks/use-swipe-nav";
import { SwipeBlink } from "@/components/command/SwipeBlink";
import { useRouter } from "next/navigation";
import {
  acceptEstimate,
  createCustomer,
  markDocumentSent,
  payInvoice,
  saveJobInvoice,
  updateCustomer,
} from "@/app/actions";
import { saveEstimateOffline, sendEstimateOffline, updateJobOffline, saveJobNoteOffline } from "@/lib/offline/actions";
import { isLocalId } from "@/lib/offline/idb";
import { isMockSeedId } from "@/lib/initial-data";
import { browserOnline } from "@/lib/offline/net";
import {
  DEFAULT_ESTIMATE_TERMS,
  invoiceTermsFor,
  blankLine,
  documentTotals,
  ensureScopeLines,
  lineAmount,
  type DocLineDraft,
} from "@/lib/documents";
import { parseDocumentTalk } from "@/lib/document-parse";
import { mergeEditableLines } from "@/lib/estimate-merge";
import { customerForJob, type FolderTab } from "@/lib/job-pipeline";
import { fileLine, indexClients, profileForCustomer } from "@/lib/clients";
import { ContactStrip } from "@/components/command/ContactStrip";
import { PhotoBar } from "@/components/command/TalkStrip";
import { useTalkScope } from "@/components/command/OneMic";
import { mergeNotes, mergeTalkLines } from "@/lib/site-talk";
import { costForJob } from "@/lib/job-cost-core";
import { todayString } from "@/lib/dates";
import { money } from "@/lib/format";
import { invoiceMail } from "@/lib/estimate-copy";
import { shopBrand } from "@/lib/shop-brand";
import { useShopPlace } from "@/components/command/ShopPlace";
import { mailtoHref } from "@/lib/share";
import { liveActualHours } from "@/lib/payroll";
import { EstimateStatusBar } from "@/components/command/EstimateStatus";
import { DeliveryTrail } from "@/components/command/DeliveryTrail";
import { useOfficialGate } from "@/components/signup/OfficialSheet";
import { CostCue } from "@/components/command/CostCue";
import { useJobPhotos } from "@/hooks/use-job-photos";
import { draftFromPhotos, persistPhotoDraft } from "@/lib/photo-link";
import { DeckPane } from "@/components/command/DeckPane";
import { FreeNumberInput } from "@/components/command/FreeNumberInput";
import { JobCrewSchedule } from "@/components/command/JobCrewSchedule";
import type {
  CustomerDTO,
  EmployeeDTO,
  EstimateDTO,
  InvoiceDTO,
  JobDTO,
  PayrollSettingsDTO,
} from "@/lib/types";

function FolderJobSwitch({
  jobs,
  index,
  onPrev,
  onNext,
  onOpen,
}: {
  jobs: JobDTO[];
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onOpen: (jobId: string) => void;
}) {
  if (!jobs.length) return null;
  const job = jobs[Math.max(0, Math.min(index, jobs.length - 1))];
  return (
    <section className="rolodex-strip job-tumbler">
      {jobs.length > 1 ? <SwipeBlink storageKey="jc-folder-swipe" /> : null}
      <div className="rolodex-person">
        <button type="button" className="tumbler-step" onClick={onPrev} aria-label="Previous job">
          ◀
        </button>
        <button type="button" className="job-tumbler-face" onClick={() => onOpen(job.id)}>
          <p className="card-label">{job.code}</p>
          <b>{job.name}</b>
          <span className="client-name">{job.client}</span>
        </button>
        <button type="button" className="tumbler-step" onClick={onNext} aria-label="Next job">
          ▶
        </button>
      </div>
    </section>
  );
}

function FolderTalk({
  job,
  customer,
  estimate,
  actor,
}: {
  job: JobDTO;
  customer: CustomerDTO | null;
  estimate: EstimateDTO | null;
  actor: string;
}) {
  const router = useRouter();
  const photos = useJobPhotos(job, actor);
  const [, setParsing] = useState(false);

  function applyTalk(text: string, silent = false) {
    const cleaned = text.trim();
    if (!cleaned) {
      if (!silent) toast.error("Say it or type it first — I’ll take it from there.");
      return;
    }
    const local = parseDocumentTalk(cleaned);
    const notes = mergeNotes(job.notes, local.notes || "");
    void saveJobNoteOffline({ jobId: job.id, notes, actor });
    if (local.lines.length) {
      void saveEstimateOffline({
        jobId: job.id,
        customerId: customer?.id || null,
        notes,
        terms: estimate?.terms,
        taxRate: estimate?.taxRate,
        lines: mergeTalkLines(estimate?.lines || [], local.lines),
        actor,
      });
      if (!silent) {
        toast.success(`Got it — ${local.lines.length} line${local.lines.length === 1 ? "" : "s"} on the bid.`);
      }
    }
    setParsing(true);
    void fetch("/api/docs/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleaned }),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const draft = (await response.json()) as { notes?: string; lines?: DocLineDraft[] };
        const nextNotes = mergeNotes(notes, draft.notes || "");
        void saveJobNoteOffline({ jobId: job.id, notes: nextNotes, actor });
        if (draft.lines?.length) {
          await saveEstimateOffline({
            jobId: job.id,
            customerId: customer?.id || null,
            notes: nextNotes,
            terms: estimate?.terms,
            taxRate: estimate?.taxRate,
            lines: mergeTalkLines(estimate?.lines || [], draft.lines),
            actor,
          });
        }
        router.refresh();
      })
      .catch(() => router.refresh())
      .finally(() => setParsing(false));
  }

  // The one floating mic: “scrape and prime the fascia…” → one chip that puts it on the job.
  useTalkScope({
    id: `folder-${job.id}`,
    label: customer?.name || job.client || job.name || "This job",
    dest: "Job notes & bid",
    priority: 20,
    examples: ["Scrape and prime the fascia, two coats Duration", "Snap a photo of the porch"],
    parse: (text) => applyTalk(text),
    snap: photos.snap,
    roll: photos.roll,
  });

  async function onFiles(list: FileList | null) {
    try {
      const next = await photos.ingest(list);
      if (!next.length) return;
      const draft = await draftFromPhotos({
        job,
        estimate,
        notes: job.notes,
        lines: estimate?.lines || [],
        photos: next,
      });
      if (draft) await persistPhotoDraft({ job, customer, estimate, actor, draft });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t save that photo.");
    }
  }

  return (
    <PhotoBar
      photos={photos.photos}
      busy={photos.busy}
      onSnap={photos.snap}
      onRoll={photos.roll}
      onRemove={(id) => void photos.remove(id).catch(() => toast.error("Couldn’t pull that photo."))}
      camRef={photos.camRef}
      rollRef={photos.rollRef}
      onFiles={(list) => void onFiles(list)}
    />
  );
}

export function JobFolder({
  job,
  jobs,
  jobIndex,
  onPrevJob,
  onNextJob,
  onChangeJob,
  employees,
  customers,
  invoices,
  estimates,
  estimate,
  settings,
  now,
  actor,
  initialTab = "estimate",
  fieldMode = false,
  onClose,
  onTabChange,
}: {
  job: JobDTO;
  jobs: JobDTO[];
  jobIndex: number;
  onPrevJob: () => void;
  onNextJob: () => void;
  onChangeJob: (jobId: string) => void;
  employees: EmployeeDTO[];
  customers: CustomerDTO[];
  invoices: InvoiceDTO[];
  estimates?: EstimateDTO[];
  estimate: EstimateDTO | null;
  settings: PayrollSettingsDTO;
  now: Date;
  actor: string;
  initialTab?: FolderTab;
  fieldMode?: boolean;
  onClose: () => void;
  onTabChange?: (tab: FolderTab) => void;
}) {
  const [tab, setTab] = useState<FolderTab>(fieldMode && initialTab === "invoice" ? "work" : initialTab);
  const customer = customerForJob(job, customers, estimate);
  const cost = costForJob({ job, employees, estimate, invoices, now });
  const jobInvoices = invoices
    .filter((invoice) => invoice.jobId === job.id)
    .sort((a, b) => b.number.localeCompare(a.number));
  const latestInvoice = jobInvoices[0] || null;
  const missing = [
    ...(!(job.address || customer?.address) ? ["job site address"] : []),
    ...(!customer?.phone?.trim() ? ["phone"] : []),
    ...(!customer?.email?.trim() ? ["email"] : []),
  ];
  const swipe = useSwipeNav(onPrevJob, onNextJob, { enabled: jobs.length > 1, shell: true });

  return (
    <section className="job-folder" data-stage="folder" {...swipe.bind}>
      <div className="folder-top">
        <button type="button" className="ghost-action slim" onClick={onClose}>
          Back
        </button>
        <p className="card-label">Job folder</p>
      </div>
      <DeckPane key={job.id}>
      <FolderTalk job={job} customer={customer} estimate={estimate} actor={actor} />
      <FolderJobSwitch
        jobs={jobs}
        index={jobIndex}
        onPrev={onPrevJob}
        onNext={onNextJob}
        onOpen={onChangeJob}
      />
      <h1>{job.name}</h1>
      <p className="folder-client">
        {job.code} · <span className="client-name">{job.client}</span>
      </p>
      <ContactStrip phone={customer?.phone} email={customer?.email} who={job.client} />
      {fieldMode ? null : <CostCue cost={cost} />}
      <div className="choice-row folder-tabs">
        {(
          [
            ["details", "Customer"],
            ["estimate", "Bid"],
            ["work", "Work"],
            ...(fieldMode ? [] : [["invoice", "Invoice"] as const]),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "ghost-action hours" : "ghost-action"}
            onClick={() => {
              setTab(id);
              onTabChange?.(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "details" ? (
        <JobCustomer
          job={job}
          customer={customer}
          customers={customers}
          jobs={jobs}
          estimates={estimates || (estimate ? [estimate] : [])}
          employees={employees}
          actor={actor}
          missing={missing}
        />
      ) : null}
      {tab === "estimate" ? (
        <DocumentEditor
          key={`${job.id}-estimate-${estimate?.id || "new"}`}
          kind="estimate"
          job={job}
          customer={customer}
          customers={customers}
          estimate={estimate}
          invoice={null}
          actor={actor}
          hideTalk
        />
      ) : null}
      {tab === "work" ? (
        <JobWork
          job={job}
          employees={employees}
          now={now}
          actor={actor}
          fieldMode={fieldMode}
        />
      ) : null}
      {tab === "invoice" && !fieldMode ? (
        <DocumentEditor
          key={`${job.id}-invoice-${latestInvoice?.id || "new"}`}
          kind="invoice"
          job={job}
          customer={customer}
          customers={customers}
          estimate={estimate}
          invoice={latestInvoice}
          actor={actor}
          hideTalk
        />
      ) : null}
      <p className="command-empty">
        {[shopBrand(settings).name, shopBrand(settings).place].filter(Boolean).join(" · ")}
      </p>
      </DeckPane>
    </section>
  );
}

function JobCustomer({
  job,
  customer,
  customers,
  jobs,
  estimates,
  employees,
  actor,
  missing,
}: {
  job: JobDTO;
  customer: CustomerDTO | null;
  customers: CustomerDTO[];
  jobs: JobDTO[];
  estimates: EstimateDTO[];
  employees: EmployeeDTO[];
  actor: string;
  missing: string[];
}) {
  const profile = profileForCustomer(
    indexClients({ customers, jobs, estimates, employees }),
    customer?.id || job.customerId,
    job.client
  );
  const liveCustomerId =
    customer?.id && !isMockSeedId(customer.id) && !isLocalId(customer.id) ? customer.id : null;

  function persistCustomer(patch: { name?: string; phone?: string; email?: string; address?: string }) {
    const name = (patch.name ?? customer?.name ?? job.client).trim();
    if (liveCustomerId) {
      void updateCustomer({
        customerId: liveCustomerId,
        name: patch.name,
        phone: patch.phone,
        email: patch.email,
        address: patch.address,
        actor,
      }).catch(() => toast.error("Could not save customer."));
      if (patch.name != null && patch.name.trim() && patch.name.trim() !== job.client) {
        void updateJobOffline({ jobId: job.id, client: patch.name.trim(), actor }).catch(() =>
          toast.error("Could not save client name.")
        );
      }
      return;
    }
    if (!name) return;
    void createCustomer({
      name,
      phone: patch.phone ?? customer?.phone,
      email: patch.email ?? customer?.email,
      address: patch.address ?? customer?.address ?? job.address,
      actor,
      jobId: job.id,
    }).catch(() => toast.error("Could not save customer."));
  }

  return (
    <div className="add-form tight" data-customer-records="1">
      <label className={`settings-field${missing.includes("job site address") ? " need" : ""}`}>
        Job site *
        <input
          defaultValue={job.address}
          key={`${job.id}-address`}
          onBlur={(event) => {
            if (event.target.value !== job.address) {
              void updateJobOffline({ jobId: job.id, address: event.target.value, actor }).catch(() =>
                toast.error("Could not save address.")
              );
            }
          }}
        />
      </label>
      <label className="settings-field">
        Homeowner
        <input
          defaultValue={customer?.name || job.client}
          key={`${customer?.id || job.id}-name`}
          autoComplete="name"
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name === (customer?.name || job.client)) return;
            persistCustomer({ name });
          }}
        />
      </label>
      {profile ? <p className="client-file">{fileLine(profile)}</p> : null}
      <label className={`settings-field${missing.includes("phone") || missing.includes("homeowner contact") ? " need" : ""}`}>
        Phone *
        <input
          defaultValue={customer?.phone || ""}
          key={`${customer?.id || job.id}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          onBlur={(event) => {
            const phone = event.target.value.trim();
            if (phone === (customer?.phone || "")) return;
            persistCustomer({ phone });
          }}
        />
      </label>
      <label className={`settings-field${missing.includes("email") ? " need" : ""}`}>
        Email *
        <input
          type="email"
          defaultValue={customer?.email || ""}
          key={`${customer?.id || job.id}-email`}
          autoComplete="email"
          onBlur={(event) => {
            const email = event.target.value.trim();
            if (email === (customer?.email || "")) return;
            persistCustomer({ email });
          }}
        />
      </label>
      <label className="settings-field">
        Customer address
        <input
          defaultValue={customer?.address || ""}
          key={`${customer?.id || job.id}-customer-address`}
          autoComplete="street-address"
          onBlur={(event) => {
            const address = event.target.value.trim();
            if (address === (customer?.address || "")) return;
            persistCustomer({ address });
          }}
        />
      </label>
      <p className="command-empty">Phone and email are required to send the bid and invoice. Name, phone, email, and address can be added or edited at any time.</p>
      <DeliveryTrail estimates={estimates} />
    </div>
  );
}

function JobWork({
  job,
  employees,
  now,
  actor,
  fieldMode,
}: {
  job: JobDTO;
  employees: EmployeeDTO[];
  now: Date;
  actor: string;
  fieldMode?: boolean;
}) {
  const today = todayString(now);
  const onSite = employees.filter((employee) =>
    employee.timeEntries.some(
      (entry) => entry.jobId === job.id && entry.date === today && entry.clockIn && !entry.clockOut
    )
  );
  const hours = employees.reduce(
    (sum, employee) =>
      sum +
      employee.timeEntries
        .filter((entry) => entry.jobId === job.id)
        .reduce((inner, entry) => inner + liveActualHours(entry, now), 0),
    0
  );

  return (
    <div className="add-form tight">
      <div className="setup-preview">
        <b>On site now</b>
        <span>
          {onSite.length
            ? onSite.map((person) => `${person.firstName} ${person.lastName}`).join(", ")
            : "Nobody clocked into this job today."}
        </span>
        <small>Live hours on this job: {hours.toFixed(1)}</small>
      </div>
      <JobCrewSchedule job={job} employees={employees} now={now} actor={actor} locked={fieldMode} />
      <p className="command-empty">Clock in on Active when the work starts. Photos live at the top with the mic.</p>
    </div>
  );
}

export function DocumentEditor({
  kind,
  job,
  customer,
  customers,
  estimate,
  invoice,
  actor,
  hideTalk = false,
  hidePaid = false,
}: {
  kind: "estimate" | "invoice";
  job: JobDTO;
  customer: CustomerDTO | null;
  customers: CustomerDTO[];
  estimate: EstimateDTO | null;
  invoice: InvoiceDTO | null;
  actor: string;
  hideTalk?: boolean;
  hidePaid?: boolean;
}) {
  const source = kind === "estimate" ? estimate : invoice;
  // The shop's own name and town (root layout), for the invoice terms and the mailed copy.
  const shop = useShopPlace();
  const defaultInvoiceTerms = invoiceTermsFor(shop.name);
  const [notes, setNotes] = useState(source?.notes || "");
  const [terms, setTerms] = useState(
    source?.terms || (kind === "estimate" ? DEFAULT_ESTIMATE_TERMS : defaultInvoiceTerms)
  );
  const [taxRate, setTaxRate] = useState(String(source?.taxRate ?? 0));
  const [dueDate, setDueDate] = useState(invoice?.dueDate || todayString());
  const [customerId, setCustomerId] = useState(customer?.id || invoice?.customerId || estimate?.customerId || "");
  const [lines, setLines] = useState<DocLineDraft[]>(
    source?.lines.length
      ? source.lines
      : kind === "invoice" && estimate?.lines.length
        ? estimate.lines
        : [blankLine("LABOR"), blankLine("MATERIAL")]
  );
  const [savedId, setSavedId] = useState(kind === "estimate" ? estimate?.id : invoice?.id);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // payInvoice toggles paid <-> reopened: a double tap must not mark paid then instantly reopen.
  const payingRef = useRef(false);
  const totals = useMemo(() => documentTotals(lines, Number(taxRate) || 0), [lines, taxRate]);
  const number = kind === "estimate" ? estimate?.number : invoice?.number;
  const client = customers.find((item) => item.id === customerId) || customer;

  useEffect(() => {
    const next = kind === "estimate" ? estimate : invoice;
    setNotes(next?.notes || "");
    setTerms(next?.terms || (kind === "estimate" ? DEFAULT_ESTIMATE_TERMS : defaultInvoiceTerms));
    setTaxRate(String(next?.taxRate ?? 0));
    setLines(
      next?.lines.length
        ? next.lines
        : kind === "invoice" && estimate?.lines.length
          ? estimate.lines
          : [blankLine("LABOR"), blankLine("MATERIAL")]
    );
    setSavedId(kind === "estimate" ? estimate?.id : invoice?.id);
  }, [kind, estimate, invoice]);

  function applyTalk(text: string) {
    const local = parseDocumentTalk(text);
    if (local.notes) setNotes((current) => current || local.notes || "");
    if (local.lines.length) setLines((current) => mergeEditableLines(current, local.lines));
    startTransition(async () => {
      try {
        const response = await fetch("/api/docs/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!response.ok) return;
        const draft = (await response.json()) as { notes?: string; lines?: DocLineDraft[] };
        if (draft.notes) setNotes((current) => current || draft.notes || "");
        if (draft.lines?.length) {
          setLines((current) => mergeEditableLines(current, draft.lines || []));
        }
      } catch {
        /* local parse already applied */
      }
    });
  }

  useTalkScope(
    hideTalk
      ? null
      : {
          id: `doc-${kind}-${job.id}`,
          label: kind === "invoice" ? "Invoice lines" : "Bid lines",
          dest: kind === "invoice" ? "Invoice lines" : "Bid lines",
          priority: 30,
          examples: ["Scrape and prime the fascia, 6 hours", "Two gallons Duration, 72 each"],
          parse: (text) => applyTalk(text.trim()),
        }
  );

  function save() {
    startTransition(async () => {
      try {
        if (kind === "estimate") {
          const packed = ensureScopeLines(lines);
          setLines(packed);
          const id = await saveEstimateOffline({
            jobId: job.id,
            customerId: customerId || null,
            notes,
            terms,
            taxRate: Number(taxRate) || 0,
            lines: packed,
            actor,
          });
          setSavedId(id);
          toast.success("Estimate saved.");
          if (browserOnline() && !isLocalId(id)) router.refresh();
        } else {
          if (!customerId) {
            toast.error("Pick a customer for the invoice.");
            return;
          }
          const id = await saveJobInvoice({
            invoiceId: invoice?.id,
            jobId: job.id,
            customerId,
            notes,
            terms,
            taxRate: Number(taxRate) || 0,
            dueDate,
            lines: ensureScopeLines(lines),
            actor,
          });
          setSavedId(id);
          toast.success("Invoice saved.");
          router.refresh();
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save.");
      }
    });
  }

  function exportDoc() {
    if (!savedId) {
      toast.error("Save first, then download.");
      return;
    }
    if (isLocalId(savedId)) {
      toast.error("This draft is still on the phone. It downloads after sync.");
      return;
    }
    window.open(`/api/export/document?kind=${kind}&id=${savedId}`, "_blank");
  }

  const official = useOfficialGate();

  function emailDoc() {
    if (!savedId) {
      toast.error("Save first, then send.");
      return;
    }
    if (kind === "estimate") {
      // First estimate: "Make it look official" over the estimate (asked once), then send.
      void official.gate(() => startTransition(async () => {
        try {
          const result = await sendEstimateOffline({
            estimateId: savedId,
            jobId: job.id,
            actor,
            origin: window.location.origin,
          });
          if (result.queued) {
            toast.success("On this phone. Sends when signal is back.");
            return;
          }
          const note = sendToast(result, "Sent.");
          if (note.kind === "message") toast.message(note.text);
          else toast.success(note.text);
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not send.");
        }
      }));
      return;
    }
    const to = client?.email;
    if (!to) {
      toast.error("Add the homeowner email on Customer first.");
      return;
    }
    const copy = invoiceMail({
      who: client?.name || "there",
      company: shop.name,
      place: shop.place,
      jobName: job.name,
      number: number || "",
      total: money(totals.total),
    });
    startTransition(async () => {
      try {
        await markDocumentSent({ kind, id: savedId, actor });
        window.open(`/api/export/document?kind=${kind}&id=${savedId}`, "_blank");
        window.location.href = mailtoHref(to, copy.subject, copy.body);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not send.");
      }
    });
  }

  return (
    <div className="doc-editor">

      {kind === "invoice" && !invoice?.lines.length && estimate?.lines.length ? (
        <p className="command-empty">Line items pulled from the estimate. Edit, then save.</p>
      ) : null}

      <label className="settings-field">
        Scope of work
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
      </label>

      {kind === "invoice" ? (
        <>
          <label className="settings-field">
            Customer
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Select</option>
              {customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            Due
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
        </>
      ) : (
        <label className="settings-field">
          Customer
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Same as job client</option>
            {customers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="card-label">Line items</p>
      {lines.map((line, index) => (
        <div key={`${line.id || "new"}-${index}`} className="line-row">
          <select
            value={line.kind}
            onChange={(event) =>
              setLines((current) =>
                current.map((item, i) =>
                  i === index ? { ...item, kind: event.target.value as DocLineDraft["kind"] } : item
                )
              )
            }
          >
            <option value="LABOR">Labor</option>
            <option value="MATERIAL">Material</option>
            <option value="OTHER">Other</option>
          </select>
          <input
            value={line.description}
            onChange={(event) =>
              setLines((current) =>
                current.map((item, i) => (i === index ? { ...item, description: event.target.value } : item))
              )
            }
          />
          <FreeNumberInput
            min={0}
            value={line.quantity}
            ariaLabel="Quantity"
            onValue={(next) =>
              setLines((current) => current.map((item, i) => (i === index ? { ...item, quantity: next } : item)))
            }
          />
          <input
            value={line.unit}
            onChange={(event) =>
              setLines((current) =>
                current.map((item, i) => (i === index ? { ...item, unit: event.target.value } : item))
              )
            }
            aria-label="Unit"
          />
          <FreeNumberInput
            min={0}
            value={line.rate}
            ariaLabel="Rate"
            onValue={(next) =>
              setLines((current) => current.map((item, i) => (i === index ? { ...item, rate: next } : item)))
            }
          />
          <b>{money(lineAmount(line))}</b>
          <button
            type="button"
            className="ghost-action remove slim"
            onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <div className="choice-row">
        <button type="button" onClick={() => setLines((current) => [...current, blankLine("LABOR")])}>
          Add labor
        </button>
        <button type="button" onClick={() => setLines((current) => [...current, blankLine("MATERIAL")])}>
          Add material
        </button>
      </div>

      <label className="settings-field">
        Tax %
        <input value={taxRate} onChange={(event) => setTaxRate(event.target.value)} />
      </label>
      <label className="settings-field">
        Payment terms
        <textarea value={terms} onChange={(event) => setTerms(event.target.value)} rows={2} />
      </label>

      <div className="doc-preview">
        <p className="card-label">{kind === "estimate" ? "Estimate" : "Invoice"} preview</p>
        <b>
          {number || (kind === "estimate" ? "EST-draft" : "INV-draft")} · {money(totals.total)}
        </b>
        {kind === "estimate" && estimate ? (
          <EstimateStatusBar
            number={estimate.number}
            status={estimate.status}
            viewedAt={estimate.viewedAt}
            signedName={estimate.signedName}
            clientNote={estimate.clientNote}
            followUpCount={estimate.followUpCount}
          />
        ) : null}
        <span>
          Labor {money(totals.labor)} · Materials {money(totals.materials)} · Tax {money(totals.tax)}
        </span>
        <small>
          {client?.name || job.client} · {client?.email || "no email yet"}
        </small>
      </div>

      <button type="button" className="lock-button lime" disabled={pending} onClick={save}>
        <span>
          <b>{kind === "estimate" ? "SAVE ESTIMATE" : "SAVE INVOICE"}</b>
        </span>
      </button>
      {kind === "estimate" && estimate?.id ? (
        <button
          type="button"
          className="ghost-action hours"
          disabled={pending || estimate.status === "ACCEPTED"}
          onClick={() =>
            startTransition(async () => {
              try {
                await acceptEstimate({ estimateId: estimate.id, actor });
                toast.success("Customer accepted the bid.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not mark accepted.");
              }
            })
          }
        >
          {estimate.status === "ACCEPTED" ? "Bid accepted" : "Customer accepted"}
        </button>
      ) : null}
      {kind === "invoice" && invoice?.id && !hidePaid ? (
        <button
          type="button"
          className={`ghost-action${invoice.status === "PAID" ? " hours" : ""}`}
          disabled={pending}
          onClick={() => {
            if (payingRef.current) return;
            payingRef.current = true;
            startTransition(async () => {
              try {
                await payInvoice({ invoiceId: invoice.id, actor });
                toast.success(invoice.status === "PAID" ? "Invoice reopened." : "Marked paid.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not update the invoice.");
              } finally {
                payingRef.current = false;
              }
            });
          }}
        >
          {invoice.status === "PAID" ? "Paid" : "Mark paid"}
        </button>
      ) : null}
      <div className="choice-row">
        <button type="button" className="ghost-action hours" disabled={!savedId} onClick={exportDoc}>
          Download PDF
        </button>
        <button
          type="button"
          className="ghost-action"
          disabled={!savedId || (kind === "invoice" ? !client?.email : !client?.email && !client?.phone)}
          onClick={emailDoc}
        >
          {kind === "estimate" ? "Send to client" : "Email client"}
        </button>
      </div>
      {!customer?.email && kind === "invoice" ? <p className="command-empty">Email is required before you can send this.</p> : null}
      {official.sheet}
    </div>
  );
}
