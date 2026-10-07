"use client";

import { useEffect, useState } from "react";
import { coverForJob } from "@/lib/job-cover";
import type { JobPhotoDTO } from "@/lib/types";
import { PhotoSwipeHint } from "@/components/command/PhotoSwipeHint";

/**
 * Job cover photo (Eric, 2026-10-03): sits right under the client name and
 * above the job arrows on the job card. Shows the job's first photo
 * automatically, or a mock house-front until photos exist. Tapping a real
 * photo opens the full gallery so archived jobs are recognizable at a glance.
 */
export function JobCover({
  jobId,
  photos,
  clientName,
  small = false,
  hero = false,
}: {
  jobId: string;
  photos: JobPhotoDTO[];
  clientName: string;
  small?: boolean;
  hero?: boolean;
}) {
  const cover = coverForJob({ id: jobId, photos });
  const [open, setOpen] = useState(false);
  const cls = `job-cover${small ? " small" : ""}${hero ? " hero" : ""}`;

  const frame = (
    <>
      <img
        src={cover.url}
        alt={cover.isPhoto ? `Job photo for ${clientName}` : "Placeholder house front"}
        loading="lazy"
      />
      {cover.isPhoto && photos.length > 1 ? (
        <span className="job-cover-count">{photos.length} photos</span>
      ) : null}
      {hero && cover.isPhoto ? (
        <PhotoSwipeHint />
      ) : null}
    </>
  );

  return (
    <>
      {cover.isPhoto ? (
        <button type="button" className={cls} onClick={() => setOpen(true)} aria-label={`Open ${photos.length} photos for ${clientName}`}>
          {frame}
        </button>
      ) : (
        <div className={`${cls} static`} aria-hidden>
          {frame}
        </div>
      )}
      {open ? <PhotoGallery photos={photos} clientName={clientName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PhotoGallery({
  photos,
  clientName,
  onClose,
}: {
  photos: JobPhotoDTO[];
  clientName: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const total = photos.length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((i) => (i + 1) % total);
      if (event.key === "ArrowLeft") setIndex((i) => (i - 1 + total) % total);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, total]);

  if (!total) return null;
  const photo = photos[index];

  return (
    <div className="photo-gallery" role="dialog" aria-modal="true" aria-label={`Photos for ${clientName}`} onClick={onClose}>
      <button type="button" className="pg-close" onClick={onClose} aria-label="Close photos">
        ✕
      </button>
      {total > 1 ? (
        <button
          type="button"
          className="pg-arrow left"
          aria-label="Previous photo"
          onClick={(event) => {
            event.stopPropagation();
            setIndex((index - 1 + total) % total);
          }}
        >
          ◀
        </button>
      ) : null}
      <figure className="pg-frame" onClick={(event) => event.stopPropagation()}>
        <img src={photo.url} alt={photo.caption || `Job photo ${index + 1} of ${total}`} />
        <figcaption>{photo.caption || `${index + 1} of ${total}`}</figcaption>
      </figure>
      {total > 1 ? (
        <button
          type="button"
          className="pg-arrow right"
          aria-label="Next photo"
          onClick={(event) => {
            event.stopPropagation();
            setIndex((index + 1) % total);
          }}
        >
          ▶
        </button>
      ) : null}
      {total > 1 ? (
        <div className="pg-dots" onClick={(event) => event.stopPropagation()}>
          {photos.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={i === index ? "on" : ""}
              aria-label={`Photo ${i + 1}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
