"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clientApproveEstimate, clientRequestEstimateChanges } from "@/app/actions";
import { estimateStatusLabel, type EstimateStatus } from "@/lib/estimate-status";

export function QuoteClient({
  token,
  status,
  signedName,
  clientNote,
}: {
  token: string;
  status: EstimateStatus;
  signedName: string;
  clientNote: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(signedName);
  const [note, setNote] = useState(clientNote);
  const locked = status === "ACCEPTED";

  if (status === "ACCEPTED") {
    return (
      <section className="client-quote-done">
        <p className="card-label">Approved</p>
        <b>Signed by {signedName || "you"}</b>
        <p>We’ll call to lock the start date.</p>
      </section>
    );
  }

  return (
    <section className="client-quote-sign">
      <p className={`est-status ${status.toLowerCase()}`}>{estimateStatusLabel(status)}</p>
      {status === "CHANGES" && clientNote ? (
        <p className="client-quote-note">We have your note: {clientNote}</p>
      ) : null}
      <label className="settings-field">
        Type your name to sign
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          disabled={locked || pending}
        />
      </label>
      <button
        type="button"
        className="lead-advance"
        disabled={pending || name.trim().length < 2}
        onClick={() =>
          startTransition(async () => {
            try {
              await clientApproveEstimate({ token, signedName: name });
              toast.success("Estimate approved.");
              router.refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not approve.");
            }
          })
        }
      >
        {pending ? "Saving…" : "Approve this estimate"}
      </button>
      <label className="settings-field">
        Need a change?
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          disabled={pending}
        />
      </label>
      <button
        type="button"
        className="ghost-action"
        disabled={pending || note.trim().length < 3}
        onClick={() =>
          startTransition(async () => {
            try {
              await clientRequestEstimateChanges({ token, note });
              toast.success("Change request sent.");
              router.refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not send.");
            }
          })
        }
      >
        Request changes
      </button>
    </section>
  );
}
