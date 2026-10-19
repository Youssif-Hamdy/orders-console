# Auth Security Review

Numbering matches the findings table in the root README.

## Legacy Code Problems

### Critical

| # | Problem | Why It Is Dangerous | What I Changed |
|---|---------|--------------------|----------------|
| 1 | **`jwt.decode` instead of `jwt.verify`** | `decode` skips signature verification entirely — any attacker can forge a token with arbitrary `sub` and `role` and be accepted as any user. | Replaced with `jwt.verify`, which cryptographically validates the signature against `JWT_SECRET`. |
| 2 | **Hardcoded secret `"sarh-secret-2026"`** | Any developer who sees the code (or a leaked repo) knows the secret and can sign valid tokens indefinitely. | Secret is loaded from `JWT_SECRET` in `.env`, validated at startup to be ≥ 32 characters, never committed. |
| 3 | **Token accepted from the query string** | URLs are stored in browser history, server logs, proxy logs, and `Referer` headers — a token in the query string leaks passively. | `requireAuth` reads **only** from the `token` httpOnly cookie; query string and `Authorization` header are ignored. |
| 4 | **Plaintext password lookup** | Passwords were compared in cleartext in the SQL query (`password: req.body.password`). A database leak exposes every password immediately. | Passwords are stored as bcrypt hashes (`passwordHash`). Login uses `bcrypt.compare`, never a plaintext DB query. |
| 5 | **Authorization enforced only in the React frontend** | Client-side checks are cosmetic — any HTTP client (`curl`, Postman, modified JS) can call `DELETE /orders/:id` without the `AdminOnly` wrapper. | `requireRole("ADMIN")` middleware runs server-side and returns **403** before the handler is ever reached. |

### High

| # | Problem | Why It Is Dangerous | What I Changed |
|---|---------|--------------------|----------------|
| 6 | **No token expiry** | A stolen token is valid forever. | Added `expiresIn: "2h"` when signing; `jwt.verify` rejects expired tokens automatically. |
| 7 | **No rate limiting on login** | An attacker can send unlimited login attempts, enabling brute-force or credential-stuffing attacks. | `express-rate-limit` limits login to **10 attempts per IP per 15 minutes**; excess requests receive a **429** response. |

### Hardening

| # | Problem | Why It Is Dangerous | What I Changed |
|---|---------|--------------------|----------------|
| 8 | **Token in an Authorization header forces client-side storage** | The problem is not the header itself — it is that the client must store the token somewhere JavaScript can read (e.g., `localStorage`), leaving it exposed to theft via XSS. | Moved to an httpOnly cookie, which JavaScript cannot read at all; `requireAuth` ignores any `Authorization` header. |
| 9 | **No algorithm pinning (hardening / defense in depth)** | With a symmetric secret, `jwt.verify` already rejects `alg: "none"`. Pinning to `HS256` is an additional layer that prevents an algorithm-confusion attack if the code is ever changed to support asymmetric keys. | `jwt.verify` is called with `{ algorithms: ["HS256"] }`, rejecting any other algorithm. |
| 10 | **Untyped `req.user`** | Implicit `any` on `req.user` means TypeScript cannot catch bugs where code accesses `req.user.role` or `req.user.sub` on an unauthenticated request. | `src/types/express.d.ts` augments `Express.Request` so `req.user` is typed as `AuthUser \| undefined` everywhere. |
| 11 | **No body size limit** | The JSON parser accepts arbitrarily large bodies, enabling denial-of-service via memory exhaustion. | `express.json({ limit: "10kb" })` — auth payloads are tiny; 10 KB is a generous upper bound. |
| 12 | **No input validation** | `req.body.email` and `req.body.password` are used directly without any sanitization or type checking, enabling unexpected inputs and potential injection. | A Zod schema (`loginSchema`) validates the request body before it reaches the controller; invalid input returns **400** with field-level errors. |
| 13 | **Timing difference / user enumeration (hardening against a risk introduced by the fix itself)** | A naïve fix (fetch the user, run `bcrypt.compare` only if found) would leak email existence through response-time differences — fast for unknown emails, ~100 ms for wrong passwords. This is not a bug in the original code; it is a risk that the new bcrypt usage would introduce. | A dummy bcrypt hash is always compared even when the email does not exist, making both code paths take the same time. Both return the identical `"Invalid email or password"` message. |

---

## Token Storage: httpOnly Cookie

The JWT is stored in an **httpOnly, SameSite=Lax cookie** rather than in `localStorage` or a JavaScript-accessible variable.

**What this protects against:** Token theft via **XSS (Cross-Site Scripting)**. Because `httpOnly` cookies cannot be read or modified by JavaScript, a malicious script injected into the page cannot steal the token and exfiltrate it to an attacker-controlled server.

**What this does not protect against:** **CSRF (Cross-Site Request Forgery)** — any page the user visits could trigger a credentialed request to our API. This is mitigated here by `SameSite=Lax`, which causes the browser to omit the cookie on cross-site POST requests initiated by third-party pages; in production `SameSite=Strict` or a CSRF token would provide stronger protection. Note that a **compromised same-origin page** (e.g., stored XSS on our own domain) can still make authenticated requests, since the cookie is sent automatically by the browser — XSS must be prevented by proper output encoding and a strong Content-Security-Policy.

---

## Known Limits

- **Role stored inside the token.** If a user's role is revoked or downgraded, their old token remains valid (with the old role) until it expires in 2 h. There is no server-side invalidation on role change.
- **No revocation.** Logout only clears the cookie on the client. A token that has been copied (e.g., extracted from memory) stays valid until its 2 h TTL expires.
- **Rate limit is per IP.** `express-rate-limit` counts requests by the IP seen by the server. Behind a reverse proxy or NAT, multiple users may share one IP (reducing the effective limit) or an attacker may cycle IPs (bypassing it). The `trust proxy` setting and header-based key strategies can improve accuracy.
- **CSRF is mitigated, not eliminated.** `SameSite=Lax`, JSON-only bodies, and CORS restricted to `CLIENT_ORIGIN` make CSRF much harder, but they do not replace a CSRF token. An XSS on our own origin can still make authenticated requests using the cookie.