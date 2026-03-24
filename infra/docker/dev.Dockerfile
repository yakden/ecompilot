FROM node:20-alpine

ARG SERVICE_NAME
ARG SERVICE_PORT=3000

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY turbo.json tsconfig.base.json ./

# Copy all package.json files for workspace resolution
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/event-contracts/package.json packages/event-contracts/
COPY packages/shared-observability/package.json packages/shared-observability/
COPY packages/shared-security/package.json packages/shared-security/
COPY packages/api-client/package.json packages/api-client/
COPY services/${SERVICE_NAME}/package.json services/${SERVICE_NAME}/

# Install dependencies
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile

# Copy shared packages source and build them
COPY packages/ packages/
RUN cd packages/shared-types && npx tsc 2>/dev/null; \
    cd /app/packages/event-contracts && npx tsc 2>/dev/null; \
    cd /app/packages/shared-observability && npx tsc 2>/dev/null; \
    echo "Packages built"

# Copy service source
COPY services/${SERVICE_NAME}/ services/${SERVICE_NAME}/

WORKDIR /app/services/${SERVICE_NAME}

RUN addgroup -S app && adduser -S app -G app

USER app

EXPOSE ${SERVICE_PORT}

# Run with tsx for TypeScript execution
CMD ["npx", "tsx", "src/index.ts"]
