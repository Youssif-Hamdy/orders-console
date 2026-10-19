import "dotenv/config";
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";
import prisma from "../src/db/prisma.js";

const SALT_ROUNDS = 10;
const ORDER_COUNT = 50_000;
const ORDER_BATCH = 1_000;

// Realistic status distribution
const STATUS_WEIGHTS: Array<{ status: string; weight: number }> = [
  { status: "DELIVERED", weight: 45 },
  { status: "PAID",      weight: 25 },
  { status: "SHIPPED",   weight: 15 },
  { status: "PENDING",   weight: 10 },
  { status: "CANCELLED", weight:  5 },
];

const STATUS_POOL: string[] = STATUS_WEIGHTS.flatMap(({ status, weight }) =>
  Array<string>(weight).fill(status)
);

function pickStatus(): string {
  const idx = Math.floor(Math.random() * STATUS_POOL.length);
  return STATUS_POOL[idx] ?? "PENDING";
}

function randomDateInLastTwoYears(): Date {
  const now = Date.now();
  const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
  return new Date(now - Math.random() * twoYearsMs);
}

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

async function seedOrders(): Promise<void> {
  const existing = await prisma.order.count();
  if (existing >= ORDER_COUNT) {
    console.log(`⏭  Skipping orders seed — ${existing} orders already exist.`);
    return;
  }

  // Fixed seed for reproducible data
  faker.seed(42);

  console.log(`🌱 Seeding ${ORDER_COUNT} orders…`);
  const t0 = Date.now();

  let total = 0;

  for (let batch = 0; batch < ORDER_COUNT / ORDER_BATCH; batch++) {
    type OrderRow = {
      id: string;
      customerName: string;
      email: string;
      status: string;
      totalCents: number;
      createdAt: Date;
    };

    const orderRows: OrderRow[] = [];

    type ItemInput = {
      orderId: string;
      name: string;
      quantity: number;
      unitPriceCents: number;
    };

    const itemRows: ItemInput[] = [];

    for (let i = 0; i < ORDER_BATCH; i++) {
      const itemCount = faker.number.int({ min: 1, max: 5 });

      let totalCents = 0;
      const pendingItems: Omit<ItemInput, "orderId">[] = [];

      for (let j = 0; j < itemCount; j++) {
        const quantity = faker.number.int({ min: 1, max: 10 });
        const unitPriceCents = faker.number.int({ min: 100, max: 100_000 });
        totalCents += quantity * unitPriceCents;
        pendingItems.push({ name: faker.commerce.productName(), quantity, unitPriceCents });
      }

      const orderId = faker.string.uuid();

      orderRows.push({
        id: orderId,
        customerName: faker.person.fullName(),
        email: faker.internet.email(),
        status: pickStatus(),
        totalCents,
        createdAt: randomDateInLastTwoYears(),
      });

      for (const item of pendingItems) {
        itemRows.push({ orderId, ...item });
      }
    }

    // Insert orders first, then their items; cast status text → Postgres enum
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Order" (id, "customerName", email, status, "totalCents", "createdAt")
      SELECT id, "customerName", email, status::"OrderStatus", "totalCents", "createdAt"
      FROM jsonb_to_recordset($1::jsonb)
        AS t(id text, "customerName" text, email text, status text, "totalCents" int, "createdAt" timestamptz)
    `, JSON.stringify(orderRows.map(r => ({
      id: r.id,
      customerName: r.customerName,
      email: r.email,
      status: r.status,
      totalCents: r.totalCents,
      createdAt: r.createdAt.toISOString(),
    }))));

    await prisma.$executeRawUnsafe(`
      INSERT INTO "OrderItem" (id, "orderId", name, quantity, "unitPriceCents")
      SELECT * FROM jsonb_to_recordset($1::jsonb)
        AS t(id text, "orderId" text, name text, quantity int, "unitPriceCents" int)
    `, JSON.stringify(itemRows.map(r => ({
      id: faker.string.uuid(),
      orderId: r.orderId,
      name: r.name,
      quantity: r.quantity,
      unitPriceCents: r.unitPriceCents,
    }))));

    total += ORDER_BATCH;
    process.stdout.write(`\r  Progress: ${total}/${ORDER_COUNT} (${Math.round(total / ORDER_COUNT * 100)}%)`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Done — ${ORDER_COUNT} orders seeded in ${elapsed}s`);
}

async function resetOrders(): Promise<void> {
  console.log("🗑  Deleting all orders (cascade deletes items)…");
  const { count } = await prisma.order.deleteMany();
  console.log(`   Deleted ${count} orders.`);
}

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");

  if (reset) {
    await resetOrders();
  }

  await seedUsers();
  await seedOrders();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
