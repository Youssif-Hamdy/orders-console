import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/useAuth";
import * as ordersApi from "../api/orders";
import type { CreateOrderInput, Order, OrderStatus, SortOption } from "../types/orders";
import { STATUS_META } from "../lib/statusMeta";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function uuid() {
  return crypto.randomUUID();
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OrderStatus }) {
  const { label, color, dot } = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${color}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }, (_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3.5 rounded-full bg-slate-200" style={{ width: [96, 160, 80, 72, 72, 48][i] ?? 80 }} />
        </td>
      ))}
    </tr>
  );
}

// ─── CreateOrderModal ─────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
}

function CreateOrderModal({ open, onClose }: ModalProps) {
  const queryClient = useQueryClient();
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [items, setItems] = useState([
    { name: "", quantity: 1, unitPriceCents: 0 },
  ]);
  const [error, setError] = useState<string | null>(null);

  // One Idempotency-Key per create attempt. It is renewed only after a
  // successful create or when the form content changes, so double-clicks and
  // retries of the same submission always carry the same key.
  const idempotencyKey = useRef<string>(uuid());
  const touch = () => {
    idempotencyKey.current = uuid();
  };

  const mutation = useMutation({
    mutationFn: (input: CreateOrderInput) =>
      ordersApi.createOrder(input, idempotencyKey.current),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      touch();
      onClose();
      resetForm();
    },
    onError: (err: Error) => setError(err.message),
  });

  function resetForm() {
    setCustomerName("");
    setEmail("");
    setItems([{ name: "", quantity: 1, unitPriceCents: 0 }]);
    setError(null);
  }

  function addItem() {
    if (items.length < 5) {
      touch();
      setItems((prev) => [...prev, { name: "", quantity: 1, unitPriceCents: 0 }]);
    }
  }

  function removeItem(i: number) {
    touch();
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function setItem<K extends keyof (typeof items)[0]>(
    i: number,
    key: K,
    val: (typeof items)[0][K]
  ) {
    touch();
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));
  }

  const total = items.reduce(
    (sum, it) => sum + it.quantity * it.unitPriceCents,
    0
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mutation.isPending) return;
    setError(null);
    mutation.mutate({ customerName, email, items });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in" />

      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 animate-modal-in">
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">New Order</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {/* customer */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-600">Customer name</span>
              <input
                required
                maxLength={120}
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  touch();
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 transition"
                placeholder="John Doe"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-600">Email</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  touch();
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 transition"
                placeholder="john@example.com"
              />
            </label>
          </div>

          {/* items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Items ({items.length}/5)</span>
              <button
                type="button"
                onClick={addItem}
                disabled={items.length >= 5}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-40 transition"
              >
                + Add item
              </button>
            </div>

            {items.map((item, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_64px_96px_28px] gap-2 items-end animate-fade-in"
              >
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-400">Product</span>
                  <input
                    required
                    maxLength={200}
                    value={item.name}
                    onChange={(e) => setItem(i, "name", e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 transition"
                    placeholder="Widget"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-400">Qty</span>
                  <input
                    required
                    type="number"
                    min={1}
                    max={1000}
                    value={item.quantity}
                    onChange={(e) => setItem(i, "quantity", Number(e.target.value))}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 transition"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-400">Price (¢)</span>
                  <input
                    required
                    type="number"
                    min={1}
                    value={item.unitPriceCents}
                    onChange={(e) => setItem(i, "unitPriceCents", Number(e.target.value))}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 transition"
                    placeholder="1000"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  disabled={items.length === 1}
                  className="mb-0.5 rounded-lg p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-400 disabled:opacity-0 transition"
                >
                  <svg className="size-4" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5z"/>
                    <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 010-2h4a1 1 0 011-1h2a1 1 0 011 1h4a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118z" clipRule="evenodd"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* total preview */}
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-500">Total</span>
            <span className="font-semibold text-slate-900">{formatCents(total)}</span>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 animate-fade-in">
              {error}
            </p>
          )}

          {/* actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 transition"
            >
              {mutation.isPending && (
                <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              Create order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── DeleteButton (admin only, always visible) ────────────────────────────────

function DeleteButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const mutation = useMutation({
    mutationFn: () => ordersApi.deleteOrder(id),
    onSuccess: onDeleted,
  });

  if (confirm) {
    return (
      <span className="inline-flex items-center gap-1 animate-fade-in">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 transition"
        >
          {mutation.isPending ? "…" : "Delete"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 transition"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition"
      title="Delete order"
    >
      <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5z"/>
        <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 010-2h4a1 1 0 011-1h2a1 1 0 011 1h4a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118z" clipRule="evenodd"/>
      </svg>
      Delete
    </button>
  );
}

// ─── OrderRow ─────────────────────────────────────────────────────────────────

interface OrderRowProps {
  order: Order;
  isAdmin: boolean;
  onDeleted: () => void;
  animDelay: number;
}

function OrderRow({ order, isAdmin, onDeleted, animDelay }: OrderRowProps) {
  return (
    <tr
      className="border-b border-slate-100 transition-colors hover:bg-slate-50/70"
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <td className="px-4 py-3.5 font-mono text-xs text-slate-400">
        {order.id.slice(0, 8)}…
      </td>
      <td className="px-4 py-3.5">
        <p className="text-sm font-medium text-slate-800 leading-tight">
          {order.customerName}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{order.email}</p>
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-4 py-3.5 text-right text-sm font-medium text-slate-700 tabular-nums">
        {formatCents(order.totalCents)}
      </td>
      <td className="px-4 py-3.5 text-sm text-slate-500">
        {formatDate(order.createdAt)}
      </td>
      {isAdmin && (
        <td className="px-4 py-3.5">
          <DeleteButton id={order.id} onDeleted={onDeleted} />
        </td>
      )}
    </tr>
  );
}

// ─── Filter options ───────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "createdAt_desc", label: "Newest first" },
  { value: "createdAt_asc",  label: "Oldest first" },
  { value: "total_desc",     label: "Highest total" },
  { value: "total_asc",      label: "Lowest total"  },
];

const STATUS_FILTERS = [
  { value: "",          label: "All statuses" },
  { value: "PENDING",   label: "Pending"   },
  { value: "PAID",      label: "Paid"      },
  { value: "SHIPPED",   label: "Shipped"   },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

// ─── LoadMoreBar ──────────────────────────────────────────────────────────────

interface LoadMoreBarProps {
  loaded: number;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

function LoadMoreBar({ loaded, hasMore, isLoading, onLoadMore, sentinelRef }: LoadMoreBarProps) {
  return (
    <div className="flex flex-col items-center gap-3 border-t border-slate-100 px-4 py-4">
      {/* progress text */}
      <p className="text-xs text-slate-400 tabular-nums">
        {loaded} orders loaded{hasMore ? "" : " · all loaded"}
      </p>

      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60 transition"
        >
          {isLoading ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              Loading…
            </>
          ) : (
            <>
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              Load more
            </>
          )}
        </button>
      )}

      {/* invisible sentinel — auto-triggers when button scrolls into view */}
      <div ref={sentinelRef} />
    </div>
  );
}

// ─── OrdersPage ───────────────────────────────────────────────────────────────

export function OrdersPage() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<SortOption>("createdAt_desc");
  const [modalOpen, setModalOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: ["orders", debouncedQ, status, sort],
    queryFn: ({ pageParam }) =>
      ordersApi.fetchOrders({
        q: debouncedQ || undefined,
        status: status || undefined,
        sort,
        limit: 20,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  // Auto-load when the sentinel scrolls into view
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchNext = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) fetchNext(); },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNext]);

  const allOrders = data?.pages.flatMap((p) => p.items) ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
  }

  const cols = isAdmin ? 6 : 5;

  return (
    <>
      <CreateOrderModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <div className="min-h-dvh bg-slate-50">
        {/* ── Topbar ── */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-slate-900">
                <svg className="size-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h1 className="text-sm font-semibold text-slate-900">Orders Console</h1>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline ${
                  isAdmin
                    ? "bg-rose-100 text-rose-700 ring-1 ring-rose-200"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {user?.role}
              </span>
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 transition"
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New order
              </button>
              <button
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 transition"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">

          {/* Quick status filters (no counts: real counts need a stats endpoint) */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(["ALL", "PENDING", "PAID", "SHIPPED", "DELIVERED"] as const).map((s, i) => {
              const active = (s === "ALL" && !status) || status === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s === "ALL" ? "" : s)}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className={`animate-slide-up rounded-xl border px-3 py-3 text-left text-sm font-medium transition hover:shadow-sm ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {s === "ALL" ? "All orders" : STATUS_META[s].label}
                </button>
              );
            })}
          </div>

          {/* Filters bar */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <svg className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or email…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Status filter */}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    {["ID", "Customer", "Status", "Total", "Date", ...(isAdmin ? ["Actions"] : [])].map(
                      (h) => (
                        <th
                          key={h}
                          className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                            h === "Actions" ? "text-rose-500" : ""
                          }`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isLoading
                    ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} cols={cols} />)
                    : allOrders.map((order, i) => (
                        <OrderRow
                          key={order.id}
                          order={order}
                          isAdmin={isAdmin}
                          onDeleted={invalidate}
                          animDelay={Math.min(i % 20, 15) * 30}
                        />
                      ))}

                  {/* empty state */}
                  {!isLoading && allOrders.length === 0 && (
                    <tr>
                      <td
                        colSpan={cols}
                        className="px-4 py-16 text-center"
                      >
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <svg className="size-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                          </svg>
                          <p className="text-sm">No orders found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination footer ── */}
            {!isLoading && (
              <LoadMoreBar
                loaded={allOrders.length}
                hasMore={!!hasNextPage}
                isLoading={isFetchingNextPage}
                onLoadMore={fetchNext}
                sentinelRef={sentinelRef}
              />
            )}
          </div>

          {/* Error state */}
          {isError && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 animate-fade-in">
              <svg className="size-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              {(error as Error).message}
            </div>
          )}
        </main>
      </div>
    </>
  );
}