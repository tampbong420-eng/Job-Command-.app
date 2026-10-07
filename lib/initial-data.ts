/**
 * Isolated first-run mock/seed catalog.
 *
 * Not wired into Prisma, payroll, signup, or live user records.
 * App views may overlay this catalog for empty desks. Setup inputs
 * must never use these rows as `value` — placeholders only.
 */

import type { CustomerDTO, EmployeeDTO, JobDTO } from "@/lib/types";

export const MOCK_SEED_FLAG = "jc-mock-seed-v1";
export const MOCK_SEED_ID_PREFIX = "mock-";

export type MockCrewMember = {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  phone: string;
  email: string;
  hourlyRate: number;
  photoUrl: string;
  trade: string;
};

export type MockClient = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  contact: string;
};

export type MockJob = {
  id: string;
  code: string;
  name: string;
  clientId: string;
  client: string;
  address: string;
  notes: string;
  pipeline: number;
  dueDate: string;
  crewIds: string[];
};

export const MOCK_CREW: readonly MockCrewMember[] = [
  {
    id: "mock-crew-vale",
    firstName: "Jordan",
    lastName: "Vale",
    jobTitle: "Site Supervisor",
    phone: "5550101001",
    email: "jordan.vale@example.com",
    hourlyRate: 38,
    photoUrl: "https://randomuser.me/api/portraits/men/32.jpg",
    trade: "Supervision",
  },
  {
    id: "mock-crew-quinn",
    firstName: "Casey",
    lastName: "Quinn",
    jobTitle: "Lead Carpenter",
    phone: "5550101002",
    email: "casey.quinn@example.com",
    hourlyRate: 32,
    photoUrl: "https://randomuser.me/api/portraits/men/11.jpg",
    trade: "Carpentry",
  },
  {
    id: "mock-crew-nash",
    firstName: "Riley",
    lastName: "Nash",
    jobTitle: "Journeyman Painter",
    phone: "5550101003",
    email: "riley.nash@example.com",
    hourlyRate: 28,
    photoUrl: "https://randomuser.me/api/portraits/men/75.jpg",
    trade: "Painting",
  },
  {
    id: "mock-crew-cole",
    firstName: "Avery",
    lastName: "Cole",
    jobTitle: "Finish Carpenter",
    phone: "5550101004",
    email: "avery.cole@example.com",
    hourlyRate: 30,
    photoUrl: "https://randomuser.me/api/portraits/men/45.jpg",
    trade: "Finish carpentry",
  },
  {
    id: "mock-crew-ellis",
    firstName: "Morgan",
    lastName: "Ellis",
    jobTitle: "Lead Electrician",
    phone: "5550101005",
    email: "morgan.ellis@example.com",
    hourlyRate: 36,
    photoUrl: "https://randomuser.me/api/portraits/men/22.jpg",
    trade: "Electrical",
  },
  {
    id: "mock-crew-harper",
    firstName: "Drew",
    lastName: "Harper",
    jobTitle: "Apprentice Painter",
    phone: "5550101006",
    email: "drew.harper@example.com",
    hourlyRate: 18,
    photoUrl: "https://randomuser.me/api/portraits/men/64.jpg",
    trade: "Painting",
  },
] as const;

export const MOCK_CLIENTS: readonly MockClient[] = [
  {
    id: "mock-client-cedar",
    name: "Cedar Park HOA",
    phone: "5550104301",
    email: "jobs@cedar-park-hoa.example",
    address: "100 Maple Demo Rd, Millford, ST 00000",
    contact: "Taylor Grant",
  },
  {
    id: "mock-client-clinic",
    name: "Millford Clinic",
    phone: "5550104302",
    email: "office@millford-clinic.example",
    address: "24 Harbor Court, Millford, ST 00000",
    contact: "Dr. Quinn Hale",
  },
  {
    id: "mock-client-ridge",
    name: "Ridge Loop Residences",
    phone: "5550104303",
    email: "ops@ridge-loop.example",
    address: "9 Ridge Loop, Millford, ST 00000",
    contact: "Alex Rivers",
  },
] as const;

export const MOCK_JOBS: readonly MockJob[] = [
  {
    id: "mock-job-cedar-exterior",
    code: "MOCK-1104",
    name: "Cedar Park exterior repaint",
    clientId: "mock-client-cedar",
    client: "Cedar Park HOA",
    address: "100 Maple Demo Rd, Millford, ST 00000",
    notes: "Scrape and prime fascia, two coats Duration on siding. Crew on site weekdays 7–3.",
    pipeline: 3,
    dueDate: "2026-10-03",
    crewIds: ["mock-crew-vale", "mock-crew-nash", "mock-crew-harper"],
  },
  {
    id: "mock-job-clinic-lobby",
    code: "MOCK-1105",
    name: "Millford Clinic lobby and trim",
    clientId: "mock-client-clinic",
    client: "Millford Clinic",
    address: "24 Harbor Court, Millford, ST 00000",
    notes: "After-hours interior. Low-VOC finish in waiting room, halls, and front desk millwork.",
    pipeline: 2,
    dueDate: "2026-09-29",
    crewIds: ["mock-crew-quinn", "mock-crew-cole"],
  },
  {
    id: "mock-job-ridge-units",
    code: "MOCK-1106",
    name: "Ridge Loop unit turn",
    clientId: "mock-client-ridge",
    client: "Ridge Loop Residences",
    address: "9 Ridge Loop, Millford, ST 00000",
    notes: "Three vacant units: patch, paint, and swap damaged casing. Electric touch-up on unit 2.",
    pipeline: 1,
    dueDate: "2026-10-10",
    crewIds: ["mock-crew-nash", "mock-crew-ellis", "mock-crew-harper"],
  },
] as const;

export type MockSeedSnapshot = {
  flag: typeof MOCK_SEED_FLAG;
  crew: MockCrewMember[];
  clients: MockClient[];
  jobs: MockJob[];
};

export function isMockSeedId(id: string | null | undefined) {
  return Boolean(id && id.startsWith(MOCK_SEED_ID_PREFIX));
}

export function listMockSeedIds() {
  return {
    crew: MOCK_CREW.map((person) => person.id),
    clients: MOCK_CLIENTS.map((client) => client.id),
    jobs: MOCK_JOBS.map((job) => job.id),
  };
}

/** True when this catalog has rows, or when live records still carry mock ids. */
export function hasMockSeed(existingIds: readonly string[] = []) {
  const catalog =
    MOCK_CREW.length > 0 || MOCK_CLIENTS.length > 0 || MOCK_JOBS.length > 0;
  if (!existingIds.length) return catalog;
  return existingIds.some((id) => isMockSeedId(id));
}

/** Empty snapshot for a later wipe. Does not touch the database. */
export function clearMockSeed(): MockSeedSnapshot {
  return {
    flag: MOCK_SEED_FLAG,
    crew: [],
    clients: [],
    jobs: [],
  };
}

export function mockSeedSnapshot(): MockSeedSnapshot {
  return {
    flag: MOCK_SEED_FLAG,
    crew: [...MOCK_CREW],
    clients: [...MOCK_CLIENTS],
    jobs: [...MOCK_JOBS],
  };
}

export function examplePhone(digits: string) {
  const d = String(digits).replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return String(digits);
}

function crewLabel(ids: readonly string[]) {
  return ids
    .map((id) => MOCK_CREW.find((person) => person.id === id))
    .filter((person): person is MockCrewMember => Boolean(person))
    .map((person) => `${person.firstName} ${person.lastName}`)
    .join(", ");
}

export const SETUP_PLACEHOLDERS = {
  firstName: MOCK_CREW[0].firstName,
  lastName: MOCK_CREW[0].lastName,
  email: "you@shop.example",
  password: "At least 8 characters",
  phone: examplePhone(MOCK_CREW[0].phone),
  pin: "1234",
  businessName: "Summit Coatings",
  address: MOCK_CLIENTS[0].address,
  businessEmail: "office@summit-coatings.example",
  companyPhone: examplePhone("5550100100"),
  personFirst: MOCK_CREW[2].firstName,
  personLast: MOCK_CREW[2].lastName,
  personPhone: examplePhone(MOCK_CREW[2].phone),
  rate: String(MOCK_CREW[2].hourlyRate),
} as const;

export function mockClientsAsDTO(): CustomerDTO[] {
  return MOCK_CLIENTS.map((client) => ({
    id: client.id,
    name: client.name,
    phone: examplePhone(client.phone),
    email: client.email,
    address: client.address,
  }));
}

export function mockJobsAsDTO(): JobDTO[] {
  return MOCK_JOBS.map((job) => ({
    id: job.id,
    code: job.code,
    name: job.name,
    client: job.client,
    customerId: job.clientId,
    address: job.address,
    notes: job.notes,
    timeline: `Sample crew: ${crewLabel(job.crewIds)}`,
    dueDate: job.dueDate,
    pipeline: job.pipeline,
    leadCalledAt: null,
    photos: [],
  }));
}

export function mockCrewAsDTO(): EmployeeDTO[] {
  return MOCK_CREW.map((person) => ({
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    jobTitle: person.jobTitle,
    photoUrl: person.photoUrl,
    email: person.email,
    phone: examplePhone(person.phone),
    payType: "HOURLY",
    hourlyRate: person.hourlyRate,
    salaryAnnual: 0,
    baselineStartDate: "",
    payFrequency: "WEEKLY",
    federalWithholdPct: 0,
    stateWithholdPct: 0,
    employmentStatus: "ACTIVE",
    employmentEndDate: null,
    ytdGross: 0,
    ytdFederalTax: 0,
    ytdStateTax: 0,
    ytdNet: 0,
    ytdOvertime: 0,
    timeEntries: [],
    payPeriods: [],
    adjustments: [],
    auditLogs: [],
  }));
}

/** Overlay-only. Never writes Prisma. Drops leftover mock ids when live rows exist. */
export function applyMockPreview(input: {
  jobs: JobDTO[];
  customers: CustomerDTO[];
  employees: EmployeeDTO[];
  setupComplete?: boolean;
}) {
  const jobs = input.jobs.filter((row) => !isMockSeedId(row.id));
  const customers = input.customers.filter((row) => !isMockSeedId(row.id));
  const employees = input.employees.filter((row) => !isMockSeedId(row.id));
  if (!input.setupComplete) {
    return { jobs, customers, employees };
  }
  return {
    jobs: jobs.length ? jobs : mockJobsAsDTO(),
    customers: customers.length ? customers : mockClientsAsDTO(),
    employees: jobs.length
      ? employees
      : employees.length
        ? [...employees, ...mockCrewAsDTO()]
        : mockCrewAsDTO(),
  };
}
