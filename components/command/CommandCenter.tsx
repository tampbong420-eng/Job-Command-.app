"use client";

import { startTransition, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createJob, deleteJob } from "@/app/actions";
import { AppointmentNotice } from "@/components/command/AppointmentNotice";
import { ClientPick } from "@/components/command/ClientPick";
import { ThemeToggleButton } from "@/components/command/ThemeToggleButton";
import { JobTumbler, sortJobDeck } from "@/components/command/JobCard";
import { SwipeHint } from "@/components/command/SwipeHint";
import { useSwipeFlash } from "@/components/command/SwipeFlash";
import { swipeFlashLabel } from "@/lib/swipe-flash";
import { useSwipeNav } from "@/hooks/use-swipe-nav";
import type { JobStageKey } from "@/lib/page-theme";
import jobsHead from "@/components/command/JobsHeader.module.css";
import type {
  CustomerDTO,
  EmployeeDTO,
  EstimateDTO,
  InvoiceDTO,
  JobDTO,
  PayrollSettingsDTO,
} from "@/lib/types";

export function CommandCenter({
  employees,
  jobs,
  customers,
  invoices,
  estimates,
  settings,
  now,
  actor,
  onOpenStage,
  canCreateJob = true,
  guideReady = false,
  guideOn = false,
  onGuide,
  onDeckJob,
}: {
  employees: EmployeeDTO[];
  jobs: JobDTO[];
  customers: CustomerDTO[];
  invoices: InvoiceDTO[];
  estimates: EstimateDTO[];
  settings: PayrollSettingsDTO;
  selected?: EmployeeDTO;
  now: Date;
  actor: string;
  canCreateJob?: boolean;
  onOpenStage: (jobId: string, key: JobStageKey) => void;
  guideReady?: boolean;
  guideOn?: boolean;
  onGuide?: () => void;
  onDeckJob?: (jobId: string | null) => void;
  onOpenSchedule?: (employeeId: string) => void;
  onOpenPay?: (employeeId: string) => void;
}) {
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tumblerIndex, setTumblerIndex] = useState(0);
  const deck = useMemo(
    () => sortJobDeck(jobs, customers, estimates, invoices, employees, now),
    [jobs, customers, estimates, invoices, employees, now]
  );
  const safe = deck.length ? ((tumblerIndex % deck.length) + deck.length) % deck.length : 0;
  const currentJob = deck[safe];
  useEffect(() => {
    onDeckJob?.(currentJob?.id ?? null);
  }, [currentJob?.id, onDeckJob]);
  const swipeFlash = useSwipeFlash();
  const prevJob = () =>
    deck.length > 1 &&
    (swipeFlash.flash(swipeFlashLabel("job", -1)), true) &&
    setTumblerIndex((current) => {
      const n = deck.length;
      const at = ((current % n) + n) % n;
      return (at - 1 + n) % n;
    });
  const nextJob = () =>
    deck.length > 1 &&
    (swipeFlash.flash(swipeFlashLabel("job", 1)), true) &&
    setTumblerIndex((current) => {
      const n = deck.length;
      const at = ((current % n) + n) % n;
      return (at + 1) % n;
    });
  const swipe = useSwipeNav(prevJob, nextJob, {
    enabled: deck.length > 1 && !dialog,
    shell: true,
  });

  return (
    <section className="command-cap command-rolodex" {...swipe.bind}>
      <div className="command-mast jobs-mast" data-jobs-logo="1">
        <div className={jobsHead.lock}>
          {/* Company logo (white-label): uses uploaded logo if set, else the default shield. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- brand image, already sized */}
          <img
            className={jobsHead.shield}
            src={settings.logoUrl || "/brand/jc-shield@2x.png"}
            alt={settings.businessName || "jobcommand.app"}
            width={120}
            height={119}
            decoding="async"
            draggable={false}
          />
          <h1>Jobs</h1>
          {editing && canCreateJob ? (
            <label className="logo-upload-btn">
              Upload logo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={async (e) => {
                  const file = e.currentTarget.files?.[0];
                  if (!file) return;
                  const form = new FormData();
                  form.append("file", file);
                  try {
                    const res = await fetch("/api/upload/logo", { method: "POST", body: form });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Upload failed.");
                    const { updateCompanyLogo } = await import("@/app/actions");
                    await updateCompanyLogo({ logoUrl: data.logoUrl });
                    toast.success("Logo updated.");
                    window.location.reload();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not upload logo.");
                  }
                }}
              />
            </label>
          ) : null}
        </div>
      </div>
      {/* Job arrows now live inside each job card, right above the pipeline stages (Eric, 2026-10-03). */}
      {swipeFlash.node}
      <AppointmentNotice jobs={jobs} employees={employees} bare />

      <JobTumbler
        jobs={deck}
        index={safe}
        customers={customers}
        estimates={estimates}
        invoices={invoices}
        employees={employees}
        now={now}
        actor={actor}
        editing={editing && canCreateJob}
        onIndex={setTumblerIndex}
        onOpenStage={onOpenStage}
        shop={settings.businessAddress}
        guideReady={guideReady}
        guideOn={guideOn}
        onGuide={onGuide}
        showNav={false}
      />
      {deck.length ? <SwipeHint /> : null}

      {canCreateJob ? (
        <div className="jobs-bottom-actions">
          <div className="edit-theme-stack">
            <button
              type="button"
              className="ghost-action"
              aria-pressed={editing}
              onClick={() => setEditing((on) => !on)}
            >
              {editing ? "Done" : "Edit"}
            </button>
            <ThemeToggleButton />
          </div>
          <div className="edit-theme-stack">
            <button type="button" className="ghost-action" onClick={() => setDialog(true)}>
              New job
            </button>
            <button
              type="button"
              className="ghost-action"
              disabled={!currentJob}
              onClick={() => {
                if (!currentJob) return;
                if (window.confirm("Are you sure you want to perform this action cause it can't be undone")) {
                  startTransition(async () => {
                    try {
                      await deleteJob({ jobId: currentJob.id, actor });
                      toast.success("Job erased.");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not erase job.");
                    }
                  });
                }
              }}
            >
              Erase job
            </button>
          </div>
        </div>
      ) : null}

      {canCreateJob ? (
        <JobDialog
          open={dialog}
          actor={actor}
          customers={customers}
          jobs={jobs}
          estimates={estimates}
          onClose={() => setDialog(false)}
        />
      ) : null}
    </section>
  );
}

function JobDialog({
  open,
  actor,
  customers,
  jobs,
  estimates,
  onClose,
}: {
  open: boolean;
  actor: string;
  customers: CustomerDTO[];
  jobs: JobDTO[];
  estimates: EstimateDTO[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [client, setClient] = useState("");
  const [address, setAddress] = useState("");
  const [customerId, setCustomerId] = useState<string | undefined>();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setClient("");
          setAddress("");
          setCustomerId(undefined);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New job</DialogTitle>
        </DialogHeader>
        <form
          className="add-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(async () => {
              try {
                await createJob({
                  name: String(data.get("name")),
                  client,
                  address,
                  dueDate: String(data.get("dueDate") || "") || undefined,
                  actor,
                  customerId,
                });
                toast.success("Job is on the list.");
                setClient("");
                setAddress("");
                setCustomerId(undefined);
                onClose();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not add job.");
              }
            });
          }}
        >
          <label className="settings-field">
            Job name
            <input name="name" required autoFocus />
          </label>
          <ClientPick
            customers={customers}
            jobs={jobs}
            estimates={estimates}
            name={client}
            customerId={customerId}
            disabled={pending}
            onPick={(next) => {
              setClient(next.name);
              setCustomerId(next.customerId);
              if (next.customerId || next.address) setAddress(next.address);
            }}
          />
          <label className="settings-field">
            Address
            <input
              name="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          <label className="settings-field">
            Due date
            <input name="dueDate" type="date" />
          </label>
          <button type="submit" disabled={pending}>
            Save job
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
