import type { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(err);

  const message =
    err instanceof Error ? err.message : "An unexpected error occurred";

  res.status(500).json({ error: message });
}
