import type { CustomerDTO, EmployeeDTO, EstimateDTO, JobDTO, JobPhotoDTO } from "@/lib/types";

export type ClientHint = {
  id?: string | null;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
};

export type ClientProfile = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  sites: string[];
  lastSite: string;
  jobIds: string[];
  jobCount: number;
  estimateCount: number;
  photoCount: number;
  hours: number;
  photos: JobPhotoDTO[];
  estimates: Array<{ id: string; number: string; jobId: string; status: string }>;
};

function collapse(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeName(value: string) {
  return collapse(value).toLowerCase();
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function phoneKey(value: string) {
  const digits = phoneDigits(value);
  return digits.length >= 7 ? digits.slice(-7) : "";
}

export function telHref(phone: string) {
  const digits = phoneDigits(phone);
  return digits ? `tel:${digits}` : "";
}

export function smsHref(phone: string) {
  const digits = phoneDigits(phone);
  return digits ? `sms:${digits}` : "";
}

export function mailHref(email: string) {
  const trimmed = email.trim();
  return trimmed ? `mailto:${trimmed}` : "";
}

export function matchCustomer<T extends { id: string; name: string; phone: string; email: string }>(
  customers: T[],
  hint: ClientHint
): T | null {
  if (hint.id) {
    const byId = customers.find((item) => item.id === hint.id);
    if (byId) return byId;
  }
  const email = hint.email ? normalizeEmail(hint.email) : "";
  if (email) {
    const byEmail = customers.find((item) => item.email && normalizeEmail(item.email) === email);
    if (byEmail) return byEmail;
  }
  const phone = hint.phone ? phoneKey(hint.phone) : "";
  if (phone) {
    const byPhone = customers.find((item) => phoneKey(item.phone) === phone);
    if (byPhone) return byPhone;
  }
  const name = hint.name ? normalizeName(hint.name) : "";
  if (name) {
    const byName = customers.find((item) => normalizeName(item.name) === name);
    if (byName) return byName;
  }
  return null;
}

function uniqueSites(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = collapse(value);
    if (!next) continue;
    const key = normalizeName(next);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(next);
  }
  return out;
}

function jobBelongsTo(job: Pick<JobDTO, "id" | "client" | "customerId">, customer: Pick<CustomerDTO, "id" | "name">) {
  return job.customerId === customer.id || (!job.customerId && normalizeName(job.client) === normalizeName(customer.name));
}

export function indexClients(input: {
  customers: CustomerDTO[];
  jobs: JobDTO[];
  estimates: EstimateDTO[];
  employees?: EmployeeDTO[];
}): ClientProfile[] {
  const hoursByJob = new Map<string, number>();
  for (const employee of input.employees || []) {
    for (const entry of employee.timeEntries) {
      if (!entry.jobId) continue;
      hoursByJob.set(entry.jobId, (hoursByJob.get(entry.jobId) || 0) + (entry.actualHours || entry.scheduledHours || 0));
    }
  }

  return input.customers.map((customer) => {
    const jobs = input.jobs.filter((job) => jobBelongsTo(job, customer));
    const jobIds = jobs.map((job) => job.id);
    const estimates = input.estimates.filter(
      (estimate) => estimate.customerId === customer.id || jobIds.includes(estimate.jobId)
    );
    const photos = jobs.flatMap((job) => job.photos || []);
    const sites = uniqueSites([customer.address, ...jobs.map((job) => job.address)]);
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      sites,
      lastSite: sites[0] || "",
      jobIds,
      jobCount: jobs.length,
      estimateCount: estimates.length,
      photoCount: photos.length,
      hours: jobIds.reduce((sum, id) => sum + (hoursByJob.get(id) || 0), 0),
      photos,
      estimates: estimates.map((estimate) => ({
        id: estimate.id,
        number: estimate.number,
        jobId: estimate.jobId,
        status: estimate.status,
      })),
    };
  });
}

export function profileForCustomer(index: ClientProfile[], customerId?: string | null, name?: string) {
  if (customerId) {
    const byId = index.find((item) => item.id === customerId);
    if (byId) return byId;
  }
  if (name) {
    return index.find((item) => normalizeName(item.name) === normalizeName(name)) || null;
  }
  return null;
}

function scoreHit(profile: ClientProfile, query: string) {
  const q = normalizeName(query);
  const digits = phoneDigits(query);
  if (!q) return profile.jobCount + 1;
  let score = 0;
  const name = normalizeName(profile.name);
  if (name === q) score += 120;
  else if (name.startsWith(q)) score += 80;
  else if (name.includes(q)) score += 50;
  if (digits.length >= 3 && phoneDigits(profile.phone).includes(digits)) score += 70;
  if (profile.email && normalizeEmail(profile.email).includes(q)) score += 40;
  if (profile.sites.some((site) => normalizeName(site).includes(q))) score += 25;
  if (score > 0) score += Math.min(profile.jobCount, 8);
  return score;
}

export function searchClients(index: ClientProfile[], query: string, limit = 6) {
  const trimmed = query.trim();
  const ranked = index
    .map((profile) => ({ profile, score: scoreHit(profile, trimmed) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.profile.name.localeCompare(b.profile.name));
  return ranked.slice(0, limit).map((row) => row.profile);
}

export function fileLine(profile: ClientProfile) {
  const bits = [
    profile.jobCount === 1 ? "1 job" : `${profile.jobCount} jobs`,
    profile.estimateCount ? (profile.estimateCount === 1 ? "1 estimate" : `${profile.estimateCount} estimates`) : "",
    profile.photoCount ? (profile.photoCount === 1 ? "1 photo" : `${profile.photoCount} photos`) : "",
  ].filter(Boolean);
  return `${profile.name} on file · ${bits.join(" · ")}`;
}
