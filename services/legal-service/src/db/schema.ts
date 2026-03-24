// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — legal-service / db / schema
// Drizzle ORM schema for legal_topics and legal_limits tables
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  text,
  uuid,
  boolean,
  integer,
  jsonb,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// FAQ entry shape — enforced at application layer, stored as jsonb
// ─────────────────────────────────────────────────────────────────────────────

export interface FaqEntry {
  readonly q: string;
  readonly a: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// legal_topics
// ─────────────────────────────────────────────────────────────────────────────

export const legalTopics = pgTable(
  "legal_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),

    // Titles per language
    titleRu: text("title_ru").notNull(),
    titlePl: text("title_pl").notNull(),
    titleUa: text("title_ua").notNull(),
    titleEn: text("title_en").notNull(),

    // Main content (Markdown/MDX) per language
    contentRu: text("content_ru").notNull(),
    contentPl: text("content_pl").notNull(),
    contentUa: text("content_ua").notNull(),
    contentEn: text("content_en").notNull(),

    // FAQ arrays [{q, a}] per language stored as jsonb
    faqRu: jsonb("faq_ru").$type<FaqEntry[]>().notNull().default([]),
    faqPl: jsonb("faq_pl").$type<FaqEntry[]>().notNull().default([]),
    faqUa: jsonb("faq_ua").$type<FaqEntry[]>().notNull().default([]),
    faqEn: jsonb("faq_en").$type<FaqEntry[]>().notNull().default([]),

    // Classification
    category: text("category").notNull(),
    tags: text("tags").array().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),

    isPublished: boolean("is_published").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxLegalTopicsCategory: index("idx_legal_topics_category").on(table.category),
    idxLegalTopicsSort: index("idx_legal_topics_sort").on(table.sortOrder),
    idxLegalTopicsPublished: index("idx_legal_topics_published").on(table.isPublished),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// legal_limits
// Key-value store for annually-changing legal thresholds and rates
// ─────────────────────────────────────────────────────────────────────────────

export const legalLimits = pgTable(
  "legal_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    year: integer("year").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    description: text("description").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqLegalLimitsYearKey: unique("uq_legal_limits_year_key").on(table.year, table.key),
    idxLegalLimitsYear: index("idx_legal_limits_year").on(table.year),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Inferred TypeScript types
// ─────────────────────────────────────────────────────────────────────────────

export type LegalTopic = typeof legalTopics.$inferSelect;
export type NewLegalTopic = typeof legalTopics.$inferInsert;
export type LegalLimit = typeof legalLimits.$inferSelect;
export type NewLegalLimit = typeof legalLimits.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Category enumeration (kept as plain strings for extensibility)
// ─────────────────────────────────────────────────────────────────────────────

export const LEGAL_CATEGORIES = [
  "registration",
  "taxation",
  "logistics",
  "intellectual-property",
  "customs",
  "data-protection",
] as const;

export type LegalCategory = (typeof LEGAL_CATEGORIES)[number];
