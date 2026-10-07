const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      payFrequency: "WEEKLY",
      periodAnchor: new Date(),
      setupComplete: false,
    },
    update: {
      setupComplete: false,
      ownerFirstName: "",
      ownerLastName: "",
      ownerEmail: "",
      ownerPhone: "",
      businessName: "",
      businessAddress: "",
      industry: "",
      businessSize: "",
      accountingSoftware: "NONE",
      companyPhone: "",
      answeringLine: "",
      logoUrl: null,
      shellTheme: "dark",
    },
  });
  await prisma.boss.deleteMany();
  console.log("Setup reset — signup will open on next load.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
