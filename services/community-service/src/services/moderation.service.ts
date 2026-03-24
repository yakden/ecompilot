// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — community-service: Content moderation service
// Combines OpenAI Moderations API with local regex spam detection
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import { env } from "../config/env.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ModerationResult {
  readonly isSafe: boolean;
  readonly flaggedCategories: string[];
  readonly spamScore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spam patterns — regex-based pre-filter (fast, no API call needed)
// Patterns cover Russian/Polish/Ukrainian spam common in e-commerce forums
// ─────────────────────────────────────────────────────────────────────────────

interface SpamPattern {
  readonly pattern: RegExp;
  readonly weight: number;
  readonly label: string;
}

const SPAM_PATTERNS: readonly SpamPattern[] = [
  // Buy-now urgency phrases (RU/UA)
  {
    pattern: /купи[\s\w]*сейчас/iu,
    weight: 0.4,
    label: "buy_now_urgency",
  },
  // Earnings promises (RU/UA): "заработай X в день/неделю/месяц"
  {
    pattern: /заработай[\s\w$€₽£]*в\s+(день|неделю|месяц|сутки)/iu,
    weight: 0.5,
    label: "earnings_promise",
  },
  // Earnings promises (PL)
  {
    pattern: /zarabiaj[\s\w€$]*dziennie|tygodniowo|miesięcznie/iu,
    weight: 0.4,
    label: "earnings_promise_pl",
  },
  // Telegram links (common spam vector)
  {
    pattern: /t\.me\//iu,
    weight: 0.5,
    label: "telegram_link",
  },
  // WhatsApp/external chat links
  {
    pattern: /wa\.me\//iu,
    weight: 0.3,
    label: "whatsapp_link",
  },
  // Excessive capital letters — more than 60% of alphabetic chars are uppercase
  // (handled separately in spamScore calculation)
  // Referral/affiliate bait
  {
    pattern: /реферальн\w*|реферал|referral\s+link|реф\s+код/iu,
    weight: 0.3,
    label: "referral_link",
  },
  // Pyramid / MLM keywords
  {
    pattern: /многоуровнев\w*|пирамид\w*|mlm\b|сетевой\s+маркетинг/iu,
    weight: 0.6,
    label: "mlm_pyramid",
  },
  // Phishing / fraud bait
  {
    pattern: /введи\s+(данные|карту|пароль)|confirm\s+your\s+account/iu,
    weight: 0.7,
    label: "phishing",
  },
  // Generic spam: "бесплатно" + "сейчас" combo
  {
    pattern: /бесплатно.{0,20}сейчас|sейчас.{0,20}бесплатно/iu,
    weight: 0.3,
    label: "free_now_combo",
  },
  // Excessive repeated characters (e.g. "КУПИ!!!!!")
  {
    pattern: /(.)\1{4,}/u,
    weight: 0.2,
    label: "repeated_chars",
  },
];

/** Returns a spam score in [0, 1] based on matched patterns + caps ratio */
function computeSpamScore(text: string): number {
  let score = 0;

  for (const { pattern, weight } of SPAM_PATTERNS) {
    if (pattern.test(text)) {
      score += weight;
    }
  }

  // Excessive uppercase penalty
  const alphabetic = text.replace(/[^a-zA-Zа-яА-ЯёЁіІїЇєЄ]/giu, "");
  if (alphabetic.length > 20) {
    const upperCount = (alphabetic.match(/[A-ZА-ЯЁІЇЄёіїє]/gu) ?? []).length;
    const capsRatio = upperCount / alphabetic.length;
    if (capsRatio > 0.6) {
      score += 0.3;
    }
  }

  // Clamp to [0, 1]
  return Math.min(1, score);
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI client (lazy-initialized singleton)
// ─────────────────────────────────────────────────────────────────────────────

let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (_openai === null) {
    _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return _openai;
}

// ─────────────────────────────────────────────────────────────────────────────
// Moderation service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Moderates content using two layers:
 * 1. Local regex spam scoring (fast, free, no latency)
 * 2. OpenAI Moderations API (catches hate, violence, sexual content, etc.)
 *
 * Returns isSafe=false if spamScore >= 0.5 OR OpenAI flags the content.
 */
export async function moderateContent(
  text: string,
  logger: Logger,
): Promise<ModerationResult> {
  const flaggedCategories: string[] = [];

  // ── Layer 1: Local spam patterns ──────────────────────────────────────────

  const spamScore = computeSpamScore(text);

  // Collect matched spam labels for diagnostics
  for (const { pattern, label } of SPAM_PATTERNS) {
    if (pattern.test(text)) {
      flaggedCategories.push(`spam:${label}`);
    }
  }

  // ── Layer 2: OpenAI Moderations API ───────────────────────────────────────

  let openAiFlagged = false;

  try {
    const openai = getOpenAIClient();
    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });

    const result = response.results[0];

    if (result !== undefined && result.flagged) {
      openAiFlagged = true;
      // Collect which OpenAI categories were flagged
      const cats = result.categories as unknown as Record<string, boolean>;
      for (const [cat, isFlagged] of Object.entries(cats)) {
        if (isFlagged) {
          flaggedCategories.push(`openai:${cat}`);
        }
      }
    }
  } catch (err) {
    // Log but degrade gracefully — rely on spam score alone
    logger.warn(
      { err },
      "OpenAI Moderations API call failed; falling back to local spam detection only",
    );
  }

  const isSafe = spamScore < 0.5 && !openAiFlagged;

  if (!isSafe) {
    logger.info(
      { spamScore, flaggedCategories, textLength: text.length },
      "Content moderation: content flagged as unsafe",
    );
  }

  return {
    isSafe,
    flaggedCategories,
    spamScore,
  };
}
