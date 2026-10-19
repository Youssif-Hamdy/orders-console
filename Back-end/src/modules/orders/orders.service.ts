import crypto from "crypto";
import prisma from "../../db/prisma.js";
import type { ListOrdersQuery, CreateOrderBody } from "./orders.schemas.js";
import { Prisma } from "../../../generated/prisma/client.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrderRow {
  id:           string;
  customerName: string;
  email:        string;
  status:       string;
  totalCents:   number;
  createdAt:    Date;
}

interface Cursor {
  // For createdAt sorts: epoch milliseconds (number) — avoids timezone ambiguity.
  // For totalCents sorts: the integer cent value.
  sortVal: number;
  id:      string;
}

// ── Cursor helpers ────────────────────────────────────────────────────────────

function encodeCursor(sortVal: number, id: string): string {
  return Buffer.from(JSON.stringify({ sortVal, id })).toString("base64url");
}

function decodeCursor(raw: string): Cursor {
  try {
    const obj: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof obj !== "object" || obj === null ||
      !("sortVal" in obj) || !("id" in obj) ||
      typeof (obj as Cursor).sortVal !== "number" ||
      typeof (obj as Cursor).id !== "string"
    ) throw new Error("bad shape");
    return obj as Cursor;
  } catch {
    throw Object.assign(new Error("Invalid cursor"), { statusCode: 400 });
  }
}

// ── List orders (keyset pagination) ──────────────────────────────────────────
//
// Sort columns → index used:
//   createdAt_* → @@index([createdAt])  + id tiebreaker (PK)
//   total_*     → @@index([totalCents]) + id tiebreaker (PK)
//
// Prisma cannot express a two-column keyset where-clause cleanly for the
// "desc with tiebreaker" pattern, so we fall back to $queryRaw with
// parameterised placeholders — never string concatenation.
//
export async function listOrders(
  query: ListOrdersQuery
): Promise<{ items: OrderRow[]; nextCursor: string | null }> {
  const { q, status, sort, limit, cursor: rawCursor } = query;

  const cur = rawCursor !== undefined ? decodeCursor(rawCursor) : null;

  const filters: Prisma.Sql[] = [];

  if (status) {
    filters.push(Prisma.sql`o.status = ${status}::"OrderStatus"`);
  }

  if (q) {
    const like = `%${q.toLowerCase()}%`;
    filters.push(
      Prisma.sql`(lower(o."customerName") LIKE ${like} OR lower(o.email) LIKE ${like})`
    );
  }

  type SortConfig = { col: "createdAt" | "totalCents"; dir: "ASC" | "DESC" };
  const sortMap: Record<string, SortConfig> = {
    createdAt_desc: { col: "createdAt",  dir: "DESC" },
    createdAt_asc:  { col: "createdAt",  dir: "ASC"  },
    total_desc:     { col: "totalCents", dir: "DESC" },
    total_asc:      { col: "totalCents", dir: "ASC"  },
  };

  const { col, dir } = sortMap[sort] ?? sortMap["createdAt_desc"]!;

  // Keyset predicate — written as explicit OR conditions because SQL tuple
  // comparison (a,b) < (c,d) is ASC-lexicographic, which gives wrong results
  // when the tiebreaker id is ordered DESC.
  //
  // For date columns the cursor stores epoch-ms (a plain number) so we avoid
  // timezone ambiguity: to_timestamp($n / 1000.0) always produces a UTC-based
  // timestamp that Postgres can compare to "timestamp without time zone" columns
  // after an implicit AT TIME ZONE conversion.
  if (cur !== null) {
    if (col === "createdAt") {
      // Convert epoch-ms to a timestamp for comparison
      const ms = cur.sortVal;
      if (dir === "DESC") {
        filters.push(Prisma.sql`(
          o."createdAt" < to_timestamp(${ms}::float8 / 1000.0) AT TIME ZONE 'UTC'
          OR (o."createdAt" = to_timestamp(${ms}::float8 / 1000.0) AT TIME ZONE 'UTC' AND o.id < ${cur.id})
        )`);
      } else {
        filters.push(Prisma.sql`(
          o."createdAt" > to_timestamp(${ms}::float8 / 1000.0) AT TIME ZONE 'UTC'
          OR (o."createdAt" = to_timestamp(${ms}::float8 / 1000.0) AT TIME ZONE 'UTC' AND o.id > ${cur.id})
        )`);
      }
    } else {
      const cents = cur.sortVal;
      if (dir === "DESC") {
        filters.push(Prisma.sql`(
          o."totalCents" < ${cents}
          OR (o."totalCents" = ${cents} AND o.id < ${cur.id})
        )`);
      } else {
        filters.push(Prisma.sql`(
          o."totalCents" > ${cents}
          OR (o."totalCents" = ${cents} AND o.id > ${cur.id})
        )`);
      }
    }
  }

  const whereSql =
    filters.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`
      : Prisma.empty;

  const orderBySql =
    dir === "DESC"
      ? Prisma.sql`ORDER BY o.${Prisma.raw(`"${col}"`)} DESC, o.id DESC`
      : Prisma.sql`ORDER BY o.${Prisma.raw(`"${col}"`)} ASC,  o.id ASC`;

  const fetchLimit = limit + 1;

  const rows = await prisma.$queryRaw<OrderRow[]>(Prisma.sql`
    SELECT
      o.id,
      o."customerName",
      o.email,
      o.status::text,
      o."totalCents",
      o."createdAt"
    FROM "Order" o
    ${whereSql}
    ${orderBySql}
    LIMIT ${fetchLimit}
  `);

  const hasMore = rows.length > limit;
  const items   = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = items[items.length - 1]!;
    // Store epoch-ms for dates, plain int for totalCents
    const sortVal = col === "createdAt"
      ? last.createdAt.getTime()
      : last.totalCents;
    nextCursor = encodeCursor(sortVal, last.id);
  }

  return { items, nextCursor };
}

// ── Create order (with idempotency) ──────────────────────────────────────────

function canonicalBody(body: CreateOrderBody): string {
  const canonical = {
    customerName: body.customerName.trim(),
    email:        body.email.toLowerCase().trim(),
    items:        [...body.items].sort((a, b) => a.name.localeCompare(b.name)),
  };
  return JSON.stringify(canonical);
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export interface CreateOrderResult {
  order:   OrderRow;
  created: boolean;
}

export async function createOrder(
  body: CreateOrderBody,
  idempotencyKey: string,
  createdById: string
): Promise<CreateOrderResult> {
  const requestHash = sha256(canonicalBody(body));

  const totalCents = body.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0
  );

  try {
    const order = await prisma.order.create({
      data: {
        customerName:   body.customerName,
        email:          body.email,
        totalCents,
        idempotencyKey,
        requestHash,
        createdById,
        items: {
          create: body.items.map((item) => ({
            name:           item.name,
            quantity:       item.quantity,
            unitPriceCents: item.unitPriceCents,
          })),
        },
      },
      select: {
        id:           true,
        customerName: true,
        email:        true,
        status:       true,
        totalCents:   true,
        createdAt:    true,
      },
    });

    return { order: { ...order, status: order.status as string }, created: true };
  } catch (err) {
    // P2002 = unique constraint violation on (createdById, idempotencyKey).
    // We only SELECT here — no findFirst before insert — because a pre-insert
    // check introduces a TOCTOU race. The DB constraint is the sole guard;
    // we handle the conflict after the fact.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.order.findFirstOrThrow({
        where: { createdById, idempotencyKey },
        select: {
          id:           true,
          customerName: true,
          email:        true,
          status:       true,
          totalCents:   true,
          createdAt:    true,
          requestHash:  true,
        },
      });

      if (existing.requestHash !== requestHash) {
        throw Object.assign(
          new Error("Idempotency-Key reused with a different request body"),
          { statusCode: 422 }
        );
      }

      const { requestHash: _rh, ...orderRow } = existing;
      return { order: { ...orderRow, status: orderRow.status as string }, created: false };
    }

    throw err;
  }
}

// ── Delete order ──────────────────────────────────────────────────────────────

export async function deleteOrder(id: string): Promise<boolean> {
  try {
    await prisma.order.delete({ where: { id } });
    return true;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return false;
    }
    throw err;
  }
}
