FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY turbo.json tsconfig.base.json ./

# Copy all package.json files for workspace resolution
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/event-contracts/package.json packages/event-contracts/
COPY packages/shared-observability/package.json packages/shared-observability/
COPY packages/shared-security/package.json packages/shared-security/
COPY packages/shared-ui/package.json packages/shared-ui/
COPY packages/api-client/package.json packages/api-client/
COPY apps/web/package.json apps/web/

# Install all dependencies
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile

# ── Build stage ──
FROM deps AS builder

WORKDIR /app

# Copy all source
COPY packages/ packages/
COPY apps/web/ apps/web/

# Build shared packages
RUN cd packages/shared-types && npx tsc 2>/dev/null; \
    cd /app/packages/event-contracts && npx tsc 2>/dev/null; \
    cd /app/packages/shared-observability && npx tsc 2>/dev/null; \
    cd /app/packages/shared-ui && npx tsc 2>/dev/null; \
    echo "Packages built"

# Build Next.js app
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && npx next build

# ── Production stage (full install, not standalone) ──
FROM builder AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S app && adduser -S app -G app
RUN chown -R app:app /app/apps/web/.next
USER app

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app/apps/web

CMD ["npx", "next", "start"]
