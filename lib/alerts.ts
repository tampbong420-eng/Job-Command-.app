import { prisma } from "@/lib/prisma";
import { todayString, toDayString } from "@/lib/dates";
import { formatTimeLabel } from "@/lib/schedule";
import { sendWebPush } from "@/lib/push";
import {
  holdUntilFor,
  parseAlertKind,
  parseAlertPriority,
  type AlertDTO,
  type AlertKind,
  type AlertPriority,
} from "@/lib/alert-core";

async function quietWindow() {
  const row = await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", periodAnchor: new Date() },
    update: {},
  });
  return {
    start: row.quietStart || "19:00",
    end: row.quietEnd || "07:00",
  };
}

export function alertDTO(
  row: {
    id: string;
    kind: string;
    priority: string;
    title: string;
    body: string;
    href: string;
    jobId: string | null;
    employeeId: string | null;
    readAt: Date | null;
    heldUntil: Date | null;
    createdAt: Date;
  },
  now = new Date()
): AlertDTO {
  const heldUntil = row.heldUntil?.toISOString() ?? null;
  const held = Boolean(heldUntil && new Date(heldUntil).getTime() > now.getTime());
  return {
    id: row.id,
    kind: parseAlertKind(row.kind),
    priority: parseAlertPriority(row.priority),
    title: row.title,
    body: row.body,
    href: row.href,
    jobId: row.jobId,
    employeeId: row.employeeId,
    readAt: row.readAt?.toISOString() ?? null,
    heldUntil,
    held,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function releaseHeldAlerts(now = new Date()) {
  const due = await prisma.alert.findMany({
    where: { heldUntil: { lte: now }, pushedAt: null },
    orderBy: { createdAt: "asc" },
  });
  for (const alert of due) {
    await prisma.alert.update({
      where: { id: alert.id },
      data: { heldUntil: null, pushedAt: now },
    });
    await sendWebPush({
      title: alert.title,
      body: alert.body,
      href: alert.href,
      tag: alert.id,
    });
  }
  return due.length;
}

export async function raiseAlert(input: {
  kind: AlertKind;
  priority: AlertPriority;
  title: string;
  body: string;
  href?: string;
  jobId?: string | null;
  employeeId?: string | null;
}) {
  try {
    const quiet = await quietWindow();
    const now = new Date();
    const heldUntil = holdUntilFor(input.priority, now, quiet.start, quiet.end);
    const alert = await prisma.alert.create({
      data: {
        kind: input.kind,
        priority: input.priority,
        title: input.title,
        body: input.body,
        href: input.href || "/",
        jobId: input.jobId || null,
        employeeId: input.employeeId || null,
        heldUntil,
        pushedAt: heldUntil ? null : now,
      },
    });
    if (!heldUntil) {
      await sendWebPush({
        title: alert.title,
        body: alert.body,
        href: alert.href,
        tag: alert.id,
      });
    }
    return alertDTO(alert, now);
  } catch (error) {
    console.error("[alerts]", error);
    return null;
  }
}

export async function listAlerts(now = new Date()) {
  await releaseHeldAlerts(now);
  const rows = await prisma.alert.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return rows.map((row) => alertDTO(row, now));
}

export async function markAlertsRead(ids: string[]) {
  if (!ids.length) return;
  await prisma.alert.updateMany({
    where: { id: { in: ids } },
    data: { readAt: new Date() },
  });
}

export async function raiseEstimateAlert(input: {
  estimateId: string;
  kind: "ESTIMATE_APPROVED" | "ESTIMATE_CHANGES" | "ESTIMATE_VIEWED";
  actor?: string;
}) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: input.estimateId },
    include: { job: true, customer: true },
  });
  if (!estimate) return null;
  const who = input.actor || estimate.signedName || estimate.customer?.name || estimate.job.client;
  const job = estimate.job.name;
  const number = estimate.number;
  if (input.kind === "ESTIMATE_APPROVED") {
    return raiseAlert({
      kind: "ESTIMATE_APPROVED",
      priority: "urgent",
      title: `${who} signed ${number}`,
      body: `${job} is approved. Lock the start date.`,
      href: `/?job=${estimate.jobId}`,
      jobId: estimate.jobId,
    });
  }
  if (input.kind === "ESTIMATE_CHANGES") {
    return raiseAlert({
      kind: "ESTIMATE_CHANGES",
      priority: "urgent",
      title: `Changes on ${number}`,
      body: `${who} asked to revise ${job}.`,
      href: `/?job=${estimate.jobId}`,
      jobId: estimate.jobId,
    });
  }
  return raiseAlert({
    kind: "ESTIMATE_VIEWED",
    priority: "quiet",
    title: `${number} opened`,
    body: `${who} opened the ${job} quote.`,
    href: `/?job=${estimate.jobId}`,
    jobId: estimate.jobId,
  });
}

export async function raiseScheduleAlert(input: {
  employeeId: string;
  date: string;
  jobId: string | null;
  scheduledHours: number;
  start: string | null;
  end: string | null;
  previous?: {
    jobId: string | null;
    scheduledHours: number;
    start: string | null;
    end: string | null;
  } | null;
}) {
  if (input.scheduledHours <= 0 && !input.jobId) {
    if (input.previous?.jobId && input.date === todayString()) {
      const person = await prisma.employee.findUnique({ where: { id: input.employeeId } });
      return raiseAlert({
        kind: "DISPATCH",
        priority: "urgent",
        title: `Stop pulled · ${person?.firstName || "Crew"}`,
        body: `Today’s packed stop was cleared.`,
        href: `/?id=${input.employeeId}&tab=schedule`,
        employeeId: input.employeeId,
      });
    }
    return null;
  }
  const person = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  const job = input.jobId ? await prisma.job.findUnique({ where: { id: input.jobId } }) : null;
  const when = `${formatTimeLabel(input.start)}–${formatTimeLabel(input.end)}`;
  const who = person?.firstName || "Crew";
  const site = job?.name || job?.client || "a stop";
  const prev = input.previous;
  const changed = Boolean(
    prev &&
      (prev.jobId !== input.jobId || prev.start !== input.start || prev.end !== input.end || prev.scheduledHours !== input.scheduledHours)
  );
  const assigned = !prev || (prev.scheduledHours <= 0 && input.scheduledHours > 0);
  const today = input.date === todayString();
  if (assigned && !changed) {
    return raiseAlert({
      kind: "SCHEDULE_ASSIGNED",
      priority: today ? "urgent" : "normal",
      title: today ? `Dispatch · ${who}` : `${who} packed`,
      body: `${site} ${toDayString(input.date)} ${when}.`,
      href: `/?id=${input.employeeId}&tab=crew`,
      jobId: input.jobId,
      employeeId: input.employeeId,
    });
  }
  if (changed) {
    return raiseAlert({
      kind: today ? "DISPATCH" : "SCHEDULE_CHANGED",
      priority: today ? "urgent" : "normal",
      title: today ? `Mid-day change · ${who}` : `${who} moved`,
      body: `${site} is now ${when} on ${toDayString(input.date)}.`,
      href: `/?id=${input.employeeId}&tab=crew`,
      jobId: input.jobId,
      employeeId: input.employeeId,
    });
  }
  return null;
}
