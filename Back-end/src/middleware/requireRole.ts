import type { Request, Response, NextFunction } from "express";
import type { AuthUser } from "../types/express.js";

type Role = AuthUser["role"];

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: "Forbidden — insufficient permissions" });
      return;
    }
    next();
  };
}
