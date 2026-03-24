// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — billing-service: Billing REST routes
// JWT-authenticated; userId sourced from verified JWT payload
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { PLAN_LIMITS } from "@ecompilot/shared-types";
import {
  createCheckoutSession,
  createPortalSession,
  cancelSubscription,
  listCustomerInvoices,
  getInvoice,
  type SupportedPlan,
  type BillingInterval,
} from "../services/stripe.service.js";
import { getDb } from "../db/client.js";
import { subscriptions, invoices } from "../db/schema.js";
import type { NatsPublisher } from "../services/nats.publisher.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Request body schemas (Zod)
// ─────────────────────────────────────────────────────────────────────────────

const CheckoutBodySchema = z.object({
  plan: z.enum(["pro", "business"]),
  interval: z.enum(["monthly", "yearly"]),
  locale: z
    .enum(["pl", "en", "de", "fr", "es", "it", "pt", "nl", "ru", "uk"])
    .optional()
    .default("pl"),
});

type CheckoutBody = z.infer<typeof CheckoutBodySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// JWT payload type -- set by shared-auth middleware via request.authUser
// ─────────────────────────────────────────────────────────────────────────────

import { requireAuth } from "@ecompilot/shared-auth";

interface AuthenticatedRequest extends FastifyRequest {
  readonly authUser: NonNullable<FastifyRequest["authUser"]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin context
// ─────────────────────────────────────────────────────────────────────────────

interface BillingRouteContext {
  readonly publisher: NatsPublisher;
  readonly logger: Logger;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route plugin
// ─────────────────────────────────────────────────────────────────────────────

export async function billingRoutes(
  fastify: FastifyInstance,
  opts: BillingRouteContext,
): Promise<void> {
  const { logger } = opts;

  // All billing routes require authentication
  fastify.addHook("preHandler", requireAuth);

  // ── POST /api/v1/billing/checkout ──────────────────────────────────────────
  // Create a Stripe Checkout session and return the redirect URL
  fastify.post<{ Body: CheckoutBody }>(
    "/api/v1/billing/checkout",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest & { body: CheckoutBody };
      const userId = req.authUser!.sub;

      // Validate body
      const parseResult = CheckoutBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parseResult.error.flatten(),
          },
        });
      }

      const { plan, interval, locale } = parseResult.data;
      const db = getDb();

      // Look up existing Stripe customer ID to avoid duplicate customers
      const existing = await db
        .select({ stripeCustomerId: subscriptions.stripeCustomerId })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      const stripeCustomerId = existing[0]?.stripeCustomerId;

      try {
        const result = await createCheckoutSession({
          userId,
          plan: plan as SupportedPlan,
          interval: interval as BillingInterval,
          locale: (locale as Parameters<typeof createCheckoutSession>[0]["locale"]) ?? "pl",
          ...(stripeCustomerId !== undefined ? { stripeCustomerId } : {}),
        });

        logger.info(
          { userId, plan, interval, sessionId: result.sessionId },
          "Checkout session created",
        );

        return reply.code(201).send({
          success: true,
          data: { checkoutUrl: result.checkoutUrl, sessionId: result.sessionId },
        });
      } catch (err) {
        logger.error({ err, userId, plan, interval }, "Failed to create checkout session");
        return reply.code(502).send({
          success: false,
          error: {
            code: "PAYMENT_FAILED",
            message: "Failed to initiate checkout. Please try again.",
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
  );

  // ── POST /api/v1/billing/portal ────────────────────────────────────────────
  // Create a Stripe Customer Portal session
  fastify.post(
    "/api/v1/billing/portal",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest;
      const userId = req.authUser!.sub;
      const db = getDb();

      const existing = await db
        .select({ stripeCustomerId: subscriptions.stripeCustomerId })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      const stripeCustomerId = existing[0]?.stripeCustomerId;
      if (stripeCustomerId === undefined) {
        return reply.code(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No billing account found. Please subscribe to a plan first.",
            timestamp: new Date().toISOString(),
          },
        });
      }

      try {
        const result = await createPortalSession(stripeCustomerId);

        logger.info({ userId }, "Portal session created");

        return reply.code(200).send({
          success: true,
          data: { portalUrl: result.portalUrl },
        });
      } catch (err) {
        logger.error({ err, userId }, "Failed to create portal session");
        return reply.code(502).send({
          success: false,
          error: {
            code: "PAYMENT_FAILED",
            message: "Failed to open billing portal. Please try again.",
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
  );

  // ── GET /api/v1/billing/subscription ──────────────────────────────────────
  // Return current subscription details for the authenticated user
  fastify.get(
    "/api/v1/billing/subscription",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest;
      const userId = req.authUser!.sub;
      const db = getDb();

      const rows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      if (rows.length === 0) {
        // Return a synthetic free-plan subscription for users who never subscribed
        return reply.code(200).send({
          success: true,
          data: {
            userId,
            plan: "free",
            interval: null,
            status: "active",
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            trialEnd: null,
            createdAt: null,
            updatedAt: null,
          },
        });
      }

      return reply.code(200).send({ success: true, data: rows[0] });
    },
  );

  // ── GET /api/v1/billing/invoices ───────────────────────────────────────────
  // List invoices for the authenticated user (from local DB, enriched from Stripe)
  fastify.get(
    "/api/v1/billing/invoices",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest;
      const userId = req.authUser!.sub;
      const db = getDb();

      // Fetch from local invoices table (synced via webhooks)
      const localInvoices = await db
        .select()
        .from(invoices)
        .where(eq(invoices.userId, userId))
        .orderBy(invoices.createdAt);

      // If no local invoices, try fetching from Stripe directly
      if (localInvoices.length === 0) {
        const subRows = await db
          .select({ stripeCustomerId: subscriptions.stripeCustomerId })
          .from(subscriptions)
          .where(eq(subscriptions.userId, userId))
          .limit(1);

        const stripeCustomerId = subRows[0]?.stripeCustomerId;
        if (stripeCustomerId === undefined) {
          return reply.code(200).send({ success: true, data: [] });
        }

        try {
          const stripeInvoices = await listCustomerInvoices(stripeCustomerId);
          const mapped = stripeInvoices.map((inv) => ({
            id: inv.id,
            userId,
            stripeInvoiceId: inv.id,
            amount: inv.amount_due,
            currency: inv.currency,
            status: inv.status ?? "open",
            pdfUrl: inv.invoice_pdf ?? null,
            createdAt: new Date(inv.created * 1000).toISOString(),
          }));
          return reply.code(200).send({ success: true, data: mapped });
        } catch (err) {
          logger.error({ err, userId }, "Failed to fetch invoices from Stripe");
          return reply.code(502).send({
            success: false,
            error: {
              code: "PAYMENT_FAILED",
              message: "Failed to retrieve invoices.",
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      return reply.code(200).send({ success: true, data: localInvoices });
    },
  );

  // ── GET /api/v1/billing/invoices/:id/pdf ──────────────────────────────────
  // Redirect to Stripe-hosted invoice PDF
  fastify.get<{ Params: { id: string } }>(
    "/api/v1/billing/invoices/:id/pdf",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest & {
        params: { id: string };
      };
      const userId = req.authUser!.sub;
      const invoiceId = req.params.id;
      const db = getDb();

      const rows = await db
        .select({
          userId: invoices.userId,
          pdfUrl: invoices.pdfUrl,
          stripeInvoiceId: invoices.stripeInvoiceId,
        })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);

      const invoice = rows[0];
      if (invoice === undefined || invoice.userId !== userId) {
        return reply.code(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Invoice not found.",
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Fetch fresh PDF URL from Stripe if not cached locally
      let pdfUrl = invoice.pdfUrl;
      if (pdfUrl === null || pdfUrl === undefined) {
        try {
          const stripeInvoice = await getInvoice(invoice.stripeInvoiceId);
          pdfUrl = stripeInvoice.invoice_pdf ?? null;
        } catch (err) {
          logger.error({ err, invoiceId }, "Failed to fetch invoice PDF URL from Stripe");
        }
      }

      if (pdfUrl === null || pdfUrl === undefined) {
        return reply.code(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Invoice PDF is not yet available.",
            timestamp: new Date().toISOString(),
          },
        });
      }

      return reply.redirect(pdfUrl, 302);
    },
  );

  // ── POST /api/v1/billing/cancel ────────────────────────────────────────────
  // Schedule subscription cancellation at period end
  fastify.post(
    "/api/v1/billing/cancel",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest;
      const userId = req.authUser!.sub;
      const db = getDb();

      const rows = await db
        .select({
          stripeSubscriptionId: subscriptions.stripeSubscriptionId,
          plan: subscriptions.plan,
          cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      const sub = rows[0];
      if (sub === undefined || sub.plan === "free") {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "No active paid subscription to cancel.",
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (sub.cancelAtPeriodEnd === true) {
        return reply.code(409).send({
          success: false,
          error: {
            code: "CONFLICT",
            message: "Subscription is already scheduled for cancellation at period end.",
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (sub.stripeSubscriptionId === null) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "No Stripe subscription ID found.",
            timestamp: new Date().toISOString(),
          },
        });
      }

      try {
        await cancelSubscription(sub.stripeSubscriptionId);

        // Optimistically update local state — webhook will confirm
        await db
          .update(subscriptions)
          .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
          .where(eq(subscriptions.userId, userId));

        logger.info(
          { userId, stripeSubscriptionId: sub.stripeSubscriptionId },
          "Subscription cancellation scheduled at period end",
        );

        return reply.code(200).send({
          success: true,
          data: {
            message: "Subscription will be cancelled at the end of the current billing period.",
            cancelAtPeriodEnd: true,
          },
        });
      } catch (err) {
        logger.error(
          { err, userId, stripeSubscriptionId: sub.stripeSubscriptionId },
          "Failed to cancel subscription via Stripe",
        );
        return reply.code(502).send({
          success: false,
          error: {
            code: "PAYMENT_FAILED",
            message: "Failed to cancel subscription. Please try again.",
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
  );

  // ── GET /api/v1/billing/usage ──────────────────────────────────────────────
  // Return current plan limits for the authenticated user
  fastify.get(
    "/api/v1/billing/usage",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest;
      const userId = req.authUser!.sub;
      const db = getDb();

      const rows = await db
        .select({
          plan: subscriptions.plan,
          status: subscriptions.status,
          currentPeriodStart: subscriptions.currentPeriodStart,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          trialEnd: subscriptions.trialEnd,
          cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      // If no subscription record, default to free plan
      const rawPlan = rows[0]?.plan ?? "free";
      // Narrow the DB text value to the Plan union before indexing PLAN_LIMITS
      const currentPlan: "free" | "pro" | "business" =
        rawPlan === "pro" || rawPlan === "business" ? rawPlan : "free";

      // PLAN_LIMITS maps free | pro | business → PlanLimits
      const limits = PLAN_LIMITS[currentPlan];

      logger.info({ userId, plan: currentPlan }, "Usage limits retrieved");

      return reply.code(200).send({
        success: true,
        data: {
          userId,
          plan: currentPlan,
          status: rows[0]?.status ?? "active",
          currentPeriodStart: rows[0]?.currentPeriodStart ?? null,
          currentPeriodEnd: rows[0]?.currentPeriodEnd ?? null,
          trialEnd: rows[0]?.trialEnd ?? null,
          cancelAtPeriodEnd: rows[0]?.cancelAtPeriodEnd ?? false,
          limits: {
            nicheAnalysis: limits.nicheAnalysis,
            aiMessages: limits.aiMessages,
            photoGenerations: limits.photoGenerations,
            suppliersAccess: limits.suppliersAccess,
            csvExport: limits.csvExport,
            apiAccess: limits.apiAccess,
            teamMembers: limits.teamMembers,
          },
        },
      });
    },
  );
}
