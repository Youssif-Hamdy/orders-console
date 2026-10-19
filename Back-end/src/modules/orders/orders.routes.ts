import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { createOrderBodySchema } from "./orders.schemas.js";
import { getOrders, postOrder, removeOrder } from "./orders.controller.js";

const router = Router();

// GET  /api/orders        — any authenticated user
router.get("/", requireAuth, getOrders);

// POST /api/orders        — any authenticated user; body validated
router.post("/", requireAuth, validate(createOrderBodySchema), postOrder);

// DELETE /api/orders/:id  — ADMIN only
router.delete("/:id", requireAuth, requireRole("ADMIN"), removeOrder);

export default router;
