import { crewHourlyRate, laborHoursFromLines } from "@/lib/job-cost-core";
import { liveActualHours } from "@/lib/payroll";
import { isPricedLine, roundMoney, type DocLineDraft } from "@/lib/documents";
import type { EmployeeDTO, EstimateDTO } from "@/lib/types";

function asDraft(line: DocLineDraft): DocLineDraft {
  return {
    id: line.id,
    kind: line.kind,
    description: line.description,
    quantity: Number(line.quantity) || 0,
    unit: line.unit || (line.kind === "LABOR" ? "hr" : "ea"),
    rate: Number(line.rate) || 0,
  };
}

export function actualLaborHours(
  employees: EmployeeDTO[],
  jobId: string,
  now = new Date()
) {
  let hours = 0;
  for (const person of employees) {
    for (const entry of person.timeEntries) {
      if (entry.jobId !== jobId) continue;
      hours += liveActualHours(entry, now);
    }
  }
  return Math.round(hours * 10) / 10;
}

export function materialReimbursements(employees: EmployeeDTO[], jobId: string) {
  let amount = 0;
  for (const person of employees) {
    for (const adj of person.adjustments) {
      if (adj.jobId !== jobId) continue;
      if (adj.type !== "REIMBURSEMENT") continue;
      if (adj.category === "MATERIALS") amount += adj.amount;
    }
  }
  return roundMoney(amount);
}

function crewRate(employees: EmployeeDTO[]) {
  const rates = employees.map(crewHourlyRate).filter((rate) => rate > 0);
  if (!rates.length) return 45;
  return roundMoney(rates.reduce((sum, rate) => sum + rate, 0) / rates.length);
}

/** Pull verified estimate lines, swap in live labor hours, fold in job-site materials. */
export function compileInvoiceLines(input: {
  estimate: EstimateDTO | null;
  employees: EmployeeDTO[];
  jobId: string;
  now?: Date;
}): DocLineDraft[] {
  const now = input.now || new Date();
  const priced = (input.estimate?.lines || []).filter(isPricedLine).map(asDraft);
  const hours = actualLaborHours(input.employees, input.jobId, now);
  const extras = materialReimbursements(input.employees, input.jobId);
  const laborRate =
    priced.find((line) => line.kind === "LABOR" && Number(line.rate) > 0)?.rate || crewRate(input.employees);

  let lines = priced.length ? priced.map((line) => ({ ...line })) : [];
  if (hours > 0) {
    const labor = lines.find((line) => line.kind === "LABOR");
    if (labor) {
      labor.quantity = hours;
      labor.unit = "hr";
      labor.rate = labor.rate || laborRate;
      if (!labor.description.trim()) labor.description = "On-site labor";
    } else {
      lines.unshift({
        kind: "LABOR",
        description: "On-site labor",
        quantity: hours,
        unit: "hr",
        rate: laborRate,
      });
    }
  } else if (!lines.some((line) => line.kind === "LABOR")) {
    const budget = laborHoursFromLines(priced);
    if (budget > 0) {
      lines.unshift({
        kind: "LABOR",
        description: "Labor / scope",
        quantity: budget,
        unit: "hr",
        rate: laborRate,
      });
    }
  }

  if (extras > 0 && !lines.some((line) => /reimburse|job-site materials/i.test(line.description))) {
    lines.push({
      kind: "MATERIAL",
      description: "Job-site materials",
      quantity: 1,
      unit: "lot",
      rate: extras,
    });
  }

  if (!lines.length) {
    lines = [
      { kind: "LABOR", description: "On-site labor", quantity: hours || 1, unit: "hr", rate: laborRate },
      { kind: "MATERIAL", description: "Materials / scope", quantity: 1, unit: "lot", rate: 0 },
    ];
  }
  return lines;
}
