// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service: Resend email service
// All templates are localised for ru, pl, ua, en
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from "resend";
import { env } from "../config/env.js";
import type { Language } from "@ecompilot/shared-types";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Resend singleton
// ─────────────────────────────────────────────────────────────────────────────

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend === null) {
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}

const FROM = "EcomPilot <hello@ecompilot.com>" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Shared user context passed into every template
// ─────────────────────────────────────────────────────────────────────────────

export interface EmailUser {
  readonly email: string;
  readonly name: string;
  readonly language?: Language;
}

// ─────────────────────────────────────────────────────────────────────────────
// i18n helpers
// ─────────────────────────────────────────────────────────────────────────────

// I18nMap<T>: validates at definition site that all 4 languages have the right shape.
// Using "satisfies" (not return inference) so T is NOT inferred from a single language.
type I18nMap<T extends Record<string, string>> = Record<Language, T>;

// Helper to select the translation for a given language, falling back to Russian.
// NoInfer<T> prevents TypeScript from widening T based on argument inference —
// T must be explicitly provided or inferred from a non-map context.
// The return type uses Readonly<Record<keyof T & string, string>> which avoids
// the "string | undefined" that noUncheckedIndexedAccess adds to Record<string,V>.
type Strings<T extends Record<string, string>> = { [K in keyof T]: string };

function t<T extends Record<string, string>>(
  map: { readonly ru: T } & { readonly [K in Exclude<Language, "ru">]: Strings<T> },
  lang: Language | undefined,
): Strings<T> {
  const key: Language = lang ?? "ru";
  const entry = map[key as "ru"] as Strings<T> | undefined;
  return entry ?? map["ru"];
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared HTML layout
// ─────────────────────────────────────────────────────────────────────────────

function renderLayout(content: string, preheader: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EcomPilot</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    body { margin: 0; padding: 0; background: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #1a56db; padding: 24px 32px; }
    .header img { height: 32px; }
    .body { padding: 40px 32px; color: #1f2937; }
    h1 { margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #111827; }
    p { margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #374151; }
    .cta { display: inline-block; margin: 24px 0; padding: 14px 28px; background: #1a56db; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; }
    .footer { padding: 24px 32px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
    .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 16px 0; }
    .success { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; border-radius: 4px; margin: 16px 0; }
    .badge { display: inline-block; padding: 4px 12px; background: #eff6ff; color: #1d4ed8; border-radius: 999px; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <div class="wrapper">
    <div class="header">
      <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">EcomPilot</span>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p style="margin:0;">&copy; ${new Date().getFullYear()} EcomPilot PL. All rights reserved.</p>
      <p style="margin:4px 0 0;">ecompilot.pl</p>
    </div>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template: welcome
// ─────────────────────────────────────────────────────────────────────────────

const welcomeI18n = {
  ru: {
    subject: "Добро пожаловать в EcomPilot!",
    heading: "Добро пожаловать,",
    body: "Мы рады приветствовать вас в EcomPilot — платформе для автоматизации вашего бизнеса на маркетплейсах. Вы уже можете начать анализировать ниши, оптимизировать листинги и управлять заказами.",
    cta: "Открыть дашборд",
    preheader: "Ваш аккаунт создан. Начните работу прямо сейчас.",
  },
  pl: {
    subject: "Witaj w EcomPilot!",
    heading: "Witaj,",
    body: "Cieszymy się, że dołączyłeś do EcomPilot — platformy do automatyzacji Twojego biznesu na marketplace'ach. Możesz już teraz zacząć analizować nisze, optymalizować oferty i zarządzać zamówieniami.",
    cta: "Otwórz dashboard",
    preheader: "Twoje konto zostało utworzone. Zacznij działać już teraz.",
  },
  ua: {
    subject: "Ласкаво просимо до EcomPilot!",
    heading: "Ласкаво просимо,",
    body: "Ми раді вітати вас у EcomPilot — платформі для автоматизації вашого бізнесу на маркетплейсах. Ви вже можете почати аналізувати ніші, оптимізувати лістинги та керувати замовленнями.",
    cta: "Відкрити дашборд",
    preheader: "Ваш акаунт створено. Починайте роботу прямо зараз.",
  },
  en: {
    subject: "Welcome to EcomPilot!",
    heading: "Welcome,",
    body: "We're thrilled to have you on EcomPilot — the platform to automate your marketplace business. You can now start analysing niches, optimising listings, and managing orders.",
    cta: "Open Dashboard",
    preheader: "Your account is ready. Get started right now.",
  },
} as const satisfies I18nMap<{ subject: string; heading: string; body: string; cta: string; preheader: string }>;

export async function sendWelcomeEmail(
  user: EmailUser,
  dashboardUrl: string,
  logger: Logger,
): Promise<void> {
  const i18n = t(welcomeI18n, user.language);
  const html = renderLayout(
    /* html */ `
      <h1>${i18n.heading} ${user.name}!</h1>
      <p>${i18n.body}</p>
      <a class="cta" href="${dashboardUrl}">${i18n.cta}</a>
    `,
    i18n.preheader,
  );

  await sendEmail({ to: user.email, subject: i18n.subject, html, logger });
}

// ─────────────────────────────────────────────────────────────────────────────
// Template: paymentSuccess
// ─────────────────────────────────────────────────────────────────────────────

const paymentSuccessI18n = {
  ru: {
    subject: "Платёж успешно принят — EcomPilot",
    heading: "Платёж принят",
    body: "Ваша подписка успешно оформлена. Спасибо за оплату!",
    plan: "Тарифный план",
    amount: "Сумма",
    preheader: "Ваша подписка активна. Приятной работы!",
  },
  pl: {
    subject: "Płatność zaakceptowana — EcomPilot",
    heading: "Płatność zaakceptowana",
    body: "Twoja subskrypcja została pomyślnie aktywowana. Dziękujemy za płatność!",
    plan: "Plan subskrypcji",
    amount: "Kwota",
    preheader: "Twoja subskrypcja jest aktywna. Miłej pracy!",
  },
  ua: {
    subject: "Платіж успішно прийнято — EcomPilot",
    heading: "Платіж прийнято",
    body: "Вашу підписку успішно оформлено. Дякуємо за оплату!",
    plan: "Тарифний план",
    amount: "Сума",
    preheader: "Ваша підписка активна. Приємної роботи!",
  },
  en: {
    subject: "Payment successful — EcomPilot",
    heading: "Payment accepted",
    body: "Your subscription has been successfully activated. Thank you for your payment!",
    plan: "Subscription plan",
    amount: "Amount",
    preheader: "Your subscription is active. Enjoy EcomPilot!",
  },
} as const satisfies I18nMap<{ subject: string; heading: string; body: string; plan: string; amount: string; preheader: string }>;

export async function sendPaymentSuccessEmail(
  user: EmailUser,
  plan: string,
  amount: { readonly amount: number; readonly currency: string },
  logger: Logger,
): Promise<void> {
  const i18n = t(paymentSuccessI18n, user.language);
  const formattedAmount = new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: amount.currency,
  }).format(amount.amount);

  const html = renderLayout(
    /* html */ `
      <h1>${i18n.heading}</h1>
      <p>${i18n.body}</p>
      <div class="success">
        <p style="margin:0 0 8px;"><strong>${i18n.plan}:</strong> <span class="badge">${plan.toUpperCase()}</span></p>
        <p style="margin:0;"><strong>${i18n.amount}:</strong> ${formattedAmount}</p>
      </div>
    `,
    i18n.preheader,
  );

  await sendEmail({ to: user.email, subject: i18n.subject, html, logger });
}

// ─────────────────────────────────────────────────────────────────────────────
// Template: paymentFailed
// ─────────────────────────────────────────────────────────────────────────────

const paymentFailedI18n = {
  ru: {
    subject: "Проблема с оплатой — EcomPilot",
    heading: "Не удалось провести платёж",
    body: "К сожалению, мы не смогли списать средства с вашей карты. Пожалуйста, обновите платёжные данные, чтобы избежать прерывания подписки.",
    reason: "Причина",
    cta: "Обновить платёжные данные",
    preheader: "Требуется действие: обновите платёжные данные.",
  },
  pl: {
    subject: "Problem z płatnością — EcomPilot",
    heading: "Płatność nie powiodła się",
    body: "Niestety nie udało nam się pobrać środków z Twojej karty. Zaktualizuj dane płatnicze, aby uniknąć przerwy w subskrypcji.",
    reason: "Powód",
    cta: "Zaktualizuj dane płatnicze",
    preheader: "Wymagane działanie: zaktualizuj dane płatnicze.",
  },
  ua: {
    subject: "Проблема з оплатою — EcomPilot",
    heading: "Не вдалося провести платіж",
    body: "На жаль, нам не вдалося списати кошти з вашої картки. Будь ласка, оновіть платіжні дані, щоб уникнути переривання підписки.",
    reason: "Причина",
    cta: "Оновити платіжні дані",
    preheader: "Потрібна дія: оновіть платіжні дані.",
  },
  en: {
    subject: "Payment issue — EcomPilot",
    heading: "Payment failed",
    body: "Unfortunately we were unable to charge your card. Please update your payment details to avoid interruption to your subscription.",
    reason: "Reason",
    cta: "Update payment details",
    preheader: "Action required: update your payment details.",
  },
} as const satisfies I18nMap<{ subject: string; heading: string; body: string; reason: string; cta: string; preheader: string }>;

export async function sendPaymentFailedEmail(
  user: EmailUser,
  reason: string,
  billingUrl: string,
  logger: Logger,
): Promise<void> {
  const i18n = t(paymentFailedI18n, user.language);
  const html = renderLayout(
    /* html */ `
      <h1>${i18n.heading}</h1>
      <p>${i18n.body}</p>
      <div class="alert">
        <p style="margin:0;"><strong>${i18n.reason}:</strong> ${reason}</p>
      </div>
      <a class="cta" href="${billingUrl}">${i18n.cta}</a>
    `,
    i18n.preheader,
  );

  await sendEmail({ to: user.email, subject: i18n.subject, html, logger });
}

// ─────────────────────────────────────────────────────────────────────────────
// Template: nicheAnalysisComplete
// ─────────────────────────────────────────────────────────────────────────────

const nicheAnalysisI18n = {
  ru: {
    subject: "Анализ ниши готов — EcomPilot",
    heading: "Анализ завершён",
    body: "Анализ ниши по вашему запросу завершён. Ознакомьтесь с результатами в дашборде.",
    keyword: "Ключевое слово",
    score: "Рейтинг ниши",
    cta: "Посмотреть результаты",
    preheader: "Результаты анализа ниши готовы к просмотру.",
  },
  pl: {
    subject: "Analiza niszy gotowa — EcomPilot",
    heading: "Analiza zakończona",
    body: "Analiza niszy dla Twojego zapytania jest gotowa. Sprawdź wyniki w dashboardzie.",
    keyword: "Słowo kluczowe",
    score: "Ocena niszy",
    cta: "Zobacz wyniki",
    preheader: "Wyniki analizy niszy są gotowe do przejrzenia.",
  },
  ua: {
    subject: "Аналіз ніші готовий — EcomPilot",
    heading: "Аналіз завершено",
    body: "Аналіз ніші за вашим запитом завершено. Ознайомтеся з результатами в дашборді.",
    keyword: "Ключове слово",
    score: "Рейтинг ніші",
    cta: "Переглянути результати",
    preheader: "Результати аналізу ніші готові до перегляду.",
  },
  en: {
    subject: "Niche analysis ready — EcomPilot",
    heading: "Analysis complete",
    body: "Your niche analysis has finished. Check out the results in your dashboard.",
    keyword: "Keyword",
    score: "Niche score",
    cta: "View results",
    preheader: "Your niche analysis results are ready.",
  },
} as const satisfies I18nMap<{ subject: string; heading: string; body: string; keyword: string; score: string; cta: string; preheader: string }>;

export async function sendNicheAnalysisCompleteEmail(
  user: EmailUser,
  keyword: string,
  score: number,
  resultsUrl: string,
  logger: Logger,
): Promise<void> {
  const i18n = t(nicheAnalysisI18n, user.language);
  const html = renderLayout(
    /* html */ `
      <h1>${i18n.heading}</h1>
      <p>${i18n.body}</p>
      <div class="success">
        <p style="margin:0 0 8px;"><strong>${i18n.keyword}:</strong> ${keyword}</p>
        <p style="margin:0;"><strong>${i18n.score}:</strong> ${score}/100</p>
      </div>
      <a class="cta" href="${resultsUrl}">${i18n.cta}</a>
    `,
    i18n.preheader,
  );

  await sendEmail({ to: user.email, subject: i18n.subject, html, logger });
}

// ─────────────────────────────────────────────────────────────────────────────
// Template: forumReply
// ─────────────────────────────────────────────────────────────────────────────

const forumReplyI18n = {
  ru: {
    subject: "Новый ответ в теме — EcomPilot",
    heading: "Новый ответ",
    body: "Пользователь оставил ответ в теме, на которую вы подписаны.",
    post: "Тема",
    author: "Автор ответа",
    cta: "Перейти к обсуждению",
    preheader: "Новый ответ в вашей теме.",
  },
  pl: {
    subject: "Nowa odpowiedź w wątku — EcomPilot",
    heading: "Nowa odpowiedź",
    body: "Użytkownik odpowiedział w wątku, który obserwujesz.",
    post: "Temat",
    author: "Autor odpowiedzi",
    cta: "Przejdź do dyskusji",
    preheader: "Nowa odpowiedź w Twoim wątku.",
  },
  ua: {
    subject: "Нова відповідь у темі — EcomPilot",
    heading: "Нова відповідь",
    body: "Користувач залишив відповідь у темі, на яку ви підписані.",
    post: "Тема",
    author: "Автор відповіді",
    cta: "Перейти до обговорення",
    preheader: "Нова відповідь у вашій темі.",
  },
  en: {
    subject: "New reply in thread — EcomPilot",
    heading: "New reply",
    body: "A user has replied to a thread you are following.",
    post: "Topic",
    author: "Reply author",
    cta: "Go to discussion",
    preheader: "New reply in your thread.",
  },
} as const satisfies I18nMap<{ subject: string; heading: string; body: string; post: string; author: string; cta: string; preheader: string }>;

export async function sendForumReplyEmail(
  user: EmailUser,
  postTitle: string,
  replyAuthor: string,
  threadUrl: string,
  logger: Logger,
): Promise<void> {
  const i18n = t(forumReplyI18n, user.language);
  const html = renderLayout(
    /* html */ `
      <h1>${i18n.heading}</h1>
      <p>${i18n.body}</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px;"><strong>${i18n.post}:</strong> ${postTitle}</p>
        <p style="margin:0;"><strong>${i18n.author}:</strong> ${replyAuthor}</p>
      </div>
      <a class="cta" href="${threadUrl}">${i18n.cta}</a>
    `,
    i18n.preheader,
  );

  await sendEmail({ to: user.email, subject: i18n.subject, html, logger });
}

// ─────────────────────────────────────────────────────────────────────────────
// Template: passwordReset
// ─────────────────────────────────────────────────────────────────────────────

const passwordResetI18n = {
  ru: {
    subject: "Сброс пароля — EcomPilot",
    heading: "Сброс пароля",
    body: "Мы получили запрос на сброс пароля для вашего аккаунта. Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действует 1 час.",
    warning: "Если вы не запрашивали сброс пароля, проигнорируйте это письмо.",
    cta: "Сбросить пароль",
    preheader: "Запрос на сброс пароля для вашего аккаунта EcomPilot.",
  },
  pl: {
    subject: "Resetowanie hasła — EcomPilot",
    heading: "Resetowanie hasła",
    body: "Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta. Kliknij poniższy przycisk, aby ustawić nowe hasło. Link wygaśnie po 1 godzinie.",
    warning: "Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość.",
    cta: "Zresetuj hasło",
    preheader: "Prośba o zresetowanie hasła do Twojego konta EcomPilot.",
  },
  ua: {
    subject: "Скидання пароля — EcomPilot",
    heading: "Скидання пароля",
    body: "Ми отримали запит на скидання пароля для вашого акаунта. Натисніть кнопку нижче, щоб встановити новий пароль. Посилання діє 1 годину.",
    warning: "Якщо ви не запитували скидання пароля, проігноруйте цей лист.",
    cta: "Скинути пароль",
    preheader: "Запит на скидання пароля для вашого акаунта EcomPilot.",
  },
  en: {
    subject: "Password reset — EcomPilot",
    heading: "Password reset",
    body: "We received a request to reset the password for your account. Click the button below to set a new password. The link expires in 1 hour.",
    warning: "If you didn't request a password reset, you can safely ignore this email.",
    cta: "Reset password",
    preheader: "Password reset request for your EcomPilot account.",
  },
} as const satisfies I18nMap<{ subject: string; heading: string; body: string; warning: string; cta: string; preheader: string }>;

export async function sendPasswordResetEmail(
  user: EmailUser,
  resetUrl: string,
  logger: Logger,
): Promise<void> {
  const i18n = t(passwordResetI18n, user.language);
  const html = renderLayout(
    /* html */ `
      <h1>${i18n.heading}</h1>
      <p>${i18n.body}</p>
      <a class="cta" href="${resetUrl}">${i18n.cta}</a>
      <div class="alert" style="margin-top:24px;">
        <p style="margin:0;font-size:13px;">${i18n.warning}</p>
      </div>
    `,
    i18n.preheader,
  );

  await sendEmail({ to: user.email, subject: i18n.subject, html, logger });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal send helper
// ─────────────────────────────────────────────────────────────────────────────

interface SendEmailOptions {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly logger: Logger;
}

async function sendEmail({ to, subject, html, logger }: SendEmailOptions): Promise<void> {
  const resend = getResend();

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    });

    if (error !== null && error !== undefined) {
      logger.error({ to, subject, error }, "Resend API returned an error");
      throw new Error(`Email delivery failed: ${error.message}`);
    }

    logger.info({ to, subject, messageId: data?.id }, "Email sent successfully");
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email via Resend");
    throw err;
  }
}
