// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — Shared Observability
// Pino logger factory (always available) + lazy OpenTelemetry SDK
// ─────────────────────────────────────────────────────────────────────────────

import pino, { type Logger, type LoggerOptions } from "pino";

// Inline the ServiceName type to avoid cross-package build dependency
type ServiceName = string;

// ─────────────────────────────────────────────────────────────────────────────
// Pino logger factory (no OTel dependency — always works)
// ─────────────────────────────────────────────────────────────────────────────

export interface LoggerConfig {
  readonly service: ServiceName;
  readonly version?: string;
  readonly level?: string;
  readonly pretty?: boolean;
}

const REDACT_PATHS = [
  "authorization",
  "headers.authorization",
  "req.headers.authorization",
  "password",
  "*.password",
  "token",
  "*.token",
  "secret",
  "*.secret",
  "creditCard",
  "*.creditCard",
  "cardNumber",
  "*.cardNumber",
  "cvv",
  "*.cvv",
  "ssn",
  "*.ssn",
  "nip",
  "*.nip",
];

/**
 * Create a Pino logger with EcomPilot standard configuration.
 * Automatically redacts sensitive fields.
 */
export function createLogger(config: LoggerConfig): Logger {
  const {
    service,
    version = process.env["npm_package_version"] ?? "0.0.0",
    level = process.env["LOG_LEVEL"] ?? "info",
    pretty = process.env["NODE_ENV"] === "development",
  } = config;

  const options: LoggerOptions = {
    level,
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
    base: {
      service,
      version,
      pid: process.pid,
      env: process.env["NODE_ENV"] ?? "development",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
      bindings(bindings) {
        return {
          pid: bindings["pid"],
          host: bindings["hostname"],
          service: bindings["service"],
          version: bindings["version"],
          env: bindings["env"],
        };
      },
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  };

  if (pretty) {
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname,service,version,env",
        singleLine: false,
      },
    };
  }

  return pino(options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types for telemetry (OTel is loaded lazily)
// ─────────────────────────────────────────────────────────────────────────────

export interface TelemetryConfig {
  readonly serviceName: ServiceName;
  readonly serviceVersion?: string;
  readonly environment?: string;
  readonly otlpEndpoint?: string;
  readonly metricsPort?: number;
  readonly metricsExportIntervalMs?: number;
  readonly enableConsoleMetrics?: boolean;
}

export interface TelemetryHandle {
  readonly sdk: unknown;
  readonly tracer: unknown;
  readonly meter: unknown;
  shutdown(): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lazy telemetry initialization (requires @opentelemetry/* packages)
// ─────────────────────────────────────────────────────────────────────────────

let _sdk: unknown = null;

/**
 * Initialize OpenTelemetry SDK with OTLP HTTP exporters.
 * Requires @opentelemetry packages to be installed.
 * Returns null if OTel is not available (safe for dev without OTel).
 */
export async function initTelemetry(config: TelemetryConfig): Promise<TelemetryHandle | null> {
  try {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { Resource } = await import("@opentelemetry/resources");
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import("@opentelemetry/semantic-conventions");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-http");
    const { PeriodicExportingMetricReader, ConsoleMetricExporter } = await import("@opentelemetry/sdk-metrics");
    const { HttpInstrumentation } = await import("@opentelemetry/instrumentation-http");
    const { PgInstrumentation } = await import("@opentelemetry/instrumentation-pg");
    const { RedisInstrumentation } = await import("@opentelemetry/instrumentation-redis-4");
    const { FastifyInstrumentation } = await import("@opentelemetry/instrumentation-fastify");
    const { trace, metrics } = await import("@opentelemetry/api");

    const {
      serviceName,
      serviceVersion = process.env["npm_package_version"] ?? "0.0.0",
      environment = process.env["NODE_ENV"] ?? "development",
      otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "http://otel-collector:4318",
      metricsExportIntervalMs = 30_000,
      enableConsoleMetrics = false,
    } = config;

    const ATTR_DEPLOYMENT_ENVIRONMENT_NAME = "deployment.environment.name";

    const resource = new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: environment,
    });

    const traceExporter = new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
      headers: {},
    });

    const metricExporter = enableConsoleMetrics
      ? new ConsoleMetricExporter()
      : new OTLPMetricExporter({
          url: `${otlpEndpoint}/v1/metrics`,
          headers: {},
        });

    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: metricsExportIntervalMs,
    });

    const sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader: metricReader as any,
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingPaths: ["/health", "/ready", "/metrics"],
        }),
        new FastifyInstrumentation(),
        new PgInstrumentation({ enhancedDatabaseReporting: false }),
        new RedisInstrumentation({ dbStatementSerializer: (cmdName: string) => cmdName }),
      ],
    });

    sdk.start();
    _sdk = sdk;

    const tracer = trace.getTracer(serviceName, serviceVersion);
    const meter = metrics.getMeter(serviceName, serviceVersion);

    return {
      sdk,
      tracer,
      meter,
      async shutdown() {
        await (sdk as any).shutdown();
      },
    };
  } catch {
    // OTel packages not available — running in lightweight mode
    return null;
  }
}

/**
 * Gracefully shut down the SDK. Call on SIGTERM/SIGINT.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (_sdk !== null) {
    await (_sdk as any).shutdown();
    _sdk = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown handler
// ─────────────────────────────────────────────────────────────────────────────

export interface ShutdownHandler {
  cleanup: () => Promise<void>;
  description: string;
}

const _shutdownHandlers: ShutdownHandler[] = [];

export function onShutdown(handler: ShutdownHandler): void {
  _shutdownHandlers.unshift(handler);
}

export function registerGracefulShutdown(logger: Logger, timeoutMs = 10_000): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, "Received shutdown signal — starting graceful shutdown");

    const shutdownTimeout = setTimeout(() => {
      logger.error({ timeoutMs }, "Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, timeoutMs);

    try {
      for (const handler of _shutdownHandlers) {
        logger.info({ handler: handler.description }, "Running shutdown handler");
        try {
          await handler.cleanup();
        } catch (err) {
          logger.error({ err, handler: handler.description }, "Shutdown handler failed");
        }
      }

      await shutdownTelemetry();
      clearTimeout(shutdownTimeout);
      logger.info("Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      clearTimeout(shutdownTimeout);
      logger.error({ err }, "Unexpected error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception — exiting");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled promise rejection — exiting");
    process.exit(1);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric helpers (stub types when OTel not available)
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceMetrics {
  readonly httpRequestDuration: unknown;
  readonly httpRequestTotal: unknown;
  readonly httpErrorTotal: unknown;
  readonly activeConnections: unknown;
  readonly natsMessagesPublished: unknown;
  readonly natsMessagesConsumed: unknown;
  readonly natsMessageErrors: unknown;
}

export function createServiceMetrics(meter: any): ServiceMetrics {
  return {
    httpRequestDuration: meter?.createHistogram?.("http_request_duration_ms", {
      description: "HTTP request duration in milliseconds",
      unit: "ms",
    }),
    httpRequestTotal: meter?.createCounter?.("http_requests_total", {
      description: "Total number of HTTP requests",
    }),
    httpErrorTotal: meter?.createCounter?.("http_errors_total", {
      description: "Total number of HTTP errors (4xx/5xx)",
    }),
    activeConnections: meter?.createUpDownCounter?.("active_connections", {
      description: "Number of active connections",
    }),
    natsMessagesPublished: meter?.createCounter?.("nats_messages_published_total", {
      description: "Total NATS messages published",
    }),
    natsMessagesConsumed: meter?.createCounter?.("nats_messages_consumed_total", {
      description: "Total NATS messages consumed",
    }),
    natsMessageErrors: meter?.createCounter?.("nats_message_errors_total", {
      description: "Total NATS message processing errors",
    }),
  };
}

// Re-export types
export type { Logger } from "pino";
