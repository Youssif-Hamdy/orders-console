import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../../db/prisma.js";
import { env } from "../../config/env.js";
import type { LoginInput } from "./auth.schemas.js";
import type { AuthUser } from "../../types/express.js";

const JWT_ALGORITHM = "HS256" as const;
const TOKEN_TTL = "2h";

// A dummy hash used when the email does not exist.
// bcrypt.compare() is called either way so response time stays constant.
const DUMMY_HASH =
  "$2a$10$BEyGKPRBQA5vOFBRVP6CG.x6CG5yXjcnRqI0RaDJ/SoXx9S.kXm8q";

export async function loginUser(
  input: LoginInput
): Promise<{ token: string; user: { id: string; email: string; role: string } }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always run bcrypt — even when user is not found — to avoid timing attacks.
  const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await bcrypt.compare(input.password, hashToCheck);

  if (!user || !passwordOk) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const payload: AuthUser = { sub: user.id, role: user.role };
  const token = jwt.sign(payload, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: TOKEN_TTL,
  });

  return { token, user: { id: user.id, email: user.email, role: user.role } };
}
