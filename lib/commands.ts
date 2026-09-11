import type {
  CrewMember,
  Estimate,
  Job,
  JobStatus,
  ShopCommand,
  ShopSnapshot,
  ShopView,
  TalkResult,
  TimeCard,
} from "./types";

const STATUS_WORDS: { status: JobStatus; words: string[] }[] = [
  { status: "lead", words: ["new lead", "new leads", "lead"] },
  { status: "pending", words: ["pending"] },
  { status: "in_progress", words: ["active", "in progress"] },
  { status: "completed", words: ["finished", "complete", "completed", "done"] },
];

export function matchJob(jobs: Job[], query: string): Job | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (q === "this" || q === "that" || q === "current" || q === "the job") {
    return jobs[0] ?? null;
  }
  const scored = jobs
    .map((job) => {
      const hay = `${job.customerName} ${job.jobTitle} ${job.address} ${job.id}`.toLowerCase();
      let score = 0;
      if (hay.includes(q)) score += 8;
      for (const part of q.split(/\s+/)) {
        if (part.length > 2 && hay.includes(part)) score += 3;
      }
      return { job, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.job ?? null;
}

export function matchCrew(crew: CrewMember[], query: string): CrewMember | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    crew.find((row) => {
      const hay = `${row.name} ${row.id} ${row.role}`.toLowerCase();
      return hay.includes(q) || q.split(/\s+/).every((part) => hay.includes(part));
    }) ?? null
  );
}

function syncCrew(crew: CrewMember[], jobs: Job[]): CrewMember[] {
  return crew.map((member) => {
    if (!member.currentJobId) return member;
    const job = jobs.find((row) => row.id === member.currentJobId);
    if (!job || job.status !== "in_progress") {
      return { ...member, currentJobId: null, currentJob: "Unassigned" };
    }
    return { ...member, currentJob: job.jobTitle };
  });
}

function money(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function applyCommand(
  state: ShopSnapshot,
  command: ShopCommand,
  now = new Date().toISOString(),
): { state: ShopSnapshot; view: ShopView | null; notice: string } {
  if (command.type === "open") {
    return { state, view: command.view, notice: `Opened ${command.view}.` };
  }

  if (command.type === "set_status") {
    const job =
      matchJob(state.jobs, command.query) ??
      state.jobs.find((row) => row.id === state.selectedJobId) ??
      null;
    if (!job) return { state, view: "jobs", notice: "Could not find that customer." };
    const jobs = state.jobs.map((row) =>
      row.id === job.id ? { ...row, status: command.status } : row,
    );
    const crew = syncCrew(state.crew, jobs);
    const label =
      command.status === "lead"
        ? "New lead"
        : command.status === "pending"
          ? "Pending"
          : command.status === "in_progress"
            ? "Active"
            : "Finished";
    return {
      state: { ...state, jobs, crew },
      view: "jobs",
      notice: `${job.customerName} is ${label}.`,
    };
  }

  if (command.type === "delete_job") {
    const job = matchJob(state.jobs, command.query);
    if (!job) return { state, view: "jobs", notice: "Could not find that customer." };
    const jobs = state.jobs.filter((row) => row.id !== job.id);
    const estimates = state.estimates.filter((row) => row.jobId !== job.id);
    const timeCards = state.timeCards.filter((row) => row.jobId !== job.id);
    const crew = syncCrew(state.crew, jobs);
    return {
      state: { ...state, jobs, estimates, timeCards, crew },
      view: "jobs",
      notice: `Deleted ${job.customerName}.`,
    };
  }

  if (command.type === "create_estimate") {
    const job =
      matchJob(state.jobs, command.query) ??
      state.jobs.find((row) => row.id === state.selectedJobId) ??
      null;
    if (!job) return { state, view: "estimates", notice: "Need a customer for that estimate." };
    const estimate: Estimate = {
      id: `est-${job.id}-${Date.parse(now)}`,
      jobId: job.id,
      amount: command.amount,
      notes: command.notes ?? "",
      createdAt: now,
    };
    return {
      state: { ...state, estimates: [estimate, ...state.estimates] },
      view: "estimates",
      notice: `Estimate ${money(command.amount)} filed for ${job.customerName}.`,
    };
  }

  if (command.type === "create_timecard") {
    const employee =
      matchCrew(state.crew, command.employee) ??
      state.crew.find((row) => row.id === state.selectedCrewId) ??
      null;
    if (!employee) {
      return { state, view: "timecards", notice: "Need a crew member for that time card." };
    }
    const job = command.query ? matchJob(state.jobs, command.query) : null;
    const card: TimeCard = {
      id: `tc-${employee.id}-${Date.parse(now)}`,
      employeeId: employee.id,
      jobId: job?.id ?? employee.currentJobId,
      hours: command.hours,
      date: now.slice(0, 10),
      notes: command.notes ?? "",
    };
    const crew = state.crew.map((row) =>
      row.id === employee.id
        ? { ...row, weeklyHoursLogged: row.weeklyHoursLogged + command.hours }
        : row,
    );
    return {
      state: { ...state, timeCards: [card, ...state.timeCards], crew },
      view: "timecards",
      notice: `Time card ${command.hours}h for ${employee.name}.`,
    };
  }

  if (command.type === "assign") {
    const job = matchJob(state.jobs, command.query);
    const employee = matchCrew(state.crew, command.employee);
    if (!job || !employee) {
      return { state, view: "jobs", notice: "Need both a customer and a crew member." };
    }
    const jobs = state.jobs.map((row) => {
      if (row.id === job.id) {
        return {
          ...row,
          worker: employee.name,
          workerId: employee.id,
          status: row.status === "lead" || row.status === "pending" ? "in_progress" : row.status,
        };
      }
      if (row.workerId === employee.id && row.status === "in_progress") {
        return { ...row, worker: "Unassigned", workerId: null };
      }
      return row;
    });
    const crew = state.crew.map((row) =>
      row.id === employee.id
        ? { ...row, currentJobId: job.id, currentJob: job.jobTitle }
        : row.currentJobId === job.id
          ? { ...row, currentJobId: null, currentJob: "Unassigned" }
          : row,
    );
    return {
      state: { ...state, jobs, crew: syncCrew(crew, jobs) },
      view: "command",
      notice: `Assigned ${job.customerName} to ${employee.name}.`,
    };
  }

  if (command.type === "create_job") {
    const status = command.status ?? "lead";
    const job: Job = {
      id: `c-${command.customerName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.parse(now)}`,
      customerName: command.customerName,
      phone: command.phone ?? "",
      address: command.address ?? "",
      jobTitle: command.jobTitle ?? "New work",
      status,
      scheduledTime: "TBD",
      worker: "Unassigned",
      workerId: null,
      priority: "medium",
      lat: null,
      lng: null,
    };
    return {
      state: { ...state, jobs: [job, ...state.jobs] },
      view: "jobs",
      notice: `Added ${job.customerName} as ${status === "lead" ? "a new lead" : jobTitleStatus(status)}.`,
    };
  }

  return { state, view: null, notice: "Nothing to file." };
}

function jobTitleStatus(status: JobStatus): string {
  if (status === "pending") return "pending";
  if (status === "in_progress") return "active";
  if (status === "completed") return "finished";
  return "a new lead";
}

export function applyCommands(
  state: ShopSnapshot,
  commands: ShopCommand[],
  now = new Date().toISOString(),
): { state: ShopSnapshot; view: ShopView | null; notices: string[] } {
  let next = state;
  let view: ShopView | null = null;
  const notices: string[] = [];
  for (const command of commands) {
    const result = applyCommand(next, command, now);
    next = result.state;
    if (result.view) view = result.view;
    notices.push(result.notice);
  }
  return { state: next, view, notices };
}

function parseAmount(text: string): number | null {
  const match = text.match(/\$\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:dollars?|bucks)/i);
  if (match) {
    return Number((match[1] ?? match[2]).replace(/,/g, ""));
  }
  const bare = text.match(/estimate(?:\s+for)?[^0-9$]{0,40}?([\d,]+(?:\.\d+)?)/i);
  if (bare) return Number(bare[1].replace(/,/g, ""));
  return null;
}

function parseHours(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
  return match ? Number(match[1]) : null;
}

function parseStatus(text: string): JobStatus | null {
  const lower = text.toLowerCase();
  for (const row of STATUS_WORDS) {
    if (row.words.some((word) => lower.includes(word))) return row.status;
  }
  return null;
}

function afterKeyword(text: string, keyword: RegExp): string {
  const match = text.match(keyword);
  return match?.[1]?.trim() ?? "";
}

export function parseTalk(text: string, snapshot: ShopSnapshot): TalkResult {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  if (!raw) return { say: "I did not catch that.", commands: [] };

  if (/\b(estimates?|quote)\b/.test(lower) && /\b(open|show|go to|view)\b/.test(lower)) {
    return { say: "Opening estimates.", commands: [{ type: "open", view: "estimates" }] };
  }
  if (/\b(time cards?|timecards?|hours log)\b/.test(lower) && /\b(open|show|go to|view)\b/.test(lower)) {
    return { say: "Opening time cards.", commands: [{ type: "open", view: "timecards" }] };
  }
  if (/\b(jobs? board|customers?)\b/.test(lower) && /\b(open|show|go to|view)\b/.test(lower)) {
    return { say: "Opening the job board.", commands: [{ type: "open", view: "jobs" }] };
  }
  if (/\b(crew|command|hours calendar)\b/.test(lower) && /\b(open|show|go to)\b/.test(lower)) {
    const view = lower.includes("hour") ? "hours" : "command";
    return { say: `Opening ${view}.`, commands: [{ type: "open", view }] };
  }

  if (/\b(delete|remove|drop)\b/.test(lower)) {
    const query =
      afterKeyword(raw, /(?:delete|remove|drop)\s+(?:the\s+)?(?:job|customer|card)?\s*(?:for\s+)?(.+)/i) ||
      raw;
    return {
      say: `Deleting ${query}.`,
      commands: [{ type: "delete_job", query }],
    };
  }

  if (/\b(estimate|quote)\b/.test(lower)) {
    const amount = parseAmount(lower);
    const query =
      afterKeyword(raw, /(?:for|on)\s+(.+?)(?:\s+(?:at|for)\s+\$?\d|$)/i) ||
      snapshot.jobs.find((job) => job.id === snapshot.selectedJobId)?.customerName ||
      "";
    if (amount != null && query) {
      return {
        say: `Filing an estimate for ${query}.`,
        commands: [{ type: "create_estimate", query, amount }],
      };
    }
  }

  if (/\b(time card|timecard|log hours|clock hours)\b/.test(lower) || /\bhours?\b/.test(lower) && /\b(add|log|make|file)\b/.test(lower)) {
    const hours = parseHours(lower);
    const employee =
      afterKeyword(raw, /(?:for|on)\s+([a-z][a-z\s]+?)(?:\s+on\s+|\s+at\s+|$)/i) ||
      snapshot.crew.find((row) => row.id === snapshot.selectedCrewId)?.name ||
      "";
    const jobQuery = afterKeyword(raw, /\bon\s+(.+)$/i);
    if (hours != null && employee) {
      return {
        say: `Filing a time card.`,
        commands: [
          {
            type: "create_timecard",
            employee,
            hours,
            query: jobQuery || undefined,
          },
        ],
      };
    }
  }

  if (/\bassign\b/.test(lower)) {
    const assigned = raw.match(/assign\s+(.+?)\s+to\s+(.+)/i);
    if (assigned) {
      return {
        say: `Assigning ${assigned[1]} to ${assigned[2]}.`,
        commands: [{ type: "assign", query: assigned[1], employee: assigned[2] }],
      };
    }
  }

  const newLead = raw.match(/new lead(?:\s+for)?\s+([^,]+?)(?:\s+at\s+(.+?))?(?:\s+for\s+(.+))?$/i);
  if (newLead && !parseStatus(lower.replace("new lead", ""))) {
    return {
      say: `Adding ${newLead[1]} as a new lead.`,
      commands: [
        {
          type: "create_job",
          customerName: newLead[1].trim(),
          address: newLead[2]?.trim(),
          jobTitle: newLead[3]?.trim(),
          status: "lead",
        },
      ],
    };
  }

  const status = parseStatus(lower);
  if (status) {
    const query =
      afterKeyword(
        raw,
        /(?:mark|set|make|move|put)?\s*(.+?)\s+(?:as|to|is)?\s*(?:a\s+)?(?:new lead|pending|active|finished|complete[d]?|done|in progress)/i,
      ) ||
      afterKeyword(raw, /(?:new lead|pending|active|finished|complete[d]?)\s+(?:for\s+)?(.+)/i) ||
      snapshot.jobs.find((job) => job.id === snapshot.selectedJobId)?.customerName ||
      "";
    if (query) {
      return {
        say: `Updating ${query}.`,
        commands: [{ type: "set_status", query, status }],
      };
    }
  }

  return {
    say: "Tell me the customer and what to do — status, estimate, time card, or delete.",
    commands: [],
  };
}
