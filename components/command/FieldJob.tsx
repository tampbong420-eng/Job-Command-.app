"use client";

import { Navigation } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DeckPane } from "@/components/command/DeckPane";
import { PhotoBar } from "@/components/command/TalkStrip";
import { useTalkScope } from "@/components/command/OneMic";
import { ContactStrip } from "@/components/command/ContactStrip";
import { CostCue } from "@/components/command/CostCue";
import { EstimateSend } from "@/components/command/EstimateSend";
import { navigateUrl, shopAddress } from "@/lib/maps";
import { useSwipeNav } from "@/hooks/use-swipe-nav";
import { saveEstimateOffline, saveJobNoteOffline } from "@/lib/offline/actions";
import { isLocalId } from "@/lib/offline/idb";
import { browserOnline } from "@/lib/offline/net";
import {
  DEFAULT_ESTIMATE_TERMS,
  documentTotals,
  ensureScopeLines,
  isPricedLine,
  lineAmount,
  type DocLineDraft,
} from "@/lib/documents";
import { money } from "@/lib/format";
import { type PhotoMeasure } from "@/lib/photo-estimate";
import { mergeMeasures, mergeNotes, mergeTalkLines, type SiteTalkDraft } from "@/lib/site-talk";
import { parseDocumentTalk } from "@/lib/document-parse";
import { useJobPhotos } from "@/hooks/use-job-photos";
import { draftFromPhotos, persistPhotoDraft } from "@/lib/photo-link";
import type {
  CustomerDTO,
  EmployeeDTO,
  EstimateDTO,
  JobDTO,
  PayrollSettingsDTO,
} from "@/lib/types";

export function FieldJob({
  job,
  employee,
  customer,
  estimate,
  settings,
  actor,
  onClose,
}: {
  job: JobDTO;
  employee: EmployeeDTO;
  customer: CustomerDTO | null;
  estimate: EstimateDTO | null;
  settings: PayrollSettingsDTO;
  actor: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const photos = useJobPhotos(job, actor);
  const [, setParsing] = useState(false);
  const [measures, setMeasures] = useState<PhotoMeasure[]>([]);
  const [scope, setScope] = useState(estimate?.notes || job.notes || "");
  const [lines, setLines] = useState<DocLineDraft[]>((estimate?.lines || []).filter(isPricedLine));
  const email = customer?.email || "";
  const phone = customer?.phone || "";
  const [savedId, setSavedId] = useState(
    estimate?.id && estimate.lines.some(isPricedLine) ? estimate.id : ""
  );

  function applyVoice(draft: SiteTalkDraft) {
    const notes = mergeNotes(scope, draft.notes);
    const nextLines = mergeTalkLines(lines, draft.lines);
    setScope(notes);
    setLines(nextLines);
    setMeasures((current) => mergeMeasures(current, draft.measurements));
    void saveJobNoteOffline({ jobId: job.id, notes, actor });
    if (nextLines.some(isPricedLine)) {
      void saveEstimateOffline({
      jobId: job.id,
      customerId: customer?.id || null,
      customer: {
        id: customer?.id,
        name: customer?.name || job.client,
        email: email.trim(),
        phone: phone.trim(),
        address: job.address,
      },
      notes,
      terms: estimate?.terms || DEFAULT_ESTIMATE_TERMS,
      taxRate: estimate?.taxRate || 0,
      lines: nextLines,
      actor,
    }).then((id) => {
      if (id) setSavedId(id);
    });
    }
  }

  function applyTalk(text: string, silent = false) {
    const cleaned = text.trim();
    if (!cleaned) {
      if (!silent) toast.error("Say it or type it first — I’ll take it from there.");
      return;
    }
    const local = parseDocumentTalk(cleaned);
    applyVoice({
      transcript: cleaned,
      notes: local.notes || "",
      measurements: [],
      requests: [],
      lines: local.lines,
    });
    if (!silent && local.lines.length) {
      toast.success(`Got it — ${local.lines.length} line${local.lines.length === 1 ? "" : "s"} on the bid.`);
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
        applyVoice({
          transcript: cleaned,
          notes: draft.notes || local.notes || "",
          measurements: [],
          requests: [],
          lines: draft.lines || local.lines,
        });
      })
      .catch(() => undefined)
      .finally(() => setParsing(false));
  }

  // The one floating mic: what they say in the driveway becomes one “write the bid” chip.
  useTalkScope({
    id: `field-${job.id}`,
    label: customer?.name || job.client || "This job",
    dest: "The bid",
    priority: 20,
    examples: ["Two story, 2400 square feet, scrape and prime the fascia", "Snap a photo of the front"],
    parse: (text) => applyTalk(text),
    snap: photos.snap,
    roll: photos.roll,
  });

  useEffect(() => {
    if (lines.some(isPricedLine)) return;
    const fromEstimate = (estimate?.lines || []).filter(isPricedLine);
    if (fromEstimate.length) setLines(fromEstimate);
  }, [estimate]);

  useEffect(() => {
    function onLinked(event: Event) {
      const jobId = (event as CustomEvent<{ jobId: string }>).detail?.jobId;
      if (jobId === job.id) router.refresh();
    }
    window.addEventListener("job-command-photo-linked", onLinked);
    return () => window.removeEventListener("job-command-photo-linked", onLinked);
  }, [job.id, router]);

  const totals = documentTotals(lines, 0);
  const priced = lines.some(isPricedLine);
  const who = customer?.name || job.client;
  const shop = shopAddress(settings.businessAddress);
  const swipe = useSwipeNav(onClose, () => saveDraft(), { enabled: false, threshold: 72, shell: true });

  async function linkPhotos(shotList = photos.photos) {
    const draft = await draftFromPhotos({
      job,
      estimate,
      notes: scope,
      lines,
      photos: shotList,
    });
    if (!draft) return;
    setScope(draft.notes);
    setMeasures((current) => mergeMeasures(current, draft.measurements));
    setLines(draft.lines);
    const id = await persistPhotoDraft({ job, customer, estimate, actor, draft });
    if (id) setSavedId(id);
  }

  async function onFiles(list: FileList | null) {
    try {
      const next = await photos.ingest(list);
      if (!next.length) return;
      await linkPhotos(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t save that photo.");
    }
  }

  async function persist() {
    const packed = ensureScopeLines(lines);
    setLines(packed);
    const id = await saveEstimateOffline({
      jobId: job.id,
      customerId: customer?.id || null,
      customer: {
        id: customer?.id,
        name: who,
        email: email.trim(),
        phone: phone.trim(),
        address: job.address,
      },
      notes: scope,
      terms: estimate?.terms || DEFAULT_ESTIMATE_TERMS,
      taxRate: estimate?.taxRate || 0,
      lines: packed,
      actor,
    });
    setSavedId(id);
    return id;
  }

  function saveDraft() {
    if (!priced) {
      toast.error("Talk the job or snap the property first so the bid can fill.");
      return;
    }
    startTransition(async () => {
      try {
        const id = await persist();
        toast.success(
          isLocalId(id) || !browserOnline()
            ? "Draft on this phone. Syncs when signal is back."
            : "Draft estimate saved on the job."
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the draft.");
      }
    });
  }

  return (
    <section className="lead-stage field-job" data-stage="field" {...swipe.bind}>
      <DeckPane>
        <div className="folder-top">
          <button type="button" className="ghost-action slim" onClick={onClose}>
            Back
          </button>
          <p className="card-label">
            {job.code} · {employee.firstName}
          </p>
        </div>

        <PhotoBar
          photos={photos.photos}
          busy={photos.busy}
          onSnap={photos.snap}
          onRoll={photos.roll}
          onRemove={(id) =>
            void photos.remove(id).catch(() => toast.error("Couldn’t pull that photo."))
          }
          camRef={photos.camRef}
          rollRef={photos.rollRef}
          onFiles={(list) => void onFiles(list)}
        />

        <p className="est-kicker">On site</p>
        <h1 className="lead-who client-name">{who}</h1>
        <p className={`lead-site${job.address ? "" : " miss"}`}>{job.address || "No property on the card"}</p>
        <ContactStrip phone={phone} email={email} who={who} />
        {job.address ? (
          <a className="job-nav" href={navigateUrl(job.address, shop)} target="_blank" rel="noreferrer">
            <Navigation className="size-5" />
            Navigate
          </a>
        ) : null}
        <CostCue cost={job.cost} />

        {measures.length ? (
          <ul className="field-measures">
            {measures.map((item) => (
              <li key={item.label}>
                <small>{item.label}</small>
                <b>{item.value}</b>
              </li>
            ))}
          </ul>
        ) : null}

        <label className="settings-field lead-field">
          Scope of work
          <textarea value={scope} onChange={(event) => setScope(event.target.value)} rows={3} />
        </label>

        <p className="card-label">Itemized estimate</p>
        {priced ? (
          <ul className="est-sheet-lines">
            {lines.filter(isPricedLine).map((line, index) => (
              <li key={`${line.description}-${index}`}>
                <span>
                  {line.kind} · {line.description}
                </span>
                <b>
                  {line.quantity} {line.unit} × {money(line.rate)} = {money(lineAmount(line))}
                </b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="map-empty">Talk, type, or snap — I’ll put labor, material, and protection on the bid.</p>
        )}
        {priced ? <p className="field-total">Total {money(totals.total)}</p> : null}

        <button type="button" className="lead-advance btn-next-action" onClick={saveDraft} disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </button>
        <EstimateSend persist={persist} email={email} phone={phone} actor={actor} estimate={estimate} disabled={!priced} jobId={job.id} />
        {savedId && priced && !isLocalId(savedId) ? (
          <button
            type="button"
            className="ghost-action slim"
            onClick={() => window.open(`/api/export/document?kind=estimate&id=${savedId}`, "_blank")}
          >
            Download PDF
          </button>
        ) : null}
        <p className="lead-swipe-hint">Send from the driveway. They get a phone link to review and sign. Swipe right to go back to today’s route.</p>
      </DeckPane>
    </section>
  );
}
