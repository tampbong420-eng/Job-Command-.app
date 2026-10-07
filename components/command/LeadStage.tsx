"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setJobPipeline } from "@/app/actions";
import { saveLeadOffline } from "@/lib/offline/actions";
import { DeckPane } from "@/components/command/DeckPane";
import { PhotoBar } from "@/components/command/TalkStrip";
import { useTalkScope } from "@/components/command/OneMic";
import { CoachCue, useCoachSpeak } from "@/components/command/StageCoach";
import { useStageDeckSwipe } from "@/components/command/StageFrame";
import { useJobPhotos } from "@/hooks/use-job-photos";
import { filledThrough, stageCoachTalk, type PipeFacts } from "@/lib/job-pipeline";
import { parseLeadTalk, type LeadFields } from "@/lib/lead-parse";
import type { CustomerDTO, EmployeeDTO, JobDTO, PayrollSettingsDTO } from "@/lib/types";
import type { JobStageKey } from "@/lib/page-theme";

export function LeadStage({
  job,
  customer,
  employees: _employees,
  now: _now,
  actor,
  settings: _settings,
  facts,
  onClose,
  onAdvance,
}: {
  job: JobDTO;
  customer: CustomerDTO | null;
  employees: EmployeeDTO[];
  now: Date;
  actor: string;
  settings: PayrollSettingsDTO;
  facts: PipeFacts;
  onClose: () => void;
  onAdvance?: (key: JobStageKey) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [, setParsing] = useState(false);
  const [clientName, setClientName] = useState(customer?.name || job.client);
  const [phone, setPhone] = useState(customer?.phone || "");
  const [address, setAddress] = useState(job.address || customer?.address || "");
  const [scope, setScope] = useState(job.notes || "");
  const [timeline, setTimeline] = useState(job.timeline || "");
  const [called, setCalled] = useState(Boolean(job.leadCalledAt));
  const photos = useJobPhotos(job, actor);
  const liveFacts: PipeFacts = {
    ...facts,
    phone: phone.trim(),
    leadCalled: called || facts.leadCalled,
    property: address.trim() || facts.property,
  };
  const filled = filledThrough(job.pipeline, liveFacts);
  const coach = stageCoachTalk(1, clientName.trim() || job.client || "this client", liveFacts, filled);
  useCoachSpeak(job.id, "lead", coach);

  function applyFields(next: LeadFields, mode: "empty" | "force") {
    const take = (current: string, value: string | null) => {
      if (!value) return current;
      if (mode === "force") return value;
      return current.trim() ? current : value;
    };
    setClientName((current) => take(current, next.clientName));
    setPhone((current) => take(current, next.phone));
    setAddress((current) => take(current, next.address));
    setScope((current) => take(current, next.scopeOfWork));
    setTimeline((current) => take(current, next.preferredTimeline));
  }

  async function parseNote(text: string, mode: "empty" | "force") {
    const cleaned = text.trim();
    if (!cleaned) return;
    applyFields(parseLeadTalk(cleaned), mode);
    setParsing(true);
    try {
      const response = await fetch("/api/leads/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleaned }),
      });
      if (!response.ok) return;
      const parsed = (await response.json()) as LeadFields;
      applyFields(parsed, mode);
    } catch {
      /* local parse already applied */
    } finally {
      setParsing(false);
    }
  }

  // The one floating mic: “Maya Lopez, 555 123 0100, repaint the porch” → one chip that fills the card.
  useTalkScope({
    id: `lead-${job.id}`,
    label: clientName.trim() || job.client || "New lead",
    dest: "Lead card",
    priority: 10,
    examples: ["Maya Lopez, 555 123 0100, 14 Oak St, repaint the porch", "Snap a photo of the house"],
    parse: (text) => void parseNote(text, "force"),
    snap: photos.snap,
    roll: photos.roll,
  });

  function logCall() {
    if (!phone.trim()) {
      toast.error("Add a phone first.");
      return;
    }
    // Log in the background — don't block the call if DB is down (Eric 2026-10-05).
    setCalled(true);
    startTransition(async () => {
      try {
        await setJobPipeline({ jobId: job.id, pipeline: Math.max(job.pipeline, 1), actor });
        toast.success("Call logged.");
      } catch {
        // DB hiccup: the call still went through, just couldn't log it.
      }
    });
  }

  function saveAndAdvance() {
    if (!clientName.trim()) {
      toast.error("Put a name on this lead.");
      return;
    }
    startTransition(async () => {
      try {
        await saveLeadOffline({
          jobId: job.id,
          clientName,
          phone,
          address,
          scopeOfWork: scope,
          timeline,
          actor,
          appointment: null,
        });
        toast.success("Lead saved.");
        if (phone.trim() && (called || facts.leadCalled)) {
          toast.success("Schedule Estimate is unlocked.");
          onAdvance?.("estimate");
        } else {
          toast.message(coach);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the lead.");
      }
    });
  }

  const swipe = useStageDeckSwipe({ stage: "lead", filled, onClose, onAdvance, enabled: !pending });
  const who = clientName.trim() || "New lead";
  const phoneHref = phone.trim() ? `tel:${phone.trim()}` : undefined;
  const callLogged = called || facts.leadCalled;
  const canCall = Boolean(phone.trim());

  return (
    <section className="lead-stage" data-stage="lead" data-stage-isolated="lead" {...swipe.bind}>
      <DeckPane axis="y">
        <div className="folder-top">
          <button type="button" className="ghost-action slim" onClick={onClose}>
            Back
          </button>
          <p className="card-label">{job.code}</p>
        </div>

        <CoachCue copy={coach} />

        <p className="lead-kicker">Step 1 of 6 · Call</p>
          <h1 className="lead-who client-name">{who}</h1>
        <a className={`lead-phone${phone.trim() ? "" : " miss"}`} href={phoneHref}>
          {phone.trim() || "No phone yet"}
        </a>
        <p className={`lead-site${address.trim() ? "" : " miss"}`}>{address.trim() || "No house yet"}</p>

        <button
          type="button"
          className={`lead-call${!callLogged && canCall ? " needs-action" : ""}`}
          onClick={() => {
            if (!phone.trim()) {
              toast.error("Add a phone first.");
              return;
            }
            logCall();
            if (phoneHref && phoneHref !== "#") {
              window.location.href = phoneHref;
            }
          }}
          disabled={!canCall}
          style={{
            display: 'block',
            width: '100%',
            minHeight: '72px',
            background: '#f97316',
            color: '#fff',
            fontSize: '18px',
            fontWeight: '800',
            border: '2px solid #fdba74',
            borderRadius: '12px',
            cursor: canCall ? 'pointer' : 'not-allowed',
            opacity: canCall ? 1 : 0.5,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {callLogged ? <>Called <span style={{ color: '#22c55e' }}>✓</span></> : "📞 Call"}
        </button>

        <label className="settings-field lead-field">
          Name
          <input value={clientName} onChange={(event) => setClientName(event.target.value)} autoComplete="name" />
        </label>
        <label className="settings-field lead-field">
          Phone
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
        <label className="settings-field lead-field">
          House
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            autoComplete="street-address"
          />
        </label>
        <label className="settings-field lead-field">
          What work
          <textarea
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            rows={3}
          />
        </label>
        <label className="settings-field lead-field">
          When
          <input
            value={timeline}
            onChange={(event) => setTimeline(event.target.value)}
          />
        </label>

        <button type="button" className={`lead-advance${callLogged ? " btn-next-action" : ""}`} onClick={saveAndAdvance} disabled={pending}>
          {pending
            ? "Saving…"
            : callLogged
              ? "Save lead"
              : "Save lead · tap Call first"}
        </button>
        <p className="lead-swipe-hint">Tap Call, then Save. Swipe up for the visit. Swipe down to go back.</p>
      </DeckPane>
    </section>
  );
}
