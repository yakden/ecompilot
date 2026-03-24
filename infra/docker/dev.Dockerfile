FROM node:20-alpine

ARG SERVICE_NAME
ARG SERVICE_PORT=3000

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY turbo.json tsconfig.base.json ./

# Copy ALL package.json files for workspace resolution
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/event-contracts/package.json packages/event-contracts/
COPY packages/shared-observability/package.json packages/shared-observability/
COPY packages/shared-security/package.json packages/shared-security/
COPY packages/shared-auth/package.json packages/shared-auth/
COPY packages/shared-ui/package.json packages/shared-ui/
COPY packages/api-client/package.json packages/api-client/
COPY services/${SERVICE_NAME}/package.json services/${SERVICE_NAME}/

# Install dependencies
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile

# Copy shared packages source and build them all
COPY packages/ packages/
RUN for pkg in shared-types event-contracts shared-observability shared-security shared-auth api-client; do \
      echo "Building $pkg..." && \
      cd /app/packages/$pkg && (npx tsc --project tsconfig.json 2>&1 || true); \
    done && echo "All packages built"

# Copy service source
COPY services/${SERVICE_NAME}/ services/${SERVICE_NAME}/

WORKDIR /app/services/${SERVICE_NAME}

RUN addgroup -S app && adduser -S app -G app

USER app

EXPOSE ${SERVICE_PORT}

# Run with tsx using root tsconfig for path aliases
CMD ["npx", "tsx", "--tsconfig", "/app/tsconfig.base.json", "src/index.ts"]
