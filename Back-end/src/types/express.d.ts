export interface AuthUser {
  sub: string;
  role: "ADMIN" | "AGENT";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
