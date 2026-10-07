"use client";

import { useEffect, useRef, useState } from "react";
import { parseSiteTalk, type SiteTalkDraft } from "@/lib/site-talk";
import { browserOnline } from "@/lib/offline/net";
import { fileSet, uid } from "@/lib/offline/idb";
import { enqueue } from "@/lib/offline/queue";
import { flushQueue } from "@/lib/offline/sync";
import { isNetworkError } from "@/lib/offline/net";

export type VoiceStatus = "idle" | "recording" | "processing";

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function speechEngine() {
  const root = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = root.SpeechRecognition || root.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function recorderMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return types.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) || "";
}

export function useSiteVoice(input: {
  jobId: string;
  actor: string;
  onDraft: (draft: SiteTalkDraft) => void;
}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const recRef = useRef<SpeechRec | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const heardRef = useRef("");
  const onDraftRef = useRef(input.onDraft);
  onDraftRef.current = input.onDraft;
  const jobIdRef = useRef(input.jobId);
  jobIdRef.current = input.jobId;
  const actorRef = useRef(input.actor);
  actorRef.current = input.actor;

  useEffect(() => {
    return () => {
      recRef.current?.stop();
      mediaRef.current?.state === "recording" && mediaRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const supported =
    typeof window !== "undefined" &&
    (Boolean(navigator.mediaDevices?.getUserMedia) || Boolean(speechEngine()));

  async function ingest(blob: Blob | null, transcript: string) {
    setStatus("processing");
    const local = parseSiteTalk(transcript);
    if (local.notes || local.lines.length) onDraftRef.current(local);

    if (browserOnline()) {
      try {
        const form = new FormData();
        form.set("jobId", jobIdRef.current);
        if (transcript) form.set("transcript", transcript);
        if (blob && blob.size > 0) {
          form.set("file", new File([blob], "site-note.webm", { type: blob.type || "audio/webm" }));
        }
        const response = await fetch("/api/jobs/voice", { method: "POST", body: form });
        if (response.ok) {
          const draft = (await response.json()) as SiteTalkDraft;
          onDraftRef.current(draft);
          setStatus("idle");
          return;
        }
      } catch (error) {
        if (!isNetworkError(error) && !transcript) {
          setStatus("idle");
          throw error;
        }
      }
    }

    if (blob && blob.size > 0 && transcript.trim().length < 12) {
      const fileId = uid("file-");
      await fileSet(fileId, {
        blob,
        name: "site-note.webm",
        mime: blob.type || "audio/webm",
      });
      await enqueue({
        type: "voice.ingest",
        data: {
          jobId: jobIdRef.current,
          fileId,
          name: "site-note.webm",
          mime: blob.type || "audio/webm",
          transcript,
          actor: actorRef.current,
        },
      });
      void flushQueue();
    }
    setStatus("idle");
  }

  async function start() {
    heardRef.current = "";
    chunksRef.current = [];
    try {
      const mime = recorderMime();
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunksRef.current.push(event.data);
        };
        mediaRef.current = recorder;
        recorder.start();
      }
      const rec = speechEngine();
      if (rec) {
        rec.lang = "en-US";
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (event) => {
          const parts: string[] = [];
          for (let i = 0; i < event.results.length; i += 1) {
            const piece = event.results[i]?.[0]?.transcript?.trim();
            if (piece) parts.push(piece);
          }
          heardRef.current = parts.join(" ").trim();
        };
        rec.onerror = () => undefined;
        rec.onend = () => undefined;
        recRef.current = rec;
        try {
          rec.start();
        } catch {
          recRef.current = null;
        }
      }
      if (!mediaRef.current && !recRef.current) return false;
      setStatus("recording");
      return true;
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      return false;
    }
  }

  async function stop() {
    recRef.current?.stop();
    recRef.current = null;
    const recorder = mediaRef.current;
    mediaRef.current = null;
    const blob = await new Promise<Blob | null>((resolve) => {
      if (!recorder || recorder.state === "inactive") {
        resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder?.mimeType || "audio/webm" }) : null);
        return;
      }
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }) : null);
      };
      recorder.stop();
    });
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    await ingest(blob, heardRef.current);
  }

  async function toggle() {
    if (status === "processing") return;
    if (status === "recording") {
      await stop();
      return;
    }
    return start();
  }

  return { status, supported, toggle };
}
