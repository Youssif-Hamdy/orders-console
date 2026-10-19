import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters — use a strong random value"),
  PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_ORIGIN: z.string().url("CLIENT_ORIGIN must be a valid URL"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // When set and NODE_ENV=development, GET /api/orders adds a random delay
  // up to this many milliseconds — useful for testing frontend race conditions.
  SIMULATE_LATENCY_MS: z.coerce.number().int().min(0).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
