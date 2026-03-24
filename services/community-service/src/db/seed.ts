// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — community-service: Database seed
// Run with: tsx src/db/seed.ts
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { categories } from "./schema.js";
import type { NewCategory } from "./schema.js";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema: { categories } });

// ─────────────────────────────────────────────────────────────────────────────
// Seed data
// ─────────────────────────────────────────────────────────────────────────────

const seedCategories: NewCategory[] = [
  {
    slug: "allegro-tips",
    name: {
      ru: "Советы Allegro",
      pl: "Porady Allegro",
      ua: "Поради Allegro",
      en: "Allegro Tips",
    },
    description: {
      ru: "Лайфхаки, стратегии и советы по продажам на Allegro",
      pl: "Lifehacki, strategie i porady dotyczące sprzedaży na Allegro",
      ua: "Лайфхаки, стратегії та поради з продажів на Allegro",
      en: "Lifehacks, strategies and tips for selling on Allegro",
    },
    iconEmoji: "🛒",
    sortOrder: 1,
    isRestricted: false,
  },
  {
    slug: "niches-products",
    name: {
      ru: "Ниши и товары",
      pl: "Nisze i produkty",
      ua: "Ніші та товари",
      en: "Niches & Products",
    },
    description: {
      ru: "Обсуждение прибыльных ниш и товаров для перепродажи",
      pl: "Dyskusja o dochodowych niszach i produktach do odsprzedaży",
      ua: "Обговорення прибуткових ніш і товарів для перепродажу",
      en: "Discussion of profitable niches and products for resale",
    },
    iconEmoji: "📦",
    sortOrder: 2,
    isRestricted: false,
  },
  {
    slug: "suppliers-reviews",
    name: {
      ru: "Отзывы о поставщиках",
      pl: "Opinie o dostawcach",
      ua: "Відгуки про постачальників",
      en: "Suppliers Reviews",
    },
    description: {
      ru: "Честные отзывы и рейтинги поставщиков от сообщества",
      pl: "Rzetelne recenzje i oceny dostawców od społeczności",
      ua: "Чесні відгуки та рейтинги постачальників від спільноти",
      en: "Honest reviews and ratings of suppliers from the community",
    },
    iconEmoji: "⭐",
    sortOrder: 3,
    isRestricted: true,
  },
  {
    slug: "china-import",
    name: {
      ru: "Импорт из Китая",
      pl: "Import z Chin",
      ua: "Імпорт з Китаю",
      en: "China Import",
    },
    description: {
      ru: "Все о работе с китайскими поставщиками и импорте товаров",
      pl: "Wszystko o pracy z chińskimi dostawcami i imporcie towarów",
      ua: "Все про роботу з китайськими постачальниками та імпорт товарів",
      en: "Everything about working with Chinese suppliers and importing goods",
    },
    iconEmoji: "🇨🇳",
    sortOrder: 4,
    isRestricted: true,
  },
  {
    slug: "legal-tax",
    name: {
      ru: "Юридические и налоговые вопросы",
      pl: "Kwestie prawne i podatkowe",
      ua: "Юридичні та податкові питання",
      en: "Legal & Tax",
    },
    description: {
      ru: "Правовые аспекты e-commerce, НДС, ОСС, бухгалтерия в Польше",
      pl: "Aspekty prawne e-commerce, VAT, OSS, księgowość w Polsce",
      ua: "Правові аспекти e-commerce, ПДВ, OSS, бухгалтерія в Польщі",
      en: "Legal aspects of e-commerce, VAT, OSS, accounting in Poland",
    },
    iconEmoji: "⚖️",
    sortOrder: 5,
    isRestricted: false,
  },
  {
    slug: "dropshipping",
    name: {
      ru: "Дропшиппинг",
      pl: "Dropshipping",
      ua: "Дропшипінг",
      en: "Dropshipping",
    },
    description: {
      ru: "Модели дропшиппинга, поставщики, автоматизация заказов",
      pl: "Modele dropshippingu, dostawcy, automatyzacja zamówień",
      ua: "Моделі дропшипінгу, постачальники, автоматизація замовлень",
      en: "Dropshipping models, suppliers, order automation",
    },
    iconEmoji: "🚚",
    sortOrder: 6,
    isRestricted: false,
  },
  {
    slug: "vinted-tips",
    name: {
      ru: "Советы Vinted",
      pl: "Porady Vinted",
      ua: "Поради Vinted",
      en: "Vinted Tips",
    },
    description: {
      ru: "Продажа одежды и аксессуаров на Vinted",
      pl: "Sprzedaż ubrań i akcesoriów na Vinted",
      ua: "Продаж одягу та аксесуарів на Vinted",
      en: "Selling clothes and accessories on Vinted",
    },
    iconEmoji: "👗",
    sortOrder: 7,
    isRestricted: false,
  },
  {
    slug: "amazon-eu",
    name: {
      ru: "Amazon EU",
      pl: "Amazon EU",
      ua: "Amazon EU",
      en: "Amazon EU",
    },
    description: {
      ru: "Продажи на Amazon.de, .fr, .it, FBA, PAN-EU программа",
      pl: "Sprzedaż na Amazon.de, .fr, .it, FBA, program PAN-EU",
      ua: "Продажі на Amazon.de, .fr, .it, FBA, програма PAN-EU",
      en: "Selling on Amazon.de, .fr, .it, FBA, PAN-EU program",
    },
    iconEmoji: "🇪🇺",
    sortOrder: 8,
    isRestricted: true,
  },
  {
    slug: "tools-software",
    name: {
      ru: "Инструменты и ПО",
      pl: "Narzędzia i oprogramowanie",
      ua: "Інструменти та ПЗ",
      en: "Tools & Software",
    },
    description: {
      ru: "Обзоры и рекомендации инструментов для e-commerce",
      pl: "Recenzje i rekomendacje narzędzi dla e-commerce",
      ua: "Огляди та рекомендації інструментів для e-commerce",
      en: "Reviews and recommendations of e-commerce tools",
    },
    iconEmoji: "🛠️",
    sortOrder: 9,
    isRestricted: false,
  },
  {
    slug: "offtopic",
    name: {
      ru: "Оффтопик",
      pl: "Offtopic",
      ua: "Офтопік",
      en: "Off-Topic",
    },
    description: {
      ru: "Общение вне e-commerce тематики, знакомства, юмор",
      pl: "Rozmowy poza tematyką e-commerce, znajomości, humor",
      ua: "Спілкування поза тематикою e-commerce, знайомства, гумор",
      en: "Conversations outside e-commerce topics, introductions, humor",
    },
    iconEmoji: "💬",
    sortOrder: 10,
    isRestricted: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main seed function
// ─────────────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  process.stdout.write("[seed] Inserting community categories...\n");

  for (const category of seedCategories) {
    await db
      .insert(categories)
      .values(category)
      .onConflictDoUpdate({
        target: categories.slug,
        set: {
          name: category.name,
          description: category.description,
          ...(category.sortOrder !== undefined ? { sortOrder: category.sortOrder } : {}),
          iconEmoji: category.iconEmoji,
          ...(category.isRestricted !== undefined ? { isRestricted: category.isRestricted } : {}),
        },
      });
    process.stdout.write(`  [seed] Upserted category: ${category.slug}\n`);
  }

  process.stdout.write(`[seed] Done. ${seedCategories.length} categories seeded.\n`);
  await pool.end();
}

seed().catch((err: unknown) => {
  process.stderr.write(`[seed] Fatal error: ${String(err)}\n`);
  process.exitCode = 1;
  void pool.end();
});
