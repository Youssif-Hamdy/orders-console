export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export type SortOption =
  | "createdAt_desc"
  | "createdAt_asc"
  | "total_desc"
  | "total_asc";

export interface Order {
  id: string;
  customerName: string;
  email: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
}

export interface OrdersPage {
  items: Order[];
  nextCursor: string | null;
}

export interface CreateOrderItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CreateOrderInput {
  customerName: string;
  email: string;
  items: CreateOrderItem[];
}
