import { prisma } from "../lib/prisma";
import { raiseAlert } from "../lib/alerts";

async function main() {
  const harbor = await prisma.job.findFirst({ where: { OR: [{ code: "TGP-2041" }, { code: "JC-2041" }] } });
  const warehouse = await prisma.job.findFirst({ where: { OR: [{ code: "TGP-1888" }, { code: "JC-1888" }] } });
  const casey = await prisma.employee.findFirst({ where: { firstName: "Casey" } });

  await raiseAlert({
    kind: "ESTIMATE_APPROVED",
    priority: "urgent",
    title: "Harbor office signed EST-1001",
    body: "Harbor Roof Retrofit is approved. Lock the start date.",
    href: harbor ? `/?job=${harbor.id}` : "/",
    jobId: harbor?.id,
  });
  await raiseAlert({
    kind: "DISPATCH",
    priority: "urgent",
    title: "Mid-day change · Casey",
    body: "Warehouse Electrical is now 1:00–4:00p today.",
    href: casey ? `/?id=${casey.id}&tab=crew` : "/",
    jobId: warehouse?.id,
    employeeId: casey?.id,
  });
  await raiseAlert({
    kind: "ESTIMATE_VIEWED",
    priority: "quiet",
    title: "EST-1001 opened",
    body: "Harbor office opened the Harbor Roof Retrofit quote.",
    href: harbor ? `/?job=${harbor.id}` : "/",
    jobId: harbor?.id,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
