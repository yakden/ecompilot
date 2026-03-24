// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — api-gateway / health.ts
// Health-check aggregator for GET /api/v1/status
//
// Fans out to all 16 downstream services in parallel with a 2-second timeout.
// Classifies the overall gateway status as:
//   "ok"       — every service is healthy
//   "degraded" — one or more non-critical services are down
//   "down"     — one or more critical services are unreachable
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ServiceName } from "@ecompilot/shared-types";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GatewayOverallStatus = "ok" | "degraded" | "down";

export type ServiceCheckStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface ServiceCheckResult {
  readonly service: ServiceName;
  readonly status: ServiceCheckStatus;
  readonly latencyMs: number;
  readonly lastCheckedAt: string;
  readonly error?: string;
}

export interface GatewayStatusResponse {
  readonly status: GatewayOverallStatus;
  readonly checkedAt: string;
  readonly uptimeSeconds: number;
  readonly services: readonly ServiceCheckResult[];
  readonly summary: {
    readonly total: number;
    readonly healthy: number;
    readonly degraded: number;
    readonly unhealthy: number;
    readonly unknown: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service registry
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceDescriptor {
  readonly name: ServiceName;
  readonly healthUrl: string;
  /** If true and the service is down, the overall status becomes "down". */
  readonly critical: boolean;
}

const SERVICE_REGISTRY: readonly ServiceDescriptor[] = [
  {
    name: "auth-service",
    healthUrl: "http://auth-service:3001/health",
    critical: true,
  },
  {
    name: "analytics-service",
    healthUrl: "http://analytics-service:3002/health",
    critical: false,
  },
  {
    name: "calc-service",
    healthUrl: "http://calc-service:3003/health",
    critical: false,
  },
  {
    name: "ai-service",
    healthUrl: "http://ai-service:3004/health",
    critical: false,
  },
  {
    name: "suppliers-service",
    healthUrl: "http://suppliers-service:3005/health",
    critical: false,
  },
  {
    name: "billing-service",
    healthUrl: "http://billing-service:3006/health",
    critical: true,
  },
  {
    name: "content-service",
    healthUrl: "http://content-service:3007/health",
    critical: false,
  },
  {
    name: "legal-service",
    healthUrl: "http://legal-service:3008/health",
    critical: false,
  },
  {
    name: "academy-service",
    healthUrl: "http://academy-service:3009/health",
    critical: false,
  },
  {
    name: "community-service",
    healthUrl: "http://community-service:3010/health",
    critical: false,
  },
  {
    name: "notification-service",
    healthUrl: "http://notification-service:3011/health",
    critical: false,
  },
  {
    name: "marketplace-hub",
    healthUrl: "http://marketplace-hub:3012/health",
    critical: false,
  },
  {
    name: "logistics-engine",
    healthUrl: "http://logistics-engine:3013/health",
    critical: false,
  },
  {
    name: "ksef-service",
    healthUrl: "http://ksef-service:3014/health",
    critical: false,
  },
  {
    name: "payment-reconciliation",
    healthUrl: "http://payment-reconciliation:3015/health",
    critical: true,
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Check individual service
// ─────────────────────────────────────────────────────────────────────────────

const HEALTH_CHECK_TIMEOUT_MS = 2_000;

interface RawHealthBody {
  readonly status?: string;
}

function isRawHealthBody(value: unknown): value is RawHealthBody {
  return typeof value === "object" && value !== null;
}

async function checkService(descriptor: ServiceDescriptor): Promise<ServiceCheckResult> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, HEALTH_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(descriptor.healthUrl, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    const latencyMs = Date.now() - startedAt;
    clearTimeout(timeoutId);

    if (response.ok) {
      let serviceStatus: ServiceCheckStatus = "healthy";

      try {
        const body: unknown = await response.json();
        if (isRawHealthBody(body) && typeof body.status === "string") {
          const raw = body.status.toLowerCase();
          if (raw === "degraded") {
            serviceStatus = "degraded";
          } else if (raw === "unhealthy" || raw === "down") {
            serviceStatus = "unhealthy";
          }
        }
      } catch {
        // Body parse failure is non-fatal — HTTP 200 is sufficient.
      }

      return {
        service: descriptor.name,
        status: serviceStatus,
        latencyMs,
        lastCheckedAt: checkedAt,
      };
    }

    // Non-2xx response from upstream health endpoint
    const latencyMsErr = Date.now() - startedAt;
    return {
      service: descriptor.name,
      status: "unhealthy",
      latencyMs: latencyMsErr,
      lastCheckedAt: checkedAt,
      error: `HTTP ${response.status.toString()} ${response.statusText}`,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startedAt;

    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("abort"));

    return {
      service: descriptor.name,
      status: "unhealthy",
      latencyMs,
      lastCheckedAt: checkedAt,
      error: isTimeout
        ? `Timeout after ${HEALTH_CHECK_TIMEOUT_MS.toString()}ms`
        : err instanceof Error
          ? err.message
          : "Unknown error",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate results into overall status
// ─────────────────────────────────────────────────────────────────────────────

function computeOverallStatus(
  results: readonly ServiceCheckResult[],
): GatewayOverallStatus {
  // Build a fast lookup: service name -> critical flag
  const criticalSet = new Set<ServiceName>(
    SERVICE_REGISTRY.filter((s) => s.critical).map((s) => s.name),
  );

  let hasCriticalDown = false;
  let hasAnyDown = false;

  for (const result of results) {
    const isDown = result.status === "unhealthy" || result.status === "unknown";
    if (isDown) {
      hasAnyDown = true;
      if (criticalSet.has(result.service)) {
        hasCriticalDown = true;
        break; // No need to check further
      }
    }
  }

  if (hasCriticalDown) return "down";
  if (hasAnyDown) return "degraded";
  return "ok";
}

function buildSummary(results: readonly ServiceCheckResult[]): GatewayStatusResponse["summary"] {
  let healthy = 0;
  let degraded = 0;
  let unhealthy = 0;
  let unknown = 0;

  for (const r of results) {
    switch (r.status) {
      case "healthy":
        healthy++;
        break;
      case "degraded":
        degraded++;
        break;
      case "unhealthy":
        unhealthy++;
        break;
      case "unknown":
        unknown++;
        break;
    }
  }

  return {
    total: results.length,
    healthy,
    degraded,
    unhealthy,
    unknown,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fastify route handler factory
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterHealthAggregatorOptions {
  readonly startTime: number;
  readonly logger: Logger;
}

export function registerHealthAggregator(
  app: FastifyInstance,
  opts: RegisterHealthAggregatorOptions,
): void {
  const { startTime, logger } = opts;

  app.get(
    "/api/v1/status",
    async (_request: FastifyRequest, reply: FastifyReply): Promise<GatewayStatusResponse> => {
      const checkedAt = new Date().toISOString();

      // Fan out to all services concurrently — Promise.allSettled never rejects.
      const settled = await Promise.allSettled(
        SERVICE_REGISTRY.map((descriptor) => checkService(descriptor)),
      );

      const results: ServiceCheckResult[] = settled.map((outcome, index) => {
        if (outcome.status === "fulfilled") {
          return outcome.value;
        }

        // A truly unexpected rejection (should not occur given our catch-all)
        const descriptor = SERVICE_REGISTRY[index];
        const name: ServiceName = descriptor?.name ?? ("unknown" as ServiceName);

        logger.error(
          { service: name, reason: outcome.reason },
          "Unexpected rejection in health check",
        );

        return {
          service: name,
          status: "unknown" as const,
          latencyMs: 0,
          lastCheckedAt: checkedAt,
          error: "Unexpected probe failure",
        } satisfies ServiceCheckResult;
      });

      const overallStatus = computeOverallStatus(results);
      const summary = buildSummary(results);
      const uptimeSeconds = Math.floor((Date.now() - startTime) / 1_000);

      const httpStatusCode =
        overallStatus === "ok"
          ? 200
          : overallStatus === "degraded"
            ? 200
            : 503;

      const body: GatewayStatusResponse = {
        status: overallStatus,
        checkedAt,
        uptimeSeconds,
        services: results,
        summary,
      };

      return reply.code(httpStatusCode).send(body);
    },
  );
}
