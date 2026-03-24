// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// GPT-4o text generation: product descriptions + translations (Allegro/PL SEO)
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env.js";
import type { Language } from "@ecompilot/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Client singleton
// ─────────────────────────────────────────────────────────────────────────────

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (_openai !== null) return _openai;
  _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _openai;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas for GPT structured output
// ─────────────────────────────────────────────────────────────────────────────

const DescriptionOutputSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(75)
    .describe("Product title optimised for Allegro search — max 75 chars"),
  description: z
    .string()
    .min(1)
    .max(3000)
    .describe(
      "SEO-optimised product description in HTML-free plain text, 200–800 chars",
    ),
  keywords: z
    .array(z.string().min(1).max(50))
    .min(3)
    .max(15)
    .describe("Relevant search keywords for the product"),
});

const TranslationOutputSchema = z.object({
  translatedTitle: z
    .string()
    .min(1)
    .max(75)
    .describe("Translated product title"),
  translatedDescription: z
    .string()
    .min(1)
    .max(3000)
    .describe("Translated product description"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type DescriptionOutput = z.infer<typeof DescriptionOutputSchema>;
export type TranslationOutput = z.infer<typeof TranslationOutputSchema>;

export interface ProductInfo {
  /** Product name / short title */
  readonly name: string;
  /** Category on Allegro (e.g. "Electronics > Phones") */
  readonly category: string;
  /** Key product features or bullet points */
  readonly features: readonly string[];
  /** Brand name (optional) */
  readonly brand?: string;
  /** EAN / GTIN barcode (optional — helps SEO) */
  readonly ean?: string;
  /** Selling price in PLN (optional — helps context) */
  readonly pricePln?: number;
  /** Additional free-form context */
  readonly additionalContext?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateDescription
// Returns SEO-optimised title, description, and keywords for Allegro
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateDescriptionResult extends DescriptionOutput {
  readonly tokensUsed: number;
}

export async function generateDescription(
  productInfo: ProductInfo,
  language: Language,
): Promise<GenerateDescriptionResult> {
  const openai = getOpenAI();

  const languageLabel = LANGUAGE_LABELS[language];
  const featuresText = productInfo.features.join(", ");

  const systemPrompt = buildDescriptionSystemPrompt(language);
  const userPrompt = buildDescriptionUserPrompt(
    productInfo,
    featuresText,
    languageLabel,
  );

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const rawContent = response.choices[0]?.message.content ?? "{}";
  const parsed = DescriptionOutputSchema.parse(JSON.parse(rawContent));
  const tokensUsed = response.usage?.total_tokens ?? 0;

  return { ...parsed, tokensUsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// translateListing
// Translates an existing product listing to the target language
// ─────────────────────────────────────────────────────────────────────────────

export interface TranslateListingResult extends TranslationOutput {
  readonly tokensUsed: number;
}

export async function translateListing(
  description: { title: string; description: string },
  fromLang: Language,
  toLang: Language,
): Promise<TranslateListingResult> {
  const openai = getOpenAI();

  const fromLabel = LANGUAGE_LABELS[fromLang];
  const toLabel = LANGUAGE_LABELS[toLang];

  const systemPrompt = [
    `You are a professional e-commerce translator specialising in Allegro marketplace listings.`,
    `Translate product listings from ${fromLabel} to ${toLabel}.`,
    `Preserve the commercial tone and any SEO keywords. Adapt culturally where appropriate.`,
    `Return valid JSON matching the schema: { translatedTitle: string, translatedDescription: string }`,
    `Ensure the translated title stays under 75 characters.`,
  ].join(" ");

  const userPrompt = [
    `Translate this Allegro product listing from ${fromLabel} to ${toLabel}:`,
    ``,
    `Title: ${description.title}`,
    ``,
    `Description:`,
    description.description,
  ].join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const rawContent = response.choices[0]?.message.content ?? "{}";
  const parsed = TranslationOutputSchema.parse(JSON.parse(rawContent));
  const tokensUsed = response.usage?.total_tokens ?? 0;

  return { ...parsed, tokensUsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builders
// ─────────────────────────────────────────────────────────────────────────────

function buildDescriptionSystemPrompt(language: Language): string {
  const isPolish = language === "pl";
  return [
    `You are a senior e-commerce copywriter who specialises in Allegro marketplace listings${isPolish ? " for Polish-speaking buyers" : ""}.`,
    `Your task: generate a product title, a detailed description, and a list of SEO keywords.`,
    `Rules:`,
    `- Title: max 75 characters, include the most important keyword at the start`,
    `- Description: 200–800 characters, plain text (no HTML), natural language, feature-benefit format`,
    `- Keywords: 5–15 terms that buyers actually search for on Allegro`,
    `- Tone: professional but approachable, buyer-focused`,
    `- All output must be in ${LANGUAGE_LABELS[language]}`,
    `Return ONLY valid JSON: { "title": string, "description": string, "keywords": string[] }`,
  ].join("\n");
}

function buildDescriptionUserPrompt(
  info: ProductInfo,
  featuresText: string,
  languageLabel: string,
): string {
  const lines: string[] = [
    `Generate an Allegro product listing in ${languageLabel} for:`,
    ``,
    `Product name: ${info.name}`,
    `Category: ${info.category}`,
    `Features: ${featuresText}`,
  ];

  if (info.brand !== undefined) lines.push(`Brand: ${info.brand}`);
  if (info.ean !== undefined) lines.push(`EAN: ${info.ean}`);
  if (info.pricePln !== undefined)
    lines.push(`Price: ${info.pricePln.toFixed(2)} PLN`);
  if (info.additionalContext !== undefined)
    lines.push(`Additional context: ${info.additionalContext}`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Language label map
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGE_LABELS: Record<Language, string> = {
  pl: "Polish",
  en: "English",
  ru: "Russian",
  ua: "Ukrainian",
};
