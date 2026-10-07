"use client";

import { useState } from "react";
import { Navigation } from "lucide-react";
import { navigateUrl, satelliteEmbedUrl, streetViewEmbedUrl } from "@/lib/maps";
import { pinPercent, type CrewPingDTO } from "@/lib/crew-ping";
import type { SiteCoords } from "@/lib/weather";

export type MapMode = "street" | "top";

export function SiteMap({
  address,
  coords,
  origin,
  pings = [],
  compact = false,
  bare = false,
  initialMode = "street",
}: {
  address: string;
  coords?: SiteCoords | null;
  origin?: string;
  pings?: CrewPingDTO[];
  compact?: boolean;
  /** Active page card: no header (the card has one), toggle reads Street / Top. */
  bare?: boolean;
  initialMode?: MapMode;
}) {
  const site = address.trim();
  const [mode, setMode] = useState<MapMode>(initialMode);
  if (!site) {
    return <p className="map-empty">Add a property address to load Street View.</p>;
  }
  const live = pings.filter((ping) => !ping.stale);
  const pinOrigin =
    coords ||
    (live.length
      ? {
          lat: live.reduce((sum, ping) => sum + ping.lat, 0) / live.length,
          lng: live.reduce((sum, ping) => sum + ping.lng, 0) / live.length,
        }
      : null);
  const src =
    mode === "top" ? satelliteEmbedUrl(site, pinOrigin) : streetViewEmbedUrl(site, coords || null);
  return (
    <section className={`site-map${compact ? " compact" : ""}${bare ? " bare" : ""}`} data-green-street="1" data-map-mode={mode}>
      {bare ? null : (
      <div className="job-map-head">
        <div>
          <p className="card-label">{mode === "top" ? "Crew Location" : "Street View"}</p>
          <b>On the job</b>
          <span>{site}</span>
        </div>
        <a className="job-nav" href={navigateUrl(site, origin)} target="_blank" rel="noreferrer">
          <Navigation className="size-5" />
          Navigate
        </a>
      </div>
      )}
      <div className="map-toggle" role="group" aria-label="Map view">
        <button
          type="button"
          className={mode === "street" ? "on" : ""}
          data-no-swipe
          onClick={() => setMode("street")}
        >
          Street
        </button>
        <button
          type="button"
          className={mode === "top" ? "on" : ""}
          data-no-swipe
          onClick={() => setMode("top")}
        >
          {bare ? "Top" : "Crew Location"}
        </button>
      </div>
      <div className="site-map-stage">
        <iframe
          title={mode === "top" ? `Crew Location at ${site}` : `Street View of ${site}`}
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="accelerometer; gyroscope; geolocation; magnetometer; fullscreen; clipboard-write"
        />
        {mode === "top" && pinOrigin && live.length ? (
          <div className="crew-radar" aria-hidden>
            {live.map((ping) => {
              const pin = pinPercent(ping, pinOrigin);
              return (
                <b
                  key={ping.employeeId}
                  className={`crew-pin${pin.inside ? "" : " offsite"}`}
                  style={{ left: `${pin.left}%`, top: `${pin.top}%` }}
                  title={ping.name}
                >
                  <img src={ping.photoUrl || "/avatars/generic.svg"} alt="" />
                </b>
              );
            })}
          </div>
        ) : null}
      </div>
      {bare ? (
        <p className="site-map-gps" aria-live="polite">
          {live.length ? `Live GPS · ${live.length} on the map` : "No live GPS yet"}
        </p>
      ) : live.length ? (
        <ul className="crew-track" aria-label="Crew on site">
          {live.map((ping) => (
            <li key={ping.employeeId}>
              <b>
                <img src={ping.photoUrl || "/avatars/generic.svg"} alt="" />
              </b>
              <span>
                {ping.name}
                {ping.accuracy ? ` · ±${Math.round(ping.accuracy)}m` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="command-empty">No live GPS yet. Field phones share a pin while they’re clocked in.</p>
      )}
    </section>
  );
}
