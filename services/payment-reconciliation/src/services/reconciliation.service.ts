// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// Daily Reconciliation Service
//
// BullMQ cron: 0 3 * * * (runs at 03:00 UTC daily)
//
// Algorithm:
//   1. Fetch orders for the target date from marketplace-hub via NATS request
//   2. Fetch payment transactions from the database for the same date
//   3. Fetch KSeF invoices for the same date from ksef-service via NATS
//   4. Match by orderId (3-way join)
//   5. Flag discrepancies
//   6. Persist report to DB
//   7. Publish summary event via NATS
// ─────────────────────────────────────────────────────────────────────────────

import type { NatsConnection, Msg } from "nats";
import type { Logger } from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, gte, lt, isNull } from "drizzle-orm";
import type * as schema from "../db/schema.js";
import {
  transactions,
  refunds,
  reconciliationReports,
} from "../db/schema.js";
import type {
  ReconciliationDiscrepancy,
  ReconciliationReport,
  DiscrepancyType,
} from "../types/payment.js";

// ─────────────────────────────────────────────────────────────────────────────
// NATS message shapes (minimal, matching what marketplace-hub/ksef-service emit)
// ─────────────────────────────────────────────────────────────────────────────

interface OrderSummary {
  orderId: string;
  sellerId: string;
  organizationId: string | null;
  amountGrosze: number;
  currency: string;
  status: string;
  isB2B: boolean;
  createdAt: string;
}

interface InvoiceSummary {
  invoiceId: string;
  orderId: string | null;
  sellerId: string;
  totalAmountGrosze: number;
  buyerNip: string | null;
  ksefReferenceNumber: string | null;
  issueDate: string;
  isCreditNote: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// NATS request/response subjects
// ─────────────────────────────────────────────────────────────────────────────

const NATS_SUBJECTS = {
  ORDERS_FOR_DATE: "ecompilot.marketplace-hub.orders.by-date",
  INVOICES_FOR_DATE: "ecompilot.ksef.invoices.by-date",
  RECONCILIATION_COMPLETED: "ecompilot.payment_reconciliation.report.completed",
} as const;

const NATS_TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation context
// ─────────────────────────────────────────────────────────────────────────────

interface ReconciliationContext {
  readonly targetDate: string; // YYYY-MM-DD
  readonly sellerId: string | null;
  readonly db: NodePgDatabase<typeof schema>;
  readonly nats: NatsConnection;
  readonly logger: Logger;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — NATS request/response
// ─────────────────────────────────────────────────────────────────────────────

async function natsRequest<TRequest, TResponse>(
  nats: NatsConnection,
  subject: string,
  payload: TRequest,
  timeoutMs: number,
): Promise<TResponse> {
  const sc = nats.info;
  void sc; // type check only

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let reply: Msg;
  try {
    reply = await nats.request(subject, encoder.encode(JSON.stringify(payload)), {
      timeout: timeoutMs,
    });
  } catch (err) {
    throw new Error(
      `NATS request to ${subject} timed out or failed: ${String(err)}`,
    );
  }

  const raw = decoder.decode(reply.data);
  return JSON.parse(raw) as TResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Fetch orders
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOrdersForDate(
  ctx: ReconciliationContext,
): Promise<OrderSummary[]> {
  try {
    const response = await natsRequest<
      { date: string; sellerId: string | null },
      { orders: OrderSummary[] }
    >(
      ctx.nats,
      NATS_SUBJECTS.ORDERS_FOR_DATE,
      { date: ctx.targetDate, sellerId: ctx.sellerId },
      NATS_TIMEOUT_MS,
    );
    return response.orders;
  } catch (err) {
    ctx.logger.warn({ err, date: ctx.targetDate }, "Failed to fetch orders from marketplace-hub");
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Fetch transactions from DB
// ─────────────────────────────────────────────────────────────────────────────

async function fetchTransactionsForDate(
  ctx: ReconciliationContext,
): Promise<(typeof transactions.$inferSelect)[]> {
  const dayStart = new Date(`${ctx.targetDate}T00:00:00.000Z`);
  const dayEnd = new Date(`${ctx.targetDate}T23:59:59.999Z`);

  const conditions = [
    gte(transactions.createdAt, dayStart),
    lt(transactions.createdAt, dayEnd),
  ];

  if (ctx.sellerId !== null) {
    conditions.push(eq(transactions.sellerId, ctx.sellerId));
  }

  return ctx.db
    .select()
    .from(transactions)
    .where(and(...conditions));
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Fetch invoices
// ─────────────────────────────────────────────────────────────────────────────

async function fetchInvoicesForDate(
  ctx: ReconciliationContext,
): Promise<InvoiceSummary[]> {
  try {
    const response = await natsRequest<
      { date: string; sellerId: string | null },
      { invoices: InvoiceSummary[] }
    >(
      ctx.nats,
      NATS_SUBJECTS.INVOICES_FOR_DATE,
      { date: ctx.targetDate, sellerId: ctx.sellerId },
      NATS_TIMEOUT_MS,
    );
    return response.invoices;
  } catch (err) {
    ctx.logger.warn({ err, date: ctx.targetDate }, "Failed to fetch invoices from ksef-service");
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4–5 — Match + detect discrepancies
// ─────────────────────────────────────────────────────────────────────────────

interface MatchResult {
  matchedCount: number;
  discrepancies: ReconciliationDiscrepancy[];
  totalRevenueGrosze: number;
  totalFeesGrosze: number;
}

function matchAndDetect(
  orders: OrderSummary[],
  txList: (typeof transactions.$inferSelect)[],
  invoices: InvoiceSummary[],
): MatchResult {
  const discrepancies: ReconciliationDiscrepancy[] = [];
  let matchedCount = 0;
  let totalRevenueGrosze = 0;
  let totalFeesGrosze = 0;

  // Build lookup maps
  const txByOrderId = new Map<string, typeof txList[number]>();
  const txWithoutOrder: (typeof txList[number])[] = [];

  for (const tx of txList) {
    if (tx.orderId !== null) {
      if (txByOrderId.has(tx.orderId)) {
        // Duplicate payment for same order
        discrepancies.push({
          type: "duplicate_payment" as DiscrepancyType,
          orderId: tx.orderId,
          transactionId: tx.id,
          invoiceId: null,
          expectedAmountGrosze: null,
          actualAmountGrosze: tx.amountGrosze,
          details: `Duplicate transaction ${tx.id} for order ${tx.orderId}`,
        });
      } else {
        txByOrderId.set(tx.orderId, tx);
      }
    } else {
      txWithoutOrder.push(tx);
    }
  }

  const invoiceByOrderId = new Map<string, InvoiceSummary>();
  for (const inv of invoices) {
    if (inv.orderId !== null && !inv.isCreditNote) {
      invoiceByOrderId.set(inv.orderId, inv);
    }
  }

  const processedOrderIds = new Set<string>();

  // Iterate over orders
  for (const order of orders) {
    processedOrderIds.add(order.orderId);

    const tx = txByOrderId.get(order.orderId);

    if (tx === undefined) {
      // Order exists without payment
      discrepancies.push({
        type: "order_without_payment",
        orderId: order.orderId,
        transactionId: null,
        invoiceId: null,
        expectedAmountGrosze: order.amountGrosze,
        actualAmountGrosze: null,
        details: `Order ${order.orderId} has no payment transaction`,
      });
      continue;
    }

    // Amount mismatch
    if (
      tx.status === "completed" &&
      tx.amountGrosze !== order.amountGrosze
    ) {
      discrepancies.push({
        type: "amount_mismatch",
        orderId: order.orderId,
        transactionId: tx.id,
        invoiceId: null,
        expectedAmountGrosze: order.amountGrosze,
        actualAmountGrosze: tx.amountGrosze,
        details: `Amount mismatch for order ${order.orderId}: expected ${order.amountGrosze} grosze, got ${tx.amountGrosze} grosze`,
      });
    }

    // B2B invoice check (only for completed B2B transactions)
    if (
      order.isB2B &&
      tx.status === "completed" &&
      !invoiceByOrderId.has(order.orderId)
    ) {
      discrepancies.push({
        type: "missing_b2b_invoice",
        orderId: order.orderId,
        transactionId: tx.id,
        invoiceId: null,
        expectedAmountGrosze: order.amountGrosze,
        actualAmountGrosze: tx.amountGrosze,
        details: `B2B order ${order.orderId} is missing KSeF invoice`,
      });
    }

    if (tx.status === "completed") {
      matchedCount++;
      totalRevenueGrosze += tx.amountGrosze;
      totalFeesGrosze += tx.feeGrosze;
    }
  }

  // Orphaned transactions (payment without matching order)
  for (const [orderId, tx] of txByOrderId) {
    if (!processedOrderIds.has(orderId) && tx.status === "completed") {
      discrepancies.push({
        type: "payment_without_order",
        orderId,
        transactionId: tx.id,
        invoiceId: null,
        expectedAmountGrosze: null,
        actualAmountGrosze: tx.amountGrosze,
        details: `Transaction ${tx.id} references unknown order ${orderId}`,
      });
    }
  }

  // Transactions with no orderId — flag for review
  for (const tx of txWithoutOrder) {
    if (tx.status === "completed") {
      discrepancies.push({
        type: "payment_without_order",
        orderId: null,
        transactionId: tx.id,
        invoiceId: null,
        expectedAmountGrosze: null,
        actualAmountGrosze: tx.amountGrosze,
        details: `Transaction ${tx.id} has no associated order`,
      });
    }
  }

  return {
    matchedCount,
    discrepancies,
    totalRevenueGrosze,
    totalFeesGrosze,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5b — Refund-specific discrepancy check
// Separate pass: check if refunded transactions are missing credit notes
// ─────────────────────────────────────────────────────────────────────────────

async function detectRefundDiscrepancies(
  ctx: ReconciliationContext,
  txIds: string[],
): Promise<ReconciliationDiscrepancy[]> {
  if (txIds.length === 0) return [];

  const discrepancies: ReconciliationDiscrepancy[] = [];

  // Fetch completed refunds without credit notes
  const completedRefunds = await ctx.db
    .select()
    .from(refunds)
    .where(
      and(
        eq(refunds.status, "completed"),
        eq(refunds.creditNoteIssued, false),
        isNull(refunds.creditNoteId),
      ),
    );

  for (const refund of completedRefunds) {
    if (txIds.includes(refund.transactionId)) {
      discrepancies.push({
        type: "refund_without_credit_note",
        orderId: null,
        transactionId: refund.transactionId,
        invoiceId: null,
        expectedAmountGrosze: refund.amountGrosze,
        actualAmountGrosze: refund.amountGrosze,
        details: `Refund ${refund.id} (${refund.amountGrosze} grosze) has no credit note (faktura korygujaca)`,
      });
    }
  }

  return discrepancies;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Persist report
// ─────────────────────────────────────────────────────────────────────────────

async function persistReport(
  ctx: ReconciliationContext,
  data: {
    totalOrders: number;
    totalTransactions: number;
    totalInvoices: number;
    matchedCount: number;
    discrepancies: ReconciliationDiscrepancy[];
    totalRevenueGrosze: number;
    totalFeesGrosze: number;
    status: "completed" | "failed";
    errorMessage: string | null;
  },
): Promise<string> {
  const [inserted] = await ctx.db
    .insert(reconciliationReports)
    .values({
      reconciledDate: ctx.targetDate,
      sellerId: ctx.sellerId ?? null,
      totalOrders: data.totalOrders,
      totalTransactions: data.totalTransactions,
      totalInvoices: data.totalInvoices,
      matchedCount: data.matchedCount,
      discrepancyCount: data.discrepancies.length,
      discrepancies: data.discrepancies,
      totalRevenueGrosze: data.totalRevenueGrosze,
      totalFeesGrosze: data.totalFeesGrosze,
      totalNetGrosze: data.totalRevenueGrosze - data.totalFeesGrosze,
      status: data.status,
      errorMessage: data.errorMessage,
    })
    .onConflictDoUpdate({
      target: [
        reconciliationReports.reconciledDate,
        reconciliationReports.sellerId,
      ],
      set: {
        totalOrders: data.totalOrders,
        totalTransactions: data.totalTransactions,
        totalInvoices: data.totalInvoices,
        matchedCount: data.matchedCount,
        discrepancyCount: data.discrepancies.length,
        discrepancies: data.discrepancies,
        totalRevenueGrosze: data.totalRevenueGrosze,
        totalFeesGrosze: data.totalFeesGrosze,
        totalNetGrosze: data.totalRevenueGrosze - data.totalFeesGrosze,
        status: data.status,
        errorMessage: data.errorMessage,
        generatedAt: new Date(),
      },
    })
    .returning({ id: reconciliationReports.id });

  if (inserted === undefined) {
    throw new Error("Failed to insert reconciliation report");
  }

  return inserted.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 — Publish NATS event
// ─────────────────────────────────────────────────────────────────────────────

function publishReportCompleted(
  nats: NatsConnection,
  reportId: string,
  targetDate: string,
  discrepancyCount: number,
  logger: Logger,
): void {
  const encoder = new TextEncoder();
  const payload = JSON.stringify({
    reportId,
    targetDate,
    discrepancyCount,
    generatedAt: new Date().toISOString(),
  });

  try {
    nats.publish(NATS_SUBJECTS.RECONCILIATION_COMPLETED, encoder.encode(payload));
  } catch (err) {
    logger.warn({ err, reportId }, "Failed to publish reconciliation completed event");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main runReconciliation function — called by BullMQ worker
// ─────────────────────────────────────────────────────────────────────────────

export async function runReconciliation(
  params: {
    targetDate: string;
    sellerId?: string;
  },
  deps: {
    db: NodePgDatabase<typeof schema>;
    nats: NatsConnection;
    logger: Logger;
  },
): Promise<ReconciliationReport> {
  const ctx: ReconciliationContext = {
    targetDate: params.targetDate,
    sellerId: params.sellerId ?? null,
    db: deps.db,
    nats: deps.nats,
    logger: deps.logger.child({ targetDate: params.targetDate }),
  };

  ctx.logger.info({ targetDate: ctx.targetDate, sellerId: ctx.sellerId }, "Starting reconciliation");

  let reportId: string;

  try {
    // Parallel data fetch — orders and invoices from NATS, transactions from DB
    const [orders, dbTransactions, invoices] = await Promise.all([
      fetchOrdersForDate(ctx),
      fetchTransactionsForDate(ctx),
      fetchInvoicesForDate(ctx),
    ]);

    ctx.logger.info(
      {
        orders: orders.length,
        transactions: dbTransactions.length,
        invoices: invoices.length,
      },
      "Data fetched for reconciliation",
    );

    // Match and find discrepancies
    const matchResult = matchAndDetect(orders, dbTransactions, invoices);

    // Additional refund pass
    const txIds = dbTransactions.map((t) => t.id);
    const refundDiscrepancies = await detectRefundDiscrepancies(ctx, txIds);

    const allDiscrepancies = [
      ...matchResult.discrepancies,
      ...refundDiscrepancies,
    ];

    // Persist
    reportId = await persistReport(ctx, {
      totalOrders: orders.length,
      totalTransactions: dbTransactions.length,
      totalInvoices: invoices.length,
      matchedCount: matchResult.matchedCount,
      discrepancies: allDiscrepancies,
      totalRevenueGrosze: matchResult.totalRevenueGrosze,
      totalFeesGrosze: matchResult.totalFeesGrosze,
      status: "completed",
      errorMessage: null,
    });

    ctx.logger.info(
      {
        reportId,
        matchedCount: matchResult.matchedCount,
        discrepancyCount: allDiscrepancies.length,
      },
      "Reconciliation completed",
    );

    // Publish event (fire-and-forget, non-critical)
    publishReportCompleted(
      ctx.nats,
      reportId,
      ctx.targetDate,
      allDiscrepancies.length,
      ctx.logger,
    );

    return {
      id: reportId,
      reportDate: new Date().toISOString(),
      reconciledDate: ctx.targetDate,
      sellerId: ctx.sellerId,
      totalOrders: orders.length,
      totalTransactions: dbTransactions.length,
      totalInvoices: invoices.length,
      matchedCount: matchResult.matchedCount,
      discrepancyCount: allDiscrepancies.length,
      discrepancies: allDiscrepancies,
      totalRevenueGrosze: matchResult.totalRevenueGrosze,
      totalFeesGrosze: matchResult.totalFeesGrosze,
      totalNetGrosze: matchResult.totalRevenueGrosze - matchResult.totalFeesGrosze,
      status: "completed",
      errorMessage: null,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.logger.error({ err }, "Reconciliation failed");

    reportId = await persistReport(ctx, {
      totalOrders: 0,
      totalTransactions: 0,
      totalInvoices: 0,
      matchedCount: 0,
      discrepancies: [],
      totalRevenueGrosze: 0,
      totalFeesGrosze: 0,
      status: "failed",
      errorMessage,
    });

    return {
      id: reportId,
      reportDate: new Date().toISOString(),
      reconciledDate: ctx.targetDate,
      sellerId: ctx.sellerId,
      totalOrders: 0,
      totalTransactions: 0,
      totalInvoices: 0,
      matchedCount: 0,
      discrepancyCount: 0,
      discrepancies: [],
      totalRevenueGrosze: 0,
      totalFeesGrosze: 0,
      totalNetGrosze: 0,
      status: "failed",
      errorMessage,
      generatedAt: new Date().toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ job data shape
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconciliationJobData {
  targetDate: string;
  sellerId?: string;
}
