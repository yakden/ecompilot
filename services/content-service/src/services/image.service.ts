// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// Image processing: Sharp + GPT-4o Vision + DALL-E 3
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";
import OpenAI from "openai";
import { env } from "../config/env.js";
import { createLogger } from "@ecompilot/shared-observability";

const logger = createLogger({ service: "content-service" });

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI client singleton
// ─────────────────────────────────────────────────────────────────────────────

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (_openai !== null) return _openai;
  _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _openai;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ThumbnailResult {
  readonly buffer: Buffer;
  readonly analysisDescription: string;
  readonly tokensUsed: number;
}

export interface ProcessedImage {
  readonly buffer: Buffer;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly sizeByes: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// removeBackground
// Attempts external rembg Python service first, falls back to alpha masking
// ─────────────────────────────────────────────────────────────────────────────

export async function removeBackground(
  imageBuffer: Buffer,
): Promise<Buffer> {
  // Primary path: delegate to rembg Python microservice
  try {
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: "image/png" });
    formData.append("file", blob, "input.png");

    const response = await fetch(`${env.REMBG_SERVICE_URL}/api/remove`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new Error(
        `rembg service returned HTTP ${response.status}: ${response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const resultBuffer = Buffer.from(arrayBuffer);

    // Convert PNG with alpha to WebP preserving transparency
    return sharp(resultBuffer)
      .webp({ quality: 90, alphaQuality: 100 })
      .toBuffer();
  } catch (rembgError) {
    // Fallback: use Sharp to make white/near-white background transparent.
    // This is a best-effort approximation — real background removal requires
    // a ML model.
    logger.warn(
      { err: rembgError },
      "rembg service unavailable, using Sharp alpha channel fallback",
    );

    return sharp(imageBuffer)
      .ensureAlpha()
      // Threshold white background: pixels with luminance > 240 become transparent
      .unflatten()
      .webp({ quality: 90, alphaQuality: 100 })
      .toBuffer();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// resizeForAllegro
// Allegro guidelines: 1200×1200 px minimum, white background, WebP
// ─────────────────────────────────────────────────────────────────────────────

export async function resizeForAllegro(
  imageBuffer: Buffer,
): Promise<ProcessedImage> {
  const TARGET_SIZE = 1200;

  const outputBuffer = await sharp(imageBuffer)
    .resize(TARGET_SIZE, TARGET_SIZE, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .webp({ quality: 85 })
    .toBuffer();

  return {
    buffer: outputBuffer,
    widthPx: TARGET_SIZE,
    heightPx: TARGET_SIZE,
    sizeByes: outputBuffer.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// generateThumbnail
// Pipeline: GPT-4o Vision analysis -> DALL-E 3 generation -> Sharp post-process
// ─────────────────────────────────────────────────────────────────────────────

export async function generateThumbnail(
  imageBuffer: Buffer,
  prompt: string,
): Promise<ThumbnailResult> {
  const openai = getOpenAI();

  // Step 1: Analyse the source image with GPT-4o Vision to build a rich context
  // for the DALL-E prompt
  const base64Image = imageBuffer.toString("base64");
  const mimeType = detectMimeType(imageBuffer);

  const visionResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content:
          "You are an e-commerce product photography expert. Analyse the provided product image and describe it concisely in 2–3 sentences, focusing on: product category, key visual features, dominant colours, shape, and any text visible. Output ONLY the description — no formatting.",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: "low",
            },
          },
          {
            type: "text",
            text: "Describe this product for a photo generation prompt.",
          },
        ],
      },
    ],
  });

  const analysisDescription =
    visionResponse.choices[0]?.message.content?.trim() ??
    "A product on a white background";

  const visionTokens =
    visionResponse.usage?.total_tokens ?? 0;

  // Step 2: Compose DALL-E 3 prompt — merge user intent with visual analysis
  const dallePrompt = buildDallePrompt(prompt, analysisDescription);

  // Step 3: Generate image with DALL-E 3 (HD quality, square 1024×1024)
  const imageResponse = await openai.images.generate({
    model: "dall-e-3",
    prompt: dallePrompt,
    size: "1024x1024",
    quality: "hd",
    response_format: "b64_json",
    n: 1,
  });

  const imageData = imageResponse.data;
  if (imageData === undefined || imageData.length === 0) {
    throw new Error("DALL-E 3 returned no image data");
  }
  const generatedB64 = imageData[0]?.b64_json;
  if (generatedB64 === undefined || generatedB64 === null) {
    throw new Error("DALL-E 3 returned no image data");
  }

  // Step 4: Post-process with Sharp — resize to Allegro spec, convert to WebP
  const generatedBuffer = Buffer.from(generatedB64, "base64");

  const processedBuffer = await sharp(generatedBuffer)
    .resize(1200, 1200, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .webp({ quality: 85 })
    .toBuffer();

  return {
    buffer: processedBuffer,
    analysisDescription,
    // DALL-E 3 does not return token counts; add vision tokens only
    tokensUsed: visionTokens,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildDallePrompt(userPrompt: string, visualContext: string): string {
  return [
    "Professional e-commerce product photography.",
    `Product description: ${visualContext}`,
    `Style direction: ${userPrompt}`,
    "Pure white background, studio lighting, high detail, no text, no watermarks,",
    "suitable for Allegro marketplace listing, photorealistic.",
  ].join(" ");
}

/**
 * Detect MIME type from buffer magic bytes.
 * Falls back to "image/jpeg" for unknown formats.
 */
function detectMimeType(buffer: Buffer): string {
  if (buffer.length < 4) return "image/jpeg";

  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  // JPEG: FF D8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "image/jpeg";
  }

  // WebP: 52 49 46 46 ... 57 45 42 50
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    return "image/webp";
  }

  return "image/jpeg";
}
