// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — billing-service: Stripe webhook handler
// CRITICAL — idempotent processing with dedup via webhook_events table
// NO JWT auth — Stripe signature verification only
// On processing error: always return HTTP 200 (let Stripe retry itself)
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { constructWebhookEvent } from "../services/stripe.service.js";
import { getDb } from "../db/client.js";
import { subscriptions, webhookEvents, invoices } from "../db/schema.js";
import type {
  Plan,
  BillingInterval,
  SubscriptionStatus,
  InvoiceStatus,
} from "../db/schema.js";
import type { NatsPublisher } from "../services/nats.publisher.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Plugin context — injected via fastify.decorate in index.ts
// ─────────────────────────────────────────────────────────────────────────────

interface WebhookRouteContext {
  readonly publisher: NatsPublisher;
  readonly logger: Logger;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe → internal type adapters
// ─────────────────────────────────────────────────────────────────────────────

function stripeStatusToInternal(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    case "trialing":
      return "trialing";
    // Stripe statuses we treat as past_due for now
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
    case "paused":
      return "past_due";
    default: {
      // Exhaustive guard — coerce any future Stripe status additions to past_due
      const _exhaustive: never = status;
      void _exhaustive;
      return "past_due";
    }
  }
}

function stripePlanFromMetadata(
  metadata: Stripe.Metadata,
): Plan {
  const plan = metadata["plan"];
  if (plan === "pro" || plan === "business") return plan;
  return "free";
}

function stripeIntervalFromMetadata(
  metadata: Stripe.Metadata,
): BillingInterval | null {
  const interval = metadata["interval"];
  if (interval === "monthly" || interval === "yearly") return interval;
  return null;
}

/** Resolve plan from subscription item price ID if metadata is missing */
function planFromItems(
  items: Stripe.SubscriptionItem[],
  env: {
    STRIPE_PRO_MONTHLY_PRICE_ID: string;
    STRIPE_PRO_YEARLY_PRICE_ID: string;
    STRIPE_BUSINESS_MONTHLY_PRICE_ID: string;
    STRIPE_BUSINESS_YEARLY_PRICE_ID: string;
  },
): Plan {
  const priceId = items[0]?.price.id;
  if (priceId === undefined) return "free";
  if (
    priceId === env.STRIPE_PRO_MONTHLY_PRICE_ID ||
    priceId === env.STRIPE_PRO_YEARLY_PRICE_ID
  )
    return "pro";
  if (
    priceId === env.STRIPE_BUSINESS_MONTHLY_PRICE_ID ||
    priceId === env.STRIPE_BUSINESS_YEARLY_PRICE_ID
  )
    return "business";
  return "free";
}

function intervalFromItems(
  items: Stripe.SubscriptionItem[],
  env: {
    STRIPE_PRO_MONTHLY_PRICE_ID: string;
    STRIPE_PRO_YEARLY_PRICE_ID: string;
    STRIPE_BUSINESS_MONTHLY_PRICE_ID: string;
    STRIPE_BUSINESS_YEARLY_PRICE_ID: string;
  },
): BillingInterval | null {
  const priceId = items[0]?.price.id;
  if (priceId === undefined) return null;
  if (
    priceId === env.STRIPE_PRO_MONTHLY_PRICE_ID ||
    priceId === env.STRIPE_BUSINESS_MONTHLY_PRICE_ID
  )
    return "monthly";
  if (
    priceId === env.STRIPE_PRO_YEARLY_PRICE_ID ||
    priceId === env.STRIPE_BUSINESS_YEARLY_PRICE_ID
  )
    return "yearly";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleSubscriptionUpsert(
  subscription: Stripe.Subscription,
  ctx: WebhookRouteContext,
  envVars: {
    STRIPE_PRO_MONTHLY_PRICE_ID: string;
    STRIPE_PRO_YEARLY_PRICE_ID: string;
    STRIPE_BUSINESS_MONTHLY_PRICE_ID: string;
    STRIPE_BUSINESS_YEARLY_PRICE_ID: string;
  },
): Promise<void> {
  const db = getDb();

  // userId is stored in subscription.metadata by Checkout session creation
  const userId = subscription.metadata["userId"];
  if (userId === undefined || userId === "") {
    ctx.logger.warn(
      { subscriptionId: subscription.id },
      "Subscription has no userId in metadata — skipping upsert",
    );
    return;
  }

  const items = subscription.items.data;
  const plan = stripePlanFromMetadata(subscription.metadata) !== "free"
    ? stripePlanFromMetadata(subscription.metadata)
    : planFromItems(items, envVars);

  const interval = stripeIntervalFromMetadata(subscription.metadata) ??
    intervalFromItems(items, envVars);

  const status = stripeStatusToInternal(subscription.status);

  const currentPeriodStart = new Date(
    subscription.current_period_start * 1000,
  );
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const trialEnd =
    subscription.trial_end !== null && subscription.trial_end !== undefined
      ? new Date(subscription.trial_end * 1000)
      : null;

  const stripeCustomerIdStr =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Upsert subscription record — insert or update on userId conflict
  await db
    .insert(subscriptions)
    .values({
      userId,
      stripeCustomerId: stripeCustomerIdStr,
      stripeSubscriptionId: subscription.id,
      plan,
      // interval is nullable in the schema — pass null to clear when not set
      interval: interval,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEnd: trialEnd,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        stripeCustomerId: stripeCustomerIdStr,
        stripeSubscriptionId: subscription.id,
        plan,
        interval: interval,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialEnd: trialEnd,
        updatedAt: new Date(),
      },
    });

  // Publish BILLING_SUBSCRIPTION_CREATED event
  await ctx.publisher.publishSubscriptionCreated({
    userId,
    stripeCustomerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    plan,
    interval,
    status,
    currentPeriodStart: currentPeriodStart.toISOString(),
    currentPeriodEnd: currentPeriodEnd.toISOString(),
    trialEnd: trialEnd?.toISOString() ?? null,
    occurredAt: new Date().toISOString(),
  });

  ctx.logger.info(
    { userId, subscriptionId: subscription.id, plan, status },
    "Subscription upserted and event published",
  );
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  ctx: WebhookRouteContext,
): Promise<void> {
  const db = getDb();

  const userId = subscription.metadata["userId"];
  if (userId === undefined || userId === "") {
    ctx.logger.warn(
      { subscriptionId: subscription.id },
      "Deleted subscription has no userId in metadata — skipping",
    );
    return;
  }

  // Reset to free plan
  await db
    .update(subscriptions)
    .set({
      plan: "free",
      interval: null,
      status: "canceled",
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, userId));

  // Publish BILLING_SUBSCRIPTION_CANCELLED event
  await ctx.publisher.publishSubscriptionCancelled({
    userId,
    stripeCustomerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    cancelledAt: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
  });

  ctx.logger.info(
    { userId, subscriptionId: subscription.id },
    "Subscription cancelled — plan reset to free, event published",
  );
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  ctx: WebhookRouteContext,
): Promise<void> {
  const db = getDb();

  // Resolve userId from subscription metadata or invoice metadata
  const userId = invoice.metadata?.["userId"] ?? invoice.subscription_details?.metadata?.["userId"];

  const stripeCustomerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer?.id ?? "");

  const stripeSubscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : (invoice.subscription?.id ?? null);

  // If we have a userId, update subscription status to past_due
  if (userId !== undefined && userId !== "") {
    await db
      .update(subscriptions)
      .set({ status: "past_due", updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId));
  }

  // Upsert the failed invoice record for audit purposes
  const invoiceStatus = (invoice.status ?? "open") as InvoiceStatus;
  await db
    .insert(invoices)
    .values({
      userId: userId ?? stripeCustomerId, // fall back to customer ID if no userId
      stripeInvoiceId: invoice.id ?? `inv_unknown_${Date.now()}`,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: invoiceStatus,
      pdfUrl: invoice.invoice_pdf ?? null,
    })
    .onConflictDoUpdate({
      target: invoices.stripeInvoiceId,
      set: {
        status: invoiceStatus,
        pdfUrl: invoice.invoice_pdf ?? null,
      },
    });

  // Publish BILLING_PAYMENT_FAILED event with reason and attempt count
  await ctx.publisher.publishPaymentFailed({
    userId: userId ?? "",
    stripeCustomerId,
    stripeInvoiceId: invoice.id ?? "",
    stripeSubscriptionId,
    amountCents: invoice.amount_due,
    currency: invoice.currency,
    failureReason: invoice.last_finalization_error?.message ?? null,
    failureCode: invoice.last_finalization_error?.code ?? null,
    attemptCount: invoice.attempt_count,
    nextPaymentAttempt:
      invoice.next_payment_attempt !== null &&
      invoice.next_payment_attempt !== undefined
        ? new Date(invoice.next_payment_attempt * 1000).toISOString()
        : null,
    occurredAt: new Date().toISOString(),
  });

  ctx.logger.warn(
    {
      invoiceId: invoice.id,
      stripeCustomerId,
      attemptCount: invoice.attempt_count,
      failureReason: invoice.last_finalization_error?.message,
    },
    "Invoice payment failed — event published",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Route plugin
// ─────────────────────────────────────────────────────────────────────────────

export async function webhookRoutes(
  fastify: FastifyInstance,
  opts: WebhookRouteContext,
): Promise<void> {
  const { logger } = opts;

  // Import env here to avoid circular dependency issues at module level
  const { env } = await import("../config/env.js");

  const envVars = {
    STRIPE_PRO_MONTHLY_PRICE_ID: env.STRIPE_PRO_MONTHLY_PRICE_ID,
    STRIPE_PRO_YEARLY_PRICE_ID: env.STRIPE_PRO_YEARLY_PRICE_ID,
    STRIPE_BUSINESS_MONTHLY_PRICE_ID: env.STRIPE_BUSINESS_MONTHLY_PRICE_ID,
    STRIPE_BUSINESS_YEARLY_PRICE_ID: env.STRIPE_BUSINESS_YEARLY_PRICE_ID,
  };

  /**
   * POST /api/v1/billing/webhook
   * Stripe signature-authenticated — NO JWT, NO rate limit on this route.
   *
   * Design decisions:
   * 1. rawBody is required for Stripe signature verification.
   * 2. We ALWAYS return 200 to Stripe, even on processing errors,
   *    to prevent Stripe from disabling the webhook endpoint.
   *    Unprocessed events (processed=false) can be replayed manually.
   * 3. Dedup via webhook_events table PK (Stripe event ID).
   */
  fastify.post(
    "/api/v1/billing/webhook",
    {
      config: {
        // Signal to rawBody plugin that this route needs the raw body
        rawBody: true,
      },
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<{ received: boolean }> => {
      const db = getDb();

      // ── 1. Extract and verify Stripe signature ──────────────────────────────
      const signatureHeader = request.headers["stripe-signature"];
      if (signatureHeader === undefined || signatureHeader === "") {
        logger.warn({ url: request.url }, "Webhook received without Stripe-Signature header");
        await reply.code(400).send({ error: "Missing Stripe-Signature header" });
        // Return to satisfy TypeScript — Fastify handles the response
        return { received: false };
      }

      const signature = Array.isArray(signatureHeader)
        ? signatureHeader[0] ?? ""
        : signatureHeader;

      // rawBody is attached by the rawBody Fastify plugin registered in index.ts
      const rawBody = (request as FastifyRequest & { rawBody?: Buffer | string }).rawBody;
      if (rawBody === undefined) {
        logger.error("rawBody is undefined — ensure @fastify/rawbody plugin is registered");
        await reply.code(500).send({ error: "Internal configuration error" });
        return { received: false };
      }

      let event: Stripe.Event;
      try {
        event = constructWebhookEvent(rawBody, signature);
      } catch (err) {
        logger.warn({ err }, "Stripe webhook signature verification failed");
        await reply.code(400).send({ error: "Invalid Stripe signature" });
        return { received: false };
      }

      // ── 2. Idempotency check — already processed? ───────────────────────────
      const existing = await db
        .select({ id: webhookEvents.id, processed: webhookEvents.processed })
        .from(webhookEvents)
        .where(eq(webhookEvents.id, event.id))
        .limit(1);

      if (existing.length > 0 && existing[0]?.processed === true) {
        logger.info(
          { eventId: event.id, type: event.type },
          "Webhook event already processed — skipping (idempotent)",
        );
        return { received: true };
      }

      // ── 3. Persist event for audit / manual replay ──────────────────────────
      if (existing.length === 0) {
        try {
          await db.insert(webhookEvents).values({
            id: event.id,
            type: event.type,
            payload: event as unknown as Record<string, unknown>,
            processed: false,
          });
        } catch (insertErr) {
          // Could be a race condition duplicate — re-check
          logger.warn({ insertErr, eventId: event.id }, "webhook_events insert conflict — re-checking");
          const recheck = await db
            .select({ processed: webhookEvents.processed })
            .from(webhookEvents)
            .where(eq(webhookEvents.id, event.id))
            .limit(1);

          if (recheck[0]?.processed === true) {
            return { received: true };
          }
        }
      }

      // ── 4. Dispatch to handler ──────────────────────────────────────────────
      //
      // IMPORTANT: We catch ALL errors and return 200.
      // Unprocessed events (processed=false) are left for manual retry.
      let processingError: unknown = null;

      try {
        switch (event.type) {
          case "customer.subscription.created":
          case "customer.subscription.updated": {
            const subscription = event.data.object as Stripe.Subscription;
            await handleSubscriptionUpsert(subscription, opts, envVars);
            break;
          }

          case "customer.subscription.deleted": {
            const subscription = event.data.object as Stripe.Subscription;
            await handleSubscriptionDeleted(subscription, opts);
            break;
          }

          case "invoice.payment_failed": {
            const invoice = event.data.object as Stripe.Invoice;
            await handleInvoicePaymentFailed(invoice, opts);
            break;
          }

          default:
            // Unhandled event type — log and skip without marking processed
            logger.info(
              { eventId: event.id, type: event.type },
              "Received unhandled Stripe event type — acknowledging without processing",
            );
        }

        // ── 5. Mark event as processed ────────────────────────────────────────
        await db
          .update(webhookEvents)
          .set({ processed: true, processedAt: new Date() })
          .where(eq(webhookEvents.id, event.id));

        logger.info(
          { eventId: event.id, type: event.type },
          "Webhook event processed successfully",
        );
      } catch (err) {
        processingError = err;

        // Leave processed=false — event stays in table for manual replay
        logger.error(
          { err, eventId: event.id, type: event.type },
          "Webhook handler threw — returning 200 to prevent Stripe retry storm; event left unprocessed for manual retry",
        );
      }

      // ── 6. Always acknowledge receipt to Stripe ────────────────────────────
      // Even on processing error we return 200 so Stripe does not disable endpoint.
      // processingError is used only for logging above — not surfaced to Stripe.
      void processingError; // explicit acknowledgement that we intentionally swallow

      return { received: true };
    },
  );
}
