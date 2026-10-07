"use client";

import { useEffect, useRef, useState } from "react";
import { NATURAL_TTS, pickSpeakingVoice, readVoiceGender, type VoiceGender } from "@/lib/voice-profile";

type SpeechResult = ArrayLike<{ transcript: string }> & { isFinal?: boolean };

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
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

function readTranscript(results: ArrayLike<SpeechResult>, finalsOnly: boolean) {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const row = results[i];
    if (finalsOnly && row && row.isFinal === false) continue;
    const text = row?.[0]?.transcript?.trim();
    if (text) parts.push(text);
  }
  return parts.join(" ").trim();
}

/** Speak with ElevenLabs human voice (Eric, 2026-10-04). Falls back to device voice if TTS fails. */
function currentAudio(): HTMLAudioElement | null {
  return (window as unknown as { __jcTtsAudio?: HTMLAudioElement | null }).__jcTtsAudio || null;
}

function setCurrentAudio(el: HTMLAudioElement | null) {
  (window as unknown as { __jcTtsAudio?: HTMLAudioElement | null }).__jcTtsAudio = el;
}

export function stopSpeaking() {
  currentAudio()?.pause();
  setCurrentAudio(null);
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}

export async function speakText(textToSpeak: string, gender: VoiceGender = readVoiceGender()) {
  const text = String(textToSpeak || "").trim();
  if (!text) return;
  stopSpeaking();

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, gender }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    setCurrentAudio(audio);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio() === audio) setCurrentAudio(null);
    };
    await audio.play();
    return true;
  } catch {
    // Fallback: device voice (robotic, but better than silence)
    const synth = window.speechSynthesis;
    if (!synth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const preferredVoice = pickSpeakingVoice(synth.getVoices(), gender);
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang;
    } else utterance.lang = NATURAL_TTS.lang;
    utterance.rate = NATURAL_TTS.rate;
    utterance.pitch = NATURAL_TTS.pitch;
    synth.speak(utterance);
    return preferredVoice;
  }
}

export function useVoice(onHeard: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const onHeardRef = useRef(onHeard);
  const holdRef = useRef(false);
  const bufferRef = useRef("");
  onHeardRef.current = onHeard;

  useEffect(() => {
    return () => recRef.current?.stop();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    synth.getVoices();
    // Ensure voices are loaded (some browsers load them asynchronously)
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = () => synth.getVoices();
    }
    const prime = () => synth.getVoices();
    synth.addEventListener("voiceschanged", prime);
    return () => synth.removeEventListener("voiceschanged", prime);
  }, []);

  function flush() {
    const text = bufferRef.current.trim();
    bufferRef.current = "";
    if (text) onHeardRef.current(text);
  }

  function typingInField() {
    if (typeof document === "undefined") return false;
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
  }

  function speak(aiResponseText: string) {
    if (typeof window === "undefined") return;
    if (typingInField()) return;
    stopSpeaking();
    void speakText(aiResponseText);
  }

  function listen(opts?: { hold?: boolean }) {
    const rec = speechEngine();
    if (!rec) return false;
    recRef.current?.stop();
    holdRef.current = Boolean(opts?.hold);
    bufferRef.current = "";
    rec.lang = "en-US";
    rec.continuous = holdRef.current;
    rec.interimResults = holdRef.current;
    rec.onresult = (event) => {
      if (holdRef.current) {
        bufferRef.current = readTranscript(event.results, true) || readTranscript(event.results, false);
        return;
      }
      const text = readTranscript(event.results, false);
      if (text) onHeardRef.current(text);
    };
    rec.onend = () => {
      if (holdRef.current) flush();
      holdRef.current = false;
      setListening(false);
    };
    rec.onerror = () => {
      if (holdRef.current) flush();
      holdRef.current = false;
      setListening(false);
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
    return true;
  }

  function stop() {
    recRef.current?.stop();
    if (!holdRef.current) setListening(false);
  }

  return { listening, listen, stop, speak };
}
