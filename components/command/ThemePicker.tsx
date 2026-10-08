"use client";

import { useEffect, useRef, useState } from "react";
import { SHELL_THEME_CHOICES, WORKFLOW_STEPS, shellThemeById, type ShellThemeId } from "@/lib/shell-theme";
import { useShellTheme } from "@/hooks/use-shell-theme";
import styles from "./ThemePicker.module.css";
import {
  DARK_TYPE_INKS,
  LIGHT_TYPE_INKS,
  type DarkTypeInkId,
  type LightTypeInkId,
  type ShellInk,
} from "@/lib/shell-ink";

export function ThemePicker({
  value,
  onChange,
  ink,
  onInk,
  compact = false,
}: {
  value: ShellThemeId;
  onChange: (id: ShellThemeId) => void;
  ink?: ShellInk;
  onInk?: (ink: ShellInk) => void;
  compact?: boolean;
}) {
  // Auto paints whichever look fits right now; the letter colors follow that look.
  const { look } = useShellTheme();
  const canvas = shellThemeById(value === "auto" ? look : value).canvas;
  const letters = canvas === "light" ? LIGHT_TYPE_INKS : DARK_TYPE_INKS;
  const picked = canvas === "light" ? ink?.light || "" : ink?.dark || "";
  const inkRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    inkRef.current?.scrollIntoView({ block: "nearest" });
  }, [value, canvas]);
  const letterPicker =
    onInk && ink ? (
      <div ref={inkRef} className="type-ink-picker" data-type-ink-picker="1" data-ink-canvas={canvas}>
        <p className="card-label">Letter color</p>
        <div className="choice-row">
          {letters.map((letter) => {
            const on = picked === letter.id;
            return (
              <button
                key={letter.id}
                type="button"
                className={on ? "on" : ""}
                data-ink-id={letter.id}
                aria-pressed={on}
                onClick={() => {
                  if (canvas === "light") {
                    const light = (on ? "" : letter.id) as LightTypeInkId | "";
                    onInk({ dark: ink.dark, light });
                    return;
                  }
                  const dark = (on ? "" : letter.id) as DarkTypeInkId | "";
                  onInk({ dark, light: ink.light });
                }}
              >
                <i style={{ background: letter.color }} aria-hidden />
                {letter.label}
              </button>
            );
          })}
        </div>
      </div>
    ) : null;
  // Collapsible (Eric 2026-10-07): skins collapsed by default to save room in settings.
  const [open, setOpen] = useState(false);
  const currentChoice = SHELL_THEME_CHOICES.find((c) => c.id === value);
  return (
    <div className={`theme-picker${compact ? " compact" : ""}`} data-theme-picker="1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px",
          background: "var(--wb-fill, #161616)",
          color: "var(--wb-ink, #b2ff00)",
          border: "2px solid var(--wb-edge, #4a5d23)",
          borderRadius: "8px",
          cursor: "pointer",
          fontWeight: "bold",
        }}
        aria-expanded={open}
      >
        <span>{compact ? "App look" : "Pick your look"}: {currentChoice?.label || value}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open ? (<>
      <div className="theme-picker-steps" aria-hidden="true">
        {WORKFLOW_STEPS.map((step) => (
          <i key={step.key} style={{ background: step.pulse }} title={step.label} />
        ))}
      </div>
      <div className={`choice-stack theme-picker-choices ${styles.choices}`}>
        {SHELL_THEME_CHOICES.map((choice) => {
          const theme = choice.id === "auto" ? null : shellThemeById(choice.id);
          return (
            <div key={choice.id}>
              <button
                type="button"
                className={`${value === choice.id ? "on" : ""} ${styles.pick}`}
                data-theme-id={choice.id}
                data-theme-wash={theme?.wash ? "on" : "off"}
                data-theme-canvas={theme ? theme.canvas : "auto"}
                aria-pressed={value === choice.id}
                onClick={() => onChange(choice.id)}
              >
                <b>{choice.label}</b>
                <span>
                  {choice.line}
                  {choice.id === "auto" && value === "auto" ? ` Now: ${shellThemeById(look).label}.` : ""}
                </span>
                {theme?.palette ? (
                  <i className="theme-swatch" aria-hidden="true">
                    <s style={{ background: theme.palette.bg }} />
                    <s style={{ background: theme.palette.card }} />
                    <s style={{ background: theme.palette.accent }} />
                    <s style={{ background: theme.palette.ink }} />
                  </i>
                ) : null}
              </button>
              {value === choice.id ? letterPicker : null}
            </div>
          );
        })}
      </div>
      </>) : null}
    </div>
  );
}
