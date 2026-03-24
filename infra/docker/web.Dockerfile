FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY turbo.json tsconfig.base.json ./

# Copy package.json files (only web app deps, skip observability)
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/event-contracts/package.json packages/event-contracts/
COPY packages/shared-ui/package.json packages/shared-ui/
COPY packages/api-client/package.json packages/api-client/
COPY apps/web/package.json apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile

# Remove opentelemetry to prevent clientModules runtime crash
RUN find node_modules -path '*/@opentelemetry/api/build' -exec rm -rf {} + 2>/dev/null; \
    find node_modules -name '@opentelemetry' -type d -not -path '*/next/*' -exec rm -rf {} + 2>/dev/null; \
    true

# Copy source
COPY packages/shared-types/ packages/shared-types/
COPY packages/event-contracts/ packages/event-contracts/
COPY packages/shared-ui/ packages/shared-ui/
COPY packages/api-client/ packages/api-client/
COPY apps/web/ apps/web/

# Build shared packages
RUN cd packages/shared-types && npx tsc 2>/dev/null; \
    cd /app/packages/shared-ui && npx tsc 2>/dev/null; \
    echo "Packages built"

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && npx next build

RUN addgroup -S app && adduser -S app -G app
RUN chown -R app:app /app/apps/web/.next
USER app

WORKDIR /app/apps/web
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

CMD ["npx", "next", "start"]
