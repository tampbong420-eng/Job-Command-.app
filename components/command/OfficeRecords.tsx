"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Camera, Images } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/format";
import type { CustomerDTO, EstimateDTO, InvoiceDTO, JobDTO } from "@/lib/types";
import s from "./ProfileRecords.module.css";

type ReceiptShot = {
  id: string;
  url: string;
  note: string;
  takenAt: string;
};

function when(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const INVOICE_STATUS: Record<InvoiceDTO["status"], string> = {
  DRAFT: "Not sent",
  PENDING: "Owes",
  PAID: "Paid",
};

/**
 * Office › Records (boss/office only; CompanyDesk is never mounted on crew phones).
 * Moved here 2026-10-02 from the old Roster › Archive dropdowns — only the files with no other home:
 * Receipts (the only place to see them; ActiveStage's camera still files into here), the shop-wide customer
 * list, the shop-wide invoice list (who paid, who owes) and the shop-wide materials list.
 * Books → Office › Year-end books. Payroll → each person's profile. Jobs → Control + Archive.
 * Estimates and Photos → each job's folder.
 */
export function OfficeRecords({
  jobs,
  customers,
  invoices,
  estimates,
}: {
  jobs: JobDTO[];
  customers: CustomerDTO[];
  invoices: InvoiceDTO[];
  estimates: EstimateDTO[];
}) {
  const materials = useMemo(() => {
    const rows: { key: string; title: string; detail: string }[] = [];
    for (const estimate of estimates) {
      const job = jobs.find((item) => item.id === estimate.jobId);
      for (const line of estimate.lines.filter((item) => item.kind === "MATERIAL")) {
        rows.push({
          key: `e-${estimate.id}-${line.id}`,
          title: line.description || "Material",
          detail: `${estimate.number} · ${job?.client || "Job"} · ${line.quantity} ${line.unit} · ${money(line.amount || line.quantity * line.rate)}`,
        });
      }
    }
    for (const invoice of invoices) {
      for (const line of invoice.lines.filter((item) => item.kind === "MATERIAL")) {
        rows.push({
          key: `i-${invoice.id}-${line.id}`,
          title: line.description || "Material",
          detail: `${invoice.number} · ${invoice.customerName} · ${line.quantity} ${line.unit} · ${money(line.amount || line.quantity * line.rate)}`,
        });
      }
    }
    return rows;
  }, [estimates, invoices, jobs]);
  const [receipts, setReceipts] = useState<ReceiptShot[]>([]);
  const [saving, setSaving] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const rollRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let stop = false;
    void fetch("/api/receipts")
      .then((response) => response.json())
      .then((payload: { receipts?: ReceiptShot[] }) => {
        if (!stop) setReceipts(payload.receipts || []);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);

  async function fileReceipt(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/receipts", { method: "POST", body });
      const payload = (await response.json()) as ReceiptShot & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not file that receipt.");
      setReceipts((current) => [payload, ...current]);
      toast.success("Receipt filed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not file that receipt.");
    } finally {
      setSaving(false);
      if (camRef.current) camRef.current.value = "";
      if (rollRef.current) rollRef.current.value = "";
    }
  }

  return (
    <section className={`company-block ${s.section}`} data-office-records="1" aria-labelledby="office-records-h">
      <h2 className={s.head} id="office-records-h">
        Records
      </h2>
      <Drop title="Receipts" count={receipts.length}>
        <div className={s.pair}>
          <button type="button" className={s.btn} disabled={saving} onClick={() => camRef.current?.click()}>
            <Camera className="mr-2 inline size-5" aria-hidden="true" />
            {saving ? "Filing…" : "Camera"}
          </button>
          <button type="button" className={`${s.btn} ${s.ghost}`} disabled={saving} onClick={() => rollRef.current?.click()}>
            <Images className="mr-2 inline size-5" aria-hidden="true" />
            Camera roll
          </button>
        </div>
        <input ref={camRef} className={s.hiddenFile} type="file" accept="image/*" capture="environment" onChange={(event) => void fileReceipt(event.target.files)} />
        <input ref={rollRef} className={s.hiddenFile} type="file" accept="image/*" onChange={(event) => void fileReceipt(event.target.files)} />
        {receipts.length ? (
          <div className={s.photos}>
            {receipts.map((receipt) => (
              <figure key={receipt.id}>
                <img src={receipt.url} alt="" />
                <figcaption>
                  {receipt.note} · {when(receipt.takenAt)}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className={s.empty}>Snap a receipt and it files itself here.</p>
        )}
      </Drop>
      <Drop title="Customers" count={customers.length}>
        {customers.length ? (
          customers.map((customer) => (
            <Row
              key={customer.id}
              title={customer.name}
              detail={[customer.phone, customer.email, customer.address].filter(Boolean).join(" · ") || "No contact yet"}
            />
          ))
        ) : (
          <p className={s.empty}>No customers yet.</p>
        )}
      </Drop>
      <Drop title="Invoices" count={invoices.length}>
        {invoices.length ? (
          invoices.map((invoice) => (
            <Row
              key={invoice.id}
              title={`${invoice.number} · ${invoice.customerName}`}
              detail={[
                INVOICE_STATUS[invoice.status] || invoice.status,
                money(invoice.amount),
                invoice.jobName,
                when(invoice.paidAt || invoice.sentAt || invoice.dueDate),
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))
        ) : (
          <p className={s.empty}>No invoices yet.</p>
        )}
      </Drop>
      <Drop title="Materials" count={materials.length}>
        {materials.length ? (
          materials.map((row) => <Row key={row.key} title={row.title} detail={row.detail} />)
        ) : (
          <p className={s.empty}>No material lines yet.</p>
        )}
      </Drop>
    </section>
  );
}

function Drop({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <details className={s.drop} data-record={title.toLowerCase()}>
      <summary>
        {title}
        <span>{count}</span>
      </summary>
      <div className={s.dropBody}>{children}</div>
    </details>
  );
}

function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <p className={s.row} style={{ margin: 0 }}>
      <b>{title}</b>
      <span>{detail}</span>
    </p>
  );
}
