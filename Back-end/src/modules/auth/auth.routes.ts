import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { loginSchema } from "./auth.schemas.js";
import { login, logout, me } from "./auth.controller.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,                 // max 10 attempts per window per IP
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later" },
});

router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

export default router;
