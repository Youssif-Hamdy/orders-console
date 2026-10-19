import type { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(err);

  // Services can attach a statusCode to signal 400/422 errors through next(err)
  const statusCode =
    typeof (err as { statusCode?: unknown }).statusCode === "number"
      ? (err as { statusCode: number }).statusCode
      : 500;

  const message =
    err instanceof Error ? err.message : "An unexpected error occurred";

  res.status(statusCode).json({ error: message });
}
