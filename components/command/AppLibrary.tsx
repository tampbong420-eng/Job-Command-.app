"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { HOME_APPS, type HomeAppRole, type HomeLayoutItem } from "@/lib/home-apps";

/**
 * App Library — the in-app "app store" for JobCommand.
 * (Eric 2026-10-08)
 *
 * Bottom-sheet overlay. Lists every available app; tap + to add to home.
 * Inline styles only.
 */

interface AppLibraryProps {
  role: HomeAppRole;
  installedIds: string[]; // app ids already on the home grid
  onAdd: (item: HomeLayoutItem) => void;
  onClose: () => void;
}

const LIME = "#a3e635";
const MUTED = "#71717a";

export function AppLibrary({ role, installedIds, onAdd, onClose }: AppLibraryProps) {
  const [query, setQuery] = useState("");
  const apps = HOME_APPS.filter(
    (a) =>
      a.roles.includes(role) &&
      (query.trim() === "" ||
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.blurb.toLowerCase().includes(query.toLowerCase()))
  );

  const overlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 70,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "flex-end",
  };
  const panel: CSSProperties = {
    width: "100%",
    maxHeight: "80%",
    background: "#141414",
    borderTop: `2px solid ${LIME}`,
    borderRadius: "18px 18px 0 0",
    padding: "16px 16px 30px",
    overflowY: "auto",
  };

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-label="App Library">
      <div style={panel}>
        <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", marginBottom: 4 }}>
          App Library
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
          Every tool in JobCommand. Tap + to add it to your home screen.
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search apps…"
          autoFocus
          style={{
            width: "100%",
            background: "#0a0a0a",
            border: "2px solid #333",
            borderRadius: 10,
            padding: "10px 12px",
            color: "#fff",
            fontSize: 14,
            marginBottom: 8,
            outline: "none",
          }}
        />
        {apps.map((app) => {
          const installed = installedIds.includes(app.id);
          return (
            <div
              key={app.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 4px",
                borderBottom: "1px solid #222",
              }}
            >
              <span
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  border: "2px solid #333",
                  background: "#0a0a0a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                {app.emoji}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{app.title}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{app.blurb}</div>
              </div>
              <button
                onClick={() =>
                  !installed && onAdd({ kind: "app", refId: app.id })
                }
                disabled={installed}
                aria-label={installed ? `${app.title} already added` : `Add ${app.title}`}
                style={{
                  background: "transparent",
                  border: `2px solid ${installed ? "#52525b" : LIME}`,
                  color: installed ? "#52525b" : LIME,
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  fontSize: 20,
                  fontWeight: 900,
                  cursor: installed ? "default" : "pointer",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                {installed ? "✓" : "+"}
              </button>
            </div>
          );
        })}
        {apps.length === 0 && (
          <div style={{ textAlign: "center", color: MUTED, fontSize: 13, padding: 20 }}>
            No apps match “{query}”.
          </div>
        )}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 14,
            background: "transparent",
            border: "2px solid #52525b",
            color: "#d4d4d8",
            borderRadius: 10,
            padding: 10,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
