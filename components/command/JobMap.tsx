"use client";

import { useEffect, useState } from "react";
import { Navigation } from "lucide-react";
import { DEFAULT_SHOP, navigateUrl, streetViewEmbedUrl } from "@/lib/maps";

export type RouteStop = {
  id: string;
  title: string;
  address: string;
  start?: string | null;
  end?: string | null;
  driveMinutes?: number | null;
  fromLabel?: string;
};

export function JobMap({
  destination,
  origin,
  originLabel,
  driveMinutes,
  compact = false,
}: {
  destination: string;
  origin?: string;
  originLabel?: string;
  driveMinutes?: number | null;
  compact?: boolean;
}) {
  const site = destination.trim();
  const from = (origin || DEFAULT_SHOP).trim();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!site) {
      setCoords(null);
      return;
    }
    let live = true;
    fetch("/api/drive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: from, destination: site }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((leg: { destinationCoords?: { lat: number; lng: number } | null } | null) => {
        if (live) setCoords(leg?.destinationCoords || null);
      })
      .catch(() => {
        if (live) setCoords(null);
      });
    return () => {
      live = false;
    };
  }, [from, site]);

  if (!site) {
    return (
      <p className="map-empty">Add a property address to load maps and turn-by-turn.</p>
    );
  }

  const nav = navigateUrl(site, from);
  const minutes =
    driveMinutes != null ? `${driveMinutes} min drive` : "Drive time on tap";

  return (
    <section className={`job-map${compact ? " compact" : ""}`}>
      <div className="job-map-head">
        <div>
          <p className="card-label">Google Maps</p>
          <b>{minutes}</b>
          <span>
            {originLabel ? `From ${originLabel}` : "From the shop"} → {site}
          </span>
        </div>
        <a className="job-nav" href={nav} target="_blank" rel="noreferrer">
          <Navigation className="size-5" />
          Navigate
        </a>
      </div>
      <div className="job-map-frames">
        <iframe
          title={`Street View of ${site}`}
          src={streetViewEmbedUrl(site, coords)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="accelerometer; gyroscope; geolocation; magnetometer; fullscreen; clipboard-write"
        />
      </div>
    </section>
  );
}

export function CrewRoute({
  stops,
  origin,
  originLabel,
}: {
  stops: RouteStop[];
  origin: string;
  originLabel?: string;
}) {
  const live = stops.filter((stop) => stop.address.trim());
  if (!live.length) {
    return <p className="map-empty">No job site on this day yet.</p>;
  }

  return (
    <div className="crew-route">
      {live.map((stop, index) => (
        <article key={stop.id} className="crew-stop">
          <p className="card-label">
            Stop {index + 1}
            {stop.start ? ` · ${stop.start}` : ""}
            {stop.end ? `–${stop.end}` : ""}
          </p>
          <b>{stop.title}</b>
          <span>{stop.address}</span>
          <JobMap
            destination={stop.address}
            origin={index === 0 ? origin : live[index - 1].address || origin}
            originLabel={
              index === 0 ? originLabel || "the shop" : live[index - 1].title
            }
            driveMinutes={stop.driveMinutes}
            compact
          />
        </article>
      ))}
    </div>
  );
}
