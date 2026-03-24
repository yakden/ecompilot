// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ai-service / services/chat.service.ts
// GPT-4o streaming chat with RAG context and multilingual system prompts
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import type { Logger } from "pino";
import type { Language } from "@ecompilot/shared-types";
import { env } from "../config/env.js";
import type { RagService } from "./rag.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CHAT_MODEL = "gpt-4o" as const;
const TEMPERATURE = 0.7 as const;
const MAX_TOKENS = 2000 as const;
const MAX_HISTORY_MESSAGES = 10 as const;
const COMPLIANCE_TEMPERATURE = 0.2 as const;
const COMPLIANCE_MAX_TOKENS = 2000 as const;

// ─────────────────────────────────────────────────────────────────────────────
// Multilingual system prompts
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  ru: "Ты EcomPilot AI — экспертный ассистент для продавцов на польских маркетплейсах. Говоришь по-русски. Советы по Allegro, Vinted, OLX, Amazon EU, Etsy. Знаешь польское законодательство (JDG, ZUS, VAT), импорт из Китая, логистику (InPost, DPD, DHL), алгоритмы маркетплейсов. Отвечай конкретно и практично.",
  pl: "Jesteś EcomPilot AI — ekspert dla sprzedawców na polskich marketplace'ach. Doradzasz w zakresie Allegro, Vinted, OLX, Amazon EU, Etsy. Znasz polskie prawo (JDG, ZUS, VAT), import z Chin, logistykę (InPost, DPD, DHL) i algorytmy marketplace'ów. Odpowiadaj konkretnie i praktycznie.",
  ua: "Ти EcomPilot AI — експертний асистент для продавців на польських маркетплейсах. Говориш українською. Поради щодо Allegro, Vinted, OLX, Amazon EU, Etsy. Знаєш польське законодавство (JDG, ZUS, VAT), імпорт з Китаю, логістику (InPost, DPD, DHL), алгоритми маркетплейсів. Відповідай конкретно і практично.",
  en: "You are EcomPilot AI — an expert assistant for sellers on Polish marketplaces. You advise on Allegro, Vinted, OLX, Amazon EU, and Etsy. You know Polish business law (JDG, ZUS, VAT), China import procedures, logistics (InPost, DPD, DHL), and marketplace algorithms. Answer concisely and practically.",
} as const satisfies Record<Language, string>;

// ─────────────────────────────────────────────────────────────────────────────
// Compliance system prompt — instructs GPT-4o to act as a marketplace TOS
// checker and return structured JSON
// ─────────────────────────────────────────────────────────────────────────────

const COMPLIANCE_SYSTEM_PROMPT = `You are an expert marketplace compliance checker specializing in Polish and EU marketplace regulations.

Your task is to analyze text (listings, messages, or review requests) for compliance violations against each platform's Terms of Service.

## Platform Rules

### Allegro
- PROHIBITED PRODUCTS: weapons, drugs, counterfeit goods, tobacco products for minors, live animals without permits, recalled products, human remains/organs
- LISTING RULES: titles max 75 characters, no all-caps titles, no keyword stuffing, product category must match, no external website links in descriptions, accurate condition description (new/used/refurbished), mandatory CE marking for applicable categories
- COMMUNICATION RULES: no contact details (phone/email/website) in messages unless order-related, no off-platform payment requests, no promotional content in buyer communications, no harassment or pressure tactics
- REVIEW SOLICITATION: cannot promise discounts for positive reviews, cannot threaten negative feedback as leverage, cannot ask buyers to remove negative reviews, >10% review rate triggers automated fraud detection, review gating (only showing positive review links) is banned
- SUSPENSION THRESHOLDS: late shipment rate >5% = warning, >10% = restriction, return rate >10% = review required, negative feedback >5% = account at risk

### Amazon
- A-TO-Z GUARANTEE ABUSE: falsely claiming items not received, filing claims to avoid returns, using A-to-Z as leverage against sellers
- PRODUCT SAFETY: all products must meet EU/Polish safety standards, CE marking mandatory for electronics/toys/machinery, food contact materials need EC 1935/2004 compliance
- RESTRICTED CATEGORIES: alcohol, firearms, medical devices, pesticides, currency require pre-approval, dietary supplements need safety documentation
- REVIEW MANIPULATION: any form of review manipulation including incentivized reviews, review trading, paid reviews, or family/friend reviews
- LISTING ACCURACY: no misleading claims, no fake "original price" inflation, images must match actual product

### Vinted
- PROHIBITED ITEMS: counterfeit/replica branded goods, used underwear/swimwear without hygiene liner, items with legal age restrictions, digital goods, food, weapons
- PRICING MANIPULATION: artificially inflating prices to offer fake discounts, price coordination with other sellers, listing same item multiple times to game visibility
- FAKE REVIEWS: purchasing reviews, review swapping, creating multiple accounts for self-review, threatening buyers for positive reviews
- COMMUNICATION: no sharing external contact details before sale completed, no redirecting to external platforms

### General (All Platforms)
- SPAM: excessive keyword repetition, irrelevant hashtags, bulk unsolicited messages, duplicate listings
- MISLEADING CLAIMS: unsubstantiated health claims, fake certifications, misleading country of origin, inflated retail price comparisons
- IP VIOLATIONS: using trademarked terms in listings without authorization (e.g., "like Nike", "Apple compatible" when not official), copyright images without license, selling counterfeit branded goods
- GDPR: collecting personal data without consent, sharing buyer data with third parties

## Response Format

You MUST respond with valid JSON only. No markdown, no explanation outside JSON.

The overallScore is 0-100 where 100 means fully compliant (no issues found) and 0 means critically non-compliant.
Risk levels: "low" (score 80-100, minor style issues), "medium" (score 50-79, policy violations that need fixing), "high" (score 20-49, serious violations risking account warning), "critical" (score 0-19, violations risking immediate suspension).

Use the language specified in the request for all text in issues (rule names may stay in English).

Response structure:
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "issues": [
    {
      "rule": "string (short rule identifier, e.g. REVIEW_INCENTIVE)",
      "description": "string (what was found in the text)",
      "severity": "low" | "medium" | "high" | "critical",
      "recommendation": "string (how to fix it)"
    }
  ],
  "overallScore": number,
  "checkedAt": "ISO 8601 timestamp"
}

If no issues are found, return an empty issues array and overallScore of 100 with riskLevel "low".` as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
}

export interface StreamChunk {
  readonly text: string;
  readonly sessionId: string;
}

export interface StreamDone {
  readonly done: true;
  readonly sessionId: string;
  readonly totalTokens: number;
}

export type StreamEvent = StreamChunk | StreamDone;

export interface ChatCompletionResult {
  readonly fullContent: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export type CompliancePlatform = "allegro" | "amazon" | "vinted" | "etsy";
export type ComplianceContentType = "listing" | "message" | "review_request";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type IssueSeverity = "low" | "medium" | "high" | "critical";

export interface ComplianceIssue {
  readonly rule: string;
  readonly description: string;
  readonly severity: IssueSeverity;
  readonly recommendation: string;
}

export interface ComplianceCheckResult {
  readonly riskLevel: RiskLevel;
  readonly issues: ComplianceIssue[];
  readonly overallScore: number;
  readonly checkedAt: string;
}

export interface ComplianceCheckInput {
  readonly text: string;
  readonly platform: CompliancePlatform;
  readonly type: ComplianceContentType;
  readonly language: Language;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Service
// ─────────────────────────────────────────────────────────────────────────────

export class ChatService {
  private readonly openai: OpenAI;
  private readonly logger: Logger;
  private readonly ragService: RagService;

  constructor(logger: Logger, ragService: RagService) {
    this.logger = logger;
    this.ragService = ragService;

    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build system prompt with optional RAG context
  // ─────────────────────────────────────────────────────────────────────────

  private async buildSystemPrompt(
    language: Language,
    userMessage: string,
  ): Promise<string> {
    const basePrompt = SYSTEM_PROMPTS[language];

    try {
      const searchResult = await this.ragService.searchRelevant(
        userMessage,
        language,
        5,
      );

      if (searchResult.matches.length > 0) {
        const contextBlock = this.ragService.formatContextBlock(searchResult.matches);
        return `${basePrompt}${contextBlock}`;
      }
    } catch (err) {
      this.logger.warn(
        { err, language },
        "RAG search failed — proceeding without context",
      );
    }

    return basePrompt;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Trim history to last N messages (keeps context window manageable)
  // ─────────────────────────────────────────────────────────────────────────

  private trimHistory(history: readonly ChatMessage[]): ChatMessage[] {
    // Filter out system messages from history (we inject fresh each time)
    const conversational = history.filter((m) => m.role !== "system");

    if (conversational.length <= MAX_HISTORY_MESSAGES) {
      return [...conversational];
    }

    return conversational.slice(conversational.length - MAX_HISTORY_MESSAGES);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stream a chat completion — yields SSE-friendly chunks
  // ─────────────────────────────────────────────────────────────────────────

  async *streamCompletion(
    sessionId: string,
    userMessage: string,
    history: readonly ChatMessage[],
    language: Language,
  ): AsyncGenerator<StreamEvent> {
    this.logger.info(
      {
        sessionId,
        language,
        historyLength: history.length,
        messagePreview: userMessage.slice(0, 80),
      },
      "Starting chat stream",
    );

    const systemPrompt = await this.buildSystemPrompt(language, userMessage);
    const trimmedHistory = this.trimHistory(history);

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...trimmedHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const stream = await this.openai.chat.completions.create({
        model: CHAT_MODEL,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        stream: true,
        stream_options: { include_usage: true },
        messages,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;

        if (typeof delta === "string" && delta.length > 0) {
          fullContent += delta;
          yield { text: delta, sessionId } satisfies StreamChunk;
        }

        // Capture usage from final chunk
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
      }
    } catch (err) {
      this.logger.error({ err, sessionId }, "OpenAI stream error");
      throw err;
    }

    const totalTokens = promptTokens + completionTokens;

    this.logger.info(
      { sessionId, totalTokens, promptTokens, completionTokens },
      "Chat stream complete",
    );

    yield { done: true, sessionId, totalTokens } satisfies StreamDone;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Non-streaming completion (for internal use, e.g. store analysis)
  // ─────────────────────────────────────────────────────────────────────────

  async complete(
    prompt: string,
    language: Language,
    systemOverride?: string,
  ): Promise<ChatCompletionResult> {
    const systemPrompt = systemOverride ?? SYSTEM_PROMPTS[language];

    const response = await this.openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });

    const choice = response.choices[0];
    const fullContent = choice?.message?.content ?? "";
    const usage = response.usage;

    return {
      fullContent,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Compliance check — analyzes text against platform TOS rules
  // Returns structured JSON via response_format: json_object
  // ─────────────────────────────────────────────────────────────────────────

  async checkCompliance(input: ComplianceCheckInput): Promise<ComplianceCheckResult> {
    const { text, platform, type, language } = input;

    const typeLabels: Record<ComplianceContentType, string> = {
      listing: "product listing / offer description",
      message: "buyer/seller communication message",
      review_request: "review solicitation message",
    };

    const userPrompt =
      `Platform: ${platform.toUpperCase()}\n` +
      `Content type: ${typeLabels[type]}\n` +
      `Response language: ${language}\n` +
      `Current UTC time: ${new Date().toISOString()}\n\n` +
      `TEXT TO ANALYZE:\n---\n${text}\n---\n\n` +
      `Analyze this text for compliance violations. Return JSON only.`;

    this.logger.info(
      { platform, type, language, textLength: text.length },
      "Starting compliance check",
    );

    const response = await this.openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: COMPLIANCE_TEMPERATURE,
      max_tokens: COMPLIANCE_MAX_TOKENS,
      stream: false,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: COMPLIANCE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const rawContent = response.choices[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      this.logger.error(
        { rawContent: rawContent.slice(0, 200) },
        "Compliance check returned non-JSON response",
      );
      return {
        riskLevel: "low",
        issues: [],
        overallScore: 100,
        checkedAt: new Date().toISOString(),
      };
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("riskLevel" in parsed) ||
      !("issues" in parsed) ||
      !("overallScore" in parsed)
    ) {
      this.logger.warn({ parsed }, "Compliance response missing required fields");
      return {
        riskLevel: "low",
        issues: [],
        overallScore: 100,
        checkedAt: new Date().toISOString(),
      };
    }

    const raw = parsed as Record<string, unknown>;

    const validRiskLevels: RiskLevel[] = ["low", "medium", "high", "critical"];
    const validSeverities: IssueSeverity[] = ["low", "medium", "high", "critical"];

    const riskLevel: RiskLevel = validRiskLevels.includes(raw["riskLevel"] as RiskLevel)
      ? (raw["riskLevel"] as RiskLevel)
      : "low";

    const overallScore: number =
      typeof raw["overallScore"] === "number"
        ? Math.max(0, Math.min(100, Math.round(raw["overallScore"])))
        : 100;

    const rawIssues = Array.isArray(raw["issues"]) ? raw["issues"] : [];
    const issues: ComplianceIssue[] = rawIssues
      .filter(
        (issue): issue is Record<string, unknown> =>
          typeof issue === "object" && issue !== null,
      )
      .map((issue) => ({
        rule: typeof issue["rule"] === "string" ? issue["rule"] : "UNKNOWN_RULE",
        description:
          typeof issue["description"] === "string"
            ? issue["description"]
            : "No description provided.",
        severity: validSeverities.includes(issue["severity"] as IssueSeverity)
          ? (issue["severity"] as IssueSeverity)
          : "low",
        recommendation:
          typeof issue["recommendation"] === "string"
            ? issue["recommendation"]
            : "Review platform guidelines.",
      }));

    this.logger.info(
      { platform, riskLevel, overallScore, issueCount: issues.length },
      "Compliance check complete",
    );

    return {
      riskLevel,
      issues,
      overallScore,
      checkedAt: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Type guard: is this a StreamDone event?
  // ─────────────────────────────────────────────────────────────────────────

  static isDone(event: StreamEvent): event is StreamDone {
    return "done" in event && event.done === true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Expose system prompts (for testing / prompt inspection)
  // ─────────────────────────────────────────────────────────────────────────

  static getSystemPrompt(language: Language): string {
    return SYSTEM_PROMPTS[language];
  }
}
