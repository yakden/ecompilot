// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service: NATS JetStream event subscribers
//
// Subscriptions:
//   user.registered                   → welcome email
//   billing.payment.succeeded         → email + push
//   billing.payment.failed            → email + push
//   analytics.niche.analysis.complete → push + in-app
//   community.post.reply.created      → email + push
//   content.generation.complete       → in-app
// ─────────────────────────────────────────────────────────────────────────────

import { StringCodec } from "nats";
import { SUBJECTS, safeParseEvent, JETSTREAM_CONFIG } from "@ecompilot/event-contracts";
import type {
  UserRegisteredEvent,
  PaymentSucceededEvent,
  PaymentFailedEvent,
  NicheAnalysisCompleteEvent,
  CommunityNewReplyEvent,
  ContentGenerationCompleteEvent,
} from "@ecompilot/event-contracts";
import type { Logger } from "pino";

import { getJetStream, ensureConsumer } from "../services/nats.service.js";
import {
  sendWelcomeEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendNicheAnalysisCompleteEmail,
  sendForumReplyEmail,
} from "../services/email.service.js";
import { sendPush, sendMulticast } from "../services/push.service.js";
import { createInAppNotification } from "../services/inapp.service.js";
import { getOrCreatePreferences, getFcmTokensForUser, isChannelEnabled } from "../services/preferences.service.js";
import { isDuplicate } from "../middleware/dedup.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal constants
// ─────────────────────────────────────────────────────────────────────────────

const sc = StringCodec();
const STREAM = JETSTREAM_CONFIG.streamName;
const APP_URL = process.env["APP_URL"] ?? "https://app.ecompilot.pl";

// Consumer name constants — durable, one per event type
const CONSUMERS = {
  USER_REGISTERED: "notification-user-registered",
  PAYMENT_SUCCEEDED: "notification-payment-succeeded",
  PAYMENT_FAILED: "notification-payment-failed",
  NICHE_ANALYSIS: "notification-niche-analysis",
  COMMUNITY_REPLY: "notification-community-reply",
  CONTENT_GENERATION: "notification-content-generation",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap: ensure all consumers exist, then start pull loops
// ─────────────────────────────────────────────────────────────────────────────

export async function startEventSubscribers(logger: Logger): Promise<void> {
  await Promise.all([
    ensureConsumer(STREAM, CONSUMERS.USER_REGISTERED, SUBJECTS.USER_REGISTERED, logger),
    ensureConsumer(STREAM, CONSUMERS.PAYMENT_SUCCEEDED, SUBJECTS.PAYMENT_SUCCEEDED, logger),
    ensureConsumer(STREAM, CONSUMERS.PAYMENT_FAILED, SUBJECTS.PAYMENT_FAILED, logger),
    ensureConsumer(STREAM, CONSUMERS.NICHE_ANALYSIS, SUBJECTS.NICHE_ANALYSIS_COMPLETE, logger),
    ensureConsumer(STREAM, CONSUMERS.COMMUNITY_REPLY, SUBJECTS.COMMUNITY_NEW_REPLY, logger),
    ensureConsumer(STREAM, CONSUMERS.CONTENT_GENERATION, SUBJECTS.CONTENT_GENERATION_COMPLETE, logger),
  ]);

  // Run all pull consumers in parallel — each is a long-lived async loop
  void pullLoop(CONSUMERS.USER_REGISTERED, handleUserRegistered, logger);
  void pullLoop(CONSUMERS.PAYMENT_SUCCEEDED, handlePaymentSucceeded, logger);
  void pullLoop(CONSUMERS.PAYMENT_FAILED, handlePaymentFailed, logger);
  void pullLoop(CONSUMERS.NICHE_ANALYSIS, handleNicheAnalysis, logger);
  void pullLoop(CONSUMERS.COMMUNITY_REPLY, handleCommunityReply, logger);
  void pullLoop(CONSUMERS.CONTENT_GENERATION, handleContentGeneration, logger);

  logger.info("NATS event subscribers started");
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic pull loop — iterates messages from a durable consumer
// ─────────────────────────────────────────────────────────────────────────────

type MessageHandler = (raw: unknown, logger: Logger) => Promise<void>;

async function pullLoop(
  consumerName: string,
  handler: MessageHandler,
  logger: Logger,
): Promise<void> {
  const js = getJetStream();

  const consumer = await js.consumers.get(STREAM, consumerName);
  const messages = await consumer.consume({ max_messages: 10 });

  for await (const msg of messages) {
    try {
      const text = sc.decode(msg.data);
      const raw: unknown = JSON.parse(text);
      await handler(raw, logger);
      msg.ack();
    } catch (err) {
      logger.error({ err, consumerName }, "Event handler failed — nacking message");
      msg.nak();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: user.registered → welcome email
// ─────────────────────────────────────────────────────────────────────────────

async function handleUserRegistered(raw: unknown, logger: Logger): Promise<void> {
  const parsed = safeParseEvent(raw);
  if (!parsed.success || parsed.data.type !== "user.registered") return;

  const event = parsed.data as UserRegisteredEvent;
  const { userId, email, name, language } = event.payload;

  if (await isDuplicate(userId, "user.registered", logger)) return;

  const prefs = await getOrCreatePreferences(userId, language);
  const user = { email, name, language };

  if (isChannelEnabled(prefs, "email", "user.registered")) {
    await sendWelcomeEmail(user, `${APP_URL}/dashboard`, logger);
  }

  logger.info({ userId }, "Handled user.registered");
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: billing.payment.succeeded → email + push
// ─────────────────────────────────────────────────────────────────────────────

async function handlePaymentSucceeded(raw: unknown, logger: Logger): Promise<void> {
  const parsed = safeParseEvent(raw);
  if (!parsed.success || parsed.data.type !== "payment.succeeded") return;

  const event = parsed.data as PaymentSucceededEvent;
  const { userId, amount, plan } = event.payload;

  if (await isDuplicate(userId, `payment.succeeded:${event.payload.paymentId}`, logger)) return;

  const prefs = await getOrCreatePreferences(userId);
  const user = { email: "", name: "", language: prefs.language };

  // Email
  if (isChannelEnabled(prefs, "email", "billing.payment.succeeded")) {
    // In production user.email/name would be fetched from auth-service or carried in event
    // Here we use whatever we have from prefs; a real implementation would enrich from cache
    await sendPaymentSuccessEmail(
      { email: `user-${userId}@placeholder`, name: "User", language: prefs.language },
      plan,
      amount,
      logger,
    ).catch((err: unknown) => {
      logger.error({ err, userId }, "Failed to send payment success email");
    });
  }

  // Push
  if (isChannelEnabled(prefs, "push", "billing.payment.succeeded")) {
    const tokens = await getFcmTokensForUser(userId);
    if (tokens.length > 0) {
      const pushMessages = {
        ru: { title: "Оплата прошла", body: `Подписка ${plan.toUpperCase()} активна` },
        pl: { title: "Płatność zaakceptowana", body: `Subskrypcja ${plan.toUpperCase()} aktywna` },
        ua: { title: "Оплата пройшла", body: `Підписка ${plan.toUpperCase()} активна` },
        en: { title: "Payment successful", body: `${plan.toUpperCase()} subscription active` },
      } as const;
      const msg = pushMessages[prefs.language] ?? pushMessages.en;
      await sendMulticast(tokens, msg.title, msg.body, { plan, type: "payment_succeeded" }, logger);
    }
  }

  logger.info({ userId, plan }, "Handled payment.succeeded");

  // Suppress unused variable warning
  void user;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: billing.payment.failed → email + push
// ─────────────────────────────────────────────────────────────────────────────

async function handlePaymentFailed(raw: unknown, logger: Logger): Promise<void> {
  const parsed = safeParseEvent(raw);
  if (!parsed.success || parsed.data.type !== "payment.failed") return;

  const event = parsed.data as PaymentFailedEvent;
  const { userId, failureReason } = event.payload;

  if (await isDuplicate(userId, `payment.failed:${event.payload.paymentId}`, logger)) return;

  const prefs = await getOrCreatePreferences(userId);

  // Email
  if (isChannelEnabled(prefs, "email", "billing.payment.failed")) {
    await sendPaymentFailedEmail(
      { email: `user-${userId}@placeholder`, name: "User", language: prefs.language },
      failureReason,
      `${APP_URL}/billing`,
      logger,
    ).catch((err: unknown) => {
      logger.error({ err, userId }, "Failed to send payment failed email");
    });
  }

  // Push
  if (isChannelEnabled(prefs, "push", "billing.payment.failed")) {
    const tokens = await getFcmTokensForUser(userId);
    if (tokens.length > 0) {
      const pushMessages = {
        ru: { title: "Проблема с оплатой", body: "Не удалось провести платёж. Обновите данные." },
        pl: { title: "Problem z płatnością", body: "Płatność nie powiodła się. Zaktualizuj dane." },
        ua: { title: "Проблема з оплатою", body: "Не вдалося провести платіж. Оновіть дані." },
        en: { title: "Payment failed", body: "We couldn't process your payment. Please update your details." },
      } as const;
      const msg = pushMessages[prefs.language] ?? pushMessages.en;
      await sendMulticast(tokens, msg.title, msg.body, { type: "payment_failed" }, logger);
    }
  }

  logger.info({ userId }, "Handled payment.failed");
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: analytics.niche.analysis.complete → push + in-app
// ─────────────────────────────────────────────────────────────────────────────

async function handleNicheAnalysis(raw: unknown, logger: Logger): Promise<void> {
  const parsed = safeParseEvent(raw);
  if (!parsed.success || parsed.data.type !== "analytics.niche_analysis.complete") return;

  const event = parsed.data as NicheAnalysisCompleteEvent;
  const { userId, query, analysisId, resultCount } = event.payload;

  if (await isDuplicate(userId, `niche.analysis:${analysisId}`, logger)) return;

  const prefs = await getOrCreatePreferences(userId);

  // Push
  if (isChannelEnabled(prefs, "push", "analytics.niche.analysis.complete")) {
    const tokens = await getFcmTokensForUser(userId);
    if (tokens.length > 0) {
      const pushMessages = {
        ru: { title: "Анализ ниши готов", body: `«${query}» — ${resultCount} результатов` },
        pl: { title: "Analiza niszy gotowa", body: `«${query}» — ${resultCount} wyników` },
        ua: { title: "Аналіз ніші готовий", body: `«${query}» — ${resultCount} результатів` },
        en: { title: "Niche analysis ready", body: `"${query}" — ${resultCount} results` },
      } as const;
      const msg = pushMessages[prefs.language] ?? pushMessages.en;
      await sendMulticast(
        tokens,
        msg.title,
        msg.body,
        { type: "niche_analysis_complete", analysisId },
        logger,
      );
    }
  }

  // In-app
  if (isChannelEnabled(prefs, "inApp", "analytics.niche.analysis.complete")) {
    const titles = {
      ru: "Анализ ниши готов",
      pl: "Analiza niszy gotowa",
      ua: "Аналіз ніші готовий",
      en: "Niche analysis ready",
    } as const;
    const bodies = {
      ru: `Анализ по запросу «${query}» завершён: ${resultCount} результатов.`,
      pl: `Analiza dla zapytania «${query}» zakończona: ${resultCount} wyników.`,
      ua: `Аналіз за запитом «${query}» завершено: ${resultCount} результатів.`,
      en: `Analysis for "${query}" is complete: ${resultCount} results.`,
    } as const;

    await createInAppNotification(
      {
        userId,
        type: "niche_analysis_complete",
        title: titles[prefs.language] ?? titles.en,
        body: bodies[prefs.language] ?? bodies.en,
        data: { analysisId, query, resultCount },
      },
      logger,
    );
  }

  logger.info({ userId, analysisId }, "Handled analytics.niche_analysis.complete");
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: community.post.reply.created → email + push
// ─────────────────────────────────────────────────────────────────────────────

async function handleCommunityReply(raw: unknown, logger: Logger): Promise<void> {
  const parsed = safeParseEvent(raw);
  if (!parsed.success || parsed.data.type !== "community.reply.created") return;

  const event = parsed.data as CommunityNewReplyEvent;
  const { recipientId, authorId, replyId, postId, preview } = event.payload;

  if (await isDuplicate(recipientId, `community.reply:${replyId}`, logger)) return;

  const prefs = await getOrCreatePreferences(recipientId);
  const threadUrl = `${APP_URL}/community/posts/${postId}`;

  // Email
  if (event.payload.notifyEmail && isChannelEnabled(prefs, "email", "community.post.reply.created")) {
    await sendForumReplyEmail(
      { email: `user-${recipientId}@placeholder`, name: "User", language: prefs.language },
      preview,
      `user-${authorId}`,
      threadUrl,
      logger,
    ).catch((err: unknown) => {
      logger.error({ err, recipientId }, "Failed to send forum reply email");
    });
  }

  // Push
  if (event.payload.notifyPush && isChannelEnabled(prefs, "push", "community.post.reply.created")) {
    const tokens = await getFcmTokensForUser(recipientId);
    if (tokens.length > 0) {
      const pushMessages = {
        ru: { title: "Новый ответ", body: preview },
        pl: { title: "Nowa odpowiedź", body: preview },
        ua: { title: "Нова відповідь", body: preview },
        en: { title: "New reply", body: preview },
      } as const;
      const msg = pushMessages[prefs.language] ?? pushMessages.en;
      await sendMulticast(tokens, msg.title, msg.body, { type: "community_reply", replyId, postId }, logger);
    }
  }

  logger.info({ recipientId, replyId }, "Handled community.reply.created");
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: content.generation.complete → in-app only
// ─────────────────────────────────────────────────────────────────────────────

async function handleContentGeneration(raw: unknown, logger: Logger): Promise<void> {
  const parsed = safeParseEvent(raw);
  if (!parsed.success || parsed.data.type !== "content.generation.complete") return;

  const event = parsed.data as ContentGenerationCompleteEvent;
  const { userId, generationId, contentType, marketplace, language: eventLang } = event.payload;

  if (await isDuplicate(userId, `content.generation:${generationId}`, logger)) return;

  const prefs = await getOrCreatePreferences(userId);

  if (!isChannelEnabled(prefs, "inApp", "content.generation.complete")) return;

  const lang = prefs.language;
  const titles = {
    ru: "Контент сгенерирован",
    pl: "Treść wygenerowana",
    ua: "Контент згенеровано",
    en: "Content generated",
  } as const;
  const bodies = {
    ru: `Тип «${contentType}» для маркетплейса ${marketplace} готов.`,
    pl: `Typ «${contentType}» dla marketplace ${marketplace} gotowy.`,
    ua: `Тип «${contentType}» для маркетплейсу ${marketplace} готовий.`,
    en: `"${contentType}" content for ${marketplace} is ready.`,
  } as const;

  await createInAppNotification(
    {
      userId,
      type: "content_generation_complete",
      title: titles[lang] ?? titles.en,
      body: bodies[lang] ?? bodies.en,
      data: { generationId, contentType, marketplace, language: eventLang },
    },
    logger,
  );

  logger.info({ userId, generationId }, "Handled content.generation.complete");
}
