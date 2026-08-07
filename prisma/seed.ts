/**
 * Development seed data.
 *
 * Intentionally minimal for Phase 0: the exit criteria (SRS §21) is an empty
 * dashboard, so there is nothing domain-specific to seed yet. This file is
 * the place Phase 1+ seeding (sample vehicles, fuel entries, bills) will be
 * added, and `prisma db seed` / `prisma migrate reset` already wire it up.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const userCount = await prisma.user.count();
  console.log(`Seed check: ${userCount} user(s) currently in the database.`);
  console.log(
    "Nothing to seed yet — the first user to visit /register bootstraps the household."
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
