import { api } from "./client";
import type { CreateOrderInput, OrdersPage } from "../types/orders";

export interface ListOrdersParams {
  q?: string;
  status?: string;
  sort?: string;
  limit?: number;
  cursor?: string;
}

export function fetchOrders(params: ListOrdersParams) {
  const qs = new URLSearchParams();
  if (params.q)      qs.set("q",      params.q);
  if (params.status) qs.set("status", params.status);
  if (params.sort)   qs.set("sort",   params.sort);
  if (params.limit)  qs.set("limit",  String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  const query = qs.toString() ? `?${qs}` : "";
  return api<OrdersPage>(`/api/orders${query}`);
}

export function createOrder(input: CreateOrderInput, idempotencyKey: string) {
  return api<{ order: import("../types/orders").Order }>(
    "/api/orders",
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    }
  );
}

export function deleteOrder(id: string) {
  return api<void>(`/api/orders/${id}`, { method: "DELETE" });
}
