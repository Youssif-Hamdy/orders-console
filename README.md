# orders-console

Orders Console: a React + Node app for searching a large orders table (50,000+ rows) and registering new orders without ever creating duplicates.

**Stack:** React 18 + TypeScript (Vite) · Express + TypeScript · PostgreSQL 16 · Prisma 6

Design decisions and AI-tool disclosure: see [DECISIONS.md](DECISIONS.md).

---

## Quick start (about 5 minutes)

### Prerequisites

- Node.js 20+
- PostgreSQL 16 running locally

### 1. Create the database

```bash
createdb orders_console
```

### 2. Back end

```bash
cd Back-end
cp .env.example .env          # then edit DATABASE_URL and set JWT_SECRET (>= 32 chars)
npm install
npx prisma migrate dev        # creates the tables and indexes
npm run seed                  # 50,000 orders + 2 users
npm run dev                   # http://localhost:3000
```

### 3. Front end

```bash
cd Front-end
cp .env.example .env          # if present
npm install
npm run dev                   # http://localhost:5173
```

### Seeded users

| Role  | Email             | Password     |
|-------|-------------------|--------------|
| ADMIN | admin@sarh.test | Admin123!    |
| AGENT | agent@sarh.test | Agent123!    |

---

## Commands

| Command | Where | What it does |
|---------|-------|--------------|
| `npm run dev` | Back-end / Front-end | Start the dev server |
| `npm run seed` | Back-end | Seed 50,000 orders (1–5 line items each) and the two users |
| `npm test` | Back-end | Run all tests, including the parallel duplicate-order test |

---

## R1: Large list

- **Pagination:** cursor-based, server-side. The full table is never sent to the browser.
- **Search:** customer name / email. **Filter:** status. **Sort:** date, amount.
- **Rapid-filter correctness:** the search box is debounced (350 ms), and the list uses TanStack Query with the search, status and sort values inside the `queryKey`. Every filter combination has its own cache entry, so a slow earlier response can only fill its own key and can never overwrite the result shown for the latest filter.
- **Indexes** (in `schema.prisma`):
  - `@@index([status])` for the status filter
  - `@@index([createdAt])` for date sort and the cursor
  - `@@index([totalCents])` for amount sort
  - `@@index([createdById])` for per-user queries
  - `@@unique([createdById, idempotencyKey])` for duplicate protection (R2)
- **Not indexed:** name/email search. A substring (`contains`) match cannot use a normal B-tree index, so it scans the table. That is fine at 50,000 rows; at millions of rows I would add `pg_trgm` with a GIN index. I also did not add a composite `(status, createdAt)` index.

## R2: No duplicate orders

- The client sends an `Idempotency-Key` (one UUID per create attempt).
- The database enforces `UNIQUE (createdById, idempotencyKey)`, so the guarantee holds on the server, not only in the UI.
- Same key + same body returns the existing order (200, `Idempotent-Replayed: true`). Same key + different body returns 422.
- **Proof:** `npm test` (in `Back-end`) runs `tests/duplicate-order.test.ts`, which fires the same create request twice in parallel and asserts that exactly one order exists.

Approach and limits are explained in [DECISIONS.md](DECISIONS.md).

---

## Code review findings (auth)

### Critical

| # | Problem | Why It Is Dangerous | What I Changed |
|---|---------|--------------------|----------------|
| 1 | **`jwt.decode` instead of `jwt.verify`** | `decode` skips signature verification entirely. Any attacker can forge a token with arbitrary `sub` and `role` and be accepted as any user. | Replaced with `jwt.verify`, which cryptographically validates the signature against `JWT_SECRET`. |
| 2 | **Hardcoded secret `"sarh-secret-2026"`** | Any developer who sees the code (or a leaked repo) knows the secret and can sign valid tokens indefinitely. | Secret is loaded from `JWT_SECRET` in `.env`, validated at startup to be ≥ 32 characters, never committed. |
| 3 | **Token accepted from the query string** | URLs are stored in browser history, server logs, proxy logs, and `Referer` headers. A token in the query string leaks passively. | `requireAuth` reads **only** from the `token` httpOnly cookie; query string and `Authorization` header are ignored. |
| 4 | **Plaintext password lookup** | Passwords were compared in cleartext in the SQL query. A database leak exposes every password immediately. | Passwords are stored as bcrypt hashes (`passwordHash`). Login uses `bcrypt.compare`, never a plaintext DB query. |
| 5 | **Authorization enforced only in the React frontend** | Client-side checks are cosmetic. Any HTTP client can bypass the `AdminOnly` wrapper. | `requireRole("ADMIN")` middleware runs server-side and returns **403** before the handler is ever reached. |

### High

| # | Problem | Why It Is Dangerous | What I Changed |
|---|---------|--------------------|----------------|
| 6 | **No token expiry** | A stolen token is valid forever. | Added `expiresIn: "2h"`; `jwt.verify` rejects expired tokens automatically. |
| 7 | **No rate limiting on login** | Unlimited login attempts enable brute-force or credential-stuffing attacks. | `express-rate-limit` limits login to **10 attempts per IP per 15 minutes**; excess requests receive **429**. |

### Hardening

| # | Problem | Why It Is Dangerous | What I Changed |
|---|---------|--------------------|----------------|
| 8 | **Token in an Authorization header forces client-side storage** | The client must store the token somewhere JavaScript can read (e.g. `localStorage`), leaving it exposed to XSS theft. | Moved to an httpOnly cookie; `requireAuth` ignores any `Authorization` header. |
| 9 | **No algorithm pinning** | Defense in depth against algorithm-confusion attacks if the code ever moves to asymmetric keys. With an HS256 secret, `jwt.verify` already rejects `alg: "none"`. | `jwt.verify` called with `{ algorithms: ["HS256"] }`. |
| 10 | **Untyped `req.user`** | Implicit `any` means TypeScript cannot catch access bugs on unauthenticated requests. | `src/types/express.d.ts` types `req.user` as `AuthUser \| undefined`. |
| 11 | **No body size limit** | Arbitrarily large JSON bodies enable DoS via memory exhaustion. | `express.json({ limit: "10kb" })`. |
| 12 | **No input validation** | Raw `req.body` used without sanitization. | Zod `loginSchema` validates before the controller; invalid input returns **400**. |
| 13 | **Timing difference / user enumeration** | A naïve bcrypt fix would leak email existence through response-time differences. This risk comes from the fix itself, not from the original code. | A dummy hash is always compared; both failure paths return the identical message. |

Full table with the reasoning for each finding: [Back-end/AUTH_REVIEW.md](Back-end/AUTH_REVIEW.md).

---

## Where the token is stored on the client

The token lives in an httpOnly, SameSite=Lax cookie, so JavaScript can never read it. That protects against token theft through XSS, which is what a localStorage token would be exposed to. It does not fully protect against CSRF (SameSite=Lax and a JSON-only API with restricted CORS reduce it, but a CSRF token would be stronger), and an XSS on our own page could still make authenticated requests with the cookie.

---

## Product question: "Delete all cancelled orders"

**What I would ask her:**
1. Why do you need it? Is the list too cluttered, are the reports wrong, or is it about storage?
2. Does "delete" mean gone forever, or just out of sight? Do finance or support ever need cancelled orders later (refunds, disputes, audits)?
3. Who should be allowed to press it, and how often would it run?
4. What happens if one order was cancelled by mistake?

**If she cannot answer:** I would not build a hard delete. I would add a "hide cancelled" filter (default on) and an admin-only soft-delete/archive that shows the number of affected orders and asks for confirmation first. It is reversible, and we can add real deletion later once we know why she wants it.

---

## What I skipped and why

- **Optional tasks (O1 stats API, O2 optimistic create):** skipped to stay within the time budget.
- **CSRF token:** not implemented. SameSite=Lax + JSON-only + restricted CORS reduce the risk, but it is not eliminated (see above).
- **Token revocation:** logout only clears the cookie; a copied token stays valid until it expires (2h).
- **Idempotency key cleanup:** keys never expire, so the table grows. Only `POST /api/orders` is protected.
- **Test coverage:** tests cover auth and the duplicate-order proof; the front end has no automated tests.
- **Docker:** not provided; PostgreSQL must be installed locally (SQLite would be a one-line provider change in `schema.prisma`).
- **Composite index `(status, createdAt)`:** not added; single-column indexes were enough at 50,000 rows.
- **Indexed search:** name/email search is an unindexed substring match (see R1); `pg_trgm` would be the fix at larger scale.