"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Camera, Images } from "lucide-react";
import { toast } from "sonner";
import { DeckPane } from "@/components/command/DeckPane";
import { PhotoStrip } from "@/components/command/PhotoStrip";
import { useJobPhotos } from "@/hooks/use-job-photos";
import { usePackedSlot } from "@/hooks/use-packed-slot";
import { draftFromPhotos, persistPhotoDraft } from "@/lib/photo-link";
import { formatDay, todayString } from "@/lib/dates";
import { fillEditableNotes, mergeEditableLines } from "@/lib/estimate-merge";
import {
  BRAND,
  DEFAULT_ESTIMATE_TERMS,
  blankLine,
  documentTotals,
  ensureScopeLines,
  estimateIsReady,
  lineAmount,
  type DocLineDraft,
} from "@/lib/documents";
import { money } from "@/lib/format";
import { checkCrewSlot, formatTimeLabel, hoursBetween } from "@/lib/schedule";
import { EstimateSend } from "@/components/command/EstimateSend";
import { FreeNumberInput } from "@/components/command/FreeNumberInput";
import { useCoachSpeak } from "@/components/command/StageCoach";
import { useStageDeckSwipe } from "@/components/command/StageFrame";
import { BrandMark } from "@/components/command/BrandLockup";
import { shopBrand } from "@/lib/shop-brand";
import { navigateUrl, shopAddress, streetViewEmbedUrl } from "@/lib/maps";
import { saveEstimateOffline, upsertHoursOffline } from "@/lib/offline/actions";
import { isLocalId } from "@/lib/offline/idb";
import { filledThrough, stageCoachTalk, type PipeFacts } from "@/lib/job-pipeline";
import { setJobPipeline } from "@/app/actions";
import type { JobStageKey } from "@/lib/page-theme";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, JobDTO, PayrollSettingsDTO } from "@/lib/types";

export function EstimateStage({
  job,
  customer,
  estimate,
  employees,
  settings,
  now,
  actor,
  facts,
  onClose,
  onAdvance,
  onScheduleTime,
}: {
  job: JobDTO;
  customer: CustomerDTO | null;
  estimate: EstimateDTO | null;
  employees: EmployeeDTO[];
  settings: PayrollSettingsDTO;
  now: Date;
  actor: string;
  facts: PipeFacts;
  onClose: () => void;
  onAdvance?: (key: JobStageKey) => void;
  onScheduleTime?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  // A double tap must not book the same walk twice (the clash check reads stale props).
  const bookingRef = useRef(false);
  const [scope, setScope] = useState(estimate?.notes || job.notes || "");
  const [terms, setTerms] = useState(estimate?.terms || DEFAULT_ESTIMATE_TERMS);
  const [prompt, setPrompt] = useState(settings.estimatePrompt || "");
  const [editPick, setEditPick] = useState(settings.estimatePrompt ? "prompt" : "");
  const [taxRate, setTaxRate] = useState(String(estimate?.taxRate ?? 0));
  const email = customer?.email || "";
  const phone = customer?.phone || "";
  const [lines, setLines] = useState<DocLineDraft[]>(
    estimate?.lines.length ? estimate.lines : [blankLine("LABOR"), blankLine("MATERIAL")]
  );
  const [savedId, setSavedId] = useState(estimate?.id || "");
  const [visitLocked, setVisitLocked] = useState(facts.appointment);
  const [bookedPick, setBookedPick] = useState<{ date: string; start: string; end: string } | null>(null);
  const [marketCopy, setMarketCopy] = useState("");
  const photos = useJobPhotos(job, actor);
  const materialText = lines.find((line) => line.kind === "MATERIAL")?.description ?? "";

  const totals = useMemo(() => documentTotals(lines, Number(taxRate) || 0), [lines, taxRate]);
  const who = customer?.name || job.client;
  const site = job.address || customer?.address || "";
  const shop = shopAddress(settings.businessAddress);
  const packSeed = employees[0]?.id || "";
  const packed = usePackedSlot({
    destination: site,
    employeeId: packSeed,
    jobId: job.id,
    enabled: Boolean(packSeed) && !visitLocked && !facts.appointment,
  });
  const suggestion = packed.pack?.suggestion;

  const company = settings.businessName.trim() || BRAND.tradeName;
  const companyAddress = settings.businessAddress.trim();
  const companyPhone = settings.companyPhone || settings.ownerPhone || "";
  const brand = shopBrand(settings);
  const number = estimate?.number || "EST-draft";
  const priced = estimateIsReady(lines, Number(taxRate) || 0);
  const liveFacts: PipeFacts = {
    ...facts,
    appointment: visitLocked || facts.appointment,
    estimateReady: priced || facts.estimateReady,
    email: email.trim() || facts.email,
    phone: phone.trim() || facts.phone,
  };
  const filled = filledThrough(job.pipeline, liveFacts);
  const coach = stageCoachTalk(2, who, liveFacts, filled);
  const bookedVisits = useMemo(() => {
    const seen = new Map<string, { date: string; start: string; end: string | null }>();
    for (const employee of employees) {
      for (const entry of employee.timeEntries) {
        if (entry.jobId !== job.id || !entry.scheduledStart || entry.scheduledHours <= 0) continue;
        const key = `${entry.date}|${entry.scheduledStart}|${entry.scheduledEnd || ""}`;
        if (!seen.has(key)) seen.set(key, { date: entry.date, start: entry.scheduledStart, end: entry.scheduledEnd });
      }
    }
    if (bookedPick) {
      const key = `${bookedPick.date}|${bookedPick.start}|${bookedPick.end}`;
      if (!seen.has(key)) seen.set(key, bookedPick);
    }
    const slots = [...seen.values()].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    if (bookedPick) return [bookedPick];
    const today = todayString(now);
    const next = slots.find((slot) => slot.date >= today) || slots[slots.length - 1];
    return next ? [next] : [];
  }, [employees, job.id, bookedPick, now]);
  const walkDone = visitLocked || facts.appointment || bookedVisits.length > 0;
  const pulseVisit = !walkDone;
  const pulseSave = walkDone && !priced;
  const pulseSend = walkDone && priced && !facts.estimateSent;
  useCoachSpeak(job.id, "estimate", coach);

  function setMaterialText(text: string) {
    setLines((current) => {
      const index = current.findIndex((line) => line.kind === "MATERIAL");
      if (index < 0) return [...current, { ...blankLine("MATERIAL"), description: text }];
      return current.map((item, i) => (i === index ? { ...item, description: text } : item));
    });
  }

  async function onFiles(list: FileList | null) {
    try {
      const next = await photos.ingest(list);
      if (!next.length) return;
      const draft = await draftFromPhotos({
        job,
        estimate,
        notes: scope,
        lines,
        photos: next,
        stage: "estimate",
        speech: "",
      });
      if (!draft) {
        toast.message("Photos are on the card. The bid stays as you wrote it — edit anything you want.");
        return;
      }
      setScope((current) => fillEditableNotes(current, draft.notes));
      setLines((current) => mergeEditableLines(current, draft.lines));
      if (draft.marketCopy) setMarketCopy(draft.marketCopy);
      const id = await persistPhotoDraft({ job, customer, estimate, actor, draft });
      if (id) setSavedId(id);
      toast.success("Got it — bid’s on the page from the photos. Tweak any line before we send.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t save that photo.");
    }
  }

  async function persist(nextLines = ensureScopeLines(lines)) {
    if (nextLines !== lines) setLines(nextLines);
    const id = await saveEstimateOffline({
      jobId: job.id,
      customerId: customer?.id || null,
      customer: {
        id: customer?.id,
        name: who,
        email: email.trim(),
        phone: phone.trim(),
        address: site,
      },
      notes: scope,
      terms,
      prompt,
      taxRate: Number(taxRate) || 0,
      lines: nextLines,
      actor,
    });
    setSavedId(id);
    return id;
  }

  function saveOnly() {
    if (!priced) {
      toast.error("Add a labor, materials, or total amount first.");
      return;
    }
    startTransition(async () => {
      try {
        await persist();
        toast.success("Estimate saved.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the estimate.");
      }
    });
  }

  function saveAndAdvance() {
    if (!priced) {
      toast.error("Add a labor, materials, or total amount first.");
      return;
    }
    startTransition(async () => {
      try {
        await persist();
        if ((visitLocked || facts.appointment) && facts.estimateSent) {
          await setJobPipeline({ jobId: job.id, pipeline: Math.max(job.pipeline, 2), actor });
          toast.success("Estimate locked. Pre-job prep is next.");
          onAdvance?.("schedule");
          return;
        }
        toast.message(coach);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the estimate.");
      }
    });
  }

  function confirmVisit() {
    if (bookingRef.current) return;
    const pick = suggestion
      ? {
          employeeId: suggestion.employeeId,
          date: suggestion.date,
          start: suggestion.start,
          end: suggestion.end,
        }
      : {
          employeeId: packSeed,
          date: todayString(now),
          start: "09:00",
          end: "10:00",
        };
    if (!pick.employeeId) {
      toast.error("Add someone on Company first so I can put a walk on the board.");
      return;
    }
    const clash = checkCrewSlot(employees, {
      employeeId: pick.employeeId,
      date: pick.date,
      start: pick.start,
      end: pick.end,
      jobId: job.id,
    });
    if (clash.state === "conflict") {
      toast.error("That walk is already booked — pick another time.");
      return;
    }
    bookingRef.current = true;
    startTransition(async () => {
      try {
        await upsertHoursOffline({
          employeeId: pick.employeeId,
          date: pick.date,
          scheduledHours: hoursBetween(pick.start, pick.end) || 1,
          actualHours: 0,
          jobId: job.id,
          serviceCodeId: null,
          scheduledStart: pick.start,
          scheduledEnd: pick.end,
          actor,
        });
        toast.success("Visit is on the board. Write the materials and the scope on this page.");
        setBookedPick({ date: pick.date, start: pick.start, end: pick.end });
        setVisitLocked(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn’t book that walk.");
      } finally {
        bookingRef.current = false;
      }
    });
  }

  function downloadPdf() {
    startTransition(async () => {
      try {
        const id = savedId && !isLocalId(savedId) ? savedId : await persist();
        if (isLocalId(id)) {
          toast.success("Draft is on this phone. PDF downloads after it syncs.");
          return;
        }
        window.open(`/api/export/document?kind=estimate&id=${id}`, "_blank");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not build the PDF.");
      }
    });
  }

  const swipe = useStageDeckSwipe({ stage: "estimate", filled, onClose, onAdvance, enabled: !pending });

  return (
    <section className="lead-stage estimate-stage" data-stage="estimate" data-stage-isolated="estimate" {...swipe.bind}>
      <DeckPane axis="y">
        <h1 className="est-schedule-title">Estimate</h1>
        <h2 className="job-card-client app-title-main client-name">{who}</h2>
        <p className={`lead-site${site ? "" : " miss"}`}>{site || "No house yet"}</p>
        <button
          type="button"
          className={`est-schedule-go${walkDone ? " btn-settled" : ""}`}
          onClick={() => onScheduleTime?.()}
        >
          Schedule Time
        </button>
        {bookedVisits[0] ? (
          <p className="visit-when">
            {formatDay(bookedVisits[0].date)} · {formatTimeLabel(bookedVisits[0].start)}
            {bookedVisits[0].end ? `–${formatTimeLabel(bookedVisits[0].end)}` : ""}
          </p>
        ) : null}
        {site ? (
          <a className="visit-street" href={navigateUrl(site, shop)} target="_blank" rel="noreferrer">
            <span className="visit-street-frame">
              <iframe
                title={`Google Street View of ${site}`}
                src={streetViewEmbedUrl(site)}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <span className="visit-street-caption">
                <b>Google Street View</b>
                <span>Tap for directions</span>
              </span>
            </span>
          </a>
        ) : (
          <p className="visit-street-miss">Add a house to open Google Street View.</p>
        )}

        <section className="est-walk" data-stage-form="estimate-walk" data-orange-walk="1">
          {visitLocked || facts.appointment ? null : packed.loading ? (
            <p className="est-walk-line">Finding the soonest walk from the shop…</p>
          ) : (
            <>
              <p className="est-walk-line">
                {suggestion
                  ? `Soonest walk: ${formatDay(suggestion.date)} · ${formatTimeLabel(suggestion.start)}–${formatTimeLabel(suggestion.end)} · ${suggestion.driveMinutes} min from the shop.`
                  : "One tap books a one-hour walk from the shop. The work day is the next step after you send the bid."}
              </p>
              <button
                type="button"
                className={`ghost-action hours btn-appointment-orange${pulseVisit ? " btn-next-action" : ""}`}
                data-orange-confirm-visit="1"
                onClick={confirmVisit}
                disabled={pending || !employees.length}
              >
                Confirm this visit
              </button>
            </>
          )}
          <input
            ref={photos.camRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="photo-file"
            data-no-swipe
            onChange={(event) => void onFiles(event.target.files)}
          />
          <input
            ref={photos.rollRef}
            type="file"
            accept="image/*"
            multiple
            className="photo-file"
            data-no-swipe
            onChange={(event) => void onFiles(event.target.files)}
          />
          <div className="visit-shots" data-orange-camera="1">
            <button
              type="button"
              className="visit-shot"
              disabled={photos.busy}
              data-no-swipe
              onClick={photos.snap}
              aria-label={photos.busy ? "Saving photo" : "Camera"}
            >
              <Camera className="size-6" />
              {photos.busy ? "Saving…" : "Camera"}
            </button>
            <button
              type="button"
              className="visit-shot"
              disabled={photos.busy}
              data-no-swipe
              onClick={photos.roll}
              aria-label="Camera roll"
            >
              <Images className="size-6" />
              Camera roll
            </button>
          </div>
          {photos.photos.length ? (
            <PhotoStrip
              photos={photos.photos}
              busy={photos.busy}
              onRemove={(id) => void photos.remove(id).catch(() => toast.error("Couldn’t pull that photo."))}
            />
          ) : null}
          <label className="settings-field lead-field visit-materials">
            Materials
            <textarea
              value={materialText}
              onChange={(event) => setMaterialText(event.target.value)}
              rows={3}
            />
          </label>
        </section>

        <label className="settings-field lead-field">
          Scope of work
          <textarea value={scope} onChange={(event) => setScope(event.target.value)} rows={3} />
        </label>

        <p className="card-label">Line items</p>
        <p className="est-edit-cue">Nothing locks until you send. Fix a number or add a line.</p>
        {marketCopy ? <p className="est-market">{marketCopy}</p> : null}
        {lines.map((line, index) => (
          <div key={`${line.id || "new"}-${index}`} className="est-line">
            <select
              value={line.kind}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item, i) =>
                    i === index ? { ...item, kind: event.target.value as DocLineDraft["kind"] } : item
                  )
                )
              }
              aria-label="Kind"
            >
              <option value="LABOR">Labor</option>
              <option value="MATERIAL">Material</option>
              <option value="OTHER">Other</option>
            </select>
            <select
              value={line.tier || ""}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item, i) => (i === index ? { ...item, tier: event.target.value } : item))
                )
              }
              aria-label="Tier"
              title="Good / Better / Best tier"
            >
              <option value="">No tier</option>
              <option value="good">Good</option>
              <option value="better">Better</option>
              <option value="best">Best</option>
            </select>
            <input
              value={line.description}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item, i) => (i === index ? { ...item, description: event.target.value } : item))
                )
              }
            />
            <div className="est-line-nums">
              <FreeNumberInput
                min={0}
                value={line.quantity}
                onValue={(next) =>
                  setLines((current) => current.map((item, i) => (i === index ? { ...item, quantity: next } : item)))
                }
                ariaLabel="Quantity"
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
                onValue={(next) =>
                  setLines((current) => current.map((item, i) => (i === index ? { ...item, rate: next } : item)))
                }
                ariaLabel="Rate"
              />
              <b>{money(lineAmount(line))}</b>
            </div>
            <button
              type="button"
              className="ghost-action remove slim"
              onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="choice-row">
          <button type="button" className="ghost-action slim" onClick={() => setLines((current) => [...current, blankLine("LABOR")])}>
            Add labor
          </button>
          <button type="button" className="ghost-action slim" onClick={() => setLines((current) => [...current, blankLine("MATERIAL")])}>
            Add material
          </button>
        </div>
        <label className="settings-field lead-field">
          Tax %
          <input value={taxRate} onChange={(event) => setTaxRate(event.target.value)} inputMode="decimal" />
        </label>
        <label className="settings-field lead-field">
          Payment terms
          <textarea value={terms} onChange={(event) => setTerms(event.target.value)} rows={2} />
        </label>

        <article className="est-sheet">
          <header className="est-sheet-head">
            <BrandMark logoUrl={brand.logoUrl} initials={brand.initials} name={company} />
            <div>
              <p className="card-label">Estimate</p>
              <b>{company}</b>
              {companyAddress ? <span>{companyAddress}</span> : null}
              {companyPhone ? <span>{companyPhone}</span> : null}
            </div>
            <div className="est-sheet-num">
              <small>{number}</small>
              <strong>{money(totals.total)}</strong>
            </div>
          </header>
          <section className="est-sheet-client">
            <p className="card-label">Prepared for</p>
            <b>{who}</b>
            {site ? <span>{site}</span> : null}
            <small>
              {job.code} · {job.name}
            </small>
          </section>
          {scope.trim() ? (
            <section className="est-sheet-scope">
              <p className="card-label">Scope of work</p>
              <p>{scope}</p>
            </section>
          ) : null}
          <ul className="est-sheet-lines">
            {lines.filter((line) => line.description.trim()).map((line, index) => (
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
          <footer className="est-sheet-totals">
            <span>Labor {money(totals.labor)}</span>
            <span>Materials {money(totals.materials)}</span>
            <span>Tax {money(totals.tax)}</span>
            <strong>Total {money(totals.total)}</strong>
          </footer>
          {(() => {
            const tiers = ["good", "better", "best"] as const;
            const tierTotals = tiers.map((tier) => {
              const tierLines = lines.filter((l) => (l.tier || "") === tier);
              if (!tierLines.length) return null;
              const sum = tierLines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
              return { tier, sum };
            }).filter(Boolean) as { tier: string; sum: number }[];
            if (!tierTotals.length) return null;
            return (
              <div className="est-tier-totals" style={{ display: "flex", gap: 12, marginTop: 12 }}>
                {tierTotals.map(({ tier, sum }) => (
                  <div
                    key={tier}
                    style={{
                      flex: 1,
                      padding: "12px",
                      borderRadius: 12,
                      textAlign: "center",
                      background: tier === "good" ? "#dcfce7" : tier === "better" ? "#fef3c7" : "#dbeafe",
                      border: `2px solid ${tier === "good" ? "#16a34a" : tier === "better" ? "#d97706" : "#2563eb"}`,
                    }}
                  >
                    <div style={{ fontWeight: 800, textTransform: "capitalize", marginBottom: 4 }}>{tier}</div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{money(sum)}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <p className="est-sheet-terms">{terms.trim() || DEFAULT_ESTIMATE_TERMS}</p>
          {prompt.trim() ? (
            <section className="est-sheet-prompt">
              <p className="card-label">Special prompt</p>
              <p>{prompt}</p>
            </section>
          ) : null}
        </article>

        <button type="button" className={`lead-advance${pulseSave ? " btn-next-action" : ""}${facts.estimateReady ? " btn-settled" : ""}`} onClick={saveAndAdvance} disabled={pending}>
          {pending ? "Saving…" : "Save · lock this estimate"}
        </button>
        <EstimateSend
          persist={persist}
          email={email}
          phone={phone}
          actor={actor}
          estimate={estimate}
          disabled={!priced}
          pulse={pulseSend}
          done={facts.estimateSent}
          jobId={job.id}
          onSent={() => {
            if (visitLocked || facts.appointment) onAdvance?.("schedule");
            else toast.message(coach);
          }}
        />
        <button type="button" className="ghost-action slim" onClick={saveOnly} disabled={pending}>
          Save draft
        </button>
        <button type="button" className="ghost-action slim" onClick={downloadPdf} disabled={pending}>
          Download PDF
        </button>
        <p className="lead-swipe-hint">Write the materials and the scope, then send the bid. The work day opens on the next step. Swipe up for crew. Swipe down to go back.</p>
        <div className="est-edit">
          <label className="settings-field">
            Edit
            <select
              value={editPick}
              aria-label="Edit"
              data-no-swipe
              onChange={(event) => setEditPick(event.target.value)}
            >
              <option value="">Choose</option>
              <option value="prompt">Add special prompt</option>
            </select>
          </label>
          {editPick === "prompt" ? (
            <label className="settings-field">
              Special prompt
              <textarea
                value={prompt}
                rows={3}
                data-no-swipe
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
          ) : null}
        </div>
      </DeckPane>
    </section>
  );
}
