const { PrismaClient } = require("@prisma/client");
const { addDays } = require("date-fns");

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany();
  for (const job of jobs) {
    if (!job.client) continue;
    const existing = await prisma.customer.findFirst({ where: { name: job.client } });
    if (!existing) {
      await prisma.customer.create({
        data: { name: job.client, address: job.address || "" },
      });
    }
  }

  const invoiceCount = await prisma.invoice.count();
  if (invoiceCount === 0) {
    const customers = await prisma.customer.findMany();
    const byName = Object.fromEntries(customers.map((customer) => [customer.name, customer]));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rows = [
      { job: jobs[0], amount: 12480, days: 10, status: "PENDING" },
      { job: jobs[2], amount: 8250, days: -4, status: "PENDING" },
      { job: jobs[3], amount: 4900, days: 21, status: "DRAFT" },
    ].filter((row) => row.job && byName[row.job.client]);

    for (const [index, row] of rows.entries()) {
      await prisma.invoice.create({
        data: {
          number: `INV-${1001 + index}`,
          customerId: byName[row.job.client].id,
          jobId: row.job.id,
          amount: row.amount,
          status: row.status,
          dueDate: addDays(today, row.days),
        },
      });
    }
  }

  console.log("Command customers and invoices are ready.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
