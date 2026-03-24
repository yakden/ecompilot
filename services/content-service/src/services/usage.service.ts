// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// Plan limit enforcement + monthly usage counter management
// ─────────────────────────────────────────────────────────────────────────────

import { eq, and, sql } from "drizzle-orm";
import { usageCounters } from "../db/schema.js";
import { getDatabase } from "../db/client.js";
import { PLAN_LIMITS, isWithinLimit } from "@ecompilot/shared-types";
import type { Plan } from "@ecompilot/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Feature keys — typed to prevent typos
// ─────────────────────────────────────────────────────────────────────────────

export type ContentFeature =
  | "thumbnail_generation"
  | "background_removal"
  | "description_generation"
  | "translation";

// Plan limit key mapping (photo generations covers all AI image features)
const FEATURE_PLAN_LIMIT_KEY: Record<
  ContentFeature,
  keyof typeof PLAN_LIMITS.free
> = {
  thumbnail_generation: "photoGenerations",
  background_removal: "photoGenerations",
  description_generation: "aiMessages",
  translation: "aiMessages",
};

// ─────────────────────────────────────────────────────────────────────────────
// getCurrentPeriod — returns YYYY-MM string for the current month
// ─────────────────────────────────────────────────────────────────────────────

export function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// getUsageCount — fetch current period usage for a user+feature
// ─────────────────────────────────────────────────────────────────────────────

export async function getUsageCount(
  userId: string,
  feature: ContentFeature,
): Promise<number> {
  const db = getDatabase();
  const period = getCurrentPeriod();

  const rows = await db
    .select({ count: usageCounters.count })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.feature, feature),
        eq(usageCounters.period, period),
      ),
    )
    .limit(1);

  return rows[0]?.count ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// checkPlanLimit — throws if user has exhausted their monthly quota
// ─────────────────────────────────────────────────────────────────────────────

export class PlanLimitExceededError extends Error {
  readonly code = "PLAN_LIMIT_EXCEEDED" as const;

  constructor(
    readonly feature: ContentFeature,
    readonly plan: Plan,
    readonly current: number,
    readonly limit: number,
  ) {
    super(
      `Plan limit reached: ${feature} (${current}/${limit} used on plan '${plan}')`,
    );
    this.name = "PlanLimitExceededError";
  }
}

export async function checkPlanLimit(
  userId: string,
  feature: ContentFeature,
  plan: Plan,
): Promise<void> {
  const limitKey = FEATURE_PLAN_LIMIT_KEY[feature];
  const planLimits = PLAN_LIMITS[plan];
  const limit = planLimits[limitKey] as number;

  // -1 = unlimited (Business plan)
  if (limit === -1) return;

  // Free plan: 0 generations allowed
  if (limit === 0) {
    throw new PlanLimitExceededError(feature, plan, 0, 0);
  }

  const current = await getUsageCount(userId, feature);

  if (!isWithinLimit(current, limit)) {
    throw new PlanLimitExceededError(feature, plan, current, limit);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// incrementUsage — upsert the monthly counter (atomic increment)
// ─────────────────────────────────────────────────────────────────────────────

export async function incrementUsage(
  userId: string,
  feature: ContentFeature,
): Promise<void> {
  const db = getDatabase();
  const period = getCurrentPeriod();

  await db
    .insert(usageCounters)
    .values({
      userId,
      feature,
      period,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.feature, usageCounters.period],
      set: {
        count: sql`${usageCounters.count} + 1`,
      },
    });
}
