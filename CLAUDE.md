# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is EcomPilot

All-in-one SaaS platform for Polish marketplace sellers. Monorepo with 18 Fastify microservices, 3 frontend apps (Next.js web, Next.js admin, React Native mobile), and 7 shared packages. Manages Allegro, Amazon, OLX and 5 other marketplaces with analytics, inventory, KSeF e-invoices, AI assistant, and more.

## Commands

```bash
# Root-level (Turborepo)
pnpm install              # Install all dependencies
pnpm dev                  # Start all services/apps in watch mode
pnpm build                # Build all packages and services
pnpm test                 # Run all tests (vitest)
pnpm lint                 # ESLint across monorepo
pnpm type-check           # TypeScript checking
pnpm format               # Prettier

# Single service/app
cd services/auth-service && pnpm dev          # Dev with hot reload
cd services/auth-service && pnpm test         # Run tests
cd services/auth-service && pnpm test:watch   # Watch mode
cd services/auth-service && pnpm test:coverage

# Infrastructure
docker compose up -d                                    # Start infra (PG, Redis, NATS, etc.)
docker compose -f docker-compose.services.yml up -d     # Start all services in Docker

# Database schema bootstrap (first-time setup)
DATABASE_URL=... npx tsx scripts/push-schemas.ts
```

## Architecture

### Monorepo Structure

- **`apps/`** — Next.js 14 web (port 3000), Next.js admin (port 3002), React Native mobile
- **`services/`** — 18 Fastify 5 microservices, each on its own port (3001–3016)
- **`packages/`** — 7 shared packages with `@ecompilot/*` scope
- **`infra/`** — Docker, Kubernetes (Kustomize), Terraform (AWS), ArgoCD, monitoring configs

Managed by **pnpm workspaces** + **Turborepo**. Path aliases defined in `tsconfig.base.json` (`@ecompilot/shared-types`, `@ecompilot/event-contracts`, etc.).

### Service Bootstrap Pattern

Every service follows this exact order:
1. `initTelemetry()` — **must be first** (before Fastify or instrumented imports)
2. `createLogger()` — Pino logger from shared-observability
3. `initDb()` + `connectRedis()` + `connectNats()` — NATS is best-effort (non-blocking)
4. Fastify setup with plugins (CORS, helmet, rate-limit)
5. `/health` and `/ready` endpoints — registered **before** auth middleware
6. Route plugins with auth middleware
7. `registerGracefulShutdown()` with `onShutdown` handlers

### Inter-Service Communication

Event-driven via **NATS JetStream**. All events defined in `packages/event-contracts/`:
- Zod schemas with branded types (`UserId`, `EventId`, `CorrelationId`)
- Base event schema all events extend (`eventId`, `occurredAt`, `correlationId`, `source`, `schemaVersion`)
- Subject constants: `SUBJECTS.USER_REGISTERED`, `SUBJECTS.PAYMENT_SUCCEEDED`, etc.
- Stream: `ECOMPILOT_EVENTS`, 7-day retention, 1MB max message

### Database Pattern

Each service owns its own PostgreSQL tables via **Drizzle ORM**:
- Singleton pattern: `initDb()` / `getDb()` in `src/db/client.ts`
- Schema in `src/db/schema.ts` using `pgTable`
- Migrations via Drizzle Kit (`drizzle.config.ts` per service)
- UUID primary keys, JSONB for metadata, timestamps with defaults

### Auth System (shared-auth)

- Dual JWT: RS256 (user tokens) + HS256 (service-to-service)
- Bearer token or internal headers (`x-internal-service`, `x-user-id`, `x-user-plan`)
- `createAuthMiddleware()`, `requireAuth()`, `requirePlan()`, `requireInternalService()`
- Augments `FastifyRequest` with `authUser: AuthUser | null`

### Frontend (apps/web)

Next.js 14 App Router with `next-intl` (ru/pl/ua/en), TanStack React Query, Zustand stores, Tailwind CSS + Radix UI. Hooks in `hooks/`, stores in `stores/`, translations in `messages/`.

## Key Conventions

- **Environment validation**: Every service uses Zod schemas in `src/config/env.ts` — crashes fast on invalid config
- **ESLint enforces**: `no-explicit-any`, `consistent-type-imports` (inline), `no-floating-promises`, `no-console`, `eqeqeq`
- **Unused vars**: prefix with `_` (e.g., `_unused`)
- **TypeScript**: strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`
- **Testing**: Vitest with in-memory mocks (no real DB/Redis/NATS). Coverage thresholds: 80% lines/functions/statements, 70% branches. Test aliases resolve `@ecompilot/*` to source files
- **Observability**: All services use shared-observability for structured Pino logging with automatic redaction of sensitive fields (passwords, tokens, NIP). OpenTelemetry is optional/lazy
- **Graceful degradation**: NATS, OTel, and other optional infra should not block service startup
