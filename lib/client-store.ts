import { prisma } from "@/lib/prisma";
import { matchCustomer } from "@/lib/clients";

export async function findOrCreateCustomer(input: {
  id?: string | null;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  actor?: string;
  quiet?: boolean;
}) {
  const name = input.name.trim();
  if (!name && !input.id) return null;
  const people = await prisma.customer.findMany();
  const existing = matchCustomer(people, {
    id: input.id,
    name,
    phone: input.phone,
    email: input.email,
  });
  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: name || existing.name,
        phone: input.phone !== undefined ? input.phone.trim() : existing.phone,
        email: input.email !== undefined ? input.email.trim() : existing.email,
        address: input.address !== undefined ? input.address.trim() : existing.address,
      },
    });
  }
  if (!name) return null;
  return prisma.customer.create({
    data: {
      name,
      phone: input.phone?.trim() || "",
      email: input.email?.trim() || "",
      address: input.address?.trim() || "",
    },
  });
}

export async function associateJobClient(
  jobId: string | null | undefined,
  hint?: {
    customerId?: string | null;
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    actor?: string;
  }
) {
  if (!jobId) return null;
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { estimate: true },
  });
  if (!job) return null;
  const linked =
    job.customerId &&
    (!hint?.customerId || hint.customerId === job.customerId) &&
    (!job.estimate || job.estimate.customerId === job.customerId) &&
    !hint?.phone &&
    !hint?.email &&
    !hint?.name;
  if (linked) return prisma.customer.findUnique({ where: { id: job.customerId! } });

  const customer = await findOrCreateCustomer({
    id: hint?.customerId || job.customerId || job.estimate?.customerId || undefined,
    name: hint?.name || job.client,
    phone: hint?.phone,
    email: hint?.email,
    address: hint?.address || job.address,
    actor: hint?.actor,
    quiet: true,
  });
  if (!customer) return null;

  const nextClient = hint?.name?.trim() || job.client;
  const nextAddress = hint?.address !== undefined ? hint.address.trim() : job.address;
  if (job.customerId !== customer.id || job.client !== nextClient || job.address !== nextAddress) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        customerId: customer.id,
        client: nextClient,
        address: nextAddress,
      },
    });
  }
  if (job.estimate && job.estimate.customerId !== customer.id) {
    await prisma.estimate.update({
      where: { id: job.estimate.id },
      data: { customerId: customer.id },
    });
  }
  return customer;
}
