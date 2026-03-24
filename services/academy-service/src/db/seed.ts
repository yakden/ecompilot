// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — academy-service / db/seed.ts
// Seed 5 real courses with lessons for the EcomPilot Academy
// Run with: tsx src/db/seed.ts
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { courses, lessons } from "./schema.js";
import type { NewCourse, NewLesson } from "./schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB connection (reads DATABASE_URL directly — no env.ts singleton)
// ─────────────────────────────────────────────────────────────────────────────

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required for seed");
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool, { schema: { courses, lessons } });

// ─────────────────────────────────────────────────────────────────────────────
// Course data
// ─────────────────────────────────────────────────────────────────────────────

const COURSE_DATA: ReadonlyArray<
  NewCourse & { readonly lessonData: ReadonlyArray<Omit<NewLesson, "courseId">> }
> = [
  // ── 1. Старт на Allegro с нуля ──────────────────────────────────────────
  {
    slug: "allegro-start-from-zero",
    titleRu: "Старт на Allegro с нуля",
    titlePl: "Start na Allegro od zera",
    titleUa: "Старт на Allegro з нуля",
    titleEn: "Starting on Allegro from Scratch",
    descriptionRu:
      "Полный практический курс для тех, кто только начинает продавать на Allegro. От регистрации аккаунта до первой продажи — пошагово и без воды.",
    descriptionPl:
      "Kompletny kurs praktyczny dla osób zaczynających sprzedaż na Allegro. Od rejestracji konta do pierwszej sprzedaży — krok po kroku.",
    descriptionUa:
      "Повний практичний курс для тих, хто починає продавати на Allegro. Від реєстрації акаунту до першого продажу — покроково.",
    descriptionEn:
      "A complete practical course for those just starting to sell on Allegro. From account registration to the first sale — step by step.",
    level: "beginner",
    category: "allegro",
    thumbnailUrl: "https://cdn.ecompilot.pl/academy/thumbs/allegro-start.jpg",
    totalDurationMin: 142,
    lessonCount: 8,
    isPublished: true,
    isFree: false,
    priceEur: "49.00",
    requiredPlan: "pro",
    sortOrder: 1,
    lessonData: [
      {
        titleRu: "Регистрация аккаунта и выбор типа продавца",
        titlePl: "Rejestracja konta i wybór typu sprzedawcy",
        titleUa: "Реєстрація акаунту та вибір типу продавця",
        titleEn: "Account Registration and Seller Type Selection",
        videoUrl: "videos/allegro-start/01-registration.mp4",
        durationMin: 14,
        sortOrder: 1,
        isPreview: true,
        transcriptRu:
          "В этом уроке мы разберём, как правильно зарегистрироваться на Allegro — выбрать между личным аккаунтом и аккаунтом компании, заполнить все необходимые данные и пройти верификацию.",
        transcriptPl:
          "W tej lekcji omówimy jak prawidłowo zarejestrować się na Allegro — wybór między kontem osobistym a firmowym, uzupełnienie danych i przejście weryfikacji.",
        resourcesJson: [
          { title: "Checklist для регистрации", url: "https://cdn.ecompilot.pl/academy/resources/allegro-reg-checklist.pdf", type: "pdf" },
        ],
      },
      {
        titleRu: "Настройка профиля продавца: что влияет на доверие",
        titlePl: "Konfiguracja profilu sprzedawcy — co wpływa na zaufanie",
        titleUa: "Налаштування профілю продавця: що впливає на довіру",
        titleEn: "Seller Profile Setup: Trust Factors",
        videoUrl: "videos/allegro-start/02-profile-setup.mp4",
        durationMin: 18,
        sortOrder: 2,
        isPreview: false,
        transcriptRu:
          "Профиль продавца — это ваша витрина на Allegro. Разбираем аватар, описание, настройки доставки и политику возвратов, которые убеждают покупателей выбрать именно вас.",
        transcriptPl:
          "Profil sprzedawcy to Twoja wizytówka na Allegro. Omawiamy awatar, opis, ustawienia wysyłki i politykę zwrotów.",
        resourcesJson: [],
      },
      {
        titleRu: "Первый листинг: категории, заголовок и описание",
        titlePl: "Pierwsza oferta: kategorie, tytuł i opis",
        titleUa: "Перший лістинг: категорії, заголовок і опис",
        titleEn: "First Listing: Categories, Title and Description",
        videoUrl: "videos/allegro-start/03-first-listing.mp4",
        durationMin: 22,
        sortOrder: 3,
        isPreview: false,
        transcriptRu:
          "Создаём первый листинг с нуля: правильно выбираем категорию, пишем заголовок с ключевыми словами, структурируем описание для конверсии.",
        transcriptPl:
          "Tworzymy pierwszą ofertę od zera: wybieramy kategorię, piszemy tytuł z słowami kluczowymi, strukturyzujemy opis pod konwersję.",
        resourcesJson: [
          { title: "Шаблон описания товара", url: "https://cdn.ecompilot.pl/academy/resources/listing-template.docx", type: "doc" },
        ],
      },
      {
        titleRu: "Фотографии товара: стандарты и лайфхаки",
        titlePl: "Zdjęcia produktu: standardy i praktyczne wskazówki",
        titleUa: "Фотографії товару: стандарти та лайфхаки",
        titleEn: "Product Photos: Standards and Practical Tips",
        videoUrl: "videos/allegro-start/04-photos.mp4",
        durationMin: 16,
        sortOrder: 4,
        isPreview: false,
        transcriptRu:
          "Качественные фото — половина успеха. Разбираем требования Allegro, бюджетный фотосет, обработку и сравниваем примеры хороших и плохих листингов.",
        transcriptPl:
          "Dobrej jakości zdjęcia to połowa sukcesu. Omawiamy wymagania Allegro, budżetową sesję zdjęciową i obróbkę.",
        resourcesJson: [],
      },
      {
        titleRu: "Ценообразование: как не продать в минус",
        titlePl: "Cennik: jak nie sprzedawać ze stratą",
        titleUa: "Ціноутворення: як не продати у збиток",
        titleEn: "Pricing: How to Avoid Selling at a Loss",
        videoUrl: "videos/allegro-start/05-pricing.mp4",
        durationMin: 20,
        sortOrder: 5,
        isPreview: false,
        transcriptRu:
          "Рассчитываем себестоимость с учётом комиссий Allegro, доставки и упаковки. Стратегии: вход в рынок, конкурентная цена, premium.",
        transcriptPl:
          "Obliczamy koszt własny uwzględniając prowizje Allegro, wysyłkę i opakowanie. Strategie wejścia na rynek.",
        resourcesJson: [
          { title: "Калькулятор маржи Allegro", url: "https://cdn.ecompilot.pl/academy/resources/margin-calculator.xlsx", type: "xlsx" },
        ],
      },
      {
        titleRu: "Доставка: Allegro Smart, InPost, DPD — выбираем систему",
        titlePl: "Wysyłka: Allegro Smart, InPost, DPD — wybieramy system",
        titleUa: "Доставка: Allegro Smart, InPost, DPD — вибираємо систему",
        titleEn: "Shipping: Allegro Smart, InPost, DPD — Choosing Your System",
        videoUrl: "videos/allegro-start/06-shipping.mp4",
        durationMin: 19,
        sortOrder: 6,
        isPreview: false,
        transcriptRu:
          "Сравниваем все способы доставки, доступные польским продавцам. Allegro Smart — обязательное условие для попадания в поиск. Подключаем InPost пачкомат.",
        transcriptPl:
          "Porównujemy wszystkie metody wysyłki. Allegro Smart — warunek konieczny do widoczności w wynikach wyszukiwania.",
        resourcesJson: [],
      },
      {
        titleRu: "Отзывы: как получить первые 10 за 30 дней",
        titlePl: "Opinie: jak zdobyć pierwszych 10 w ciągu 30 dni",
        titleUa: "Відгуки: як отримати перші 10 за 30 днів",
        titleEn: "Reviews: Getting Your First 10 in 30 Days",
        videoUrl: "videos/allegro-start/07-reviews.mp4",
        durationMin: 17,
        sortOrder: 7,
        isPreview: false,
        transcriptRu:
          "Отзывы — главный социальный сигнал. Легальные методы получения первых отзывов, автоматические follow-up сообщения, работа с негативом.",
        transcriptPl:
          "Opinie to główny sygnał społeczny. Legalne metody zdobywania opinii, automatyczne wiadomości follow-up.",
        resourcesJson: [],
      },
      {
        titleRu: "Аналитика Allegro: читаем данные и масштабируемся",
        titlePl: "Analityka Allegro: czytamy dane i skalujemy sprzedaż",
        titleUa: "Аналітика Allegro: читаємо дані та масштабуємось",
        titleEn: "Allegro Analytics: Reading Data and Scaling Up",
        videoUrl: "videos/allegro-start/08-analytics.mp4",
        durationMin: 16,
        sortOrder: 8,
        isPreview: false,
        transcriptRu:
          "Разбираем панель аналитики Allegro: просмотры, конверсия, продажи по времени. Как найти слабые места и что улучшать в первую очередь.",
        transcriptPl:
          "Analizujemy panel analityki Allegro: wyświetlenia, konwersja, sprzedaż w czasie. Jak znaleźć słabe punkty.",
        resourcesJson: [],
      },
    ],
  },

  // ── 2. Allegro Ads ───────────────────────────────────────────────────────
  {
    slug: "allegro-ads-mastery",
    titleRu: "Allegro Ads: реклама без слива бюджета",
    titlePl: "Allegro Ads: reklama bez marnowania budżetu",
    titleUa: "Allegro Ads: реклама без зливу бюджету",
    titleEn: "Allegro Ads: Advertising Without Wasting Budget",
    descriptionRu:
      "Глубокое погружение в рекламную систему Allegro. Настройка кампаний, ставки, ACOS, оптимизация — всё что нужно для прибыльной рекламы.",
    descriptionPl:
      "Głębokie zanurzenie w system reklamowy Allegro. Konfiguracja kampanii, stawki, ACOS, optymalizacja — wszystko co potrzebne do opłacalnej reklamy.",
    descriptionUa:
      "Глибоке занурення в рекламну систему Allegro. Налаштування кампаній, ставки, ACOS, оптимізація.",
    descriptionEn:
      "A deep dive into the Allegro advertising system. Campaign setup, bids, ACOS, and optimization for profitable advertising.",
    level: "intermediate",
    category: "ads",
    thumbnailUrl: "https://cdn.ecompilot.pl/academy/thumbs/allegro-ads.jpg",
    totalDurationMin: 118,
    lessonCount: 6,
    isPublished: true,
    isFree: false,
    priceEur: "59.00",
    requiredPlan: "pro",
    sortOrder: 2,
    lessonData: [
      {
        titleRu: "Как работает алгоритм Allegro Ads",
        titlePl: "Jak działa algorytm Allegro Ads",
        titleUa: "Як працює алгоритм Allegro Ads",
        titleEn: "How the Allegro Ads Algorithm Works",
        videoUrl: "videos/allegro-ads/01-algorithm.mp4",
        durationMin: 18,
        sortOrder: 1,
        isPreview: true,
        transcriptRu:
          "Понимание алгоритма — основа эффективной рекламы. Разбираем факторы ранжирования: ставка, CTR, конверсия, история продаж и качество листинга.",
        transcriptPl:
          "Zrozumienie algorytmu to podstawa skutecznej reklamy. Omawiamy czynniki rankingowe: stawka, CTR, konwersja, historia sprzedaży.",
        resourcesJson: [],
      },
      {
        titleRu: "Типы кампаний: автоматическая vs ручная",
        titlePl: "Typy kampanii: automatyczna vs ręczna",
        titleUa: "Типи кампаній: автоматична vs ручна",
        titleEn: "Campaign Types: Automatic vs Manual",
        videoUrl: "videos/allegro-ads/02-campaign-types.mp4",
        durationMin: 21,
        sortOrder: 2,
        isPreview: false,
        transcriptRu:
          "Когда использовать автоматические кампании, а когда переходить на ручное управление. Стратегия старта для нового товара vs опытного продавца.",
        transcriptPl:
          "Kiedy używać kampanii automatycznych, a kiedy przejść na zarządzanie ręczne. Strategia dla nowego towaru vs doświadczonego sprzedawcy.",
        resourcesJson: [
          { title: "Схема выбора типа кампании", url: "https://cdn.ecompilot.pl/academy/resources/ads-campaign-flowchart.pdf", type: "pdf" },
        ],
      },
      {
        titleRu: "Ставки и ACOS: считаем окупаемость рекламы",
        titlePl: "Stawki i ACOS: liczymy zwrot z reklamy",
        titleUa: "Ставки та ACOS: рахуємо окупність реклами",
        titleEn: "Bids and ACOS: Calculating Ad Return",
        videoUrl: "videos/allegro-ads/03-bids-acos.mp4",
        durationMin: 24,
        sortOrder: 3,
        isPreview: false,
        transcriptRu:
          "ACOS (Advertising Cost of Sales) — ключевая метрика. Рассчитываем целевой ACOS, устанавливаем дневной бюджет и максимальную ставку для прибыльности.",
        transcriptPl:
          "ACOS to kluczowa metryka. Obliczamy docelowy ACOS, ustawiamy dzienny budżet i maksymalną stawkę dla rentowności.",
        resourcesJson: [
          { title: "Калькулятор ACOS", url: "https://cdn.ecompilot.pl/academy/resources/acos-calculator.xlsx", type: "xlsx" },
        ],
      },
      {
        titleRu: "Ключевые слова: поиск, группировка, минус-слова",
        titlePl: "Słowa kluczowe: wyszukiwanie, grupowanie, wykluczenia",
        titleUa: "Ключові слова: пошук, групування, мінус-слова",
        titleEn: "Keywords: Research, Grouping, Negative Keywords",
        videoUrl: "videos/allegro-ads/04-keywords.mp4",
        durationMin: 20,
        sortOrder: 4,
        isPreview: false,
        transcriptRu:
          "Инструменты для поиска ключевых слов на польском рынке. Группировка по релевантности и намерению. Минус-слова — как сэкономить до 30% бюджета.",
        transcriptPl:
          "Narzędzia do badania słów kluczowych na polskim rynku. Grupowanie według trafności i intencji. Wykluczenia — jak zaoszczędzić do 30% budżetu.",
        resourcesJson: [],
      },
      {
        titleRu: "Анализ отчётов и A/B тестирование объявлений",
        titlePl: "Analiza raportów i testy A/B reklam",
        titleUa: "Аналіз звітів та A/B тестування оголошень",
        titleEn: "Report Analysis and Ad A/B Testing",
        videoUrl: "videos/allegro-ads/05-reports-ab.mp4",
        durationMin: 19,
        sortOrder: 5,
        isPreview: false,
        transcriptRu:
          "Работаем с рекламными отчётами Allegro: CTR, конверсия по запросам, стоимость клика. Систематическое A/B тестирование заголовков и изображений.",
        transcriptPl:
          "Pracujemy z raportami Allegro Ads: CTR, konwersja według zapytań, koszt kliknięcia. Systematyczne testy A/B tytułów i zdjęć.",
        resourcesJson: [],
      },
      {
        titleRu: "Масштабирование: от 500 до 10 000 PLN бюджета",
        titlePl: "Skalowanie: od 500 do 10 000 PLN budżetu",
        titleUa: "Масштабування: від 500 до 10 000 PLN бюджету",
        titleEn: "Scaling: From 500 to 10,000 PLN Budget",
        videoUrl: "videos/allegro-ads/06-scaling.mp4",
        durationMin: 16,
        sortOrder: 6,
        isPreview: false,
        transcriptRu:
          "Стратегия постепенного масштабирования рекламного бюджета. Когда увеличивать ставки, как тестировать новые категории, управление портфелем кампаний.",
        transcriptPl:
          "Strategia stopniowego skalowania budżetu reklamowego. Kiedy zwiększać stawki, jak testować nowe kategorie.",
        resourcesJson: [],
      },
    ],
  },

  // ── 3. Импорт из Китая ───────────────────────────────────────────────────
  {
    slug: "china-import-guide-2025",
    titleRu: "Импорт из Китая: полный гайд 2025",
    titlePl: "Import z Chin: kompletny przewodnik 2025",
    titleUa: "Імпорт з Китаю: повний гайд 2025",
    titleEn: "Importing from China: Complete Guide 2025",
    descriptionRu:
      "Всё о поиске поставщиков на Alibaba и 1688, переговорах, контроле качества, таможне ЕС и логистике. Реальные кейсы с цифрами.",
    descriptionPl:
      "Wszystko o wyszukiwaniu dostawców na Alibaba i 1688, negocjacjach, kontroli jakości, cle unijnym i logistyce.",
    descriptionUa:
      "Все про пошук постачальників на Alibaba і 1688, переговори, контроль якості, митницю ЄС і логістику.",
    descriptionEn:
      "Everything about finding suppliers on Alibaba and 1688, negotiations, quality control, EU customs, and logistics.",
    level: "intermediate",
    category: "import",
    thumbnailUrl: "https://cdn.ecompilot.pl/academy/thumbs/china-import.jpg",
    totalDurationMin: 218,
    lessonCount: 10,
    isPublished: true,
    isFree: false,
    priceEur: "79.00",
    requiredPlan: "pro",
    sortOrder: 3,
    lessonData: [
      {
        titleRu: "Alibaba vs 1688 vs Made-in-China: что выбрать",
        titlePl: "Alibaba vs 1688 vs Made-in-China: co wybrać",
        titleUa: "Alibaba vs 1688 vs Made-in-China: що вибрати",
        titleEn: "Alibaba vs 1688 vs Made-in-China: Which to Choose",
        videoUrl: "videos/china-import/01-platforms.mp4",
        durationMin: 20,
        sortOrder: 1,
        isPreview: true,
        transcriptRu:
          "Сравниваем три основные площадки для поиска китайских поставщиков. Alibaba для начинающих, 1688 для опытных (нужен посредник), Made-in-China — нишевые товары.",
        transcriptPl:
          "Porównujemy trzy główne platformy do wyszukiwania chińskich dostawców. Alibaba dla początkujących, 1688 dla zaawansowanych.",
        resourcesJson: [
          { title: "Сравнительная таблица платформ", url: "https://cdn.ecompilot.pl/academy/resources/china-platforms-comparison.pdf", type: "pdf" },
        ],
      },
      {
        titleRu: "Как найти надёжного поставщика: 10 критериев проверки",
        titlePl: "Jak znaleźć rzetelnego dostawcę: 10 kryteriów weryfikacji",
        titleUa: "Як знайти надійного постачальника: 10 критеріїв перевірки",
        titleEn: "Finding a Reliable Supplier: 10 Verification Criteria",
        videoUrl: "videos/china-import/02-supplier-verification.mp4",
        durationMin: 25,
        sortOrder: 2,
        isPreview: false,
        transcriptRu:
          "Чеклист проверки поставщика: Trade Assurance, верификация компании, запрос образцов, история продаж, отзывы. Красные флаги, которые нельзя игнорировать.",
        transcriptPl:
          "Checklist weryfikacji dostawcy: Trade Assurance, weryfikacja firmy, próbki, historia sprzedaży. Czerwone flagi.",
        resourcesJson: [
          { title: "Чеклист проверки поставщика", url: "https://cdn.ecompilot.pl/academy/resources/supplier-checklist.pdf", type: "pdf" },
        ],
      },
      {
        titleRu: "Переговоры с китайскими поставщиками: скрипты и тактики",
        titlePl: "Negocjacje z chińskimi dostawcami: skrypty i taktyki",
        titleUa: "Переговори з китайськими постачальниками: скрипти та тактики",
        titleEn: "Negotiating with Chinese Suppliers: Scripts and Tactics",
        videoUrl: "videos/china-import/03-negotiations.mp4",
        durationMin: 22,
        sortOrder: 3,
        isPreview: false,
        transcriptRu:
          "Правила коммуникации с поставщиками: первый запрос, торг по цене, условия оплаты (T/T, L/C, Escrow). Реальные скрипты переписки.",
        transcriptPl:
          "Zasady komunikacji z dostawcami: pierwszy zapytanie, negocjacje ceny, warunki płatności (T/T, L/C, Escrow).",
        resourcesJson: [
          { title: "Шаблоны переписки с поставщиком", url: "https://cdn.ecompilot.pl/academy/resources/supplier-email-templates.docx", type: "doc" },
        ],
      },
      {
        titleRu: "MOQ, семплы и первый заказ: минимизируем риски",
        titlePl: "MOQ, próbki i pierwsze zamówienie: minimalizujemy ryzyko",
        titleUa: "MOQ, семпли та перше замовлення: мінімізуємо ризики",
        titleEn: "MOQ, Samples and First Order: Minimizing Risk",
        videoUrl: "videos/china-import/04-moq-samples.mp4",
        durationMin: 18,
        sortOrder: 4,
        isPreview: false,
        transcriptRu:
          "Как добиться снижения MOQ, правильно заказать и оценить семплы. Структура первого коммерческого заказа и страхование рисков.",
        transcriptPl:
          "Jak obniżyć MOQ, prawidłowo zamówić i ocenić próbki. Struktura pierwszego zamówienia handlowego.",
        resourcesJson: [],
      },
      {
        titleRu: "Контроль качества: инспекция на фабрике и перед отгрузкой",
        titlePl: "Kontrola jakości: inspekcja w fabryce i przed wysyłką",
        titleUa: "Контроль якості: інспекція на фабриці та перед відвантаженням",
        titleEn: "Quality Control: Factory and Pre-Shipment Inspection",
        videoUrl: "videos/china-import/05-quality-control.mp4",
        durationMin: 24,
        sortOrder: 5,
        isPreview: false,
        transcriptRu:
          "Стандарты AQL, третьесторонняя инспекция (QIMA, Bureau Veritas), чеклист для инспектора. Когда стоит платить за инспекцию, а когда достаточно фото-отчёта.",
        transcriptPl:
          "Standardy AQL, inspekcja niezależna (QIMA, Bureau Veritas), checklist dla inspektora.",
        resourcesJson: [
          { title: "Чеклист QC для Allegro-товаров", url: "https://cdn.ecompilot.pl/academy/resources/qc-checklist.pdf", type: "pdf" },
        ],
      },
      {
        titleRu: "Логистика: морем, авиа или экспресс — считаем стоимость",
        titlePl: "Logistyka: morze, lotniczo czy ekspres — liczymy koszt",
        titleUa: "Логістика: морем, авіа або експрес — рахуємо вартість",
        titleEn: "Logistics: Sea, Air or Express — Cost Calculation",
        videoUrl: "videos/china-import/06-logistics.mp4",
        durationMin: 21,
        sortOrder: 6,
        isPreview: false,
        transcriptRu:
          "Сравнение LCL/FCL морем, авиагрузов и экспресс-доставки (DHL/FedEx). Инкотермс EXW, FOB, CIF — что выбрать начинающему импортёру.",
        transcriptPl:
          "Porównanie LCL/FCL morzem, lotniczo i ekspresem (DHL/FedEx). Incoterms EXW, FOB, CIF dla początkującego importera.",
        resourcesJson: [
          { title: "Калькулятор стоимости логистики", url: "https://cdn.ecompilot.pl/academy/resources/logistics-calculator.xlsx", type: "xlsx" },
        ],
      },
      {
        titleRu: "Таможня ЕС: пошлины, НДС, коды ТН ВЭД",
        titlePl: "Cło UE: opłaty celne, VAT, kody CN",
        titleUa: "Митниця ЄС: мита, ПДВ, коди УКТ ЗЕД",
        titleEn: "EU Customs: Duties, VAT, CN Codes",
        videoUrl: "videos/china-import/07-customs.mp4",
        durationMin: 26,
        sortOrder: 7,
        isPreview: false,
        transcriptRu:
          "Таможенное оформление импорта в Польшу: как рассчитать пошлину по коду ТН ВЭД, НДС при импорте, ODO (Odroczone Odroczenie), агентские услуги брокера.",
        transcriptPl:
          "Odprawa celna importu do Polski: jak obliczyć cło według kodu CN, VAT przy imporcie, usługi agencji celnej.",
        resourcesJson: [
          { title: "Инструкция по таможенным кодам", url: "https://cdn.ecompilot.pl/academy/resources/cn-codes-guide.pdf", type: "pdf" },
        ],
      },
      {
        titleRu: "CE-маркировка и сертификация товаров для ЕС",
        titlePl: "Oznakowanie CE i certyfikacja produktów dla UE",
        titleUa: "CE-маркування та сертифікація товарів для ЄС",
        titleEn: "CE Marking and Product Certification for the EU",
        videoUrl: "videos/china-import/08-ce-certification.mp4",
        durationMin: 22,
        sortOrder: 8,
        isPreview: false,
        transcriptRu:
          "Какие товары требуют CE-маркировки, как её получить из Китая. Директивы ЕС, декларация соответствия, нотифицированные органы.",
        transcriptPl:
          "Które produkty wymagają oznakowania CE, jak je uzyskać z Chin. Dyrektywy UE, deklaracja zgodności.",
        resourcesJson: [],
      },
      {
        titleRu: "Работа с посредниками и складами в Китае",
        titlePl: "Praca z pośrednikami i magazynami w Chinach",
        titleUa: "Робота з посередниками та складами в Китаї",
        titleEn: "Working with Agents and Warehouses in China",
        videoUrl: "videos/china-import/09-agents.mp4",
        durationMin: 19,
        sortOrder: 9,
        isPreview: false,
        transcriptRu:
          "Когда нужен торговый агент в Китае, как его найти и проверить. Консолидация товаров на китайском складе, услуги фулфилмента.",
        transcriptPl:
          "Kiedy potrzebny jest agent handlowy w Chinach, jak go znaleźć. Konsolidacja towarów na chińskim magazynie.",
        resourcesJson: [],
      },
      {
        titleRu: "Кейс: запуск товара с 0 до 100k PLN оборота",
        titlePl: "Case study: wprowadzenie produktu od 0 do 100k PLN obrotu",
        titleUa: "Кейс: запуск товару з 0 до 100k PLN обороту",
        titleEn: "Case Study: Launching a Product from 0 to 100k PLN Revenue",
        videoUrl: "videos/china-import/10-case-study.mp4",
        durationMin: 21,
        sortOrder: 10,
        isPreview: false,
        transcriptRu:
          "Реальный кейс: как один из наших слушателей вышел на 100 000 PLN оборота за 6 месяцев, импортируя товары из Китая на Allegro.",
        transcriptPl:
          "Prawdziwy przypadek: jak jeden z naszych słuchaczy osiągnął 100 000 PLN obrotu w 6 miesięcy importując z Chin.",
        resourcesJson: [],
      },
    ],
  },

  // ── 4. Бизнес в Польше: JDG, налоги, ZUS ────────────────────────────────
  {
    slug: "business-in-poland-jdg-taxes-zus",
    titleRu: "Бизнес в Польше: JDG, налоги, ZUS",
    titlePl: "Biznes w Polsce: JDG, podatki, ZUS",
    titleUa: "Бізнес у Польщі: JDG, податки, ZUS",
    titleEn: "Business in Poland: JDG, Taxes and ZUS",
    descriptionRu:
      "Полное руководство по легализации бизнеса в Польше для иностранцев и поляков: регистрация JDG, выбор формы налогообложения, ZUS, бухгалтерия.",
    descriptionPl:
      "Kompletny przewodnik po legalizacji działalności w Polsce: rejestracja JDG, wybór formy opodatkowania, ZUS, księgowość.",
    descriptionUa:
      "Повний посібник з легалізації бізнесу в Польщі: реєстрація JDG, вибір форми оподаткування, ZUS, бухгалтерія.",
    descriptionEn:
      "A complete guide to legalizing business in Poland: JDG registration, tax form selection, ZUS contributions, and bookkeeping.",
    level: "beginner",
    category: "legal",
    thumbnailUrl: "https://cdn.ecompilot.pl/academy/thumbs/jdg-taxes.jpg",
    totalDurationMin: 154,
    lessonCount: 7,
    isPublished: true,
    isFree: false,
    priceEur: "59.00",
    requiredPlan: "pro",
    sortOrder: 4,
    lessonData: [
      {
        titleRu: "JDG vs Sp. z o.o.: что выбрать для e-commerce",
        titlePl: "JDG vs Sp. z o.o.: co wybrać dla e-commerce",
        titleUa: "JDG vs Sp. z o.o.: що вибрати для e-commerce",
        titleEn: "JDG vs Sp. z o.o.: Which to Choose for E-Commerce",
        videoUrl: "videos/jdg-taxes/01-jdg-vs-spzoo.mp4",
        durationMin: 22,
        sortOrder: 1,
        isPreview: true,
        transcriptRu:
          "Сравниваем единоличное предпринимательство (JDG) и ООО (Sp. z o.o.) с точки зрения налогов, ZUS, ответственности и сложности администрирования для интернет-торговли.",
        transcriptPl:
          "Porównujemy JDG i Sp. z o.o. pod kątem podatków, ZUS, odpowiedzialności i złożoności administracyjnej dla e-commerce.",
        resourcesJson: [
          { title: "Сравнение форм бизнеса в Польше", url: "https://cdn.ecompilot.pl/academy/resources/business-forms-comparison.pdf", type: "pdf" },
        ],
      },
      {
        titleRu: "Регистрация JDG через CEIDG: пошагово за 15 минут",
        titlePl: "Rejestracja JDG przez CEIDG: krok po kroku w 15 minut",
        titleUa: "Реєстрація JDG через CEIDG: покроково за 15 хвилин",
        titleEn: "JDG Registration via CEIDG: Step by Step in 15 Minutes",
        videoUrl: "videos/jdg-taxes/02-ceidg-registration.mp4",
        durationMin: 18,
        sortOrder: 2,
        isPreview: false,
        transcriptRu:
          "Онлайн-регистрация JDG через портал CEIDG: выбор кодов PKD для e-commerce, дата начала деятельности, привязка к ZUS и US.",
        transcriptPl:
          "Rejestracja JDG online przez portal CEIDG: wybór kodów PKD dla e-commerce, data rozpoczęcia działalności.",
        resourcesJson: [],
      },
      {
        titleRu: "Формы налогообложения: Zasady ogólne, Liniowy, Ryczałt",
        titlePl: "Formy opodatkowania: zasady ogólne, liniowy, ryczałt",
        titleUa: "Форми оподаткування: загальні засади, лінійний, ричалт",
        titleEn: "Tax Forms: General Rules, Flat Rate, and Lump Sum",
        videoUrl: "videos/jdg-taxes/03-tax-forms.mp4",
        durationMin: 28,
        sortOrder: 3,
        isPreview: false,
        transcriptRu:
          "Детальное сравнение трёх форм налогообложения для e-commerce продавцов. Рычалт 3% для handlu — когда выгоден, а когда нет. Расчёты на реальных примерах.",
        transcriptPl:
          "Szczegółowe porównanie trzech form opodatkowania dla sprzedawców e-commerce. Ryczałt 3% dla handlu — kiedy się opłaca.",
        resourcesJson: [
          { title: "Калькулятор налоговых форм", url: "https://cdn.ecompilot.pl/academy/resources/tax-form-calculator.xlsx", type: "xlsx" },
        ],
      },
      {
        titleRu: "ZUS: взносы, льготы и Mały ZUS Plus",
        titlePl: "ZUS: składki, ulgi i Mały ZUS Plus",
        titleUa: "ZUS: внески, пільги та Mały ZUS Plus",
        titleEn: "ZUS: Contributions, Reliefs and Mały ZUS Plus",
        videoUrl: "videos/jdg-taxes/04-zus.mp4",
        durationMin: 24,
        sortOrder: 4,
        isPreview: false,
        transcriptRu:
          "Структура взносов ZUS, льгота на старт (Ulga na start), преференциальные взносы, Mały ZUS Plus. Реальные суммы на 2025 год.",
        transcriptPl:
          "Struktura składek ZUS, Ulga na start, składki preferencyjne, Mały ZUS Plus. Rzeczywiste kwoty na 2025 rok.",
        resourcesJson: [
          { title: "Таблица взносов ZUS 2025", url: "https://cdn.ecompilot.pl/academy/resources/zus-2025-table.pdf", type: "pdf" },
        ],
      },
      {
        titleRu: "НДС для продавца Allegro: когда регистрироваться",
        titlePl: "VAT dla sprzedawcy Allegro: kiedy się zarejestrować",
        titleUa: "ПДВ для продавця Allegro: коли реєструватись",
        titleEn: "VAT for Allegro Sellers: When to Register",
        videoUrl: "videos/jdg-taxes/05-vat.mp4",
        durationMin: 26,
        sortOrder: 5,
        isPreview: false,
        transcriptRu:
          "Порог регистрации НДС 200 000 PLN, добровольная регистрация, OSS для трансграничных продаж в ЕС, возврат НДС с товаров.",
        transcriptPl:
          "Próg rejestracji VAT 200 000 PLN, dobrowolna rejestracja, OSS dla sprzedaży transgranicznej w UE.",
        resourcesJson: [],
      },
      {
        titleRu: "Бухгалтерия для предпринимателя: KPiR и ewidencja ryczałtu",
        titlePl: "Księgowość dla przedsiębiorcy: KPiR i ewidencja ryczałtu",
        titleUa: "Бухгалтерія для підприємця: KPiR та ewidencja ryczałtu",
        titleEn: "Bookkeeping for Entrepreneurs: KPiR and Ryczałt Records",
        videoUrl: "videos/jdg-taxes/06-bookkeeping.mp4",
        durationMin: 20,
        sortOrder: 6,
        isPreview: false,
        transcriptRu:
          "КПиР и реестр доходов при рычалте: что записывать, документы, программы для самостоятельного учёта (ifirma, wFirma, inFakt).",
        transcriptPl:
          "KPiR i ewidencja ryczałtu: co zapisywać, dokumenty, programy do samodzielnej księgowości (ifirma, wFirma, inFakt).",
        resourcesJson: [],
      },
      {
        titleRu: "Иностранец в Польше: открытие JDG по карте побыту",
        titlePl: "Cudzoziemiec w Polsce: JDG na podstawie karty pobytu",
        titleUa: "Іноземець у Польщі: відкриття JDG за картою побуту",
        titleEn: "Foreigner in Poland: Opening a JDG with a Residence Card",
        videoUrl: "videos/jdg-taxes/07-foreigner-jdg.mp4",
        durationMin: 16,
        sortOrder: 7,
        isPreview: false,
        transcriptRu:
          "Особенности регистрации бизнеса для иностранных граждан: карта стałего pobыту, karta czasowego pobytu, PESEL, доступ к CEIDG и eDeklaracje.",
        transcriptPl:
          "Specyfika rejestracji działalności dla obcokrajowców: karta stałego i czasowego pobytu, PESEL, dostęp do CEIDG.",
        resourcesJson: [
          { title: "Чеклист для иностранца", url: "https://cdn.ecompilot.pl/academy/resources/foreigner-checklist.pdf", type: "pdf" },
        ],
      },
    ],
  },

  // ── 5. Дропшиппинг 2025 ──────────────────────────────────────────────────
  {
    slug: "dropshipping-2025-does-it-work",
    titleRu: "Дропшиппинг 2025: работает или нет?",
    titlePl: "Dropshipping 2025: czy to wciąż działa?",
    titleUa: "Дропшиппінг 2025: працює чи ні?",
    titleEn: "Dropshipping 2025: Does It Still Work?",
    descriptionRu:
      "Честный разбор дропшиппинга в 2025 году: реальные цифры, рабочие ниши, польские и европейские поставщики, настройка автоматизации.",
    descriptionPl:
      "Uczciwa analiza dropshippingu w 2025 roku: realne liczby, działające nisze, polscy i europejscy dostawcy, automatyzacja.",
    descriptionUa:
      "Чесний розбір дропшипінгу в 2025 році: реальні цифри, робочі ніші, польські та європейські постачальники.",
    descriptionEn:
      "An honest breakdown of dropshipping in 2025: real numbers, working niches, Polish and European suppliers, and automation setup.",
    level: "beginner",
    category: "dropship",
    thumbnailUrl: "https://cdn.ecompilot.pl/academy/thumbs/dropshipping.jpg",
    totalDurationMin: 95,
    lessonCount: 5,
    isPublished: true,
    isFree: false,
    priceEur: "39.00",
    requiredPlan: "pro",
    sortOrder: 5,
    lessonData: [
      {
        titleRu: "Дропшиппинг в 2025: мифы vs реальность",
        titlePl: "Dropshipping w 2025: mity vs rzeczywistość",
        titleUa: "Дропшипінг у 2025: міфи vs реальність",
        titleEn: "Dropshipping in 2025: Myths vs Reality",
        videoUrl: "videos/dropshipping-2025/01-myths-reality.mp4",
        durationMin: 17,
        sortOrder: 1,
        isPreview: true,
        transcriptRu:
          "Честно о дропшиппинге: почему 90% начинающих терпят неудачу, какова реальная маржинальность, и какие ниши работают на польском рынке в 2025 году.",
        transcriptPl:
          "Uczciwie o dropshippingu: dlaczego 90% początkujących ponosi porażkę, jaka jest realna marżowość i które nisze działają na polskim rynku.",
        resourcesJson: [],
      },
      {
        titleRu: "Польские и европейские поставщики для дропшиппинга",
        titlePl: "Polscy i europejscy dostawcy dropshippingowi",
        titleUa: "Польські та європейські постачальники для дропшипінгу",
        titleEn: "Polish and European Dropshipping Suppliers",
        videoUrl: "videos/dropshipping-2025/02-suppliers.mp4",
        durationMin: 21,
        sortOrder: 2,
        isPreview: false,
        transcriptRu:
          "Топ-15 польских и европейских дропшиппинг-поставщиков с быстрой доставкой: hurtownie, Droplo, Syncee, BigBuy. Критерии отбора и подводные камни.",
        transcriptPl:
          "Top 15 polskich i europejskich dostawców dropshippingowych z szybką dostawką: hurtownie, Droplo, Syncee, BigBuy.",
        resourcesJson: [
          { title: "Список топ-15 поставщиков", url: "https://cdn.ecompilot.pl/academy/resources/dropship-suppliers-list.pdf", type: "pdf" },
        ],
      },
      {
        titleRu: "Выбор ниши: инструменты исследования на 2025 год",
        titlePl: "Wybór niszy: narzędzia badania rynku na 2025 rok",
        titleUa: "Вибір ніші: інструменти дослідження на 2025 рік",
        titleEn: "Niche Selection: Market Research Tools for 2025",
        videoUrl: "videos/dropshipping-2025/03-niche-research.mp4",
        durationMin: 20,
        sortOrder: 3,
        isPreview: false,
        transcriptRu:
          "Методология поиска прибыльных ниш: Allegro Trendy, Google Trends, EcomPilot Analytics. Критерии: конкуренция, маржа, сезонность, возможность масштабирования.",
        transcriptPl:
          "Metodologia wyszukiwania dochodowych nisz: Allegro Trendy, Google Trends, EcomPilot Analytics. Kryteria: konkurencja, marża, sezonowość.",
        resourcesJson: [],
      },
      {
        titleRu: "Автоматизация дропшиппинга: BaseLinker, Droplo, API",
        titlePl: "Automatyzacja dropshippingu: BaseLinker, Droplo, API",
        titleUa: "Автоматизація дропшипінгу: BaseLinker, Droplo, API",
        titleEn: "Dropshipping Automation: BaseLinker, Droplo, API",
        videoUrl: "videos/dropshipping-2025/04-automation.mp4",
        durationMin: 24,
        sortOrder: 4,
        isPreview: false,
        transcriptRu:
          "Как автоматизировать дропшиппинг: синхронизация остатков через BaseLinker, автоматические заказы у поставщика, отслеживание трекингов. ROI автоматизации.",
        transcriptPl:
          "Jak zautomatyzować dropshipping: synchronizacja stanów przez BaseLinker, automatyczne zamówienia u dostawcy, śledzenie przesyłek.",
        resourcesJson: [
          { title: "Схема автоматизации BaseLinker", url: "https://cdn.ecompilot.pl/academy/resources/baselinker-automation.pdf", type: "pdf" },
        ],
      },
      {
        titleRu: "Масштабирование: от 1 до 1000 SKU без хаоса",
        titlePl: "Skalowanie: od 1 do 1000 SKU bez chaosu",
        titleUa: "Масштабування: від 1 до 1000 SKU без хаосу",
        titleEn: "Scaling: From 1 to 1,000 SKUs Without Chaos",
        videoUrl: "videos/dropshipping-2025/05-scaling.mp4",
        durationMin: 13,
        sortOrder: 5,
        isPreview: false,
        transcriptRu:
          "Операционные процессы при масштабировании дропшиппинга: управление каталогом, работа с рекламациями, SLA с поставщиками, найм первого сотрудника.",
        transcriptPl:
          "Procesy operacyjne przy skalowaniu dropshippingu: zarządzanie katalogiem, reklamacje, SLA z dostawcami, zatrudnienie pierwszego pracownika.",
        resourcesJson: [],
      },
    ],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Seed runner
// ─────────────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  for (const courseData of COURSE_DATA) {
    const { lessonData, ...courseFields } = courseData;

    // Upsert course by slug
    const existing = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.slug, courseFields.slug))
      .limit(1);

    let courseId: string;

    if (existing.length > 0 && existing[0] !== undefined) {
      courseId = existing[0].id;
    } else {
      const [inserted] = await db
        .insert(courses)
        .values(courseFields)
        .returning({ id: courses.id });

      if (!inserted) {
        throw new Error(`Failed to insert course: ${courseFields.slug}`);
      }

      courseId = inserted.id;
    }

    // Insert lessons (skip if already exist for this course to allow idempotent rerun)
    const existingLessons = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .limit(1);

    if (existingLessons.length === 0) {
      const lessonInserts: NewLesson[] = lessonData.map((l) => ({
        ...l,
        courseId,
        transcriptRu: l.transcriptRu ?? null,
        transcriptPl: l.transcriptPl ?? null,
        resourcesJson: (l.resourcesJson?.length ?? 0) > 0 ? (l.resourcesJson ?? null) : null,
      }));

      await db.insert(lessons).values(lessonInserts);
    }
  }

  await pool.end();
}

seed().catch((err: unknown) => {
  process.stderr.write(
    `[seed] Failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
