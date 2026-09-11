"use client";

import { parseTalk } from "@/lib/commands";
import type { ShopSnapshot, TalkResult } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognition(): SpeechRec | null {
  const Speech =
    typeof window === "undefined"
      ? null
      : (
          window as Window & {
            SpeechRecognition?: new () => SpeechRec;
            webkitSpeechRecognition?: new () => SpeechRec;
          }
        ).SpeechRecognition ??
        (
          window as Window & {
            webkitSpeechRecognition?: new () => SpeechRec;
          }
        ).webkitSpeechRecognition;
  if (!Speech) return null;
  const rec = new Speech();
  rec.lang = "en-US";
  rec.interimResults = false;
  return rec;
}

export default function TalkButton({
  snapshot,
  onResult,
}: {
  snapshot: ShopSnapshot;
  onResult: (result: TalkResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [heard, setHeard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    return () => recRef.current?.stop();
  }, []);

  async function run(commandText: string) {
    const spoken = commandText.trim();
    if (!spoken) return;
    setBusy(true);
    setHeard(spoken);
    try {
      const response = await fetch("/api/talk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: spoken, snapshot }),
      });
      const payload = (await response.json()) as TalkResult;
      onResult(payload.commands ? payload : parseTalk(spoken, snapshot));
      setText("");
      setOpen(false);
    } catch {
      onResult(parseTalk(spoken, snapshot));
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    const rec = getRecognition();
    if (!rec) {
      setHeard("Mic is not available here — type the command.");
      return;
    }
    recRef.current = rec;
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setText(transcript);
      void run(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <>
      <button
        type="button"
        className={`talk-fab${listening ? " is-hot" : ""}`}
        onClick={() => setOpen(true)}
      >
        AI Talk
      </button>
      {open && (
        <div className="sheet-backdrop talk-backdrop" onClick={() => setOpen(false)}>
          <section
            className="property-sheet plate talk-sheet"
            role="dialog"
            aria-labelledby="talk-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="property-head">
              <p className="card-label">Voice desk</p>
              <button type="button" className="text-back" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <h2 id="talk-title">Push talk</h2>
            <p className="board-copy">
              Status, estimates, time cards, delete, assign — say it and it files
              on the right customer.
            </p>
            <textarea
              className="talk-input"
              rows={3}
              value={text}
              placeholder='Try “mark Priya pending” or “estimate $1800 for Maya Chen”'
              onChange={(event) => setText(event.target.value)}
            />
            <div className="talk-actions">
              <button
                type="button"
                className={`ghost-action${listening ? " hours" : ""}`}
                onClick={listen}
                disabled={busy}
              >
                {listening ? "Listening" : "Hold mic"}
              </button>
              <button
                type="button"
                className="lock-button locked"
                disabled={busy || !text.trim()}
                onClick={() => void run(text)}
              >
                <span>
                  <small>{busy ? "Filing" : "Send to desk"}</small>
                  <b>{busy ? "WORKING" : "DO IT"}</b>
                </span>
              </button>
            </div>
            {heard && <p className="talk-heard">Heard: {heard}</p>}
          </section>
        </div>
      )}
    </>
  );
}
