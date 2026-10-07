"use client";

import { useEffect, useId } from "react";
import styles from "./FluorLamp.module.css";

const TICKS = [225, 700, 1250];
const LOCK_AT = 1950;

function bulbClick(at: number, freq: number, dur: number, gain: number, ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(48, freq * 0.4), at + dur);
  amp.gain.setValueAtTime(gain, at);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function FluorLamp({ live = false, short = false }: { live?: boolean; short?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const enamel = `enamel-${uid}`;
  const bulb = `bulb-${uid}`;

  useEffect(() => {
    if (live) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioCtx();
    } catch {
      return;
    }
    let closed = false;
    const arm = () => {
      if (closed) return;
      const start = ctx.currentTime + 0.02;
      TICKS.forEach((ms, index) => {
        bulbClick(start + ms / 1000, 140 - index * 12, 0.028, 0.012, ctx);
      });
      bulbClick(start + LOCK_AT / 1000, 220, 0.045, 0.04, ctx);
    };
    if (ctx.state === "running") arm();
    else void ctx.resume().then(arm).catch(() => undefined);
    return () => {
      closed = true;
      void ctx.close();
    };
  }, [live]);

  return (
    <div className={`${styles.rig}${live ? ` ${styles.live}` : ""}${short ? ` ${styles.short}` : ""}`} aria-hidden>
      <div className={styles.plate}>
        <span className={styles.pitch} />
        <span className={styles.screw} />
        <span className={`${styles.screw} ${styles.screwRight}`} />
      </div>
      <div className={styles.stem} />
      <svg className={styles.shade} viewBox="0 0 200 108" aria-hidden>
        <defs>
          <linearGradient id={enamel} x1="0" y1="0" x2="1" y2="0.2">
            <stop offset="0" stopColor="#101318" />
            <stop offset="0.18" stopColor="#9aa3ae" />
            <stop offset="0.4" stopColor="#232830" />
            <stop offset="0.55" stopColor="#e8edf3" />
            <stop offset="0.72" stopColor="#3a424c" />
            <stop offset="1" stopColor="#0c0e12" />
          </linearGradient>
          <radialGradient id={bulb} cx="50%" cy="38%" r="68%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="28%" stopColor="#f7ffd8" />
            <stop offset="62%" stopColor="#c6ff3a" />
            <stop offset="100%" stopColor="#243806" />
          </radialGradient>
        </defs>
        <path d="M78 0 H122 V18 H78 Z" fill={`url(#${enamel})`} />
        <path d="M58 26 C58 8 142 8 142 26 L168 62 C168 78 32 78 32 62 Z" fill={`url(#${enamel})`} />
        <path d="M70 22 C78 14 122 14 130 22" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="100" cy="66" rx="70" ry="16" fill="#0a0c10" />
        <ellipse className={styles.phosphor} cx="100" cy="64" rx="52" ry="13" fill={`url(#${bulb})`} />
        <ellipse cx="100" cy="58" rx="28" ry="4.5" fill="rgba(255,255,255,0.82)" />
        <path d="M36 64 H164" stroke="#1a1e24" strokeWidth="3" />
      </svg>
      <div className={styles.beam} />
      <div className={styles.glint} />
      <div className={styles.bounce} />
      <div className={styles.snap} />
    </div>
  );
}
