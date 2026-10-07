"use client";

import { useEffect, useState } from "react";
import { speakText } from "@/hooks/use-voice";
import {
  VOICE_GENDER_EVENT,
  persistVoiceGender,
  pickSpeakingVoice,
  readVoiceGender,
  type VoiceGender,
} from "@/lib/voice-profile";
import styles from "./VoiceChoice.module.css";

const CHOICES: Array<{ id: VoiceGender; label: string }> = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
];

const SAMPLE = "This is the voice jobcommand.app uses on the job.";

/** Company > AI voice: Male / Female. Saved on this phone. Office only (Company desk). */
export function VoiceChoice() {
  const [gender, setGender] = useState<VoiceGender>("male");
  const [voiceName, setVoiceName] = useState("");

  useEffect(() => {
    const sync = () => {
      const next = readVoiceGender();
      setGender(next);
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      setVoiceName(synth ? pickSpeakingVoice(synth.getVoices(), next)?.name || "" : "");
    };
    sync();
    window.addEventListener(VOICE_GENDER_EVENT, sync);
    const synth = window.speechSynthesis;
    synth?.addEventListener?.("voiceschanged", sync);
    return () => {
      window.removeEventListener(VOICE_GENDER_EVENT, sync);
      synth?.removeEventListener?.("voiceschanged", sync);
    };
  }, []);

  function pick(next: VoiceGender) {
    setGender(next);
    persistVoiceGender(next);
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    speakText(SAMPLE, next);
  }

  return (
    <div className={styles.wrap} data-voice-settings="1" data-voice-gender={gender} data-voice-name={voiceName}>
      <p className="card-label">AI voice</p>
      <div className={`choice-row ${styles.row}`} role="radiogroup" aria-label="AI voice">
        {CHOICES.map((choice) => {
          const on = gender === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              role="radio"
              className={`${styles.pick}${on ? ` on ${styles.on}` : ""}`}
              aria-checked={on}
              aria-label={`AI voice: ${choice.label}`}
              data-voice-id={choice.id}
              onClick={() => pick(choice.id)}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
      <p className={styles.blurb}>
        {voiceName ? `This phone: ${voiceName}. ` : ""}Tap to hear it. For the most natural sound on iPhone, download an
        Enhanced or Premium voice in Settings › Accessibility › Spoken Content › Voices.
      </p>
    </div>
  );
}
