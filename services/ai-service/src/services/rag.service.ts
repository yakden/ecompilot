// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ai-service / services/rag.service.ts
// Retrieval-Augmented Generation via OpenAI embeddings + Pinecone vector DB
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import type { Logger } from "pino";
import type { Language } from "@ecompilot/shared-types";
import { env } from "../config/env.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = "text-embedding-3-large" as const;
const EMBEDDING_DIMENSIONS = 3072 as const;
const CHUNK_SIZE = 1000 as const;
const CHUNK_OVERLAP = 100 as const;
const DEFAULT_TOP_K = 5 as const;
const RELEVANCE_THRESHOLD = 0.72 as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentMetadata {
  readonly title: string;
  readonly category: string;
  readonly language: Language;
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly source?: string;
}

export interface IndexDocumentResult {
  readonly vectorIds: readonly string[];
  readonly chunksIndexed: number;
}

export interface RelevantMatch {
  readonly id: string;
  readonly score: number;
  readonly content: string;
  readonly metadata: DocumentMetadata;
}

export interface SearchResult {
  readonly matches: readonly RelevantMatch[];
  readonly query: string;
  readonly topK: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunking utility
// ─────────────────────────────────────────────────────────────────────────────

function chunkText(
  text: string,
  chunkSize: number = CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP,
): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunk = words.slice(start, end).join(" ");

    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }

    // If we've reached the end, stop
    if (end >= words.length) break;

    // Advance by chunkSize minus overlap
    start = start + chunkSize - overlap;
  }

  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// RAG Service
// ─────────────────────────────────────────────────────────────────────────────

export class RagService {
  private readonly openai: OpenAI;
  private readonly pinecone: Pinecone;
  private readonly logger: Logger;
  private readonly indexName: string;

  constructor(logger: Logger) {
    this.logger = logger;
    this.indexName = env.PINECONE_INDEX;

    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    this.pinecone = new Pinecone({
      apiKey: env.PINECONE_API_KEY,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Embed text via OpenAI text-embedding-3-large
  // ─────────────────────────────────────────────────────────────────────────

  private async embedText(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error("OpenAI returned no embedding data");
    }

    return embedding;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Embed a batch of texts
  // ─────────────────────────────────────────────────────────────────────────

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Index a document — chunk, embed, upsert to Pinecone
  // ─────────────────────────────────────────────────────────────────────────

  async indexDocument(
    content: string,
    metadata: Omit<DocumentMetadata, "chunkIndex" | "totalChunks">,
  ): Promise<IndexDocumentResult> {
    const chunks = chunkText(content);
    const totalChunks = chunks.length;

    this.logger.info(
      { title: metadata.title, totalChunks, language: metadata.language },
      "Indexing document chunks",
    );

    // Embed all chunks in a single batch call
    const embeddings = await this.embedBatch(chunks);

    const index = this.pinecone.index(this.indexName);

    // Build Pinecone vectors
    const baseId = `${metadata.category}-${metadata.language}-${Date.now()}`;
    const vectors = chunks.map((chunk, i) => {
      const embedding = embeddings[i];
      if (!embedding) {
        throw new Error(`Missing embedding for chunk index ${i}`);
      }

      const chunkMetadata: DocumentMetadata & { content: string } = {
        ...metadata,
        chunkIndex: i,
        totalChunks,
        content: chunk,
      };

      return {
        id: `${baseId}-chunk-${i}`,
        values: embedding,
        metadata: chunkMetadata as unknown as Record<string, string | number | boolean>,
      };
    });

    // Upsert in batches of 100 (Pinecone limit)
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await index.upsert(batch);
    }

    const vectorIds = vectors.map((v) => v.id);

    this.logger.info(
      { title: metadata.title, vectorIds: vectorIds.length },
      "Document indexed successfully",
    );

    return { vectorIds, chunksIndexed: totalChunks };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Search relevant documents for a query
  // ─────────────────────────────────────────────────────────────────────────

  async searchRelevant(
    query: string,
    language: Language,
    topK: number = DEFAULT_TOP_K,
  ): Promise<SearchResult> {
    this.logger.debug(
      { query: query.slice(0, 80), language, topK },
      "Searching RAG knowledge base",
    );

    const queryEmbedding = await this.embedText(query);
    const index = this.pinecone.index(this.indexName);

    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      filter: { language: { $eq: language } },
    });

    const matches: RelevantMatch[] = [];

    for (const match of queryResponse.matches) {
      const score = match.score ?? 0;

      // Apply relevance threshold
      if (score < RELEVANCE_THRESHOLD) continue;

      const rawMeta = match.metadata as
        | (Record<string, string | number | boolean> & { content?: string })
        | undefined;

      if (!rawMeta) continue;

      const content = typeof rawMeta["content"] === "string"
        ? rawMeta["content"]
        : "";

      const metadata: DocumentMetadata = {
        title: typeof rawMeta["title"] === "string" ? rawMeta["title"] : "",
        category: typeof rawMeta["category"] === "string" ? rawMeta["category"] : "",
        language: language,
        chunkIndex: typeof rawMeta["chunkIndex"] === "number" ? rawMeta["chunkIndex"] : 0,
        totalChunks: typeof rawMeta["totalChunks"] === "number" ? rawMeta["totalChunks"] : 1,
        ...(typeof rawMeta["source"] === "string" ? { source: rawMeta["source"] } : {}),
      };

      matches.push({ id: match.id, score, content, metadata });
    }

    this.logger.debug(
      { matchCount: matches.length, query: query.slice(0, 80) },
      "RAG search complete",
    );

    return { matches, query, topK };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Format RAG context for injection into system prompt
  // ─────────────────────────────────────────────────────────────────────────

  formatContextBlock(matches: readonly RelevantMatch[]): string {
    if (matches.length === 0) return "";

    const sections = matches
      .map(
        (match, i) =>
          `[${i + 1}] ${match.metadata.title} (${match.metadata.category})\n${match.content}`,
      )
      .join("\n\n---\n\n");

    return `\n\n## Relevant Knowledge Base Context\n\n${sections}\n\n---`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Health check
  // ─────────────────────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      const index = this.pinecone.index(this.indexName);
      await index.describeIndexStats();
      return true;
    } catch {
      return false;
    }
  }
}
