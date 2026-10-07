import { documentTotals, isPricedLine, roundMoney, type DocLineDraft } from "@/lib/documents";
import { liveActualHours } from "@/lib/payroll";
import type {
  EmployeeDTO,
  EstimateDTO,
  InvoiceDTO,
  JobCostDTO,
  JobDTO,
} from "@/lib/types";

export const COST_OVER_RATIO = 1.08;

function roundHours(value: number) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function hourUnit(unit: string) {
  return /^(hr|hrs|hour|hours)$/i.test(unit.trim());
}

export const SHOP_HOURLY_RATE = 45;

export function laborHoursFromLines(lines: DocLineDraft[]) {
  const labor = lines.filter((line) => line.kind === "LABOR" && isPricedLine(line));
  const hourly = labor.filter((line) => hourUnit(line.unit));
  if (hourly.length) {
    return roundHours(hourly.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0));
  }
  const billed = labor.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.rate) || 0), 0);
  // Per-sq-ft or per-room labor: turn billed dollars into hours at a shop rate
  // (dividing by the per-unit rate made a $1.85/sq ft line read as 3,200 hr).
  return roundHours(billed / SHOP_HOURLY_RATE);
}

export function crewHourlyRate(employee: Pick<EmployeeDTO, "payType" | "hourlyRate" | "salaryAnnual">) {
  if (employee.payType === "SALARY") return roundMoney((employee.salaryAnnual || 0) / 2080);
  return roundMoney(employee.hourlyRate || 0);
}

export function costAlert(overLabor: boolean, overMaterial: boolean): JobCostDTO["alert"] {
  if (overLabor && overMaterial) return "both";
  if (overLabor) return "hours";
  if (overMaterial) return "materials";
  return null;
}

export function costForJob(input: {
  job: JobDTO;
  employees: EmployeeDTO[];
  estimate: EstimateDTO | null;
  invoices: InvoiceDTO[];
  now?: Date;
}): JobCostDTO {
  const now = input.now || new Date();
  const priced = (input.estimate?.lines || []).filter(isPricedLine);
  const totals = documentTotals(priced, input.estimate?.taxRate);
  const laborHoursBudget = laborHoursFromLines(priced);
  const invoice =
    [...input.invoices]
      .filter((item) => item.jobId === input.job.id)
      .sort((a, b) => b.number.localeCompare(a.number))[0] || null;

  let laborHoursActual = 0;
  let laborCostActual = 0;
  let materialActual = 0;
  let otherActual = 0;

  const workStart = input.estimate?.createdAt || input.estimate?.sentAt || null;
  const startDay = workStart ? workStart.slice(0, 10) : null;

  for (const employee of input.employees) {
    const rate = crewHourlyRate(employee);
    for (const entry of employee.timeEntries) {
      if (entry.jobId !== input.job.id) continue;
      if (startDay && entry.date.slice(0, 10) < startDay) continue;
      const hours = liveActualHours(entry, now);
      if (hours <= 0) continue;
      laborHoursActual += hours;
      laborCostActual += hours * rate;
    }
    for (const adj of employee.adjustments) {
      if (adj.jobId !== input.job.id) continue;
      if (adj.type !== "REIMBURSEMENT") continue;
      if (adj.category === "MATERIALS") materialActual += adj.amount;
      else otherActual += adj.amount;
    }
  }

  if (invoice) {
    for (const line of invoice.lines) {
      if (!isPricedLine(line)) continue;
      const amount = roundMoney((Number(line.quantity) || 0) * (Number(line.rate) || 0));
      if (line.kind === "MATERIAL") materialActual += amount;
      if (line.kind === "OTHER") otherActual += amount;
    }
  }

  laborHoursActual = roundHours(laborHoursActual);
  laborCostActual = roundMoney(laborCostActual);
  materialActual = roundMoney(materialActual);
  otherActual = roundMoney(otherActual);

  const revenue = roundMoney(
    invoice && (invoice.status === "PAID" || invoice.sentAt || invoice.amount > 0)
      ? invoice.amount
      : totals.total
  );
  const grossProfit = roundMoney(revenue - laborCostActual - materialActual - otherActual);
  const laborMargin =
    totals.labor > 0 ? roundMoney((totals.labor - laborCostActual) / totals.labor) : 0;
  const netMargin = revenue > 0 ? roundMoney(grossProfit / revenue) : 0;
  const overLabor = laborHoursBudget > 0 && laborHoursActual > laborHoursBudget * COST_OVER_RATIO;
  const overMaterial = totals.materials > 0 && materialActual > totals.materials * COST_OVER_RATIO;

  return {
    laborHoursBudget,
    laborHoursActual,
    laborCostBudget: totals.labor,
    laborCostActual,
    materialBudget: totals.materials,
    materialActual,
    otherBudget: totals.other,
    otherActual,
    revenue,
    grossProfit,
    laborMargin,
    netMargin,
    overLabor,
    overMaterial,
    alert: costAlert(overLabor, overMaterial),
  };
}

export function attachJobCosts(input: {
  jobs: JobDTO[];
  employees: EmployeeDTO[];
  estimates: EstimateDTO[];
  invoices: InvoiceDTO[];
  now?: Date;
}): JobDTO[] {
  const now = input.now || new Date();
  return input.jobs.map((job) => ({
    ...job,
    cost: costForJob({
      job,
      employees: input.employees,
      estimate: input.estimates.find((item) => item.jobId === job.id) || null,
      invoices: input.invoices,
      now,
    }),
  }));
}

export function costOverTalk(who: string, cost?: JobCostDTO | null) {
  if (!cost?.alert || cost.laborHoursActual + cost.materialActual <= 0) return "";
  if (cost.alert === "hours") {
    return `Hours on ${who} already passed the bid. Keep an eye on extras.`;
  }
  if (cost.alert === "materials") {
    return `Materials on ${who} went past the bid. That’s already on the job — no extra form.`;
  }
  return `${who} is running over on hours and materials. I’ll keep the margin in the background.`;
}
