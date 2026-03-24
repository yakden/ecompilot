// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — legal-service / routes / legal.routes
// Fastify plugin exposing all public legal API endpoints
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply, RouteGenericInterface } from "fastify";
import { eq, sql, and } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { legalTopics, legalLimits, LEGAL_CATEGORIES } from "../db/schema.js";
import type { LegalCategory } from "../db/schema.js";
import { cacheResponse, TTL_24H, TTL_7D } from "../middleware/cache.js";

// ─────────────────────────────────────────────────────────────────────────────
// Supported language union
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORTED_LANGS = ["ru", "pl", "ua", "en"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

function isLang(v: unknown): v is Lang {
  return SUPPORTED_LANGS.includes(v as Lang);
}

function coerceLang(raw: unknown): Lang {
  return isLang(raw) ? raw : "ru";
}

// ─────────────────────────────────────────────────────────────────────────────
// Query-string shapes
// ─────────────────────────────────────────────────────────────────────────────

interface LangQs {
  lang?: string;
}

interface SearchQs {
  q?: string;
  lang?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface TopicSummary {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  sortOrder: number;
}

interface TopicDetail {
  slug: string;
  title: string;
  content: string;
  faq: Array<{ q: string; a: string }>;
  category: string;
  tags: string[];
  lang: Lang;
}

interface SearchHit {
  slug: string;
  title: string;
  category: string;
  rank: number;
}

interface LimitsResponse {
  year: number;
  limits: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — pick localised field from a topic row
// ─────────────────────────────────────────────────────────────────────────────

interface TopicRow {
  titleRu: string;
  titlePl: string;
  titleUa: string;
  titleEn: string;
  contentRu: string;
  contentPl: string;
  contentUa: string;
  contentEn: string;
  faqRu: Array<{ q: string; a: string }>;
  faqPl: Array<{ q: string; a: string }>;
  faqUa: Array<{ q: string; a: string }>;
  faqEn: Array<{ q: string; a: string }>;
  [key: string]: unknown;
}

function pickTitle(row: TopicRow, lang: Lang): string {
  if (lang === "ru") return row.titleRu;
  if (lang === "pl") return row.titlePl;
  if (lang === "ua") return row.titleUa;
  return row.titleEn;
}

function pickContent(row: TopicRow, lang: Lang): string {
  if (lang === "ru") return row.contentRu;
  if (lang === "pl") return row.contentPl;
  if (lang === "ua") return row.contentUa;
  return row.contentEn;
}

function pickFaq(row: TopicRow, lang: Lang): Array<{ q: string; a: string }> {
  if (lang === "ru") return row.faqRu;
  if (lang === "pl") return row.faqPl;
  if (lang === "ua") return row.faqUa;
  return row.faqEn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export async function legalRoutes(app: FastifyInstance): Promise<void> {
  const contentCache = cacheResponse(TTL_24H);
  const limitsCache = cacheResponse(TTL_7D);

  // ── GET /api/v1/legal/topics ──────────────────────────────────────────────
  // List all published topics; title localised via ?lang=
  app.get<{ Querystring: LangQs } & RouteGenericInterface>(
    "/api/v1/legal/topics",
    {
      preHandler: contentCache.preHandler,
      onSend: contentCache.onSend,
    },
    async (request, reply: FastifyReply): Promise<TopicSummary[]> => {
      const lang = coerceLang(request.query.lang);
      const db = getDb();

      const rows = await db
        .select({
          slug: legalTopics.slug,
          titleRu: legalTopics.titleRu,
          titlePl: legalTopics.titlePl,
          titleUa: legalTopics.titleUa,
          titleEn: legalTopics.titleEn,
          category: legalTopics.category,
          tags: legalTopics.tags,
          sortOrder: legalTopics.sortOrder,
        })
        .from(legalTopics)
        .where(eq(legalTopics.isPublished, true))
        .orderBy(legalTopics.sortOrder);

      return rows.map((row) => ({
        slug: row.slug,
        title: pickTitle(row as unknown as TopicRow, lang),
        category: row.category,
        tags: row.tags,
        sortOrder: row.sortOrder,
      }));
    },
  );

  // ── GET /api/v1/legal/topics/:slug ───────────────────────────────────────
  // Full topic content + FAQ in requested language
  app.get<{ Params: { slug: string }; Querystring: LangQs } & RouteGenericInterface>(
    "/api/v1/legal/topics/:slug",
    {
      preHandler: contentCache.preHandler,
      onSend: contentCache.onSend,
    },
    async (
      request,
      reply: FastifyReply,
    ): Promise<TopicDetail> => {
      const lang = coerceLang(request.query.lang);
      const { slug } = request.params;
      const db = getDb();

      const rows = await db
        .select()
        .from(legalTopics)
        .where(and(eq(legalTopics.slug, slug), eq(legalTopics.isPublished, true)))
        .limit(1);

      const row = rows[0];
      if (!row) {
        await reply.code(404).send({ error: "Topic not found", slug });
        return reply as unknown as TopicDetail;
      }

      return {
        slug: row.slug,
        title: pickTitle(row as unknown as TopicRow, lang),
        content: pickContent(row as unknown as TopicRow, lang),
        faq: pickFaq(row as unknown as TopicRow, lang) as Array<{ q: string; a: string }>,
        category: row.category,
        tags: row.tags,
        lang,
      };
    },
  );

  // ── GET /api/v1/legal/search ─────────────────────────────────────────────
  // Full-text search using PostgreSQL tsvector across all language columns
  app.get<{ Querystring: SearchQs } & RouteGenericInterface>(
    "/api/v1/legal/search",
    {
      preHandler: contentCache.preHandler,
      onSend: contentCache.onSend,
    },
    async (
      request,
      reply: FastifyReply,
    ): Promise<SearchHit[]> => {
      const lang = coerceLang(request.query.lang);
      const q = (request.query.q ?? "").trim();

      if (q.length < 2) {
        await reply.code(400).send({ error: "Query must be at least 2 characters" });
        return reply as unknown as SearchHit[];
      }

      // Sanitise input: replace special tsquery characters
      const sanitised = q.replace(/[!&|():*'\\]/g, " ").trim().split(/\s+/).join(" & ");

      const db = getDb();

      // Build tsvector from the requested language columns
      const titleCol =
        lang === "ru"
          ? legalTopics.titleRu
          : lang === "pl"
            ? legalTopics.titlePl
            : lang === "ua"
              ? legalTopics.titleUa
              : legalTopics.titleEn;

      const contentCol =
        lang === "ru"
          ? legalTopics.contentRu
          : lang === "pl"
            ? legalTopics.contentPl
            : lang === "ua"
              ? legalTopics.contentUa
              : legalTopics.contentEn;

      const pgLang =
        lang === "ru" ? "russian" : lang === "pl" ? "simple" : lang === "ua" ? "simple" : "english";

      const rows = await db
        .select({
          slug: legalTopics.slug,
          titleRu: legalTopics.titleRu,
          titlePl: legalTopics.titlePl,
          titleUa: legalTopics.titleUa,
          titleEn: legalTopics.titleEn,
          category: legalTopics.category,
          rank: sql<number>`
            ts_rank(
              to_tsvector(${pgLang}, ${titleCol} || ' ' || ${contentCol}),
              to_tsquery(${pgLang}, ${sanitised})
            )
          `.as("rank"),
        })
        .from(legalTopics)
        .where(
          and(
            eq(legalTopics.isPublished, true),
            sql`
              to_tsvector(${pgLang}, ${titleCol} || ' ' || ${contentCol})
              @@ to_tsquery(${pgLang}, ${sanitised})
            `,
          ),
        )
        .orderBy(sql`rank DESC`)
        .limit(20);

      return rows.map((row) => ({
        slug: row.slug,
        title: pickTitle(row as unknown as TopicRow, lang),
        category: row.category,
        rank: Number(row.rank),
      }));
    },
  );

  // ── GET /api/v1/legal/limits/2025 ────────────────────────────────────────
  // All key/value pairs for the requested year
  app.get<{ Params: { year: string } } & RouteGenericInterface>(
    "/api/v1/legal/limits/:year",
    {
      preHandler: limitsCache.preHandler,
      onSend: limitsCache.onSend,
    },
    async (
      request,
      reply: FastifyReply,
    ): Promise<LimitsResponse> => {
      const year = Number(request.params.year);
      if (!Number.isInteger(year) || year < 2020 || year > 2030) {
        await reply.code(400).send({ error: "Invalid year" });
        return reply as unknown as LimitsResponse;
      }

      const db = getDb();
      const rows = await db
        .select({
          key: legalLimits.key,
          value: legalLimits.value,
          description: legalLimits.description,
        })
        .from(legalLimits)
        .where(eq(legalLimits.year, year));

      if (rows.length === 0) {
        await reply.code(404).send({ error: `No limits found for year ${year}` });
        return reply as unknown as LimitsResponse;
      }

      const limits: Record<string, unknown> = {};
      for (const row of rows) {
        limits[row.key] = row.value;
      }

      return { year, limits };
    },
  );

  // ── GET /api/v1/legal/categories ────────────────────────────────────────
  app.get(
    "/api/v1/legal/categories",
    {
      preHandler: contentCache.preHandler,
      onSend: contentCache.onSend,
    },
    async (_request: FastifyRequest, _reply: FastifyReply): Promise<LegalCategory[]> => {
      return [...LEGAL_CATEGORIES];
    },
  );
}
