"use client";

import { useState } from "react";
import { trailFromEstimates, trailToggleLabel } from "@/lib/delivery-log";
import type { EstimateDTO } from "@/lib/types";

export function DeliveryTrail({ estimates }: { estimates: EstimateDTO[] }) {
  const rows = trailFromEstimates(estimates);
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  const label = trailToggleLabel(rows);

  return (
    <div className="delivery-trail">
      <button
        type="button"
        className="delivery-trail-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Hide send log" : label}
      </button>
      {open ? (
        <ol className="delivery-trail-list">
          {rows.map((row) => (
            <li key={row.id}>{row.line}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
