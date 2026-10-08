"use client";

import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  CalendarDays,
  Users,
  FileText,
  Receipt,
  CreditCard,
  Camera,
  Images,
  Satellite,
  Clock,
  MessageSquare,
  Mic,
  StickyNote,
  ListChecks,
  FolderOpen,
  BarChart3,
  MapPin,
} from "lucide-react";

/**
 * App Home Screen — registry of every draggable mini-app in JobCommand.
 * (Eric 2026-10-08: "operating system for contractors")
 *
 * Each entry maps to EXISTING navigation — no parallel router.
 * Deep-links reuse the ?tab=&job=&stage= scheme EmployeeWorkspace already handles.
 * "action" kinds run something (camera capture, AI mic) instead of navigating.
 */

export type HomeAppKind = "view" | "action";
export type HomeAppRole = "ADMIN" | "CREW";

export interface HomeAppDef {
  id: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  emoji: string; // fallback glyph for compact tiles
  kind: HomeAppKind;
  roles: HomeAppRole[];
  /** Deep-link params or action descriptor. Consumed by HomeScreen. */
  open: { tab?: string; job?: string; stage?: string; action?: string };
}

export const HOME_APPS: HomeAppDef[] = [
  {
    id: "jobs",
    title: "Jobs",
    blurb: "Pipeline & job cards",
    icon: Briefcase,
    emoji: "💼",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "command" },
  },
  {
    id: "schedule",
    title: "Schedule",
    blurb: "Crew calendar",
    icon: CalendarDays,
    emoji: "🗓️",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "crew" },
  },
  {
    id: "customers",
    title: "Customers",
    blurb: "All customers & history",
    icon: Users,
    emoji: "👥",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "crew" },
  },
  {
    id: "estimates",
    title: "Estimates",
    blurb: "Build & send estimates",
    icon: FileText,
    emoji: "📝",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "command" },
  },
  {
    id: "invoices",
    title: "Invoices",
    blurb: "Billing & invoices",
    icon: Receipt,
    emoji: "🧾",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "command" },
  },
  {
    id: "payments",
    title: "Payments",
    blurb: "Collect & track pay",
    icon: CreditCard,
    emoji: "💳",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "command" },
  },
  {
    id: "camera",
    title: "Camera",
    blurb: "Auto-files to the job",
    icon: Camera,
    emoji: "📷",
    kind: "action",
    roles: ["ADMIN", "CREW"],
    open: { action: "camera" },
  },
  {
    id: "photos",
    title: "Photos",
    blurb: "Job photo folders",
    icon: Images,
    emoji: "🖼️",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "command" },
  },
  {
    id: "gps",
    title: "GPS",
    blurb: "Crew locations live",
    icon: Satellite,
    emoji: "🛰️",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { action: "gps" },
  },
  {
    id: "maps",
    title: "Maps",
    blurb: "Directions & sites",
    icon: MapPin,
    emoji: "🗺️",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "command" },
  },
  {
    id: "clock",
    title: "Time Clock",
    blurb: "Clock in / out",
    icon: Clock,
    emoji: "⏱️",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "crew" },
  },
  {
    id: "messages",
    title: "Messages",
    blurb: "Text customers & crew",
    icon: MessageSquare,
    emoji: "💬",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "command" },
  },
  {
    id: "ai",
    title: "AI Assistant",
    blurb: "Talk — it does the work",
    icon: Mic,
    emoji: "🎙️",
    kind: "action",
    roles: ["ADMIN", "CREW"],
    open: { action: "ai" },
  },
  {
    id: "notes",
    title: "Notes",
    blurb: "Job notes",
    icon: StickyNote,
    emoji: "📓",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "command" },
  },
  {
    id: "checklists",
    title: "Checklists",
    blurb: "Job checklists",
    icon: ListChecks,
    emoji: "✅",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "command" },
  },
  {
    id: "documents",
    title: "Documents",
    blurb: "Contracts & files",
    icon: FolderOpen,
    emoji: "📄",
    kind: "view",
    roles: ["ADMIN", "CREW"],
    open: { tab: "command" },
  },
  {
    id: "reports",
    title: "Reports",
    blurb: "Numbers & history",
    icon: BarChart3,
    emoji: "📊",
    kind: "view",
    roles: ["ADMIN"],
    open: { tab: "company" },
  },
];

export function getHomeApp(id: string): HomeAppDef | undefined {
  return HOME_APPS.find((a) => a.id === id);
}

export function appsForRole(role: HomeAppRole): HomeAppDef[] {
  return HOME_APPS.filter((a) => a.roles.includes(role));
}

/* ------------------------------------------------------------------ */
/* Home layout persistence (Phase 1: localStorage only, no DB)         */
/* ------------------------------------------------------------------ */

export interface HomeLayoutItem {
  /** "app" = registry app, "job" = job shortcut, "custom" = user-made app */
  kind: "app" | "job" | "custom";
  /** app id from registry, or job id, or custom id */
  refId: string;
  /** display title (custom apps + job shortcuts) */
  title?: string;
  /** emoji/icon override for custom apps */
  emoji?: string;
}

const LAYOUT_KEY = "jc-home-layout-v1";

const DEFAULT_LAYOUT: HomeLayoutItem[] = [
  { kind: "app", refId: "jobs" },
  { kind: "app", refId: "schedule" },
  { kind: "app", refId: "clock" },
  { kind: "app", refId: "camera" },
  { kind: "app", refId: "photos" },
  { kind: "app", refId: "gps" },
  { kind: "app", refId: "ai" },
  { kind: "app", refId: "invoices" },
];

export function loadHomeLayout(): HomeLayoutItem[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_LAYOUT;
    return parsed.filter(
      (i: unknown): i is HomeLayoutItem =>
        typeof i === "object" &&
        i !== null &&
        ["app", "job", "custom"].includes((i as HomeLayoutItem).kind) &&
        typeof (i as HomeLayoutItem).refId === "string"
    );
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveHomeLayout(items: HomeLayoutItem[]): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(items));
  } catch {
    /* storage full or unavailable — layout just won't persist */
  }
}
