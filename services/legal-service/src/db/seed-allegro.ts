// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — legal-service / db / seed-allegro
// Allegro strategy topics seed
// Run with: npx tsx services/legal-service/src/db/seed-allegro.ts
// ─────────────────────────────────────────────────────────────────────────────

import { sql } from "drizzle-orm";
import { closeDb, getDb } from "./client.js";
import { legalTopics, type FaqEntry, type NewLegalTopic } from "./schema.js";

function write(msg: string): void {
  process.stdout.write(msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// Topics data
// ─────────────────────────────────────────────────────────────────────────────

const topics: NewLegalTopic[] = [
  // ── 1. allegro-smart-status (sortOrder 40) ───────────────────────────────
  {
    slug: "allegro-smart-status",
    titleRu: "Статус Allegro Smart! — требования и преимущества",
    titlePl: "Status Allegro Smart! — wymagania i korzyści",
    titleUa: "Статус Allegro Smart! — вимоги та переваги",
    titleEn: "Allegro Smart! Status — Requirements and Benefits",
    contentRu: `## Статус Allegro Smart!

Allegro Smart! — программа лояльности для покупателей, предоставляющая бесплатную доставку и возврат. Для продавцов участие в программе означает значительное увеличение видимости и продаж.

### Требования к продавцу

Чтобы ваши товары отображались со значком Smart!, необходимо соответствовать строгим критериям качества:

- **Рейтинг не ниже 97%** положительных оценок за последние 12 месяцев
- **Время обработки заказа до 48 часов** — от момента оплаты до отправки
- Подключение к программе Allegro Smart! через панель продавца
- Использование поддерживаемых курьерских служб (InPost, DPD, DHL, GLS, Orlen Paczka)

### Преимущества статуса Smart!

Участие в программе даёт продавцу конкурентные преимущества:

**Приоритет в поисковой выдаче** — товары со значком Smart! показываются выше в результатах поиска. Алгоритм Allegro учитывает наличие бесплатной доставки как положительный ранжирующий фактор.

**Значок доверия** — синий логотип Smart! на листинге повышает конверсию на 15–25% по данным Allegro.

**Доступ к аудитории подписчиков** — более 4 миллионов активных подписчиков Smart! фильтруют выдачу по наличию значка, исключая товары без него.

**Бесплатный возврат** — продавец обязан обеспечить бесплатный возврат в течение 30 дней, что снижает барьер для покупки.

### Поддержание статуса

Статус не является постоянным — Allegro проводит ежемесячную проверку. Для удержания статуса:

1. Отслеживайте метрику «Удовлетворённость покупателей» в панели продавца
2. Реагируйте на отрицательные оценки — оспаривайте необоснованные через службу поддержки
3. Настройте автоматическое подтверждение отправки через интеграцию с курьером
4. Используйте складское хранение Allegro One Fulfillment для гарантированного соблюдения сроков

### Восстановление статуса

При временной потере статуса из-за снижения рейтинга — сосредоточьтесь на работе с негативными отзывами. Allegro позволяет оспорить отзывы, нарушающие правила платформы. Целевой показатель — возврат к 97%+ в течение 60 дней.`,
    contentPl: `## Status Allegro Smart!

Allegro Smart! to program lojalnościowy oferujący darmową dostawę i zwroty. Dla sprzedawców oznacza wyższą widoczność i większą sprzedaż.

### Wymagania

- **Ocena sprzedawcy co najmniej 97%** w ciągu ostatnich 12 miesięcy
- **Czas wysyłki do 48 godzin** od momentu opłacenia zamówienia
- Aktywacja w panelu sprzedawcy
- Współpraca z obsługiwanymi kurierami (InPost, DPD, DHL, GLS, Orlen Paczka)

### Korzyści

Znaczek Smart! zwiększa konwersję o 15–25% i zapewnia priorytet w wynikach wyszukiwania. Ponad 4 miliony subskrybentów filtruje oferty po tym znaczku.

### Utrzymanie statusu

Monitoruj wskaźnik satysfakcji klientów, odpowiadaj na negatywne oceny i rozważ Allegro One Fulfillment dla gwarantowanych terminów wysyłki. Status jest weryfikowany co miesiąc.`,
    contentUa: `## Статус Allegro Smart!

Allegro Smart! — програма лояльності з безкоштовною доставкою та поверненнями. Участь підвищує видимість і продажі.

### Вимоги

- **Рейтинг не нижче 97%** за останні 12 місяців
- **Час обробки замовлення до 48 годин**
- Підключення через панель продавця
- Підтримувані кур'єрські служби: InPost, DPD, DHL, GLS

### Переваги

Значок Smart! підвищує конверсію на 15–25%, забезпечує пріоритет у пошуку. Понад 4 мільйони підписників фільтрують пропозиції за наявністю значка.

### Підтримка статусу

Щомісячна перевірка Allegro. Відстежуйте показники, оскаржуйте необгрунтовані відгуки, розгляньте Allegro One Fulfillment.`,
    contentEn: `## Allegro Smart! Status

Allegro Smart! is a loyalty program offering free shipping and returns. For sellers it means higher visibility and sales uplift.

### Requirements

- **Seller rating of at least 97%** over the past 12 months
- **Dispatch within 48 hours** of payment
- Enrollment via seller panel
- Supported carriers: InPost, DPD, DHL, GLS, Orlen Paczka

### Benefits

The Smart! badge increases conversion by 15–25% and boosts search ranking. Over 4 million subscribers filter listings by this badge.

### Maintaining Status

Allegro reviews status monthly. Monitor satisfaction metrics, dispute unjustified negative reviews, and consider Allegro One Fulfillment for guaranteed dispatch times.`,
    faqRu: [
      {
        q: "Что произойдёт, если рейтинг упадёт ниже 97%?",
        a: "Статус Smart! будет приостановлен до следующей ежемесячной проверки. Значок исчезнет с листингов, что снизит их видимость. Для восстановления необходимо улучшить показатели и дождаться следующего цикла проверки.",
      },
      {
        q: "Можно ли участвовать в Smart! без собственного склада?",
        a: "Да. Allegro One Fulfillment позволяет хранить товары на складе платформы — она берёт на себя упаковку и отправку, автоматически обеспечивая соответствие требованиям Smart! по срокам.",
      },
    ] satisfies FaqEntry[],
    faqPl: [
      {
        q: "Co się stanie, gdy ocena spadnie poniżej 97%?",
        a: "Status Smart! zostanie zawieszony do następnej miesięcznej weryfikacji. Znaczek zniknie z ofert. Aby odzyskać status, popraw wskaźniki i poczekaj na kolejny cykl.",
      },
      {
        q: "Czy można uczestniczyć w Smart! bez własnego magazynu?",
        a: "Tak. Allegro One Fulfillment przechowuje towary i realizuje wysyłkę, automatycznie zapewniając zgodność z wymaganiami Smart! dotyczącymi czasu wysyłki.",
      },
    ] satisfies FaqEntry[],
    faqUa: [
      {
        q: "Що станеться, якщо рейтинг впаде нижче 97%?",
        a: "Статус Smart! буде призупинено до наступної щомісячної перевірки. Значок зникне з лістингів. Поліпшіть показники та дочекайтесь наступного циклу.",
      },
      {
        q: "Чи можна брати участь у Smart! без власного складу?",
        a: "Так. Allegro One Fulfillment зберігає товари та відправляє замовлення, автоматично дотримуючись вимог Smart! щодо термінів.",
      },
    ] satisfies FaqEntry[],
    faqEn: [
      {
        q: "What happens if the rating drops below 97%?",
        a: "Smart! status is suspended until the next monthly review. The badge disappears from listings. Improve your metrics and wait for the next review cycle.",
      },
      {
        q: "Can I join Smart! without my own warehouse?",
        a: "Yes. Allegro One Fulfillment stores your products and handles dispatch, automatically meeting the Smart! shipping time requirements.",
      },
    ] satisfies FaqEntry[],
    category: "registration",
    tags: ["allegro", "smart", "rating", "shipping", "badge", "visibility"],
    sortOrder: 40,
    isPublished: true,
  },

  // ── 2. allegro-ranking-algorithm (sortOrder 41) ──────────────────────────
  {
    slug: "allegro-ranking-algorithm",
    titleRu: "Алгоритм ранжирования Allegro — факторы и оптимизация",
    titlePl: "Algorytm rankingowy Allegro — czynniki i optymalizacja",
    titleUa: "Алгоритм ранжування Allegro — фактори та оптимізація",
    titleEn: "Allegro Ranking Algorithm — Factors and Optimization",
    contentRu: `## Алгоритм ранжирования Allegro

Алгоритм поиска Allegro определяет порядок отображения товаров в результатах и напрямую влияет на органические продажи. Понимание факторов ранжирования позволяет значительно увеличить видимость без рекламного бюджета.

### Основные факторы ранжирования

**1. Скорость продаж (Sales Velocity)**
Количество продаж за последние 30 дней — важнейший сигнал релевантности. Алгоритм интерпретирует высокие продажи как подтверждение качества товара и показывает его чаще.

**2. Конверсия (CTR и CVR)**
Отношение кликов к показам (CTR) и покупок к кликам (CVR). Листинг с высокой конверсией получает приоритет как более релевантный запросу.

**3. Процент возвратов**
Возвраты свыше 3% негативно влияют на позиции. Allegro расценивает высокий процент возвратов как признак несоответствия описания товара реальности.

**4. Ценовая конкурентоспособность**
Алгоритм сравнивает цену товара со средней по категории. Цена в диапазоне ±15% от медианы является оптимальной.

**5. Полнота листинга**
Заполненность параметров, количество фотографий, качество заголовка и описания. Allegro присваивает листингу «score» от 0 до 100.

**6. Рейтинг продавца и статус Smart!**
Продавцы с высоким рейтингом и статусом Smart! получают бонус к позициям.

### Стратегия оптимизации

**Работа с заголовком** — включите ключевые слова, по которым покупатели действительно ищут. Используйте инструмент «Analityka Allegro» для анализа поисковых запросов в вашей категории.

**Ускорение старта** — новые листинги получают временный буст видимости. Используйте этот период для генерации первых продаж через акции или снижение цены.

**A/B тестирование** — Allegro позволяет тестировать заголовки и фотографии. Регулярно обновляйте главное фото, сравнивая CTR.

**Управление отзывами** — активно запрашивайте отзывы через инструмент «Poproś o opinię» после успешной доставки. Цель — 10+ отзывов на товар.

### Сезонные корректировки

Алгоритм учитывает сезонность. В периоды высокого спроса (Black Friday, Рождество) усиливайте рекламу для захвата позиций, которые затем удерживаются органически.`,
    contentPl: `## Algorytm rankingowy Allegro

Algorytm wyszukiwania Allegro decyduje o kolejności wyświetlania ofert. Zrozumienie czynników rankingowych pozwala znacząco zwiększyć widoczność organiczną.

### Kluczowe czynniki

- **Prędkość sprzedaży** — liczba transakcji w ciągu 30 dni
- **Konwersja** — CTR i CVR oferty
- **Wskaźnik zwrotów** — poniżej 3% jest optymalne
- **Konkurencyjność cenowa** — w granicach ±15% mediany kategorii
- **Kompletność oferty** — parametry, zdjęcia, tytuł, opis

### Strategia optymalizacji

Używaj Analityki Allegro do badania fraz kluczowych. Nowe oferty mają tymczasowy boost — generuj pierwsze sprzedaże przez promocje. Regularnie testuj zdjęcia i tytuły. Zbieraj opinie przez narzędzie „Poproś o opinię".`,
    contentUa: `## Алгоритм ранжування Allegro

Алгоритм пошуку визначає порядок відображення товарів. Розуміння факторів ранжування збільшує органічну видимість.

### Ключові фактори

- **Швидкість продажів** — кількість угод за 30 днів
- **Конверсія** — CTR та CVR лістингу
- **Відсоток повернень** — оптимально нижче 3%
- **Цінова конкурентоспроможність** — в межах ±15% медіани категорії
- **Повнота лістингу** — параметри, фото, заголовок, опис

### Стратегія оптимізації

Використовуйте Analityka Allegro для дослідження ключових слів. Нові лістинги мають тимчасовий буст — генеруйте перші продажі через акції. Збирайте відгуки через «Poproś o opinię».`,
    contentEn: `## Allegro Ranking Algorithm

Allegro's search algorithm determines listing order in results. Understanding its factors enables significant organic visibility gains.

### Key Factors

- **Sales velocity** — number of transactions in the last 30 days
- **Conversion** — CTR and CVR of the listing
- **Return rate** — below 3% is optimal
- **Price competitiveness** — within ±15% of category median
- **Listing completeness** — parameters, photos, title, description

### Optimization Strategy

Use Allegro Analytics to research keywords. New listings get a temporary visibility boost — drive early sales via promotions. Test photos and titles regularly. Collect reviews using the "Poproś o opinię" tool.`,
    faqRu: [
      {
        q: "Как быстро изменения в листинге влияют на позиции?",
        a: "Обычно алгоритм переиндексирует листинг в течение 24–48 часов. Изменения в заголовке и параметрах отражаются быстрее, чем накопленные поведенческие метрики (продажи, конверсия).",
      },
      {
        q: "Влияет ли реклама Allegro Ads на органические позиции?",
        a: "Косвенно — да. Реклама увеличивает продажи и CTR, что улучшает поведенческие сигналы и повышает органические позиции в долгосрочной перспективе.",
      },
    ] satisfies FaqEntry[],
    faqPl: [
      {
        q: "Jak szybko zmiany w ofercie wpływają na pozycje?",
        a: "Algorytm reindeksuje ofertę w ciągu 24–48 godzin. Zmiany w tytule i parametrach działają szybciej niż skumulowane sygnały behawioralne.",
      },
      {
        q: "Czy reklama Allegro Ads wpływa na pozycje organiczne?",
        a: "Pośrednio tak. Reklama zwiększa sprzedaż i CTR, co poprawia sygnały behawioralne i długoterminowo podnosi pozycje organiczne.",
      },
    ] satisfies FaqEntry[],
    faqUa: [
      {
        q: "Як швидко зміни в лістингу впливають на позиції?",
        a: "Алгоритм переіндексує лістинг протягом 24–48 годин. Зміни в заголовку та параметрах діють швидше, ніж накопичені поведінкові сигнали.",
      },
      {
        q: "Чи впливає реклама Allegro Ads на органічні позиції?",
        a: "Опосередковано так. Реклама збільшує продажі та CTR, покращуючи поведінкові сигнали та підвищуючи органічні позиції.",
      },
    ] satisfies FaqEntry[],
    faqEn: [
      {
        q: "How quickly do listing changes affect rankings?",
        a: "The algorithm re-indexes a listing within 24–48 hours. Title and parameter changes take effect faster than accumulated behavioral metrics.",
      },
      {
        q: "Does Allegro Ads advertising affect organic rankings?",
        a: "Indirectly yes. Ads increase sales and CTR, improving behavioral signals and boosting organic positions over time.",
      },
    ] satisfies FaqEntry[],
    category: "registration",
    tags: ["allegro", "ranking", "algorithm", "seo", "conversion", "optimization"],
    sortOrder: 41,
    isPublished: true,
  },

  // ── 3. allegro-ads-optimization (sortOrder 42) ───────────────────────────
  {
    slug: "allegro-ads-optimization",
    titleRu: "Оптимизация рекламы Allegro Ads — CPC, ACOS и бюджет",
    titlePl: "Optymalizacja Allegro Ads — CPC, ACOS i budżet",
    titleUa: "Оптимізація реклами Allegro Ads — CPC, ACOS та бюджет",
    titleEn: "Allegro Ads Optimization — CPC, ACOS and Budget",
    contentRu: `## Оптимизация рекламы Allegro Ads

Allegro Ads — система контекстной рекламы на основе аукциона CPC (cost-per-click). Грамотная настройка кампаний позволяет достичь рентабельности при минимальных затратах.

### Ключевые метрики

**ACOS (Advertising Cost of Sales)** — отношение рекламных расходов к рекламной выручке. Формула: ACOS = Расходы на рекламу / Выручка от рекламы × 100%.

Целевые значения ACOS по стратегиям:
- **Агрессивный рост** — до 30% (инвестиция в объём)
- **Балансирование** — 15–20% (рост + прибыльность)
- **Защита маржи** — до 10% (максимальная прибыль)

### Стратегии ставок CPC

**Автоматические ставки** — Allegro самостоятельно подбирает ставку для максимизации показов. Подходит для старта и сбора данных о конкурентной среде.

**Ручные ставки** — полный контроль над CPC для каждого листинга. Используйте после 2–4 недель автоматических кампаний, когда накоплено достаточно данных.

**Целевая рентабельность** — новая опция, позволяющая задать целевой ACOS. Allegro автоматически корректирует ставки.

### Распределение бюджета

Рекомендуемое распределение рекламного бюджета:
- 60% — на топовые товары (20% ассортимента, дающие 80% продаж)
- 25% — на товары с высоким потенциалом (хорошая конверсия, низкие продажи)
- 15% — на новые листинги (буст для старта)

### Сезонное управление бюджетом

Увеличивайте бюджет за 7–14 дней до сезонных пиков: Чёрная пятница (ноябрь), Рождество (декабрь), День матери (май). Алгоритм Allegro повышает конкуренцию за ставки в эти периоды.

### Анализ и оптимизация

Проводите еженедельный аудит кампаний:
1. Отключайте листинги с ACOS > 40% без улучшения за 2 недели
2. Увеличивайте ставки (+20%) для листингов с ACOS < 8% — есть потенциал роста
3. Тестируйте разные форматы: «Oferty promowane» vs «Reklamy graficzne»
4. Используйте ретаргетинг для покупателей, добавивших товар в избранное`,
    contentPl: `## Optymalizacja Allegro Ads

Allegro Ads to system reklamowy oparty na aukcji CPC. Właściwa konfiguracja kampanii pozwala osiągnąć rentowność przy minimalnych kosztach.

### Kluczowe metryki

**ACOS** = Wydatki reklamowe / Przychód z reklam × 100%. Cel: 15–20% dla równowagi wzrostu i zyskowności.

### Strategie stawek

- **Automatyczne stawki** — do zbierania danych na starcie
- **Ręczne stawki** — po 2–4 tygodniach automatycznych kampanii
- **Docelowa rentowność** — ustaw docelowy ACOS, Allegro dopasuje stawki

### Podział budżetu

60% na bestsellery, 25% na oferty z potencjałem, 15% na nowe oferty. Zwiększaj budżet 7–14 dni przed sezonowymi szczytami sprzedaży.`,
    contentUa: `## Оптимізація Allegro Ads

Allegro Ads — система реклами на основі аукціону CPC. Правильне налаштування забезпечує рентабельність при мінімальних витратах.

### Ключові метрики

**ACOS** = Витрати на рекламу / Дохід від реклами × 100%. Ціль: 15–20% для балансу зростання та прибутковості.

### Стратегії ставок

- **Автоматичні ставки** — для збору даних на старті
- **Ручні ставки** — після 2–4 тижнів автоматичних кампаній
- **Цільова рентабельність** — задайте цільовий ACOS, Allegro коригуватиме ставки

### Розподіл бюджету

60% на бестселери, 25% на товари з потенціалом, 15% на нові лістинги. Збільшуйте бюджет за 7–14 днів до сезонних піків.`,
    contentEn: `## Allegro Ads Optimization

Allegro Ads is a CPC auction-based advertising system. Proper campaign configuration achieves profitability at minimal cost.

### Key Metrics

**ACOS** = Ad Spend / Ad Revenue × 100%. Target: 15–20% for growth-profitability balance.

### Bidding Strategies

- **Automatic bids** — for data collection at launch
- **Manual bids** — after 2–4 weeks of automatic campaigns
- **Target ROAS** — set a target ACOS and let Allegro adjust bids automatically

### Budget Allocation

60% on top sellers, 25% on high-potential listings, 15% on new listings. Increase budget 7–14 days before seasonal peaks.`,
    faqRu: [
      {
        q: "Какой минимальный бюджет нужен для Allegro Ads?",
        a: "Технически минимума нет, но для получения статистически значимых данных рекомендуется от 500 PLN/месяц на категорию. При меньшем бюджете данных недостаточно для оптимизации.",
      },
      {
        q: "Как снизить ACOS, не уменьшая продажи?",
        a: "Сосредоточьтесь на товарах с высокой конверсией — повысьте на них ставки. Снизьте или отключите ставки на товары с низкой конверсией. Улучшите листинг (фото, описание) перед повышением ставок.",
      },
    ] satisfies FaqEntry[],
    faqPl: [
      {
        q: "Jaki minimalny budżet jest potrzebny dla Allegro Ads?",
        a: "Technicznie brak minimum, ale dla uzyskania znaczących statystyk zaleca się co najmniej 500 PLN/miesiąc na kategorię.",
      },
      {
        q: "Jak obniżyć ACOS bez zmniejszania sprzedaży?",
        a: "Skup się na ofertach z wysoką konwersją — zwiększ na nich stawki. Obniż lub wyłącz stawki dla ofert z niską konwersją. Popraw oferty przed zwiększeniem stawek.",
      },
    ] satisfies FaqEntry[],
    faqUa: [
      {
        q: "Який мінімальний бюджет потрібен для Allegro Ads?",
        a: "Технічно мінімуму немає, але для значущої статистики рекомендується від 500 PLN/місяць на категорію.",
      },
      {
        q: "Як знизити ACOS, не зменшуючи продажі?",
        a: "Зосередьтесь на товарах з високою конверсією — підвищте на них ставки. Знизьте або вимкніть ставки для товарів з низькою конверсією.",
      },
    ] satisfies FaqEntry[],
    faqEn: [
      {
        q: "What is the minimum budget for Allegro Ads?",
        a: "Technically there is no minimum, but at least 500 PLN/month per category is recommended to gather statistically meaningful data.",
      },
      {
        q: "How do I lower ACOS without reducing sales?",
        a: "Focus on high-conversion listings — increase bids on those. Lower or pause bids on low-conversion listings. Improve listing quality before raising bids.",
      },
    ] satisfies FaqEntry[],
    category: "registration",
    tags: ["allegro", "ads", "cpc", "acos", "advertising", "budget", "optimization"],
    sortOrder: 42,
    isPublished: true,
  },

  // ── 4. allegro-bundle-strategy (sortOrder 43) ────────────────────────────
  {
    slug: "allegro-bundle-strategy",
    titleRu: "Стратегия комплектов на Allegro — Zestawy и КУП RAZEM",
    titlePl: "Strategia zestawów na Allegro — Zestawy i KUP RAZEM",
    titleUa: "Стратегія комплектів на Allegro — Zestawy та KUP RAZEM",
    titleEn: "Allegro Bundle Strategy — Zestawy and KUP RAZEM",
    contentRu: `## Стратегия комплектов на Allegro

Продажа комплектов (zestawów) — эффективный инструмент для увеличения среднего чека и улучшения ранжирования. Allegro предоставляет два встроенных механизма: «Zestawy» и «KUP RAZEM».

### Механизм Zestawy

«Zestawy» — возможность создать единый листинг, объединяющий несколько SKU в один комплект с единой ценой. Покупатель видит скомплектованный товар как единицу.

Преимущества:
- Более высокая маржа на комплект vs. отдельные товары
- Снижение конкуренции (меньше прямых аналогов)
- Один листинг = одна запись в поиске (меньше каннибализации)

### Механизм KUP RAZEM

«KUP RAZEM» — скидка при покупке нескольких единиц или сопутствующих товаров. Настраивается в панели продавца без создания нового листинга.

Типичные модели:
- Купи 2, получи скидку 10%
- Купи основной товар + аксессуар, получи скидку 15%
- Купи 3+, получи скидку 20%

### Ценообразование комплектов

Оптимальная скидка в комплекте — **15–20%** от суммарной цены отдельных позиций. Это психологический порог, при котором покупатель ощущает выгоду, а продавец сохраняет маржу.

Формула расчёта минимальной цены комплекта:
> Цена комплекта ≥ (Себестоимость товара 1 + Себестоимость товара 2) × (1 + целевая маржа)

### Подбор товаров для комплектов

Эффективные комбинации:
1. **Основной товар + расходник** (принтер + картриджи)
2. **Основной товар + аксессуар** (телефон + чехол + защитное стекло)
3. **Объёмная упаковка** (товар × 3 со скидкой)
4. **Сезонный комплект** (товары одной тематики)

### Влияние на алгоритм

Комплекты улучшают показатели ранжирования: более высокая средняя стоимость заказа снижает относительные затраты на доставку, что позволяет предложить более выгодные условия Smart!.`,
    contentPl: `## Strategia zestawów na Allegro

Sprzedaż zestawów zwiększa średnią wartość zamówienia i poprawia rankingi. Allegro oferuje dwa mechanizmy: «Zestawy» i «KUP RAZEM».

### Zestawy

Jeden listing łączący kilka SKU w jeden produkt z jedną ceną. Mniejsza konkurencja, wyższa marża na zestaw.

### KUP RAZEM

Rabat przy zakupie kilku sztuk lub produktów komplementarnych. Konfiguracja bez tworzenia nowego listingu.

### Ceny zestawów

Optymalna zniżka to **15–20%** sumy cen poszczególnych produktów. Kombinuj: produkt główny + akcesoria, produkt + materiały eksploatacyjne, opakowania zbiorcze.`,
    contentUa: `## Стратегія комплектів на Allegro

Продаж комплектів збільшує середній чек та покращує ранжування. Allegro пропонує два механізми: «Zestawy» та «KUP RAZEM».

### Zestawy

Один лістинг, що об'єднує кілька SKU в один продукт з єдиною ціною. Менша конкуренція, вища маржа.

### KUP RAZEM

Знижка при купівлі кількох одиниць або супутніх товарів. Налаштовується без створення нового лістингу.

### Ціноутворення

Оптимальна знижка — **15–20%** від суми цін окремих позицій. Комбінуйте: основний товар + аксесуари, товар + витратні матеріали, об'ємні упаковки.`,
    contentEn: `## Allegro Bundle Strategy

Selling bundles increases average order value and improves rankings. Allegro provides two mechanisms: «Zestawy» and «KUP RAZEM».

### Zestawy

A single listing combining multiple SKUs into one product with a single price. Less competition, higher bundle margin.

### KUP RAZEM

A discount when buying multiple units or complementary products. Configured without creating a new listing.

### Pricing

Optimal bundle discount is **15–20%** off the sum of individual prices. Combine: main product + accessories, product + consumables, multi-packs.`,
    faqRu: [
      {
        q: "Что лучше: Zestawy или KUP RAZEM?",
        a: "Zestawy подходят для стандартных комбинаций, которые покупаются вместе всегда (например, ноутбук + мышь). KUP RAZEM — для гибкого стимулирования допродаж без изменения основного каталога.",
      },
      {
        q: "Влияют ли комплекты на метрики Smart!?",
        a: "Косвенно да. Более высокая стоимость заказа при том же времени обработки улучшает экономику доставки и позволяет поддерживать конкурентную цену при сохранении маржи.",
      },
    ] satisfies FaqEntry[],
    faqPl: [
      {
        q: "Co lepsze: Zestawy czy KUP RAZEM?",
        a: "Zestawy sprawdzają się dla stałych kombinacji (np. laptop + mysz). KUP RAZEM to elastyczne narzędzie do upsellingu bez zmiany głównego katalogu.",
      },
      {
        q: "Czy zestawy wpływają na wskaźniki Smart!?",
        a: "Pośrednio tak. Wyższa wartość zamówienia poprawia ekonomikę wysyłki i pozwala utrzymać konkurencyjną cenę przy zachowaniu marży.",
      },
    ] satisfies FaqEntry[],
    faqUa: [
      {
        q: "Що краще: Zestawy чи KUP RAZEM?",
        a: "Zestawy підходять для постійних комбінацій (наприклад, ноутбук + миша). KUP RAZEM — гнучкий інструмент для апселінгу без зміни основного каталогу.",
      },
      {
        q: "Чи впливають комплекти на показники Smart!?",
        a: "Опосередковано так. Вища вартість замовлення покращує економіку доставки та дозволяє підтримувати конкурентну ціну при збереженні маржі.",
      },
    ] satisfies FaqEntry[],
    faqEn: [
      {
        q: "Which is better: Zestawy or KUP RAZEM?",
        a: "Zestawy suits fixed combinations always bought together (e.g. laptop + mouse). KUP RAZEM is a flexible upsell tool without changing the main catalogue.",
      },
      {
        q: "Do bundles affect Smart! metrics?",
        a: "Indirectly yes. Higher order value improves shipping economics and allows maintaining competitive pricing while preserving margin.",
      },
    ] satisfies FaqEntry[],
    category: "registration",
    tags: ["allegro", "bundle", "zestawy", "kup-razem", "upsell", "pricing"],
    sortOrder: 43,
    isPublished: true,
  },

  // ── 5. allegro-listing-checklist (sortOrder 44) ──────────────────────────
  {
    slug: "allegro-listing-checklist",
    titleRu: "Чеклист оптимизации листинга Allegro",
    titlePl: "Checklista optymalizacji oferty Allegro",
    titleUa: "Чекліст оптимізації лістингу Allegro",
    titleEn: "Allegro Listing Optimization Checklist",
    contentRu: `## Чеклист оптимизации листинга Allegro

Качество листинга напрямую влияет на ранжирование, конверсию и статус Smart!. Используйте этот чеклист для каждого нового или обновляемого листинга.

### 1. Заголовок (Tytuł)

Заголовок — главный фактор поисковой релевантности. Правила составления:

- **Длина**: 50–75 символов (оптимально для отображения на мобильных)
- **Структура**: [Бренд] + [Название товара] + [Ключевые характеристики] + [Модель/Размер]
- **Ключевые слова**: включите 2–3 поисковых запроса с наибольшим объёмом в категории
- **Запрещено**: CAPS LOCK, спецсимволы (!@#$), вводящие в заблуждение слова

Пример хорошего заголовка:
> Samsung Galaxy A55 5G 8/256GB Czarny Smartfon Nowy Gwarancja

### 2. Параметры (Parametry)

Заполненность параметров влияет на «score» листинга в Allegro. Цель — **100% обязательных параметров** и максимум дополнительных.

Критические параметры (влияют на фильтрацию):
- Бренд / Производитель
- Цвет, размер, материал (если применимо)
- EAN/GTIN (штрихкод товара)
- Состояние (Nowy / Używany)

### 3. Фотографии (Zdjęcia)

- **Главное фото**: белый фон, товар занимает 85%+ площади, разрешение 2000×2000px+
- **Количество**: минимум 6 фото, рекомендуется 9–12
- **Содержание**: детали, размеры, упаковка, товар в использовании
- **Запрещено**: водяные знаки, текст на фото, рамки

### 4. Описание (Opis)

- Используйте шаблон HTML Allegro для структурированного описания
- Включите секции: «О товаре», «Технические характеристики», «Что в комплекте», «Гарантия»
- Длина: 300–800 слов
- Добавьте ответы на 3–5 часто задаваемых вопросов

### 5. Ценообразование и доставка

- Проверьте конкурентов через встроенный инструмент сравнения цен
- Настройте Smart! доставку (бесплатно для покупателя)
- Предложите минимум 2 варианта доставки (InPost + курьер)
- Задайте реалистичное время обработки (≤ 24ч для листингов Smart!)

### 6. Финальная проверка

Перед публикацией убедитесь:
- [ ] Орфография и грамматика проверены
- [ ] Категория выбрана верно (влияет на аудиторию)
- [ ] Цена проверена на конкурентоспособность
- [ ] EAN указан корректно
- [ ] Smart! доставка активирована`,
    contentPl: `## Checklista optymalizacji oferty Allegro

Jakość oferty wpływa bezpośrednio na rankingi, konwersję i status Smart!.

### Tytuł
50–75 znaków. Struktura: [Marka] + [Nazwa] + [Cechy] + [Model]. Uwzględnij 2–3 słowa kluczowe z największym wolumenem w kategorii.

### Parametry
Cel: 100% wymaganych parametrów. Koniecznie: marka, kolor, rozmiar, EAN, stan.

### Zdjęcia
Min. 6 zdjęć (opt. 9–12). Białe tło, rozdzielczość 2000×2000px+. Brak znaków wodnych i tekstu.

### Opis
300–800 słów. Sekcje: o produkcie, specyfikacja, zawartość zestawu, gwarancja. Odpowiedz na 3–5 często zadawanych pytań.

### Cena i dostawa
Smart! dostawa aktywna. Min. 2 opcje dostawy. Czas realizacji ≤24h dla Smart!.`,
    contentUa: `## Чекліст оптимізації лістингу Allegro

Якість лістингу безпосередньо впливає на ранжування, конверсію та статус Smart!.

### Заголовок
50–75 символів. Структура: [Бренд] + [Назва] + [Характеристики] + [Модель]. Включіть 2–3 ключові слова.

### Параметри
Мета: 100% обов'язкових параметрів. Обов'язково: бренд, колір, розмір, EAN, стан.

### Фотографії
Мін. 6 фото (оптим. 9–12). Білий фон, роздільність 2000×2000px+. Без водяних знаків.

### Опис
300–800 слів. Секції: про товар, технічні характеристики, комплектація, гарантія.

### Ціна та доставка
Smart! доставка активна. Мін. 2 варіанти доставки. Час обробки ≤24год для Smart!.`,
    contentEn: `## Allegro Listing Optimization Checklist

Listing quality directly affects rankings, conversion, and Smart! status.

### Title
50–75 characters. Structure: [Brand] + [Name] + [Key Features] + [Model]. Include 2–3 high-volume keywords.

### Parameters
Target: 100% of required parameters. Must-have: brand, color, size, EAN, condition.

### Photos
Min. 6 photos (opt. 9–12). White background, 2000×2000px+ resolution. No watermarks or text.

### Description
300–800 words. Sections: about the product, specifications, box contents, warranty.

### Price and Shipping
Smart! shipping active. Min. 2 delivery options. Processing time ≤24h for Smart!.`,
    faqRu: [
      {
        q: "Как узнать, какие ключевые слова использовать в заголовке?",
        a: "Используйте раздел «Analityka» в панели продавца Allegro — он показывает объёмы поиска по фразам в вашей категории. Также анализируйте заголовки топ-листингов конкурентов с высокими продажами.",
      },
      {
        q: "Обязателен ли EAN для листинга?",
        a: "EAN не является обязательным полем, но его наличие критически важно для ранжирования: листинги с EAN участвуют в сводных карточках товара (Karta produktu) и получают трафик от покупателей, ищущих конкретный товар.",
      },
    ] satisfies FaqEntry[],
    faqPl: [
      {
        q: "Jak znaleźć słowa kluczowe do tytułu?",
        a: "Użyj sekcji «Analityka» w panelu sprzedawcy Allegro — pokazuje wolumeny wyszukiwania w Twojej kategorii. Analizuj też tytuły konkurentów z najwyższą sprzedażą.",
      },
      {
        q: "Czy EAN jest obowiązkowy?",
        a: "EAN nie jest wymagany, ale ma kluczowe znaczenie dla rankingu. Oferty z EAN uczestniczą w zbiorczych kartach produktu i przyciągają ruch od kupujących szukających konkretnego towaru.",
      },
    ] satisfies FaqEntry[],
    faqUa: [
      {
        q: "Як знайти ключові слова для заголовку?",
        a: "Використовуйте розділ «Analityka» в панелі продавця Allegro — він показує обсяги пошуку у вашій категорії. Аналізуйте також заголовки конкурентів з найвищими продажами.",
      },
      {
        q: "Чи обов'язковий EAN для лістингу?",
        a: "EAN не є обов'язковим, але критично важливий для ранжування. Лістинги з EAN беруть участь у зведених картках товару та отримують трафік від покупців, що шукають конкретний товар.",
      },
    ] satisfies FaqEntry[],
    faqEn: [
      {
        q: "How do I find the right keywords for the title?",
        a: "Use the «Analityka» section in the Allegro seller panel — it shows search volumes in your category. Also analyse titles of top-selling competitor listings.",
      },
      {
        q: "Is EAN required for a listing?",
        a: "EAN is not mandatory but critically important for ranking. Listings with EAN participate in aggregated product cards (Karta produktu) and receive traffic from buyers searching for a specific item.",
      },
    ] satisfies FaqEntry[],
    category: "registration",
    tags: ["allegro", "listing", "checklist", "title", "photos", "parameters", "seo"],
    sortOrder: 44,
    isPublished: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed runner
// ─────────────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const db = getDb();

  write("Seeding Allegro strategy topics...\n");

  for (const topic of topics) {
    await db
      .insert(legalTopics)
      .values(topic)
      .onConflictDoUpdate({
        target: legalTopics.slug,
        set: {
          titleRu: sql`excluded.title_ru`,
          titlePl: sql`excluded.title_pl`,
          titleUa: sql`excluded.title_ua`,
          titleEn: sql`excluded.title_en`,
          contentRu: sql`excluded.content_ru`,
          contentPl: sql`excluded.content_pl`,
          contentUa: sql`excluded.content_ua`,
          contentEn: sql`excluded.content_en`,
          faqRu: sql`excluded.faq_ru`,
          faqPl: sql`excluded.faq_pl`,
          faqUa: sql`excluded.faq_ua`,
          faqEn: sql`excluded.faq_en`,
          category: sql`excluded.category`,
          tags: sql`excluded.tags`,
          sortOrder: sql`excluded.sort_order`,
          isPublished: sql`excluded.is_published`,
          updatedAt: sql`now()`,
        },
      });

    write(`  [OK] ${topic.slug}\n`);
  }

  write(`\nDone. Inserted/updated ${topics.length} Allegro strategy topics.\n`);

  await closeDb();
}

seed().catch((err: unknown) => {
  process.stderr.write(`Seed failed: ${String(err)}\n`);
  process.exit(1);
});
