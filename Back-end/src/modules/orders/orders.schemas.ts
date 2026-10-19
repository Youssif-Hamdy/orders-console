import { z } from "zod";

// ── List query ────────────────────────────────────────────────────────────────

export const listOrdersQuerySchema = z.object({
  q:      z.string().max(200).optional(),
  status: z.enum(["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"]).optional(),
  sort:   z.enum(["createdAt_desc", "createdAt_asc", "total_desc", "total_asc"])
           .default("createdAt_desc"),
  limit:  z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(500).optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

// ── Create body ───────────────────────────────────────────────────────────────

const orderItemSchema = z.object({
  name:          z.string().min(1).max(200),
  quantity:      z.number().int().min(1).max(1_000),
  unitPriceCents: z.number().int().min(1).max(100_000_00),
});

export const createOrderBodySchema = z.object({
  customerName: z.string().min(1).max(120),
  email:        z.string().email(),
  items:        z.array(orderItemSchema).min(1).max(5),
});

export type CreateOrderBody = z.infer<typeof createOrderBodySchema>;
