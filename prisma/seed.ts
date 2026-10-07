import { PrismaClient } from "@prisma/client";
import { addDays, differenceInCalendarDays } from "date-fns";
import { computePay, deriveStatus } from "../lib/payroll";
import {
  PayFrequency,
  fromDayString,
  getPeriodContaining,
  shopToday,
  toDayString,
  utcDay,
} from "../lib/dates";
import { addHoursToTime } from "../lib/schedule";
import { holdUntilFor } from "../lib/alert-core";
import { ensureAccounts } from "../lib/accounts";
import { backfillEntryKinds } from "../lib/entry-kind-backfill";

const prisma = new PrismaClient();

// Sample data for Top Gun Painting (Hot Springs, AR). Phones use the fictional 555-01xx block,
// emails use .example, and street numbers are made up — none of it is a real customer.
function dayIso(offsetFromToday: number, today = shopToday()) {
  return toDayString(addDays(today, offsetFromToday));
}

function atHour(isoDate: string, hour: number, minute = 0) {
  const date = fromDayString(isoDate);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

function hash(input: string): number {
  let value = 0;
  for (const char of input) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

async function main() {
  await prisma.deliveryEvent.deleteMany();
  await prisma.docLine.deleteMany();
  await prisma.estimate.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.payAdjustment.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.payPeriod.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.job.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.serviceCode.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.pushDevice.deleteMany();
  await prisma.account.deleteMany();

  const jobs = await Promise.all([
    prisma.job.create({
      data: {
        code: "TGP-2041",
        name: "Clubhouse Exterior Repaint",
        client: "Harbor Point HOA",
        address: "210 Harbor Point Dr, Hot Springs, AR 71913",
      },
    }),
    prisma.job.create({
      data: {
        code: "TGP-1888",
        name: "Office Interior Repaint",
        client: "Northline Dental",
        address: "1400 Central Ave, Hot Springs, AR 71901",
      },
    }),
    prisma.job.create({
      data: {
        code: "TGP-2103",
        name: "Cabin Deck Stain & Trim",
        client: "Riverside Cabins",
        address: "305 Lakeshore Dr, Hot Springs, AR 71913",
      },
    }),
    prisma.job.create({
      data: {
        code: "TGP-1960",
        name: "Kitchen Cabinet Refinish",
        client: "Mercer Residence",
        address: "118 Park Ave, Hot Springs, AR 71901",
      },
    }),
  ]);

  const customerDetails = [
    { phone: "501-555-0141", email: "board@harborpointhoa.example" },
    { phone: "501-555-0188", email: "office@northlinedental.example" },
    { phone: "501-555-0103", email: "stay@riversidecabins.example" },
    { phone: "501-555-0160", email: "dana.mercer@mail.example" },
  ];

  const customers = await Promise.all(
    jobs.map((job, index) =>
      prisma.customer.create({
        data: {
          name: job.client,
          address: job.address,
          phone: customerDetails[index].phone,
          email: customerDetails[index].email,
        },
      })
    )
  );

  await Promise.all(
    jobs.map((job, index) =>
      prisma.job.update({
        where: { id: job.id },
        data: { customerId: customers[index].id },
      })
    )
  );

  const harborEstimate = await prisma.estimate.create({
    data: {
      number: "EST-1001",
      jobId: jobs[0].id,
      customerId: customers[0].id,
      status: "SENT",
      notes: "Clubhouse exterior — pressure wash, scrape, spot-prime, caulk, two coats on siding and trim.",
      sentAt: addDays(shopToday(), -3),
      sentEmail: true,
      sentSms: true,
      lines: {
        create: [
          {
            kind: "LABOR",
            description: "Wash, scrape, prime, and two coats — siding and trim",
            quantity: 3200,
            unit: "sq ft",
            rate: 1.85,
            sortOrder: 0,
          },
          {
            kind: "MATERIAL",
            description: "Exterior acrylic paint, primer, and caulk",
            quantity: 38,
            unit: "gal",
            rate: 72,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  const sentAt = addDays(shopToday(), -3);
  await prisma.deliveryEvent.createMany({
    data: [
      {
        estimateId: harborEstimate.id,
        customerId: customers[0].id,
        channel: "email",
        status: "sent",
        provider: "mock",
        toAddress: customerDetails[0].email,
        actor: "Office Admin",
        createdAt: sentAt,
      },
      {
        estimateId: harborEstimate.id,
        customerId: customers[0].id,
        channel: "email",
        status: "delivered",
        provider: "mock",
        toAddress: customerDetails[0].email,
        actor: "carrier",
        createdAt: new Date(sentAt.getTime() + 90_000),
      },
      {
        estimateId: harborEstimate.id,
        customerId: customers[0].id,
        channel: "sms",
        status: "sent",
        provider: "mock",
        toAddress: customerDetails[0].phone,
        actor: "Office Admin",
        createdAt: new Date(sentAt.getTime() + 2_000),
      },
      {
        estimateId: harborEstimate.id,
        customerId: customers[0].id,
        channel: "sms",
        status: "delivered",
        provider: "mock",
        toAddress: customerDetails[0].phone,
        actor: "carrier",
        createdAt: new Date(sentAt.getTime() + 120_000),
      },
    ],
  });

  await Promise.all([
    prisma.invoice.create({
      data: {
        number: "INV-1001",
        customerId: customers[0].id,
        jobId: jobs[0].id,
        amount: 2600,
        status: "PENDING",
        dueDate: addDays(shopToday(), 10),
      },
    }),
    prisma.invoice.create({
      data: {
        number: "INV-1002",
        customerId: customers[2].id,
        jobId: jobs[2].id,
        amount: 3450,
        status: "PENDING",
        dueDate: addDays(shopToday(), -4),
      },
    }),
    prisma.invoice.create({
      data: {
        number: "INV-1003",
        customerId: customers[3].id,
        jobId: jobs[3].id,
        amount: 2850,
        status: "DRAFT",
        dueDate: addDays(shopToday(), 21),
      },
    }),
  ]);

  const services = await Promise.all([
    prisma.serviceCode.create({
      data: {
        code: "PAINT-EXT",
        name: "Exterior painting",
        className: "Exterior",
      },
    }),
    prisma.serviceCode.create({
      data: {
        code: "PAINT-INT",
        name: "Interior painting",
        className: "Interior",
      },
    }),
    prisma.serviceCode.create({
      data: {
        code: "PREP-01",
        name: "Surface prep (wash, scrape, caulk)",
        className: "Prep",
      },
    }),
    prisma.serviceCode.create({
      data: {
        code: "GEN-LABOR",
        name: "General site labor",
        className: "General",
      },
    }),
  ]);

  const today = shopToday();
  const todayIso = toDayString(today);

  const crew = [
    {
      firstName: "Casey",
      lastName: "Quinn",
      jobTitle: "Lead Painter",
      photoUrl: "/avatars/maya.svg",
      email: "casey.quinn@topgunpainting.example",
      phone: "501-555-0148",
      payType: "HOURLY",
      hourlyRate: 26.5,
      salaryAnnual: 0,
      baselineStartDate: addDays(today, -126),
      payFrequency: "WEEKLY" as PayFrequency,
      federalWithholdPct: 14,
      stateWithholdPct: 4.95,
      job: jobs[1],
      service: services[1],
      today: {
        scheduledHours: 8,
        clockIn: atHour(todayIso, 12, 2),
        clockOut: null as Date | null,
        actualHours: 0,
      },
    },
    {
      firstName: "Jordan",
      lastName: "Vale",
      jobTitle: "Painter",
      photoUrl: "/avatars/jordan.svg",
      email: "jordan.vale@topgunpainting.example",
      phone: "501-555-0192",
      payType: "HOURLY",
      hourlyRate: 21,
      salaryAnnual: 0,
      baselineStartDate: addDays(today, -140),
      payFrequency: "BIWEEKLY" as PayFrequency,
      federalWithholdPct: 12,
      stateWithholdPct: 4.95,
      job: jobs[2],
      service: services[0],
      today: {
        scheduledHours: 8,
        clockIn: atHour(todayIso, 13, 4),
        clockOut: atHour(todayIso, 18, 28),
        actualHours: 5.4,
      },
    },
    {
      firstName: "Sam",
      lastName: "Ellison",
      jobTitle: "Crew Foreman",
      photoUrl: "/avatars/sam.svg",
      email: "sam.ellison@topgunpainting.example",
      phone: "501-555-0117",
      payType: "SALARY",
      hourlyRate: 29.81,
      salaryAnnual: 62000,
      baselineStartDate: addDays(today, -168),
      payFrequency: "ROLLING_3_WEEK" as PayFrequency,
      federalWithholdPct: 18,
      stateWithholdPct: 4.95,
      job: jobs[0],
      service: services[0],
      today: {
        scheduledHours: 8,
        clockIn: atHour(todayIso, 12, 0),
        clockOut: atHour(todayIso, 20, 6),
        actualHours: 8.1,
      },
    },
    {
      firstName: "Riley",
      lastName: "Nash",
      jobTitle: "Prep Tech",
      photoUrl: "/avatars/riley.svg",
      email: "riley.nash@topgunpainting.example",
      phone: "501-555-0164",
      payType: "HOURLY",
      hourlyRate: 17.5,
      salaryAnnual: 0,
      baselineStartDate: addDays(today, -84),
      payFrequency: "WEEKLY" as PayFrequency,
      federalWithholdPct: 10,
      stateWithholdPct: 4.95,
      job: jobs[0],
      service: services[2],
      today: {
        scheduledHours: 8,
        clockIn: atHour(todayIso, 13, 18),
        clockOut: atHour(todayIso, 17, 12),
        actualHours: 3.9,
      },
    },
    {
      firstName: "Avery",
      lastName: "Cole",
      jobTitle: "Painter",
      photoUrl: "/avatars/avery.svg",
      email: "avery.cole@topgunpainting.example",
      phone: "501-555-0180",
      payType: "HOURLY",
      hourlyRate: 20,
      salaryAnnual: 0,
      baselineStartDate: addDays(today, -112),
      payFrequency: "BIWEEKLY" as PayFrequency,
      federalWithholdPct: 12,
      stateWithholdPct: 4.95,
      job: jobs[3],
      service: services[1],
      today: {
        scheduledHours: 8,
        clockIn: null as Date | null,
        clockOut: null as Date | null,
        actualHours: 0,
      },
    },
  ];

  for (const member of crew) {
    const employee = await prisma.employee.create({
      data: {
        firstName: member.firstName,
        lastName: member.lastName,
        jobTitle: member.jobTitle,
        photoUrl: member.photoUrl,
        email: member.email,
        phone: member.phone,
        payType: member.payType,
        hourlyRate: member.hourlyRate,
        salaryAnnual: member.salaryAnnual,
        baselineStartDate: member.baselineStartDate,
        payFrequency: member.payFrequency,
        federalWithholdPct: member.federalWithholdPct,
        stateWithholdPct: member.stateWithholdPct,
        payMethod: "W2",
        filingStatus: "SINGLE",
        allowances: 1,
        onboardedAt: member.baselineStartDate,
      },
    });

    const startOffset = -differenceInCalendarDays(
      today,
      utcDay(member.baselineStartDate)
    );
    const entries = [];

    for (let offset = startOffset; offset <= 14; offset += 1) {
      const iso = dayIso(offset, today);
      const date = fromDayString(iso);
      const weekday = date.getUTCDay();
      const seed = hash(`${employee.id}:${iso}`);
      const isToday = iso === todayIso;
      const isFuture = date.getTime() > today.getTime();
      const saturdayOt = weekday === 6 && seed % 5 === 0 && !isFuture;

      let scheduledHours = weekday === 0 || weekday === 6 ? 0 : 8;
      if (saturdayOt) scheduledHours = 6;

      let actualHours = 0;
      let clockIn: Date | null = null;
      let clockOut: Date | null = null;

      if (isToday) {
        scheduledHours = member.today.scheduledHours;
        actualHours = member.today.actualHours;
        clockIn = member.today.clockIn;
        clockOut = member.today.clockOut;
      } else if (!isFuture && scheduledHours > 0) {
        const variance = ((seed % 9) - 4) * 0.1;
        actualHours = Math.max(0, Math.round((scheduledHours + variance) * 10) / 10);
        if (weekday === 5 && seed % 4 === 0) actualHours = 6.2;
        if (offset < -2 && seed % 17 === 0) actualHours = 0;
        if (actualHours > 0) {
          clockIn = atHour(iso, 12 + (seed % 2), 4 + (seed % 20));
          const endHour = 12 + actualHours;
          clockOut = atHour(
            iso,
            Math.min(23, Math.floor(endHour)),
            Math.round((endHour % 1) * 60)
          );
        }
      }

      const status = deriveStatus({
        date: iso,
        scheduledHours,
        actualHours,
        clockIn: clockIn?.toISOString() ?? null,
        clockOut: clockOut?.toISOString() ?? null,
      });

      // Only the last two weeks and the next two sit on these four open jobs. Older days are
      // shop/past-job hours with no job attached, so live job hours stay believable.
      const onOpenJobs = offset >= -10;
      const jobPick = onOpenJobs ? (seed % 4 === 0 ? jobs[seed % jobs.length] : member.job) : null;
      const servicePick =
        weekday === 6 ? services[3] : onOpenJobs ? member.service : services[3];

      entries.push({
        employeeId: employee.id,
        date,
        scheduledHours,
        actualHours,
        clockIn,
        clockOut,
        scheduledStart: scheduledHours > 0 ? "07:00" : null,
        scheduledEnd:
          scheduledHours > 0 ? addHoursToTime("07:00", scheduledHours) : null,
        status,
        jobId: scheduledHours > 0 ? (isToday ? member.job.id : jobPick?.id ?? null) : null,
        serviceCodeId:
          scheduledHours > 0
            ? isToday
              ? member.service.id
              : servicePick.id
            : null,
        notes:
          status === "EARLY_CLOCK_OUT"
            ? "Left site after material delay."
            : status === "MISSED"
              ? "Called out — rain hold on the exterior."
              : null,
      });
    }

    await prisma.timeEntry.createMany({ data: entries });

    const stored = await prisma.timeEntry.findMany({
      where: { employeeId: employee.id },
      orderBy: { date: "asc" },
    });

    let cursor = utcDay(member.baselineStartDate);
    const horizon = addDays(today, 0);
    let ytdGross = 0;
    let ytdFederal = 0;
    let ytdState = 0;
    let ytdNet = 0;
    let ytdOt = 0;

    while (cursor.getTime() < horizon.getTime()) {
      const span = getPeriodContaining(
        cursor,
        member.baselineStartDate,
        member.payFrequency
      );
      if (span.end.getTime() >= today.getTime()) break;

      const days = stored
        .filter(
          (entry) =>
            entry.date.getTime() >= span.start.getTime() &&
            entry.date.getTime() <= span.end.getTime()
        )
        .map((entry) => ({
          date: toDayString(entry.date),
          scheduledHours: entry.scheduledHours,
          actualHours: entry.actualHours,
          clockIn: entry.clockIn?.toISOString() ?? null,
          clockOut: entry.clockOut?.toISOString() ?? null,
        }));

      const tool = span.index % 2 === 0;
      const uniform = span.index % 4 === 1;
      const materials = span.index % 3 === 0;
      const adjustments = [
        tool
          ? {
              type: "REIMBURSEMENT" as const,
              amount: 35,
              category: "TOOL_ALLOWANCE",
              description: "Tool allowance",
            }
          : null,
        uniform
          ? {
              type: "DEDUCTION" as const,
              amount: 18.5,
              category: "UNIFORM",
              description: "Uniform replacement",
            }
          : null,
        materials
          ? {
              type: "REIMBURSEMENT" as const,
              amount: 62.4,
              category: "MATERIALS",
              description: "Job-site materials out of pocket",
            }
          : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item));

      const computed = computePay({
        payType: member.payType as "HOURLY" | "SALARY",
        hourlyRate: member.hourlyRate,
        salaryAnnual: member.salaryAnnual,
        frequency: member.payFrequency,
        federalWithholdPct: member.federalWithholdPct,
        stateWithholdPct: member.stateWithholdPct,
        baselineStartDate: toDayString(member.baselineStartDate),
        periodStart: toDayString(span.start),
        periodEnd: toDayString(span.end),
        days,
        adjustments,
      });

      const paidAt = addDays(span.end, 3);
      const period = await prisma.payPeriod.create({
        data: {
          employeeId: employee.id,
          startDate: span.start,
          endDate: span.end,
          frequency: member.payFrequency,
          regularHours: computed.regularHours,
          overtimeHours: computed.overtimeHours,
          regularPay: computed.regularPay,
          overtimePay: computed.overtimePay,
          grossPay: computed.grossPay,
          deductions: computed.deductions,
          reimbursements: computed.reimbursements,
          federalTax: computed.federalTax,
          stateTax: computed.stateTax,
          netPay: computed.netPay,
          status: "PAID",
          approvedBy: "Office Admin",
          approvedAt: addDays(span.end, 1),
          paidAt,
        },
      });

      if (adjustments.length) {
        await prisma.payAdjustment.createMany({
          data: adjustments.map((item) => ({
            employeeId: employee.id,
            payPeriodId: period.id,
            type: item.type,
            category: item.category,
            description: item.description,
            amount: item.amount,
          })),
        });
      }

      if (span.start.getUTCFullYear() === today.getUTCFullYear()) {
        ytdGross += computed.grossPay;
        ytdFederal += computed.federalTax;
        ytdState += computed.stateTax;
        ytdNet += computed.netPay;
        ytdOt += computed.overtimeHours;
      }

      cursor = addDays(span.end, 1);
    }

    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        ytdGross: Math.round(ytdGross * 100) / 100,
        ytdFederalTax: Math.round(ytdFederal * 100) / 100,
        ytdStateTax: Math.round(ytdState * 100) / 100,
        ytdNet: Math.round(ytdNet * 100) / 100,
        ytdOvertime: Math.round(ytdOt * 10) / 10,
      },
    });

    await prisma.auditLog.createMany({
      data: [
        {
          employeeId: employee.id,
          actor: "Office Admin",
          action: "Created employee profile",
          field: "profile",
          newValue: `${member.firstName} ${member.lastName}`,
          createdAt: member.baselineStartDate,
        },
        {
          employeeId: employee.id,
          actor: "Office Admin",
          action: "Updated hourly rate",
          field: "hourlyRate",
          oldValue: String(Math.max(0, member.hourlyRate - 1.25)),
          newValue: String(member.hourlyRate),
          createdAt: addDays(today, -21),
        },
        {
          employeeId: employee.id,
          actor: "Shop Lead",
          action: "Approved pay period",
          field: "status",
          oldValue: "OPEN",
          newValue: "PAID",
          createdAt: addDays(today, -8),
        },
      ],
    });
  }

  const casey = await prisma.employee.findFirst({ where: { firstName: "Casey" } });
  const now = new Date();
  const quietHeld = holdUntilFor("quiet", now, "19:00", "07:00");
  await prisma.alert.createMany({
    data: [
      {
        kind: "ESTIMATE_APPROVED",
        priority: "urgent",
        title: "Harbor Point HOA signed EST-1001",
        body: "Clubhouse Exterior Repaint is approved. Lock the start date.",
        href: `/?job=${jobs[0].id}`,
        jobId: jobs[0].id,
        pushedAt: now,
      },
      {
        kind: "DISPATCH",
        priority: "urgent",
        title: "Mid-day change · Casey",
        body: "Northline Dental interior is now 1:00–4:00p today.",
        href: casey ? `/?id=${casey.id}&tab=crew` : "/",
        employeeId: casey?.id ?? null,
        jobId: jobs[1].id,
        pushedAt: now,
      },
      {
        kind: "ESTIMATE_VIEWED",
        priority: "quiet",
        title: "EST-1001 opened",
        body: "Harbor Point HOA opened the Clubhouse Exterior Repaint quote.",
        href: `/?job=${jobs[0].id}`,
        jobId: jobs[0].id,
        heldUntil: quietHeld,
      },
    ],
  });

  await ensureAccounts();
  // Schedule tags: stage-2 (estimate) jobs book ESTIMATE visits, everything else JOB days.
  await backfillEntryKinds(prisma);

  console.log("Seeded Job Command crew, jobs, timesheets, payroll, and alerts.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
