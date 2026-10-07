"use client";

import { sendToast } from "@/lib/delivery-honest";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SendEstimateResult } from "@/lib/send-estimate";
import type { EstimateDTO } from "@/lib/types";
import { EstimateStatusBar } from "@/components/command/EstimateStatus";
import { sendEstimateOffline } from "@/lib/offline/actions";
import { browserOnline } from "@/lib/offline/net";
import { useOfficialGate } from "@/components/signup/OfficialSheet";

export function EstimateSend({
  persist,
  email,
  phone,
  actor,
  estimate,
  disabled,
  pulse = false,
  done = false,
  jobId,
  onSent,
}: {
  persist: () => Promise<string>;
  email: string;
  phone: string;
  actor: string;
  estimate?: EstimateDTO | null;
  disabled?: boolean;
  pulse?: boolean;
  done?: boolean;
  jobId?: string;
  onSent?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canSend = Boolean(email.trim() || phone.trim());
  // First estimate: "Make it look official" (logo + license) sits over the estimate, asked once.
  const official = useOfficialGate();

  function dispatch() {
    if (disabled || !canSend) return sendNow();
    void official.gate(sendNow);
  }

  function sendNow() {
    if (disabled) {
      toast.error("Add a labor, materials, or total amount first.");
      return;
    }
    if (!canSend) {
      toast.error("Add a phone or email on the client to send.");
      return;
    }
    startTransition(async () => {
      try {
        const id = await persist();
        const result: SendEstimateResult & { queued?: boolean } = await sendEstimateOffline({
          estimateId: id,
          jobId,
          actor,
          origin: window.location.origin,
        });
        if (result.queued) {
          toast.success("On this phone. Sends when signal is back. Pre-job prep is next.");
          onSent?.();
          return;
        }
        try {
          await navigator.clipboard.writeText(result.url);
        } catch {
          /* clipboard is best-effort */
        }
        // Go-public B4: honest when email/text aren't connected (nothing left the server).
        const note = sendToast(result, "Sent. Pre-job prep is next.");
        if (note.kind === "message") toast.message(note.text);
        else toast.success(note.text);
        if (browserOnline()) router.refresh();
        onSent?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not send the estimate.");
      }
    });
  }

  return (
    <div className="est-delivery">
      {estimate ? (
        <EstimateStatusBar
          number={estimate.number}
          status={estimate.status}
          viewedAt={estimate.viewedAt}
          signedName={estimate.signedName}
          clientNote={estimate.clientNote}
          followUpCount={estimate.followUpCount}
        />
      ) : null}
      {estimate?.publicToken ? (
        <a className="ghost-action slim" href={`/e/${estimate.publicToken}`} target="_blank" rel="noreferrer">
          Open client link
        </a>
      ) : null}
      <button type="button" className={`lead-advance btn-appointment-orange${pulse ? " btn-next-action" : ""}${done ? " btn-settled" : ""}`} disabled={pending || disabled || !canSend} onClick={dispatch}>
        {pending ? "Sending…" : done ? "Sent to client" : "Send to client"}
      </button>
      {official.sheet}
    </div>
  );
}
