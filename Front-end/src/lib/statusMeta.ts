import type { OrderStatus } from "../types/orders";

export const STATUS_META: Record<
  OrderStatus,
  { label: string; color: string; dot: string }
> = {
  PENDING:   { label: "Pending",   color: "bg-amber-50  text-amber-700  ring-amber-200",   dot: "bg-amber-400"  },
  PAID:      { label: "Paid",      color: "bg-blue-50   text-blue-700   ring-blue-200",    dot: "bg-blue-500"   },
  SHIPPED:   { label: "Shipped",   color: "bg-violet-50 text-violet-700 ring-violet-200",  dot: "bg-violet-500" },
  DELIVERED: { label: "Delivered", color: "bg-green-50  text-green-700  ring-green-200",   dot: "bg-green-500"  },
  CANCELLED: { label: "Cancelled", color: "bg-rose-50   text-rose-700   ring-rose-200",    dot: "bg-rose-400"   },
};
