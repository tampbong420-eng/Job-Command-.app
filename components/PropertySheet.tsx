"use client";

import StatusButtons from "@/components/StatusButtons";
import { jobStatusLabel, jobTone } from "@/lib/format";
import {
  mapsDirectionsUrl,
  mapsPlaceUrl,
  mapsStreetViewEmbedUrl,
  mapsStreetViewUrl,
  originQuery,
} from "@/lib/maps";
import type { CrewMember, Job, JobStatus } from "@/lib/types";

export default function PropertySheet({
  job,
  member,
  onClose,
  onStatus,
  onDelete,
}: {
  job: Job;
  member: CrewMember;
  onClose: () => void;
  onStatus: (status: JobStatus) => void;
  onDelete: () => void;
}) {
  const origin = originQuery(member);
  const directions = mapsDirectionsUrl(job, origin);
  const place = mapsPlaceUrl(job);
  const streetViewPage =
    job.lat != null && job.lng != null
      ? mapsStreetViewUrl(job.lat, job.lng)
      : place;
  const streetViewEmbed =
    job.lat != null && job.lng != null
      ? mapsStreetViewEmbedUrl(job.lat, job.lng)
      : null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="property-sheet plate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="property-head">
          <p className="card-label">Property details</p>
          <button type="button" className="text-back" onClick={onClose}>
            Close
          </button>
        </div>
        <span className={`job-chip ${jobTone(job.status)}`}>
          {jobStatusLabel(job.status)}
        </span>
        <h2 id="property-title">{job.jobTitle}</h2>
        <p className="property-customer">{job.customerName}</p>
        <dl className="property-facts">
          <div>
            <dt>Address</dt>
            <dd>{job.address}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{job.phone}</dd>
          </div>
          <div>
            <dt>Window</dt>
            <dd>{job.scheduledTime}</dd>
          </div>
          <div>
            <dt>Assigned</dt>
            <dd>{job.worker}</dd>
          </div>
        </dl>
        <StatusButtons
          job={job}
          onStatus={(status) => onStatus(status)}
          onDelete={onDelete}
        />
        <div className="street-view">
          {streetViewEmbed ? (
            <iframe
              title={`Street view of ${job.address}`}
              src={streetViewEmbed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <p className="map-empty">Street view needs a mapped pin.</p>
          )}
        </div>
        <div className="property-links">
          <a className="lock-button" href={directions} target="_blank" rel="noreferrer">
            <span className="button-icon" aria-hidden="true">
              ↗
            </span>
            <span>
              <small>Google Maps</small>
              <b>Navigate</b>
            </span>
          </a>
          <a className="ghost-action directions" href={streetViewPage} target="_blank" rel="noreferrer">
            Street View
          </a>
          <a className="ghost-action" href={place} target="_blank" rel="noreferrer">
            Property map
          </a>
        </div>
      </section>
    </div>
  );
}
