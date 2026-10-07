"use client";

import { Camera } from "lucide-react";
import { isLocalId } from "@/lib/offline/idb";
import { photoBadge, stripThumbs } from "@/lib/photo-cache";
import type { JobPhotoDTO } from "@/lib/types";

export function PhotoStrip({
  photos,
  busy,
  onSnap,
  onRemove,
}: {
  photos: JobPhotoDTO[];
  busy?: boolean;
  onSnap?: () => void;
  onRemove?: (id: string) => void;
}) {
  const { shown, extra } = stripThumbs(photos, 4);
  const count = photoBadge(photos.length);

  return (
    <div className="photo-strip">
      {onSnap ? (
        <button
          type="button"
          className={`photo-strip-snap${busy ? " busy" : ""}`}
          disabled={busy}
          onClick={onSnap}
          aria-label={busy ? "Saving photo" : "Snap the property"}
          data-no-swipe
        >
          <Camera className="size-5" />
          {busy ? <span className="voice-pulse processing" aria-hidden /> : null}
        </button>
      ) : null}
      {count ? <span className="photo-strip-count">{count}</span> : null}
      {shown.length ? (
        <ul className="photo-strip-thumbs">
          {shown.map((photo) => (
            <li key={photo.id} className={isLocalId(photo.id) ? "queued" : undefined}>
              <img src={photo.url} alt="" />
              {onRemove ? (
                <button type="button" onClick={() => onRemove(photo.id)} aria-label="Remove photo">
                  ×
                </button>
              ) : null}
            </li>
          ))}
          {extra ? <li className="photo-strip-more">+{extra}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
