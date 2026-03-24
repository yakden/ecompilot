// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ai-service / routes/chat.routes.ts
// SSE streaming chat + history + store analysis endpoints
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { ChatService } from "../services/chat.service.js";
import { ChatService as ChatServiceClass } from "../services/chat.service.js";
import type { RagService } from "../services/rag.service.js";
import { db } from "../db/client.js";
import { chatSessions, chatMessages } from "../db/schema.js";
import {
  createAuthMiddleware,
  createPlanLimitMiddleware,
  createPlanGate,
  incrementUsage,
} from "../middleware/auth.middleware.js";
import type { Language } from "@ecompilot/shared-types";
import { isLanguage } from "@ecompilot/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Request/response schemas
// ─────────────────────────────────────────────────────────────────────────────

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().uuid().optional(),
  language: z.enum(["ru", "pl", "ua", "en"]).default("en"),
});

const HistoryQuerySchema = z.object({
  sessionId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const AnalyzeStoreSchema = z.object({
  storeUrl: z.string().url(),
  language: z.enum(["ru", "pl", "ua", "en"]).default("en"),
});

const ComplianceCheckSchema = z.object({
  text: z.string().min(1).max(10_000),
  platform: z.enum(["allegro", "amazon", "vinted", "etsy"]),
  type: z.enum(["listing", "message", "review_request"]),
  language: z.enum(["ru", "pl", "ua", "en"]).default("en"),
});

// ─────────────────────────────────────────────────────────────────────────────
// History retention days per plan
// ─────────────────────────────────────────────────────────────────────────────

const HISTORY_DAYS: Record<string, number> = {
  free: 7,
  pro: 90,
  business: 365,
};

function historyRetentionDays(plan: string): number {
  return HISTORY_DAYS[plan] ?? 7;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export async function registerChatRoutes(
  app: FastifyInstance,
  options: {
    redis: Redis;
    chatService: ChatService;
    ragService: RagService;
    logger: Logger;
  },
): Promise<void> {
  const { redis, chatService, logger } = options;

  const authenticate = createAuthMiddleware(logger);
  const checkPlanLimit = createPlanLimitMiddleware(redis, logger);
  const businessOnly = createPlanGate(["business"], logger);

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/v1/ai/chat — SSE streaming chat
  // ─────────────────────────────────────────────────────────────────────────

  app.post(
    "/api/v1/ai/chat",
    { preHandler: [authenticate, checkPlanLimit] },
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const body = ChatRequestSchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: body.error.flatten(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const { message, sessionId: incomingSessionId, language } = body.data;
      const { sub: userId, plan } = request.user;

      // ── Resolve or create chat session ────────────────────────────────────

      let sessionId: string;
      let historyMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];

      if (incomingSessionId) {
        // Validate session belongs to this user
        const [existingSession] = await db
          .select()
          .from(chatSessions)
          .where(
            and(
              eq(chatSessions.id, incomingSessionId),
              eq(chatSessions.userId, userId),
            ),
          )
          .limit(1);

        if (!existingSession) {
          await reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Chat session not found",
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        sessionId = existingSession.id;

        // Load last 10 messages for context
        const recent = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, sessionId))
          .orderBy(desc(chatMessages.createdAt))
          .limit(10);

        historyMessages = recent
          .reverse()
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
      } else {
        // Create new session with auto-generated title from first message
        const title =
          message.length > 60 ? `${message.slice(0, 60)}…` : message;

        const [newSession] = await db
          .insert(chatSessions)
          .values({
            userId,
            title,
            language,
          })
          .returning();

        if (!newSession) {
          await reply.code(500).send({
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Failed to create chat session",
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        sessionId = newSession.id;
      }

      // ── Save user message to DB ───────────────────────────────────────────

      await db.insert(chatMessages).values({
        sessionId,
        role: "user",
        content: message,
      });

      // ── Set SSE headers ───────────────────────────────────────────────────

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // ── Stream GPT-4o response ────────────────────────────────────────────

      let fullAssistantContent = "";
      let totalTokens = 0;

      const resolvedLanguage: Language = isLanguage(language) ? language : "en";

      try {
        const stream = chatService.streamCompletion(
          sessionId,
          message,
          historyMessages,
          resolvedLanguage,
        );

        for await (const event of stream) {
          if (ChatServiceClass.isDone(event)) {
            totalTokens = event.totalTokens;
            const donePayload = JSON.stringify({
              done: true,
              sessionId: event.sessionId,
            });
            reply.raw.write(`data: ${donePayload}\n\n`);
            break;
          } else {
            fullAssistantContent += event.text;
            const chunkPayload = JSON.stringify({
              text: event.text,
              sessionId: event.sessionId,
            });
            reply.raw.write(`data: ${chunkPayload}\n\n`);
          }
        }
      } catch (err) {
        logger.error({ err, sessionId }, "Stream error");
        const errPayload = JSON.stringify({
          error: true,
          message: "Stream interrupted",
        });
        reply.raw.write(`data: ${errPayload}\n\n`);
      } finally {
        reply.raw.end();
      }

      // ── Persist assistant message + update session ────────────────────────

      if (fullAssistantContent.length > 0) {
        await Promise.all([
          db.insert(chatMessages).values({
            sessionId,
            role: "assistant",
            content: fullAssistantContent,
            tokens: totalTokens,
          }),
          db
            .update(chatSessions)
            .set({
              messageCount: sql`${chatSessions.messageCount} + 2`,
              lastMessageAt: new Date(),
            })
            .where(eq(chatSessions.id, sessionId)),
        ]);
      }

      // ── Increment usage counter (fire and forget for free plan) ──────────

      if (plan === "free") {
        await incrementUsage(redis, userId, logger);
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/ai/history — chat history
  // ─────────────────────────────────────────────────────────────────────────

  app.get(
    "/api/v1/ai/history",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = HistoryQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details: query.error.flatten(),
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { sessionId, page, limit } = query.data;
      const { sub: userId, plan } = request.user;
      const retentionDays = historyRetentionDays(plan);
      const retentionCutoff = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000,
      );

      if (sessionId) {
        // Return messages for a specific session
        const [session] = await db
          .select()
          .from(chatSessions)
          .where(
            and(
              eq(chatSessions.id, sessionId),
              eq(chatSessions.userId, userId),
            ),
          )
          .limit(1);

        if (!session) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Chat session not found",
              timestamp: new Date().toISOString(),
            },
          });
        }

        const offset = (page - 1) * limit;
        const messages = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, sessionId))
          .orderBy(desc(chatMessages.createdAt))
          .limit(limit)
          .offset(offset);

        return reply.send({
          success: true,
          data: {
            session,
            messages: messages.reverse(),
            page,
            limit,
          },
        });
      }

      // Return session list within retention window
      const offset = (page - 1) * limit;
      const sessions = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.userId, userId),
            gte(chatSessions.createdAt, retentionCutoff),
          ),
        )
        .orderBy(desc(chatSessions.lastMessageAt))
        .limit(limit)
        .offset(offset);

      return reply.send({
        success: true,
        data: { sessions, page, limit, retentionDays },
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/v1/ai/history — clear all chat history
  // ─────────────────────────────────────────────────────────────────────────

  app.delete(
    "/api/v1/ai/history",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub: userId } = request.user;

      // Delete all sessions for this user (messages cascade via FK)
      await db
        .delete(chatSessions)
        .where(eq(chatSessions.userId, userId));

      logger.info({ userId }, "Chat history cleared");

      return reply.send({
        success: true,
        data: { message: "Chat history cleared successfully" },
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/v1/ai/analyze-store — Allegro store analysis (Business only)
  // ─────────────────────────────────────────────────────────────────────────

  app.post(
    "/api/v1/ai/analyze-store",
    { preHandler: [authenticate, businessOnly] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = AnalyzeStoreSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: body.error.flatten(),
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { storeUrl, language } = body.data;
      const { sub: userId } = request.user;

      logger.info({ userId, storeUrl, language }, "Store analysis requested");

      const resolvedLanguage: Language = isLanguage(language) ? language : "en";

      const analysisPrompts: Record<Language, string> = {
        ru: `Проанализируй магазин на Allegro по ссылке ${storeUrl}. Дай оценку: ассортимент, ценообразование, качество листингов, использование алгоритмов Allegro, логистика, работа с отзывами. Предложи конкретные улучшения.`,
        pl: `Przeanalizuj sklep Allegro pod adresem ${storeUrl}. Oceń: asortyment, ceny, jakość ofert, wykorzystanie algorytmów Allegro, logistykę, obsługę opinii. Zaproponuj konkretne usprawnienia.`,
        ua: `Проаналізуй магазин на Allegro за посиланням ${storeUrl}. Оціни: асортимент, ціноутворення, якість лістингів, використання алгоритмів Allegro, логістику, роботу з відгуками. Запропонуй конкретні покращення.`,
        en: `Analyze the Allegro store at ${storeUrl}. Evaluate: product range, pricing, listing quality, Allegro algorithm usage, logistics, review management. Provide specific improvement recommendations.`,
      };

      const prompt = analysisPrompts[resolvedLanguage];

      const systemOverrides: Record<Language, string> = {
        ru: "Ты эксперт по анализу магазинов на Allegro. Даёшь детальный, структурированный анализ и actionable рекомендации. Используй маркированные списки.",
        pl: "Jesteś ekspertem ds. analizy sklepów Allegro. Dajesz szczegółową, ustrukturyzowaną analizę i konkretne rekomendacje. Używaj list punktowanych.",
        ua: "Ти експерт з аналізу магазинів на Allegro. Даєш детальний, структурований аналіз та actionable рекомендації. Використовуй маркований список.",
        en: "You are an Allegro store analysis expert. Provide detailed, structured analysis and actionable recommendations. Use bullet points.",
      };

      try {
        const result = await chatService.complete(
          prompt,
          resolvedLanguage,
          systemOverrides[resolvedLanguage],
        );

        return reply.send({
          success: true,
          data: {
            storeUrl,
            language: resolvedLanguage,
            analysis: result.fullContent,
            tokens: result.totalTokens,
          },
        });
      } catch (err) {
        logger.error({ err, userId, storeUrl }, "Store analysis failed");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Store analysis failed",
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/v1/ai/compliance-check — TOS compliance analysis
  // Available to pro and business plans; free plan gets limited checks
  // ─────────────────────────────────────────────────────────────────────────

  app.post(
    "/api/v1/ai/compliance-check",
    { preHandler: [authenticate, checkPlanLimit] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = ComplianceCheckSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: body.error.flatten(),
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { text, platform, type, language } = body.data;
      const { sub: userId, plan } = request.user;

      logger.info(
        { userId, platform, type, language, textLength: text.length },
        "Compliance check requested",
      );

      const resolvedLanguage: Language = isLanguage(language) ? language : "en";

      try {
        const result = await chatService.checkCompliance({
          text,
          platform,
          type,
          language: resolvedLanguage,
        });

        if (plan === "free") {
          await incrementUsage(redis, userId, logger);
        }

        return reply.send({
          success: true,
          data: result,
        });
      } catch (err) {
        logger.error({ err, userId, platform, type }, "Compliance check failed");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Compliance check failed",
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
  );
}
