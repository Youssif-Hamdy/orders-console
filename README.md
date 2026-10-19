# orders-console

## Code review findings (auth)

### Critical

| # | Problem | Why It Is Dangerous | What I Changed |
|---|---------|--------------------|----------------|
| 1 | **`jwt.decode` instead of `jwt.verify`** | `decode` skips signature verification entirely — any attacker can forge a token with arbitrary `sub` and `role` and be accepted as any user. | Replaced with `jwt.verify`, which cryptographically validates the signature against `JWT_SECRET`. |
| 2 | **Hardcoded secret `"sarh-secret-2026"`** | Any developer who sees the code (or a leaked repo) knows the secret and can sign valid tokens indefinitely. | Secret is loaded from `JWT_SECRET` in `.env`, validated at startup to be ≥ 32 characters, never committed. |
| 4 | **Token accepted from the query string** | URLs are stored in browser history, server logs, proxy logs, and `Referer` headers — a token in the query string leaks passively. | `requireAuth` reads **only** from the `token` httpOnly cookie; query string and `Authorization` header are ignored. |
| 7 | **Plaintext password lookup** | Passwords were compared in cleartext in the SQL query. A database leak exposes every password immediately. | Passwords are stored as bcrypt hashes (`passwordHash`). Login uses `bcrypt.compare`, never a plaintext DB query. |
| 9 | **Authorization enforced only in the React frontend** | Client-side checks are cosmetic — any HTTP client can bypass the `AdminOnly` wrapper. | `requireRole("ADMIN")` middleware runs server-side and returns **403** before the handler is ever reached. |

### High

| # | Problem | Why It Is Dangerous | What I Changed |
|---|---------|--------------------|----------------|
| 3 | **No token expiry** | A stolen token is valid forever. | Added `expiresIn: "2h"`; `jwt.verify` rejects expired tokens automatically. |
| 11 | **No rate limiting on login** | Unlimited login attempts enable brute-force or credential-stuffing attacks. | `express-rate-limit` limits login to **10 attempts per IP per 15 minutes**; excess requests receive **429**. |

### Hardening

| # | Problem | Why It Is Dangerous | What I Changed |
|---|---------|--------------------|----------------|
| 5 | **Token in an Authorization header forces client-side storage** | The client must store the token somewhere JavaScript can read (e.g., `localStorage`), leaving it exposed to XSS theft. | Moved to an httpOnly cookie; `requireAuth` ignores any `Authorization` header. |
| 6 | **No algorithm pinning** | Defense in depth against algorithm-confusion attacks if the code ever moves to asymmetric keys. With an HS256 secret, `jwt.verify` already rejects `alg: "none"`. | `jwt.verify` called with `{ algorithms: ["HS256"] }`. |
| 12 | **Untyped `req.user`** | Implicit `any` means TypeScript cannot catch access bugs on unauthenticated requests. | `src/types/express.d.ts` types `req.user` as `AuthUser \| undefined`. |
| 13 | **No body size limit** | Arbitrarily large JSON bodies enable DoS via memory exhaustion. | `express.json({ limit: "10kb" })`. |
| 10 | **No input validation** | Raw `req.body` used without sanitization. | Zod `loginSchema` validates before the controller; invalid input returns **400**. |
| 8 | **Timing difference / user enumeration** | A naïve bcrypt fix would leak email existence through response-time differences. | Dummy hash always compared; both failure paths return the identical message. |

Full table with the reasoning for each finding: see [Back-end/AUTH_REVIEW.md](Back-end/AUTH_REVIEW.md).

---

## Where the token is stored on the client

The token lives in an httpOnly, SameSite=Lax cookie, so JavaScript can never read it. That protects against token theft through XSS, which is what a localStorage token would be exposed to. It does not fully protect against CSRF (SameSite=Lax and a JSON-only API with restricted CORS reduce it, but a CSRF token would be stronger), and an XSS on our own page could still make authenticated requests with the cookie.
