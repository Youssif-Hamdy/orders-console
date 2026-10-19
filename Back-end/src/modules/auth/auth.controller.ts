import type { Request, Response, NextFunction } from "express";
import { loginUser } from "./auth.service.js";
import type { LoginInput } from "./auth.schemas.js";
import { env } from "../../config/env.js";

const COOKIE_NAME = "token";
const IS_PROD = env.NODE_ENV === "production";

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = req.body as LoginInput;
    const { token, user } = await loginUser(input);

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PROD,
      maxAge: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
    });

    res.json({ user });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_CREDENTIALS") {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    next(err);
  }
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: IS_PROD });
  res.json({ ok: true });
}

export function me(req: Request, res: Response): void {
  res.json({ user: req.user });
}
