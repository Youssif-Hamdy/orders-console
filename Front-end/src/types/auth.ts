export type Role = "ADMIN" | "AGENT";

export type User = { id: string; email?: string; role: Role };