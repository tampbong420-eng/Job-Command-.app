import assert from "node:assert/strict";
import test from "node:test";
import {
  fileLine,
  indexClients,
  matchCustomer,
  normalizeName,
  phoneKey,
  searchClients,
  smsHref,
  telHref,
} from "./clients";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, JobDTO } from "./types";

const customers: CustomerDTO[] = [
  {
    id: "c-harbor",
    name: "Harbor Logistics",
    phone: "(501) 623-2041",
    email: "ops@harborlogistics.example",
    address: "1401 Higdon Ferry Rd, Hot Springs, AR 71913",
  },
  {
    id: "c-river",
    name: "Riverside Health",
    phone: "501-623-2103",
    email: "facilities@riversidehealth.example",
    address: "300 Werner St, Hot Springs, AR 71913",
  },
];

const jobs: JobDTO[] = [
  {
    id: "j1",
    code: "JC-2041",
    name: "Harbor Roof Retrofit",
    client: "Harbor Logistics",
    customerId: "c-harbor",
    address: "1401 Higdon Ferry Rd, Hot Springs, AR 71913",
    notes: "",
    timeline: "",
    dueDate: null,
    pipeline: 2,
    leadCalledAt: null,
    photos: [
      { id: "p1", url: "/uploads/jobs/harbor.jpg", caption: "South elevation", createdAt: "2026-09-01T00:00:00.000Z" },
    ],
  },
  {
    id: "j2",
    code: "JC-2042",
    name: "Harbor office touch-up",
    client: "Harbor Logistics",
    customerId: null,
    address: "123 Central Ave, Hot Springs, AR 71901",
    notes: "",
    timeline: "",
    dueDate: null,
    pipeline: 0,
    leadCalledAt: null,
    photos: [],
  },
];

const estimates: EstimateDTO[] = [
  {
    id: "e1",
    number: "EST-1001",
    jobId: "j1",
    customerId: "c-harbor",
    status: "SENT",
    notes: "",
    terms: "",
    taxRate: 0,
    publicToken: null,
    sentAt: null,
    viewedAt: null,
    acceptedAt: null,
    changesAt: null,
    signedName: "",
    clientNote: "",
    sentEmail: false,
    sentSms: false,
    lastFollowUpAt: null,
    followUpCount: 0,
    lines: [],
  },
];

const employees = [
  {
    timeEntries: [
      { jobId: "j1", actualHours: 6, scheduledHours: 8 },
      { jobId: "j2", actualHours: 0, scheduledHours: 4 },
    ],
  },
] as unknown as EmployeeDTO[];

test("phone key uses last seven digits", () => {
  assert.equal(phoneKey("(501) 623-2041"), "6232041");
  assert.equal(phoneKey("5016232041"), "6232041");
});

test("match customer by case-insensitive name, email, or phone", () => {
  assert.equal(matchCustomer(customers, { name: "harbor logistics" })?.id, "c-harbor");
  assert.equal(matchCustomer(customers, { email: "OPS@harborlogistics.example" })?.id, "c-harbor");
  assert.equal(matchCustomer(customers, { phone: "501-623-2041" })?.id, "c-harbor");
  assert.equal(matchCustomer(customers, { id: "c-river" })?.id, "c-river");
  assert.equal(matchCustomer(customers, { name: "Harbor" }), null);
});

test("silent index files sites, estimates, photos, and hours onto the client", () => {
  const harbor = indexClients({ customers, jobs, estimates, employees }).find((item) => item.id === "c-harbor");
  assert.ok(harbor);
  assert.equal(harbor.jobCount, 2);
  assert.equal(harbor.estimateCount, 1);
  assert.equal(harbor.photoCount, 1);
  assert.equal(harbor.hours, 10);
  assert.deepEqual(harbor.sites, [
    "1401 Higdon Ferry Rd, Hot Springs, AR 71913",
    "123 Central Ave, Hot Springs, AR 71901",
  ]);
  assert.equal(normalizeName(fileLine(harbor)).includes("2 jobs"), true);
});

test("instant search ranks Harbor from a partial name or phone", () => {
  const index = indexClients({ customers, jobs, estimates });
  assert.equal(searchClients(index, "harb")[0]?.id, "c-harbor");
  assert.equal(searchClients(index, "623-2041")[0]?.id, "c-harbor");
  assert.equal(searchClients(index, "werner")[0]?.id, "c-river");
  assert.equal(searchClients(index, "nobody").length, 0);
});

test("empty search still offers filed clients for one-tap pick", () => {
  const index = indexClients({ customers, jobs, estimates });
  const hits = searchClients(index, "");
  assert.equal(hits[0]?.id, "c-harbor");
  assert.equal(hits.length, 2);
});

test("contact hrefs stay compact", () => {
  assert.equal(telHref("(501) 623-2041"), "tel:5016232041");
  assert.equal(smsHref("501-623-2041"), "sms:5016232041");
});
