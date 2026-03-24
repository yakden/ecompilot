# syntax=docker/dockerfile:1.7
# EcomPilot Service — Multi-stage Dockerfile
# Usage: docker build --build-arg SERVICE_NAME=auth-service -f infra/docker/service.Dockerfile .

ARG SERVICE_NAME
ARG NODE_VERSION=22
ARG PNPM_VERSION=9.15.0

# ─────────────────────────────────────────────────────────────
# Stage 1: deps — install all workspace dependencies
# ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps

ARG PNPM_VERSION
ARG SERVICE_NAME

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Copy workspace manifests for dependency caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/event-contracts/package.json ./packages/event-contracts/
COPY packages/shared-observability/package.json ./packages/shared-observability/
COPY packages/shared-ui/package.json ./packages/shared-ui/
COPY packages/api-client/package.json ./packages/api-client/
COPY services/${SERVICE_NAME}/package.json ./services/${SERVICE_NAME}/

# Install with frozen lockfile — production deps only for image, all for build
RUN pnpm install --frozen-lockfile --ignore-scripts

# ─────────────────────────────────────────────────────────────
# Stage 2: builder — compile TypeScript
# ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder

ARG PNPM_VERSION
ARG SERVICE_NAME

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Copy installed dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/services/${SERVICE_NAME} ./services/${SERVICE_NAME}

# Copy source files
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/${SERVICE_NAME}/ ./services/${SERVICE_NAME}/

# Build shared packages first, then the service
RUN pnpm --filter @ecompilot/shared-types build && \
    pnpm --filter @ecompilot/event-contracts build && \
    pnpm --filter @ecompilot/shared-observability build && \
    pnpm --filter @ecompilot/${SERVICE_NAME} build

# Prune dev dependencies
RUN pnpm --filter @ecompilot/${SERVICE_NAME} --prod deploy /prod/${SERVICE_NAME}

# ─────────────────────────────────────────────────────────────
# Stage 3: production — distroless runtime
# ─────────────────────────────────────────────────────────────
FROM gcr.io/distroless/nodejs22-debian12 AS production

ARG SERVICE_NAME

# Security: run as nonroot (distroless nonroot uid=65532)
USER nonroot

WORKDIR /app

# Copy pruned production bundle
COPY --from=builder --chown=nonroot:nonroot /prod/${SERVICE_NAME}/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /app/services/${SERVICE_NAME}/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /app/services/${SERVICE_NAME}/package.json ./package.json

# Application port + Prometheus metrics port
EXPOSE 3000
EXPOSE 9464

# OpenTelemetry environment variables (override at runtime)
ENV NODE_ENV=production \
    PORT=3000 \
    METRICS_PORT=9464 \
    OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318 \
    OTEL_TRACES_SAMPLER=parentbased_traceidratio \
    OTEL_TRACES_SAMPLER_ARG=1.0

# Health check via HTTP (service must expose /health)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"]

CMD ["dist/index.js"]
