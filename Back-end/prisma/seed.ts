import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../src/db/prisma.js";

const SALT_ROUNDS = 10;

async function seedUsers(): Promise<void> {
  const users = [
    {
      email: "admin@sarh.test",
      password: "Admin123!",
      role: "ADMIN" as const,
    },
    {
      email: "agent@sarh.test",
      password: "Agent123!",
      role: "AGENT" as const,
    },
  ];

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, role: u.role },
      create: { email: u.email, passwordHash, role: u.role },
    });
    console.log(`Upserted ${u.role}: ${u.email}`);
  }
}

async function main(): Promise<void> {
  await seedUsers();
  // Future: await seedOrders();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
