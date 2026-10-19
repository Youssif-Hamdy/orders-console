import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthUser } from "../types/express.js";

const JWT_ALGORITHM = "HS256" as const;

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Token is read ONLY from the httpOnly cookie.
  // Accepting it from query strings or headers would allow XSS or URL-logging leaks.
  const token: string | undefined = req.cookies["token"] as string | undefined;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    // jwt.verify (not jwt.decode) — cryptographically validates the signature.
    // algorithms array pins the algorithm so an attacker cannot switch to "none".
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as AuthUser;

    req.user = payload;
    next();
  } catch {
    // Covers expired tokens (TokenExpiredError) and tampered tokens (JsonWebTokenError).
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
