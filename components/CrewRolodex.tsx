"use client";

import { clockLabel, initials, wrapIndex } from "@/lib/format";
import type { CrewMember } from "@/lib/types";
import { useSwipe } from "@/lib/use-swipe";

export default function CrewRolodex({
  crew,
  index,
  onIndexChange,
}: {
  crew: CrewMember[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const member = crew[index];
  const swipe = useSwipe((delta) => {
    onIndexChange(wrapIndex(index, delta, crew.length));
  }, "x", 72);

  if (!member) return null;

  return (
    <section
      className={`rolodex-strip${swipe.dragging ? " is-dragging" : ""}`}
      aria-label="Crew rolodex"
      onPointerDown={swipe.onPointerDown}
      onPointerMove={swipe.onPointerMove}
      onPointerUp={swipe.onPointerUp}
      onPointerCancel={swipe.onPointerUp}
      style={{
        transform: swipe.dragging
          ? `translateX(${Math.max(-48, Math.min(48, swipe.drag * 0.28))}px)`
          : undefined,
      }}
    >
      <div className="rolodex-person">
        <div className={`crew-photo duty-${member.status}`}>
          {member.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photoUrl} alt="" />
          ) : (
            <span className="initials">{initials(member.name)}</span>
          )}
        </div>
        <div className="rolodex-copy">
          <p className="card-label">{member.role}</p>
          <h2>{member.name}</h2>
          <p>{member.id.toUpperCase()}</p>
        </div>
        <span className={`status-pill ${member.status}`} aria-live="polite">
          <span className="status-dot" />
          {clockLabel(member.status)}
        </span>
      </div>
      <div className="rolodex-dots">
        {crew.map((row, i) => (
          <button
            key={row.id}
            type="button"
            className={i === index ? "on" : ""}
            aria-label={`Show ${row.name}`}
            aria-pressed={i === index}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onIndexChange(i)}
          />
        ))}
      </div>
    </section>
  );
}
