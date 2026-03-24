// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — legal-service / db / seed-dropshipping
// Dropshipping, Drop+Warehouse hybrid, and Baselinker integration guides
// Run with: npx tsx src/db/seed-dropshipping.ts
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
  // ── 1. dropshipping-poland-2025 ──────────────────────────────────────────
  {
    slug: "dropshipping-poland-2025",
    titleRu: "Дропшиппинг в Польше 2025: честная оценка",
    titlePl: "Dropshipping w Polsce 2025: uczciwa ocena",
    titleUa: "Дропшипінг у Польщі 2025: чесна оцінка",
    titleEn: "Dropshipping in Poland 2025: An Honest Assessment",

    contentRu: `## Дропшиппинг в Польше 2025: честная оценка для начинающих

Дропшиппинг — это бизнес-модель, при которой продавец принимает заказы и оплату, а поставщик отправляет товар напрямую покупателю. Продавец никогда не держит товар на складе.

В 2025 году дропшиппинг в Польше работает как **инструмент тестирования спроса**, а не как основная бизнес-модель. Тот, кто говорит вам, что на дропшиппинге можно стабильно зарабатывать 30–40% маржи — либо работает с уникальными нишевыми поставщиками, либо продаёт курсы.

### Реальные цифры: маржинальность

| Модель | Средняя маржа | Реалистичная чистая прибыль |
|---|---|---|
| Дропшиппинг (польский поставщик) | 8–15% | 3–8% после возвратов и рекламы |
| Дропшиппинг (китайский поставщик) | 15–30% | 5–12% с учётом долгой доставки |
| Собственный склад (закупка оптом) | 30–50% | 15–30% при правильном управлении |
| Собственный бренд (private label) | 40–60% | 20–40% при хорошей нише |

### Преимущества дропшиппинга

**1. Нулевой риск складских запасов**
Вы не тратите деньги на закупку товара до его продажи. Идеально для тестирования новых ниш без вложений.

**2. Быстрый запуск**
Можно начать за 1–2 дня: создать аккаунт на Allegro или WooCommerce, подключить поставщика и загрузить товары.

**3. Широкий ассортимент без вложений**
Вы можете предлагать сотни или тысячи товаров одновременно без замороженного капитала.

**4. Географическая свобода**
Управление бизнесом из любой точки мира при наличии интернета.

### Реальные недостатки (которые обычно замалчивают)

**1. Высокий уровень возвратов**
На Allegro и Amazon покупатели ожидают доставки за 1–2 дня. Дропшиппинг с польских складов — 2–5 дней, с китайских — 2–4 недели. Возвраты из-за долгой доставки и несоответствия ожиданиям — 10–25% заказов в нишах одежды и электроники.

**2. Отсутствие контроля качества**
Вы продаёте товар, которого никогда не видели. При массовом дефекте у поставщика — претензии приходят вам, а не производителю. Allegro снижает рейтинг аккаунта за каждый негативный отзыв.

**3. Конкуренция по цене**
Тот же каталог поставщика доступен десяткам других продавцов. Единственный способ конкурировать — цена, что убивает и без того низкую маржу.

**4. Юридическая ответственность**
По польскому закону о защите прав потребителей (Ustawa o prawach konsumenta) **вы** являетесь продавцом и несёте полную ответственность: 14-дневное право возврата, гарантия 2 года, обязанность обмена/ремонта. Поставщик-дропшиппер не является стороной договора с покупателем.

### В каких нишах дропшиппинг работает в 2025 году

**Рабочие ниши:**
- Уникальные товары для хобби (рыбалка, охота, спорт)
- B2B-продажи малому бизнесу (расходники, инструменты)
- Сезонные товары для тестирования тренда
- Крупногабаритные товары (мебель, садовый инвентарь) где конкуренция ниже

**Нишами где дропшиппинг НЕ работает:**
- Электроника (возвраты 15–20%, конкуренция максимальная)
- Одежда (высокий процент возвратов из-за размера)
- Товары с высоким риском подделок

### Юридические требования для дропшиппинга в Польше

**1. Регистрация JDG или sp. z o.o.**
Дропшиппинг — это предпринимательская деятельность. Регистрируйте JDG (для начала) или sp. z o.o. (при обороте свыше 100 000 PLN/мес).

**2. НДС**
- Ниже порога 200 000 PLN/год — можно работать как zwolnienie z VAT (освобождение от НДС)
- При превышении — обязательная регистрация VAT
- При дропшиппинге из стран ЕС вне Польши — необходимо разобраться с НДС OSS

**3. Права потребителей**
Обязательно разместите на сайте:
- Regulamin sklepu (Правила магазина)
- Политику конфиденциальности (RODO/GDPR)
- Информацию о праве возврата в течение 14 дней
- Форму возврата товара

**4. Договор с поставщиком**
Всегда заключайте письменный договор с поставщиком-дропшиппером, в котором прописаны: сроки отгрузки, процедура возвратов, ответственность за дефекты.

### Вывод

Дропшиппинг в Польше — это **инструмент тестирования**, а не долгосрочная бизнес-модель. Продайте 20–30 единиц через дроп, убедитесь в спросе, затем переходите на собственный склад. Именно так строится устойчивый e-commerce бизнес в 2025 году.`,

    contentPl: `## Dropshipping w Polsce 2025: uczciwa ocena dla początkujących

Dropshipping to model biznesowy, w którym sprzedawca przyjmuje zamówienia i płatności, a dostawca wysyła towar bezpośrednio do kupującego. Sprzedawca nigdy nie trzyma towaru na magazynie.

W 2025 roku dropshipping w Polsce działa jako **narzędzie testowania popytu**, a nie jako główny model biznesowy. Kto twierdzi, że na dropshippingu można stabilnie zarabiać 30–40% marży — albo pracuje z unikalnymi niszowymi dostawcami, albo sprzedaje kursy.

### Realne liczby: marżowość

| Model | Średnia marża | Realistyczny zysk netto |
|---|---|---|
| Dropshipping (polski dostawca) | 8–15% | 3–8% po zwrotach i reklamie |
| Dropshipping (chiński dostawca) | 15–30% | 5–12% przy długim czasie dostawy |
| Własny magazyn (zakup hurtowy) | 30–50% | 15–30% przy prawidłowym zarządzaniu |
| Własna marka (private label) | 40–60% | 20–40% przy dobrej niszy |

### Zalety dropshippingu

**1. Zerowe ryzyko magazynowe**
Nie wydajesz pieniędzy na zakup towaru przed jego sprzedażą. Idealne do testowania nowych nisz bez inwestycji.

**2. Szybki start**
Można zacząć w 1–2 dni: założyć konto na Allegro lub WooCommerce, podłączyć dostawcę i załadować produkty.

**3. Szeroki asortyment bez zamrożonego kapitału**
Możesz oferować setki lub tysiące produktów jednocześnie.

**4. Wolność geograficzna**
Zarządzanie biznesem z dowolnego miejsca na świecie.

### Realne wady (o których zwykle się nie mówi)

**1. Wysoki wskaźnik zwrotów**
Na Allegro i Amazonie kupujący oczekują dostawy w 1–2 dni. Dropshipping z polskich magazynów — 2–5 dni, z chińskich — 2–4 tygodnie. Zwroty z powodu długiej dostawy i niezgodności z oczekiwaniami — 10–25% zamówień w niszach odzieżowych i elektronicznych.

**2. Brak kontroli jakości**
Sprzedajesz towar, którego nigdy nie widziałeś. Przy masowym defekcie u dostawcy — reklamacje trafiają do Ciebie. Allegro obniża ocenę konta za każdą negatywną opinię.

**3. Konkurencja cenowa**
Ten sam katalog dostawcy jest dostępny dla dziesiątek innych sprzedawców. Jedynym sposobem na konkurowanie jest cena, co niszczy i tak niską marżę.

**4. Odpowiedzialność prawna**
Zgodnie z polską ustawą o prawach konsumenta **Ty** jesteś sprzedawcą i ponosisz pełną odpowiedzialność: 14-dniowe prawo odstąpienia, gwarancja 2 lata, obowiązek wymiany/naprawy. Dostawca dropshippingowy nie jest stroną umowy z kupującym.

### W jakich niszach dropshipping działa w 2025 roku

**Działające nisze:**
- Unikalne artykuły dla hobbystów (wędkarstwo, łowiectwo, sport)
- Sprzedaż B2B dla małego biznesu (materiały eksploatacyjne, narzędzia)
- Produkty sezonowe do testowania trendu
- Wielkogabarytowe produkty (meble, sprzęt ogrodowy)

**Nisze, gdzie dropshipping NIE działa:**
- Elektronika (zwroty 15–20%, maksymalna konkurencja)
- Odzież (wysoki odsetek zwrotów z powodu rozmiaru)
- Produkty z wysokim ryzykiem podróbek

### Wymogi prawne dla dropshippingu w Polsce

**1. Rejestracja JDG lub sp. z o.o.**
Dropshipping to działalność gospodarcza. Zarejestruj JDG (na start) lub sp. z o.o. (przy obrotach powyżej 100 000 PLN/mies.).

**2. VAT**
- Poniżej progu 200 000 PLN/rok — możliwe zwolnienie z VAT
- Po przekroczeniu progu — obowiązkowa rejestracja VAT
- Przy dropshippingu z krajów UE spoza Polski — konieczne rozliczenie VAT OSS

**3. Prawa konsumentów**
Obowiązkowo umieść na stronie:
- Regulamin sklepu
- Politykę prywatności (RODO/GDPR)
- Informację o prawie odstąpienia w ciągu 14 dni
- Formularz zwrotu towaru

**4. Umowa z dostawcą**
Zawsze zawieraj pisemną umowę z dostawcą dropshippingowym, w której określono: terminy wysyłki, procedurę zwrotów, odpowiedzialność za wady.

### Wniosek

Dropshipping w Polsce to **narzędzie testowania**, a nie długoterminowy model biznesowy. Sprzedaj 20–30 sztuk przez drop, potwierdź popyt, następnie przejdź na własny magazyn. Tak buduje się trwały biznes e-commerce w 2025 roku.`,

    contentUa: `## Дропшипінг у Польщі 2025: чесна оцінка для початківців

Дропшипінг — це бізнес-модель, при якій продавець приймає замовлення та оплату, а постачальник надсилає товар безпосередньо покупцю. Продавець ніколи не тримає товар на складі.

У 2025 році дропшипінг у Польщі працює як **інструмент тестування попиту**, а не як основна бізнес-модель. Хто каже вам, що на дропшипінгу можна стабільно заробляти 30–40% маржі — або працює з унікальними нішевими постачальниками, або продає курси.

### Реальні цифри: маржинальність

| Модель | Середня маржа | Реалістичний чистий прибуток |
|---|---|---|
| Дропшипінг (польський постачальник) | 8–15% | 3–8% після повернень та реклами |
| Дропшипінг (китайський постачальник) | 15–30% | 5–12% з урахуванням довгого доставлення |
| Власний склад (оптова закупівля) | 30–50% | 15–30% при правильному управлінні |
| Власний бренд (private label) | 40–60% | 20–40% при хорошій ніші |

### Переваги дропшипінгу

**1. Нульовий ризик складських запасів** — ідеально для тестування нових ніш без вкладень.

**2. Швидкий старт** — можна почати за 1–2 дні.

**3. Широкий асортимент без замороженого капіталу** — сотні або тисячі товарів одночасно.

### Реальні недоліки

**1. Високий рівень повернень** — 10–25% замовлень у нішах одягу та електроніки через довге доставлення.

**2. Відсутність контролю якості** — ви продаєте товар, якого ніколи не бачили.

**3. Цінова конкуренція** — той самий каталог постачальника доступний десяткам інших продавців.

**4. Юридична відповідальність** — за польським законом про права споживачів **ви** є продавцем і несете повну відповідальність: 14-денне право повернення, гарантія 2 роки.

### У яких нішах дропшипінг працює у 2025 році

**Робочі ніші:** унікальні товари для хобі, B2B-продажі малому бізнесу, сезонні товари, великогабаритні товари.

**Ніші, де дропшипінг НЕ працює:** електроніка, одяг, товари з високим ризиком підробок.

### Юридичні вимоги для дропшипінгу в Польщі

**1. Реєстрація JDG або sp. z o.o.** — дропшипінг є підприємницькою діяльністю.

**2. ПДВ** — нижче порогу 200 000 PLN/рік можна працювати зі звільненням від ПДВ. При перевищенні — обов'язкова реєстрація. При дропшипінгу з країн ЄС поза Польщею — ПДВ OSS.

**3. Права споживачів** — обов'язково розмістіть на сайті правила магазину, політику конфіденційності, інформацію про право повернення протягом 14 днів.

**4. Договір з постачальником** — завжди укладайте письмовий договір.

### Висновок

Дропшипінг у Польщі — це **інструмент тестування**, а не довгострокова бізнес-модель. Продайте 20–30 одиниць через дроп, переконайтеся у попиті, потім переходьте на власний склад.`,

    contentEn: `## Dropshipping in Poland 2025: An Honest Assessment

Dropshipping is a business model in which the seller takes orders and payment while the supplier ships the product directly to the customer. The seller never holds inventory.

In 2025, dropshipping in Poland works as a **demand-testing tool**, not as a primary business model. Anyone telling you that dropshipping reliably delivers 30–40% margins is either working with unique niche suppliers or selling courses.

### Real Numbers: Profit Margins

| Model | Average margin | Realistic net profit |
|---|---|---|
| Dropshipping (Polish supplier) | 8–15% | 3–8% after returns and ads |
| Dropshipping (Chinese supplier) | 15–30% | 5–12% accounting for long delivery |
| Own warehouse (bulk purchase) | 30–50% | 15–30% with proper management |
| Own brand (private label) | 40–60% | 20–40% in a good niche |

### Advantages of Dropshipping

**1. Zero inventory risk**
You do not spend money buying stock before a sale. Ideal for testing new niches without capital investment.

**2. Fast launch**
You can start in 1–2 days: create an Allegro or WooCommerce account, connect a supplier, and upload products.

**3. Wide catalogue without frozen capital**
You can offer hundreds or thousands of products simultaneously.

**4. Geographic freedom**
Run the business from anywhere with an internet connection.

### Real Disadvantages (Usually Left Unsaid)

**1. High return rates**
On Allegro and Amazon, buyers expect delivery in 1–2 days. Dropshipping from Polish warehouses takes 2–5 days; from China — 2–4 weeks. Returns due to slow delivery and unmet expectations reach 10–25% in clothing and electronics.

**2. No quality control**
You sell products you have never seen. When a supplier has a mass defect, the complaints come to you, not the manufacturer. Allegro lowers your account rating for every negative review.

**3. Price competition**
The same supplier catalogue is available to dozens of other sellers. The only way to compete is on price, which destroys an already thin margin.

**4. Legal liability**
Under the Polish Consumer Rights Act (Ustawa o prawach konsumenta), **you** are the seller and bear full responsibility: 14-day right of return, 2-year warranty, obligation to replace or repair. The dropshipping supplier is not a party to the contract with the buyer.

### Niches Where Dropshipping Still Works in 2025

**Working niches:**
- Unique hobby goods (fishing, hunting, sport)
- B2B sales to small businesses (consumables, tools)
- Seasonal products for trend testing
- Bulky goods (furniture, garden equipment) where competition is lower

**Niches where dropshipping does NOT work:**
- Electronics (15–20% returns, maximum competition)
- Clothing (high return rate due to sizing)
- Products with high counterfeit risk

### Legal Requirements for Dropshipping in Poland

**1. Register a JDG or sp. z o.o.**
Dropshipping is a business activity. Register a JDG (to start) or sp. z o.o. (when monthly turnover exceeds PLN 100,000).

**2. VAT**
- Below the PLN 200,000/year threshold: VAT exemption (zwolnienie z VAT) is available
- Above the threshold: mandatory VAT registration
- Dropshipping from EU countries outside Poland: VAT OSS registration required

**3. Consumer rights**
Your website must display:
- Store regulations (Regulamin sklepu)
- Privacy policy (GDPR/RODO)
- Information about the 14-day right of withdrawal
- A return form

**4. Supplier agreement**
Always sign a written agreement with the dropshipping supplier, specifying: dispatch deadlines, return procedures, liability for defects.

### Conclusion

Dropshipping in Poland is a **testing tool**, not a long-term business model. Sell 20–30 units via drop, confirm demand, then transition to your own warehouse. That is how a sustainable e-commerce business is built in 2025.`,

    faqRu: [
      {
        q: "Можно ли заниматься дропшиппингом в Польше без регистрации JDG?",
        a: "Теоретически, при доходе до 75% минимальной зарплаты в месяц (~3 181 PLN в 2025 году) можно работать как działalność nierejestrowana. Однако дропшиппинг на Allegro требует профессионального аккаунта продавца (konto firmowe), для которого необходима JDG или sp. z o.o. Кроме того, при работе с юридическими лицами (B2B поставщиками) вам понадобится NIP. На практике — регистрируйте JDG сразу.",
      },
      {
        q: "Кто несёт ответственность за возврат товара при дропшиппинге: я или поставщик?",
        a: "По польскому закону о защите прав потребителей — **вы** как продавец несёте полную ответственность перед покупателем. Поставщик-дропшиппер является вашим контрагентом (B2B), а не стороной договора с конечным покупателем. Именно поэтому в договоре с поставщиком необходимо прописать порядок возврата товара и возмещения ваших затрат на обработку возвратов.",
      },
      {
        q: "Какие польские поставщики поддерживают дропшиппинг для Allegro?",
        a: "Основные польские дропшиппинг-поставщики: Action S.A. (electronics, RTV/AGD), ABC Data (IT, electronics), Platinet (accessories, electronics), Hurtownia Makarony (food), Hurt-Hurt (toy wholesaler), Inter Cars (automotive parts). Большинство из них требуют регистрации JDG и минимального ежемесячного оборота. Для начала работы посетите их сайты или обратитесь к торговым представителям.",
      },
    ] satisfies FaqEntry[],

    faqPl: [
      {
        q: "Czy można prowadzić dropshipping w Polsce bez rejestracji JDG?",
        a: "Teoretycznie przy przychodach do 75% minimalnego wynagrodzenia miesięcznie (~3 181 PLN w 2025 roku) można działać jako działalność nierejestrowana. Jednak dropshipping na Allegro wymaga profesjonalnego konta sprzedawcy (konto firmowe), do którego potrzebna jest JDG lub sp. z o.o. Przy współpracy z hurtowniami (B2B) potrzebny jest też NIP. W praktyce — rejestruj JDG od razu.",
      },
      {
        q: "Kto odpowiada za zwrot towaru przy dropshippingu: ja czy dostawca?",
        a: "Zgodnie z polską ustawą o prawach konsumenta — **Ty** jako sprzedawca ponosisz pełną odpowiedzialność wobec kupującego. Dostawca dropshippingowy jest Twoim kontrahentem (B2B), a nie stroną umowy z końcowym kupującym. Dlatego w umowie z dostawcą należy określić procedurę zwrotów i zasady zwrotu Twoich kosztów obsługi reklamacji.",
      },
      {
        q: "Jakie polskie hurtownie obsługują dropshipping dla Allegro?",
        a: "Główne polskie hurtownie dropshippingowe: Action S.A. (elektronika, RTV/AGD), ABC Data (IT, elektronika), Platinet (akcesoria), Hurtownia Makarony (żywność), Hurt-Hurt (zabawki), Inter Cars (motoryzacja). Większość wymaga rejestracji JDG i minimalnych obrotów miesięcznych. Aby rozpocząć współpracę, odwiedź ich strony internetowe lub skontaktuj się z przedstawicielami handlowymi.",
      },
    ] satisfies FaqEntry[],

    faqUa: [
      {
        q: "Чи можна займатися дропшипінгом у Польщі без реєстрації JDG?",
        a: "Теоретично, при доході до 75% мінімальної зарплати на місяць (~3 181 PLN у 2025 році) можна працювати як działalność nierejestrowana. Однак дропшипінг на Allegro вимагає професійного акаунту продавця, для якого необхідна JDG або sp. z o.o. На практиці — реєструйте JDG одразу.",
      },
      {
        q: "Хто несе відповідальність за повернення товару при дропшипінгу: я чи постачальник?",
        a: "За польським законом про захист прав споживачів — **ви** як продавець несете повну відповідальність перед покупцем. Постачальник-дропшипер є вашим контрагентом (B2B), а не стороною договору з кінцевим покупцем. Тому в договорі з постачальником необхідно прописати порядок повернення товару та відшкодування ваших витрат.",
      },
      {
        q: "Які польські постачальники підтримують дропшипінг для Allegro?",
        a: "Основні польські дропшипінг-постачальники: Action S.A. (електроніка, RTV/AGD), ABC Data (IT, електроніка), Platinet (аксесуари), Inter Cars (автозапчастини). Більшість вимагають реєстрації JDG та мінімального місячного обороту. Для початку роботи відвідайте їхні сайти або зверніться до торгових представників.",
      },
    ] satisfies FaqEntry[],

    faqEn: [
      {
        q: "Can I run a dropshipping business in Poland without registering a JDG?",
        a: "Theoretically, with monthly income below 75% of the minimum wage (~PLN 3,181 in 2025) you can operate as unregistered activity (działalność nierejestrowana). However, dropshipping on Allegro requires a professional seller account (konto firmowe), which requires a JDG or sp. z o.o. Working with B2B suppliers also requires a NIP tax number. In practice — register a JDG immediately.",
      },
      {
        q: "Who is responsible for returns in a dropshipping arrangement: me or the supplier?",
        a: "Under the Polish Consumer Rights Act — **you** as the seller bear full responsibility to the buyer. The dropshipping supplier is your B2B counterparty, not a party to the contract with the end customer. This is why your supplier agreement must specify the return procedure and the supplier's obligation to reimburse your return processing costs.",
      },
      {
        q: "Which Polish wholesalers support dropshipping for Allegro?",
        a: "Main Polish dropshipping wholesalers: Action S.A. (electronics, home appliances), ABC Data (IT, electronics), Platinet (accessories), Hurt-Hurt (toys), Inter Cars (automotive parts). Most require JDG registration and minimum monthly turnover. To start, visit their websites or contact their sales representatives.",
      },
    ] satisfies FaqEntry[],

    category: "registration",
    tags: ["dropshipping", "allegro", "jdg", "vat", "consumer-rights", "polish-suppliers", "action", "abc-data"],
    sortOrder: 30,
    isPublished: true,
  },

  // ── 2. drop-warehouse-hybrid ─────────────────────────────────────────────
  {
    slug: "drop-warehouse-hybrid",
    titleRu: "Гибридная стратегия: дроп + собственный склад",
    titlePl: "Strategia hybrydowa: drop + własny magazyn",
    titleUa: "Гібридна стратегія: дроп + власний склад",
    titleEn: "Hybrid Strategy: Dropshipping + Own Warehouse",

    contentRu: `## Гибридная стратегия: дропшиппинг как трамплин для собственного склада

Самые успешные польские e-commerce продавцы 2025 года не выбирают между «только дропшипинг» и «только свой склад». Они используют дропшиппинг для тестирования, а собственный склад — для масштабирования проверенных товаров.

### Логика гибридной модели

**Фаза 1 — Тестирование (дроп)**
- Запускаете 20–50 товаров через дропшиппинг
- Анализируете конверсию, возвраты, отзывы
- Определяете «победителей» — товары с конверсией выше 3% и возвратами ниже 10%
- Инвестиций в товар: 0 PLN

**Фаза 2 — Переход (оптовая закупка победителей)**
- Заказываете первую партию победителей (20–50 единиц) напрямую у производителя или оптовика
- Получаете скидку 30–50% от розничной цены
- Маржа растёт с 8–15% (дроп) до 30–50% (собственный склад)
- Контролируете качество товара перед отправкой

**Фаза 3 — Масштабирование**
- Развиваете собственный бренд на самых продаваемых товарах
- Рассматриваете собственный private label
- Дроп остаётся для постоянного тестирования новых ниш

### Ожидаемые показатели маржи по стратегии

| Этап | Модель | Маржа | Чистая прибыль |
|---|---|---|---|
| 1–3 месяц | 100% дроп | 8–15% | 3–8% |
| 4–6 месяц | 70% дроп + 30% склад | 15–22% | 8–15% |
| 7–12 месяц | 30% дроп + 70% склад | 25–35% | 15–25% |
| После 12 месяцев | 10% дроп + 90% склад | 30–50% | 20–35% |

### Стратегия двух аккаунтов Allegro

Опытные продавцы часто используют **два аккаунта Allegro**:

**Аккаунт 1 (тестовый, дроп):**
- Тестирование новых ниш и поставщиков
- Более низкий рейтинг (нормально для дропа)
- Не критично, если аккаунт получает негативные отзывы из-за долгих сроков доставки

**Аккаунт 2 (основной, склад):**
- Только проверенные товары с высокими рейтингами
- Быстрая доставка (1–2 дня)
- Цель — Super Seller (SuperSprzedawca) статус

**Важно:** Allegro запрещает создание нескольких аккаунтов с целью обхода правил. Оба аккаунта должны быть на разные юридические лица (например, JDG и sp. z o.o.) или чётко разделены. Проконсультируйтесь с юристом перед реализацией.

### Baselinker как инструмент управления гибридной моделью

**Baselinker** (baselinker.com) — польский SaaS-сервис для управления продажами на нескольких каналах. Ключевые функции для гибридной модели:

- **Синхронизация остатков** между дропшиппинг-поставщиком, вашим складом и маркетплейсами
- **Маршрутизация заказов**: заказы на дроп-товары автоматически отправляются поставщику; заказы на складские товары — на ваш склад
- **Сравнение маржи**: аналитика по источнику выполнения заказов
- **Мульти-канал**: Allegro, Amazon, WooCommerce, Shopify — все в одном интерфейсе

### Какие поставщики поддерживают гибридную модель

| Поставщик | Дроп | Оптовая закупка | Интеграция с Baselinker |
|---|---|---|---|
| Action S.A. | Да | Да | API + XML |
| ABC Data | Да | Да | API + XML |
| Platinet | Да | Да | XML |
| Morele.net | Частично | Да | API |
| x-kom (B2B) | Нет | Да | — |

### Пошаговый план перехода с дропа на склад

1. **Месяц 1–2**: Запускаете 20–50 дроп-товаров через Baselinker. Отслеживаете продажи ежедневно.
2. **Месяц 3**: Идентифицируете товары с продажами 10+ единиц/месяц и маржой выше 10%.
3. **Месяц 3–4**: Связываетесь с производителем/оптовиком напрямую. Запрашиваете прайс-лист и минимальный заказ.
4. **Месяц 4**: Закупаете первую партию (20–50 единиц). Храните дома или на складе.
5. **Месяц 5+**: Обновляете листинги: срок доставки 1–2 дня вместо 5–10. Наблюдаете за ростом конверсии и рейтинга.

### Финансовая модель: сравнение

**Пример: наушники за 100 PLN**

| Показатель | Дроп | Собственный склад |
|---|---|---|
| Закупочная цена | 82 PLN | 55 PLN |
| Цена продажи | 100 PLN | 100 PLN |
| Комиссия Allegro (8%) | 8 PLN | 8 PLN |
| Маржа | 10 PLN (10%) | 37 PLN (37%) |
| Чистая прибыль* | 4–6 PLN | 20–28 PLN |

*с учётом затрат на рекламу, возврат, упаковку`,

    contentPl: `## Strategia hybrydowa: dropshipping jako trampolina do własnego magazynu

Najlepsi polscy sprzedawcy e-commerce 2025 roku nie wybierają między «tylko dropshipping» a «tylko własny magazyn». Używają dropshippingu do testowania, a własnego magazynu — do skalowania sprawdzonych produktów.

### Logika modelu hybrydowego

**Faza 1 — Testowanie (drop)**
- Uruchamiasz 20–50 produktów przez dropshipping
- Analizujesz konwersję, zwroty, opinie
- Identyfikujesz «zwycięzców» — produkty z konwersją powyżej 3% i zwrotami poniżej 10%
- Inwestycja w towar: 0 PLN

**Faza 2 — Przejście (zakup hurtowy zwycięzców)**
- Zamawiasz pierwszą partię zwycięzców (20–50 sztuk) bezpośrednio u producenta lub hurtownika
- Otrzymujesz rabat 30–50% od ceny detalicznej
- Marża rośnie z 8–15% (drop) do 30–50% (własny magazyn)
- Kontrolujesz jakość towaru przed wysyłką

**Faza 3 — Skalowanie**
- Rozwijasz własną markę na bestsellerach
- Rozważasz private label
- Drop pozostaje do ciągłego testowania nowych nisz

### Oczekiwane wskaźniki marżowości

| Etap | Model | Marża | Zysk netto |
|---|---|---|---|
| 1–3 miesiąc | 100% drop | 8–15% | 3–8% |
| 4–6 miesiąc | 70% drop + 30% magazyn | 15–22% | 8–15% |
| 7–12 miesiąc | 30% drop + 70% magazyn | 25–35% | 15–25% |
| Po 12 miesiącach | 10% drop + 90% magazyn | 30–50% | 20–35% |

### Strategia dwóch kont Allegro

Doświadczeni sprzedawcy często używają **dwóch kont Allegro**:

**Konto 1 (testowe, drop):** testowanie nowych nisz i dostawców, niższa ocena (normalne przy dropie).

**Konto 2 (główne, magazyn):** wyłącznie sprawdzone produkty, szybka dostawa (1–2 dni), cel — status SuperSprzedawcy.

**Ważne:** Allegro zabrania tworzenia wielu kont w celu obejścia regulaminu. Oba konta muszą być przypisane do różnych podmiotów prawnych (np. JDG i sp. z o.o.) lub wyraźnie rozdzielone. Przed wdrożeniem skonsultuj się z prawnikiem.

### Baselinker jako narzędzie zarządzania modelem hybrydowym

**Baselinker** (baselinker.com) — polski SaaS do zarządzania sprzedażą wielokanałową. Kluczowe funkcje dla modelu hybrydowego:

- **Synchronizacja stanów** między dostawcą dropshippingowym, własnym magazynem i marketplace'ami
- **Routing zamówień**: zamówienia na towary drop są automatycznie przesyłane do dostawcy; na towary magazynowe — do Twojego magazynu
- **Porównanie marż**: analityka według źródła realizacji zamówień
- **Wielokanałowość**: Allegro, Amazon, WooCommerce, Shopify — wszystko w jednym interfejsie

### Krok po kroku: plan przejścia z dropu na magazyn

1. **Miesiąc 1–2**: Uruchamiasz 20–50 produktów drop przez Baselinker. Śledzisz sprzedaż codziennie.
2. **Miesiąc 3**: Identyfikujesz produkty ze sprzedażą 10+ sztuk/miesiąc i marżą powyżej 10%.
3. **Miesiąc 3–4**: Kontaktujesz się z producentem/hurtownikiem bezpośrednio. Prosisz o cennik i minimalne zamówienie.
4. **Miesiąc 4**: Kupujesz pierwszą partię (20–50 sztuk). Przechowujesz w domu lub magazynie.
5. **Miesiąc 5+**: Aktualizujesz oferty: czas dostawy 1–2 dni zamiast 5–10. Obserwujesz wzrost konwersji i oceny.`,

    contentUa: `## Гібридна стратегія: дропшипінг як трамплін для власного складу

Найкращі польські продавці e-commerce 2025 року не вибирають між «лише дропшипінг» та «лише власний склад». Вони використовують дропшипінг для тестування, а власний склад — для масштабування перевірених товарів.

### Логіка гібридної моделі

**Фаза 1 — Тестування (дроп)**
- Запускаєте 20–50 товарів через дропшипінг
- Аналізуєте конверсію, повернення, відгуки
- Визначаєте «переможців» — товари з конверсією вище 3% та поверненнями нижче 10%

**Фаза 2 — Перехід (оптова закупівля переможців)**
- Замовляєте першу партію (20–50 одиниць) безпосередньо у виробника
- Маржа зростає з 8–15% (дроп) до 30–50% (власний склад)

**Фаза 3 — Масштабування**
- Розвиваєте власний бренд на найпопулярніших товарах
- Дроп залишається для постійного тестування нових ніш

### Очікувані показники маржинальності

| Етап | Модель | Маржа | Чистий прибуток |
|---|---|---|---|
| 1–3 місяць | 100% дроп | 8–15% | 3–8% |
| 4–6 місяць | 70% дроп + 30% склад | 15–22% | 8–15% |
| 7–12 місяць | 30% дроп + 70% склад | 25–35% | 15–25% |
| Після 12 місяців | 10% дроп + 90% склад | 30–50% | 20–35% |

### Baselinker як інструмент управління гібридною моделлю

**Baselinker** (baselinker.com) — польський SaaS для управління продажами на кількох каналах. Ключові функції: синхронізація залишків між постачальником та складом, маршрутизація замовлень, аналітика маржинальності, мульти-канал (Allegro, Amazon, WooCommerce).

### Покроковий план переходу

1. **Місяць 1–2**: Запускаєте 20–50 дроп-товарів, відстежуєте продажі щодня.
2. **Місяць 3**: Ідентифікуєте товари з продажами 10+ одиниць/місяць та маржею понад 10%.
3. **Місяць 3–4**: Зв'язуєтесь з виробником/оптовиком напряму.
4. **Місяць 4**: Закуповуєте першу партію (20–50 одиниць).
5. **Місяць 5+**: Оновлюєте лістинги — час доставки 1–2 дні замість 5–10.`,

    contentEn: `## Hybrid Strategy: Dropshipping as a Launchpad for Your Own Warehouse

The most successful Polish e-commerce sellers in 2025 do not choose between "only dropshipping" and "only own warehouse". They use dropshipping for testing and their own warehouse for scaling proven products.

### The Logic of the Hybrid Model

**Phase 1 — Testing (drop)**
- Launch 20–50 products via dropshipping
- Analyse conversion rates, returns, and reviews
- Identify "winners" — products with conversion above 3% and returns below 10%
- Investment in stock: PLN 0

**Phase 2 — Transition (bulk purchase of winners)**
- Order the first batch of winners (20–50 units) directly from a manufacturer or wholesaler
- Receive a 30–50% discount off the retail price
- Margin increases from 8–15% (drop) to 30–50% (own warehouse)
- Control product quality before shipping

**Phase 3 — Scaling**
- Develop your own brand for bestsellers
- Consider private label
- Drop continues for constant new niche testing

### Expected Margin Metrics

| Stage | Model | Margin | Net profit |
|---|---|---|---|
| Months 1–3 | 100% drop | 8–15% | 3–8% |
| Months 4–6 | 70% drop + 30% warehouse | 15–22% | 8–15% |
| Months 7–12 | 30% drop + 70% warehouse | 25–35% | 15–25% |
| After 12 months | 10% drop + 90% warehouse | 30–50% | 20–35% |

### Two Allegro Accounts Strategy

Experienced sellers often use **two Allegro accounts**:

**Account 1 (test, drop):** new niche and supplier testing, lower rating acceptable.

**Account 2 (main, warehouse):** only verified products, fast delivery (1–2 days), target: Super Seller status.

**Important:** Allegro prohibits multiple accounts to circumvent rules. Both accounts must belong to separate legal entities (e.g., JDG and sp. z o.o.) or be clearly separated. Consult a lawyer before implementing.

### Baselinker for Hybrid Model Management

**Baselinker** (baselinker.com) is a Polish SaaS for multi-channel sales management. Key features for the hybrid model:

- **Stock synchronisation** between the dropshipping supplier, your warehouse, and marketplaces
- **Order routing**: drop-product orders are automatically forwarded to the supplier; warehouse-product orders go to your warehouse
- **Margin comparison**: analytics by order fulfilment source
- **Multi-channel**: Allegro, Amazon, WooCommerce, Shopify — all in one interface

### Suppliers That Support the Hybrid Model

| Supplier | Drop | Wholesale | Baselinker Integration |
|---|---|---|---|
| Action S.A. | Yes | Yes | API + XML |
| ABC Data | Yes | Yes | API + XML |
| Platinet | Yes | Yes | XML |
| Morele.net | Partial | Yes | API |
| x-kom (B2B) | No | Yes | — |

### Step-by-Step Transition Plan

1. **Month 1–2**: Launch 20–50 drop products via Baselinker. Track sales daily.
2. **Month 3**: Identify products with 10+ units/month sold and margin above 10%.
3. **Month 3–4**: Contact manufacturer/wholesaler directly. Request price list and MOQ.
4. **Month 4**: Buy first batch (20–50 units). Store at home or in a small warehouse.
5. **Month 5+**: Update listings: delivery time 1–2 days instead of 5–10. Watch conversion and rating improve.`,

    faqRu: [
      {
        q: "Сколько товаров нужно протестировать через дроп, прежде чем закупать оптом?",
        a: "Минимальный порог принятия решения: 20–30 продаж одного SKU через дропшиппинг за 1–2 месяца. Этого достаточно для оценки спроса, сезонности и частоты возвратов. При ежемесячных продажах 10+ единиц с маржой выше 10% — товар-кандидат для закупки. При менее 5 продаж за 2 месяца — пробуйте другую нишу.",
      },
      {
        q: "Как Baselinker помогает управлять гибридной моделью?",
        a: "Baselinker позволяет настроить правила маршрутизации заказов: если товар есть на вашем складе — заказ идёт вам; если нет — автоматически передаётся поставщику-дропшипперу. При этом покупатель видит единый статус заказа. Дополнительно Baselinker синхронизирует остатки в реальном времени, автоматически выставляет счета (faktura VAT) и генерирует этикетки для отправки. Стоимость от 99 PLN/мес за базовый план.",
      },
      {
        q: "Можно ли работать с китайскими поставщиками (AliExpress, 1688) в гибридной модели для Allegro?",
        a: "Да, но с существенными оговорками. Поляки не любят долгую доставку — ваш аккаунт на Allegro будет получать негативные отзывы при сроках 2–4 недели. Используйте китайских поставщиков только для тестирования нишы (фаза 1), а затем переходите на польского или европейского оптовика. Для фазы дропа из Китая используйте AliExpress Dropshipping Center или агентов на 1688.com.",
      },
    ] satisfies FaqEntry[],

    faqPl: [
      {
        q: "Ile produktów trzeba przetestować przez drop przed zakupem hurtowym?",
        a: "Minimalny próg decyzyjny: 20–30 sprzedaży jednego SKU przez dropshipping w ciągu 1–2 miesięcy. Wystarczy to do oceny popytu, sezonowości i częstotliwości zwrotów. Przy sprzedaży 10+ sztuk miesięcznie z marżą powyżej 10% — produkt jest kandydatem do zakupu. Przy mniej niż 5 sprzedażach w 2 miesiące — szukaj innej niszy.",
      },
      {
        q: "Jak Baselinker pomaga zarządzać modelem hybrydowym?",
        a: "Baselinker pozwala skonfigurować reguły routingu zamówień: jeśli towar jest na Twoim magazynie — zamówienie trafia do Ciebie; jeśli nie — jest automatycznie przekazywane do dostawcy dropshippingowego. Kupujący widzi jednolity status zamówienia. Dodatkowo Baselinker synchronizuje stany w czasie rzeczywistym, automatycznie wystawia faktury VAT i generuje etykiety wysyłkowe. Cena od 99 PLN/mies. za plan podstawowy.",
      },
      {
        q: "Czy można współpracować z chińskimi dostawcami (AliExpress, 1688) w modelu hybrydowym dla Allegro?",
        a: "Tak, ale z istotnymi zastrzeżeniami. Polacy nie lubią długich dostaw — Twoje konto na Allegro będzie otrzymywać negatywne opinie przy terminach 2–4 tygodnie. Używaj chińskich dostawców tylko do testowania niszy (faza 1), a następnie przejdź na polskiego lub europejskiego hurtownika. Do fazy drop z Chin użyj AliExpress Dropshipping Center lub agentów na 1688.com.",
      },
    ] satisfies FaqEntry[],

    faqUa: [
      {
        q: "Скільки товарів потрібно протестувати через дроп перед оптовою закупівлею?",
        a: "Мінімальний поріг прийняття рішення: 20–30 продажів одного SKU через дропшипінг за 1–2 місяці. При щомісячних продажах 10+ одиниць з маржею понад 10% — товар-кандидат для закупівлі. При менш ніж 5 продажах за 2 місяці — шукайте іншу нішу.",
      },
      {
        q: "Як Baselinker допомагає управляти гібридною моделлю?",
        a: "Baselinker дозволяє налаштувати правила маршрутизації замовлень: якщо товар є на вашому складі — замовлення йде вам; якщо ні — автоматично передається постачальнику-дропшиперу. Додатково синхронізує залишки в реальному часі, автоматично виставляє рахунки-фактури та генерує етикетки для відправки. Вартість від 99 PLN/міс за базовий план.",
      },
      {
        q: "Чи можна працювати з китайськими постачальниками в гібридній моделі для Allegro?",
        a: "Так, але з суттєвими застереженнями. Поляки не люблять довгого доставлення — при строках 2–4 тижні ваш акаунт на Allegro отримуватиме негативні відгуки. Використовуйте китайських постачальників лише для тестування ніші (фаза 1), а потім переходьте на польського або європейського оптовика.",
      },
    ] satisfies FaqEntry[],

    faqEn: [
      {
        q: "How many products should I test via drop before buying wholesale?",
        a: "Minimum decision threshold: 20–30 sales of one SKU via dropshipping over 1–2 months. This is sufficient to assess demand, seasonality, and return frequency. With 10+ units/month sold and margin above 10% — the product is a candidate for bulk purchase. With fewer than 5 sales in 2 months — try a different niche.",
      },
      {
        q: "How does Baselinker help manage the hybrid model?",
        a: "Baselinker lets you configure order routing rules: if the product is in your warehouse — the order goes to you; if not — it is automatically forwarded to the dropshipping supplier. The buyer sees a unified order status. Baselinker also synchronises stock levels in real time, automatically issues VAT invoices, and generates shipping labels. Pricing starts from PLN 99/month for the basic plan.",
      },
      {
        q: "Can I work with Chinese suppliers (AliExpress, 1688) in the hybrid model for Allegro?",
        a: "Yes, but with important caveats. Polish buyers dislike long delivery times — your Allegro account will receive negative reviews with 2–4 week lead times. Use Chinese suppliers only for niche testing (phase 1), then transition to a Polish or European wholesaler. For the drop phase from China, use AliExpress Dropshipping Center or agents on 1688.com.",
      },
    ] satisfies FaqEntry[],

    category: "registration",
    tags: ["dropshipping", "hybrid-model", "warehouse", "baselinker", "allegro", "margins", "private-label", "action", "abc-data"],
    sortOrder: 31,
    isPublished: true,
  },

  // ── 3. baselinker-integration-guide ─────────────────────────────────────
  {
    slug: "baselinker-integration-guide",
    titleRu: "Baselinker: интеграция для польского e-commerce",
    titlePl: "Baselinker: integracja dla polskiego e-commerce",
    titleUa: "Baselinker: інтеграція для польського e-commerce",
    titleEn: "Baselinker: Integration Guide for Polish E-Commerce",

    contentRu: `## Baselinker: полное руководство по интеграции для польского e-commerce

**Baselinker** (baselinker.com) — польский SaaS-сервис для управления заказами и синхронизации многоканальных продаж. По данным самого Baselinker, им пользуются более 20 000 магазинов в Польше и ЦВЕ. Для продавцов, работающих одновременно на Allegro, Amazon, WooCommerce и через дропшиппинговых поставщиков, Baselinker — де-факто стандарт.

### Что умеет Baselinker

**Управление заказами:**
- Единый интерфейс для заказов со всех каналов (Allegro, Amazon, WooCommerce, Shoper, PrestaShop, Shopify и др.)
- Автоматические статусы заказов
- Пакетная обработка заказов
- История коммуникации с покупателями

**Управление складом:**
- Синхронизация остатков в реальном времени между каналами
- Автоматическое снятие с продажи при обнулении остатка
- Импорт прайс-листов поставщиков (XML, CSV, API)
- Групповое обновление цен

**Логистика и отправка:**
- Интеграция с InPost, DPD, DHL, GLS, Poczta Polska, Orlen Paczka и другими
- Автоматическая генерация этикеток
- Трекинг отправлений
- Пункты выдачи (paczkomaty)

**Финансы:**
- Автоматическое выставление счетов (faktura VAT, paragon)
- Интеграция с сервисами: iFirma, inFakt, wFirma, Fakturownia
- Экспорт данных для бухгалтера

**Аналитика:**
- Отчёты по продажам, каналам, поставщикам
- Сравнение маржи по каналам
- Анализ возвратов

### Тарифные планы (2025)

| План | Стоимость | Заказов/мес | Пользователей |
|---|---|---|---|
| Start | 99 PLN/мес | до 300 | 1 |
| Standard | 199 PLN/мес | до 1 500 | 3 |
| Professional | 299 PLN/мес | до 5 000 | 10 |
| Enterprise | индивидуально | неограниченно | неограниченно |

Все планы включают 14-дневный бесплатный период. Нет долгосрочных контрактов.

### Пошаговая настройка Baselinker

**Шаг 1: Подключение каналов продаж**
1. Зайдите в «Integracje» → «Marketplace».
2. Добавьте Allegro: войдите через OAuth, выберите аккаунт.
3. Добавьте Amazon: введите MWS-ключи или через Seller Central.
4. Добавьте WooCommerce: установите плагин Baselinker, введите API-ключ.

**Шаг 2: Подключение склада/поставщиков**
1. Перейдите в «Magazyn» → «Źródła produktów».
2. Для дропшиппинг-поставщика добавьте XML-фид (Action, ABC Data предоставляют XML).
3. Настройте расписание обновления остатков (рекомендуется: каждые 30–60 минут).
4. Включите автоматическое снятие с продажи при нулевом остатке.

**Шаг 3: Настройка автоматизации заказов**
1. Перейдите в «Automatyzacje» → «Reguły automatyzacji».
2. Создайте правило: «Если канал = Allegro И поставщик = Action → Оформить заказ у поставщика автоматически».
3. Настройте уведомление о статусе покупателю.
4. Подключите сервис доставки (InPost, DPD и т.д.).

**Шаг 4: Настройка выставления счетов**
1. Перейдите в «Faktury» → «Integracja z programem księgowym».
2. Выберите: iFirma, inFakt или wFirma.
3. Введите API-ключ вашей бухгалтерской программы.
4. Настройте автоматическое создание faktura VAT при подтверждении заказа.

### Интеграция с польскими дропшиппинг-поставщиками

| Поставщик | Метод интеграции | Обновление остатков |
|---|---|---|
| Action S.A. | REST API + XML | Каждые 15 минут |
| ABC Data | XML + API | Каждые 30 минут |
| Platinet | XML | Раз в час |
| Hurtownia AB | XML | Каждые 30 минут |
| Morele.net | API | Каждые 15 минут |

Для подключения большинства поставщиков необходимо сначала открыть B2B-аккаунт на их сайте и получить учётные данные для API/XML.

### Интеграция EcomPilot с Baselinker

EcomPilot использует API Baselinker для:
- Получения данных о заказах и остатках
- Автоматического расчёта маржинальности по каналам
- Уведомлений о критически низком остатке
- Аналитики прибыльности SKU

Для настройки интеграции: в Baselinker перейдите «Moje konto» → «API» → «Generuj klucz API», и введите ключ в настройках EcomPilot.

### Типичные ошибки при настройке

1. **Не настроена синхронизация остатков** — приводит к продажам товаров, которых нет в наличии (overselling).
2. **Слишком редкое обновление XML** — если поставщик обновляется раз в час, а у вас настроено раз в день — риск продать недоступный товар.
3. **Нет правил для возвратов** — настройте автоматическое уведомление поставщику при возврате.
4. **Одинаковые EAN у нескольких поставщиков** — Allegro привяжет листинг к первому, могут быть конфликты.`,

    contentPl: `## Baselinker: kompletny przewodnik integracji dla polskiego e-commerce

**Baselinker** (baselinker.com) to polski SaaS do zarządzania zamówieniami i synchronizacji sprzedaży wielokanałowej. Z Baselnkera korzysta ponad 20 000 sklepów w Polsce i CEE. Dla sprzedawców działających jednocześnie na Allegro, Amazonie, WooCommerce i przez dostawców dropshippingowych — Baselinker jest de facto standardem.

### Co potrafi Baselinker

**Zarządzanie zamówieniami:**
- Jeden interfejs dla zamówień ze wszystkich kanałów (Allegro, Amazon, WooCommerce, Shoper, PrestaShop, Shopify i inne)
- Automatyczne statusy zamówień
- Przetwarzanie wsadowe zamówień
- Historia komunikacji z kupującymi

**Zarządzanie magazynem:**
- Synchronizacja stanów w czasie rzeczywistym między kanałami
- Automatyczne wycofanie z oferty przy zerowym stanie
- Import cenników dostawców (XML, CSV, API)
- Grupowa aktualizacja cen

**Logistyka i wysyłka:**
- Integracja z InPost, DPD, DHL, GLS, Pocztą Polską, Orlen Paczka i innymi
- Automatyczne generowanie etykiet
- Śledzenie przesyłek
- Paczkomaty InPost

**Finanse:**
- Automatyczne wystawianie faktur VAT i paragonów
- Integracja z: iFirma, inFakt, wFirma, Fakturownia
- Eksport danych dla księgowego

**Analityka:**
- Raporty sprzedaży, kanałów, dostawców
- Porównanie marży według kanałów
- Analiza zwrotów

### Plany cenowe (2025)

| Plan | Cena | Zamówień/mies. | Użytkowników |
|---|---|---|---|
| Start | 99 PLN/mies. | do 300 | 1 |
| Standard | 199 PLN/mies. | do 1 500 | 3 |
| Professional | 299 PLN/mies. | do 5 000 | 10 |
| Enterprise | indywidualnie | nieograniczone | nieograniczone |

Wszystkie plany obejmują 14-dniowy bezpłatny okres. Brak długoterminowych umów.

### Krok po kroku: konfiguracja Baselinker

**Krok 1: Podłączenie kanałów sprzedaży**
1. Przejdź do «Integracje» → «Marketplace».
2. Dodaj Allegro: zaloguj się przez OAuth, wybierz konto.
3. Dodaj Amazon: wprowadź klucze MWS lub przez Seller Central.
4. Dodaj WooCommerce: zainstaluj wtyczkę Baselinker, wprowadź klucz API.

**Krok 2: Podłączenie magazynu/dostawców**
1. Przejdź do «Magazyn» → «Źródła produktów».
2. Dla dostawcy dropshippingowego dodaj feed XML (Action, ABC Data dostarczają XML).
3. Ustaw harmonogram aktualizacji stanów (zalecane: co 30–60 minut).
4. Włącz automatyczne wycofanie z oferty przy zerowym stanie.

**Krok 3: Konfiguracja automatyzacji zamówień**
1. Przejdź do «Automatyzacje» → «Reguły automatyzacji».
2. Utwórz regułę: «Jeśli kanał = Allegro I dostawca = Action → Złóż zamówienie u dostawcy automatycznie».
3. Skonfiguruj powiadomienie o statusie dla kupującego.
4. Podłącz serwis wysyłkowy (InPost, DPD itp.).

**Krok 4: Konfiguracja fakturowania**
1. Przejdź do «Faktury» → «Integracja z programem księgowym».
2. Wybierz: iFirma, inFakt lub wFirma.
3. Wprowadź klucz API Twojego programu księgowego.
4. Skonfiguruj automatyczne tworzenie faktury VAT po potwierdzeniu zamówienia.

### Integracja z polskimi hurtowniami dropshippingowymi

| Dostawca | Metoda integracji | Aktualizacja stanów |
|---|---|---|
| Action S.A. | REST API + XML | Co 15 minut |
| ABC Data | XML + API | Co 30 minut |
| Platinet | XML | Co godzinę |
| Hurtownia AB | XML | Co 30 minut |
| Morele.net | API | Co 15 minut |

### Integracja EcomPilot z Baselinker

EcomPilot używa API Baselinker do: pobierania danych o zamówieniach i stanach, automatycznego obliczania marżowości według kanałów, powiadomień o niskim stanie i analityki rentowności SKU.

Aby skonfigurować integrację: w Baselinker przejdź «Moje konto» → «API» → «Generuj klucz API» i wprowadź klucz w ustawieniach EcomPilot.`,

    contentUa: `## Baselinker: повний посібник з інтеграції для польського e-commerce

**Baselinker** (baselinker.com) — польський SaaS для управління замовленнями та синхронізації багатоканальних продажів. Понад 20 000 магазинів у Польщі та ЦСЄ використовують Baselinker. Для продавців, які працюють одночасно на Allegro, Amazon, WooCommerce та через дропшипінгових постачальників — Baselinker є де-факто стандартом.

### Що вміє Baselinker

**Управління замовленнями:** єдиний інтерфейс для замовлень з усіх каналів, автоматичні статуси, пакетна обробка.

**Управління складом:** синхронізація залишків у реальному часі, автоматичне зняття з продажу при нульовому залишку, імпорт прайс-листів постачальників.

**Логістика:** інтеграція з InPost, DPD, DHL, GLS, Poczta Polska, автоматична генерація етикеток.

**Фінанси:** автоматичне виставлення рахунків-фактур, інтеграція з iFirma, inFakt, wFirma.

### Тарифні плани (2025)

| План | Вартість | Замовлень/міс | Користувачів |
|---|---|---|---|
| Start | 99 PLN/міс | до 300 | 1 |
| Standard | 199 PLN/міс | до 1 500 | 3 |
| Professional | 299 PLN/міс | до 5 000 | 10 |

### Покрокова настройка

**Крок 1:** Підключіть Allegro, Amazon, WooCommerce через OAuth або API-ключі.

**Крок 2:** Підключіть XML-фіди від постачальників (Action, ABC Data). Налаштуйте оновлення залишків кожні 30–60 хвилин.

**Крок 3:** Налаштуйте правила маршрутизації замовлень: якщо товар у постачальника → замовлення автоматично у постачальника.

**Крок 4:** Підключіть бухгалтерську програму (iFirma, inFakt) для автоматичного виставлення рахунків-фактур.

### Інтеграція EcomPilot з Baselinker

EcomPilot використовує API Baselinker для отримання даних про замовлення та залишки, розрахунку маржинальності та аналітики прибутковості SKU.

Для настройки: у Baselinker перейдіть «Moje konto» → «API» → «Generuj klucz API» та введіть ключ у налаштуваннях EcomPilot.`,

    contentEn: `## Baselinker: Integration Guide for Polish E-Commerce

**Baselinker** (baselinker.com) is a Polish SaaS for order management and multi-channel sales synchronisation. Over 20,000 shops in Poland and CEE use Baselinker. For sellers operating across Allegro, Amazon, WooCommerce, and dropshipping suppliers simultaneously, Baselinker is the de-facto standard.

### What Baselinker Does

**Order management:**
- Single interface for orders from all channels (Allegro, Amazon, WooCommerce, Shoper, PrestaShop, Shopify, and others)
- Automatic order statuses
- Batch order processing
- Buyer communication history

**Warehouse management:**
- Real-time stock synchronisation between channels
- Automatic listing withdrawal at zero stock
- Supplier price list import (XML, CSV, API)
- Bulk price updates

**Logistics and shipping:**
- Integration with InPost, DPD, DHL, GLS, Poczta Polska, Orlen Paczka, and others
- Automatic label generation
- Shipment tracking
- InPost parcel locker (paczkomat) support

**Finance:**
- Automatic VAT invoice and receipt generation
- Integration with iFirma, inFakt, wFirma, Fakturownia
- Data export for the accountant

**Analytics:**
- Sales, channel, and supplier reports
- Margin comparison by channel
- Return analysis

### Pricing Plans (2025)

| Plan | Price | Orders/month | Users |
|---|---|---|---|
| Start | PLN 99/month | up to 300 | 1 |
| Standard | PLN 199/month | up to 1,500 | 3 |
| Professional | PLN 299/month | up to 5,000 | 10 |
| Enterprise | custom pricing | unlimited | unlimited |

All plans include a 14-day free trial. No long-term contracts.

### Step-by-Step Baselinker Setup

**Step 1: Connect sales channels**
1. Go to "Integracje" → "Marketplace".
2. Add Allegro: log in via OAuth, select your account.
3. Add Amazon: enter MWS keys or connect via Seller Central.
4. Add WooCommerce: install the Baselinker plugin and enter the API key.

**Step 2: Connect warehouse/suppliers**
1. Go to "Magazyn" → "Źródła produktów".
2. For a dropshipping supplier, add the XML feed (Action, ABC Data provide XML feeds).
3. Set the stock update schedule (recommended: every 30–60 minutes).
4. Enable automatic listing withdrawal at zero stock.

**Step 3: Configure order automation**
1. Go to "Automatyzacje" → "Reguły automatyzacji".
2. Create a rule: "If channel = Allegro AND supplier = Action → Place order with supplier automatically".
3. Configure buyer status notifications.
4. Connect a shipping service (InPost, DPD, etc.).

**Step 4: Configure invoicing**
1. Go to "Faktury" → "Integracja z programem księgowym".
2. Select iFirma, inFakt, or wFirma.
3. Enter your accounting software API key.
4. Configure automatic VAT invoice creation on order confirmation.

### Integration with Polish Dropshipping Suppliers

| Supplier | Integration method | Stock update |
|---|---|---|
| Action S.A. | REST API + XML | Every 15 minutes |
| ABC Data | XML + API | Every 30 minutes |
| Platinet | XML | Every hour |
| Hurtownia AB | XML | Every 30 minutes |
| Morele.net | API | Every 15 minutes |

To connect most suppliers, you must first open a B2B account on their website and obtain API/XML credentials.

### EcomPilot Integration with Baselinker

EcomPilot uses the Baselinker API for:
- Retrieving order and stock data
- Automatically calculating channel-level margins
- Low-stock alerts
- SKU profitability analytics

To configure the integration: in Baselinker go to "Moje konto" → "API" → "Generuj klucz API", then enter the key in EcomPilot settings.

### Common Setup Mistakes

1. **Stock synchronisation not configured** — leads to overselling products that are out of stock.
2. **Too infrequent XML updates** — if the supplier updates hourly but you set daily, you risk selling unavailable products.
3. **No return automation rules** — configure automatic supplier notification on return.
4. **Duplicate EANs across multiple suppliers** — Allegro will bind the listing to the first match, causing conflicts.`,

    faqRu: [
      {
        q: "Можно ли подключить Baselinker к нескольким аккаунтам Allegro одновременно?",
        a: "Да, Baselinker поддерживает подключение нескольких аккаунтов Allegro в рамках одного workspace. Это особенно полезно при гибридной стратегии (один аккаунт для дропа, другой для склада). Каждый аккаунт Allegro управляется отдельно, с собственными правилами автоматизации и настройками доставки.",
      },
      {
        q: "Как Baselinker автоматически выставляет счета на Allegro?",
        a: "Baselinker интегрируется с польскими бухгалтерскими сервисами (iFirma, inFakt, wFirma). После настройки интеграции при каждом подтверждённом заказе автоматически создаётся faktura VAT или paragon в зависимости от типа покупателя (B2B/B2C). Документ отправляется покупателю по email и одновременно попадает в ваш бухгалтерский сервис. Это устраняет ручной труд и ошибки.",
      },
      {
        q: "Сколько стоит Baselinker для начинающего e-commerce продавца?",
        a: "Для начинающего продавца с до 300 заказов в месяц подходит план Start за 99 PLN/мес (+НДС, т.е. 121,77 PLN брутто). Это менее 0,40 PLN на заказ. Baselinker предлагает 14-дневный бесплатный период без требования кредитной карты — рекомендуется начать с него, чтобы протестировать все функции перед оплатой.",
      },
    ] satisfies FaqEntry[],

    faqPl: [
      {
        q: "Czy można podłączyć Baselinker do kilku kont Allegro jednocześnie?",
        a: "Tak, Baselinker obsługuje podłączenie wielu kont Allegro w ramach jednego workspace. Jest to szczególnie przydatne przy strategii hybrydowej (jedno konto do dropu, drugie do magazynu). Każde konto Allegro jest zarządzane oddzielnie, z własnymi regułami automatyzacji i ustawieniami dostawy.",
      },
      {
        q: "Jak Baselinker automatycznie wystawia faktury na Allegro?",
        a: "Baselinker integruje się z polskimi programami księgowymi (iFirma, inFakt, wFirma). Po skonfigurowaniu integracji przy każdym potwierdzonym zamówieniu automatycznie tworzona jest faktura VAT lub paragon w zależności od typu kupującego (B2B/B2C). Dokument jest wysyłany kupującemu emailem i jednocześnie trafia do Twojego programu księgowego.",
      },
      {
        q: "Ile kosztuje Baselinker dla początkującego sprzedawcy e-commerce?",
        a: "Dla początkującego sprzedawcy z do 300 zamówień miesięcznie odpowiedni jest plan Start za 99 PLN/mies. netto (121,77 PLN brutto). To mniej niż 0,40 PLN na zamówienie. Baselinker oferuje 14-dniowy bezpłatny okres bez wymagania karty kredytowej — zalecamy zacząć od niego, aby przetestować wszystkie funkcje przed zakupem.",
      },
    ] satisfies FaqEntry[],

    faqUa: [
      {
        q: "Чи можна підключити Baselinker до кількох акаунтів Allegro одночасно?",
        a: "Так, Baselinker підтримує підключення кількох акаунтів Allegro в рамках одного workspace. Це особливо корисно при гібридній стратегії (один акаунт для дропу, інший для складу). Кожен акаунт Allegro управляється окремо, з власними правилами автоматизації та налаштуваннями доставки.",
      },
      {
        q: "Як Baselinker автоматично виставляє рахунки-фактури на Allegro?",
        a: "Baselinker інтегрується з польськими бухгалтерськими сервісами (iFirma, inFakt, wFirma). Після налаштування інтеграції при кожному підтвердженому замовленні автоматично створюється faktura VAT або paragon залежно від типу покупця (B2B/B2C). Документ надсилається покупцю на email та одночасно потрапляє до вашого бухгалтерського сервісу.",
      },
      {
        q: "Скільки коштує Baselinker для початківця e-commerce продавця?",
        a: "Для початківця з до 300 замовлень на місяць підходить план Start за 99 PLN/міс нетто (121,77 PLN брутто). Це менше 0,40 PLN на замовлення. Baselinker пропонує 14-денний безкоштовний період без вимоги кредитної картки — рекомендується почати з нього.",
      },
    ] satisfies FaqEntry[],

    faqEn: [
      {
        q: "Can Baselinker be connected to multiple Allegro accounts simultaneously?",
        a: "Yes, Baselinker supports connecting multiple Allegro accounts within a single workspace. This is especially useful for the hybrid strategy (one account for drop, another for warehouse stock). Each Allegro account is managed separately, with its own automation rules and shipping settings.",
      },
      {
        q: "How does Baselinker automatically issue invoices for Allegro orders?",
        a: "Baselinker integrates with Polish accounting services (iFirma, inFakt, wFirma). Once the integration is configured, a VAT invoice or receipt is automatically created for each confirmed order depending on the buyer type (B2B/B2C). The document is emailed to the buyer and simultaneously synced to your accounting software, eliminating manual work and errors.",
      },
      {
        q: "How much does Baselinker cost for a beginner e-commerce seller?",
        a: "For a beginner with up to 300 orders per month, the Start plan at PLN 99/month net (PLN 121.77 gross) is appropriate. That is less than PLN 0.40 per order. Baselinker offers a 14-day free trial with no credit card required — start with the trial to test all features before committing.",
      },
    ] satisfies FaqEntry[],

    category: "logistics",
    tags: ["baselinker", "allegro", "amazon", "woocommerce", "dropshipping", "warehouse", "automation", "invoicing", "inpost"],
    sortOrder: 32,
    isPublished: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed function
// ─────────────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const db = getDb();

  write("Seeding dropshipping topics...");

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

  write(`\nSeeded ${topics.length} dropshipping topics.\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

seed()
  .then(() => {
    write("Dropshipping seed complete.\n");
    return closeDb();
  })
  .then(() => {
    process.exit(0);
  })
  .catch((err: unknown) => {
    process.stderr.write(`Dropshipping seed failed: ${String(err)}\n`);
    return closeDb().finally(() => {
      process.exit(1);
    });
  });
