# EcomPilot PL

All-in-one SaaS platform for Polish marketplace sellers. Niche analytics, inventory management, KSeF e-invoices, AI assistant, and 16 modules — one platform for Allegro, Amazon, OLX and 5 other marketplaces.

**Documentation:** [ecompilot.org](https://ecompilot.org)

## Architecture

Monorepo with 18 microservices, 3 frontend apps, and 7 shared packages.

```
ecompilot/
├── apps/
│   ├── web/          # Next.js 14 — main web app (port 3000)
│   ├── admin/        # Next.js 14 — admin dashboard (port 3002)
│   └── mobile/       # React Native / Expo — iOS & Android
├── services/
│   ├── api-gateway/          # Entry point, rate limiting (port 3016)
│   ├── auth-service/         # JWT, OAuth, RBAC (port 3001)
│   ├── ai-service/           # GPT-4o RAG assistant (port 3004)
│   ├── analytics-service/    # ClickHouse analytics (port 3002)
│   ├── billing-service/      # Stripe subscriptions (port 3006)
│   ├── marketplace-hub/      # Allegro/Amazon/OLX integration (port 3012)
│   ├── logistics-engine/     # InPost/DPD/DHL carriers (port 3013)
│   ├── ksef-service/         # Polish e-invoices (port 3014)
│   ├── inventory-service/    # ABC analysis, forecasting
│   ├── calc-service/         # Margin & fee calculators (port 3003)
│   ├── content-service/      # AI content generation (port 3007)
│   ├── suppliers-service/    # Supplier database (port 3005)
│   ├── community-service/    # Forum & reputation (port 3010)
│   ├── academy-service/      # Courses & certifications (port 3009)
│   ├── legal-service/        # Legal guides (port 3008)
│   ├── notification-service/ # Email, push, in-app (port 3011)
│   ├── payment-reconciliation/ # Payment gateways (port 3015)
│   └── scraper-service/      # Data enrichment
├── packages/
│   ├── shared-types/         # TypeScript types
│   ├── event-contracts/      # NATS JetStream Zod schemas
│   ├── shared-auth/          # JWT middleware
│   ├── shared-observability/ # OpenTelemetry + Pino
│   ├── shared-security/      # Encryption, PII, SSRF protection
│   ├── shared-ui/            # Radix UI components
│   └── api-client/           # Type-safe API client
├── infra/
│   ├── docker/               # Dev & production Dockerfiles
│   ├── k8s/                  # Kubernetes manifests (Kustomize)
│   ├── terraform/            # AWS infrastructure
│   ├── argocd/               # GitOps deployment
│   └── monitoring/           # Prometheus, Grafana, OTel configs
├── docker-compose.yml            # Infrastructure (PG, Redis, NATS, etc.)
├── docker-compose.services.yml   # All 18 microservices
├── turbo.json
└── pnpm-workspace.yaml
```

Inter-service communication is event-driven via **NATS JetStream** with Zod-validated contracts. Each service owns its own PostgreSQL schema via **Drizzle ORM**.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Next.js 14, React 18, Tailwind CSS, Radix UI, Zustand, React Query, next-intl |
| **Mobile** | React Native 0.74, Expo 51 |
| **Backend** | Fastify 5, TypeScript, Drizzle ORM |
| **Databases** | PostgreSQL 16, Redis 7, ClickHouse 24, Elasticsearch 8.13 |
| **Messaging** | NATS 2.10 JetStream |
| **AI** | OpenAI GPT-4o, Pinecone (RAG) |
| **Storage** | MinIO (S3-compatible) |
| **Observability** | OpenTelemetry, Jaeger, Prometheus, Grafana, Pino |
| **Testing** | Vitest, Supertest |
| **DevOps** | Docker, Kubernetes, Terraform, ArgoCD, GitHub Actions |

## Quick Start with Docker

```bash
# 1. Clone and install
git clone https://github.com/yakden/ecompilot.git
cd ecompilot
cp .env.example .env   # Edit .env with your values

# 2. Start infrastructure
docker compose up -d

# 3. Start all services
docker compose -f docker-compose.services.yml up -d

# 4. Open
# Web app:      http://localhost:3000
# API Gateway:  http://localhost:3016
# Grafana:      http://localhost:3001
# Jaeger:       http://localhost:16686
```

## Development Setup

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9
corepack enable
pnpm install

# Start infrastructure
docker compose up -d

# Start all services in dev mode (with hot reload)
pnpm dev

# Or start a single service
cd services/auth-service && pnpm dev
```

### Common Commands

```bash
pnpm build          # Build all packages and services
pnpm dev            # Start all in watch mode
pnpm test           # Run all tests
pnpm lint           # ESLint
pnpm type-check     # TypeScript checking
pnpm format         # Prettier
```

### Per-Service Commands

```bash
pnpm run test             # vitest run
pnpm run test:watch       # vitest (watch)
pnpm run test:coverage    # vitest --coverage
pnpm run build            # tsc
pnpm run dev              # tsx watch
```

### Infrastructure (from `infra/`)

```bash
make dev                  # Start local environment
make build SERVICE=name   # Build Docker image
make build-all            # Build all images
make deploy-staging       # Deploy to staging
```

## Integrations

**Marketplaces:** Allegro, Amazon, eBay, Etsy, OLX, Vinted, Empik, Erli

**Logistics:** InPost, DPD, DHL, GLS, Poczta Polska, ORLEN

**Payments:** Przelewy24, PayU, Paynow, Tpay, imoje, Stripe

**Data Sources:** Icecat, UPC Database, Open Food Facts, VIES, KRS, CEIDG, REGON, Nominatim, UN Comtrade

## License

All rights reserved.
