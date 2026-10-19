import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import app from "../src/app.js";
import prisma from "../src/db/prisma.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  expect(res.status).toBe(200);
  const cookieHeader = res.headers["set-cookie"] as string | string[];
  const cookies = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader ?? ""];
  const tokenCookie = cookies.find((c: string) => c.startsWith("token="));
  if (!tokenCookie) throw new Error("No token cookie from login");
  return tokenCookie.split(";")[0]!;
}

/** IDs of orders created by these tests — cleaned up in afterAll. */
const createdKeys: string[] = [];

// Login once per file to avoid rate-limit hits
let agentCookie = "";

beforeAll(async () => {
  agentCookie = await loginAs("agent@sarh.test", "Agent123!");
});

afterAll(async () => {
  if (createdKeys.length > 0) {
    // Delete only the orders we made (by idempotencyKey), leaving seed data intact
    await prisma.order.deleteMany({
      where: { idempotencyKey: { in: createdKeys } },
    });
  }
  await prisma.$disconnect();
});

// ── Core idempotency test: two concurrent POSTs with the same key ─────────────

async function runConcurrentDuplicateTest(cookie: string): Promise<void> {
  const key  = randomUUID();
  const body = {
    customerName: "Concurrent Tester",
    email:        "race@example.com",
    items: [{ name: "Gadget", quantity: 1, unitPriceCents: 999 }],
  };

  // Fire both requests at exactly the same time
  const [r1, r2] = await Promise.all([
    request(app)
      .post("/api/orders")
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send(body),
    request(app)
      .post("/api/orders")
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send(body),
  ]);

  // Both must succeed: one 201 (created) and one 200 (replayed), or both 200
  const statuses = [r1.status, r2.status].sort();
  expect(statuses).toSatisfy((s: number[]) =>
    (s[0] === 200 && s[1] === 200) ||
    (s[0] === 200 && s[1] === 201) ||
    (s[0] === 201 && s[1] === 201) // theoretically impossible but not an error
  );

  // Both must return the same order ID
  const id1 = r1.body.order?.id as string | undefined;
  const id2 = r2.body.order?.id as string | undefined;
  expect(id1).toBeTruthy();
  expect(id2).toBeTruthy();
  expect(id1).toBe(id2);

  // Exactly one order must exist in the DB for this key
  const count = await prisma.order.count({ where: { idempotencyKey: key } });
  expect(count).toBe(1);

  createdKeys.push(key);
}

describe("duplicate-order (R2 idempotency)", () => {
  it("concurrent duplicate requests create exactly one order (×20 runs)", async () => {
    // Run the race scenario 20 times with different keys to surface race conditions
    for (let i = 0; i < 20; i++) {
      await runConcurrentDuplicateTest(agentCookie);
    }
  }, 60_000); // generous timeout for 20 concurrent pairs
});

// ── Pagination completeness ───────────────────────────────────────────────────
//
// Walk every page of /api/orders (limit=100) until nextCursor is null,
// collect all returned IDs, and verify no duplicates and no skipped items.
// We skip if the seed hasn't been run (fewer than 100 orders).
//
describe("GET /api/orders — pagination completeness", () => {
  it("traverses all pages without duplicates or gaps", async () => {
    // Quick count to decide whether to run
    const total = await prisma.order.count();
    if (total < 100) {
      console.log("⏭  Skipping pagination test — fewer than 100 orders in DB");
      return;
    }

    const seenIds = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;

    do {
      const url = cursor
        ? `/api/orders?limit=100&cursor=${encodeURIComponent(cursor)}`
        : "/api/orders?limit=100";

      const res = await request(app).get(url).set("Cookie", agentCookie);
      expect(res.status).toBe(200);

      const items = res.body.items as { id: string }[];
      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        expect(seenIds.has(item.id)).toBe(false); // no duplicates
        seenIds.add(item.id);
      }

      cursor = res.body.nextCursor as string | null ?? undefined;
      pages++;
    } while (cursor !== undefined);

    // Walk until nextCursor is null; count must match total at snapshot time.
    // We use >= because other tests may have inserted orders concurrently.
    expect(seenIds.size).toBeGreaterThanOrEqual(total);
    console.log(`✅ Walked ${pages} pages, saw ${seenIds.size} orders (snapshot total: ${total})`);
  }, 120_000);
});
