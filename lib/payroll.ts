import { addDays } from "date-fns";
import {
  PayFrequency,
  eachDay,
  fromDayString,
  periodFromClock,
  periodsPerYear,
  startOfWorkweek,
  toDayString,
  todayString,
  utcDay,
  weekdayIndex,
} from "@/lib/dates";

export const OT_MULTIPLIER = 1.5;
export const WEEKLY_OT_THRESHOLD = 40;

export type PayType = "HOURLY" | "SALARY";
export type EntryStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETE"
  | "EARLY_CLOCK_OUT"
  | "INCOMPLETE"
  | "MISSED";

export type DayHours = {
  date: string;
  scheduledHours: number;
  actualHours: number;
  clockIn?: string | null;
  clockOut?: string | null;
};

export type AdjustmentInput = {
  type: "DEDUCTION" | "REIMBURSEMENT";
  amount: number;
};

export type PayComputeInput = {
  payType: PayType;
  hourlyRate: number;
  salaryAnnual: number;
  frequency: PayFrequency;
  federalWithholdPct: number;
  stateWithholdPct: number;
  baselineStartDate: string;
  periodStart: string;
  periodEnd: string;
  days: DayHours[];
  adjustments: AdjustmentInput[];
  now?: Date;
};

export type PayComputeResult = {
  regularHours: number;
  overtimeHours: number;
  scheduledHours: number;
  actualHours: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;
  deductions: number;
  reimbursements: number;
  federalTax: number;
  stateTax: number;
  netPay: number;
  weeks: {
    start: string;
    end: string;
    hours: number;
    regularHours: number;
    overtimeHours: number;
  }[];
};

export function groupDayHours(days: DayHours[]): DayHours[] {
  const map = new Map<string, DayHours>();
  for (const day of days) {
    const date = toDayString(day.date);
    const prev = map.get(date);
    if (!prev) {
      map.set(date, { ...day, date });
      continue;
    }
    prev.scheduledHours += day.scheduledHours;
    prev.actualHours += day.actualHours;
    if (day.clockIn && (!prev.clockIn || day.clockIn < prev.clockIn)) {
      prev.clockIn = day.clockIn;
    }
    if (day.clockOut && (!prev.clockOut || day.clockOut > prev.clockOut)) {
      prev.clockOut = day.clockOut;
    }
  }
  return Array.from(map.values());
}

export function liveActualHours(
  entry: Pick<DayHours, "date" | "actualHours" | "clockIn" | "clockOut">,
  now = new Date()
): number {
  const date = toDayString(entry.date);
  const today = todayString(now);
  if (entry.clockIn && !entry.clockOut && date === today) {
    const start = new Date(entry.clockIn).getTime();
    const hours = Math.max(0, (now.getTime() - start) / 3_600_000);
    return Math.round(hours * 10) / 10;
  }
  return roundHours(entry.actualHours);
}

export function deriveStatus(
  entry: DayHours,
  now = new Date()
): EntryStatus {
  const date = toDayString(entry.date);
  const today = todayString(now);
  const scheduled = entry.scheduledHours;
  const actual = liveActualHours(entry, now);

  if (entry.clockIn && !entry.clockOut && date === today) return "IN_PROGRESS";
  if (date > today) return "SCHEDULED";

  if (scheduled <= 0 && actual <= 0) return "SCHEDULED";

  if (date < today) {
    if (actual <= 0 && scheduled > 0) return "MISSED";
    if (actual + 0.05 >= scheduled && scheduled > 0) return "COMPLETE";
    if (entry.clockOut && actual + 0.25 < scheduled) return "EARLY_CLOCK_OUT";
    if (actual > 0 && actual + 0.05 < scheduled) return "INCOMPLETE";
    if (actual > 0) return "COMPLETE";
    return "SCHEDULED";
  }

  if (actual <= 0) return "SCHEDULED";
  if (entry.clockOut && actual + 0.25 < scheduled && scheduled > 0) {
    return "EARLY_CLOCK_OUT";
  }
  if (actual + 0.05 >= scheduled && scheduled > 0) return "COMPLETE";
  if (actual > 0 && actual < scheduled) return "INCOMPLETE";
  return "SCHEDULED";
}

export function roundHours(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function splitWorkweeks(
  periodStart: string,
  periodEnd: string,
  baselineStartDate: string,
  days: DayHours[],
  now = new Date()
) {
  const weekStartsOn = weekdayIndex(baselineStartDate);
  const hoursByDay = new Map(
    days.map((day) => [toDayString(day.date), liveActualHours(day, now)])
  );
  const weeks: {
    start: string;
    end: string;
    hours: number;
    regularHours: number;
    overtimeHours: number;
  }[] = [];

  let cursor = utcDay(periodStart);
  const last = utcDay(periodEnd);
  while (cursor.getTime() <= last.getTime()) {
    const weekStart = startOfWorkweek(cursor, weekStartsOn);
    const weekEnd = addDays(weekStart, 6);
    const spanStart =
      weekStart.getTime() < utcDay(periodStart).getTime()
        ? utcDay(periodStart)
        : weekStart;
    const spanEnd =
      weekEnd.getTime() > last.getTime() ? last : weekEnd;
    const hours = eachDay(spanStart, spanEnd).reduce((sum, date) => {
      return sum + (hoursByDay.get(toDayString(date)) ?? 0);
    }, 0);
    const overtimeHours = Math.max(0, hours - WEEKLY_OT_THRESHOLD);
    const regularHours = hours - overtimeHours;
    weeks.push({
      start: toDayString(spanStart),
      end: toDayString(spanEnd),
      hours: roundHours(hours),
      regularHours: roundHours(regularHours),
      overtimeHours: roundHours(overtimeHours),
    });
    cursor = addDays(spanEnd, 1);
  }

  return weeks;
}

export function computePay(input: PayComputeInput): PayComputeResult {
  const now = input.now ?? new Date();
  const days = groupDayHours(input.days);
  const weeks = splitWorkweeks(
    input.periodStart,
    input.periodEnd,
    input.baselineStartDate,
    days,
    now
  );

  const regularHours = roundHours(
    weeks.reduce((sum, week) => sum + week.regularHours, 0)
  );
  const overtimeHours = roundHours(
    weeks.reduce((sum, week) => sum + week.overtimeHours, 0)
  );
  const scheduledHours = roundHours(
    days.reduce((sum, day) => sum + day.scheduledHours, 0)
  );
  const actualHours = roundHours(regularHours + overtimeHours);

  const deductions = roundMoney(
    input.adjustments
      .filter((item) => item.type === "DEDUCTION")
      .reduce((sum, item) => sum + item.amount, 0)
  );
  const reimbursements = roundMoney(
    input.adjustments
      .filter((item) => item.type === "REIMBURSEMENT")
      .reduce((sum, item) => sum + item.amount, 0)
  );

  let regularPay = 0;
  let overtimePay = 0;

  if (input.payType === "SALARY") {
    regularPay = roundMoney(input.salaryAnnual / periodsPerYear(input.frequency));
    overtimePay = roundMoney(
      overtimeHours * (input.hourlyRate || input.salaryAnnual / 2080) * OT_MULTIPLIER
    );
  } else {
    regularPay = roundMoney(regularHours * input.hourlyRate);
    overtimePay = roundMoney(
      overtimeHours * input.hourlyRate * OT_MULTIPLIER
    );
  }

  const grossPay = roundMoney(regularPay + overtimePay + reimbursements);
  const taxable = roundMoney(Math.max(0, regularPay + overtimePay - deductions));
  const federalTax = roundMoney(taxable * (input.federalWithholdPct / 100));
  const stateTax = roundMoney(taxable * (input.stateWithholdPct / 100));
  const netPay = roundMoney(
    grossPay - deductions - federalTax - stateTax
  );

  return {
    regularHours,
    overtimeHours,
    scheduledHours,
    actualHours,
    regularPay,
    overtimePay,
    grossPay,
    deductions,
    reimbursements,
    federalTax,
    stateTax,
    netPay,
    weeks,
  };
}

export function currentPeriodFor(
  frequency: PayFrequency,
  baselineStartDate: string,
  date = new Date()
) {
  return periodFromClock(frequency, baselineStartDate, date, 0);
}

export function periodForCrew(
  settings: {
    setupComplete: boolean;
    payFrequency: PayFrequency;
    periodAnchor: string;
  },
  employee: { payFrequency: PayFrequency; baselineStartDate: string },
  date = new Date(),
  offset = 0
) {
  if (settings.setupComplete) {
    return periodFromClock(
      settings.payFrequency,
      settings.periodAnchor,
      date,
      offset
    );
  }
  return periodFromClock(
    employee.payFrequency,
    employee.baselineStartDate,
    date,
    offset
  );
}

export function salaryHourlyEquivalent(salaryAnnual: number): number {
  return roundMoney(salaryAnnual / 2080);
}

export function fromUtcDay(date: Date): Date {
  return fromDayString(toDayString(date));
}
