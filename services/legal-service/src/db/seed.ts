// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — legal-service / db / seed
// Run with: npx tsx src/db/seed.ts
// ─────────────────────────────────────────────────────────────────────────────

import { sql } from "drizzle-orm";
import { closeDb, getDb } from "./client.js";
import { legalLimits, legalTopics, type FaqEntry, type NewLegalTopic } from "./schema.js";

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
  // ── 1. jdg-registration ──────────────────────────────────────────────────
  {
    slug: "jdg-registration",
    titleRu: "Регистрация ИП (JDG) в Польше",
    titlePl: "Rejestracja jednoosobowej działalności gospodarczej (JDG)",
    titleUa: "Реєстрація ФОП (JDG) у Польщі",
    titleEn: "Sole Trader Registration (JDG) in Poland",
    contentRu: `## Регистрация ИП (JDG) в Польше

Jednoosobowa działalność gospodarcza (JDG) — наиболее распространённая форма ведения бизнеса в Польше для физических лиц. Регистрация осуществляется через систему CEIDG (Centralna Ewidencja i Informacja o Działalności Gospodarczej) и является бесплатной.

### Требования к регистрации

Для регистрации JDG необходимо:
- Быть физическим лицом с правом на ведение деятельности в ЕС (гражданин ЕС, обладатель вида на жительство или карты побыту)
- Иметь PESEL (польский идентификационный номер)
- Иметь адрес регистрации в Польше

### Процедура регистрации

Заявку можно подать онлайн через портал **biznes.gov.pl** или лично в любом уrzędzie gminy (органе местного самоуправления). Регистрация занимает один рабочий день при подаче онлайн.

При регистрации необходимо указать:
- Код деятельности по классификации PKD (Polska Klasyfikacja Działalności)
- Адрес места ведения деятельности
- Дату начала деятельности
- Форму налогообложения (skala podatkowa, podatek liniowy или ryczałt)

### После регистрации

После получения номера NIP (налогового идентификатора) и REGON (статистического номера) необходимо:
1. Встать на учёт в ZUS (Zakład Ubezpieczeń Społecznych) в течение 7 дней
2. Открыть отдельный банковский счёт для бизнеса
3. Определиться с системой учёта (KPiR или pełna księgowość)

### Ответственность

Владелец JDG несёт **неограниченную личную ответственность** по обязательствам бизнеса всем своим имуществом. Это ключевое отличие от sp. z o.o. (ООО).

Начинающие предприниматели могут воспользоваться льготой **ulga na start** — освобождением от взносов ZUS на первые 6 месяцев деятельности.`,
    contentPl: `## Rejestracja jednoosobowej działalności gospodarczej (JDG)

Jednoosobowa działalność gospodarcza jest najprostszą formą prowadzenia działalności w Polsce. Rejestracja odbywa się przez system CEIDG i jest bezpłatna.

### Wymagania

Aby zarejestrować JDG, należy:
- Być osobą fizyczną uprawnioną do prowadzenia działalności w UE
- Posiadać numer PESEL
- Mieć adres zamieszkania lub wykonywania działalności w Polsce

### Procedura rejestracji

Wniosek można złożyć online przez **biznes.gov.pl** lub osobiście w urzędzie gminy. Rejestracja online jest realizowana w ciągu jednego dnia roboczego.

Podczas rejestracji należy podać:
- Kod PKD określający rodzaj działalności
- Adres wykonywania działalności
- Datę rozpoczęcia działalności
- Wybraną formę opodatkowania

### Po rejestracji

Po otrzymaniu numerów NIP i REGON przedsiębiorca jest zobowiązany:
1. Zgłosić się do ZUS w ciągu 7 dni od rozpoczęcia działalności
2. Otworzyć firmowe konto bankowe
3. Wybrać sposób prowadzenia ewidencji (KPiR lub pełna księgowość)

### Odpowiedzialność

Właściciel JDG odpowiada za zobowiązania całym swoim majątkiem osobistym. Nowi przedsiębiorcy mogą skorzystać z **ulgi na start** (zwolnienie ze składek ZUS przez 6 miesięcy) oraz **małego ZUS-u** przez kolejne 24 miesiące.`,
    contentUa: `## Реєстрація ФОП (JDG) у Польщі

Jednoosobowa działalność gospodarcza (JDG) — найпоширеніша форма ведення бізнесу для фізичних осіб у Польщі. Реєстрація здійснюється через систему CEIDG і є безкоштовною.

### Вимоги до реєстрації

Для реєстрації JDG необхідно:
- Бути фізичною особою з правом на ведення діяльності в ЄС
- Мати номер PESEL
- Мати адресу реєстрації в Польщі

### Процедура реєстрації

Заяву можна подати онлайн через **biznes.gov.pl** або особисто в органі місцевого самоврядування. Реєстрація онлайн займає один робочий день.

При реєстрації необхідно вказати:
- Код діяльності PKD
- Адресу місця ведення діяльності
- Дату початку діяльності
- Форму оподаткування

### Після реєстрації

Після отримання номерів NIP та REGON необхідно:
1. Зареєструватися в ZUS протягом 7 днів
2. Відкрити окремий банківський рахунок для бізнесу
3. Визначитися з системою обліку

### Відповідальність

Власник JDG несе **необмежену особисту відповідальність** за зобов'язаннями бізнесу. Початківці можуть скористатися пільгою **ulga na start** — звільнення від внесків ZUS на перші 6 місяців.`,
    contentEn: `## Sole Trader Registration (JDG) in Poland

Jednoosobowa działalność gospodarcza (JDG) is the most common business structure for individuals in Poland. Registration is done through the CEIDG system and is free of charge.

### Requirements

To register a JDG, you need:
- To be a natural person entitled to conduct business in the EU
- A PESEL identification number
- A registered address in Poland

### Registration Procedure

Applications can be submitted online via **biznes.gov.pl** or in person at any gmina office. Online registration is processed within one business day.

During registration you must provide:
- PKD activity code(s) describing your business
- Business address
- Start date of activity
- Chosen tax form (tax scale, flat tax, or lump-sum)

### After Registration

After receiving your NIP (tax ID) and REGON (statistical number) you must:
1. Register with ZUS within 7 days of starting activity
2. Open a dedicated business bank account
3. Set up bookkeeping (KPiR simplified ledger or full accounting)

### Liability

The JDG owner bears **unlimited personal liability** for all business obligations. New entrepreneurs can benefit from the **ulga na start** relief — exemption from ZUS social contributions for the first 6 months of activity.`,
    faqRu: [
      { q: "Сколько времени занимает регистрация JDG?", a: "При подаче онлайн через biznes.gov.pl — один рабочий день. При личной подаче в уrzędzie gminy регистрация происходит немедленно." },
      { q: "Нужен ли PESEL иностранцу для регистрации JDG?", a: "Да, PESEL обязателен. Граждане Украины, приехавшие после 24 февраля 2022 года, получают PESEL автоматически при регистрации по Специальному закону. Остальные иностранцы получают PESEL через уrząd gminy." },
      { q: "Можно ли зарегистрировать JDG без прописки в Польше?", a: "Нет, для регистрации JDG необходим адрес места ведения деятельности или проживания на территории Польши." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Ile trwa rejestracja JDG?", a: "Rejestracja online przez biznes.gov.pl trwa jeden dzień roboczy. Przy rejestracji osobistej w urzędzie gminy następuje natychmiastowo." },
      { q: "Czy cudzoziemiec potrzebuje numeru PESEL do rejestracji JDG?", a: "Tak, PESEL jest wymagany. Obywatele Ukrainy, którzy przybyli po 24 lutego 2022 roku, otrzymują PESEL automatycznie. Pozostali cudzoziemcy uzyskują go w urzędzie gminy." },
      { q: "Czy można prowadzić JDG bez polskiego adresu?", a: "Nie — do rejestracji wymagany jest adres zamieszkania lub wykonywania działalności na terytorium Polski." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Скільки часу займає реєстрація JDG?", a: "При подачі онлайн через biznes.gov.pl — один робочий день. При особистій подачі в органі місцевого самоврядування — негайно." },
      { q: "Чи потрібен PESEL іноземцю для реєстрації JDG?", a: "Так, PESEL обов'язковий. Громадяни України, які прибули після 24 лютого 2022 року, отримують PESEL автоматично за Спеціальним законом." },
      { q: "Чи можна зареєструвати JDG без адреси в Польщі?", a: "Ні, для реєстрації JDG необхідна адреса місця ведення діяльності або проживання на території Польщі." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "How long does JDG registration take?", a: "Online registration via biznes.gov.pl takes one business day. In-person registration at a gmina office is processed immediately." },
      { q: "Does a foreigner need a PESEL number to register a JDG?", a: "Yes, a PESEL is required. Ukrainian citizens who arrived after 24 February 2022 receive PESEL automatically under the Special Act. Other foreigners can obtain it at the gmina office." },
      { q: "Can I register a JDG without a Polish address?", a: "No — a registered business or residential address in Poland is required for JDG registration." },
    ] satisfies FaqEntry[],
    category: "registration",
    tags: ["jdg", "ceidg", "rejestracja", "pesel", "nip", "regon"],
    sortOrder: 1,
    isPublished: true,
  },

  // ── 2. unregistered-activity ──────────────────────────────────────────────
  {
    slug: "unregistered-activity",
    titleRu: "Незарегистрированная деятельность (działalność nierejestrowana)",
    titlePl: "Działalność nierejestrowana",
    titleUa: "Незареєстрована діяльність (działalność nierejestrowana)",
    titleEn: "Unregistered Business Activity (działalność nierejestrowana)",
    contentRu: `## Незарегистрированная деятельность в Польше

С 2018 года польское законодательство (Ustawa Prawo przedsiębiorców) допускает ведение небольшого бизнеса без регистрации в CEIDG при соблюдении определённых условий.

### Условия применения

Деятельность считается незарегистрированной, если:
- Ежемесячный доход **не превышает 75% минимальной заработной платы** (в 2025 году: 3 181,50 зл./мес. с января по июнь и пересчитывается с июля)
- Вы не вели зарегистрированный бизнес в течение последних 60 месяцев

### Что разрешено

В рамках działalność nierejestrowana можно:
- Продавать товары (в том числе через интернет — Allegro, OLX, собственный магазин)
- Оказывать услуги физическим лицам
- Заниматься ремёслами, творчеством, репетиторством

### Ограничения

Незарегистрированная деятельность **не подходит** для:
- Деятельности, требующей лицензии или разрешения
- Деятельности в форме товарищества
- Лиц, ранее ликвидировавших JDG в течение последних 60 месяцев

### Налогообложение

Доход облагается по **общей шкале** (skala podatkowa). Необходимо вести uproszczoną ewidencję sprzedaży (упрощённый реестр продаж) и ежегодно подавать декларацию PIT-36.

Если месячный лимит превышен, необходимо зарегистрировать JDG в течение 7 дней с момента превышения.

### Выставление счетов

По запросу покупателя необходимо выдать **rachunek** (счёт). Кассовый аппарат требуется, как только годовой оборот превысит установленный законом порог.`,
    contentPl: `## Działalność nierejestrowana

Od 2018 roku Prawo przedsiębiorców umożliwia prowadzenie drobnej działalności zarobkowej bez rejestracji w CEIDG, jeśli spełnione są określone warunki.

### Warunki stosowania

Działalność jest nierejestrowana, gdy:
- Miesięczne przychody **nie przekraczają 75% minimalnego wynagrodzenia** (w 2025 r.: 3 181,50 zł miesięcznie w I półroczu)
- Osoba nie prowadziła działalności gospodarczej przez ostatnie 60 miesięcy

### Co wolno robić

W ramach działalności nierejestrowanej można:
- Sprzedawać towary (w tym przez internet — Allegro, własny sklep)
- Świadczyć usługi osobom fizycznym
- Prowadzić działalność rękodzielniczą, twórczą, korepetycje

### Ograniczenia

Działalność nierejestrowana **nie dotyczy** działalności:
- Wymagającej zezwolenia lub koncesji
- Prowadzonej w formie spółki
- Osób, które zamknęły JDG w ciągu ostatnich 60 miesięcy

### Opodatkowanie

Dochód opodatkowany jest według **skali podatkowej**. Należy prowadzić uproszczoną ewidencję sprzedaży i złożyć roczną deklarację PIT-36.

Przekroczenie limitu miesięcznego wymaga rejestracji JDG w ciągu 7 dni.`,
    contentUa: `## Незареєстрована діяльність у Польщі

З 2018 року польське законодавство дозволяє вести невеликий бізнес без реєстрації в CEIDG за умови дотримання певних умов.

### Умови застосування

Діяльність вважається незареєстрованою, якщо:
- Щомісячний дохід **не перевищує 75% мінімальної заробітної плати** (у 2025 році: 3 181,50 зл./міс.)
- Особа не вела зареєстрований бізнес протягом останніх 60 місяців

### Що дозволено

В рамках незареєстрованої діяльності можна:
- Продавати товари (у тому числі через інтернет)
- Надавати послуги фізичним особам
- Займатися ремеслами, творчістю, репетиторством

### Обмеження

Незареєстрована діяльність **не підходить** для:
- Діяльності, яка потребує ліцензії
- Діяльності у формі товариства
- Осіб, які ліквідували JDG протягом останніх 60 місяців

### Оподаткування

Дохід оподатковується за **загальною шкалою**. Необхідно вести спрощений реєстр продажів і щороку подавати декларацію PIT-36.`,
    contentEn: `## Unregistered Business Activity in Poland

Since 2018, Polish business law (Prawo przedsiębiorców) allows small-scale income-generating activity without CEIDG registration, subject to specific conditions.

### Conditions

Activity qualifies as unregistered when:
- Monthly revenue **does not exceed 75% of the minimum wage** (in 2025: PLN 3,181.50/month in H1)
- The person has not run a registered business in the past 60 months

### What is Permitted

Under działalność nierejestrowana you may:
- Sell goods (including online via Allegro, your own store)
- Provide services to private individuals
- Engage in crafts, creative work, tutoring

### Limitations

Unregistered activity **does not apply** to:
- Activities requiring a licence or permit
- Partnership-based activity
- Persons who closed a JDG within the past 60 months

### Taxation

Income is taxed under the **general tax scale**. You must keep a simplified sales register and file an annual PIT-36 return. Exceeding the monthly limit requires JDG registration within 7 days.`,
    faqRu: [
      { q: "Что происходит при превышении месячного лимита?", a: "При превышении порога 3 181,50 зл. необходимо зарегистрировать JDG в течение 7 дней. Доход сверх лимита облагается налогом в обычном порядке." },
      { q: "Нужно ли платить ZUS при działalność nierejestrowana?", a: "Нет, взносы ZUS не уплачиваются. Однако вы не застрахованы социально и не формируете пенсионные права." },
      { q: "Можно ли продавать товары на Allegro без регистрации?", a: "Да, если ежемесячный оборот не превышает 3 181,50 зл. (2025). Allegro может запросить NIP при регистрации счёта продавца." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Co się dzieje po przekroczeniu limitu miesięcznego?", a: "Przekroczenie progu 3 181,50 zł wymaga rejestracji JDG w ciągu 7 dni. Nadwyżka ponad limit jest opodatkowana na zasadach ogólnych." },
      { q: "Czy przy działalności nierejestrowanej trzeba płacić ZUS?", a: "Nie — składki ZUS nie są należne. Nie nabywa się jednak ubezpieczenia społecznego ani uprawnień emerytalnych." },
      { q: "Czy można sprzedawać na Allegro bez rejestracji?", a: "Tak, o ile miesięczny obrót nie przekracza 3 181,50 zł (2025). Allegro może wymagać numeru NIP przy zakładaniu konta sprzedawcy." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Що відбувається при перевищенні місячного ліміту?", a: "При перевищенні порогу 3 181,50 зл. необхідно зареєструвати JDG протягом 7 днів. Дохід понад ліміт оподатковується у звичайному порядку." },
      { q: "Чи потрібно сплачувати ZUS при незареєстрованій діяльності?", a: "Ні, внески ZUS не сплачуються. Однак ви не маєте соціального страхування та не формуєте пенсійних прав." },
      { q: "Чи можна продавати товари на Allegro без реєстрації?", a: "Так, якщо щомісячний оборот не перевищує 3 181,50 зл. (2025). Allegro може запитати NIP при реєстрації акаунту продавця." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "What happens when the monthly limit is exceeded?", a: "Exceeding the PLN 3,181.50 threshold requires JDG registration within 7 days. Revenue above the limit is taxed under standard rules." },
      { q: "Do I pay ZUS contributions for unregistered activity?", a: "No — ZUS contributions are not due. However, you do not have social insurance coverage or build pension entitlements." },
      { q: "Can I sell on Allegro without registering a business?", a: "Yes, as long as monthly turnover stays below PLN 3,181.50 (2025). Allegro may request a NIP number when setting up a seller account." },
    ] satisfies FaqEntry[],
    category: "registration",
    tags: ["nierejestrowana", "działalność", "limit", "pit-36", "allegro"],
    sortOrder: 2,
    isPublished: true,
  },

  // ── 3. vat-registration ───────────────────────────────────────────────────
  {
    slug: "vat-registration",
    titleRu: "Регистрация плательщика НДС (VAT) в Польше",
    titlePl: "Rejestracja jako podatnik VAT w Polsce",
    titleUa: "Реєстрація платника ПДВ (VAT) у Польщі",
    titleEn: "VAT Registration in Poland",
    contentRu: `## Регистрация плательщика НДС (VAT) в Польше

НДС в Польше (podatek od towarów i usług — PTU/VAT) регулируется Законом о НДС от 2004 года. Стандартная ставка составляет **23%**, сниженные ставки — 8% и 5%.

### Порог обязательной регистрации

Регистрация в качестве плательщика VAT обязательна, если годовой оборот превышает **200 000 злотых**. До достижения этого порога можно применять освобождение (zwolnienie podmiotowe).

Некоторые виды деятельности обязывают к регистрации НДС **независимо от оборота**:
- Продажа новых транспортных средств
- Торговля акцизными товарами (алкоголь, табак, топливо)
- Оказание юридических и консультационных услуг

### Процедура регистрации

Для регистрации подаётся форма **VAT-R** в налоговый орган (urząd skarbowy) по месту деятельности. Регистрация платная — 170 зл. для czynny VAT (активный плательщик). Льготная регистрация zwolniony (освобождённый) — бесплатна.

### Ставки НДС в 2025 году

| Ставка | Применение |
|--------|-----------|
| 23% | Общая ставка |
| 8% | Еда (часть), отели, строительство |
| 5% | Базовые продукты питания, книги, детское питание |
| 0% | Экспорт, внутрисоюзные поставки |

### Отчётность

Плательщики НДС обязаны:
- Ежемесячно или ежеквартально подавать JPK_VAT (Jednolity Plik Kontrolny)
- Вести реестры входящих и исходящих счетов-фактур
- Выставлять счета-фактуры с НДС в течение 15 дней после окончания месяца поставки`,
    contentPl: `## Rejestracja jako podatnik VAT

Podatek od towarów i usług (VAT) w Polsce reguluje Ustawa z 2004 r. Stawka podstawowa wynosi **23%**, stawki obniżone — 8% i 5%.

### Próg obowiązkowej rejestracji

Rejestracja jako czynny podatnik VAT jest obowiązkowa po przekroczeniu obrotu **200 000 zł rocznie**. Poniżej tego progu można stosować zwolnienie podmiotowe.

Niektóre rodzaje działalności wymagają rejestracji VAT **bez względu na obrót**:
- Sprzedaż nowych środków transportu
- Handel wyrobami akcyzowymi
- Usługi prawne i doradcze

### Procedura rejestracji

Formularz **VAT-R** należy złożyć we właściwym urzędzie skarbowym. Opłata rejestracyjna wynosi 170 zł dla czynnego podatnika VAT; rejestracja jako zwolniony jest bezpłatna.

### Stawki VAT 2025

| Stawka | Zastosowanie |
|--------|-------------|
| 23% | Stawka podstawowa |
| 8% | Część artykułów spożywczych, hotele, budownictwo |
| 5% | Podstawowe artykuły żywnościowe, książki |
| 0% | Eksport, WDT |

### Obowiązki sprawozdawcze

Podatnik VAT musi miesięcznie lub kwartalnie przesyłać **JPK_VAT**, prowadzić rejestry faktur i wystawiać faktury w ciągu 15 dni od zakończenia miesiąca dostawy.`,
    contentUa: `## Реєстрація платника ПДВ (VAT) у Польщі

ПДВ у Польщі (podatek od towarów i usług) регулюється Законом від 2004 року. Стандартна ставка — **23%**, знижені ставки — 8% і 5%.

### Поріг обов'язкової реєстрації

Реєстрація як платника VAT обов'язкова при річному обороті понад **200 000 злотих**. До досягнення цього порогу можна застосовувати звільнення (zwolnienie podmiotowe).

### Процедура реєстрації

Форма **VAT-R** подається до податкового органу за місцем діяльності. Реєстраційний збір — 170 зл. для активного платника VAT.

### Ставки ПДВ 2025

| Ставка | Застосування |
|--------|-------------|
| 23% | Загальна ставка |
| 8% | Частина продуктів, готелі, будівництво |
| 5% | Базові продукти харчування, книги |
| 0% | Експорт, внутрішньосоюзні поставки |

### Звітність

Платники ПДВ зобов'язані щомісячно або щоквартально подавати **JPK_VAT** та вести реєстри рахунків-фактур.`,
    contentEn: `## VAT Registration in Poland

Polish VAT (podatek od towarów i usług) is governed by the VAT Act of 2004. The standard rate is **23%**, with reduced rates of 8% and 5%.

### Mandatory Registration Threshold

VAT registration as an active taxpayer is compulsory once annual turnover exceeds **PLN 200,000**. Below this threshold, the subjective exemption (zwolnienie podmiotowe) may apply.

Certain activities require VAT registration **regardless of turnover** — including sale of new vehicles, excise goods, and legal/advisory services.

### Registration Procedure

File form **VAT-R** at the local tax office (urząd skarbowy). The registration fee is PLN 170 for active VAT status; exempt (zwolniony) registration is free.

### VAT Rates 2025

| Rate | Application |
|------|------------|
| 23% | Standard rate |
| 8% | Some food, hotels, construction |
| 5% | Basic foodstuffs, books, baby food |
| 0% | Exports, intra-EU supply |

### Reporting Obligations

VAT payers must submit monthly or quarterly **JPK_VAT** files, maintain invoice registers, and issue VAT invoices within 15 days after the end of the delivery month.`,
    faqRu: [
      { q: "Стоит ли регистрироваться плательщиком НДС добровольно?", a: "Да, если вы работаете с бизнес-клиентами (B2B), которые сами являются плательщиками НДС. Это позволяет им вычитать входящий НДС, что делает ваше предложение более конкурентоспособным. При продажах физическим лицам добровольная регистрация увеличивает цену на 23%." },
      { q: "Что такое JPK_VAT?", a: "Jednolity Plik Kontrolny dla VAT — стандартный XML-файл, объединяющий декларацию НДС (deklaracja) и реестр операций. Подаётся ежемесячно через портал е-Деклараций." },
      { q: "Каков порог регистрации НДС для интернет-магазина?", a: "Для польских покупателей — 200 000 зл./год. При трансграничных продажах в страны ЕС действует порог OSS (One-Stop-Shop) — 10 000 евро совокупно по всем странам ЕС." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Czy warto rejestrować się jako czynny podatnik VAT dobrowolnie?", a: "Tak, jeśli obsługujesz klientów B2B będących podatnikami VAT — mogą oni odliczyć VAT naliczony. Przy sprzedaży do konsumentów (B2C) dobrowolna rejestracja podwyższa cenę o 23%." },
      { q: "Czym jest JPK_VAT?", a: "Jednolity Plik Kontrolny dla VAT to standardowy plik XML łączący deklarację podatkową z ewidencją faktur. Składa się miesięcznie przez portal e-Deklaracji." },
      { q: "Jaki próg VAT obowiązuje przy sprzedaży zagranicznej w UE?", a: "Przy sprzedaży do konsumentów w innych krajach UE obowiązuje próg OSS wynoszący 10 000 euro łącznie dla wszystkich krajów UE. Po jego przekroczeniu należy rozliczać VAT w każdym kraju lub zarejestrować się w OSS." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Чи варто реєструватися платником ПДВ добровільно?", a: "Так, якщо ви працюєте з B2B-клієнтами, які є платниками ПДВ. Вони зможуть відрахувати вхідний ПДВ, що робить вашу пропозицію конкурентнішою. При продажах фізичним особам добровільна реєстрація збільшує ціну на 23%." },
      { q: "Що таке JPK_VAT?", a: "Jednolity Plik Kontrolny dla VAT — стандартний XML-файл, що об'єднує декларацію ПДВ і реєстр операцій. Подається щомісячно через портал е-Декларацій." },
      { q: "Який поріг реєстрації ПДВ для продажів в інші країни ЄС?", a: "При трансграничних продажах споживачам в ЄС діє поріг OSS — 10 000 євро сукупно по всіх країнах ЄС. Після перевищення потрібно зареєструватися в OSS або сплачувати ПДВ у кожній країні." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "Should I register for VAT voluntarily?", a: "Yes, if you mainly serve B2B clients who are VAT payers — they can reclaim input VAT, making your offer more competitive. For B2C sales, voluntary registration increases your prices by 23%." },
      { q: "What is JPK_VAT?", a: "Jednolity Plik Kontrolny dla VAT is a standardised XML file combining the VAT return and invoice register. It is filed monthly through the e-Declarations portal." },
      { q: "What is the VAT threshold for cross-border EU sales?", a: "For sales to consumers in other EU countries, the OSS (One-Stop-Shop) threshold applies — EUR 10,000 aggregated across all EU countries. Above this, you must register for OSS or account for VAT in each destination country." },
    ] satisfies FaqEntry[],
    category: "taxation",
    tags: ["vat", "jpk", "oss", "rejestracja", "stawki"],
    sortOrder: 3,
    isPublished: true,
  },

  // ── 4. zus-overview ───────────────────────────────────────────────────────
  {
    slug: "zus-overview",
    titleRu: "Взносы ZUS для предпринимателей в Польше",
    titlePl: "Składki ZUS dla przedsiębiorców",
    titleUa: "Внески ZUS для підприємців у Польщі",
    titleEn: "ZUS Social Insurance Contributions for Entrepreneurs",
    contentRu: `## Взносы ZUS для предпринимателей

ZUS (Zakład Ubezpieczeń Społecznych) — польский орган социального страхования. Владелец JDG обязан уплачивать взносы ежемесячно.

### Льготный период

**Ulga na start (первые 6 месяцев):** освобождение от социальных взносов. Уплачивается только взнос на медицинское страхование (składka zdrowotna).

**Mały ZUS (следующие 24 месяца):** уплата взносов с преференциальной базы — 30% минимальной зарплаты.
- Emerytalne: 201,31 зл. / мес.
- Rentowe: 82,58 зл. / мес.

### Полные взносы ZUS 2025

| Взнос | Сумма (зл./мес.) |
|-------|-----------------|
| Emerytalny (пенсионный) | 812,23 |
| Rentowy (рентный) | 333,00 |
| Chorobowy (больничный, добровольный) | 101,52 |
| Wypadkowy (несчастные случаи) | 60,92 |
| FP (Фонд труда) | 42,55 |
| **Итого социальные** | **~1 350,22** |

### Składka zdrowotna (медицинская)

Размер зависит от формы налогообложения:
- Skala podatkowa: 9% от дохода (минимум 381,78 зл./мес. в 2025 г.)
- Podatek liniowy: 4,9% от дохода
- Ryczałt: фиксированная ставка в зависимости от оборота

### Mały ZUS Plus

Предприниматели с доходом менее 120 000 зл. в год могут применять **Mały ZUS Plus** (с 4-го года деятельности), исчисляя базу социальных взносов пропорционально фактическому доходу.

### Сроки уплаты

Взносы уплачиваются до **20-го числа** следующего месяца.`,
    contentPl: `## Składki ZUS dla przedsiębiorców

ZUS (Zakład Ubezpieczeń Społecznych) pobiera składki od wszystkich przedsiębiorców prowadzących JDG.

### Okres preferencyjny

**Ulga na start (pierwsze 6 miesięcy):** zwolnienie ze składek społecznych. Płaci się wyłącznie składkę zdrowotną.

**Mały ZUS (kolejne 24 miesiące):** składki od podstawy 30% minimalnego wynagrodzenia.

### Pełne składki ZUS 2025

| Składka | Kwota (zł/mies.) |
|---------|-----------------|
| Emerytalna | 812,23 |
| Rentowa | 333,00 |
| Chorobowa (dobrowolna) | 101,52 |
| Wypadkowa | 60,92 |
| FP | 42,55 |
| **Razem społeczne** | **~1 350,22** |

### Składka zdrowotna

Zależy od formy opodatkowania:
- Skala podatkowa: 9% dochodu (min. 381,78 zł/mies.)
- Podatek liniowy: 4,9% dochodu
- Ryczałt: stawka ryczałtowa wg przychodu

### Terminy płatności

Składki należy opłacać do **20. dnia** następnego miesiąca.`,
    contentUa: `## Внески ZUS для підприємців

ZUS (Zakład Ubezpieczeń Społecznych) — польський орган соціального страхування. Власник JDG зобов'язаний сплачувати внески щомісяця.

### Пільговий період

**Ulga na start (перші 6 місяців):** звільнення від соціальних внесків. Сплачується лише медичний внесок.

**Mały ZUS (наступні 24 місяці):** внески з пільгової бази — 30% мінімальної зарплати.

### Повні внески ZUS 2025

| Внесок | Сума (зл./міс.) |
|--------|----------------|
| Пенсійний (emerytalny) | 812,23 |
| Рентний (rentowy) | 333,00 |
| Лікарняний (chorobowy, добровільний) | 101,52 |
| Від нещасних випадків (wypadkowy) | 60,92 |
| FP (Фонд праці) | 42,55 |
| **Разом соціальні** | **~1 350,22** |

### Медичний внесок

Залежить від форми оподаткування:
- Skala podatkowa: 9% від доходу (мінімум 381,78 зл./міс.)
- Podatek liniowy: 4,9% від доходу
- Ryczałt: фіксована ставка залежно від обороту

### Терміни сплати

Внески сплачуються до **20-го числа** наступного місяця.`,
    contentEn: `## ZUS Social Insurance Contributions for Entrepreneurs

ZUS (Zakład Ubezpieczeń Społecznych) is Poland's social insurance institution. JDG owners must pay monthly contributions.

### Preferential Periods

**Ulga na start (first 6 months):** exemption from social contributions. Only the health contribution is due.

**Mały ZUS (next 24 months):** contributions calculated on a base of 30% of the minimum wage.

### Full ZUS Contributions 2025

| Contribution | Amount (PLN/month) |
|-------------|-------------------|
| Pension (emerytalny) | 812.23 |
| Disability (rentowy) | 333.00 |
| Sickness (chorobowy, voluntary) | 101.52 |
| Accident (wypadkowy) | 60.92 |
| Labour Fund (FP) | 42.55 |
| **Total social** | **~1,350.22** |

### Health Contribution (składka zdrowotna)

Depends on tax form:
- Tax scale (skala): 9% of income (min. PLN 381.78/month)
- Flat tax (liniowy): 4.9% of income
- Lump-sum (ryczałt): fixed rate based on revenue

### Payment Deadlines

Contributions must be paid by the **20th of the following month**.`,
    faqRu: [
      { q: "Можно ли избежать взносов ZUS в первый год деятельности?", a: "Частично. Ulga na start освобождает от социальных взносов на 6 месяцев, но медицинский взнос (składka zdrowotna) уплачивается всегда. После 6 месяцев начинается период Małego ZUS с пониженными ставками." },
      { q: "Что такое Mały ZUS Plus?", a: "Это схема, позволяющая рассчитывать базу социальных взносов пропорционально фактическому доходу. Доступна с 4-го года деятельности при доходе до 120 000 зл./год." },
      { q: "Обязателен ли взнос на случай болезни (chorobowy)?", a: "Нет, składka chorobowa является добровольной. Однако без неё вы не имеете права на больничное пособие (zasiłek chorobowy) при болезни или уходе за ребёнком." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Czy można uniknąć składek ZUS w pierwszym roku działalności?", a: "Częściowo. Ulga na start zwalnia ze składek społecznych przez 6 miesięcy, ale składka zdrowotna jest zawsze wymagana. Po 6 miesiącach rozpoczyna się okres małego ZUS-u." },
      { q: "Czym jest Mały ZUS Plus?", a: "Schemat umożliwiający obliczanie podstawy składek proporcjonalnie do rzeczywistego dochodu. Dostępny od 4. roku działalności, przy przychodzie do 120 000 zł/rok." },
      { q: "Czy składka chorobowa jest obowiązkowa?", a: "Nie — jest dobrowolna. Bez niej nie przysługuje jednak zasiłek chorobowy ani zasiłek opiekuńczy." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Чи можна уникнути внесків ZUS у перший рік діяльності?", a: "Частково. Ulga na start звільняє від соціальних внесків на 6 місяців, але медичний внесок сплачується завжди. Після 6 місяців починається період Małego ZUS з пониженими ставками." },
      { q: "Що таке Mały ZUS Plus?", a: "Схема, яка дозволяє розраховувати базу соціальних внесків пропорційно до фактичного доходу. Доступна з 4-го року діяльності при доході до 120 000 зл./рік." },
      { q: "Чи є обов'язковим внесок на випадок хвороби?", a: "Ні, składka chorobowa є добровільною. Без неї ви не маєте права на лікарняну допомогу при хворобі чи догляді за дитиною." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "Can I avoid ZUS contributions in the first year?", a: "Partially. The ulga na start exempts you from social contributions for 6 months, but the health contribution is always due. After 6 months, the reduced Mały ZUS period begins." },
      { q: "What is Mały ZUS Plus?", a: "A scheme allowing social contribution base to be calculated proportionally to actual income. Available from the 4th year of activity when annual income is below PLN 120,000." },
      { q: "Is the sickness contribution (chorobowy) mandatory?", a: "No — it is voluntary. Without it, however, you have no entitlement to sickness benefit (zasiłek chorobowy) or childcare allowance." },
    ] satisfies FaqEntry[],
    category: "registration",
    tags: ["zus", "składki", "ulga-na-start", "mały-zus", "zdrowotna"],
    sortOrder: 4,
    isPublished: true,
  },

  // ── 5. ryczalt-tax ────────────────────────────────────────────────────────
  {
    slug: "ryczalt-tax",
    titleRu: "Упрощённый налог (ryczałt) для ИП в Польше",
    titlePl: "Ryczałt od przychodów ewidencjonowanych",
    titleUa: "Єдиний податок (ryczałt) для ФОП у Польщі",
    titleEn: "Lump-Sum Tax (Ryczałt) for Sole Traders in Poland",
    contentRu: `## Ryczałt od przychodów ewidencjonowanych

Ryczałt — форма упрощённого налогообложения, при которой налог начисляется на **валовой доход** (przychód), без вычета расходов. Подходит для предпринимателей с невысокой долей затрат.

### Ставки ryczałt (2025)

| Ставка | Вид деятельности |
|--------|----------------|
| 17% | ИТ-услуги (программисты, аналитики) |
| 15% | Консультационные услуги, реклама |
| 14% | Медицинские, архитектурные услуги |
| 12% | ИТ-услуги (определённые коды PKD) |
| 10% | Покупка и продажа недвижимости |
| 8,5% | Услуги, аренда (до 100 000 зл.), торговля |
| 5,5% | Производство, строительство |
| 3% | Торговля товарами, питание |
| 2% | Продажа сельхозпродукции |

### Лимит применения

Ryczałt доступен при годовом обороте до **2 000 000 евро**.

### Składka zdrowotna при ryczałt

Ставка зависит от уровня дохода:
- До 60 000 зл./год: 419,46 зл./мес.
- 60 000–300 000 зл./год: 699,11 зл./мес.
- Свыше 300 000 зл./год: 1 258,39 зл./мес.

### Выбор и смена системы

Переход на ryczałt возможен с начала нового налогового года. Уведомление подаётся в urząd skarbowy до 20 февраля или при регистрации JDG.

### Что нельзя на ryczałt

Ryczałt недоступен для адвокатов, нотариусов, а также тех, кто оказывает услуги своему бывшему работодателю (в первые 2 года).`,
    contentPl: `## Ryczałt od przychodów ewidencjonowanych

Ryczałt to uproszczona forma opodatkowania, w której podatek naliczany jest od **przychodu** bez odliczania kosztów. Korzystna dla przedsiębiorców z niskimi kosztami działalności.

### Stawki ryczałtu (2025)

| Stawka | Rodzaj działalności |
|--------|-------------------|
| 17% | Usługi IT (programiści, analitycy) |
| 15% | Usługi doradcze, reklamowe |
| 14% | Usługi medyczne, architektoniczne |
| 12% | Usługi IT (wybrane kody PKD) |
| 10% | Kupno i sprzedaż nieruchomości |
| 8,5% | Usługi, najem (do 100 tys. zł), handel |
| 5,5% | Produkcja, roboty budowlane |
| 3% | Handel towarami, gastronomia |
| 2% | Sprzedaż produktów rolnych |

### Składka zdrowotna przy ryczałcie

Kwota zależy od poziomu przychodu:
- Do 60 000 zł/rok: 419,46 zł/mies.
- 60 000–300 000 zł/rok: 699,11 zł/mies.
- Powyżej 300 000 zł/rok: 1 258,39 zł/mies.

### Wybór i zmiana formy

Przejście na ryczałt możliwe od początku roku podatkowego. Zawiadomienie należy złożyć do 20 lutego lub przy rejestracji JDG.`,
    contentUa: `## Єдиний податок (ryczałt) для ФОП у Польщі

Ryczałt — форма спрощеного оподаткування, при якій податок нараховується на **валовий дохід** без вирахування витрат.

### Ставки ryczałt (2025)

| Ставка | Вид діяльності |
|--------|--------------|
| 17% | ІТ-послуги (програмісти) |
| 15% | Консультаційні послуги |
| 14% | Медичні, архітектурні послуги |
| 12% | ІТ-послуги (певні коди PKD) |
| 8,5% | Послуги, оренда, торгівля |
| 5,5% | Виробництво, будівництво |
| 3% | Торгівля товарами, харчування |

### Медичний внесок при ryczałt

Ставка залежить від рівня доходу:
- До 60 000 зл./рік: 419,46 зл./міс.
- 60 000–300 000 зл./рік: 699,11 зл./міс.
- Понад 300 000 зл./рік: 1 258,39 зл./міс.

### Вибір та зміна системи

Перехід на ryczałt можливий з початку нового податкового року. Повідомлення подається до 20 лютого або при реєстрації JDG.`,
    contentEn: `## Lump-Sum Tax (Ryczałt) in Poland

Ryczałt (ryczałt od przychodów ewidencjonowanych) is a simplified tax form where tax is calculated on **gross revenue** without deducting expenses. It suits entrepreneurs with low business costs.

### Ryczałt Rates (2025)

| Rate | Type of Activity |
|------|----------------|
| 17% | IT services (programmers, analysts) |
| 15% | Advisory, advertising services |
| 14% | Medical, architectural services |
| 12% | IT services (specific PKD codes) |
| 10% | Property trading |
| 8.5% | Services, rental (up to PLN 100k), trade |
| 5.5% | Manufacturing, construction |
| 3% | Goods trading, catering |
| 2% | Agricultural produce sales |

### Health Contribution under Ryczałt

The fixed monthly amount depends on revenue level:
- Up to PLN 60,000/year: PLN 419.46/month
- PLN 60,000–300,000/year: PLN 699.11/month
- Over PLN 300,000/year: PLN 1,258.39/month

### Switching to Ryczałt

Switch is possible from the start of the next tax year. Notification must be filed by 20 February or at JDG registration.`,
    faqRu: [
      { q: "Выгоден ли ryczałt для программиста?", a: "Зависит от расходов. При ставке 12% и минимальных расходах ryczałt часто выгоднее podatku liniowego (19%). Если годовой доход около 200 000 зл., а расходы низкие — ryczałt обычно лучше." },
      { q: "Можно ли совмещать разные ставки ryczałt?", a: "Да, если вы ведёте несколько видов деятельности с разными ставками. Необходимо вести раздельный учёт доходов по каждому виду деятельности." },
      { q: "Нужно ли вести KPiR при ryczałt?", a: "Нет. При ryczałt ведётся только ewidencja przychodów (реестр доходов), а не полная книга KPiR. Это существенно упрощает учёт." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Czy ryczałt jest korzystny dla programisty?", a: "Zależy od kosztów. Przy stawce 12% i niskich kosztach ryczałt bywa korzystniejszy niż podatek liniowy (19%). Dla przychodu ok. 200 000 zł i niskich kosztach ryczałt zwykle wychodzi lepiej." },
      { q: "Czy można łączyć różne stawki ryczałtu?", a: "Tak, jeśli prowadzi się działalności o różnych stawkach. Konieczne jest odrębne ewidencjonowanie przychodów z każdego rodzaju działalności." },
      { q: "Czy przy ryczałcie trzeba prowadzić KPiR?", a: "Nie — prowadzi się tylko ewidencję przychodów, nie pełną KPiR. Znacznie upraszcza to obowiązki księgowe." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Чи вигідний ryczałt для програміста?", a: "Залежить від витрат. При ставці 12% та мінімальних витратах ryczałt часто вигідніший за podatek liniowy (19%). При річному доході близько 200 000 зл. і низьких витратах ryczałt зазвичай кращий." },
      { q: "Чи можна поєднувати різні ставки ryczałt?", a: "Так, якщо ви ведете кілька видів діяльності з різними ставками. Необхідно вести окремий облік доходів за кожним видом діяльності." },
      { q: "Чи потрібно вести KPiR при ryczałt?", a: "Ні. При ryczałt ведеться лише ewidencja przychodów (реєстр доходів), а не повна книга KPiR. Це суттєво спрощує облік." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "Is ryczałt advantageous for a programmer?", a: "It depends on expenses. At the 12% rate with low costs, ryczałt is often more favourable than flat tax (19%). For income around PLN 200,000 with minimal expenses, ryczałt usually wins." },
      { q: "Can different ryczałt rates be combined?", a: "Yes, if you conduct multiple activities with different rates. You must keep separate records of revenue for each type of activity." },
      { q: "Do I need to keep KPiR records under ryczałt?", a: "No — only an ewidencja przychodów (revenue register) is required, not the full KPiR ledger. This significantly simplifies bookkeeping." },
    ] satisfies FaqEntry[],
    category: "taxation",
    tags: ["ryczałt", "podatek", "stawki", "it", "ewidencja"],
    sortOrder: 5,
    isPublished: true,
  },

  // ── 6. linear-tax ─────────────────────────────────────────────────────────
  {
    slug: "linear-tax",
    titleRu: "Фиксированный налог (podatek liniowy) для ИП",
    titlePl: "Podatek liniowy dla przedsiębiorców",
    titleUa: "Фіксований податок (podatek liniowy) для ФОП",
    titleEn: "Flat Tax (Podatek Liniowy) for Sole Traders",
    contentRu: `## Podatek liniowy — фиксированный налог для предпринимателей

Podatek liniowy — система налогообложения со ставкой **19%** на налогооблагаемый доход (przychód минус koszty). В отличие от skali podatkowej, ставка не зависит от размера дохода.

### Преимущества

- Единая ставка 19% — выгодна при доходе свыше ~120 000 зл./год
- Можно вычитать все обоснованные бизнес-расходы (koszty uzyskania przychodu)
- Предсказуемость налоговой нагрузки

### Недостатки

- Нельзя использовать совместную декларацию с супругом
- Нельзя применять льготу для одиноких родителей
- Нет прогрессивного вычета (kwota wolna 30 000 зл.)
- Składka zdrowotna: 4,9% от дохода (не менее 381,78 зл./мес.)

### Сравнение с другими системами

| Система | Ставка | Особенности |
|---------|--------|-------------|
| Skala podatkowa | 12% / 32% | Kwota wolna 30 000 зл., совместная декларация |
| Podatek liniowy | 19% | Нет прогрессии, вычет расходов |
| Ryczałt | 2–17% | Налог с оборота, нет вычета расходов |

### Когда выгоден podatek liniowy

Podatek liniowy выгоден, если:
- Годовой налогооблагаемый доход превышает 120 000 зл.
- Есть значительные бизнес-расходы для вычета
- Не планируете совместное декларирование с супругом

### Ведение учёта

Необходимо вести **KPiR** (Księga Przychodów i Rozchodów) — упрощённую книгу учёта доходов и расходов. Авансовые платежи по налогу уплачиваются ежемесячно или ежеквартально.`,
    contentPl: `## Podatek liniowy dla przedsiębiorców

Podatek liniowy to forma opodatkowania ze stałą stawką **19%** od dochodu (przychód minus koszty). Stawka nie zależy od wysokości dochodu.

### Zalety

- Stała stawka 19% — korzystna przy dochodzie powyżej ok. 120 000 zł/rok
- Możliwość odliczania kosztów uzyskania przychodu
- Przewidywalność obciążeń podatkowych

### Wady

- Brak możliwości wspólnego rozliczenia z małżonkiem
- Brak kwoty wolnej od podatku (30 000 zł)
- Składka zdrowotna: 4,9% dochodu (min. 381,78 zł/mies.)

### Kiedy podatek liniowy jest korzystny

Podatek liniowy opłaca się, gdy:
- Roczny dochód przekracza ok. 120 000 zł
- Ponoszone są znaczące koszty działalności
- Nie planuje się wspólnego rozliczenia z małżonkiem

### Ewidencja

Wymagane jest prowadzenie **KPiR**. Zaliczki na podatek opłaca się miesięcznie lub kwartalnie.`,
    contentUa: `## Фіксований податок (podatek liniowy) для ФОП

Podatek liniowy — система оподаткування зі ставкою **19%** на оподатковуваний дохід (дохід мінус витрати). Ставка не залежить від розміру доходу.

### Переваги

- Єдина ставка 19% — вигідна при доході понад ~120 000 зл./рік
- Можна відраховувати всі обґрунтовані бізнес-витрати
- Передбачуваність податкового навантаження

### Недоліки

- Не можна використовувати спільну декларацію з чоловіком/дружиною
- Відсутня неоподатковувана сума (kwota wolna 30 000 зл.)
- Składka zdrowotna: 4,9% від доходу (мінімум 381,78 зл./міс.)

### Коли вигідний podatek liniowy

Вигідний, якщо:
- Річний оподатковуваний дохід перевищує 120 000 зл.
- Є значні бізнес-витрати для відрахування
- Не плануєте спільне декларування з чоловіком/дружиною

### Ведення обліку

Необхідно вести **KPiR**. Авансові платежі з податку сплачуються щомісячно або щоквартально.`,
    contentEn: `## Flat Tax (Podatek Liniowy) for Sole Traders

Podatek liniowy is a tax system with a fixed rate of **19%** applied to taxable income (revenue minus expenses). The rate does not depend on income level.

### Advantages

- Fixed 19% rate — favourable once annual income exceeds ~PLN 120,000
- Full deduction of legitimate business expenses (koszty uzyskania przychodu)
- Predictable tax liability

### Disadvantages

- Cannot file a joint return with a spouse
- No tax-free allowance (kwota wolna PLN 30,000)
- Health contribution: 4.9% of income (min. PLN 381.78/month)

### When Flat Tax Makes Sense

Flat tax is beneficial when:
- Annual taxable income exceeds ~PLN 120,000
- Significant deductible business expenses exist
- Joint spousal tax filing is not planned

### Bookkeeping

**KPiR** (simplified revenue and expense ledger) is required. Tax advances are paid monthly or quarterly.`,
    faqRu: [
      { q: "При каком доходе лучше переходить на podatek liniowy?", a: "При налогооблагаемом доходе свыше 120 000 зл./год, поскольку именно с этой суммы начинается ставка 32% при skali podatkowej. Ниже этого порога skala podatkowa выгоднее из-за kwoty wolnej (30 000 зл.)." },
      { q: "Можно ли перейти с liniowego на ryczałt?", a: "Да, смена формы налогообложения возможна с начала следующего налогового года. Уведомление подаётся до 20 февраля." },
      { q: "Можно ли при podatek liniowy вычесть взносы ZUS?", a: "Социальные взносы ZUS вычитаются из дохода (базы для налога). Składka zdrowotna (4,9%) с 2022 года не вычитается из налоговой базы при liniowym." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Przy jakim dochodzie warto przejść na podatek liniowy?", a: "Przy dochodzie powyżej ok. 120 000 zł/rok, bo od tej kwoty na skali obowiązuje stawka 32%. Poniżej tego progu skala podatkowa jest korzystniejsza dzięki kwocie wolnej (30 000 zł)." },
      { q: "Czy można zmienić podatek liniowy na ryczałt?", a: "Tak — zmiana formy opodatkowania możliwa od początku kolejnego roku. Zawiadomienie składa się do 20 lutego." },
      { q: "Czy przy podatku liniowym można odliczyć składki ZUS?", a: "Składki społeczne ZUS odlicza się od dochodu. Składka zdrowotna (4,9%) od 2022 roku nie podlega odliczeniu od podstawy opodatkowania na liniowym." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "При якому доході краще переходити на podatek liniowy?", a: "При оподатковуваному доході понад 120 000 зл./рік, оскільки саме з цієї суми починається ставка 32% при skali podatkowej. Нижче цього порогу skala podatkowa вигідніша через kwotę wolną (30 000 зл.)." },
      { q: "Чи можна змінити liniowy на ryczałt?", a: "Так, зміна форми оподаткування можлива з початку наступного податкового року. Повідомлення подається до 20 лютого." },
      { q: "Чи можна при podatek liniowy відрахувати внески ZUS?", a: "Соціальні внески ZUS відраховуються від доходу. Składka zdrowotna (4,9%) з 2022 року не відраховується від податкової бази при liniowym." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "At what income level does flat tax become beneficial?", a: "When taxable income exceeds ~PLN 120,000/year — that is the point where the 32% band kicks in under the general tax scale. Below this threshold, the general scale is better due to the PLN 30,000 tax-free allowance." },
      { q: "Can I switch from flat tax to ryczałt?", a: "Yes — a change of tax form is possible from the start of the following tax year. Notification must be filed by 20 February." },
      { q: "Can ZUS contributions be deducted under flat tax?", a: "Social ZUS contributions are deducted from income (tax base). The health contribution (4.9%) has not been deductible from the flat tax base since 2022." },
    ] satisfies FaqEntry[],
    category: "taxation",
    tags: ["podatek-liniowy", "19%", "kpir", "koszty", "dochód"],
    sortOrder: 6,
    isPublished: true,
  },

  // ── 7. inpost-contracts ───────────────────────────────────────────────────
  {
    slug: "inpost-contracts",
    titleRu: "Договоры с InPost: условия для интернет-магазинов",
    titlePl: "Umowy z InPost dla sklepów internetowych",
    titleUa: "Договори з InPost: умови для інтернет-магазинів",
    titleEn: "InPost Contracts for E-commerce Businesses",
    contentRu: `## Договоры с InPost для интернет-магазинов

InPost — крупнейший оператор постаматов (Paczkomat) и курьерских услуг в Польше. Для интернет-магазинов существуют специальные бизнес-тарифы, отличающиеся от розничных цен.

### Типы договоров

**Indywidualna umowa API** — для магазинов с объёмом от ~200 отправлений в месяц. Предоставляет:
- Индивидуальные тарифы
- Интеграцию через API (REST)
- Доступ к панели Manager InPost
- Możliwość integracji z platformami (WooCommerce, PrestaShop, Shoper)

**Umowa przez Allegro/marketplace** — для мелких продавцов: этикетки оплачиваются по ставкам площадки.

### Тарифы и стоимость

Цены зависят от объёма, размера посылки и типа доставки:
- Paczkomat (до постамата): примерно 8–12 зл. за посылку при объёме
- Kurier (курьер до двери): примерно 12–18 зл.
- Gabaryt (крупные посылки): отдельный тариф

### Интеграция

InPost предоставляет:
- **API ShipX** — современный REST API для создания отправлений, печати этикеток, отслеживания
- **Библиотеки** для PHP, Python, JS
- **Webhook** уведомления о статусах

### Ответственность и страхование

Базовая страховка — до 500 зл. Для дорогостоящих товаров рекомендуется **ubezpieczenie dodatkowe** (дополнительное страхование) за отдельную плату.

### Условия договора

Договор обычно заключается на 12 или 24 месяца. При досрочном расторжении возможны штрафные санкции за недостижение минимального объёма.`,
    contentPl: `## Umowy z InPost dla sklepów internetowych

InPost to największy operator paczkomatów i usług kurierskich w Polsce. Dla sklepów online dostępne są specjalne taryfy biznesowe.

### Rodzaje umów

**Indywidualna umowa API** — dla sklepów wysyłających min. ok. 200 paczek/mies.:
- Indywidualne stawki
- Integracja przez API (ShipX)
- Dostęp do panelu Manager InPost
- Integracja z WooCommerce, PrestaShop, Shoper

**Umowa przez marketplace** — dla małych sprzedawców korzystających z taryf platformy.

### Stawki i koszty

Ceny zależą od wolumenu, rozmiaru i rodzaju dostawy:
- Paczkomat: ok. 8–12 zł za przesyłkę przy wolumenie
- Kurier door-to-door: ok. 12–18 zł
- Gabaryt: osobna taryfikacja

### Integracja

InPost udostępnia **API ShipX** do tworzenia przesyłek, drukowania etykiet i śledzenia statusów, z bibliotekami dla PHP, Python i JS.

### Odpowiedzialność i ubezpieczenie

Podstawowe ubezpieczenie — do 500 zł. Dla towarów o wyższej wartości zalecane jest ubezpieczenie dodatkowe.

### Warunki umowy

Umowy zawierane są zazwyczaj na 12 lub 24 miesiące z klauzulą minimalnego wolumenu.`,
    contentUa: `## Договори з InPost для інтернет-магазинів

InPost — найбільший оператор поштоматів (Paczkomat) та кур'єрських послуг у Польщі. Для інтернет-магазинів існують спеціальні бізнес-тарифи.

### Типи договорів

**Індивідуальна угода API** — для магазинів з обсягом від ~200 відправлень на місяць:
- Індивідуальні тарифи
- Інтеграція через API (ShipX)
- Доступ до панелі Manager InPost

**Угода через маркетплейс** — для дрібних продавців.

### Тарифи та вартість

- Paczkomat (до поштомату): приблизно 8–12 зл. за посилку
- Кур'єр (до дверей): приблизно 12–18 зл.
- Великогабаритні посилки: окремий тариф

### Інтеграція

InPost надає **API ShipX** для створення відправлень, друку етикеток та відстеження статусів.

### Відповідальність та страхування

Базове страхування — до 500 зл. Для дорогих товарів рекомендується додаткове страхування.`,
    contentEn: `## InPost Contracts for E-commerce Businesses

InPost is Poland's largest parcel locker (Paczkomat) and courier operator. Special business rates are available for online stores.

### Contract Types

**Individual API Agreement** — for stores shipping ~200+ parcels/month:
- Negotiated rates
- API integration (ShipX REST API)
- Manager InPost dashboard access
- Integration with WooCommerce, PrestaShop, Shoper

**Marketplace agreement** — for smaller sellers using platform rates.

### Pricing

Prices depend on volume, parcel size, and delivery type:
- Paczkomat (locker-to-locker): ~PLN 8–12 per parcel at volume
- Courier door-to-door: ~PLN 12–18
- Oversized parcels: separate tariff

### Integration

InPost provides the **ShipX API** (REST) for creating shipments, printing labels, tracking, and webhook status notifications. SDKs available for PHP, Python, and JavaScript.

### Liability and Insurance

Base insurance covers up to PLN 500. For higher-value goods, **additional insurance** (ubezpieczenie dodatkowe) is available for an extra fee.

### Contract Terms

Agreements are typically signed for 12 or 24 months with a minimum volume clause.`,
    faqRu: [
      { q: "Как заключить договор с InPost для интернет-магазина?", a: "Нужно подать заявку через сайт inpost.pl (раздел dla firm) или через аккаунт-менеджера. После проверки объёмов отправляется предложение с индивидуальными тарифами." },
      { q: "Можно ли интегрировать InPost с WooCommerce?", a: "Да. Существует официальный плагин InPost для WooCommerce, а также интеграции через API ShipX. После заключения договора вы получаете токен API для настройки." },
      { q: "Что делать, если посылка потеряна или повреждена?", a: "Необходимо подать рекламацию (reklamacja) через панель Manager InPost или письменно в течение 14 дней с момента обнаружения ущерба. Базовое возмещение — до 500 зл., при дополнительном страховании — до застрахованной суммы." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Jak zawrzeć umowę z InPost dla sklepu internetowego?", a: "Należy złożyć wniosek przez inpost.pl (dział dla firm) lub skontaktować się z opiekunem klienta. Po weryfikacji wolumenów przesyłana jest oferta z indywidualnymi stawkami." },
      { q: "Czy InPost można zintegrować z WooCommerce?", a: "Tak. Dostępna jest oficjalna wtyczka InPost dla WooCommerce oraz integracja przez API ShipX. Po zawarciu umowy otrzymujesz token API do konfiguracji." },
      { q: "Co zrobić przy zagubieniu lub uszkodzeniu przesyłki?", a: "Należy złożyć reklamację przez panel Manager InPost lub pisemnie w ciągu 14 dni od stwierdzenia szkody. Podstawowe odszkodowanie — do 500 zł, przy ubezpieczeniu dodatkowym — do ubezpieczonej kwoty." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Як укласти договір з InPost для інтернет-магазину?", a: "Потрібно подати заявку через сайт inpost.pl (розділ dla firm) або через менеджера. Після перевірки обсягів надсилається пропозиція з індивідуальними тарифами." },
      { q: "Чи можна інтегрувати InPost з WooCommerce?", a: "Так. Є офіційний плагін InPost для WooCommerce, а також інтеграції через API ShipX. Після укладення договору ви отримуєте токен API для налаштування." },
      { q: "Що робити при втраті або пошкодженні посилки?", a: "Необхідно подати рекламацію через панель Manager InPost або письмово протягом 14 днів з моменту виявлення збитку. Базове відшкодування — до 500 зл." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "How do I get an InPost business contract?", a: "Submit an application via inpost.pl (dla firm section) or contact an account manager. After volume verification, you receive a personalised rate offer." },
      { q: "Can InPost be integrated with WooCommerce?", a: "Yes. An official InPost WooCommerce plugin exists, plus ShipX API integration. After signing the contract, you receive an API token for configuration." },
      { q: "What to do if a parcel is lost or damaged?", a: "File a claim (reklamacja) through the Manager InPost panel or in writing within 14 days of discovering the damage. Base compensation is up to PLN 500; with additional insurance, up to the insured amount." },
    ] satisfies FaqEntry[],
    category: "logistics",
    tags: ["inpost", "paczkomat", "api", "shipx", "kurier", "woocommerce"],
    sortOrder: 7,
    isPublished: true,
  },

  // ── 8. trademark-poland ───────────────────────────────────────────────────
  {
    slug: "trademark-poland",
    titleRu: "Регистрация торговой марки в Польше (UPRP)",
    titlePl: "Rejestracja znaku towarowego w Polsce (UPRP)",
    titleUa: "Реєстрація торговельної марки в Польщі (UPRP)",
    titleEn: "Trademark Registration in Poland (UPRP)",
    contentRu: `## Регистрация торговой марки в Польше

Торговые марки в Польше регистрируются через **UPRP** (Urząd Patentowy Rzeczypospolitej Polskiej — Патентное ведомство Польши).

### Что можно зарегистрировать

Знаком могут быть:
- Словесные обозначения (название бренда, слоган)
- Логотипы и изображения
- Комбинированные знаки
- Трёхмерные обозначения, цвета, звуки

### Процедура регистрации

1. **Поиск** — перед подачей рекомендуется провести поиск по базе UPRP и EUIPO на предмет схожих знаков
2. **Подача заявки** — онлайн через e-urząd UPRP или в бумажном виде
3. **Формальная экспертиза** — проверка полноты документов (~1 мес.)
4. **Экспертиза по существу** — проверка абсолютных оснований для отказа (~6–12 мес.)
5. **Публикация** — в Biuletyn Urzędu Patentowego (3 месяца для возражений)
6. **Регистрация** — выдача свидетельства

### Стоимость

| Этап | Пошлина |
|------|---------|
| Подача заявки (1 класс МКТУ) | 450 зл. |
| Каждый дополнительный класс | 120 зл. |
| Регистрация и свидетельство | 400 зл. |

### Срок защиты

Знак защищается **10 лет** с даты подачи заявки с возможностью неограниченного продления на 10-летние периоды.

### Классы МКТУ

Регистрация ведётся по классам Международной классификации товаров и услуг (МКТУ/Nice Classification). Для e-commerce обычно актуальны классы 35 (розничная торговля), 9 (ПО), 38 (телекоммуникации).`,
    contentPl: `## Rejestracja znaku towarowego w Polsce

Znaki towarowe w Polsce rejestruje **UPRP** (Urząd Patentowy Rzeczypospolitej Polskiej).

### Co można zarejestrować

Znakiem może być:
- Oznaczenie słowne (nazwa marki, slogan)
- Logotyp, grafika
- Znak kombinowany
- Oznaczenia trójwymiarowe, kolory, dźwięki

### Procedura rejestracji

1. Wyszukanie w bazie UPRP i EUIPO
2. Zgłoszenie online przez e-urząd UPRP lub papierowo
3. Badanie formalne (~1 mies.)
4. Badanie merytoryczne (~6–12 mies.)
5. Publikacja w Biuletynie UP RP (3 miesiące na sprzeciwy)
6. Rejestracja i wydanie świadectwa

### Opłaty

| Etap | Opłata |
|------|--------|
| Zgłoszenie (1 klasa) | 450 zł |
| Każda kolejna klasa | 120 zł |
| Rejestracja i świadectwo | 400 zł |

### Okres ochrony

Znak chroniony jest przez **10 lat** od daty zgłoszenia z możliwością nieograniczonego przedłużania.`,
    contentUa: `## Реєстрація торговельної марки в Польщі

Торговельні марки в Польщі реєструються через **UPRP** (Патентне відомство Польщі).

### Що можна зареєструвати

Знаком можуть бути:
- Словесні позначення (назва бренду, слоган)
- Логотипи та зображення
- Комбіновані знаки
- Тривимірні позначення, кольори, звуки

### Процедура реєстрації

1. Пошук по базі UPRP та EUIPO
2. Подача заявки онлайн через e-urząd UPRP
3. Формальна експертиза (~1 міс.)
4. Експертиза по суті (~6–12 міс.)
5. Публікація в Biuletynie UP RP (3 місяці для заперечень)
6. Реєстрація та видача свідоцтва

### Вартість

| Етап | Мито |
|------|------|
| Подача заявки (1 клас) | 450 зл. |
| Кожний додатковий клас | 120 зл. |
| Реєстрація та свідоцтво | 400 зл. |

### Строк захисту

Знак захищається **10 років** з можливістю необмеженого продовження.`,
    contentEn: `## Trademark Registration in Poland (UPRP)

Trademarks in Poland are registered with **UPRP** (Urząd Patentowy Rzeczypospolitej Polskiej — Polish Patent Office).

### What Can Be Registered

A trademark can consist of:
- Word marks (brand name, slogan)
- Logos and figurative elements
- Combined marks
- 3D shapes, colours, sounds

### Registration Procedure

1. Prior art search in the UPRP and EUIPO databases
2. Filing online via the e-urząd UPRP portal or in paper form
3. Formal examination (~1 month)
4. Substantive examination (~6–12 months)
5. Publication in the Official Bulletin (3-month opposition period)
6. Registration and certificate issuance

### Fees

| Stage | Fee |
|-------|-----|
| Application filing (1 class) | PLN 450 |
| Each additional class | PLN 120 |
| Registration and certificate | PLN 400 |

### Protection Period

A trademark is protected for **10 years** from the filing date, renewable indefinitely in 10-year increments.

### Nice Classification

Registration is class-based (Nice Classification). For e-commerce, relevant classes typically include Class 35 (retail services), Class 9 (software), and Class 38 (telecommunications).`,
    faqRu: [
      { q: "Сколько времени занимает регистрация знака в UPRP?", a: "В среднем 12–18 месяцев от подачи заявки до получения свидетельства. Возможно ускорение при процедуре przyspieszenie za opłatą." },
      { q: "Защищает ли польский знак от использования в других странах ЕС?", a: "Нет. Польский знак действует только на территории Польши. Для защиты во всём ЕС нужно зарегистрировать Знак ЕС (EUTM) через EUIPO." },
      { q: "Что делать, если кто-то уже использует похожее название?", a: "Нужно оценить степень сходства и классы товаров/услуг. Если знак уже зарегистрирован — возможна подача sprzeciwu (возражения) или переговоры. Рекомендуется консультация с rzecznikiem patentowym." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Ile trwa rejestracja znaku towarowego w UPRP?", a: "Średnio 12–18 miesięcy od zgłoszenia do wydania świadectwa. Możliwe przyspieszenie postępowania za dodatkową opłatą." },
      { q: "Czy polski znak towarowy chroni w całej UE?", a: "Nie — obowiązuje wyłącznie na terytorium Polski. Ochronę w całej UE zapewnia Znak Towarowy Unii Europejskiej (EUTM) rejestrowany przez EUIPO." },
      { q: "Co zrobić, gdy ktoś już używa podobnej nazwy?", a: "Należy ocenić stopień podobieństwa i klasy towarów/usług. Jeśli znak jest już zarejestrowany, można złożyć sprzeciw lub podjąć negocjacje. Zalecana konsultacja z rzecznikiem patentowym." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Скільки часу займає реєстрація знака в UPRP?", a: "В середньому 12–18 місяців від подачі заявки до отримання свідоцтва. Можливе прискорення за додаткову плату." },
      { q: "Чи захищає польський знак у всьому ЄС?", a: "Ні, польський знак діє лише на території Польщі. Для захисту у всьому ЄС потрібно зареєструвати Знак ЄС (EUTM) через EUIPO." },
      { q: "Що робити, якщо хтось вже використовує схожу назву?", a: "Потрібно оцінити ступінь схожості та класи товарів/послуг. Якщо знак вже зареєстровано — можлива подача заперечення або переговори. Рекомендується консультація з rzecznikiem patentowym." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "How long does trademark registration at UPRP take?", a: "On average 12–18 months from filing to certificate issuance. An accelerated procedure is available for an additional fee." },
      { q: "Does a Polish trademark protect across the EU?", a: "No — it covers Poland only. For EU-wide protection, register an EU Trade Mark (EUTM) through EUIPO." },
      { q: "What if someone is already using a similar name?", a: "Assess the degree of similarity and relevant goods/services classes. If the mark is already registered, you may file an opposition or negotiate a coexistence agreement. Consultation with a patent attorney (rzecznik patentowy) is strongly recommended." },
    ] satisfies FaqEntry[],
    category: "intellectual-property",
    tags: ["znak-towarowy", "uprp", "trademark", "mktü", "nice-classification"],
    sortOrder: 8,
    isPublished: true,
  },

  // ── 9. trademark-eu ───────────────────────────────────────────────────────
  {
    slug: "trademark-eu",
    titleRu: "Регистрация товарного знака ЕС (EUTM) через EUIPO",
    titlePl: "Rejestracja znaku towarowego UE (EUTM) przez EUIPO",
    titleUa: "Реєстрація товарного знаку ЄС (EUTM) через EUIPO",
    titleEn: "EU Trade Mark (EUTM) Registration via EUIPO",
    contentRu: `## Товарный знак ЕС (EUTM)

Знак Европейского союза (EUTM — European Union Trade Mark) регистрируется через **EUIPO** (Ведомство по интеллектуальной собственности ЕС, штаб-квартира в Аликанте). Один знак обеспечивает охрану во всех 27 государствах — членах ЕС.

### Преимущества EUTM перед национальными знаками

- Единая регистрация для всего ЕС
- Единая пошлина и процедура
- Принцип унитарности — знак действует однородно по всему ЕС
- Возможность конвертации в национальные заявки при отказе

### Процедура регистрации

1. Поиск в базе eSearch plus (EUIPO)
2. Подача онлайн-заявки через портал EUIPO
3. Экспертиза абсолютных оснований для отказа
4. Публикация в Official Journal of EUIPO (3 месяца для возражений)
5. Регистрация при отсутствии возражений

### Стоимость (2025)

| Тип | Пошлина |
|-----|---------|
| Заявка онлайн (1 класс) | 850 EUR |
| Второй класс | +50 EUR |
| Каждый последующий класс | +150 EUR |

### Срок и продление

Охрана — **10 лет** с даты подачи, продление на 10-летние периоды (850 EUR за класс).

### Опасности

EUTM может быть признан недействительным по всему ЕС, если:
- Знак не использовался 5 лет подряд (revocation for non-use)
- Есть более ранний конфликтующий знак хотя бы в одной стране ЕС`,
    contentPl: `## Znak Towarowy Unii Europejskiej (EUTM)

EUTM rejestruje **EUIPO** (Urząd Unii Europejskiej ds. Własności Intelektualnej). Jeden znak zapewnia ochronę we wszystkich 27 państwach UE.

### Zalety EUTM

- Jedna rejestracja dla całej UE
- Jednolita opłata i procedura
- Możliwość konwersji na krajowe zgłoszenia w razie odmowy

### Procedura

1. Wyszukiwanie w bazie eSearch plus
2. Zgłoszenie online przez portal EUIPO
3. Badanie bezwzględnych podstaw odmowy
4. Publikacja w Official Journal EUIPO (3 miesiące na sprzeciwy)
5. Rejestracja

### Opłaty (2025)

| Typ | Opłata |
|-----|--------|
| Zgłoszenie online (1 klasa) | 850 EUR |
| Druga klasa | +50 EUR |
| Każda kolejna klasa | +150 EUR |

### Okres ochrony

**10 lat** od daty zgłoszenia; przedłużenie co 10 lat.`,
    contentUa: `## Товарний знак ЄС (EUTM)

EUTM реєструється через **EUIPO** (Відомство з інтелектуальної власності ЄС). Один знак забезпечує охорону у всіх 27 державах-членах ЄС.

### Переваги EUTM

- Єдина реєстрація для всього ЄС
- Єдине мито та процедура
- Можливість конвертації в національні заявки при відмові

### Процедура

1. Пошук у базі eSearch plus
2. Подача онлайн-заявки через портал EUIPO
3. Експертиза абсолютних підстав для відмови
4. Публікація в Official Journal EUIPO (3 місяці для заперечень)
5. Реєстрація

### Вартість (2025)

| Тип | Мито |
|-----|------|
| Заявка онлайн (1 клас) | 850 EUR |
| Другий клас | +50 EUR |
| Кожний наступний клас | +150 EUR |

### Строк охорони

**10 років** від дати подачі; продовження кожні 10 років.`,
    contentEn: `## EU Trade Mark (EUTM) via EUIPO

The EU Trade Mark (EUTM) is registered through **EUIPO** (European Union Intellectual Property Office, based in Alicante). A single registration provides protection across all 27 EU member states.

### Advantages of EUTM

- Single registration for the entire EU
- One fee and one procedure
- Unitary character — the mark operates uniformly across the EU
- Conversion to national applications possible if registration is refused

### Registration Procedure

1. Prior art search in the eSearch plus database
2. Online application via the EUIPO portal
3. Examination of absolute grounds for refusal
4. Publication in the EUIPO Official Journal (3-month opposition period)
5. Registration if no oppositions are upheld

### Fees (2025)

| Type | Fee |
|------|-----|
| Online application (1 class) | EUR 850 |
| Second class | +EUR 50 |
| Each subsequent class | +EUR 150 |

### Duration and Renewal

Protection lasts **10 years** from the filing date, renewable every 10 years for EUR 850 per class.

### Key Risks

An EUTM can be revoked EU-wide if the mark has not been genuinely used for 5 consecutive years, or if an earlier conflicting mark exists in any EU member state.`,
    faqRu: [
      { q: "Чем EUTM лучше, чем регистрировать знак в каждой стране отдельно?", a: "EUTM значительно дешевле и быстрее, чем регистрация в 27 странах ЕС по отдельности. Одна процедура, одна пошлина, один сертификат действуют на весь ЕС. Однако если в одной стране есть препятствие — это может заблокировать всю регистрацию." },
      { q: "Сколько времени занимает регистрация EUTM?", a: "При отсутствии возражений — около 4–6 месяцев. При подаче возражений третьими сторонами процедура может занять 1–2 года." },
      { q: "Нужен ли польский адрес для подачи заявки на EUTM?", a: "Нет. Заявку на EUTM может подать любое физическое или юридическое лицо из любой страны мира через портал EUIPO. Адрес в ЕС необходим только для некоторых процедурных вопросов или при привлечении поверенного." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Czym EUTM różni się od rejestracji krajowej?", a: "EUTM jest znacznie tańszy i szybszy niż rejestracja w 27 krajach UE osobno. Jedna procedura, jedna opłata, jeden certyfikat — dla całej UE. Wadą jest unitarny charakter: przeszkoda w jednym kraju może zablokować całe zgłoszenie." },
      { q: "Ile trwa rejestracja EUTM?", a: "Przy braku sprzeciwów — ok. 4–6 miesięcy. Jeśli wpłyną sprzeciwy, procedura może trwać 1–2 lata." },
      { q: "Czy potrzebny jest adres w Polsce do złożenia wniosku o EUTM?", a: "Nie. Wniosek o EUTM może złożyć każda osoba fizyczna lub prawna z dowolnego kraju przez portal EUIPO. Adres w UE wymagany jest jedynie w określonych sytuacjach proceduralnych." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Чим EUTM кращий за реєстрацію знака в кожній країні окремо?", a: "EUTM значно дешевший і швидший, ніж реєстрація у 27 країнах ЄС окремо. Одна процедура, одне мито, один сертифікат — для всього ЄС. Однак якщо в одній країні є перешкода — це може заблокувати всю реєстрацію." },
      { q: "Скільки часу займає реєстрація EUTM?", a: "За відсутності заперечень — близько 4–6 місяців. При подачі заперечень третіми сторонами процедура може тривати 1–2 роки." },
      { q: "Чи потрібна польська адреса для подачі заявки на EUTM?", a: "Ні. Заявку на EUTM може подати будь-яка фізична або юридична особа з будь-якої країни через портал EUIPO." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "Why choose EUTM over national registrations?", a: "EUTM is far cheaper and faster than registering separately in all 27 EU countries. One procedure, one fee, one certificate covers the entire EU. The drawback is its unitary character — an obstacle in one country can block the entire registration." },
      { q: "How long does EUTM registration take?", a: "Without oppositions — approximately 4–6 months. If third-party oppositions are filed, the procedure can take 1–2 years." },
      { q: "Do I need a Polish address to file an EUTM application?", a: "No. Any natural or legal person from any country worldwide can file via the EUIPO portal. An EU address is only required in certain procedural situations or when appointing a representative." },
    ] satisfies FaqEntry[],
    category: "intellectual-property",
    tags: ["eutm", "euipo", "znak-towarowy", "eu", "trademark"],
    sortOrder: 9,
    isPublished: true,
  },

  // ── 10. ean-gs1 ───────────────────────────────────────────────────────────
  {
    slug: "ean-gs1",
    titleRu: "Получение кодов EAN/GS1 для товаров в Польше",
    titlePl: "Uzyskanie kodów EAN/GS1 dla produktów w Polsce",
    titleUa: "Отримання кодів EAN/GS1 для товарів у Польщі",
    titleEn: "Getting EAN/GS1 Barcodes for Products in Poland",
    contentRu: `## Коды EAN и система GS1

EAN (European Article Number) — международный стандарт штрихкодов, необходимый для продажи товаров в розничных сетях и на маркетплейсах (Amazon, Allegro, eBay). В Польше коды выдаёт организация **GS1 Polska**.

### Зачем нужны коды EAN

- **Маркетплейсы**: Amazon, Allegro, eBay требуют EAN для листинга товаров
- **Розничные сети**: Lidl, Carrefour, Biedronka не примут товар без штрихкода EAN
- **Логистика**: WMS-системы складов работают с EAN
- **Идентификация**: глобально уникальная идентификация каждого SKU

### Как получить EAN через GS1 Polska

1. Зарегистрируйтесь на **gs1.org.pl** как компания
2. Выберите пакет кодов (от 10 до 100 000+ кодов)
3. Оплатите членский взнос
4. Получите **GS1 Company Prefix** (префикс компании)
5. Самостоятельно присваивайте коды своим товарам

### Стоимость (ориентировочно, 2025)

| Пакет | Кол-во кодов | Взнос/год |
|-------|-------------|-----------|
| Мини | 10 | ~350 зл. |
| Малый | 100 | ~500 зл. |
| Средний | 1 000 | ~700 зл. |
| Большой | 10 000 | ~1 100 зл. |

### EAN vs GTIN

GTIN (Global Trade Item Number) — обобщённое название. EAN-13 — наиболее распространённый формат (13 цифр). UPC-A (12 цифр) — американский стандарт, также принимается на большинстве площадок.

### Альтернативы

Для Amazon можно получить освобождение от GTIN (GTIN Exemption) для товаров собственного бренда. Однако официальные коды GS1 обеспечивают наивысшее доверие со стороны площадок и покупателей.`,
    contentPl: `## Kody EAN i system GS1

EAN (European Article Number) to międzynarodowy standard kodów kreskowych wymagany przy sprzedaży w sieciach handlowych i na marketplace'ach. W Polsce kody wydaje **GS1 Polska**.

### Do czego potrzebne są kody EAN

- **Marketplace'y**: Amazon, Allegro, eBay wymagają EAN do wystawienia produktu
- **Sieci handlowe**: nie przyjmą towaru bez kodu EAN
- **Logistyka**: systemy WMS operują na EAN
- **Identyfikacja**: globalnie unikalna identyfikacja każdego SKU

### Jak uzyskać EAN przez GS1 Polska

1. Rejestracja na **gs1.org.pl** jako firma
2. Wybór pakietu kodów
3. Opłacenie składki członkowskiej
4. Otrzymanie prefiksu GS1 firmy
5. Samodzielne nadawanie kodów produktom

### Koszty (orientacyjnie, 2025)

| Pakiet | Liczba kodów | Składka/rok |
|--------|-------------|-------------|
| Mini | 10 | ~350 zł |
| Mały | 100 | ~500 zł |
| Średni | 1 000 | ~700 zł |
| Duży | 10 000 | ~1 100 zł |`,
    contentUa: `## Коди EAN та система GS1

EAN (European Article Number) — міжнародний стандарт штрихкодів, необхідний для продажу товарів у роздрібних мережах та на маркетплейсах. У Польщі коди видає **GS1 Polska**.

### Навіщо потрібні коди EAN

- **Маркетплейси**: Amazon, Allegro, eBay вимагають EAN для лістингу товарів
- **Роздрібні мережі**: не приймуть товар без штрихкоду EAN
- **Логістика**: WMS-системи складів працюють з EAN
- **Ідентифікація**: глобально унікальна ідентифікація кожного SKU

### Як отримати EAN через GS1 Polska

1. Реєстрація на **gs1.org.pl** як компанія
2. Вибір пакету кодів
3. Оплата членського внеску
4. Отримання префіксу GS1 компанії
5. Самостійне присвоєння кодів своїм товарам

### Вартість (орієнтовно, 2025)

| Пакет | Кількість кодів | Внесок/рік |
|-------|----------------|-----------|
| Міні | 10 | ~350 зл. |
| Малий | 100 | ~500 зл. |
| Середній | 1 000 | ~700 зл. |
| Великий | 10 000 | ~1 100 зл. |`,
    contentEn: `## EAN Barcodes and the GS1 System

EAN (European Article Number) is the international barcode standard required for selling products in retail chains and on marketplaces (Amazon, Allegro, eBay). In Poland, codes are issued by **GS1 Polska**.

### Why EAN Codes Are Needed

- **Marketplaces**: Amazon, Allegro, and eBay require EAN for product listings
- **Retail chains**: will not accept goods without an EAN barcode
- **Logistics**: warehouse management systems operate on EAN
- **Identification**: globally unique identification of every SKU

### How to Get EAN Codes via GS1 Polska

1. Register at **gs1.org.pl** as a company
2. Select a code package
3. Pay the annual membership fee
4. Receive your GS1 Company Prefix
5. Self-assign codes to your products within the prefix

### Costs (approximate, 2025)

| Package | Number of Codes | Annual Fee |
|---------|----------------|-----------|
| Mini | 10 | ~PLN 350 |
| Small | 100 | ~PLN 500 |
| Medium | 1,000 | ~PLN 700 |
| Large | 10,000 | ~PLN 1,100 |

### EAN vs GTIN

GTIN (Global Trade Item Number) is the umbrella term. EAN-13 (13 digits) is the most common format. UPC-A (12 digits) is the US standard, also accepted on most platforms.

### Alternatives

For Amazon, a GTIN Exemption may be available for private-label products. However, official GS1 codes provide the highest level of trust with platforms and buyers.`,
    faqRu: [
      { q: "Можно ли купить коды EAN на сторонних сайтах дешевле?", a: "Технически да, но такие коды (перепродаваемые) не являются официально зарегистрированными на вашу компанию в базе GS1. Amazon и другие крупные площадки проверяют коды через GS1 и могут заблокировать листинги с «серыми» EAN." },
      { q: "Нужен ли EAN для продаж только на Allegro в Польше?", a: "Allegro не всегда обязывает указывать EAN, но его наличие улучшает видимость товара в поиске и является обязательным для многих категорий (особенно электроника, книги, FMCG)." },
      { q: "Один EAN — один товар или один EAN — одна позиция в каталоге?", a: "EAN уникален для каждого SKU: отдельный код нужен для каждого варианта (размер, цвет). Один и тот же товар в разных размерах должен иметь разные EAN." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Czy można kupić kody EAN taniej na zewnętrznych stronach?", a: "Technicznie tak, ale takie kody (odsprzedawane) nie są oficjalnie zarejestrowane na Twoją firmę w bazie GS1. Amazon i inne duże platformy weryfikują kody przez GS1 i mogą zablokować listingi z nieoficjalnymi EAN." },
      { q: "Czy EAN jest potrzebny do sprzedaży tylko na Allegro?", a: "Allegro nie zawsze wymaga EAN, ale jego posiadanie poprawia widoczność produktu w wyszukiwarce i jest obowiązkowe w wielu kategoriach (elektronika, książki, FMCG)." },
      { q: "Czy jeden EAN dotyczy jednego towaru czy jednego SKU?", a: "EAN jest unikalny dla każdego SKU — osobny kod dla każdego wariantu (rozmiar, kolor). Ten sam produkt w różnych rozmiarach musi mieć różne EAN." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Чи можна купити коди EAN на сторонніх сайтах дешевше?", a: "Технічно так, але такі коди (перепродувані) не зареєстровані офіційно на вашу компанію в базі GS1. Amazon та інші великі майданчики перевіряють коди через GS1 і можуть заблокувати лістинги з «сірими» EAN." },
      { q: "Чи потрібен EAN для продажів лише на Allegro?", a: "Allegro не завжди зобов'язує вказувати EAN, але його наявність покращує видимість товару в пошуку та є обов'язковим для багатьох категорій." },
      { q: "Один EAN — один товар чи один SKU?", a: "EAN унікальний для кожного SKU: окремий код потрібен для кожного варіанту (розмір, колір). Один і той самий товар у різних розмірах повинен мати різні EAN." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "Can I buy EAN codes cheaper from third-party resellers?", a: "Technically yes, but such resold codes are not officially registered to your company in the GS1 database. Amazon and other major platforms verify codes through GS1 and may suppress listings using unofficial EANs." },
      { q: "Is an EAN required to sell on Allegro?", a: "Allegro does not always mandate EAN, but having one improves search visibility and is required in many categories (electronics, books, FMCG)." },
      { q: "Is one EAN per product or per SKU?", a: "EAN is unique per SKU — a separate code is needed for each variant (size, colour). The same product in different sizes must have different EAN codes." },
    ] satisfies FaqEntry[],
    category: "logistics",
    tags: ["ean", "gs1", "barcode", "sku", "amazon", "allegro"],
    sortOrder: 10,
    isPublished: true,
  },

  // ── 11. customs-import ────────────────────────────────────────────────────
  {
    slug: "customs-import",
    titleRu: "Таможенный импорт товаров в Польшу из-за пределов ЕС",
    titlePl: "Odprawy celne i import towarów spoza UE do Polski",
    titleUa: "Митне оформлення та імпорт товарів в Польщу з-за меж ЄС",
    titleEn: "Customs Clearance and Import of Goods into Poland from Outside the EU",
    contentRu: `## Таможенный импорт товаров в Польшу

Импорт товаров из стран вне ЕС (например, из Китая) в Польшу регулируется **Таможенным кодексом ЕС** (Union Customs Code, UCC) и требует прохождения таможенного оформления.

### Основные понятия

- **Код HS/CN**: каждый товар классифицируется по Таможенной номенклатуре (Combined Nomenclature). От кода зависит ставка таможенной пошлины
- **EORI**: European Economic Operators Registration and Identification — обязательный номер для импортёров/экспортёров в ЕС
- **Таможенный агент**: компания или физлицо, уполномоченное представлять интересы импортёра в таможне

### Пошлины и налоги при импорте

| Сбор | Описание |
|------|----------|
| Cło (таможенная пошлина) | 0–20%+ от таможенной стоимости (зависит от кода HS) |
| VAT (НДС) | 23% (или сниженная ставка) от таможенной стоимости + пошлина + транспорт |
| Akcyza | Только для акцизных товаров (алкоголь, табак, топливо) |

### Таможенная стоимость

Рассчитывается по **методу транзакционной стоимости** (цена товара + страховка + фрахт до границы ЕС = CIF). Именно с этой суммы считается пошлина и НДС.

### Процедура импорта (упрощённо)

1. Получение номера EORI (через PUESC.gov.pl)
2. Подготовка документов: коммерческий инвойс, упаковочный лист, коносамент/AWB
3. Подача декларации SAD (Single Administrative Document) через PUESC
4. Уплата пошлин и НДС
5. Выпуск товара в свободное обращение

### Льготы

- **Временное хранение**: товар может находиться под таможенным контролем до 90 дней
- **Таможенный склад**: отсрочка уплаты пошлин до момента реализации`,
    contentPl: `## Import towarów spoza UE do Polski

Import towarów z krajów spoza UE reguluje **Unijny Kodeks Celny** (UCC). Każda przesyłka handlowa musi przejść odprawę celną.

### Podstawowe pojęcia

- **Kod HS/CN**: klasyfikacja taryfowa towaru — decyduje o stawce cła
- **EORI**: numer rejestracyjny importera/eksportera w UE — obowiązkowy
- **Agencja celna**: podmiot uprawniony do reprezentowania importera przed urzędem celnym

### Cła i podatki przy imporcie

| Opłata | Opis |
|--------|------|
| Cło | 0–20%+ od wartości celnej (zależy od kodu HS) |
| VAT | 23% (lub obniżony) od wartości celnej + cło + transport |
| Akcyza | Tylko dla wyrobów akcyzowych |

### Wartość celna

Obliczana metodą wartości transakcyjnej: cena towaru + ubezpieczenie + fracht do granicy UE (CIF).

### Procedura importu

1. Uzyskanie numeru EORI (przez PUESC.gov.pl)
2. Przygotowanie dokumentów: faktura handlowa, lista pakunkowa, konosament/AWB
3. Złożenie zgłoszenia SAD przez PUESC
4. Zapłata ceł i VAT
5. Dopuszczenie towaru do obrotu`,
    contentUa: `## Митне оформлення та імпорт товарів в Польщу

Імпорт товарів з країн поза ЄС регулюється **Митним кодексом ЄС** (UCC). Кожна комерційна партія повинна пройти митне оформлення.

### Основні поняття

- **Код HS/CN**: митна класифікація товару — визначає ставку мита
- **EORI**: обов'язковий номер реєстрації імпортера/експортера в ЄС
- **Митний агент**: компанія або фізособа, уповноважена представляти інтереси імпортера

### Мита та податки при імпорті

| Збір | Опис |
|------|------|
| Мито (cło) | 0–20%+ від митної вартості (залежить від коду HS) |
| ПДВ (VAT) | 23% від митної вартості + мито + транспорт |
| Акциз | Лише для підакцизних товарів |

### Процедура імпорту

1. Отримання номера EORI (через PUESC.gov.pl)
2. Підготовка документів: комерційний інвойс, пакувальний лист, коносамент/AWB
3. Подача декларації SAD через PUESC
4. Сплата мита та ПДВ
5. Випуск товару у вільний обіг`,
    contentEn: `## Customs Clearance for Imports into Poland from Outside the EU

Importing goods from non-EU countries (e.g., China) into Poland is governed by the **Union Customs Code (UCC)**. Every commercial shipment must go through customs clearance.

### Key Concepts

- **HS/CN Code**: tariff classification of goods — determines the customs duty rate
- **EORI**: European Economic Operators Registration and Identification number — mandatory for EU importers/exporters
- **Customs agent**: a licensed party authorised to represent the importer at customs

### Duties and Taxes on Import

| Charge | Description |
|--------|-------------|
| Customs duty (cło) | 0–20%+ of customs value (depends on HS code) |
| VAT | 23% (or reduced rate) on customs value + duty + freight |
| Excise duty (akcyza) | Only for excise goods (alcohol, tobacco, fuel) |

### Customs Value

Calculated using the **transaction value method**: goods price + insurance + freight to the EU border (CIF basis).

### Import Procedure (simplified)

1. Obtain an EORI number (via PUESC.gov.pl)
2. Prepare documents: commercial invoice, packing list, bill of lading / AWB
3. Submit the SAD (Single Administrative Document) declaration via PUESC
4. Pay duties and VAT
5. Release of goods for free circulation

### Reliefs

- **Temporary storage**: goods may remain under customs supervision for up to 90 days
- **Customs warehouse**: defer duty payment until goods are sold`,
    faqRu: [
      { q: "Как получить номер EORI в Польше?", a: "Заявку на EORI подают через портал PUESC.gov.pl (Platforma Usług Elektronicznych Służby Celno-Skarbowej). Необходим NIP польского предприятия. Регистрация занимает 1–3 рабочих дня." },
      { q: "Нужен ли таможенный брокер для импорта из Китая?", a: "Юридически нет, но на практике большинство импортёров пользуются услугами агентства celnego, особенно при первых отправках. Агент знает процедуры, коды HS и может избежать задержек." },
      { q: "Как найти правильный код HS для моего товара?", a: "Используйте базу TARIC (ec.europa.eu/taxation_customs/dds2/taric) или обратитесь за Wiążącą Informacją Taryfową (WIT) — официальным решением таможни о классификации товара. WIT обязательна к применению после выдачи." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Jak uzyskać numer EORI w Polsce?", a: "Wniosek składa się przez portal PUESC.gov.pl. Wymagany jest NIP polskiego przedsiębiorcy. Rejestracja trwa 1–3 dni robocze." },
      { q: "Czy potrzebny jest agent celny przy imporcie z Chin?", a: "Prawnie nie, ale w praktyce większość importerów korzysta z agencji celnej, szczególnie przy pierwszych dostawach. Agent zna procedury, kody HS i pozwala uniknąć opóźnień." },
      { q: "Jak znaleźć właściwy kod HS dla produktu?", a: "Skorzystaj z bazy TARIC (ec.europa.eu/taxation_customs/dds2/taric) lub wystąp o Wiążącą Informację Taryfową (WIT) — oficjalną decyzję celną o klasyfikacji towaru, wiążącą po jej wydaniu." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Як отримати номер EORI в Польщі?", a: "Заявку подають через портал PUESC.gov.pl. Необхідний NIP польського підприємця. Реєстрація займає 1–3 робочих дні." },
      { q: "Чи потрібен митний брокер для імпорту з Китаю?", a: "Юридично ні, але на практиці більшість імпортерів користуються послугами митного агентства, особливо при перших відправках. Агент знає процедури та коди HS." },
      { q: "Як знайти правильний код HS для товару?", a: "Використовуйте базу TARIC (ec.europa.eu/taxation_customs/dds2/taric) або зверніться за Wiążącą Informacją Taryfową (WIT) — офіційним рішенням митниці про класифікацію товару." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "How do I obtain an EORI number in Poland?", a: "Apply through the PUESC.gov.pl portal. A Polish NIP tax number is required. Registration takes 1–3 business days." },
      { q: "Do I need a customs broker to import from China?", a: "Not legally, but most importers use a customs agency in practice, especially for initial shipments. An agent knows the procedures, HS codes, and can prevent costly delays." },
      { q: "How do I find the correct HS code for my product?", a: "Use the TARIC database (ec.europa.eu/taxation_customs/dds2/taric) or apply for a Binding Tariff Information (BTI/WIT) ruling — an official customs classification decision that is legally binding once issued." },
    ] satisfies FaqEntry[],
    category: "customs",
    tags: ["cło", "import", "eori", "hs-code", "taric", "sad", "puesc"],
    sortOrder: 11,
    isPublished: true,
  },

  // ── 12. gdpr-ecommerce ────────────────────────────────────────────────────
  {
    slug: "gdpr-ecommerce",
    titleRu: "GDPR (RODO) для интернет-магазинов в Польше",
    titlePl: "RODO (GDPR) dla sklepów internetowych w Polsce",
    titleUa: "GDPR (RODO) для інтернет-магазинів у Польщі",
    titleEn: "GDPR (RODO) for E-commerce Shops in Poland",
    contentRu: `## GDPR/RODO для интернет-магазинов

GDPR (General Data Protection Regulation) применяется в Польше как **RODO** (Rozporządzenie o Ochronie Danych Osobowych). Регулятор — UODO (Urząd Ochrony Danych Osobowych).

### Основные обязанности интернет-магазина

**1. Политика конфиденциальности (Polityka Prywatności)**
Обязательный документ, содержащий:
- Данные контроллера (administrator danych)
- Цели и правовые основания обработки данных
- Категории обрабатываемых данных
- Срок хранения данных
- Права субъектов данных
- Сведения о передаче данных третьим лицам

**2. Правовые основания обработки (art. 6 RODO)**
- Выполнение договора (доставка заказа) — ст. 6(1)(b)
- Законный интерес (аналитика, профилактика мошенничества) — ст. 6(1)(f)
- Согласие (маркетинговые email) — ст. 6(1)(a)

**3. Файлы cookie**
Нерекламные cookie (функциональные, технические) — допустимы без согласия. Аналитические и маркетинговые cookie требуют **явного согласия** пользователя.

**4. Права покупателей**
- Право на доступ к данным
- Право на исправление
- Право на удаление (право быть забытым)
- Право на портируемость данных
- Право на возражение против обработки

### Штрафы за нарушение RODO

UODO вправе наложить штраф до **20 млн EUR** или **4% годового мирового оборота** (применяется большее значение).

### Практические меры

- Использовать SSL (HTTPS) обязательно
- Хранить данные покупателей не дольше необходимого (для налоговых целей — 5 лет)
- Уведомлять UODO об утечках данных в течение **72 часов**
- Заключить DPA (Data Processing Agreement) с поставщиками (хостинг, CRM, email-рассылки)`,
    contentPl: `## RODO (GDPR) dla sklepów internetowych

RODO obowiązuje w Polsce bezpośrednio jako rozporządzenie UE. Organem nadzorczym jest **UODO** (Urząd Ochrony Danych Osobowych).

### Podstawowe obowiązki sklepu internetowego

**1. Polityka Prywatności**
Obowiązkowy dokument zawierający:
- Dane administratora danych
- Cele i podstawy prawne przetwarzania
- Kategorie przetwarzanych danych
- Czas przechowywania danych
- Prawa osób, których dane dotyczą

**2. Podstawy prawne przetwarzania (art. 6 RODO)**
- Wykonanie umowy (realizacja zamówienia) — art. 6(1)(b)
- Prawnie uzasadniony interes (analityka, ochrona przed oszustwami) — art. 6(1)(f)
- Zgoda (marketing e-mailowy) — art. 6(1)(a)

**3. Pliki cookie**
Funkcjonalne i techniczne — dozwolone bez zgody. Analityczne i marketingowe wymagają **wyraźnej zgody** użytkownika.

**4. Prawa kupujących**
Dostęp do danych, sprostowanie, usunięcie (prawo do bycia zapomnianym), przenoszalność, sprzeciw.

### Kary za naruszenie RODO

Do **20 mln EUR** lub **4% rocznego globalnego obrotu**.

### Praktyczne działania

- Obowiązkowo SSL (HTTPS)
- Dane kupujących przechowywać nie dłużej niż konieczne (dla celów podatkowych — 5 lat)
- Naruszenia danych zgłaszać UODO w ciągu **72 godzin**
- Zawierać DPA z dostawcami (hosting, CRM, e-mail marketing)`,
    contentUa: `## GDPR (RODO) для інтернет-магазинів у Польщі

GDPR застосовується в Польщі як **RODO**. Регулятор — UODO (Urząd Ochrony Danych Osobowych).

### Основні обов'язки інтернет-магазину

**1. Політика конфіденційності**
Обов'язковий документ, що містить:
- Дані контролера (administrator danych)
- Цілі та правові підстави обробки даних
- Категорії даних, що обробляються
- Строк зберігання даних
- Права суб'єктів даних

**2. Правові підстави обробки (ст. 6 RODO)**
- Виконання договору — ст. 6(1)(b)
- Законний інтерес — ст. 6(1)(f)
- Згода (маркетинг) — ст. 6(1)(a)

**3. Файли cookie**
Функціональні та технічні — допустимі без згоди. Аналітичні та маркетингові вимагають **явної згоди** користувача.

**4. Права покупців**
Доступ до даних, виправлення, видалення, портованість, заперечення.

### Штрафи за порушення RODO

До **20 млн EUR** або **4% річного глобального обороту**.

### Практичні заходи

- Обов'язково SSL (HTTPS)
- Повідомляти UODO про витоки даних протягом **72 годин**
- Укладати DPA з постачальниками (хостинг, CRM, email-розсилки)`,
    contentEn: `## GDPR (RODO) for E-commerce Shops in Poland

GDPR applies in Poland directly as **RODO** (Rozporządzenie o Ochronie Danych Osobowych). The supervisory authority is **UODO** (Urząd Ochrony Danych Osobowych).

### Core Obligations for Online Shops

**1. Privacy Policy (Polityka Prywatności)**
A mandatory document covering:
- Controller identity and contact details
- Purposes and legal bases for processing
- Categories of data processed
- Retention periods
- Data subjects' rights
- Third-party data transfers

**2. Legal Bases for Processing (Art. 6 GDPR)**
- Contract performance (fulfilling an order) — Art. 6(1)(b)
- Legitimate interests (analytics, fraud prevention) — Art. 6(1)(f)
- Consent (marketing emails) — Art. 6(1)(a)

**3. Cookie Consent**
Functional and technical cookies — permitted without consent. Analytical and marketing cookies require **explicit user consent** via a compliant cookie banner.

**4. Buyers' Rights**
Right to access, rectification, erasure (right to be forgotten), data portability, and the right to object.

### Penalties for GDPR Violations

Up to **EUR 20 million** or **4% of annual global turnover**, whichever is higher.

### Practical Measures

- SSL (HTTPS) is mandatory
- Store buyer data no longer than necessary (5 years for tax purposes)
- Report personal data breaches to UODO within **72 hours**
- Sign Data Processing Agreements (DPA) with all processors (hosting, CRM, email marketing)`,
    faqRu: [
      { q: "Нужен ли инспектор по защите данных (DPO) для интернет-магазина?", a: "Большинству малых интернет-магазинов DPO не требуется. Обязателен только если магазин ведёт масштабную систематическую слежку за физическими лицами или обрабатывает специальные категории данных (здоровье, биометрия) в больших масштабах." },
      { q: "Сколько времени хранить данные покупателей?", a: "Данные для выполнения договора — на срок договора + период претензий (как правило 2–3 года). Данные для налоговой отчётности — 5 лет. Данные для маркетинга — до отзыва согласия." },
      { q: "Что делать при взломе базы данных покупателей?", a: "В течение 72 часов нужно уведомить UODO (online через uodo.gov.pl). Если инцидент несёт высокий риск для прав субъектов — также уведомить самих покупателей без лишней задержки." },
    ] satisfies FaqEntry[],
    faqPl: [
      { q: "Czy sklep internetowy potrzebuje Inspektora Ochrony Danych (IOD/DPO)?", a: "Większość małych sklepów nie jest zobowiązana do wyznaczenia IOD. Obowiązek powstaje przy systematycznym monitorowaniu osób na dużą skalę lub przetwarzaniu szczególnych kategorii danych w dużym zakresie." },
      { q: "Jak długo przechowywać dane kupujących?", a: "Dane do realizacji umowy — na czas umowy + okres roszczeń (zazwyczaj 2–3 lata). Dane dla celów podatkowych — 5 lat. Dane do marketingu — do cofnięcia zgody." },
      { q: "Co zrobić przy wycieku danych kupujących?", a: "W ciągu 72 godzin należy zgłosić incydent do UODO (online przez uodo.gov.pl). Jeśli naruszenie niesie wysokie ryzyko dla osób — powiadomić też samych kupujących bez zbędnej zwłoki." },
    ] satisfies FaqEntry[],
    faqUa: [
      { q: "Чи потрібен інспектор з захисту даних (DPO) для інтернет-магазину?", a: "Більшості малих інтернет-магазинів DPO не потрібен. Обов'язковий лише якщо магазин веде масштабне систематичне спостереження за фізичними особами або обробляє спеціальні категорії даних у великих масштабах." },
      { q: "Скільки часу зберігати дані покупців?", a: "Дані для виконання договору — на строк договору + період претензій (як правило 2–3 роки). Дані для податкової звітності — 5 років. Дані для маркетингу — до відкликання згоди." },
      { q: "Що робити при зламі бази даних покупців?", a: "Протягом 72 годин потрібно повідомити UODO (онлайн через uodo.gov.pl). Якщо інцидент несе високий ризик для прав суб'єктів — також повідомити самих покупців без зайвої затримки." },
    ] satisfies FaqEntry[],
    faqEn: [
      { q: "Does an online shop need a Data Protection Officer (DPO)?", a: "Most small online shops are not required to appoint a DPO. The obligation arises when the shop carries out large-scale systematic monitoring of individuals or processes special categories of data on a large scale." },
      { q: "How long should buyer data be stored?", a: "Data for contract performance — for the duration of the contract plus the claims period (typically 2–3 years). Data for tax purposes — 5 years. Marketing data — until consent is withdrawn." },
      { q: "What to do if the customer database is breached?", a: "Notify UODO within 72 hours (online via uodo.gov.pl). If the breach poses a high risk to the rights of individuals, also notify the affected buyers without undue delay." },
    ] satisfies FaqEntry[],
    category: "data-protection",
    tags: ["rodo", "gdpr", "uodo", "cookie", "polityka-prywatnosci", "dpo"],
    sortOrder: 12,
    isPublished: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Legal limits data (year 2025)
// ─────────────────────────────────────────────────────────────────────────────

interface LimitRecord {
  year: number;
  key: string;
  value: number;
  description: string;
}

const limits2025: LimitRecord[] = [
  { year: 2025, key: "min_wage_jan_jun",        value: 4242,    description: "Minimalne wynagrodzenie brutto I–VI 2025 (PLN)" },
  { year: 2025, key: "min_wage_jul_dec",        value: 4300,    description: "Minimalne wynagrodzenie brutto VII–XII 2025 (PLN)" },
  { year: 2025, key: "nierejestrowana_monthly", value: 3181.5,  description: "Limit miesięczny działalności nierejestrowanej (75% min. wynagrodzenia I–VI 2025, PLN)" },
  { year: 2025, key: "nierejestrowana_yearly",  value: 38178,   description: "Przybliżony limit roczny działalności nierejestrowanej 2025 (PLN)" },
  { year: 2025, key: "vat_threshold",           value: 200000,  description: "Próg zwolnienia podmiotowego z VAT (PLN/rok)" },
  { year: 2025, key: "vat_standard",            value: 23,      description: "Podstawowa stawka VAT (%)" },
  { year: 2025, key: "vat_reduced",             value: 8,       description: "Obniżona stawka VAT (%)" },
  { year: 2025, key: "vat_super_reduced",       value: 5,       description: "Super-obniżona stawka VAT (%)" },
  { year: 2025, key: "zus_preferential_social", value: 201.31,  description: "Składka emerytalna mały ZUS (30% min. wynagrodzenia), PLN/mies." },
  { year: 2025, key: "zus_reduced_social",      value: 805.18,  description: "Łączne składki społeczne mały ZUS (bez chorobowej), PLN/mies." },
  { year: 2025, key: "zus_full_emerytalne",     value: 812.23,  description: "Pełna składka emerytalna JDG 2025, PLN/mies." },
  { year: 2025, key: "zus_full_rentowe",        value: 333.00,  description: "Pełna składka rentowa JDG 2025, PLN/mies." },
  { year: 2025, key: "zus_full_chorobowe",      value: 101.52,  description: "Pełna składka chorobowa JDG 2025 (dobrowolna), PLN/mies." },
  { year: 2025, key: "zus_full_wypadkowe",      value: 60.92,   description: "Pełna składka wypadkowa JDG 2025, PLN/mies." },
  { year: 2025, key: "zus_full_fp",             value: 42.55,   description: "Składka na Fundusz Pracy JDG 2025, PLN/mies." },
  { year: 2025, key: "zus_health_min",          value: 381.78,  description: "Minimalna składka zdrowotna (skala podatkowa) 2025, PLN/mies." },
  { year: 2025, key: "zus_health_pct",          value: 9,       description: "Stawka składki zdrowotnej dla skali podatkowej (%)" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed function
// ─────────────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const db = getDb();

  write("Seeding legal_topics...");

  for (const topic of topics) {
    await db
      .insert(legalTopics)
      .values(topic)
      .onConflictDoUpdate({
        target: legalTopics.slug,
        set: {
          titleRu:     topic.titleRu,
          titlePl:     topic.titlePl,
          titleUa:     topic.titleUa,
          titleEn:     topic.titleEn,
          contentRu:   topic.contentRu,
          contentPl:   topic.contentPl,
          contentUa:   topic.contentUa,
          contentEn:   topic.contentEn,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          faqRu:       topic.faqRu!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          faqPl:       topic.faqPl!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          faqUa:       topic.faqUa!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          faqEn:       topic.faqEn!,
          category:    topic.category,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          tags:        topic.tags!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          sortOrder:   topic.sortOrder!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          isPublished: topic.isPublished!,
          updatedAt:   sql`now()`,
        },
      });
    write(` ${topic.slug}`);
  }

  write(`\nSeeded ${topics.length} topics.\n`);

  write("Seeding legal_limits...");

  for (const limit of limits2025) {
    await db
      .insert(legalLimits)
      .values({
        year:        limit.year,
        key:         limit.key,
        value:       limit.value,
        description: limit.description,
      })
      .onConflictDoUpdate({
        target: [legalLimits.year, legalLimits.key],
        set: {
          value:     limit.value,
          description: limit.description,
          updatedAt: sql`now()`,
        },
      });
    write(` ${limit.key}`);
  }

  write(`\nSeeded ${limits2025.length} limits.\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

seed()
  .then(() => {
    write("Seed complete.\n");
    return closeDb();
  })
  .then(() => {
    process.exit(0);
  })
  .catch((err: unknown) => {
    process.stderr.write(`Seed failed: ${String(err)}\n`);
    return closeDb().finally(() => {
      process.exit(1);
    });
  });
