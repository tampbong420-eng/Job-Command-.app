"use client";

import { useState } from "react";

export default function ClockInOutTile() {
  const [clockedIn, setClockedIn] = useState(false);

  return (
    <>
      <button
        type="button"
        className={
          clockedIn ? "jc-clock-tile jc-clock-tile--in" : "jc-clock-tile jc-clock-tile--out"
        }
        aria-pressed={clockedIn}
        aria-label={clockedIn ? "Clock out" : "Clock in"}
        onClick={() => setClockedIn((current) => !current)}
      >
        <span className="jc-clock-tile__status">
          {clockedIn ? "Clocked In" : "Clocked Out"}
        </span>
      </button>
      <style>{clockInOutTileStyles}</style>
    </>
  );
}

const clockInOutTileStyles = `
.jc-clock-tile {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 280px;
  min-height: 128px;
  padding: 24px 36px;
  border: 0;
  border-radius: 20px;
  cursor: pointer;
  font-family: inherit;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.2;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 220ms ease, color 220ms ease, transform 160ms ease;
}

.jc-clock-tile:hover {
  transform: translateY(-1px);
}

.jc-clock-tile:active {
  transform: translateY(1px);
}

.jc-clock-tile:focus-visible {
  outline: 3px solid #ffffff;
  outline-offset: 4px;
}

.jc-clock-tile--out {
  background-color: #ff7700;
  color: #ffffff;
  box-shadow: none;
  animation: none;
}

.jc-clock-tile--in {
  background-color: #00ff66;
  color: #01331a;
  animation: jc-clock-tile-glow 1.7s ease-in-out infinite;
}

.jc-clock-tile__status {
  pointer-events: none;
}

@keyframes jc-clock-tile-glow {
  0%,
  100% {
    box-shadow:
      0 0 10px 2px rgba(0, 255, 102, 0.55),
      0 0 28px 8px rgba(0, 255, 102, 0.35),
      0 0 56px 16px rgba(0, 255, 102, 0.18);
  }
  50% {
    box-shadow:
      0 0 18px 6px rgba(0, 255, 102, 0.95),
      0 0 48px 18px rgba(0, 255, 102, 0.55),
      0 0 90px 32px rgba(0, 255, 102, 0.32);
  }
}

@media (prefers-reduced-motion: reduce) {
  .jc-clock-tile {
    transition: none;
  }

  .jc-clock-tile:hover,
  .jc-clock-tile:active {
    transform: none;
  }

  .jc-clock-tile--in {
    animation: none;
    box-shadow:
      0 0 16px 6px rgba(0, 255, 102, 0.75),
      0 0 40px 14px rgba(0, 255, 102, 0.4);
  }
}
`;
