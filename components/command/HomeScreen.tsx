"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { getHomeApp, type HomeLayoutItem } from "@/lib/home-apps";

/**
 * App Home Screen — the contractor's personalized workspace.
 * (Eric 2026-10-08: "operating system for contractors")
 *
 * Overlay surface (not a tab — the dock stays untouched).
 * Inline styles only, following the dock-rebuild precedent.
 */

interface EmployeeHead {
  id: string;
  name: string;
  initial: string;
  onJob: boolean;
  location: string;
}

interface JobShortcut {
  id: string;
  customerName: string;
  jobName: string;
  when: string;
}

interface HomeScreenProps {
  layout: HomeLayoutItem[];
  employees: EmployeeHead[];
  jobShortcuts: JobShortcut[];
  onOpenApp: (appId: string) => void;
  onOpenJob: (jobId: string) => void;
  onOpenEmployee: (empId: string) => void;
  onOpenLibrary: () => void;
  onRemoveItem: (index: number) => void;
  onClose: () => void;
}

const LIME = "#a3e635";
const ORANGE = "#fb923c";
const INK = "#f5f5f5";
const MUTED = "#71717a";

export function HomeScreen({
  layout,
  employees,
  jobShortcuts,
  onOpenApp,
  onOpenJob,
  onOpenEmployee,
  onOpenLibrary,
  onRemoveItem,
  onClose,
}: HomeScreenProps) {
  const [editMode, setEditMode] = useState(false);

  const overlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    background: "#0a0a0a",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };
  const header: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px 10px",
    borderBottom: "1px solid #1f1f1f",
    flexShrink: 0,
  };
  const title: CSSProperties = {
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: 0.5,
    color: INK,
  };
  const headerBtn: CSSProperties = {
    background: "transparent",
    border: `2px solid ${LIME}`,
    color: LIME,
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  };
  const body: CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "12px 14px 20px",
  };
  const sectionTitle: CSSProperties = {
    fontSize: 13,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: LIME,
    margin: "14px 0 10px",
  };
  const headsRow: CSSProperties = {
    display: "flex",
    gap: 12,
    overflowX: "auto",
    padding: "4px 2px 10px",
    scrollbarWidth: "none",
  };
  const grid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "14px 8px",
  };

  return (
    <div style={overlay} role="dialog" aria-label="Home screen">
      <div style={header}>
        <div style={title}>
          <span style={{ color: LIME }}>JOB COMMAND</span>
          <span style={{ color: ORANGE }}>.app</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{
              ...headerBtn,
              borderColor: editMode ? ORANGE : LIME,
              color: editMode ? ORANGE : LIME,
            }}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? "Done" : "Edit"}
          </button>
          <button style={{ ...headerBtn, borderColor: "#52525b", color: MUTED }} onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      <div style={body}>
        {employees.length > 0 && (
          <>
            <div style={sectionTitle}>On the clock</div>
            <div style={headsRow}>
              {employees.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onOpenEmployee(e.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 5,
                    minWidth: 68,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: "50%",
                      border: `2px solid ${e.onJob ? LIME : "#52525b"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                      fontWeight: 900,
                      background: "#1a1a1a",
                      color: e.onJob ? LIME : MUTED,
                      position: "relative",
                      boxShadow: e.onJob ? `0 0 12px ${LIME}59` : "none",
                    }}
                  >
                    {e.initial}
                    <span
                      style={{
                        position: "absolute",
                        bottom: 2,
                        right: 2,
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: "2px solid #0a0a0a",
                        background: e.onJob ? LIME : "#52525b",
                      }}
                    />
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#d4d4d8",
                      maxWidth: 68,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: e.onJob ? LIME : MUTED,
                    }}
                  >
                    {e.onJob ? "On job" : "Off"}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div style={sectionTitle}>My apps</div>
        <div style={grid}>
          {layout.map((item, i) => {
            const app = item.kind === "app" ? getHomeApp(item.refId) : undefined;
            const label = item.title ?? app?.title ?? item.refId;
            const emoji = item.emoji ?? app?.emoji ?? "📦";
            return (
              <div
                key={`${item.kind}-${item.refId}-${i}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  position: "relative",
                }}
              >
                {editMode && (
                  <button
                    onClick={() => onRemoveItem(i)}
                    aria-label={`Remove ${label}`}
                    style={{
                      position: "absolute",
                      top: -8,
                      right: 2,
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "#dc2626",
                      color: "#fff",
                      border: "2px solid #0a0a0a",
                      fontSize: 14,
                      fontWeight: 900,
                      cursor: "pointer",
                      zIndex: 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                )}
                <button
                  onClick={() => {
                    if (editMode) return;
                    if (item.kind === "job") onOpenJob(item.refId);
                    else if (app) onOpenApp(app.id);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    padding: 0,
                    animation: editMode ? "homeWiggle 0.4s ease-in-out infinite" : "none",
                  }}
                >
                  <span
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: 16,
                      border: "2px solid #333",
                      background: item.kind === "job" ? "#1a1206" : "#141414",
                      borderColor: item.kind === "job" ? ORANGE : "#333",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 26,
                    }}
                  >
                    {emoji}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#d4d4d8",
                      textAlign: "center",
                      maxWidth: 72,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </span>
                </button>
              </div>
            );
          })}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <button
              onClick={onOpenLibrary}
              aria-label="Add apps"
              style={{
                width: 62,
                height: 62,
                borderRadius: 16,
                border: `2px dashed ${LIME}`,
                background: "transparent",
                color: LIME,
                fontSize: 28,
                fontWeight: 900,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              +
            </button>
            <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>Add</span>
          </div>
        </div>

        {jobShortcuts.length > 0 && (
          <>
            <div style={sectionTitle}>Today&apos;s jobs</div>
            {jobShortcuts.map((j) => (
              <button
                key={j.id}
                onClick={() => onOpenJob(j.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "#141414",
                  border: `2px solid ${LIME}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  marginBottom: 10,
                  cursor: "pointer",
                  boxShadow: `0 0 14px ${LIME}26`,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>
                  {j.customerName}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: LIME, marginTop: 2 }}>
                  {j.jobName}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: ORANGE, marginTop: 4 }}>
                  {j.when}
                </div>
              </button>
            ))}
          </>
        )}
      </div>

      <style>{`@keyframes homeWiggle{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}`}</style>
    </div>
  );
}
