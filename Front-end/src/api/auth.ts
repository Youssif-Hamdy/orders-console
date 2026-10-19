import { api } from "./client";
import type { User } from "../types/auth";

export const login = (email: string, password: string) =>
  api<{ user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const logout = () => api<void>("/api/auth/logout", { method: "POST" });

export const fetchMe = () => api<{ user: User }>("/api/auth/me");