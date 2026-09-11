import type { CrewMember, Estimate, Job, TimeCard } from "@/lib/types";
import type { ReactNode } from "react";

export default function EstimatesBoard({
  jobs,
  estimates,
  onBack,
  children,
}: {
  jobs: Job[];
  estimates: Estimate[];
  onBack?: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="page jobs-board">
      {children}
      {onBack && (
        <button type="button" className="text-back" onClick={onBack}>
          ← Cards
        </button>
      )}
      <p className="section-kicker">Paperwork</p>
      <h1>
        Estimates
        <br />
        <strong>Ready.</strong>
      </h1>
      <p className="board-copy">
        Talk a price onto a customer and it lands here, already tied to the job
        card.
      </p>
      {estimates.length === 0 ? (
        <p className="empty-group">No estimates yet. Say “estimate $1800 for Priya”.</p>
      ) : (
        estimates.map((row) => {
          const job = jobs.find((item) => item.id === row.jobId);
          return (
            <article key={row.id} className="paper-row">
              <div>
                <small>{job?.customerName ?? "Customer"}</small>
                <b>${row.amount.toLocaleString()}</b>
                <span>{row.notes || job?.jobTitle}</span>
              </div>
              <em>{job?.address}</em>
            </article>
          );
        })
      )}
    </section>
  );
}

export function TimeCardsBoard({
  crew,
  jobs,
  timeCards,
  onBack,
  children,
}: {
  crew: CrewMember[];
  jobs: Job[];
  timeCards: TimeCard[];
  onBack?: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="page jobs-board">
      {children}
      {onBack && (
        <button type="button" className="text-back" onClick={onBack}>
          ← Cards
        </button>
      )}
      <p className="section-kicker">Paperwork</p>
      <h1>
        Time
        <br />
        <strong>Cards.</strong>
      </h1>
      <p className="board-copy">
        Say “log 8 hours for Mike on Northline” and the hours hit the right
        crew member.
      </p>
      {timeCards.length === 0 ? (
        <p className="empty-group">No time cards yet.</p>
      ) : (
        timeCards.map((row) => {
          const member = crew.find((item) => item.id === row.employeeId);
          const job = jobs.find((item) => item.id === row.jobId);
          return (
            <article key={row.id} className="paper-row">
              <div>
                <small>{row.date}</small>
                <b>
                  {row.hours}h · {member?.name ?? "Crew"}
                </b>
                <span>{job?.jobTitle ?? row.notes}</span>
              </div>
              <em>{job?.customerName}</em>
            </article>
          );
        })
      )}
    </section>
  );
}
