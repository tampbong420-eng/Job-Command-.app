"use client";

/**
 * Photo bar for stage pages: camera + phone roll + the thumbnails.
 * (The old per-page “Hold to talk” mic lived here. Talking is now the one floating mic — see OneMic.tsx.)
 */

import type { Ref } from "react";
import { Camera, Images } from "lucide-react";
import { PhotoStrip } from "@/components/command/PhotoStrip";
import type { JobPhotoDTO } from "@/lib/types";

export function PhotoBar({
  photos,
  busy,
  onSnap,
  onRoll,
  onRemove,
  camRef,
  rollRef,
  onFiles,
  camera = false,
}: {
  photos: JobPhotoDTO[];
  busy?: boolean;
  onSnap?: () => void;
  onRoll?: () => void;
  onRemove?: (id: string) => void;
  camRef?: Ref<HTMLInputElement>;
  rollRef?: Ref<HTMLInputElement>;
  onFiles?: (list: FileList | null) => void;
  /** Big camera + roll buttons (Orange bid). Otherwise a slim strip with a camera chip. */
  camera?: boolean;
}) {
  return (
    <section className="photo-bar">
      {camRef ? (
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="photo-file"
          data-no-swipe
          onChange={(event) => onFiles?.(event.target.files)}
        />
      ) : null}
      {rollRef ? (
        <input
          ref={rollRef}
          type="file"
          accept="image/*"
          multiple
          className="photo-file"
          data-no-swipe
          onChange={(event) => onFiles?.(event.target.files)}
        />
      ) : null}
      {camera ? (
        <div className="talk-cam" data-orange-camera="1">
          <button type="button" className="talk-cam-btn" disabled={busy} data-no-swipe onClick={onSnap} aria-label={busy ? "Saving photo" : "Snap the job"}>
            <Camera className="size-6" />
            {busy ? "Saving…" : "Camera"}
          </button>
          <button type="button" className="talk-cam-roll" disabled={busy} data-no-swipe onClick={onRoll} aria-label="Pull photos from your roll">
            <Images className="size-4" />
            Roll
          </button>
        </div>
      ) : null}
      <PhotoStrip photos={photos} busy={busy} onSnap={camera ? undefined : onSnap} onRemove={onRemove} />
    </section>
  );
}
