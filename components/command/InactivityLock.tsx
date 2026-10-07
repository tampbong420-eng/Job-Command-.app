"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Inactivity auto-lock (Eric, 2026-10-03).
 * After 60 seconds of no touch/mouse/keyboard, locks the screen with a PIN prompt.
 * The session stays alive (no logout) — just enter the PIN to continue.
 */

const INACTIVITY_MS = 60 * 1000;

export function InactivityLock() {
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const timer = useRef<number | null>(null);
  const lastActive = useRef<number>(Date.now());

  const resetTimer = useCallback(() => {
    lastActive.current = Date.now();
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setLocked(true);
      setPin("");
      setError("");
    }, INACTIVITY_MS);
  }, []);

  useEffect(() => {
    const events = ["mousedown", "touchstart", "keydown", "scroll", "click"];
    const onActivity = () => {
      if (!locked) resetTimer();
    };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [locked, resetTimer]);

  const unlock = useCallback(async () => {
    if (pin.length < 4 || checking) return;
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        setLocked(false);
        setPin("");
        resetTimer();
      } else {
        setError("Wrong PIN. Try again.");
        setPin("");
      }
    } catch {
      setError("Could not verify. Try again.");
    } finally {
      setChecking(false);
    }
  }, [pin, checking, resetTimer]);

  if (!locked) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
      }}
    >
      <div style={{ color: "#fff", fontSize: 20, fontWeight: 800 }}>Locked</div>
      <div style={{ color: "#a1a1aa", fontSize: 14 }}>Enter your PIN to continue</div>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => {
          if (e.key === "Enter") unlock();
        }}
        style={{
          fontSize: 24,
          textAlign: "center",
          letterSpacing: 8,
          padding: "12px 16px",
          borderRadius: 12,
          border: "2px solid #a3e635",
          background: "#09090b",
          color: "#fff",
          width: 200,
          outline: "none",
        }}
      />
      {error ? <div style={{ color: "#f87171", fontSize: 14 }}>{error}</div> : null}
      <button
        type="button"
        onClick={unlock}
        disabled={checking || pin.length < 4}
        style={{
          padding: "12px 32px",
          borderRadius: 12,
          background: "#a3e635",
          color: "#1a2e05",
          fontWeight: 800,
          fontSize: 16,
          border: "none",
          cursor: "pointer",
          opacity: checking || pin.length < 4 ? 0.5 : 1,
        }}
      >
        {checking ? "Checking..." : "Unlock"}
      </button>
    </div>
  );
}
