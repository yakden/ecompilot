// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service Elasticsearch service
// Index: 'suppliers' with Russian/Polish analyzers
// ─────────────────────────────────────────────────────────────────────────────

import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { suppliers } from "../db/schema.js";
import type { Supplier, SupplierType } from "../db/schema.js";
import { eq } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export const esClient = new Client({ node: env.ELASTICSEARCH_URL });

const INDEX = env.ES_INDEX_SUPPLIERS;

// ─────────────────────────────────────────────────────────────────────────────
// ES Document type
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplierDocument {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly type: SupplierType;
  readonly country: string | null;
  readonly website: string | null;
  readonly logoUrl: string | null;
  readonly descriptionRu: string | null;
  readonly descriptionPl: string | null;
  readonly descriptionUa: string | null;
  readonly descriptionEn: string | null;
  readonly minimumOrderEur: number | null;
  readonly categories: string[];
  readonly platforms: string[];
  readonly supportsDropship: boolean;
  readonly hasBaselinkerId: string | null;
  readonly isVerified: boolean;
  readonly rating: number;
  readonly reviewCount: number;
  readonly languages: string[];
  readonly tags: string[];
  readonly isActive: boolean;
  readonly isFeatured: boolean;
  readonly partnerCommissionPct: number | null;
  readonly createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappings
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INDEX_MAPPINGS: Record<string, any> = {
  id: { type: "keyword" },
  name: {
    type: "text",
    analyzer: "standard",
    fields: {
      ru: { type: "text", analyzer: "russian" },
      pl: { type: "text", analyzer: "polish_custom" },
      keyword: { type: "keyword" },
    },
  },
  slug: { type: "keyword" },
  type: { type: "keyword" },
  country: { type: "keyword" },
  website: { type: "keyword", index: false },
  logoUrl: { type: "keyword", index: false },
  descriptionRu: { type: "text", analyzer: "russian" },
  descriptionPl: { type: "text", analyzer: "polish_custom" },
  descriptionUa: { type: "text", analyzer: "standard" },
  descriptionEn: { type: "text", analyzer: "standard" },
  minimumOrderEur: { type: "integer" },
  categories: { type: "keyword" },
  platforms: { type: "keyword" },
  supportsDropship: { type: "boolean" },
  hasBaselinkerId: { type: "keyword" },
  isVerified: { type: "boolean" },
  rating: { type: "float" },
  reviewCount: { type: "integer" },
  languages: { type: "keyword" },
  tags: {
    type: "text",
    analyzer: "standard",
    fields: { keyword: { type: "keyword" } },
  },
  isActive: { type: "boolean" },
  isFeatured: { type: "boolean" },
  partnerCommissionPct: { type: "float" },
  createdAt: { type: "date" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Index management
// ─────────────────────────────────────────────────────────────────────────────

export async function ensureIndex(): Promise<void> {
  const exists = await esClient.indices.exists({ index: INDEX });
  if (exists) return;

  await esClient.indices.create({
    index: INDEX,
    settings: {
      analysis: {
        analyzer: {
          polish_custom: {
            type: "custom",
            tokenizer: "standard",
            filter: ["lowercase", "asciifolding"],
          },
        },
      },
      number_of_shards: 1,
      number_of_replicas: 0,
    },
    mappings: {
      properties: INDEX_MAPPINGS,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Document builders
// ─────────────────────────────────────────────────────────────────────────────

function supplierToDocument(supplier: Supplier): SupplierDocument {
  return {
    id: supplier.id,
    name: supplier.name,
    slug: supplier.slug,
    type: supplier.type,
    country: supplier.country ?? null,
    website: supplier.website ?? null,
    logoUrl: supplier.logoUrl ?? null,
    descriptionRu: supplier.description?.ru ?? null,
    descriptionPl: supplier.description?.pl ?? null,
    descriptionUa: supplier.description?.ua ?? null,
    descriptionEn: supplier.description?.en ?? null,
    minimumOrderEur: supplier.minimumOrderEur ?? null,
    categories: supplier.categories ?? [],
    platforms: supplier.platforms ?? [],
    supportsDropship: supplier.supportsDropship,
    hasBaselinkerId: supplier.hasBaselinkerId ?? null,
    isVerified: supplier.isVerified,
    rating: parseFloat(supplier.rating ?? "0"),
    reviewCount: supplier.reviewCount,
    languages: supplier.languages ?? [],
    tags: supplier.tags ?? [],
    isActive: supplier.isActive,
    isFeatured: supplier.isFeatured,
    partnerCommissionPct: supplier.partnerCommissionPct
      ? parseFloat(supplier.partnerCommissionPct)
      : null,
    createdAt: supplier.createdAt.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Index a single supplier
// ─────────────────────────────────────────────────────────────────────────────

export async function indexSupplier(supplier: Supplier): Promise<void> {
  await esClient.index({
    index: INDEX,
    id: supplier.id,
    document: supplierToDocument(supplier),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Remove a supplier from the index
// ─────────────────────────────────────────────────────────────────────────────

export async function removeSupplierFromIndex(supplierId: string): Promise<void> {
  await esClient.delete({ index: INDEX, id: supplierId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Search filters
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplierSearchFilters {
  readonly type?: SupplierType | undefined;
  readonly minRating?: number | undefined;
  readonly dropship?: boolean | undefined;
  readonly category?: string | undefined;
  readonly country?: string | undefined;
  readonly isVerified?: boolean | undefined;
  readonly isFeatured?: boolean | undefined;
}

export interface SupplierSearchOptions {
  readonly query?: string | undefined;
  readonly filters?: SupplierSearchFilters | undefined;
  readonly page?: number | undefined;
  readonly limit?: number | undefined;
}

export interface SupplierSearchResult {
  readonly hits: SupplierDocument[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search suppliers
// ─────────────────────────────────────────────────────────────────────────────

export async function searchSuppliers(
  options: SupplierSearchOptions,
): Promise<SupplierSearchResult> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const from = (page - 1) * limit;
  const filters = options.filters ?? {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const must: any[] = [{ term: { isActive: true } }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any[] = [];

  if (options.query && options.query.trim().length > 0) {
    must.push({
      multi_match: {
        query: options.query.trim(),
        fields: [
          "name^3",
          "name.ru^2",
          "name.pl^2",
          "descriptionRu",
          "descriptionPl",
          "descriptionEn",
          "descriptionUa",
          "tags^1.5",
          "categories",
        ],
        type: "best_fields",
        fuzziness: "AUTO",
        prefix_length: 2,
      },
    });
  }

  if (filters.type !== undefined) {
    filter.push({ term: { type: filters.type } });
  }

  if (filters.minRating !== undefined) {
    filter.push({ range: { rating: { gte: filters.minRating } } });
  }

  if (filters.dropship === true) {
    filter.push({ term: { supportsDropship: true } });
  }

  if (filters.category !== undefined) {
    filter.push({ term: { categories: filters.category } });
  }

  if (filters.country !== undefined) {
    filter.push({ term: { country: filters.country } });
  }

  if (filters.isVerified === true) {
    filter.push({ term: { isVerified: true } });
  }

  if (filters.isFeatured === true) {
    filter.push({ term: { isFeatured: true } });
  }

  const response = await esClient.search<SupplierDocument>({
    index: INDEX,
    from,
    size: limit,
    query: {
      bool: {
        must,
        filter,
      },
    },
    sort: [
      { isFeatured: { order: "desc" } },
      { isVerified: { order: "desc" } },
      { rating: { order: "desc" } },
      { reviewCount: { order: "desc" } },
      "_score",
    ],
  });

  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : (response.hits.total?.value ?? 0);

  const hits = response.hits.hits
    .map((h) => h._source)
    .filter((s): s is SupplierDocument => s !== undefined);

  return {
    hits,
    total,
    page,
    limit,
    hasMore: from + hits.length < total,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk sync all suppliers from PostgreSQL → Elasticsearch
// ─────────────────────────────────────────────────────────────────────────────

export async function syncAll(): Promise<{ indexed: number; errors: number }> {
  const allSuppliers = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.isActive, true));

  if (allSuppliers.length === 0) {
    return { indexed: 0, errors: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const operations: any[] = allSuppliers.flatMap((s) => [
    { index: { _index: INDEX, _id: s.id } },
    supplierToDocument(s),
  ]);

  const result = await esClient.bulk({ operations, refresh: true });

  let errors = 0;
  if (result.errors) {
    for (const item of result.items) {
      const op = item["index"];
      if (op?.error !== undefined) {
        errors++;
      }
    }
  }

  return { indexed: allSuppliers.length - errors, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ping Elasticsearch
// ─────────────────────────────────────────────────────────────────────────────

export async function pingElasticsearch(): Promise<void> {
  await esClient.ping();
}
