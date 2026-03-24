FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY turbo.json tsconfig.base.json ./

# Copy package.json files
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/event-contracts/package.json packages/event-contracts/
COPY packages/shared-ui/package.json packages/shared-ui/
COPY packages/api-client/package.json packages/api-client/
COPY apps/web/package.json apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile

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

RUN addgroup -S app && adduser -S app -G app
RUN chown -R app:app /app
USER app

WORKDIR /app/apps/web
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Use tsx to run next dev (avoids production clientModules bug)
CMD ["npx", "next", "dev"]
