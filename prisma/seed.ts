import { seedPrismaDatabase, getPrismaClient } from "../src/lib/prisma";

async function main() {
  console.log("Seeding PostgreSQL database via Prisma ORM (createMany)...");
  await seedPrismaDatabase();
  const prisma = getPrismaClient();
  const count = await prisma.assetRecord.count();
  console.log(`Seeded ${count} IT assets across 5 lifecycle stages.`);
}

main()
  .catch((e) => {
    console.error("Prisma seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = getPrismaClient();
    await prisma.$disconnect();
  });
