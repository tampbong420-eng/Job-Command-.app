"use client";

import { sendToast } from "@/lib/delivery-honest";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { payInvoice, saveJobInvoice, sendInvoice, setJobPipeline } from "@/app/actions";
import { StageFrame } from "@/components/command/StageFrame";
import { FreeNumberInput } from "@/components/command/FreeNumberInput";
import { parseDocumentTalk } from "@/lib/document-parse";
import {
  blankLine,
  documentTotals,
  ensureScopeLines,
  lineAmount,
  type DocLineDraft,
} from "@/lib/documents";
import { mergeEditableLines } from "@/lib/estimate-merge";
import { money } from "@/lib/format";
import { compileInvoiceLines } from "@/lib/invoice-compile";
import { splitInvoicePayment } from "@/lib/invoice-split";
import { invoiceTone, jobInvoiceToWorkOn, shortMoney, type PipeFacts } from "@/lib/job-pipeline";
import { todayString } from "@/lib/dates";
import type { JobStageKey } from "@/lib/page-theme";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, InvoiceDTO, JobDTO } from "@/lib/types";

export function InvoiceStage({
  job,
  customer,
  customers,
  estimate,
  invoices,
  employees,
  facts,
  actor,
  onClose,
  onAdvance,
}: {
  job: JobDTO;
  customer: CustomerDTO | null;
  customers: CustomerDTO[];
  estimate: EstimateDTO | null;
  invoices: InvoiceDTO[];
  employees: EmployeeDTO[];
  facts: PipeFacts;
  actor: string;
  onClose: () => void;
  onAdvance?: (key: JobStageKey) => void;
}) {
  // A paid deposit must not hide an open balance invoice (audit bug 5).
  const invoice = jobInvoiceToWorkOn(invoices, job.id);
  const partial = facts.pay?.state === "partial" ? facts.pay : null;
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [, startTransition] = useTransition();
  // sendInvoice delivers a real message and payInvoice toggles: never run either twice.
  const sendingRef = useRef(false);
  const payingRef = useRef(false);
  const who = customer?.name || job.client;
  const paid = invoice?.status === "PAID" && !partial;
  const sent = Boolean(facts.invoiceSent || invoice?.sentAt);
  const locked = sent || paid;
  const tone = invoiceTone({ invoiceSent: sent, paid });
  const compiled = useMemo(
    () => compileInvoiceLines({ estimate, employees, jobId: job.id }),
    [estimate, employees, job.id]
  );
  const [notes, setNotes] = useState(invoice?.notes || estimate?.notes || job.notes || "");
  const [terms, setTerms] = useState(invoice?.terms || "Payment due upon completion. Net 15.");
  const [taxRate, setTaxRate] = useState(String(invoice?.taxRate ?? estimate?.taxRate ?? 0));
  const [dueDate, setDueDate] = useState(invoice?.dueDate || todayString());
  const [customerId, setCustomerId] = useState(customer?.id || invoice?.customerId || estimate?.customerId || "");
  const [lines, setLines] = useState<DocLineDraft[]>(
    invoice?.lines.length ? invoice.lines : compiled
  );
  const [savedId, setSavedId] = useState(invoice?.id);
  const [payUrl, setPayUrl] = useState(invoice?.payUrl || "");
  const totals = useMemo(() => documentTotals(lines, Number(taxRate) || 0), [lines, taxRate]);
  const split = splitInvoicePayment(totals.total);

  useEffect(() => {
    setNotes(invoice?.notes || estimate?.notes || job.notes || "");
    setTerms(invoice?.terms || "Payment due upon completion. Net 15.");
    setTaxRate(String(invoice?.taxRate ?? estimate?.taxRate ?? 0));
    setDueDate(invoice?.dueDate || todayString());
    setCustomerId(customer?.id || invoice?.customerId || estimate?.customerId || "");
    setLines(invoice?.lines.length ? invoice.lines : compiled);
    setSavedId(invoice?.id);
    setPayUrl(invoice?.payUrl || "");
  }, [invoice, estimate, compiled, customer, job.notes]);

  async function persist() {
    if (!customerId) throw new Error("Pick a customer for the invoice.");
    const packed = ensureScopeLines(lines);
    setLines(packed);
    const id = await saveJobInvoice({
      invoiceId: savedId || invoice?.id,
      jobId: job.id,
      customerId,
      notes,
      terms,
      taxRate: Number(taxRate) || 0,
      dueDate,
      lines: packed,
      actor,
    });
    if (!id) throw new Error("Could not save the invoice.");
    setSavedId(id);
    return id;
  }

  function hearInvoice(text: string) {
    if (locked) {
      toast.error("Invoice is already out. I won't change the lines after send.");
      return;
    }
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
        if (draft.lines?.length) setLines((current) => mergeEditableLines(current, draft.lines || []));
      } catch {
        /* local parse already applied */
      }
    });
  }

  function save() {
    startTransition(async () => {
      try {
        await persist();
        toast.success("Invoice saved. Lines stay editable until you send the pay link.");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save.");
      }
    });
  }

  function sendPayLink() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    startTransition(async () => {
      try {
        const id = await persist();
        const result = await sendInvoice({
          invoiceId: id,
          actor,
          origin: window.location.origin,
        });
        if (!result) throw new Error("Could not send.");
        setPayUrl(result.url);
        try {
          await navigator.clipboard.writeText(result.url);
        } catch {
          /* clipboard is best-effort */
        }
        // Go-public B4: never "sent" when email/text aren't connected.
        const note = sendToast(
          result,
          result.mock
            ? "Invoice sent. Card payments aren\u2019t set up yet, so your client sees your phone and email to pay. Record cash or check here when it comes in."
            : "Sent the card link. Dark green goes solid when they pay."
        );
        if (note.kind === "message") toast.message(note.text);
        else toast.success(note.text);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not send the pay link.");
      } finally {
        sendingRef.current = false;
      }
    });
  }

  function markPaid() {
    if (payingRef.current) return;
    payingRef.current = true;
    startTransition(async () => {
      try {
        if (invoice?.id && invoice.status !== "PAID") {
          await payInvoice({ invoiceId: invoice.id, actor });
        }
        await setJobPipeline({ jobId: job.id, pipeline: 5, actor });
        toast.success("Paid. Complete / Archived unlocks on Command.");
        setConfirm(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not mark paid.");
      } finally {
        payingRef.current = false;
      }
    });
  }

  return (
    <StageFrame
      job={job}
      stage="invoice"
      facts={facts}
      kicker="Step 5 of 6 · Pay"
      who={who}
      actor={actor}
      onClose={onClose}
      onAdvance={onAdvance}
      onHeard={locked ? undefined : hearInvoice}
    >
      <div className={`invoice-board ${tone}`} data-dark-green="1" data-invoice-tone={tone} data-stage-form="invoice">
        <p className={`invoice-pay-banner ${tone}`}>
          {paid
            ? "Paid. Dark green is solid. Archive is unlocked."
            : sent
              ? "Sent. Dark green stays see-through until the card payment lands."
              : "Draft. I'll compile labor and materials — edit anything, then send the pay link."}
        </p>
        {partial ? (
          <p className="pipe-copy" data-pay-partial="1">
            Paid so far {shortMoney(partial.paidSoFar)} · {shortMoney(partial.owed)} still owed on this job.
          </p>
        ) : null}
        <p className="pipe-copy">
          {invoice
            ? `${invoice.number} · ${sent ? "sent" : "draft"} · ${paid ? "paid" : "open"} · ${money(totals.total)}.`
            : `No invoice yet. Labor hours and materials from this job are on the lines below.`}
        </p>
        <label className="settings-field">
          Scope of work
          <textarea value={notes} disabled={locked} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>
        <label className="settings-field">
          Customer
          <select value={customerId} disabled={locked} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Select</option>
            {customers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <p className="card-label">Line items</p>
        {lines.map((line, index) => (
          <div key={`${line.id || "new"}-${index}`} className="line-row">
            <select
              value={line.kind}
              disabled={locked}
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
              disabled={locked}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item, i) => (i === index ? { ...item, description: event.target.value } : item))
                )
              }
            />
            <FreeNumberInput
              min={0}
              value={line.quantity}
              disabled={locked}
              ariaLabel="Quantity"
              onValue={(next) =>
                setLines((current) => current.map((item, i) => (i === index ? { ...item, quantity: next } : item)))
              }
            />
            <input
              value={line.unit}
              disabled={locked}
              aria-label="Unit"
              onChange={(event) =>
                setLines((current) =>
                  current.map((item, i) => (i === index ? { ...item, unit: event.target.value } : item))
                )
              }
            />
            <FreeNumberInput
              min={0}
              value={line.rate}
              disabled={locked}
              ariaLabel="Rate"
              onValue={(next) =>
                setLines((current) => current.map((item, i) => (i === index ? { ...item, rate: next } : item)))
              }
            />
            <b>{money(lineAmount(line))}</b>
            {locked ? <span /> : (
              <button
                type="button"
                className="ghost-action remove slim"
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {locked ? null : (
          <div className="choice-row">
            <button type="button" onClick={() => setLines((current) => [...current, blankLine("LABOR")])}>
              Add labor
            </button>
            <button type="button" onClick={() => setLines((current) => [...current, blankLine("MATERIAL")])}>
              Add material
            </button>
          </div>
        )}
        <label className="settings-field">
          Tax %
          <input value={taxRate} disabled={locked} onChange={(event) => setTaxRate(event.target.value)} />
        </label>
        <label className="settings-field">
          Payment terms
          <textarea value={terms} disabled={locked} onChange={(event) => setTerms(event.target.value)} rows={2} />
        </label>
        <div className="doc-preview">
          <p className="card-label">Invoice preview</p>
          <b>
            {invoice?.number || "INV-draft"} · {money(totals.total)}
          </b>
          <span>
            Labor {money(totals.labor)} · Materials {money(totals.materials)} · Tax {money(totals.tax)}
          </span>
          <small>
            jobcommand.app fee 1% · {money(split.feeDollars)}. Shop keeps {money(split.contractorDollars)}.
          </small>
          {payUrl ? (
            <small>
              Pay link: {payUrl}
            </small>
          ) : null}
        </div>
        {locked ? null : (
          <button type="button" className={`lock-button lime${savedId ? " btn-settled" : ""}`} onClick={save}>
            <span>
              <b>SAVE INVOICE</b>
            </span>
          </button>
        )}
        {paid ? (
          <>
            <button type="button" className="lead-advance invoice btn-settled">
              Paid
            </button>
            <p className="pipe-copy">Payment cleared. Swipe back to Command when you want to close the file.</p>
          </>
        ) : sent ? (
          <>
            <button type="button" className="lead-advance invoice btn-settled" onClick={sendPayLink}>
              Pay link sent
            </button>
            {confirm ? (
              <PayConfirm onConfirm={markPaid} onCancel={() => setConfirm(false)} />
            ) : (
              <button type="button" className="ghost-action hours" onClick={() => setConfirm(true)}>
                Mark cash / check paid
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className="lead-advance invoice btn-next-action"
            onClick={sendPayLink}
            disabled={!customerId || totals.total <= 0}
          >
            Send pay link
          </button>
        )}
      </div>
      <p className="lead-swipe-hint">This is pay. Swipe up when they paid. Swipe down to go back.</p>
    </StageFrame>
  );
}

function PayConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const startX = useRef(0);
  const [x, setX] = useState(0);

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    startX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setX(Math.max(0, Math.min(168, event.clientX - startX.current)));
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const dx = Math.max(0, Math.min(168, event.clientX - startX.current));
    if (dx > 120) onConfirm();
    else setX(0);
  }

  return (
    <div className="pay-confirm" data-no-swipe data-stage-form="invoice-pay">
      <p className="card-label">Confirm payment</p>
      <div className="pay-track">
        <button
          type="button"
          className="pay-knob"
          style={{ transform: `translateX(${x}px)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-label="Swipe to confirm payment"
        >
          Paid
        </button>
        <span>Swipe to clear a cash payment</span>
      </div>
      <button type="button" className="ghost-action slim" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
