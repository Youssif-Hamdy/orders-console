import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import app from "../src/app.js";
import prisma from "../src/db/prisma.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  expect(res.status).toBe(200);
  const cookieHeader = res.headers["set-cookie"] as string | string[];
  const cookies = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader ?? ""];
  const tokenCookie = cookies.find((c: string) => c.startsWith("token="));
  if (!tokenCookie) throw new Error("No token cookie returned from login");
  return tokenCookie.split(";")[0]!;
}

// Login once before all tests to avoid hitting the rate limiter (10 req/15 min)
let agentCookie = "";
let adminCookie = "";

/** Track order IDs created by tests so we can clean up. */
const createdIds: string[] = [];

beforeAll(async () => {
  agentCookie = await loginAs("agent@sarh.test", "Agent123!");
  adminCookie = await loginAs("admin@sarh.test", "Admin123!");
});

afterAll(async () => {
  if (createdIds.length > 0) {
    await prisma.order.deleteMany({ where: { id: { in: createdIds } } });
  }
  await prisma.$disconnect();
});

// ── Base order body ───────────────────────────────────────────────────────────

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Test Customer",
    email:        "test@example.com",
    items: [
      { name: "Widget", quantity: 2, unitPriceCents: 500 },
    ],
    ...overrides,
  };
}

// ── 1. GET /api/orders ────────────────────────────────────────────────────────

describe("GET /api/orders", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid auth", async () => {
    const res = await request(app)
      .get("/api/orders")
      .set("Cookie", agentCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    expect(res.body).toHaveProperty("nextCursor");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("rejects invalid limit", async () => {
    const res = await request(app)
      .get("/api/orders?limit=999")
      .set("Cookie", agentCookie);
    expect(res.status).toBe(400);
  });

  it("rejects invalid cursor with 400", async () => {
    const res = await request(app)
      .get("/api/orders?cursor=NOTVALIDBASE64JSON")
      .set("Cookie", agentCookie);
    expect(res.status).toBe(400);
  });

  it("filters by status", async () => {
    const res = await request(app)
      .get("/api/orders?status=PENDING&limit=10")
      .set("Cookie", agentCookie);
    expect(res.status).toBe(200);
    for (const item of res.body.items as { status: string }[]) {
      expect(item.status).toBe("PENDING");
    }
  });

  it("sorts by total_asc", async () => {
    const res = await request(app)
      .get("/api/orders?sort=total_asc&limit=20")
      .set("Cookie", agentCookie);
    expect(res.status).toBe(200);
    const items = res.body.items as { totalCents: number }[];
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.totalCents).toBeGreaterThanOrEqual(items[i - 1]!.totalCents);
    }
  });
});

// ── 2. POST /api/orders — validation ─────────────────────────────────────────

describe("POST /api/orders — validation", () => {
  it("returns 400 when Idempotency-Key header is missing", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Cookie", agentCookie)
      .send(makeBody());
    expect(res.status).toBe(400);
  });

  it("returns 400 when Idempotency-Key is not a UUID", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Cookie", agentCookie)
      .set("Idempotency-Key", "not-a-uuid")
      .send(makeBody());
    expect(res.status).toBe(400);
  });

  it("returns 400 when body fails validation", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Cookie", agentCookie)
      .set("Idempotency-Key", randomUUID())
      .send({ customerName: "", email: "bad", items: [] });
    expect(res.status).toBe(400);
  });
});

// ── 3. POST /api/orders — happy path ─────────────────────────────────────────

describe("POST /api/orders — happy path", () => {
  it("creates an order and returns 201", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Cookie", agentCookie)
      .set("Idempotency-Key", randomUUID())
      .send(makeBody());
    expect(res.status).toBe(201);
    expect(res.body.order).toHaveProperty("id");
    expect(res.body.order.totalCents).toBe(1000); // 2 * 500
    createdIds.push(res.body.order.id as string);
  });
});

// ── 4. Idempotency — same key, different body → 422 ──────────────────────────

describe("POST /api/orders — idempotency conflict", () => {
  it("returns 422 when same key reused with different body", async () => {
    const key = randomUUID();

    const first = await request(app)
      .post("/api/orders")
      .set("Cookie", agentCookie)
      .set("Idempotency-Key", key)
      .send(makeBody());
    expect(first.status).toBe(201);
    createdIds.push(first.body.order.id as string);

    const second = await request(app)
      .post("/api/orders")
      .set("Cookie", agentCookie)
      .set("Idempotency-Key", key)
      .send(makeBody({ customerName: "Different Person" }));
    expect(second.status).toBe(422);
  });
});

// ── 5. DELETE /api/orders/:id — role checks ───────────────────────────────────

describe("DELETE /api/orders/:id", () => {
  it("returns 403 for AGENT", async () => {
    const res = await request(app)
      .delete("/api/orders/nonexistent-id")
      .set("Cookie", agentCookie);
    expect(res.status).toBe(403);
  });

  it("returns 404 when order doesn't exist (ADMIN)", async () => {
    const res = await request(app)
      .delete("/api/orders/does-not-exist-123")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("returns 204 when ADMIN deletes a real order", async () => {
    const create = await request(app)
      .post("/api/orders")
      .set("Cookie", agentCookie)
      .set("Idempotency-Key", randomUUID())
      .send(makeBody());
    expect(create.status).toBe(201);
    const id = create.body.order.id as string;

    const del = await request(app)
      .delete(`/api/orders/${id}`)
      .set("Cookie", adminCookie);
    expect(del.status).toBe(204);
  });
});
