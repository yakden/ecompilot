// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — billing-service: Stripe service
// PCI DSS: card data is NEVER handled here — only Checkout/Portal redirects
// API version: 2024-06-20 | maxNetworkRetries: 3
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";
import { env } from "../config/env.js";

// ─────────────────────────────────────────────────────────────────────────────
// Stripe client singleton
// ─────────────────────────────────────────────────────────────────────────────

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  maxNetworkRetries: 3,
  typescript: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan → Price ID mapping
// Prices in EUR: Pro €29/mo | €290/yr  |  Business €99/mo | €950/yr
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedPlan = "pro" | "business";
export type BillingInterval = "monthly" | "yearly";

export interface PriceKey {
  readonly plan: SupportedPlan;
  readonly interval: BillingInterval;
}

/**
 * Resolve the Stripe Price ID for a given plan+interval combination.
 * Prices are sourced from environment variables validated at startup.
 */
export function resolvePriceId(plan: SupportedPlan, interval: BillingInterval): string {
  const map: Record<SupportedPlan, Record<BillingInterval, string>> = {
    pro: {
      monthly: env.STRIPE_PRO_MONTHLY_PRICE_ID,
      yearly: env.STRIPE_PRO_YEARLY_PRICE_ID,
    },
    business: {
      monthly: env.STRIPE_BUSINESS_MONTHLY_PRICE_ID,
      yearly: env.STRIPE_BUSINESS_YEARLY_PRICE_ID,
    },
  };

  const priceId = map[plan][interval];
  return priceId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout Session
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCheckoutSessionParams {
  /** Internal user ID — stored in Stripe customer metadata */
  readonly userId: string;
  readonly plan: SupportedPlan;
  readonly interval: BillingInterval;
  /** BCP 47 locale for the Checkout UI (e.g. "pl", "en") */
  readonly locale?: Stripe.Checkout.SessionCreateParams.Locale;
  /** Pre-existing Stripe customer ID (if user already has one) */
  readonly stripeCustomerId?: string;
}

export interface CheckoutSessionResult {
  readonly sessionId: string;
  readonly checkoutUrl: string;
}

/**
 * Create a Stripe Checkout session.
 * - Payment methods: card, blik, p24 (Polish market)
 * - 14-day free trial for new subscriptions
 * - Promotion codes enabled
 * - VAT ID collection enabled (B2B EU compliance)
 * - Idempotency key: userId + plan + interval + YYYYMMDD
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams,
): Promise<CheckoutSessionResult> {
  const { userId, plan, interval, locale = "pl", stripeCustomerId } = params;

  const priceId = resolvePriceId(plan, interval);

  // Idempotency key scoped to user+plan+interval+day prevents duplicate
  // sessions from concurrent requests while allowing re-creation next day
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const idempotencyKey = `checkout-${userId}-${plan}-${interval}-${today}`;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    locale,

    // Payment methods available on the Polish market
    payment_method_types: ["card", "blik", "p24"],

    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],

    // 14-day trial for all paid plans
    subscription_data: {
      trial_period_days: 14,
      metadata: {
        userId,
        plan,
        interval,
      },
    },

    // Customer — either link to existing or let Stripe create a new one
    ...(stripeCustomerId !== undefined
      ? { customer: stripeCustomerId }
      : { customer_creation: "always" }),

    // Promotion / coupon codes (e.g. WELCOME10)
    allow_promotion_codes: true,

    // Collect VAT ID for B2B EU compliance
    tax_id_collection: { enabled: true },

    // Collect billing address (required for tax calculation)
    billing_address_collection: "required",

    // Redirect URLs
    success_url: `${env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_URL}/billing/cancel`,

    // Store userId in Checkout metadata for webhook reconciliation
    metadata: {
      userId,
      plan,
      interval,
    },

    // Automatic tax collection (Stripe Tax)
    automatic_tax: { enabled: true },
  };

  const session = await stripe.checkout.sessions.create(sessionParams, {
    idempotencyKey,
  });

  if (session.url === null) {
    throw new Error(
      `Stripe Checkout session created without a URL (session: ${session.id})`,
    );
  }

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer Portal
// ─────────────────────────────────────────────────────────────────────────────

export interface PortalSessionResult {
  readonly portalUrl: string;
}

/**
 * Create a Stripe Customer Portal session.
 * Users can manage their subscription, update payment method, and download invoices.
 */
export async function createPortalSession(
  stripeCustomerId: string,
): Promise<PortalSessionResult> {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${env.APP_URL}/billing`,
  });

  return { portalUrl: session.url };
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cancel a Stripe subscription at the end of the current billing period.
 * Does NOT cancel immediately — user retains access until period end.
 */
export async function cancelSubscription(
  stripeSubscriptionId: string,
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Retrieve the current state of a Stripe subscription.
 */
export async function getSubscription(
  stripeSubscriptionId: string,
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ["latest_invoice", "customer"],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook signature verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify Stripe webhook signature and return the parsed event.
 * Throws if the signature is invalid or the payload is malformed.
 * Must receive rawBody (Buffer | string) — NOT the parsed JSON.
 */
export function constructWebhookEvent(
  rawBody: Buffer | string,
  signature: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    env.STRIPE_WEBHOOK_SECRET,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List Stripe invoices for a customer, ordered by creation date descending.
 */
export async function listCustomerInvoices(
  stripeCustomerId: string,
  limit = 20,
): Promise<Stripe.Invoice[]> {
  const response = await stripe.invoices.list({
    customer: stripeCustomerId,
    limit,
    // Most recent invoices first
    expand: ["data.subscription"],
  });
  return response.data;
}

/**
 * Retrieve a single Stripe invoice by ID.
 */
export async function getInvoice(
  stripeInvoiceId: string,
): Promise<Stripe.Invoice> {
  return stripe.invoices.retrieve(stripeInvoiceId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guard helpers
// ─────────────────────────────────────────────────────────────────────────────

export function isStripeSubscription(
  obj: unknown,
): obj is Stripe.Subscription {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "object" in obj &&
    (obj as { object: string }).object === "subscription"
  );
}
