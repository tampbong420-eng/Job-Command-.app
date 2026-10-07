"use client";

import { useEffect, useRef, useState } from "react";
import { cacheJobPhoto, deleteJobPhotoOffline } from "@/lib/offline/actions";
import {
  forgetJobPhoto,
  isReplacedLocalPhoto,
  localPhotosByJob,
  rememberJobPhoto,
  rememberLocalPhotoUrl,
  rememberedPhotosForJob,
  revokeLocalPhotoUrl,
} from "@/lib/offline/cache";
import { isLocalId, uid } from "@/lib/offline/idb";
import { keepPendingPhotos } from "@/lib/photo-cache";
import type { JobDTO, JobPhotoDTO } from "@/lib/types";

type SyncedDetail = {
  jobId: string;
  localPhotoId: string;
  photo: JobPhotoDTO;
};

function photoKey(photos: JobPhotoDTO[]) {
  return photos.map((photo) => photo.id).join("|");
}

export function useJobPhotos(job: JobDTO, actor: string) {
  const [photos, setPhotos] = useState<JobPhotoDTO[]>(() =>
    keepPendingPhotos(job.photos, rememberedPhotosForJob(job.id))
  );
  const [busy, setBusy] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const rollRef = useRef<HTMLInputElement>(null);
  const serverKey = photoKey(job.photos);

  useEffect(() => {
    let cancelled = false;
    void localPhotosByJob().then((map) => {
      if (cancelled) return;
      setPhotos((current) =>
        keepPendingPhotos(
          job.photos,
          map[job.id] || [],
          rememberedPhotosForJob(job.id),
          current.filter((photo) => isLocalId(photo.id) && !isReplacedLocalPhoto(photo.id))
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [job.id, serverKey, job.photos]);

  useEffect(() => {
    function onSynced(event: Event) {
      const detail = (event as CustomEvent<SyncedDetail>).detail;
      if (!detail || detail.jobId !== job.id) return;
      rememberJobPhoto(detail.jobId, detail.photo, detail.localPhotoId);
      setPhotos((current) =>
        keepPendingPhotos(
          [],
          current.map((photo) => (photo.id === detail.localPhotoId ? detail.photo : photo)),
          [detail.photo]
        )
      );
      window.setTimeout(() => revokeLocalPhotoUrl(detail.localPhotoId), 4000);
    }
    window.addEventListener("job-command-photo-synced", onSynced);
    return () => window.removeEventListener("job-command-photo-synced", onSynced);
  }, [job.id]);

  async function ingest(list: FileList | null) {
    if (!list?.length) return [] as JobPhotoDTO[];
    setBusy(true);
    const previews = Array.from(list).map((file) => {
      const id = uid("local:photo:");
      const url = URL.createObjectURL(file);
      rememberLocalPhotoUrl(id, url);
      const photo: JobPhotoDTO = {
        id,
        url,
        caption: "On-site photo",
        createdAt: new Date().toISOString(),
      };
      rememberJobPhoto(job.id, photo);
      return { ...photo, file };
    });
    setPhotos((current) => keepPendingPhotos(current, previews.map(({ file: _file, ...photo }) => photo)));
    try {
      const next: JobPhotoDTO[] = [];
      for (const preview of previews) {
        const saved = await cacheJobPhoto({
          jobId: job.id,
          file: preview.file,
          actor,
          localPhotoId: preview.id,
        });
        next.push(saved);
        setPhotos((current) => current.map((photo) => (photo.id === preview.id ? saved : photo)));
      }
      return next;
    } finally {
      setBusy(false);
      if (camRef.current) camRef.current.value = "";
      if (rollRef.current) rollRef.current.value = "";
    }
  }

  async function remove(id: string) {
    await deleteJobPhotoOffline(id);
    forgetJobPhoto(job.id, id);
    setPhotos((current) => current.filter((photo) => photo.id !== id));
  }

  return {
    photos,
    busy,
    camRef,
    rollRef,
    pending: photos.filter((photo) => isLocalId(photo.id)).length,
    snap: () => camRef.current?.click(),
    roll: () => rollRef.current?.click(),
    ingest,
    remove,
  };
}
