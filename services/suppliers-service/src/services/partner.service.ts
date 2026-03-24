// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service Partner tracking service
// Tracks clicks and conversions for affiliate/partner suppliers
// UTM: ?ref=ecompilot&sid={userId}
// Cookie TTL: 30 days (configurable via PARTNER_COOKIE_TTL_SEC)
// Commission: 5–15% stored per supplier in partnerCommissionPct
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyReply, FastifyRequest } from "fastify";
import type { CookieSerializeOptions } from "@fastify/cookie";
import { db } from "../db/client.js";
import {
  partnerClicks,
  partnerConversions,
  suppliers,
} from "../db/schema.js";
import type {
  NewPartnerClick,
  NewPartnerConversion,
  PartnerClick,
  ConversionStatus,
} from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { env } from "../config/env.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COOKIE_NAME = "ecp_partner_sid" as const;
const UTM_REF = "ecompilot" as const;

/** Minimum commission percentage applied when supplier has none set */
const DEFAULT_COMMISSION_PCT = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TrackClickParams {
  readonly supplierId: string;
  readonly userId: string | null;
  readonly utmSource: string | null;
  readonly ipAddress: string | null;
  readonly request: FastifyRequest;
  readonly reply: FastifyReply;
}

export interface TrackConversionParams {
  readonly supplierId: string;
  readonly userId: string;
  readonly orderAmountEurCents: number;
  readonly request: FastifyRequest;
}

export interface ClickSummary {
  readonly clickId: string;
  readonly supplierId: string;
  readonly userId: string | null;
  readonly createdAt: Date;
}

export interface ConversionSummary {
  readonly id: string;
  readonly supplierId: string;
  readonly orderAmount: number;
  readonly commissionAmount: number;
  readonly status: ConversionStatus;
  readonly createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cookie helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildPartnerCookieValue(clickId: string): string {
  return clickId;
}

function setPartnerCookie(reply: FastifyReply, clickId: string): void {
  const replyWithCookie = reply as FastifyReply & {
    setCookie(name: string, value: string, options: CookieSerializeOptions): void;
  };
  replyWithCookie.setCookie(COOKIE_NAME, buildPartnerCookieValue(clickId), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env.PARTNER_COOKIE_TTL_SEC,
  });
}

function getPartnerClickIdFromCookie(request: FastifyRequest): string | null {
  // cookies available when @fastify/cookie is registered
  const cookies = (request as unknown as { cookies?: Record<string, string> }).cookies;
  if (cookies === undefined) return null;
  const value = cookies[COOKIE_NAME];
  return value !== undefined && value.length > 0 ? value : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build UTM tracking URL for a supplier
// ─────────────────────────────────────────────────────────────────────────────

export function buildPartnerUrl(
  supplierWebsite: string,
  userId: string | null,
  clickId: string,
): string {
  const url = new URL(supplierWebsite);
  url.searchParams.set("ref", UTM_REF);
  if (userId !== null) {
    url.searchParams.set("sid", userId);
  }
  url.searchParams.set("cid", clickId);
  return url.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Track a partner click
// ─────────────────────────────────────────────────────────────────────────────

export async function trackClick(
  params: TrackClickParams,
): Promise<ClickSummary> {
  const insert: NewPartnerClick = {
    supplierId: params.supplierId,
    userId: params.userId,
    utmSource: params.utmSource ?? UTM_REF,
    ipAddress: params.ipAddress,
  };

  const [click] = await db
    .insert(partnerClicks)
    .values(insert)
    .returning();

  if (click === undefined) {
    throw new Error("Failed to insert partner click");
  }

  setPartnerCookie(params.reply, click.id);

  return {
    clickId: click.id,
    supplierId: click.supplierId,
    userId: click.userId ?? null,
    createdAt: click.createdAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Track a conversion
// Links to the most recent cookie click or falls back to latest DB click
// ─────────────────────────────────────────────────────────────────────────────

export async function trackConversion(
  params: TrackConversionParams,
): Promise<ConversionSummary | null> {
  // 1. Try to resolve clickId from cookie
  let clickId = getPartnerClickIdFromCookie(params.request);

  // 2. If no cookie, attempt latest click for this user + supplier
  if (clickId === null) {
    const [latestClick] = await db
      .select()
      .from(partnerClicks)
      .where(
        and(
          eq(partnerClicks.supplierId, params.supplierId),
          eq(partnerClicks.userId, params.userId),
        ),
      )
      .orderBy(desc(partnerClicks.createdAt))
      .limit(1);

    if (latestClick !== undefined) {
      clickId = latestClick.id;
    }
  }

  if (clickId === null) {
    // No attributable click found — cannot track conversion
    return null;
  }

  // 3. Resolve supplier commission rate
  const [supplier] = await db
    .select({ partnerCommissionPct: suppliers.partnerCommissionPct })
    .from(suppliers)
    .where(eq(suppliers.id, params.supplierId))
    .limit(1);

  const commissionPct = supplier?.partnerCommissionPct
    ? parseFloat(supplier.partnerCommissionPct)
    : DEFAULT_COMMISSION_PCT;

  const commissionAmount = Math.round(
    (params.orderAmountEurCents * commissionPct) / 100,
  );

  // 4. Persist conversion
  const insert: NewPartnerConversion = {
    clickId,
    supplierId: params.supplierId,
    userId: params.userId,
    orderAmount: params.orderAmountEurCents,
    commissionAmount,
    status: "pending",
  };

  const [conversion] = await db
    .insert(partnerConversions)
    .values(insert)
    .returning();

  if (conversion === undefined) {
    throw new Error("Failed to insert partner conversion");
  }

  return {
    id: conversion.id,
    supplierId: conversion.supplierId,
    orderAmount: conversion.orderAmount,
    commissionAmount: conversion.commissionAmount,
    status: conversion.status,
    createdAt: conversion.createdAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Get partner clicks for a supplier (admin / analytics)
// ─────────────────────────────────────────────────────────────────────────────

export async function getClicksBySupplier(
  supplierId: string,
  limit = 50,
): Promise<readonly PartnerClick[]> {
  return db
    .select()
    .from(partnerClicks)
    .where(eq(partnerClicks.supplierId, supplierId))
    .orderBy(desc(partnerClicks.createdAt))
    .limit(limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Update conversion status (called by billing / webhook flows)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateConversionStatus(
  conversionId: string,
  status: ConversionStatus,
): Promise<void> {
  await db
    .update(partnerConversions)
    .set({ status })
    .where(eq(partnerConversions.id, conversionId));
}
