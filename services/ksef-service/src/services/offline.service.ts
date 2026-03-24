// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ksef-service: Offline mode service
// When KSeF is unavailable: issue invoice with OFF marker.
// On recovery: batch-submit all offline invoices within the 7-day window.
// Per MF regulation: offline invoices must be submitted within 7 days of issuance.
// ─────────────────────────────────────────────────────────────────────────────

import { eq, and, lte, isNull } from "drizzle-orm";
import type { Logger } from "pino";
import { getDb } from "../db/client.js";
import { invoices } from "../db/schema.js";
import type { KsefClient } from "./ksef-client.js";
import { generateInvoiceXml } from "./invoice.service.js";
import type { KsefInvoice, KsefBatchSubmissionResult, Nip } from "../types/ksef.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum days allowed to submit an offline invoice per KSeF regulation */
const OFFLINE_SUBMISSION_DEADLINE_DAYS = 7;

/** How many offline invoices to include in a single batch package */
const BATCH_SIZE = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Offline mode result types
// ─────────────────────────────────────────────────────────────────────────────

export interface OfflineInvoiceResult {
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  /** Deadline by which this invoice must be submitted to KSeF */
  readonly submissionDeadline: Date;
  readonly jpkMarker: "OFF";
}

export interface RecoveryBatchResult {
  readonly batchResult: KsefBatchSubmissionResult;
  readonly invoiceIds: readonly string[];
  readonly invoiceCount: number;
}

export interface RecoveryResult {
  readonly batches: readonly RecoveryBatchResult[];
  readonly totalInvoicesQueued: number;
  readonly failedInvoiceIds: readonly string[];
  readonly expiredInvoiceIds: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// OfflineService
// ─────────────────────────────────────────────────────────────────────────────

export class OfflineService {
  private readonly _logger: Logger;

  constructor(logger: Logger) {
    this._logger = logger;
  }

  /**
   * Mark an invoice as issued in offline mode (KSeF unavailable).
   * Sets jpkMarker = 'OFF' and calculates the 7-day submission deadline.
   *
   * The invoice must already exist in the database with status = 'draft'.
   * After this call, status transitions to 'offline'.
   */
  async markAsOffline(invoiceId: string): Promise<OfflineInvoiceResult> {
    const db = getDb();

    const rows = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        issueDate: invoices.issueDate,
        status: invoices.status,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    const invoice = rows[0];
    if (invoice === undefined) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    if (invoice.status !== "draft" && invoice.status !== "pending_ksef") {
      throw new Error(
        `Cannot mark invoice ${invoiceId} as offline: current status is '${invoice.status}'`,
      );
    }

    // Deadline is 7 calendar days from issue date
    const issueDate = new Date(invoice.issueDate);
    const submissionDeadline = new Date(issueDate);
    submissionDeadline.setDate(submissionDeadline.getDate() + OFFLINE_SUBMISSION_DEADLINE_DAYS);

    await db
      .update(invoices)
      .set({
        status: "offline",
        jpkMarker: "OFF",
        offlineSubmitDeadline: submissionDeadline,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    this._logger.warn(
      {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        submissionDeadline: submissionDeadline.toISOString(),
      },
      "Invoice issued in KSeF offline mode — must be submitted within 7 days",
    );

    return {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      submissionDeadline,
      jpkMarker: "OFF",
    };
  }

  /**
   * Retrieve all offline invoices that are pending batch submission.
   * Separates expired invoices (past the 7-day window) from submittable ones.
   */
  async getPendingOfflineInvoices(userId?: string): Promise<{
    submittable: Array<{ id: string; xmlContent: string; invoiceNumber: string }>;
    expired: Array<{ id: string; invoiceNumber: string; deadline: Date }>;
  }> {
    const db = getDb();
    const now = new Date();

    const conditions = userId !== undefined
      ? and(eq(invoices.status, "offline"), eq(invoices.userId, userId))
      : eq(invoices.status, "offline");

    const rows = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        xmlContent: invoices.xmlContent,
        offlineSubmitDeadline: invoices.offlineSubmitDeadline,
      })
      .from(invoices)
      .where(conditions);

    const submittable: Array<{ id: string; xmlContent: string; invoiceNumber: string }> = [];
    const expired: Array<{ id: string; invoiceNumber: string; deadline: Date }> = [];

    for (const row of rows) {
      if (row.offlineSubmitDeadline === null || row.offlineSubmitDeadline === undefined) {
        submittable.push({ id: row.id, xmlContent: row.xmlContent, invoiceNumber: row.invoiceNumber });
        continue;
      }

      if (row.offlineSubmitDeadline < now) {
        expired.push({
          id: row.id,
          invoiceNumber: row.invoiceNumber,
          deadline: row.offlineSubmitDeadline,
        });
      } else {
        submittable.push({ id: row.id, xmlContent: row.xmlContent, invoiceNumber: row.invoiceNumber });
      }
    }

    if (expired.length > 0) {
      this._logger.error(
        { expiredCount: expired.length, expiredIds: expired.map((e) => e.id) },
        "COMPLIANCE ALERT: Offline invoices past 7-day KSeF submission deadline",
      );
    }

    return { submittable, expired };
  }

  /**
   * Recover from KSeF outage: batch-submit all pending offline invoices.
   * Processes in chunks of BATCH_SIZE to respect API limits.
   * Expired invoices are flagged but not submitted (manual intervention required).
   *
   * @param client - Authenticated KSeF client (caller must ensure active session)
   * @param sellerNip - Seller NIP for batch session
   * @param userId - Optional filter to recover only one user's invoices
   */
  async recoverOfflineInvoices(
    client: KsefClient,
    sellerNip: Nip,
    userId?: string,
  ): Promise<RecoveryResult> {
    const db = getDb();
    const { submittable, expired } = await this.getPendingOfflineInvoices(userId);

    if (submittable.length === 0) {
      this._logger.info("No pending offline invoices to recover");
      return {
        batches: [],
        totalInvoicesQueued: 0,
        failedInvoiceIds: [],
        expiredInvoiceIds: expired.map((e) => e.id),
      };
    }

    this._logger.info(
      {
        submittableCount: submittable.length,
        expiredCount: expired.length,
        batchSize: BATCH_SIZE,
      },
      "Starting KSeF offline recovery batch submission",
    );

    const batches: RecoveryBatchResult[] = [];
    const failedInvoiceIds: string[] = [];

    // Chunk into batches
    for (let offset = 0; offset < submittable.length; offset += BATCH_SIZE) {
      const chunk = submittable.slice(offset, offset + BATCH_SIZE);
      const xmlDocuments = chunk.map((inv) => inv.xmlContent);
      const chunkIds = chunk.map((inv) => inv.id);

      try {
        const batchPackage = client.encryptBatchPackage(xmlDocuments);
        const batchResult = await client.openBatchSession(sellerNip, batchPackage);

        batches.push({
          batchResult,
          invoiceIds: chunkIds,
          invoiceCount: chunk.length,
        });

        // Update statuses to 'submitted'
        for (const invId of chunkIds) {
          await db
            .update(invoices)
            .set({
              status: "submitted",
              jpkMarker: "OFF",
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, invId));
        }

        this._logger.info(
          {
            batchReferenceNumber: batchResult.batchReferenceNumber,
            invoiceCount: chunk.length,
          },
          "Offline recovery batch submitted to KSeF",
        );
      } catch (err) {
        this._logger.error(
          { err, invoiceIds: chunkIds },
          "Failed to submit offline recovery batch — will retry on next recovery attempt",
        );
        failedInvoiceIds.push(...chunkIds);
      }
    }

    return {
      batches,
      totalInvoicesQueued: submittable.length - failedInvoiceIds.length,
      failedInvoiceIds,
      expiredInvoiceIds: expired.map((e) => e.id),
    };
  }

  /**
   * Check if any invoices are approaching the 7-day offline deadline.
   * Returns invoices due within the next 24 hours for monitoring/alerting.
   */
  async getApproachingDeadlines(): Promise<
    Array<{ id: string; invoiceNumber: string; deadline: Date; hoursRemaining: number }>
  > {
    const db = getDb();
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1_000);

    const rows = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        offlineSubmitDeadline: invoices.offlineSubmitDeadline,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, "offline"),
          lte(invoices.offlineSubmitDeadline, in24h),
          isNull(invoices.ksefReferenceNumber),
        ),
      );

    return rows
      .filter((row): row is typeof row & { offlineSubmitDeadline: Date } =>
        row.offlineSubmitDeadline !== null && row.offlineSubmitDeadline !== undefined,
      )
      .map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        deadline: row.offlineSubmitDeadline,
        hoursRemaining: Math.floor(
          (row.offlineSubmitDeadline.getTime() - now.getTime()) / (60 * 60 * 1_000),
        ),
      }));
  }
}
