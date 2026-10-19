import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { listOrders, createOrder, deleteOrder } from "./orders.service.js";
import type { ListOrdersQuery, CreateOrderBody } from "./orders.schemas.js";
import { listOrdersQuerySchema } from "./orders.schemas.js";
import { env } from "../../config/env.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── GET /api/orders ──────────────────────────────────────────────────────────

export async function getOrders(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Validate query params
    const parsed = listOrdersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error:   "Invalid query parameters",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const query = parsed.data as ListOrdersQuery;

    // Optional simulated latency for frontend race-condition testing
    if (env.SIMULATE_LATENCY_MS !== undefined && env.NODE_ENV === "development") {
      const delay = Math.random() * env.SIMULATE_LATENCY_MS;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }

    const result = await listOrders(query);
    res.json(result);
  } catch (err) {
    // Pass cursor decode errors (statusCode 400) to errorHandler which will
    // need to check for custom statusCode — handled there.
    next(err);
  }
}

// ── POST /api/orders ─────────────────────────────────────────────────────────

export async function postOrder(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idempotencyKey = req.headers["idempotency-key"];

    if (typeof idempotencyKey !== "string" || !UUID_RE.test(idempotencyKey)) {
      res.status(400).json({
        error: "Idempotency-Key header is required and must be a valid UUID",
      });
      return;
    }

    const body = req.body as CreateOrderBody;
    const userId = req.user!.sub;

    const { order, created } = await createOrder(body, idempotencyKey, userId);

    if (!created) {
      res.setHeader("Idempotent-Replayed", "true");
    }

    res.status(created ? 201 : 200).json({ order });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/orders/:id ───────────────────────────────────────────────────

export async function removeOrder(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const deleted = await deleteOrder(id);

    if (!deleted) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Zod re-export used by the router for body validation
export { z };
