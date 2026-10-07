import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { employeeDTO } from "@/lib/queries";
import { timeActivityCsv } from "@/lib/export";
import { rejectRemovedLogin } from "@/lib/live-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const employeeId = request.nextUrl.searchParams.get("employeeId");
  const periodId = request.nextUrl.searchParams.get("periodId");
  if (!employeeId || !periodId) {
    return NextResponse.json({ error: "employeeId and periodId are required." }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      timeEntries: { include: { job: true, serviceCode: true }, orderBy: { date: "asc" } },
      payPeriods: { include: { adjustments: true }, orderBy: { startDate: "desc" } },
      adjustments: true,
      auditLogs: { take: 1 },
    },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const dto = employeeDTO(employee);
  const period = dto.payPeriods.find((item) => item.id === periodId);
  if (!period) {
    return NextResponse.json({ error: "Pay period not found." }, { status: 404 });
  }
  if (period.status !== "APPROVED" && period.status !== "PAID" && period.status !== "LOCKED") {
    return NextResponse.json(
      { error: "Supervisor approval is required before export." },
      { status: 409 }
    );
  }

  const entries = dto.timeEntries.filter(
    (entry) => entry.date >= period.startDate && entry.date <= period.endDate
  );
  const body = timeActivityCsv(dto, entries);
  const filename = `job-command-time-${dto.lastName}-${period.startDate}.csv`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
