"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { issueCrewInvite } from "@/app/actions";
import { inviteShareText } from "@/lib/crew-invite";
import { smsHref } from "@/lib/clients";
import type { EmployeeDTO } from "@/lib/types";

/**
 * The link that opens jobcommand.app on this worker's phone (Make link / Copy link / Text).
 * Lives on each employee's own profile (Roster › Profiles), Eric 2026-10-02. It used to be a list of
 * every name at the bottom of Office ("Settings · Employee sign-in").
 */
export function CrewInviteLink({ employee, shop }: { employee: EmployeeDTO; shop?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const name = `${employee.firstName} ${employee.lastName}`.trim();
  const text = smsHref(employee.phone || "");

  function issue() {
    startTransition(async () => {
      try {
        const next = await issueCrewInvite({ employeeId: employee.id });
        if (!next?.url) throw new Error("Could not make an invite.");
        setUrl(next.url);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not make an invite.");
      }
    });
  }

  function copy() {
    startTransition(async () => {
      try {
        const next = await issueCrewInvite({ employeeId: employee.id });
        if (!next?.url) throw new Error("Could not make an invite.");
        setUrl(next.url);
        await navigator.clipboard.writeText(next.url);
        toast.success(`Invite copied for ${employee.firstName}.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not copy the invite.");
      }
    });
  }

  return (
    <div className="company-block crew-invite crew-invite-one" data-crew-invite="1" data-crew-invite-for={employee.id}>
      <p className="card-label">App link for {employee.firstName || "this person"}</p>
      <p className="command-empty">Send this link to {employee.firstName || "them"}. They open it on their phone and pick their own PIN.</p>
      {url ? <span className="invite-url">{url}</span> : null}
      <div className="invite-actions">
        <button type="button" className="ghost-action slim" disabled={pending} onClick={copy}>
          Copy link
        </button>
        {url && text ? (
          <a className="ghost-action slim" href={`${text}?body=${encodeURIComponent(inviteShareText(name, url, shop))}`}>
            Text
          </a>
        ) : (
          <button type="button" className="ghost-action slim" disabled={pending} onClick={issue}>
            Make link
          </button>
        )}
      </div>
    </div>
  );
}
