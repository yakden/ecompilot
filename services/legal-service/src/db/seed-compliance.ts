// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — legal-service / db / seed-compliance
// Compliance and review growth content in 4 languages
// Run with: npx tsx src/db/seed-compliance.ts
// ─────────────────────────────────────────────────────────────────────────────

import { sql } from "drizzle-orm";
import { closeDb, getDb } from "./client.js";
import { legalTopics, type FaqEntry, type NewLegalTopic } from "./schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function write(msg: string): void {
  process.stdout.write(msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// Topics data
// ─────────────────────────────────────────────────────────────────────────────

const topics: NewLegalTopic[] = [
  // ── 1. allegro-violations ─────────────────────────────────────────────────
  {
    slug: "allegro-violations",
    titleRu: "Нарушения и блокировки аккаунта на Allegro",
    titlePl: "Naruszenia regulaminu i blokady konta na Allegro",
    titleUa: "Порушення правил та блокування акаунту на Allegro",
    titleEn: "Allegro Account Violations and Suspensions",
    category: "compliance",
    tags: ["allegro", "violations", "suspension", "account", "compliance"],
    sortOrder: 100,
    contentRu: `## Нарушения и причины блокировки аккаунта на Allegro

Allegro — крупнейший польский маркетплейс — применяет строгую систему санкций за нарушение правил платформы. Понимание пороговых значений и причин блокировок позволяет продавцам предотвращать проблемы заблаговременно.

### Топ-5 причин блокировки аккаунта

#### 1. Продажа контрафактных товаров
Продажа поддельных брендовых товаров является наиболее частой причиной **немедленной необратимой блокировки**. Allegro использует алгоритмы сравнения изображений и партнёрские программы с правообладателями. Повторные нарушения по программе VeRO заблокируют аккаунт без предупреждения.

#### 2. Манипуляция отзывами
Allegro рассматривает попытки искусственного повышения рейтинга как критическое нарушение:
- Просьбы об отзывах в обмен на скидку или возврат средств
- Использование друзей/семьи для написания отзывов
- Покупка отзывов у специализированных сервисов
- Порог подозрения: **доля отзывов >10%** от общего числа транзакций — автоматическая проверка

#### 3. Ведение нескольких аккаунтов
Создание дублирующих аккаунтов для обхода ограничений или блокировок — нарушение правил. Allegro отслеживает IP-адреса, устройства, реквизиты платёжных систем и поведенческие паттерны.

#### 4. Высокий процент просроченных отправок
Пороговые значения метрики **Terminowość wysyłki** (своевременность отправки):
- **>5%** просроченных отправок — письменное предупреждение
- **>10%** в течение 30 дней — временное ограничение доступа к новым объявлениям
- **>15%** — приостановка аккаунта до устранения проблемы
- Стабильно >10% в течение 90 дней — риск постоянной блокировки

#### 5. Спам в сообщениях
Массовые рекламные рассылки покупателям через систему сообщений Allegro, включение номеров телефонов и ссылок на внешние сайты, давление на покупателей — все эти действия ведут к ограничению возможности отправки сообщений или блокировке.

### Дополнительные нарушения и пороги

| Метрика | Предупреждение | Ограничение | Блокировка |
|---------|----------------|-------------|------------|
| Просроченные отправки | >5% | >10% | >15% |
| Процент возвратов | >8% | >10% | >15% |
| Отрицательные отзывы | >3% | >5% | >10% |
| Время ответа покупателям | >48ч | >72ч | систематически |
| Нерешённые претензии | >3% | >5% | >8% |

### Что НЕ является нарушением (распространённые заблуждения)
- Просьба оставить отзыв без условий — **допустимо**
- Вложение благодарственной открытки в посылку — **допустимо** (без упоминания скидок за отзыв)
- Использование Smart! доставки — не влияет на метрики отправки
- Временно высокий возврат из-за брака партии — можно оспорить с доказательствами`,

    contentPl: `## Naruszenia regulaminu i przyczyny blokad konta na Allegro

Allegro stosuje rygorystyczny system sankcji za naruszenia regulaminu. Zrozumienie progów i przyczyn blokad pozwala sprzedawcom zapobiegać problemom z wyprzedzeniem.

### Top 5 przyczyn blokady konta

#### 1. Sprzedaż towarów podrobionych
Sprzedaż fałszywych produktów markowych to najczęstsza przyczyna **natychmiastowej, nieodwracalnej blokady**. Allegro używa algorytmów porównywania obrazów i programów partnerskich z właścicielami praw. Powtarzające się naruszenia w programie VeRO zablokują konto bez ostrzeżenia.

#### 2. Manipulacja opiniami
Allegro traktuje próby sztucznego zawyżania ocen jako krytyczne naruszenie:
- Prośby o opinie w zamian za zniżkę lub zwrot pieniędzy
- Korzystanie z rodziny/znajomych do pisania opinii
- Kupowanie opinii od wyspecjalizowanych serwisów
- Próg podejrzenia: **udział opinii >10%** wszystkich transakcji — automatyczna kontrola

#### 3. Prowadzenie wielu kont
Zakładanie duplikatów kont w celu obejścia ograniczeń lub blokad jest zakazane. Allegro śledzi adresy IP, urządzenia, dane systemów płatniczych i wzorce zachowań.

#### 4. Wysoki odsetek spóźnionych wysyłek
Progi wskaźnika **Terminowość wysyłki**:
- **>5%** spóźnionych wysyłek — pisemne ostrzeżenie
- **>10%** w ciągu 30 dni — tymczasowe ograniczenie dostępu do nowych ofert
- **>15%** — zawieszenie konta do czasu rozwiązania problemu
- Stale >10% przez 90 dni — ryzyko stałej blokady

#### 5. Spam w wiadomościach
Masowe wysyłanie reklam do kupujących przez system wiadomości Allegro, umieszczanie numerów telefonów i linków do zewnętrznych stron, wywieranie presji na kupujących — te działania prowadzą do ograniczenia możliwości wysyłania wiadomości lub blokady.

### Dodatkowe naruszenia i progi

| Wskaźnik | Ostrzeżenie | Ograniczenie | Blokada |
|----------|-------------|--------------|---------|
| Spóźnione wysyłki | >5% | >10% | >15% |
| Odsetek zwrotów | >8% | >10% | >15% |
| Negatywne opinie | >3% | >5% | >10% |
| Czas odpowiedzi | >48h | >72h | systematycznie |
| Nierozwiązane reklamacje | >3% | >5% | >8% |

### Co NIE jest naruszeniem (popularne nieporozumienia)
- Prośba o opinię bez warunków — **dopuszczalne**
- Dołączenie kartki z podziękowaniem do paczki — **dopuszczalne** (bez wzmianki o zniżkach za opinię)
- Korzystanie z dostawy Smart! — nie wpływa na wskaźniki wysyłki
- Tymczasowo wysoki zwrot z powodu wadliwej partii — można zakwestionować z dowodem`,

    contentUa: `## Порушення правил та причини блокування акаунту на Allegro

Allegro застосовує сувору систему санкцій за порушення правил платформи. Розуміння порогових значень і причин блокувань дозволяє продавцям запобігати проблемам заздалегідь.

### Топ-5 причин блокування акаунту

#### 1. Продаж контрафактних товарів
Продаж підроблених брендових товарів є найчастішою причиною **негайного незворотного блокування**. Allegro використовує алгоритми порівняння зображень та партнерські програми з правовласниками. Повторні порушення за програмою VeRO заблокують акаунт без попередження.

#### 2. Маніпуляція відгуками
Allegro розглядає спроби штучного підвищення рейтингу як критичне порушення:
- Прохання про відгуки в обмін на знижку або повернення коштів
- Використання друзів/родини для написання відгуків
- Купівля відгуків у спеціалізованих сервісів
- Порог підозри: **частка відгуків >10%** від загальної кількості транзакцій — автоматична перевірка

#### 3. Ведення кількох акаунтів
Створення дублюючих акаунтів для обходу обмежень або блокувань — порушення правил. Allegro відстежує IP-адреси, пристрої, реквізити платіжних систем та поведінкові патерни.

#### 4. Високий відсоток прострочених відправлень
Порогові значення метрики **Terminowość wysyłki** (своєчасність відправки):
- **>5%** прострочених відправлень — письмове попередження
- **>10%** протягом 30 днів — тимчасове обмеження доступу до нових оголошень
- **>15%** — призупинення акаунту до усунення проблеми
- Стабільно >10% протягом 90 днів — ризик постійного блокування

#### 5. Спам у повідомленнях
Масові рекламні розсилки покупцям через систему повідомлень Allegro, включення номерів телефонів і посилань на зовнішні сайти, тиск на покупців — всі ці дії призводять до обмеження можливості надсилання повідомлень або блокування.

### Що НЕ є порушенням (поширені помилки)
- Прохання залишити відгук без умов — **допустимо**
- Вкладання подячної листівки в посилку — **допустимо** (без згадки про знижки за відгук)
- Використання доставки Smart! — не впливає на метрики відправки`,

    contentEn: `## Allegro Account Violations and Suspension Guide

Allegro, Poland's largest marketplace, applies a strict sanctions system for Terms of Service violations. Understanding the thresholds and causes of suspensions helps sellers prevent problems proactively.

### Top 5 Reasons for Account Suspension

#### 1. Selling Counterfeit Goods
Selling fake branded products is the most frequent cause of **immediate, irreversible suspension**. Allegro uses image comparison algorithms and partner programs with rights holders. Repeated VeRO violations will block an account without warning.

#### 2. Review Manipulation
Allegro treats attempts to artificially inflate ratings as a critical violation:
- Requesting reviews in exchange for discounts or refunds
- Using friends/family to write reviews
- Buying reviews from specialized services
- Suspicion threshold: **review rate >10%** of total transactions triggers automatic investigation

#### 3. Operating Multiple Accounts
Creating duplicate accounts to circumvent restrictions or suspensions is prohibited. Allegro tracks IP addresses, devices, payment system credentials, and behavioral patterns.

#### 4. High Late Shipment Rate
Thresholds for the **Terminowość wysyłki** (shipment timeliness) metric:
- **>5%** late shipments — written warning
- **>10%** within 30 days — temporary restriction on new listings
- **>15%** — account suspension until resolved
- Consistently >10% over 90 days — risk of permanent suspension

#### 5. Message Spam
Mass promotional mailings to buyers via Allegro messaging, including phone numbers and links to external websites, pressuring buyers — all lead to messaging restriction or account suspension.

### Key Metrics and Thresholds

| Metric | Warning | Restriction | Suspension |
|--------|---------|-------------|------------|
| Late shipments | >5% | >10% | >15% |
| Return rate | >8% | >10% | >15% |
| Negative feedback | >3% | >5% | >10% |
| Response time | >48h | >72h | systematic |
| Unresolved claims | >3% | >5% | >8% |

### What Is NOT a Violation (Common Misconceptions)
- Asking for a review without conditions — **allowed**
- Including a thank-you card in the package — **allowed** (no mention of discounts for reviews)
- Using Smart! delivery — does not affect shipment metrics
- Temporarily high returns due to a defective batch — can be disputed with evidence`,

    faqRu: [
      { q: "Могут ли заблокировать аккаунт за одну жалобу?", a: "Как правило, нет. Одиночные жалобы ведут к предупреждению. Исключение — продажа контрафакта или запрещённых товаров, где возможна немедленная блокировка." },
      { q: "Как проверить текущее состояние метрик?", a: "В панели продавца: Moje Allegro → Sprzedaż → Wskaźniki sprzedawcy. Обновляются ежедневно." },
      { q: "Можно ли работать с двумя аккаунтами легально?", a: "Только при наличии разных юридических лиц (разные NIP) и отдельных контактных данных. Один человек — два аккаунта — нарушение." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Czy jedno zgłoszenie może doprowadzić do blokady konta?", a: "Zazwyczaj nie. Pojedyncze zgłoszenia prowadzą do ostrzeżenia. Wyjątek — sprzedaż podróbek lub zakazanych towarów, gdzie możliwa jest natychmiastowa blokada." },
      { q: "Jak sprawdzić aktualne wskaźniki?", a: "W panelu sprzedawcy: Moje Allegro → Sprzedaż → Wskaźniki sprzedawcy. Aktualizowane codziennie." },
      { q: "Czy można legalnie prowadzić dwa konta?", a: "Tylko przy różnych podmiotach prawnych (różne NIP) i osobnych danych kontaktowych. Jedna osoba — dwa konta — to naruszenie." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Чи можуть заблокувати акаунт за одну скаргу?", a: "Як правило, ні. Одиничні скарги призводять до попередження. Виняток — продаж контрафакту або заборонених товарів, де можливе негайне блокування." },
      { q: "Як перевірити поточний стан метрик?", a: "У панелі продавця: Moje Allegro → Sprzedaż → Wskaźniki sprzedawcy. Оновлюються щодня." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "Can one complaint lead to account suspension?", a: "Generally no. Single complaints lead to warnings. Exception: selling counterfeits or prohibited items, where immediate suspension is possible." },
      { q: "How do I check my current metrics?", a: "In seller panel: Moje Allegro → Sprzedaż → Wskaźniki sprzedawcy. Updated daily." },
      { q: "Can I legally operate two accounts?", a: "Only with different legal entities (different NIP numbers) and separate contact details. One person — two accounts — is a violation." },
    ] satisfies FaqEntry[],
  },

  // ── 2. account-appeal-guide ───────────────────────────────────────────────
  {
    slug: "account-appeal-guide",
    titleRu: "Руководство по апелляции при блокировке аккаунта",
    titlePl: "Przewodnik po odwołaniu od blokady konta",
    titleUa: "Посібник з апеляції при блокуванні акаунту",
    titleEn: "Account Suspension Appeal Guide",
    category: "compliance",
    tags: ["appeal", "suspension", "account", "allegro", "reinstatement"],
    sortOrder: 101,
    contentRu: `## Руководство по апелляции при блокировке аккаунта

### Шаг 1: Сбор доказательств (первые 24 часа)

Немедленно после получения уведомления о блокировке:
- Сохраните скриншоты всех активных объявлений
- Экспортируйте историю транзакций за последние 90 дней
- Соберите переписку с покупателями, которые оставили жалобы
- Подготовьте документы на товары (инвойсы поставщиков, сертификаты)
- Зафиксируйте свои метрики на момент блокировки

### Шаг 2: Написание апелляционного письма

**Структура эффективной апелляции:**

\`\`\`
Тема: Апелляция по блокировке аккаунта [ваш ID] от [дата]

Уважаемая команда Allegro,

1. ПРИЗНАНИЕ ПРОБЛЕМЫ
[Чётко укажите, что именно произошло — без оправданий]

2. ОБЪЯСНЕНИЕ КОНТЕКСТА
[Почему это произошло — обстоятельства, не оправдания]

3. ПРИНЯТЫЕ МЕРЫ
[Конкретные действия, которые вы уже предприняли для устранения нарушения]

4. ПЛАН ПРЕДОТВРАЩЕНИЯ
[Как вы гарантируете, что это не повторится]

5. ЗАПРОС
[Просьба о восстановлении доступа с указанием срока работы на платформе]

Приложения: [список документов]
\`\`\`

### Шаг 3: Подача апелляции

**Каналы подачи (в порядке приоритета):**
1. **Центр помощи Allegro** — help.allegro.pl → "Zgłoś problem" → категория блокировки
2. **Электронная почта** — pomoc@allegro.pl с пометкой "Апелляция по блокировке"
3. **Чат с поддержкой** — для уточнения деталей апелляции

### Шаг 4: Временные ожидания

| Тип блокировки | Стандартный срок | Срок с эскалацией |
|----------------|-----------------|-------------------|
| Предупреждение | 2–3 рабочих дня | — |
| Ограничение | 5–7 рабочих дней | 14 дней |
| Полная блокировка | 10–14 рабочих дней | 30 дней |
| Блокировка за контрафакт | 14–21 рабочих дня | 45–60 дней |

### Шаг 5: Эскалация

Если стандартная апелляция не помогла:
1. **Повторная апелляция** — через 14 дней с новыми аргументами
2. **Запрос менеджера** — попросите передать дело старшему специалисту
3. **Жалоба в UOKiK** — Управление по конкуренции и защите прав потребителей (влияет на репутацию платформы)
4. **Юридическое письмо** — через адвоката, специализирующегося на e-commerce праве

### Меры профилактики для будущего

- Еженедельно проверяйте метрики в панели продавца
- Настройте автоматические уведомления при приближении к пороговым значениям
- Храните документы на все товары минимум 3 года
- Поддерживайте время ответа покупателям менее 24 часов
- Регулярно проверяйте VeRO-статус ваших брендов`,

    contentPl: `## Przewodnik po odwołaniu od blokady konta

### Krok 1: Zbieranie dowodów (pierwsze 24 godziny)

Natychmiast po otrzymaniu powiadomienia o blokadzie:
- Zapisz zrzuty ekranu wszystkich aktywnych ofert
- Wyeksportuj historię transakcji z ostatnich 90 dni
- Zbierz korespondencję z kupującymi, którzy złożyli skargi
- Przygotuj dokumenty towarowe (faktury od dostawców, certyfikaty)
- Udokumentuj swoje wskaźniki w momencie blokady

### Krok 2: Napisanie listu odwoławczego

**Struktura skutecznego odwołania:**

\`\`\`
Temat: Odwołanie od blokady konta [Twój ID] z dnia [data]

Szanowny Zespole Allegro,

1. UZNANIE PROBLEMU
[Jasno wskaż, co się stało — bez usprawiedliwień]

2. WYJAŚNIENIE KONTEKSTU
[Dlaczego do tego doszło — okoliczności, nie usprawiedliwienia]

3. PODJĘTE DZIAŁANIA
[Konkretne kroki, które już podjąłeś, aby naprawić naruszenie]

4. PLAN ZAPOBIEGANIA
[Jak zagwarantujesz, że się to nie powtórzy]

5. PROŚBA
[Prośba o przywrócenie dostępu z podaniem stażu na platformie]

Załączniki: [lista dokumentów]
\`\`\`

### Krok 3: Złożenie odwołania

**Kanały zgłoszeń (w kolejności priorytetów):**
1. **Centrum pomocy Allegro** — help.allegro.pl → "Zgłoś problem" → kategoria blokady
2. **E-mail** — pomoc@allegro.pl z dopiskiem "Odwołanie od blokady"
3. **Czat ze wsparciem** — w celu wyjaśnienia szczegółów odwołania

### Krok 4: Oczekiwane czasy

| Typ blokady | Standardowy czas | Z eskalacją |
|-------------|-----------------|-------------|
| Ostrzeżenie | 2–3 dni robocze | — |
| Ograniczenie | 5–7 dni roboczych | 14 dni |
| Pełna blokada | 10–14 dni roboczych | 30 dni |
| Blokada za podróbki | 14–21 dni roboczych | 45–60 dni |

### Krok 5: Eskalacja

Jeśli standardowe odwołanie nie przyniosło rezultatu:
1. **Ponowne odwołanie** — po 14 dniach z nowymi argumentami
2. **Wniosek o przełożonego** — poproś o przekazanie sprawy starszemu specjaliście
3. **Skarga do UOKiK** — Urząd Ochrony Konkurencji i Konsumentów (wpływa na reputację platformy)
4. **Pismo prawne** — przez adwokata specjalizującego się w prawie e-commerce`,

    contentUa: `## Посібник з апеляції при блокуванні акаунту

### Крок 1: Збір доказів (перші 24 години)

Одразу після отримання повідомлення про блокування:
- Збережіть скріншоти всіх активних оголошень
- Експортуйте історію транзакцій за останні 90 днів
- Зберіть переписку з покупцями, які подали скарги
- Підготуйте документи на товари (інвойси постачальників, сертифікати)
- Зафіксуйте свої метрики на момент блокування

### Крок 2: Написання апеляційного листа

**Структура ефективної апеляції:**
- Визнання проблеми (без виправдань)
- Пояснення контексту (обставини, а не виправдання)
- Прийняті заходи (конкретні дії для усунення порушення)
- План запобігання (гарантія, що це не повториться)
- Запит (прохання про відновлення доступу)

### Крок 3: Подача апеляції

**Канали подачі:**
1. **Центр допомоги Allegro** — help.allegro.pl
2. **Електронна пошта** — pomoc@allegro.pl
3. **Чат з підтримкою**

### Очікувані терміни

| Тип блокування | Стандартний термін | З ескалацією |
|----------------|--------------------|--------------|
| Попередження | 2–3 робочі дні | — |
| Обмеження | 5–7 робочих днів | 14 днів |
| Повне блокування | 10–14 робочих днів | 30 днів |
| Блокування за контрафакт | 14–21 робочий день | 45–60 днів |`,

    contentEn: `## Account Suspension Appeal Guide

### Step 1: Evidence Collection (First 24 Hours)

Immediately after receiving a suspension notice:
- Screenshot all active listings
- Export transaction history for the last 90 days
- Collect buyer communications related to complaints
- Prepare product documentation (supplier invoices, certificates)
- Document your metrics at the time of suspension

### Step 2: Writing the Appeal Letter

**Effective appeal structure:**

\`\`\`
Subject: Account Suspension Appeal [Your ID] dated [date]

Dear Allegro Team,

1. ACKNOWLEDGMENT OF THE ISSUE
[Clearly state what happened — no excuses]

2. CONTEXT EXPLANATION
[Why it happened — circumstances, not justifications]

3. CORRECTIVE ACTIONS TAKEN
[Specific steps already taken to resolve the violation]

4. PREVENTION PLAN
[How you guarantee this will not recur]

5. REQUEST
[Request for account reinstatement, mentioning your tenure on the platform]

Attachments: [list of documents]
\`\`\`

### Step 3: Submitting the Appeal

**Submission channels (in priority order):**
1. **Allegro Help Center** — help.allegro.pl → "Zgłoś problem" → suspension category
2. **Email** — pomoc@allegro.pl with subject "Suspension Appeal"
3. **Support chat** — to clarify appeal details

### Step 4: Expected Timelines

| Suspension Type | Standard Time | With Escalation |
|-----------------|--------------|-----------------|
| Warning | 2–3 business days | — |
| Restriction | 5–7 business days | 14 days |
| Full suspension | 10–14 business days | 30 days |
| Counterfeit suspension | 14–21 business days | 45–60 days |

### Step 5: Escalation Path

If standard appeal fails:
1. **Second appeal** — after 14 days with new arguments
2. **Manager request** — ask to escalate to senior specialist
3. **UOKiK complaint** — Office of Competition and Consumer Protection (impacts platform reputation)
4. **Legal letter** — through a lawyer specializing in e-commerce law`,

    faqRu: [
      { q: "Что делать, если апелляция отклонена?", a: "Подождите 14 дней и подайте повторную апелляцию с новыми доказательствами. Параллельно рассмотрите жалобу в UOKiK или консультацию с юристом." },
      { q: "Можно ли продавать на другой платформе во время блокировки?", a: "Да, блокировка Allegro не распространяется на другие платформы. Рассмотрите Amazon PL, OLX или Vinted как временную альтернативу." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Co zrobić, jeśli odwołanie zostało odrzucone?", a: "Odczekaj 14 dni i złóż ponowne odwołanie z nowymi dowodami. Rozważ równolegle skargę do UOKiK lub konsultację prawną." },
      { q: "Czy można sprzedawać na innej platformie podczas blokady?", a: "Tak, blokada Allegro nie obejmuje innych platform. Rozważ Amazon PL, OLX lub Vinted jako tymczasową alternatywę." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Що робити, якщо апеляцію відхилено?", a: "Зачекайте 14 днів і подайте повторну апеляцію з новими доказами. Паралельно розгляньте скаргу до UOKiK або консультацію з юристом." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "What to do if the appeal is rejected?", a: "Wait 14 days and file a second appeal with new evidence. Simultaneously consider a UOKiK complaint or legal consultation." },
      { q: "Can I sell on another platform during suspension?", a: "Yes, Allegro suspension does not affect other platforms. Consider Amazon PL, OLX, or Vinted as temporary alternatives." },
    ] satisfies FaqEntry[],
  },

  // ── 3. product-safety-requirements ────────────────────────────────────────
  {
    slug: "product-safety-requirements",
    titleRu: "Требования к безопасности продуктов (ЕС/Польша)",
    titlePl: "Wymagania bezpieczeństwa produktów (UE/Polska)",
    titleUa: "Вимоги до безпеки продуктів (ЄС/Польща)",
    titleEn: "Product Safety Requirements (EU/Poland)",
    category: "compliance",
    tags: ["CE", "product-safety", "REACH", "EN71", "electronics", "compliance", "EU"],
    sortOrder: 102,
    contentRu: `## Требования к безопасности продуктов для продажи в ЕС/Польше

### Маркировка CE (обязательна для большинства категорий)

Знак **CE (Conformité Européenne)** является обязательным для следующих категорий товаров, продаваемых в ЕС:
- Электроника и электроприборы (Директива LVD 2014/35/EU, Директива EMC 2014/30/EU)
- Игрушки (Директива по безопасности игрушек 2009/48/EC)
- Средства индивидуальной защиты (Регламент PPE (EU) 2016/425)
- Строительные материалы (Регламент CPR 305/2011)
- Медицинские приборы (Регламент MDR (EU) 2017/745)
- Машины и оборудование (Директива по машинам 2006/42/EC)

**Самостоятельное нанесение CE**: Для ряда товаров (например, некоторых видов электроники) производитель может самостоятельно подтвердить соответствие без участия нотифицированного органа. Для игрушек и медицинских приборов необходима независимая сертификация.

### Регламент REACH (EC 1907/2006)

REACH регулирует использование химических веществ в продуктах. Ключевые требования для продавцов:
- Ограничение содержания **свинца** в изделиях для детей до 0,05%
- Запрет **фталатов** DEHP, DBP, BBP в концентрации >0,1% в игрушках и изделиях для ухода за детьми
- Ограничение **кадмия** в украшениях и изделиях из металла
- Запрет использования **азокрасителей** в одежде и текстиле

Список ограниченных веществ (SVHC) насчитывает более 240 позиций и регулярно обновляется.

### Директива по безопасности игрушек EN 71

Для игрушек (0–14 лет) обязательны:
- **EN 71-1**: Механические и физические свойства (острые края, мелкие детали)
- **EN 71-2**: Воспламеняемость
- **EN 71-3**: Миграция химических элементов (свинец, хром, кадмий и др.)
- **EN 71-7**: Краски с пальцев (если применимо)

Все игрушки требуют независимого тестирования в аккредитованной лаборатории (SGS, Bureau Veritas, Intertek).

### Материалы для контакта с пищевыми продуктами (EC 1935/2004)

Посуда, упаковка, контейнеры для хранения еды:
- Должны соответствовать Регламенту EC 1935/2004
- Пластик — Регламент EU 10/2011
- Керамика — Директива 84/500/EEC
- Требуется Декларация соответствия (DoC) от производителя

### Электроника: Директивы LVD и EMC

**LVD (Low Voltage Directive) 2014/35/EU** — для оборудования 50–1000В AC / 75–1500В DC:
- Технический файл с описанием испытаний
- EU Declaration of Conformity
- CE marking minimum 5mm height

**EMC Directive 2014/30/EU** — для электромагнитной совместимости:
- Испытания по EN 55032 (эмиссия) и EN 55035 (помехоустойчивость)
- Применима ко всей электронике

### Когда нужны тестовые сертификаты

Вы **обязательно** должны иметь актуальные тестовые отчёты, если:
- Товар продаётся под вашим собственным брендом (private label)
- Поставщик не предоставил CE-документацию
- Товар входит в регулируемую категорию (игрушки, электроника, СИЗ, детские товары)
- Вы импортируете напрямую из стран вне ЕС`,

    contentPl: `## Wymagania bezpieczeństwa produktów do sprzedaży w UE/Polsce

### Oznakowanie CE (obowiązkowe dla większości kategorii)

Znak **CE (Conformité Européenne)** jest obowiązkowy dla następujących kategorii produktów sprzedawanych w UE:
- Elektronika i urządzenia elektryczne (Dyrektywa LVD 2014/35/EU, Dyrektywa EMC 2014/30/EU)
- Zabawki (Dyrektywa bezpieczeństwa zabawek 2009/48/EC)
- Środki ochrony indywidualnej (Rozporządzenie PPE (EU) 2016/425)
- Materiały budowlane (Rozporządzenie CPR 305/2011)
- Urządzenia medyczne (Rozporządzenie MDR (EU) 2017/745)

### Rozporządzenie REACH (EC 1907/2006)

Kluczowe wymagania dla sprzedawców:
- Ograniczenie zawartości **ołowiu** w wyrobach dla dzieci do 0,05%
- Zakaz **ftalanów** DEHP, DBP, BBP w stężeniu >0,1% w zabawkach
- Ograniczenie **kadmu** w biżuterii i wyrobach metalowych
- Zakaz **barwników azowych** w odzieży i tekstyliach

### Dyrektywa bezpieczeństwa zabawek EN 71

Dla zabawek (0–14 lat) obowiązkowe:
- **EN 71-1**: Właściwości mechaniczne i fizyczne
- **EN 71-2**: Zapalność
- **EN 71-3**: Migracja pierwiastków chemicznych
- Wymagane niezależne badania w akredytowanym laboratorium (SGS, Bureau Veritas, Intertek)

### Materiały przeznaczone do kontaktu z żywnością (EC 1935/2004)

- Naczynia, opakowania, pojemniki do przechowywania żywności
- Muszą spełniać Rozporządzenie EC 1935/2004
- Plastik — Rozporządzenie EU 10/2011
- Wymagana Deklaracja Zgodności (DoC) od producenta

### Kiedy potrzebne są certyfikaty badań

Musisz posiadać aktualne raporty badań, jeśli:
- Sprzedajesz pod własną marką (private label)
- Dostawca nie dostarczył dokumentacji CE
- Produkt należy do regulowanej kategorii (zabawki, elektronika, ŚOI)
- Importujesz bezpośrednio z krajów spoza UE`,

    contentUa: `## Вимоги до безпеки продуктів для продажу в ЄС/Польщі

### Маркування CE (обов'язкове для більшості категорій)

Знак **CE** є обов'язковим для: електроніки, іграшок, засобів індивідуального захисту, будівельних матеріалів, медичних пристроїв.

### Регламент REACH (EC 1907/2006)

Ключові вимоги: обмеження свинцю (до 0,05% у дитячих виробах), заборона фталатів (>0,1% в іграшках), обмеження кадмію у прикрасах, заборона азобарвників у одязі.

### Директива з безпеки іграшок EN 71

Для іграшок (0–14 років): обов'язкові тести EN 71-1 (механічні властивості), EN 71-2 (займистість), EN 71-3 (міграція хімічних елементів). Потрібне незалежне тестування в акредитованій лабораторії.

### Матеріали для контакту з харчовими продуктами

Посуд, упаковка: відповідність Регламенту EC 1935/2004, потрібна Декларація відповідності (DoC).

### Коли потрібні тестові сертифікати

Обов'язково при: продажу під власним брендом, відсутності CE-документації від постачальника, імпорті з країн поза ЄС.`,

    contentEn: `## Product Safety Requirements for EU/Poland Sales

### CE Marking (Mandatory for Most Categories)

**CE (Conformité Européenne)** marking is mandatory for:
- Electronics and electrical equipment (LVD 2014/35/EU, EMC 2014/30/EU)
- Toys (Toy Safety Directive 2009/48/EC)
- Personal protective equipment (PPE Regulation (EU) 2016/425)
- Construction products (CPR Regulation 305/2011)
- Medical devices (MDR Regulation (EU) 2017/745)
- Machinery (Machinery Directive 2006/42/EC)

### REACH Regulation (EC 1907/2006)

Key requirements for marketplace sellers:
- **Lead** restriction in children's products to 0.05%
- **Phthalates** DEHP, DBP, BBP banned >0.1% in toys and childcare items
- **Cadmium** restrictions in jewelry and metal articles
- **Azo dyes** ban in clothing and textiles

The SVHC (Substances of Very High Concern) list contains 240+ substances and is regularly updated.

### Toy Safety Directive EN 71

For toys (ages 0–14) mandatory standards:
- **EN 71-1**: Mechanical and physical properties (sharp edges, small parts)
- **EN 71-2**: Flammability
- **EN 71-3**: Migration of chemical elements (lead, chromium, cadmium, etc.)
All toys require independent testing at an accredited laboratory (SGS, Bureau Veritas, Intertek).

### Food Contact Materials (EC 1935/2004)

Kitchenware, packaging, food storage containers:
- Must comply with EC 1935/2004
- Plastics — EU Regulation 10/2011
- Ceramics — Directive 84/500/EEC
- Requires Declaration of Conformity (DoC) from manufacturer

### Electronics: LVD and EMC Directives

**LVD 2014/35/EU** — for equipment 50–1000V AC / 75–1500V DC:
- Technical file with test descriptions
- EU Declaration of Conformity
- CE marking minimum 5mm height

### When You Need Testing Certificates

You **must** have current test reports if:
- Selling under your own brand (private label)
- Supplier has not provided CE documentation
- Product falls in a regulated category (toys, electronics, PPE, children's products)
- Importing directly from non-EU countries`,

    faqRu: [
      { q: "Могу ли я доверять CE-документам от китайского поставщика?", a: "Не всегда. Многие поставщики предоставляют поддельные или устаревшие сертификаты. Для регулируемых категорий рекомендуется самостоятельная верификация через аккредитованную лабораторию (SGS, Bureau Veritas)." },
      { q: "Нужен ли сертификат CE для продажи на Allegro?", a: "Allegro не проверяет документы при листинге, но требует их при получении жалобы. Allegro может заблокировать объявление и ваш аккаунт, если не предоставить документацию по запросу." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Czy mogę ufać dokumentom CE od chińskiego dostawcy?", a: "Nie zawsze. Wielu dostawców dostarcza fałszywe lub nieaktualne certyfikaty. Dla regulowanych kategorii zalecana jest samodzielna weryfikacja przez akredytowane laboratorium." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Чи можу я довіряти CE-документам від китайського постачальника?", a: "Не завжди. Для регульованих категорій рекомендується самостійна верифікація через акредитовану лабораторію (SGS, Bureau Veritas)." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "Can I trust CE documents from a Chinese supplier?", a: "Not always. Many suppliers provide fake or outdated certificates. For regulated categories, independent verification through an accredited lab (SGS, Bureau Veritas) is recommended." },
      { q: "Is CE certification required to sell on Allegro?", a: "Allegro doesn't check documents at listing time but requires them upon complaint. Allegro may block listings and your account if documentation is not provided on request." },
    ] satisfies FaqEntry[],
  },

  // ── 4. ip-protection-rules ────────────────────────────────────────────────
  {
    slug: "ip-protection-rules",
    titleRu: "Защита интеллектуальной собственности на маркетплейсах",
    titlePl: "Ochrona własności intelektualnej na marketplace'ach",
    titleUa: "Захист інтелектуальної власності на маркетплейсах",
    titleEn: "Intellectual Property Protection on Marketplaces",
    category: "compliance",
    tags: ["IP", "trademark", "DMCA", "VeRO", "copyright", "brand-registry"],
    sortOrder: 103,
    contentRu: `## Защита интеллектуальной собственности на маркетплейсах

### Нарушение товарных знаков на Allegro

Allegro участвует в программе **Zgłoś naruszenie** (Сообщить о нарушении) для правообладателей. Типичные нарушения:

- Использование торговой марки в заголовке или описании без авторизации (например, "сумка KE Nike" или "совместимо с Apple — но это неофициальный Apple продукт")
- Продажа товаров с нанесёнными брендами без авторизации дистрибьютора
- Использование фотографий без лицензии

**Как реагировать на жалобу об IP-нарушении на Allegro:**
1. Получите уведомление → сохраните номер дела
2. Проверьте, является ли претензия обоснованной (есть ли у вас авторизация?)
3. Если жалоба ошибочна — подайте контр-уведомление через help.allegro.pl в течение 10 рабочих дней
4. Если нарушение признано — немедленно удалите листинг и предоставьте план исправления

### Программа VeRO на eBay

**VeRO (Verified Rights Owner)** — программа eBay для защиты IP:
- Правообладатель подаёт Notice of Claimed Infringement (NOCI)
- eBay удаляет листинг в течение 24–48 часов без уведомления продавца
- Повторные нарушения ведут к блокировке аккаунта

**Для подачи жалобы VeRO** (если вы правообладатель):
- Зарегистрируйтесь в программе VeRO: ebay.com/vero
- Подготовьте доказательства: регистрационный номер торгового знака, скриншоты листинга
- Заполните форму NOCI онлайн

**Контр-уведомление продавца:**
- Подаётся только если вы уверены, что у вас есть права (авторизация дистрибьютора, лицензия)
- Процесс занимает 10–14 рабочих дней

### Amazon Brand Registry

**Amazon Brand Registry** защищает зарегистрированные торговые марки:
- Требует регистрацию торгового знака в USPTO, EUIPO, или национальном ведомстве
- Даёт доступ к инструменту "Report a Violation" — более быстрое удаление нарушений
- Позволяет использовать A+ Content, Amazon Stores, Sponsored Brands

**Подача жалобы на Amazon:**
1. Войдите в Brand Registry → Report a Violation
2. Укажите ASIN нарушителя
3. Выберите тип нарушения (trademark, copyright, counterfeit)
4. Приложите доказательства
5. Ответ в течение 2–5 рабочих дней

### DMCA takedowns (авторское право)

**DMCA (Digital Millennium Copyright Act)** применяется для защиты:
- Фотографий продуктов
- Описаний и текстовых материалов
- Видеоконтента

**Процедура подачи DMCA:**
1. Идентифицируйте нарушение (URL, платформа)
2. Подготовьте уведомление с указанием: ваших контактных данных, описания защищённого произведения, URL нарушающего контента, заявления о добросовестном использовании
3. Отправьте в DMCA-агент платформы (для Allegro: это польский закон об авторском праве, Dz.U. 1994 Nr 24 poz. 83)

### Ответ на жалобу об IP-нарушении

Алгоритм действий при получении претензии:
1. **Не игнорируйте** — отсутствие ответа = признание нарушения
2. Проверьте наличие у вас авторизации от правообладателя
3. Если авторизация есть — предоставьте документы платформе
4. Если нарушение реальное — удалите листинг, уничтожьте остатки (с документированием)
5. Рассмотрите урегулирование напрямую с правообладателем`,

    contentPl: `## Ochrona własności intelektualnej na marketplace'ach

### Naruszenia znaków towarowych na Allegro

Allegro uczestniczy w programie **Zgłoś naruszenie** dla właścicieli praw. Typowe naruszenia:
- Używanie marki w tytule bez autoryzacji
- Sprzedaż towarów z naniesionymi markami bez autoryzacji dystrybutora
- Używanie zdjęć bez licencji

**Jak reagować na skargę IP na Allegro:**
1. Otrzymaj powiadomienie → zapisz numer sprawy
2. Sprawdź, czy roszczenie jest uzasadnione (czy masz autoryzację?)
3. Jeśli skarga jest błędna — złóż kontr-powiadomienie przez help.allegro.pl w ciągu 10 dni roboczych
4. Jeśli naruszenie jest potwierdzone — natychmiast usuń ofertę

### Program VeRO na eBay

**VeRO** — program eBay do ochrony IP:
- Właściciel praw składa Notice of Claimed Infringement (NOCI)
- eBay usuwa ofertę w ciągu 24–48 godzin
- Powtarzające się naruszenia prowadzą do blokady konta

### Amazon Brand Registry

Wymaga rejestracji znaku towarowego w USPTO, EUIPO lub krajowym urzędzie. Daje dostęp do narzędzia "Report a Violation" — szybsze usuwanie naruszeń.

### Odpowiedź na skargę IP

1. Nie ignoruj — brak odpowiedzi = uznanie naruszenia
2. Sprawdź posiadaną autoryzację od właściciela praw
3. Jeśli autoryzacja istnieje — dostarcz dokumenty platformie
4. Jeśli naruszenie jest rzeczywiste — usuń ofertę natychmiast`,

    contentUa: `## Захист інтелектуальної власності на маркетплейсах

### Порушення товарних знаків на Allegro

Allegro бере участь у програмі **Zgłoś naruszenie** для правовласників. Типові порушення: використання торгової марки без авторизації, продаж товарів з нанесеними брендами без дозволу дистриб'ютора, використання фотографій без ліцензії.

### Програма VeRO на eBay

VeRO — програма eBay для захисту IP. Правовласник подає NOCI, eBay видаляє оголошення протягом 24–48 годин. Повторні порушення призводять до блокування акаунту.

### Amazon Brand Registry

Вимагає реєстрацію торгової марки в EUIPO або національному відомстві. Надає доступ до інструменту "Report a Violation" — швидше видалення порушень.

### Відповідь на скаргу IP

1. Не ігноруйте — відсутність відповіді = визнання порушення
2. Перевірте наявність авторизації від правовласника
3. Якщо авторизація є — надайте документи платформі
4. Якщо порушення реальне — негайно видаліть оголошення`,

    contentEn: `## Intellectual Property Protection on Marketplaces

### Trademark Infringement on Allegro

Allegro participates in the **Zgłoś naruszenie** (Report Infringement) program for rights holders. Typical violations:
- Using a brand name in the title without authorization
- Selling products with applied brands without distributor authorization
- Using photos without a license

**How to respond to an IP complaint on Allegro:**
1. Receive the notice → save the case number
2. Verify if the claim is justified (do you have authorization?)
3. If the complaint is erroneous — file a counter-notice via help.allegro.pl within 10 business days
4. If the violation is confirmed — immediately remove the listing

### VeRO Program on eBay

**VeRO (Verified Rights Owner)** — eBay's IP protection program:
- Rights owner files a Notice of Claimed Infringement (NOCI)
- eBay removes the listing within 24–48 hours without seller notification
- Repeated violations lead to account suspension

### Amazon Brand Registry

Requires trademark registration with USPTO, EUIPO, or national office. Gives access to "Report a Violation" tool — faster infringement removal. Also unlocks A+ Content, Amazon Stores, Sponsored Brands.

### DMCA Takedowns (Copyright)

DMCA protects: product photos, descriptions, video content. File DMCA notice with: contact details, description of protected work, URL of infringing content, good faith statement.

### Responding to an IP Complaint

1. **Do not ignore** — no response = admission of infringement
2. Verify you have authorization from the rights holder
3. If authorization exists — provide documents to the platform
4. If violation is real — remove listing immediately, destroy remaining inventory (document it)
5. Consider direct settlement with the rights holder`,

    faqRu: [
      { q: "Можно ли использовать название бренда в ключевых словах для SEO?", a: "На Allegro нельзя использовать чужие торговые марки в тексте объявления (тег meta или описание) без авторизации. Допустимо только указание совместимости для запчастей: 'совместимо с [бренд]' — но только если это технически точное описание." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Czy mogę używać nazwy marki w słowach kluczowych SEO?", a: "Na Allegro nie można używać cudzych znaków towarowych w tekście oferty bez autoryzacji. Dopuszczalne jest wskazanie kompatybilności dla części zamiennych: 'kompatybilny z [marka]' — ale tylko jeśli jest to technicznie dokładny opis." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Чи можна використовувати назву бренду в ключових словах?", a: "На Allegro не можна використовувати чужі торгові марки в тексті оголошення без авторизації. Допустимо лише вказання сумісності для запчастин: 'сумісно з [бренд]' — але тільки якщо це технічно точний опис." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "Can I use a brand name in SEO keywords?", a: "On Allegro you cannot use third-party trademarks in listing text without authorization. Acceptable only for spare parts compatibility statements: 'compatible with [brand]' — but only when technically accurate." },
    ] satisfies FaqEntry[],
  },

  // ── 5. safe-review-collection ──────────────────────────────────────────────
  {
    slug: "safe-review-collection",
    titleRu: "Безопасные методы сбора отзывов",
    titlePl: "Bezpieczne metody zbierania opinii",
    titleUa: "Безпечні методи збору відгуків",
    titleEn: "Safe Review Collection Methods",
    category: "reviews",
    tags: ["reviews", "feedback", "allegro", "compliance", "post-purchase"],
    sortOrder: 200,
    contentRu: `## Безопасные методы сбора отзывов покупателей

### Оптимальное время для запроса отзыва

Исследования показывают наилучшие результаты при следующих временных окнах:
- **Товары с быстрой оценкой** (одежда, аксессуары): 3–4 дня после доставки
- **Электроника и технические товары**: 5–7 дней (время на тестирование)
- **Товары для дома**: 7–10 дней (время на использование)

Общий принцип: **запрашивайте отзыв тогда, когда покупатель уже успел использовать товар, но ещё помнит детали покупки** (в течение 14 дней после доставки).

### Разрешённые методы сбора отзывов

#### 1. Вложение в посылку (Package Insert)
**Правила Allegro**: вложение допустимо, если оно:
- Содержит искреннюю просьбу оставить отзыв о товаре
- НЕ предлагает скидку, возврат средств или подарок в обмен на отзыв
- НЕ содержит QR-код, ведущий только на страницу с положительными отзывами (review gating)
- НЕ давит психологически ("Только 5-звёздочные отзывы помогают нашему бизнесу")

✅ **Пример допустимого вложения:**
> "Спасибо за покупку! Если вы довольны товаром, мы будем рады вашему отзыву на Allegro. Если что-то пошло не так — напишите нам напрямую, и мы решим проблему."

#### 2. Пост-продажные сообщения
Через систему сообщений Allegro разрешено:
- Одно сообщение с просьбой об отзыве после подтверждения доставки
- Сообщение с вопросом "Всё ли в порядке с заказом?" (косвенный способ)

НЕ разрешено:
- Более одного напоминания об отзыве
- Упоминание скидки на следующую покупку в обмен на отзыв
- Отправка сообщений через внешние сервисы в обход Allegro

#### 3. Отличный сервис как основа отзывов
Лучший способ получить органические отзывы:
- Упаковывайте товары профессионально и надёжно
- Отправляйте быстрее обещанного срока
- Добавляйте персонализированную благодарственную записку
- Решайте проблемы мгновенно (1 ответ в течение 2 часов = WOW-эффект)

### Что ЗАПРЕЩЕНО (и почему это опасно)

| Запрещённое действие | Почему запрещено | Последствия |
|---------------------|-----------------|-------------|
| Обещание скидки за отзыв | Манипуляция рейтингом | Блокировка аккаунта |
| Отзывы от друзей/семьи | Фальсификация данных | Удаление всех отзывов |
| Покупка отзывов | Мошенничество | Немедленная блокировка |
| Review gating | Скрытие негативного опыта | Нарушение правил Allegro |
| >2 запроса об отзыве | Спам | Ограничение сообщений |

### Пороговые значения Allegro

- Органическая частота отзывов: **2–4%** транзакций (норма)
- Целевой показатель с хорошими практиками: **до 5%**
- Порог автоматической проверки: **>10%** — система подозревает манипуляцию

Если ваш показатель превышает 7%, будьте готовы к запросу Allegro о предоставлении доказательств органического получения отзывов.`,

    contentPl: `## Bezpieczne metody zbierania opinii od kupujących

### Optymalny czas na prośbę o opinię

Najlepsze wyniki przy następujących oknach czasowych:
- **Szybko oceniane produkty** (odzież, akcesoria): 3–4 dni po dostarczeniu
- **Elektronika**: 5–7 dni (czas na testowanie)
- **Artykuły domowe**: 7–10 dni

### Dozwolone metody zbierania opinii

#### 1. Wkładka do paczki (Package Insert)
Dozwolona, jeśli:
- Zawiera szczerą prośbę o opinię
- NIE oferuje zniżki ani prezentu za opinię
- NIE kieruje tylko do pozytywnych opinii (review gating)

✅ **Przykład dozwolonej wkładki:**
> "Dziękujemy za zakup! Jeśli jesteś zadowolony z produktu, będziemy wdzięczni za Twoją opinię na Allegro. Jeśli coś poszło nie tak — napisz do nas, a rozwiążemy problem."

#### 2. Wiadomości po sprzedaży
Dozwolone:
- Jedna wiadomość z prośbą o opinię po potwierdzeniu dostarczenia
- Wiadomość z pytaniem "Czy wszystko w porządku z zamówieniem?"

Niedozwolone:
- Więcej niż jedno przypomnienie o opinii
- Wzmianka o zniżce za opinię

#### 3. Doskonały serwis jako podstawa opinii
- Profesjonalne pakowanie
- Wysyłka szybsza niż obiecano
- Personalizowana kartka z podziękowaniem
- Błyskawiczne rozwiązywanie problemów

### Co jest ZAKAZANE

| Zakazane działanie | Dlaczego | Konsekwencje |
|--------------------|----------|--------------|
| Obietnica zniżki za opinię | Manipulacja oceną | Blokada konta |
| Opinie od znajomych/rodziny | Fałszowanie danych | Usunięcie wszystkich opinii |
| Kupowanie opinii | Oszustwo | Natychmiastowa blokada |
| Review gating | Ukrywanie negatywnych doświadczeń | Naruszenie regulaminu |

### Progi Allegro

- Organiczny wskaźnik opinii: **2–4%** transakcji (norma)
- Cel z dobrymi praktykami: **do 5%**
- Próg automatycznej kontroli: **>10%** — system podejrzewa manipulację`,

    contentUa: `## Безпечні методи збору відгуків покупців

### Оптимальний час для запиту відгуку

- Товари з швидкою оцінкою: 3–4 дні після доставки
- Електроніка: 5–7 днів
- Товари для дому: 7–10 днів

### Дозволені методи

#### 1. Вкладення в посилку
Дозволено, якщо: не пропонує знижку за відгук, не веде тільки на позитивні відгуки, не чинить психологічного тиску.

#### 2. Пост-продажні повідомлення
Дозволено одне повідомлення з проханням про відгук після підтвердження доставки.

### Що ЗАБОРОНЕНО

- Обіцянка знижки за відгук → блокування акаунту
- Відгуки від друзів/родини → видалення всіх відгуків
- Купівля відгуків → негайне блокування

### Порогові значення Allegro

- Органічна частота відгуків: 2–4% транзакцій (норма)
- Ціль: до 5% з хорошими практиками
- Порог автоматичної перевірки: >10%`,

    contentEn: `## Safe Review Collection Methods

### Optimal Timing for Review Requests

Research shows the best results within these windows:
- **Quickly-evaluated products** (clothing, accessories): 3–4 days after delivery
- **Electronics and technical products**: 5–7 days (time to test)
- **Home goods**: 7–10 days (time to use)

Core principle: **request a review when the buyer has already used the product but still remembers the purchase** (within 14 days of delivery).

### Permitted Review Collection Methods

#### 1. Package Insert
**Allegro rules**: insert is allowed if it:
- Contains a sincere request to leave a review
- Does NOT offer a discount, refund, or gift in exchange for a review
- Does NOT include a QR code leading only to the positive review page (review gating)
- Does NOT psychologically pressure ("Only 5-star reviews help our business survive")

✅ **Example of a compliant insert:**
> "Thank you for your purchase! If you're happy with the product, we'd love your review on Allegro. If something went wrong — message us directly and we'll make it right."

#### 2. Post-Purchase Messages
Through Allegro messaging it is permitted to:
- Send one message requesting a review after delivery confirmation
- Send a "How is your order?" check-in message (indirect approach)

NOT permitted:
- More than one review reminder
- Mentioning a discount for leaving a review
- Sending messages via external services bypassing Allegro

#### 3. Excellent Service as the Foundation

Best way to earn organic reviews:
- Package products professionally and securely
- Ship faster than the promised date
- Add a personalized thank-you note
- Resolve issues instantly (1 response within 2 hours = WOW effect)

### What Is BANNED (And Why It's Dangerous)

| Prohibited Action | Why Banned | Consequences |
|-------------------|-----------|--------------|
| Discount for review | Rating manipulation | Account suspension |
| Friends/family reviews | Data falsification | All reviews deleted |
| Buying reviews | Fraud | Immediate suspension |
| Review gating | Hiding negative experience | Allegro TOS violation |
| >2 review requests | Spam | Messaging restriction |

### Allegro Thresholds

- Organic review rate: **2–4%** of transactions (normal)
- Target with good practices: **up to 5%**
- Automatic investigation threshold: **>10%** — system suspects manipulation

If your rate exceeds 7%, be prepared for Allegro to request evidence of organic review acquisition.`,

    faqRu: [
      { q: "Можно ли предлагать скидку на следующую покупку в благодарственном письме?", a: "Нет, если скидка упоминается в контексте отзыва. Если письмо с кодом скидки отправляется отдельно и без упоминания отзывов — это допустимо, но лучше делать это через систему промокодов Allegro." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Czy można oferować zniżkę na następny zakup w liście z podziękowaniem?", a: "Nie, jeśli zniżka jest wspomniana w kontekście opinii. Jeśli e-mail ze zniżką jest wysyłany osobno i bez wzmianki o opiniach — jest to dozwolone." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Чи можна пропонувати знижку на наступну покупку в подячному листі?", a: "Ні, якщо знижка згадується в контексті відгуку. Якщо лист зі знижкою надсилається окремо і без згадки відгуків — це допустимо." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "Can I offer a discount on the next purchase in a thank-you note?", a: "No, if the discount is mentioned in the context of leaving a review. If a discount email is sent separately and without any mention of reviews — it is permitted." },
    ] satisfies FaqEntry[],
  },

  // ── 6. negative-review-response ───────────────────────────────────────────
  {
    slug: "negative-review-response",
    titleRu: "Работа с негативными отзывами",
    titlePl: "Obsługa negatywnych opinii",
    titleUa: "Робота з негативними відгуками",
    titleEn: "Handling Negative Reviews",
    category: "reviews",
    tags: ["reviews", "negative-feedback", "customer-service", "response-templates"],
    sortOrder: 201,
    contentRu: `## Работа с негативными отзывами на маркетплейсах

### Шаблоны ответов по типам ситуаций

#### 1. Дефектный товар

**Публичный ответ на отзыв:**
> "Уважаемый покупатель, искренне приносим извинения за дефект. Мы уже отправили вам личное сообщение с предложением о замене или полном возврате средств. Качество наших товаров для нас — приоритет."

**Личное сообщение:**
> "Здравствуйте! Нам очень жаль, что товар оказался с дефектом. Пожалуйста, выберите удобный вариант решения: 1) Полный возврат средств (без необходимости возврата товара при стоимости до 50 злотых) 2) Замена на новый экземпляр с приоритетной отправкой. Как вам удобнее?"

#### 2. Задержка доставки

**Публичный ответ:**
> "Приносим извинения за задержку. К сожалению, в этот период курьерские службы испытывали перегрузку. Мы уже связались с покупателем и компенсировали неудобство. Принимаем меры для улучшения надёжности доставки."

#### 3. Несоответствие товара (ошиблись с заказом)

**Публичный ответ:**
> "Глубоко извиняемся — ошибка произошла при нашей стороне. Правильный товар уже отправлен с курьером, возврат неверного за наш счёт."

#### 4. Недовольство покупателя без объективных причин (buyer's remorse)

**Публичный ответ:**
> "Благодарим за отзыв. Сожалеем, что товар не оправдал ваших ожиданий. Мы связались с вами для решения ситуации в рамках нашей политики возвратов."

### Когда предлагать возврат vs замену

**Предлагайте ВОЗВРАТ СРЕДСТВ если:**
- Товар пришёл повреждённым в дороге
- Покупатель ждал дольше 2 недель
- Это второй дефектный экземпляр для этого покупателя

**Предлагайте ЗАМЕНУ если:**
- Дефект производственный, а не логистический
- Покупатель явно хотел именно этот товар
- Замена дешевле возврата (учитывайте стоимость возвратной логистики)

### Эскалация к поддержке маркетплейса

Обращайтесь к поддержке Allegro если:
- Отзыв содержит ложную информацию (покупатель утверждает, что не получил товар, а трекинг показывает доставку)
- Покупатель угрожает негативным отзывом как способом получить скидку
- Отзыв оставлен без совершения покупки у вас (конкурентная атака)

Для удаления отзыва нужно: открыть спор в Allegro → выбрать причину → приложить доказательства (скриншоты переписки, трекинг).

### Конвертация негативного отзыва в нейтральный

Allegro позволяет покупателю изменить отзыв в течение 30 дней. Алгоритм:
1. Решите проблему полностью и превзойдите ожидания
2. Напомните покупателю, что он может обновить отзыв (один раз, ненавязчиво)
3. НЕ предлагайте деньги/скидку за изменение отзыва — это нарушение правил`,

    contentPl: `## Obsługa negatywnych opinii na marketplace'ach

### Szablony odpowiedzi według typów sytuacji

#### 1. Wadliwy produkt

**Publiczna odpowiedź na opinię:**
> "Szanowny Kupujący, szczerze przepraszamy za wadę. Wysłaliśmy już wiadomość prywatną z propozycją wymiany lub pełnego zwrotu pieniędzy. Jakość naszych produktów to dla nas priorytet."

#### 2. Opóźnienie dostawy

**Publiczna odpowiedź:**
> "Przepraszamy za opóźnienie. W tym okresie firmy kurierskie doświadczały przeciążenia. Skontaktowaliśmy się już z kupującym i zrekompensowaliśmy niedogodność."

#### 3. Niezgodność towaru

**Publiczna odpowiedź:**
> "Głęboko przepraszamy — błąd nastąpił po naszej stronie. Właściwy towar został już wysłany kurierem, odbiór błędnego na nasz koszt."

#### 4. Rozczarowanie bez obiektywnych powodów

**Publiczna odpowiedź:**
> "Dziękujemy za opinię. Żałujemy, że produkt nie spełnił Twoich oczekiwań. Skontaktowaliśmy się w celu rozwiązania sytuacji w ramach naszej polityki zwrotów."

### Kiedy proponować zwrot vs wymianę

**Proponuj ZWROT PIENIĘDZY jeśli:**
- Towar przyszedł uszkodzony
- Kupujący czekał dłużej niż 2 tygodnie
- To drugi wadliwy egzemplarz dla tego kupującego

**Proponuj WYMIANĘ jeśli:**
- Wada jest produkcyjna, nie logistyczna
- Kupujący wyraźnie chciał tego produktu
- Wymiana jest tańsza niż zwrot

### Konwersja negatywnej opinii na neutralną

Allegro pozwala kupującemu zmienić opinię w ciągu 30 dni. Algorytm:
1. Całkowicie rozwiąż problem i przekrocz oczekiwania
2. Przypomnij kupującemu, że może zaktualizować opinię (raz, nienachalnie)
3. NIE oferuj pieniędzy/zniżki za zmianę opinii — to naruszenie regulaminu`,

    contentUa: `## Робота з негативними відгуками на маркетплейсах

### Шаблони відповідей за типами ситуацій

#### 1. Дефектний товар
Публічна відповідь: "Шановний покупець, щиро вибачаємось за дефект. Ми вже надіслали вам особисте повідомлення з пропозицією заміни або повного повернення коштів."

#### 2. Затримка доставки
Публічна відповідь: "Вибачаємось за затримку. Ми зв'язались з покупцем і компенсували незручності."

### Коли пропонувати повернення vs заміну

**Повернення коштів**: товар пошкоджений, очікування >2 тижнів, другий дефектний екземпляр.
**Заміна**: виробничий дефект, покупець хотів саме цей товар, заміна дешевша за повернення.

### Конвертація негативного відгуку в нейтральний

Allegro дозволяє покупцю змінити відгук протягом 30 днів. Вирішіть проблему повністю, нагадайте покупцю про можливість оновлення (один раз, ненав'язливо). НЕ пропонуйте гроші за зміну відгуку.`,

    contentEn: `## Handling Negative Reviews on Marketplaces

### Response Templates by Situation Type

#### 1. Defective Product

**Public review response:**
> "Dear buyer, we sincerely apologize for the defect. We have already sent you a private message offering a replacement or full refund. Product quality is our top priority."

**Private message:**
> "Hello! We're very sorry the product arrived with a defect. Please choose your preferred resolution: 1) Full refund (no return required for items under 50 PLN) 2) Replacement shipped with priority. Which works best for you?"

#### 2. Delayed Delivery

**Public response:**
> "We apologize for the delay. Unfortunately, courier services experienced overload during this period. We have already contacted the buyer and compensated for the inconvenience. We are taking steps to improve delivery reliability."

#### 3. Wrong Item Sent

**Public response:**
> "We deeply apologize — the error was on our side. The correct item has already been shipped by courier; return of the wrong item at our expense."

#### 4. Buyer's Remorse (No Objective Issue)

**Public response:**
> "Thank you for your feedback. We're sorry the product didn't meet your expectations. We have reached out to resolve the situation within our returns policy."

### When to Offer Refund vs Replacement

**Offer REFUND if:**
- Item arrived damaged in transit
- Buyer waited more than 2 weeks
- This is the second defective item for this buyer

**Offer REPLACEMENT if:**
- Defect is manufacturing-related, not logistics
- Buyer clearly wanted this specific product
- Replacement is cheaper than return (consider reverse logistics cost)

### Escalating to Marketplace Support

Contact Allegro support if:
- Review contains false information (buyer claims non-delivery but tracking shows delivered)
- Buyer is threatening negative review to get a discount
- Review was left without a purchase from you (competitor attack)

### Converting Negative to Neutral

Allegro allows buyers to update reviews within 30 days:
1. Resolve the issue completely and exceed expectations
2. Remind the buyer they can update the review (once, not pushy)
3. Do NOT offer money/discounts for changing the review — this is a policy violation`,

    faqRu: [
      { q: "Сколько времени есть на ответ на негативный отзыв?", a: "Technически ограничений нет, но лучшая практика — ответить в течение 24 часов. Быстрый профессиональный ответ влияет на мнение других покупателей, читающих отзывы." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Ile czasu mam na odpowiedź na negatywną opinię?", a: "Technicznie brak ograniczeń, ale najlepsza praktyka to odpowiedź w ciągu 24 godzin. Szybka, profesjonalna odpowiedź wpływa na opinię innych kupujących czytających recenzje." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Скільки часу є на відповідь на негативний відгук?", a: "Технічно обмежень немає, але найкраща практика — відповісти протягом 24 годин. Швидка професійна відповідь впливає на думку інших покупців." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "How long do I have to respond to a negative review?", a: "There's technically no deadline, but best practice is to respond within 24 hours. A fast, professional response influences the perception of other buyers reading reviews." },
    ] satisfies FaqEntry[],
  },

  // ── 7. review-velocity-benchmarks ─────────────────────────────────────────
  {
    slug: "review-velocity-benchmarks",
    titleRu: "Ориентиры по скорости роста отзывов",
    titlePl: "Benchmarki tempa wzrostu opinii",
    titleUa: "Орієнтири щодо швидкості зростання відгуків",
    titleEn: "Review Velocity Benchmarks",
    category: "reviews",
    tags: ["reviews", "benchmarks", "velocity", "fraud-detection", "organic"],
    sortOrder: 202,
    contentRu: `## Ориентиры по скорости роста отзывов для Allegro и других платформ

### Отраслевые средние показатели

По данным исследований маркетплейсов и практики продавцов EcomPilot:

| Сегмент | Органическая частота отзывов | Целевой показатель |
|---------|-----------------------------|--------------------|
| Электроника | 1–2% | 3–4% |
| Одежда и аксессуары | 2–4% | 5–6% |
| Товары для дома | 1.5–3% | 4–5% |
| Детские товары | 3–5% | 6–8% |
| Автомобильные товары | 1–2% | 3–4% |
| Спорт и отдых | 2–3% | 4–5% |
| Красота и уход | 3–5% | 6–7% |

**Общий ориентир**: органическая частота отзывов составляет **2–3%** транзакций. При грамотных легальных практиках достижим показатель **4–6%**.

### Целевые показатели с хорошими практиками

Чтобы достичь 5% и выше без риска:
- Качественная упаковка и быстрая отправка → +1–1.5%
- Персонализированная карточка с просьбой об отзыве → +0.5–1%
- Безупречное обслуживание (решение проблем в течение 2 часов) → +0.5–1%
- Точные описания (минус возвраты, плюс удовлетворённость) → +0.5%

### Признаки тревоги: внезапные всплески

**Сценарии, требующие расследования:**

1. **Всплеск отзывов за 3–5 дней** — особенно для нового аккаунта. Алгоритм Allegro помечает это автоматически.

2. **Несколько отзывов от аккаунтов с 0 историей** — аккаунты, созданные специально для отзывов, имеют явные признаки (отсутствие истории покупок, одинаковые IP, похожие шаблоны текста).

3. **Резкий рост отзывов на товар с плохими продажами** — соотношение "отзывы / продажи" становится подозрительным.

4. **Все отзывы имеют похожий стиль или ошибки** — признак написания одним человеком.

5. **Отзывы на непроверенные покупки** — Allegro помечает отзывы как "неподтверждённые" — это снижает их вес и вызывает подозрение.

### Конкурентные атаки: как распознать и сообщить

Признаки конкурентной атаки на ваши отзывы:
- Несколько отрицательных отзывов за короткий период без реальных жалоб в почте
- Отзывы от аккаунтов, которые также покупали у конкурентов
- Описание проблем, которые физически невозможны для вашего товара

**Как сообщить о поддельных отзывах на Allegro:**
1. Откройте страницу отзыва → "Zgłoś nadużycie"
2. Выберите причину: "Fałszywa opinia" (поддельный отзыв)
3. Приложите доказательства (логи, трекинг, переписку)
4. Срок рассмотрения: 5–10 рабочих дней

### Инструменты мониторинга отзывов

- **Allegro Seller Panel** — базовая аналитика отзывов
- **Sellizer** — польский инструмент для мониторинга Allegro
- **EcomPilot Analytics** — встроенная аналитика в вашем дашборде`,

    contentPl: `## Benchmarki tempa wzrostu opinii na Allegro

### Branżowe średnie wskaźniki

| Segment | Organiczne opinie | Cel |
|---------|-------------------|-----|
| Elektronika | 1–2% | 3–4% |
| Odzież i akcesoria | 2–4% | 5–6% |
| Artykuły domowe | 1,5–3% | 4–5% |
| Artykuły dziecięce | 3–5% | 6–8% |
| Uroda i pielęgnacja | 3–5% | 6–7% |

**Ogólny benchmark**: organiczny wskaźnik opinii wynosi **2–3%** transakcji. Przy dobrych praktykach możliwe jest osiągnięcie **4–6%**.

### Sygnały ostrzegawcze: nagłe skoki

1. Skok opinii w ciągu 3–5 dni — zwłaszcza dla nowego konta
2. Kilka opinii od kont z zerową historią
3. Gwałtowny wzrost opinii przy słabej sprzedaży
4. Wszystkie opinie mają podobny styl lub błędy
5. Opinie na niezweryfikowane zakupy

### Jak zgłosić fałszywe opinie na Allegro

1. Otwórz stronę opinii → "Zgłoś nadużycie"
2. Wybierz przyczynę: "Fałszywa opinia"
3. Dołącz dowody
4. Czas rozpatrzenia: 5–10 dni roboczych`,

    contentUa: `## Орієнтири щодо швидкості зростання відгуків

### Галузеві середні показники

| Сегмент | Органічна частота відгуків | Ціль |
|---------|---------------------------|------|
| Електроніка | 1–2% | 3–4% |
| Одяг та аксесуари | 2–4% | 5–6% |
| Товари для дому | 1,5–3% | 4–5% |
| Дитячі товари | 3–5% | 6–8% |

Загальний орієнтир: органічна частота відгуків 2–3% транзакцій. При хороших практиках досяжний показник 4–6%.

### Ознаки тривоги

1. Стрибок відгуків за 3–5 днів
2. Кілька відгуків від акаунтів з нульовою історією
3. Різке зростання відгуків при поганих продажах
4. Всі відгуки мають схожий стиль

### Як повідомити про підроблені відгуки

Сторінка відгуку → "Zgłoś nadużycie" → "Fałszywa opinia" → докази → термін розгляду 5–10 робочих днів.`,

    contentEn: `## Review Velocity Benchmarks

### Industry Average Benchmarks

Based on marketplace research and EcomPilot seller data:

| Segment | Organic Review Rate | Target Rate |
|---------|--------------------|-----------  |
| Electronics | 1–2% | 3–4% |
| Clothing & Accessories | 2–4% | 5–6% |
| Home Goods | 1.5–3% | 4–5% |
| Children's Products | 3–5% | 6–8% |
| Automotive | 1–2% | 3–4% |
| Sports & Outdoors | 2–3% | 4–5% |
| Beauty & Care | 3–5% | 6–7% |

**General benchmark**: organic review rate is **2–3%** of transactions. With strong compliant practices, **4–6%** is achievable.

### Targets with Good Practices

To reach 5%+ without risk:
- Quality packaging and fast shipping → +1–1.5%
- Personalized thank-you card with review request → +0.5–1%
- Excellent service (resolving issues within 2 hours) → +0.5–1%
- Accurate descriptions (fewer returns, higher satisfaction) → +0.5%

### Warning Signs: Sudden Spikes

**Scenarios requiring investigation:**

1. **Review spike within 3–5 days** — especially for a new account. Allegro's algorithm flags this automatically.

2. **Multiple reviews from 0-history accounts** — accounts created specifically for reviews have clear signals (no purchase history, identical IPs, similar text patterns).

3. **Sudden review growth on a poorly-selling product** — review-to-sales ratio becomes suspicious.

4. **All reviews have similar style or errors** — sign of one person writing them.

5. **Reviews on unverified purchases** — Allegro marks these as "unverified" — reduces their weight and triggers suspicion.

### Competitor Attacks: How to Identify and Report

Signs of a competitor attack on your reviews:
- Multiple negative reviews in a short period with no corresponding complaints in messages
- Reviews from accounts that also purchased from competitors
- Descriptions of problems that are physically impossible with your product

**How to report fake reviews on Allegro:**
1. Open review page → "Zgłoś nadużycie"
2. Select reason: "Fałszywa opinia" (fake review)
3. Attach evidence (logs, tracking, correspondence)
4. Processing time: 5–10 business days`,

    faqRu: [
      { q: "Как Allegro вычисляет процент отзывов?", a: "Allegro считает соотношение отзывов к числу завершённых транзакций за скользящие 30 дней. Точная формула не публикуется, но порог >10% является известным триггером." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Jak Allegro oblicza procent opinii?", a: "Allegro oblicza stosunek opinii do liczby zakończonych transakcji za kroczące 30 dni. Dokładna formuła nie jest publikowana, ale próg >10% jest znany jako wyzwalacz." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Як Allegro розраховує відсоток відгуків?", a: "Allegro рахує співвідношення відгуків до кількості завершених транзакцій за ковзні 30 днів. Поріг >10% є відомим тригером." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "How does Allegro calculate the review rate?", a: "Allegro calculates the ratio of reviews to completed transactions over a rolling 30-day period. The exact formula is not published, but >10% is a known trigger." },
    ] satisfies FaqEntry[],
  },

  // ── 8. account-health-monitoring ─────────────────────────────────────────
  {
    slug: "account-health-monitoring",
    titleRu: "Мониторинг здоровья аккаунта продавца",
    titlePl: "Monitoring kondycji konta sprzedawcy",
    titleUa: "Моніторинг здоров'я акаунту продавця",
    titleEn: "Seller Account Health Monitoring",
    category: "compliance",
    tags: ["account-health", "metrics", "monitoring", "KPI", "allegro", "seller-rating"],
    sortOrder: 104,
    contentRu: `## Мониторинг здоровья аккаунта продавца на Allegro

### Ключевые метрики и целевые значения

#### 1. Рейтинг продавца (Ocena sprzedawcy)
- **Цель**: 98%+ положительных оценок
- **Критический порог**: ниже 95% — риск ограничения видимости
- **Расчёт**: (положительные отзывы / все отзывы) × 100 за последние 12 месяцев
- **Влияние**: прямо влияет на позицию в поиске и участие в Super Sprzedawca

#### 2. Процент возвратов (Zwroty)
- **Цель**: менее 3%
- **Допустимый диапазон**: 3–8% (предупреждение при >8%)
- **Расчёт**: (возвраты / заказы) × 100 за скользящие 30 дней
- **Влияние**: высокий процент возвратов снижает видимость товаров в рекомендациях

#### 3. Время ответа на сообщения (Czas odpowiedzi)
- **Цель**: менее 24 часов (идеально — менее 6 часов)
- **Критический порог**: более 48 часов регулярно
- **Выходные дни**: Allegro учитывает рабочие часы, но лучшая практика — отвечать и в выходные для PRO-аккаунтов
- **Влияние**: медленный ответ снижает конверсию и рейтинг обслуживания

#### 4. Процент просроченных отправок (Terminowość wysyłki)
- **Цель**: менее 2%
- **Критический порог**: более 5% (предупреждение), более 10% (ограничение)
- **Расчёт**: (заказы с опозданием / все заказы) × 100 за скользящие 30 дней
- **Влияние**: ключевая метрика для статуса Super Sprzedawca

#### 5. Процент нерешённых претензий
- **Цель**: 0% (идеально) или менее 1%
- **Критический порог**: более 3%
- **Влияние**: прямой сигнал для команды доверия и безопасности Allegro

### Чек-лист ежедневного мониторинга

Рекомендуемая процедура (10–15 минут каждое утро):

**Обязательно каждый день:**
- [ ] Проверить новые заказы и подтвердить отправку ожидающих
- [ ] Ответить на все непрочитанные сообщения покупателей
- [ ] Проверить открытые претензии / споры

**Еженедельно (понедельник):**
- [ ] Просмотреть метрики продавца в Allegro Seller Panel
- [ ] Проверить процент просроченных отправок (Terminowość wysyłki)
- [ ] Просмотреть новые отзывы и ответить на негативные
- [ ] Проверить остатки на складе (избегать нулевых остатков при активных объявлениях)

**Ежемесячно (1-го числа):**
- [ ] Полный экспорт метрик за прошлый месяц
- [ ] Анализ тенденций по возвратам (какие SKU лидируют по возвратам?)
- [ ] Проверка статуса Super Sprzedawca
- [ ] Обновление условий объявлений при изменении сроков доставки

### Что делать, когда метрики падают

**Сценарий 1: Рейтинг падает ниже 97%**
1. Немедленно проверьте последние 20 отзывов — найдите паттерн
2. Ответьте на все отрицательные отзывы в течение 4 часов
3. Свяжитесь с покупателями, оставившими негативные отзывы, напрямую
4. Если есть системная проблема (дефектная партия) — временно снимите товар

**Сценарий 2: Просроченные отправки >5%**
1. Аудит процесса упаковки и отправки — где узкое место?
2. Пересмотрите сроки отправки в объявлениях (лучше указать 48 часов и отправить за 24)
3. Для периодов высокой нагрузки — временно ограничьте количество объявлений
4. Рассмотрите Allegro Fulfillment как решение для пиковых периодов

**Сценарий 3: Процент возвратов >5%**
1. Проанализируйте причины возвратов — "не соответствует описанию" vs "передумал"
2. Улучшите описания и фотографии проблемных SKU
3. Добавьте таблицу размеров для одежды/обуви
4. Проверьте качество упаковки (товары, приходящие повреждёнными)

### Статус Super Sprzedawca: требования 2025–2026

Для получения значка Super Sprzedawca необходимо:
- Не менее 100 transakcji за последние 3 месяца
- Terminowość wysyłki ≥ 98%
- Ocena sprzedawcy ≥ 98%
- Czas odpowiedzi ≤ 24 godziny
- Brak aktywnych ograniczeń`,

    contentPl: `## Monitoring kondycji konta sprzedawcy na Allegro

### Kluczowe wskaźniki i docelowe wartości

#### 1. Ocena sprzedawcy
- **Cel**: 98%+ pozytywnych ocen
- **Próg krytyczny**: poniżej 95% — ryzyko ograniczenia widoczności
- **Wpływ**: bezpośrednio wpływa na pozycję w wyszukiwaniu i uczestnictwo w Super Sprzedawca

#### 2. Odsetek zwrotów
- **Cel**: poniżej 3%
- **Dopuszczalny zakres**: 3–8% (ostrzeżenie przy >8%)
- **Wpływ**: wysoki odsetek zwrotów obniża widoczność w rekomendacjach

#### 3. Czas odpowiedzi na wiadomości
- **Cel**: poniżej 24 godzin (idealnie poniżej 6 godzin)
- **Próg krytyczny**: powyżej 48 godzin regularnie

#### 4. Terminowość wysyłki
- **Cel**: poniżej 2%
- **Próg krytyczny**: powyżej 5% (ostrzeżenie), powyżej 10% (ograniczenie)

#### 5. Odsetek nierozwiązanych reklamacji
- **Cel**: 0% lub poniżej 1%
- **Próg krytyczny**: powyżej 3%

### Codzienna lista kontrolna (10–15 minut rano)

**Codziennie:**
- [ ] Sprawdź nowe zamówienia i potwierdź wysyłkę oczekujących
- [ ] Odpowiedz na wszystkie nieprzeczytane wiadomości
- [ ] Sprawdź otwarte reklamacje / spory

**Co tydzień (poniedziałek):**
- [ ] Przejrzyj wskaźniki w Allegro Seller Panel
- [ ] Sprawdź terminowość wysyłki
- [ ] Przejrzyj nowe opinie i odpowiedz na negatywne

**Co miesiąc (1. dnia):**
- [ ] Pełny eksport wskaźników
- [ ] Analiza trendów zwrotów
- [ ] Sprawdzenie statusu Super Sprzedawca

### Wymagania Super Sprzedawca 2025–2026

- Co najmniej 100 transakcji w ciągu ostatnich 3 miesięcy
- Terminowość wysyłki ≥ 98%
- Ocena sprzedawcy ≥ 98%
- Czas odpowiedzi ≤ 24 godziny
- Brak aktywnych ograniczeń`,

    contentUa: `## Моніторинг здоров'я акаунту продавця на Allegro

### Ключові метрики та цільові значення

- **Рейтинг продавця**: ціль 98%+, критичний поріг <95%
- **Відсоток повернень**: ціль <3%, попередження при >8%
- **Час відповіді на повідомлення**: ціль <24 год, критично >48 год
- **Своєчасність відправки**: ціль <2%, попередження при >5%, обмеження при >10%
- **Невирішені претензії**: ціль 0%, критично >3%

### Щоденний чеклист (10–15 хвилин щоранку)

**Щодня:** перевірити нові замовлення, відповісти на повідомлення, перевірити відкриті претензії.
**Щотижня:** переглянути метрики, перевірити своєчасність відправки, відповісти на негативні відгуки.
**Щомісяця:** повний експорт метрик, аналіз тенденцій повернень, перевірка статусу Super Sprzedawca.

### Вимоги Super Sprzedawca 2025–2026

Мінімум 100 транзакцій за 3 місяці, Terminowość wysyłki ≥98%, Ocena sprzedawcy ≥98%, час відповіді ≤24 год, відсутність активних обмежень.`,

    contentEn: `## Seller Account Health Monitoring on Allegro

### Key Metrics and Target Values

#### 1. Seller Rating (Ocena sprzedawcy)
- **Target**: 98%+ positive ratings
- **Critical threshold**: below 95% — risk of visibility restriction
- **Calculation**: (positive reviews / all reviews) × 100 over last 12 months
- **Impact**: directly impacts search position and Super Sprzedawca eligibility

#### 2. Return Rate (Zwroty)
- **Target**: under 3%
- **Acceptable range**: 3–8% (warning at >8%)
- **Impact**: high return rates reduce product visibility in recommendations

#### 3. Message Response Time (Czas odpowiedzi)
- **Target**: under 24 hours (ideally under 6 hours)
- **Critical threshold**: regularly over 48 hours
- **Impact**: slow response reduces conversion and service rating

#### 4. Late Shipment Rate (Terminowość wysyłki)
- **Target**: under 2%
- **Critical threshold**: over 5% (warning), over 10% (restriction)
- **Impact**: key metric for Super Sprzedawca status

#### 5. Unresolved Claims Rate
- **Target**: 0% (ideal) or under 1%
- **Critical threshold**: over 3%
- **Impact**: direct signal to Allegro's trust and safety team

### Daily Monitoring Checklist (10–15 minutes each morning)

**Every day:**
- [ ] Check new orders and confirm pending shipments
- [ ] Reply to all unread buyer messages
- [ ] Check open claims / disputes

**Weekly (Monday):**
- [ ] Review metrics in Allegro Seller Panel
- [ ] Check late shipment rate (Terminowość wysyłki)
- [ ] Review new reviews and respond to negatives
- [ ] Check inventory levels (avoid out-of-stock with active listings)

**Monthly (1st of month):**
- [ ] Full metrics export for previous month
- [ ] Return trend analysis (which SKUs lead in returns?)
- [ ] Verify Super Sprzedawca status
- [ ] Update listing delivery windows if changed

### What to Do When Metrics Drop

**Scenario 1: Rating drops below 97%**
1. Immediately review last 20 reviews — find the pattern
2. Respond to all negative reviews within 4 hours
3. Contact buyers who left negative reviews directly
4. If systematic issue (defective batch) — temporarily unpublish the product

**Scenario 2: Late shipments >5%**
1. Audit packaging and shipping process — where is the bottleneck?
2. Revise listing shipment windows (better to promise 48h and deliver in 24h)
3. During high-load periods — temporarily limit number of active listings
4. Consider Allegro Fulfillment for peak periods

**Scenario 3: Return rate >5%**
1. Analyze return reasons — "not as described" vs "changed mind"
2. Improve descriptions and photos for problematic SKUs
3. Add size charts for clothing/footwear
4. Check packaging quality (products arriving damaged)

### Super Sprzedawca Status: 2025–2026 Requirements

To earn the Super Sprzedawca badge:
- At least 100 transactions in the last 3 months
- Terminowość wysyłki ≥ 98%
- Ocena sprzedawcy ≥ 98%
- Czas odpowiedzi ≤ 24 hours
- No active account restrictions`,

    faqRu: [
      { q: "Как часто обновляются метрики в Seller Panel?", a: "Большинство метрик обновляются ежедневно около 00:00 CET. Отзывы и сообщения — в реальном времени. Метрика terminowość wysyłki обновляется раз в сутки." },
      { q: "Теряет ли аккаунт статус Super Sprzedawca немедленно при падении метрик?", a: "Нет, Allegro предоставляет 30-дневный период для исправления метрик перед снятием статуса. Однако уведомление приходит немедленно." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Jak często aktualizowane są wskaźniki w Seller Panel?", a: "Większość wskaźników aktualizowana jest codziennie około 00:00 CET. Opinie i wiadomości — w czasie rzeczywistym." },
      { q: "Czy konto traci status Super Sprzedawca natychmiast po spadku wskaźników?", a: "Nie, Allegro daje 30-dniowy okres na poprawę wskaźników przed odebraniem statusu." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Як часто оновлюються метрики в Seller Panel?", a: "Більшість метрик оновлюються щодня близько 00:00 CET. Відгуки та повідомлення — в реальному часі." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "How often are metrics updated in Seller Panel?", a: "Most metrics update daily around 00:00 CET. Reviews and messages update in real time. The terminowość wysyłki metric updates once per day." },
      { q: "Does an account lose Super Sprzedawca status immediately when metrics drop?", a: "No, Allegro provides a 30-day correction period before removing the status. However, the notification arrives immediately." },
    ] satisfies FaqEntry[],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed runner
// ─────────────────────────────────────────────────────────────────────────────

async function seedCompliance(): Promise<void> {
  const db = getDb();

  write("Seeding compliance and review topics...\n");
  write(`Total topics: ${topics.length}\n\n`);

  let inserted = 0;
  let updated = 0;

  for (const topic of topics) {
    write(`  Processing: ${topic.slug}...`);

    const result = await db
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
      })
      .returning({ id: legalTopics.id, slug: legalTopics.slug });

    if (result.length > 0) {
      write(" done\n");
      inserted++;
    } else {
      write(" skipped\n");
      updated++;
    }
  }

  write(`\nSeed complete: ${inserted} upserted, ${updated} unchanged\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

seedCompliance()
  .then(() => {
    write("Compliance seed finished successfully.\n");
  })
  .catch((err: unknown) => {
    process.stderr.write(`Compliance seed failed: ${String(err)}\n`);
    process.exit(1);
  })
  .finally(() => {
    closeDb().catch(() => undefined);
  });
