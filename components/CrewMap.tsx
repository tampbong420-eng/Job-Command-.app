"use client";

import { mapsLiveTrackEmbedUrl } from "@/lib/maps";
import type { CrewMember, Job } from "@/lib/types";

export default function CrewMap({
  member,
  job,
}: {
  member: CrewMember;
  job: Job | null;
}) {
  const tracking = member.gpsLive && member.lat != null && member.lng != null;
  const src = mapsLiveTrackEmbedUrl(member, job);
  const caption = tracking
    ? job
      ? `${member.name} → ${job.customerName}`
      : `${member.name} field pin`
    : job
      ? `Property · ${job.address}`
      : "No live pin";

  return (
    <section className="plate crew-map" aria-label="Live field map">
      <div className="crew-map-head">
        <div>
          <p className="card-label">Live map</p>
          <p className="swipe-hint">{caption}</p>
        </div>
        <span className={`shift-tag${tracking ? " shock" : ""}`}>
          {tracking ? "GPS LIVE" : "GPS MUTE"}
        </span>
      </div>
      {src ? (
        <iframe
          title={`Google Map tracking ${member.name}`}
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <p className="map-empty">No field pin or active property to plot.</p>
      )}
    </section>
  );
}
