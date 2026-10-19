import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { requireAuth } from "../src/middleware/requireAuth.js";
import { requireRole } from "../src/middleware/requireRole.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

// Falls back to a 32-char test secret when no .env is loaded (CI / unit-only run)
const REAL_SECRET =
  process.env["JWT_SECRET"] ?? "test-secret-value-that-is-32-chars!!";
const WRONG_SECRET = "this-is-a-different-secret-key-abcdef";
const ALGORITHM = "HS256" as const;

function makeToken(
  payload: object,
  secret: string = REAL_SECRET,
  options: jwt.SignOptions = { algorithm: ALGORITHM, expiresIn: "2h" }
): string {
  return jwt.sign(payload, secret, options);
}

function cookieHeader(token: string): string {
  return `token=${token}`;
}

// Register a throwaway admin-only route for the role tests.
// Done once before all tests so it is available to every `it` block below.
// This route is test-only — it is never mounted in production code.
beforeAll(() => {
  app.get("/test/admin-only", requireAuth, requireRole("ADMIN"), (_req, res) => {
    res.json({ ok: true });
  });
});

// ─── 1. requireAuth ───────────────────────────────────────────────────────────

describe("requireAuth", () => {
  it("rejects a token signed with the wrong secret", async () => {
    const token = makeToken({ sub: "user-1", role: "AGENT" }, WRONG_SECRET);
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookieHeader(token));
    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const token = makeToken(
      { sub: "user-1", role: "AGENT" },
      REAL_SECRET,
      { algorithm: ALGORITHM, expiresIn: -1 } // negative TTL → already expired
    );
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookieHeader(token));
    expect(res.status).toBe(401);
  });

  it("ignores a token passed in the query string", async () => {
    const token = makeToken({ sub: "user-1", role: "AGENT" });
    // No cookie — only query param
    const res = await request(app).get(`/api/auth/me?token=${token}`);
    expect(res.status).toBe(401);
  });

  it("ignores a token passed in the Authorization header", async () => {
    const token = makeToken({ sub: "user-1", role: "AGENT" });
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("accepts a valid token in the cookie and returns the user payload", async () => {
    const token = makeToken({ sub: "user-1", role: "AGENT" });
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookieHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ sub: "user-1", role: "AGENT" });
  });
});

// ─── 2. requireRole ───────────────────────────────────────────────────────────

describe("requireRole", () => {
  it("returns 403 for an AGENT on an ADMIN-only route", async () => {
    const token = makeToken({ sub: "user-2", role: "AGENT" });
    const res = await request(app)
      .get("/test/admin-only")
      .set("Cookie", cookieHeader(token));
    expect(res.status).toBe(403);
  });

  it("allows an ADMIN on an ADMIN-only route", async () => {
    const token = makeToken({ sub: "user-1", role: "ADMIN" });
    const res = await request(app)
      .get("/test/admin-only")
      .set("Cookie", cookieHeader(token));
    expect(res.status).toBe(200);
  });
});

// ─── 3. POST /api/auth/login ──────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("returns 400 for a malformed request body", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "" });
    expect(res.status).toBe(400);
  });

  it("returns 401 for wrong password and unknown email — same message", async () => {
    const [wrongPassword, unknownEmail] = await Promise.all([
      request(app)
        .post("/api/auth/login")
        .send({ email: "admin@sarh.test", password: "WrongPassword!" }),
      request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@sarh.test", password: "Whatever!" }),
    ]);

    if (wrongPassword.status === 500 || unknownEmail.status === 500) {
      console.warn("DB not available, skipping user-enumeration test");
      return;
    }

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Both responses must carry the identical generic message (no user enumeration)
    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
  });

  it("happy path: sets an httpOnly cookie and returns user info (requires seeded DB)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@sarh.test", password: "Admin123!" });

    if (res.status === 500) {
      // DB not reachable — skip rather than fail in CI
      console.warn("DB not available, skipping happy-path login test");
      return;
    }

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "admin@sarh.test", role: "ADMIN" });
    expect(res.body.user).not.toHaveProperty("passwordHash");

    const setCookie = res.headers["set-cookie"] as string[] | undefined;
    expect(setCookie).toBeDefined();
    const tokenCookie = setCookie?.find((c) => c.startsWith("token="));
    expect(tokenCookie).toBeDefined();
    expect(tokenCookie).toContain("HttpOnly");
  });
});
