import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { prisma } from "@/lib/prisma";
import { employeeDTO } from "@/lib/queries";
import { computePay } from "@/lib/payroll";
import { formatDay, formatRange } from "@/lib/dates";
import { money } from "@/lib/format";
import type { PayFrequency } from "@/lib/types";
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
      { error: "Supervisor approval is required before a pay stub can be issued." },
      { status: 409 }
    );
  }

  const days = dto.timeEntries.filter(
    (entry) => entry.date >= period.startDate && entry.date <= period.endDate
  );
  const computed = computePay({
    payType: dto.payType,
    hourlyRate: dto.hourlyRate,
    salaryAnnual: dto.salaryAnnual,
    frequency: dto.payFrequency as PayFrequency,
    federalWithholdPct: dto.federalWithholdPct,
    stateWithholdPct: dto.stateWithholdPct,
    baselineStartDate: dto.baselineStartDate,
    periodStart: period.startDate,
    periodEnd: period.endDate,
    days,
    adjustments: period.adjustments,
  });

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const name = `${dto.firstName} ${dto.lastName}`;

  doc.setFillColor(12, 17, 16);
  doc.rect(0, 0, 612, 90, "F");
  doc.setTextColor(212, 162, 74);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("JOB COMMAND", 40, 40);
  doc.setTextColor(232, 239, 233);
  doc.setFontSize(11);
  doc.text("Employee pay stub", 40, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(formatRange(period.startDate, period.endDate), 400, 40);
  doc.text(period.status, 400, 58);

  doc.setTextColor(20, 28, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(name, 40, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(dto.jobTitle, 40, 138);
  doc.text(`Pay type: ${dto.payType} · ${dto.payFrequency.replaceAll("_", " ")}`, 40, 156);

  const rows: Array<[string, string]> = [
    ["Regular hours", computed.regularHours.toFixed(1)],
    ["Overtime hours (1.5x)", computed.overtimeHours.toFixed(1)],
    ["Regular pay", money(computed.regularPay)],
    ["Overtime pay", money(computed.overtimePay)],
    ["Reimbursements", money(computed.reimbursements)],
    ["Gross pay", money(computed.grossPay)],
    ["Deductions", `(${money(computed.deductions)})`],
    ["Federal withholding (est.)", `(${money(computed.federalTax)})`],
    ["State withholding (est.)", `(${money(computed.stateTax)})`],
    ["Net pay", money(computed.netPay)],
  ];

  let y = 190;
  doc.setFont("helvetica", "bold");
  doc.text("Earnings and withholdings", 40, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  rows.forEach(([label, value], index) => {
    if (index === rows.length - 1) {
      doc.setFont("helvetica", "bold");
      doc.setFillColor(245, 237, 214);
      doc.rect(36, y - 12, 540, 20, "F");
    }
    doc.text(label, 44, y);
    doc.text(value, 560, y, { align: "right" });
    y += 20;
    doc.setFont("helvetica", "normal");
  });

  y += 16;
  doc.setFont("helvetica", "bold");
  doc.text("Year-to-date", 40, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  [
    ["YTD gross", money(dto.ytdGross)],
    ["YTD federal", money(dto.ytdFederalTax)],
    ["YTD state", money(dto.ytdStateTax)],
    ["YTD net", money(dto.ytdNet)],
  ].forEach(([label, value]) => {
    doc.text(label, 44, y);
    doc.text(value, 280, y);
    y += 16;
  });

  y += 12;
  doc.setFont("helvetica", "bold");
  doc.text("Daily hours", 40, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  days
    .filter((entry) => entry.scheduledHours > 0 || entry.actualHours > 0)
    .forEach((entry) => {
      if (y > 720) {
        doc.addPage();
        y = 48;
      }
      const job = entry.job ? `${entry.job.code}` : "—";
      const svc = entry.serviceCode ? entry.serviceCode.code : "—";
      doc.text(
        `${formatDay(entry.date)}   sched ${entry.scheduledHours.toFixed(1)}   actual ${entry.actualHours.toFixed(1)}   ${job} / ${svc}`,
        44,
        y
      );
      y += 13;
    });

  y += 24;
  doc.setFontSize(10);
  doc.line(40, y, 260, y);
  doc.text(`Approved by ${period.approvedBy ?? "—"}`, 40, y + 16);
  doc.text("jobcommand.app · internal payroll document", 40, 760);

  const bytes = doc.output("arraybuffer");
  const filename = `payslip-${dto.lastName}-${period.startDate}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
