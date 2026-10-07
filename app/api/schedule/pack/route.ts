import { NextResponse } from "next/server";
import { driveTime } from "@/lib/drive";
import { shopAddress } from "@/lib/maps";
import { suggestPackedSlot, type PackSuggestion } from "@/lib/proximity";
import { loadWorkspace } from "@/lib/queries";
import { rejectRemovedLogin } from "@/lib/live-session";

export async function POST(request: Request) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const body = (await request.json().catch(() => ({}))) as {
    destination?: string;
    employeeId?: string;
    jobId?: string;
    fromDate?: string;
  };
  const destination = (body.destination || "").trim();
  if (destination.length < 5) {
    return NextResponse.json({ error: "Need a property address to pack a slot." }, { status: 400 });
  }

  const workspace = await loadWorkspace();
  const baseAddress = shopAddress(workspace.settings.businessAddress);
  const driveMemo = new Map<string, Awaited<ReturnType<typeof driveTime>>>();

  async function minutesFor(origin: string) {
    const key = `${origin}→${destination}`;
    const cached = driveMemo.get(key);
    if (cached) return cached;
    const leg = await driveTime(origin || baseAddress, destination);
    driveMemo.set(key, leg);
    return leg;
  }

  const selected = body.employeeId
    ? workspace.employees.filter((person) => person.id === body.employeeId)
    : workspace.employees;

  const packFor = async (employees: typeof workspace.employees) => {
    const origins = new Set<string>([baseAddress]);
    for (const person of employees) {
      for (const entry of person.timeEntries) {
        if (entry.job?.address) origins.add(entry.job.address);
      }
    }
    await Promise.all(Array.from(origins).map((origin) => minutesFor(origin)));
    const first = driveMemo.values().next().value;
    return suggestPackedSlot({
      employees,
      destination,
      baseAddress,
      employeeId: body.employeeId,
      ignoreJobId: body.jobId,
      fromDate: body.fromDate,
      driveSource: first?.source,
      driveMinutes: (origin) => {
        const key = `${origin}→${destination}`;
        return driveMemo.get(key)?.minutes ?? 12;
      },
    });
  };

  let suggestion: PackSuggestion | null = await packFor(selected.length ? selected : workspace.employees);
  let faster: PackSuggestion | null = null;
  if (body.employeeId && workspace.employees.length > 1) {
    const other = await packFor(workspace.employees);
    if (
      other &&
      suggestion &&
      (other.date < suggestion.date ||
        (other.date === suggestion.date && other.start < suggestion.start && other.employeeId !== suggestion.employeeId))
    ) {
      faster = other;
    } else if (!suggestion) {
      suggestion = other;
    }
  }

  if (!suggestion) {
    return NextResponse.json({ error: "No open weekday slot in the next 3 weeks." }, { status: 404 });
  }

  return NextResponse.json({ suggestion, faster, shop: baseAddress });
}
