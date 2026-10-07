"use client";

import { useCallback, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { officialPrompt, saveShopExtras } from "@/app/signup-actions";
import { browserOnline } from "@/lib/offline/net";
import { barlowCondensed, barlowSemi } from "@/components/signup/fonts";
import { SignupIcon } from "@/components/signup/SignupIcon";
import { ARROW, Sheet, cx } from "@/components/signup/SignupSheet";
import s from "@/components/signup/signup.module.css";

export type OfficialSeed = {
  licenseLabel: string;
  logoUrl: string | null;
  licenseNumber?: string;
  insuranceCarrier?: string;
};

/**
 * "Make it look official": logo, license #, insurance. Asked once.
 * mode "send": sits over the first estimate (mockup 12) with Save & Send / Send without them.
 * mode "later": opened from the Finish-later list with Save / Not now.
 */
export function OfficialSheet({
  seed,
  mode,
  onSend,
  onClose,
  portal = false,
}: {
  seed: OfficialSeed;
  mode: "send" | "later";
  /** mode "send": called after saving (or skipping) so the estimate goes out. */
  onSend?: () => void;
  onClose: () => void;
  portal?: boolean;
}) {
  const [logo, setLogo] = useState<string | null>(seed.logoUrl);
  const [license, setLicense] = useState(seed.licenseNumber || "");
  const [insurance, setInsurance] = useState(seed.insuranceCarrier || "");
  const [pending, startTransition] = useTransition();

  function save(after: () => void) {
    startTransition(async () => {
      const done = [license.trim() ? "license" : "", logo ? "logo" : "", mode === "send" ? "official-asked" : ""].filter(Boolean);
      const result = await saveShopExtras({
        licenseNumber: license,
        insuranceCarrier: insurance,
        logoUrl: logo && logo !== seed.logoUrl ? logo : undefined,
        laterDone: done,
      });
      if (result.ok) toast.success("Saved for every estimate.");
      else toast.error("Couldn’t save that. Try again from Office.");
      after();
    });
  }

  function sendWithout() {
    startTransition(async () => {
      // Asked once: never pops up again before a send. Still on the Finish-later list.
      await saveShopExtras({ laterDone: ["official-asked"] }).catch(() => undefined);
      onClose();
      onSend?.();
    });
  }

  const body = (
    <Sheet onClose={onClose} label="Make it look official">
      <div className={s.kick} style={{ marginTop: 8 }}>
        First estimate · 20 seconds
      </div>
      <h2 className={cx(s.q, s.sheetQ)}>Make it look official</h2>
      <p className={cx(s.help, s.sheetHelp)}>Customers trust a logo and a license number. We’ll save these for every estimate.</p>
      <div className={s.lg}>
        <label className={s.drop}>
          {logo ? <img src={logo} alt="Your logo" /> : null}
          <SignupIcon name="img" />
          <span>Add logo</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Company logo"
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              // Clear so picking the same file twice still fires onChange.
              input.value = "";
              if (!file) return;
              const form = new FormData();
              form.append("file", file);
              const response = await fetch("/api/upload/logo", { method: "POST", body: form });
              const payload = (await response.json().catch(() => ({}))) as { logoUrl?: string; error?: string };
              if (payload.logoUrl) setLogo(payload.logoUrl);
              else toast.error(payload.error || "That logo didn’t upload.");
            }}
          />
        </label>
        <div className={s.lgt}>
          <b>Your logo</b>
          <small>Photo or file. We’ll trim it.</small>
        </div>
      </div>
      <label className={s.f}>
        <span className={s.lab}>
          {seed.licenseLabel} <em>optional</em>
        </span>
        <input className={s.in} value={license} name="signup-license" autoComplete="off" placeholder="e.g. 0123450521" onChange={(event) => setLicense(event.target.value)} />
      </label>
      <label className={s.f}>
        <span className={s.lab}>
          Insurance carrier <em>optional</em>
        </span>
        <input className={s.in} value={insurance} name="signup-insurance" autoComplete="off" placeholder="e.g. State Farm · GL policy" onChange={(event) => setInsurance(event.target.value)} />
      </label>
      <div className={s.sheetActions}>
        <div className={cx(s.frow, s.withMic)}>
          <button
            type="button"
            className={s.next}
            disabled={pending}
            data-official-save="1"
            onClick={() =>
              save(() => {
                onClose();
                if (mode === "send") onSend?.();
              })
            }
          >
            {pending ? "Saving…" : mode === "send" ? "Save & send" : "Save"} {pending ? null : ARROW}
          </button>
        </div>
        <button type="button" className={s.skip} disabled={pending} onClick={mode === "send" ? sendWithout : onClose}>
          {mode === "send" ? "Send without them" : "Not now"}
        </button>
      </div>
    </Sheet>
  );

  if (!portal) return body;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={cx(s.host, barlowCondensed.variable, barlowSemi.variable)} data-official-sheet={mode}>
      {body}
    </div>,
    document.body
  );
}

/**
 * Wrap any "send the estimate" action: the first time (logo or license missing, never asked),
 * "Make it look official" opens over the estimate; Save & send / Send without them both send.
 */
export function useOfficialGate() {
  const [seed, setSeed] = useState<{ value: OfficialSeed; send: () => void } | null>(null);
  const gate = useCallback(async (send: () => void) => {
    const prompt = browserOnline() ? await officialPrompt().catch(() => ({ ask: false as const })) : { ask: false as const };
    if (!prompt.ask) return send();
    setSeed({
      value: {
        licenseLabel: prompt.licenseLabel,
        logoUrl: prompt.logoUrl,
        licenseNumber: prompt.licenseNumber,
        insuranceCarrier: prompt.insuranceCarrier,
      },
      send,
    });
  }, []);
  const sheet = seed ? <OfficialSheet seed={seed.value} mode="send" portal onSend={seed.send} onClose={() => setSeed(null)} /> : null;
  return { gate, sheet };
}
