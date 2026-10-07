"use client";

import { useMemo, useState } from "react";
import { fileLine, indexClients, searchClients } from "@/lib/clients";
import type { CustomerDTO, EstimateDTO, JobDTO } from "@/lib/types";

export function ClientPick({
  customers,
  jobs = [],
  estimates = [],
  name,
  customerId,
  disabled,
  onPick,
}: {
  customers: CustomerDTO[];
  jobs?: JobDTO[];
  estimates?: EstimateDTO[];
  name: string;
  customerId?: string;
  disabled?: boolean;
  onPick: (next: { name: string; address: string; customerId?: string; phone?: string; email?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const index = useMemo(
    () => indexClients({ customers, jobs, estimates }),
    [customers, jobs, estimates]
  );
  const hits = useMemo(() => searchClients(index, name), [index, name]);
  const selected = customerId ? index.find((item) => item.id === customerId) : null;

  return (
    <div className="client-pick">
      <label className="settings-field">
        Customer
        <input
          name="client"
          required
          autoComplete="off"
          disabled={disabled}
          value={name}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setOpen(true);
            onPick({ name: event.target.value, address: "", customerId: undefined });
          }}
        />
      </label>
      {open && hits.length ? (
        <ul className="client-hits">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className={hit.id === customerId ? "on" : ""}
                onClick={() => {
                  onPick({
                    name: hit.name,
                    address: hit.lastSite || hit.address,
                    customerId: hit.id,
                    phone: hit.phone,
                    email: hit.email,
                  });
                  setOpen(false);
                }}
              >
                <b>{hit.name}</b>
                <small>{hit.lastSite || hit.phone || fileLine(hit)}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && name.trim() && !hits.some((hit) => hit.name.toLowerCase() === name.trim().toLowerCase()) ? (
        <p className="client-new">New client — filed in the background when you save.</p>
      ) : null}
      {selected && !open ? <p className="client-file">{fileLine(selected)}</p> : null}
    </div>
  );
}
