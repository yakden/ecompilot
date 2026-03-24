// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — legal-service / db / seed-trademark
// Trademark (UPRP, EUIPO), EAN/GS1, and Allegro Brand Protection guides
// Run with: npx tsx src/db/seed-trademark.ts
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
  // ── 1. trademark-poland-guide ────────────────────────────────────────────
  {
    slug: "trademark-poland-guide",
    titleRu: "Регистрация товарного знака в Польше (UPRP)",
    titlePl: "Rejestracja znaku towarowego w Polsce (UPRP)",
    titleUa: "Реєстрація торговельної марки в Польщі (UPRP)",
    titleEn: "Trademark Registration in Poland (UPRP)",

    contentRu: `## Регистрация товарного знака в Польше (UPRP)

Товарный знак в Польше регистрирует **Urząd Patentowy Rzeczypospolitej Polskiej (UPRP)** — Патентное ведомство Республики Польша. Это ключевой инструмент защиты бренда для e-commerce продавцов, который открывает доступ к Amazon Brand Registry и Allegro Brand Zone.

### Что можно зарегистрировать как товарный знак

Польское законодательство (Ustawa Prawo własności przemysłowej) допускает регистрацию:
- **Словесных знаков** — название бренда, слоган
- **Изобразительных знаков** — логотип, графический символ
- **Комбинированных знаков** — логотип с названием
- **Объёмных знаков** — форма упаковки или товара
- **Звуковых и мультимедийных знаков**

Товарный знак **не регистрируется**, если он носит описательный характер («Лучший магазин»), состоит из географических названий, вводит потребителя в заблуждение или противоречит добрым нравам.

### Международная классификация товаров и услуг (Классификация Ницца)

Знак регистрируется в одном или нескольких **классах по классификации Ницца** (Nice Classification). Для e-commerce наиболее востребованы:
- **Класс 35** — розничная торговля, электронная коммерция, управление интернет-магазином
- **Класс 39** — транспортировка и доставка товаров
- **Класс 42** — программное обеспечение, IT-услуги

Заявляйте только те классы, в которых реально используете знак: каждый лишний класс увеличивает пошлину.

### Стоимость регистрации

| Позиция | Сумма |
|---|---|
| Базовая пошлина (1 класс, онлайн) | 450 злотых |
| Каждый дополнительный класс | 120 злотых |
| Экспертиза (включена в пошлину) | — |
| Регистрационное свидетельство | 0 злотых |
| Итого (1 класс) | **450 злотых** |
| Итого (3 класса) | **690 злотых** |

При подаче через представителя (rzecznik patentowy) добавьте ~1 500–3 000 злотых за услуги.

### Онлайн-подача через e-UPRP / ePUAP

1. Зайдите на **e-uprp.pl** и создайте аккаунт или войдите через Profil Zaufany (ePUAP).
2. Выберите «Zgłoszenie znaku towarowego» и заполните форму TM.
3. Загрузите изображение знака (JPG/PNG, 800×800 px, белый фон).
4. Укажите классы по Ницца и перечень товаров/услуг.
5. Оплатите пошлину онлайн через e-płatności UPRP.
6. Получите номер zgłoszenia — официальное подтверждение приёма заявки.

### Сроки и процедура

- **0–3 месяца** — формальная проверка (polite examination)
- **3–6 месяцев** — экспертиза по существу (absolute grounds)
- **После положительной экспертизы** — публикация в Biuletyn Urzędu Patentowego
- **3 месяца** — срок возражений (sprzeciw) от третьих лиц
- **Итого**: 6–12 месяцев от подачи до регистрации

### Поддержание и продление

Товарный знак охраняется **10 лет** с даты подачи заявки. Продление производится каждые 10 лет путём уплаты пошлины (540 злотых за 1 класс онлайн). Важно: знак **должен реально использоваться** в течение первых 5 лет — неиспользование может привести к его аннулированию по заявлению третьей стороны.

### Типичные ошибки e-commerce продавцов

1. **Регистрация только логотипа, но не названия** — защищайте оба варианта.
2. **Неправильный выбор классов** — класс 35 обязателен для интернет-торговли.
3. **Использование знака до регистрации** — до получения права вы уязвимы.
4. **Игнорирование поиска схожих знаков** — проверьте базу TMview.org перед подачей.`,

    contentPl: `## Rejestracja znaku towarowego w Polsce (UPRP)

Znaki towarowe w Polsce rejestruje **Urząd Patentowy Rzeczypospolitej Polskiej (UPRP)**. Rejestracja jest kluczowym narzędziem ochrony marki dla sprzedawców e-commerce, otwierającym dostęp do Amazon Brand Registry i Allegro Brand Zone.

### Co można zarejestrować jako znak towarowy

Polska ustawa Prawo własności przemysłowej dopuszcza rejestrację:
- **Znaków słownych** — nazwa marki, slogan
- **Znaków graficznych** — logotyp, symbol
- **Znaków słowno-graficznych** — logotyp z nazwą
- **Znaków przestrzennych** — kształt opakowania lub towaru
- **Znaków dźwiękowych i multimedialnych**

Znaku **nie można zarejestrować**, jeśli ma charakter opisowy, składa się z nazw geograficznych, wprowadza konsumentów w błąd lub jest sprzeczny z porządkiem publicznym.

### Klasyfikacja nicejska towarów i usług

Znak jest rejestrowany w jednej lub kilku **klasach według klasyfikacji nicejskiej**. Dla e-commerce najważniejsze są:
- **Klasa 35** — handel detaliczny, e-commerce, zarządzanie sklepem internetowym
- **Klasa 39** — transport i dostawa towarów
- **Klasa 42** — oprogramowanie, usługi IT

Zgłaszaj tylko klasy, w których rzeczywiście używasz znaku — każda dodatkowa klasa zwiększa opłatę.

### Koszty rejestracji

| Pozycja | Kwota |
|---|---|
| Opłata podstawowa (1 klasa, online) | 450 zł |
| Każda dodatkowa klasa | 120 zł |
| Świadectwo rejestracji | 0 zł |
| Razem (1 klasa) | **450 zł** |
| Razem (3 klasy) | **690 zł** |

Przy rejestracji przez rzecznika patentowego dolicz ~1 500–3 000 zł za usługi pełnomocnika.

### Zgłoszenie online przez e-UPRP / ePUAP

1. Wejdź na **e-uprp.pl** i utwórz konto lub zaloguj się przez Profil Zaufany.
2. Wybierz «Zgłoszenie znaku towarowego» i wypełnij formularz TM.
3. Wgraj graficzny wizerunek znaku (JPG/PNG, 800×800 px, białe tło).
4. Wskaż klasy nicejskie i wykaz towarów/usług.
5. Opłać zgłoszenie przez system e-płatności UPRP.
6. Otrzymaj numer zgłoszenia — potwierdzenie przyjęcia wniosku.

### Terminy i procedura

- **0–3 miesiące** — badanie formalne
- **3–6 miesięcy** — badanie merytoryczne (bezwzględne przeszkody rejestracji)
- **Po pozytywnym wyniku badania** — ogłoszenie w Biuletynie Urzędu Patentowego RP
- **3 miesiące** — termin na wniesienie sprzeciwu przez osoby trzecie
- **Łącznie**: 6–12 miesięcy od zgłoszenia do rejestracji

### Utrzymanie i przedłużanie ochrony

Znak towarowy jest chroniony przez **10 lat** od daty zgłoszenia. Ochronę przedłuża się co 10 lat przez uiszczenie opłaty (540 zł za 1 klasę online). Ważne: znak **musi być rzeczywiście używany** przez pierwsze 5 lat — brak używania może skutkować unieważnieniem na wniosek strony trzeciej.

### Typowe błędy sprzedawców e-commerce

1. **Rejestracja tylko logotypu, bez nazwy** — chroń oba warianty.
2. **Zły dobór klas** — klasa 35 jest obowiązkowa dla handlu internetowego.
3. **Używanie znaku przed rejestracją** — do czasu rejestracji jesteś narażony na sprzeciwy.
4. **Brak wstępnego badania** — sprawdź bazę TMview.org przed złożeniem wniosku.`,

    contentUa: `## Реєстрація торговельної марки в Польщі (UPRP)

Торговельні марки в Польщі реєструє **Urząd Patentowy Rzeczypospolitej Polskiej (UPRP)** — Патентне відомство Республіки Польща. Реєстрація є ключовим інструментом захисту бренду для продавців e-commerce та відкриває доступ до Amazon Brand Registry та Allegro Brand Zone.

### Що можна зареєструвати як торговельну марку

Польський закон «Про промислову власність» допускає реєстрацію:
- **Словесних знаків** — назва бренду, слоган
- **Зображувальних знаків** — логотип, графічний символ
- **Комбінованих знаків** — логотип з назвою
- **Об'ємних знаків** — форма упаковки або товару
- **Звукових та мультимедійних знаків**

Знак **не реєструється**, якщо він має описовий характер, складається з географічних назв, вводить споживача в оману або суперечить добрим звичаям.

### Міжнародна класифікація товарів і послуг (Ніццька класифікація)

Знак реєструється в одному або кількох **класах за Ніццькою класифікацією**. Для e-commerce найважливіші:
- **Клас 35** — роздрібна торгівля, електронна комерція, управління інтернет-магазином
- **Клас 39** — транспортування та доставка товарів
- **Клас 42** — програмне забезпечення, IT-послуги

Заявляйте лише ті класи, у яких реально використовуєте знак.

### Вартість реєстрації

| Позиція | Сума |
|---|---|
| Базове мито (1 клас, онлайн) | 450 злотих |
| Кожен додатковий клас | 120 злотих |
| Свідоцтво про реєстрацію | 0 злотих |
| Разом (1 клас) | **450 злотих** |
| Разом (3 класи) | **690 злотих** |

### Онлайн-подача через e-UPRP / ePUAP

1. Зайдіть на **e-uprp.pl** та створіть акаунт або увійдіть через Profil Zaufany.
2. Оберіть «Zgłoszenie znaku towarowego» та заповніть форму TM.
3. Завантажте зображення знаку (JPG/PNG, 800×800 px, білий фон).
4. Вкажіть класи за Ніццею та перелік товарів/послуг.
5. Сплатіть мито онлайн через e-płatności UPRP.
6. Отримайте номер заявки — офіційне підтвердження прийому.

### Строки та процедура

- **0–3 місяці** — формальна перевірка
- **3–6 місяців** — експертиза по суті (абсолютні підстави)
- **Після позитивного висновку** — публікація в Бюлетені UPRP
- **3 місяці** — строк заперечень від третіх осіб
- **Разом**: 6–12 місяців від подачі до реєстрації

### Підтримання та продовження охорони

Торговельна марка охороняється **10 років** з дати подачі заявки. Продовження здійснюється кожні 10 років. Знак **повинен реально використовуватися** протягом перших 5 років — невикористання може призвести до його скасування.

### Типові помилки продавців e-commerce

1. Реєстрація лише логотипу без назви бренду.
2. Неправильний вибір класів — клас 35 обов'язковий для інтернет-торгівлі.
3. Ігнорування пошуку схожих знаків перед подачею (TMview.org).
4. Використання знаку до реєстрації без захисту.`,

    contentEn: `## Trademark Registration in Poland (UPRP)

Trademarks in Poland are registered with the **Urząd Patentowy Rzeczypospolitej Polskiej (UPRP)** — the Polish Patent Office. Registration is essential for e-commerce brand protection and is required for access to Amazon Brand Registry and Allegro Brand Zone.

### What Can Be Registered as a Trademark

The Polish Industrial Property Law allows registration of:
- **Word marks** — brand name, slogan
- **Figurative marks** — logo, graphic symbol
- **Combined marks** — logo with text
- **Three-dimensional marks** — packaging shape
- **Sound and multimedia marks**

A mark **cannot be registered** if it is descriptive, consists of geographic names, misleads consumers, or is contrary to public policy.

### Nice Classification of Goods and Services

A mark is registered in one or more **Nice Classification classes**. For e-commerce the most relevant are:
- **Class 35** — retail trade, e-commerce, online store management
- **Class 39** — transport and delivery of goods
- **Class 42** — software, IT services

Register only the classes in which you actually use the mark — each additional class increases the fee.

### Registration Costs

| Item | Amount |
|---|---|
| Basic fee (1 class, online) | PLN 450 |
| Each additional class | PLN 120 |
| Registration certificate | PLN 0 |
| Total (1 class) | **PLN 450** |
| Total (3 classes) | **PLN 690** |

If filing through a patent attorney (rzecznik patentowy), add approximately PLN 1,500–3,000 for professional services.

### Online Filing via e-UPRP / ePUAP

1. Go to **e-uprp.pl** and create an account or log in via Profil Zaufany (ePUAP).
2. Select "Zgłoszenie znaku towarowego" and complete the TM application form.
3. Upload the mark image (JPG/PNG, 800×800 px, white background).
4. Specify Nice classes and list of goods/services.
5. Pay the fee online via the UPRP e-payment system.
6. Receive an application number — official confirmation of receipt.

### Timeline and Procedure

- **0–3 months** — formal examination
- **3–6 months** — substantive examination (absolute grounds)
- **After positive examination** — publication in the Polish Patent Office Bulletin
- **3 months** — opposition period for third parties
- **Total**: 6–12 months from filing to registration

### Maintenance and Renewal

A trademark is protected for **10 years** from the filing date. Renewal is made every 10 years by paying a fee (PLN 540 for 1 class online). Important: the mark **must be genuinely used** within the first 5 years — non-use can lead to cancellation upon a third-party request.

### Common Mistakes by E-Commerce Sellers

1. **Registering only the logo, not the name** — protect both variants.
2. **Wrong class selection** — Class 35 is mandatory for online retail.
3. **Using the mark before registration** — you are vulnerable until the right is granted.
4. **Skipping a similarity search** — always check TMview.org before filing.`,

    faqRu: [
      {
        q: "Нужен ли патентный поверенный для регистрации товарного знака в Польше?",
        a: "Нет, физические и юридические лица с адресом в ЕС могут подавать заявку самостоятельно через e-uprp.pl. Однако патентный поверенный (rzecznik patentowy) поможет правильно составить перечень товаров/услуг и снизит риск отказа. Иностранцы без адреса в ЕС обязаны действовать через польского представителя.",
      },
      {
        q: "Какой класс Ниццы выбрать для интернет-магазина на Allegro?",
        a: "Для розничной торговли через интернет обязательно выберите класс 35 (e-commerce, управление интернет-магазином, продвижение товаров в интернете). Если вы продаёте собственные физические товары — добавьте соответствующий класс для самих товаров (например, класс 25 для одежды). Для защиты программного продукта или приложения — класс 42.",
      },
      {
        q: "Что происходит, если кто-то уже использует похожее название в Польше?",
        a: "UPRP проверяет только абсолютные основания для отказа (описательность, обман). Вопросы схожести с существующими знаками решаются через процедуру sprzeciw (возражения) от правообладателей. Поэтому перед подачей обязательно проверьте базы TMview.org и e-uprp.pl на наличие конфликтующих знаков в ваших классах.",
      },
    ] satisfies FaqEntry[],

    faqPl: [
      {
        q: "Czy potrzebuję rzecznika patentowego do rejestracji znaku towarowego?",
        a: "Nie — osoby fizyczne i firmy z adresem w UE mogą składać zgłoszenia samodzielnie przez e-uprp.pl. Rzecznik patentowy pomaga w precyzyjnym sformułowaniu wykazu towarów i usług oraz zmniejsza ryzyko odmowy. Osoby spoza UE są zobowiązane działać przez polskiego pełnomocnika.",
      },
      {
        q: "Jaką klasę nicejską wybrać do sklepu internetowego na Allegro?",
        a: "Do handlu detalicznego przez internet konieczna jest klasa 35 (e-commerce, zarządzanie sklepem internetowym, promocja towarów w sieci). Jeśli sprzedajesz własne produkty fizyczne — dodaj klasę odpowiadającą samym towarom (np. klasa 25 dla odzieży). Dla aplikacji lub oprogramowania — klasa 42.",
      },
      {
        q: "Co się dzieje, jeśli ktoś już używa podobnej nazwy w Polsce?",
        a: "UPRP bada jedynie bezwzględne przeszkody rejestracji. Kwestie podobieństwa do istniejących znaków rozstrzygane są w postępowaniu sprzeciwowym przez właścicieli wcześniejszych praw. Przed złożeniem wniosku zawsze sprawdź bazy TMview.org i e-uprp.pl pod kątem kolidujących znaków w swoich klasach.",
      },
    ] satisfies FaqEntry[],

    faqUa: [
      {
        q: "Чи потрібен патентний повірений для реєстрації торговельної марки в Польщі?",
        a: "Ні — фізичні та юридичні особи з адресою в ЄС можуть подавати заявки самостійно через e-uprp.pl. Патентний повірений (rzecznik patentowy) допомагає правильно скласти перелік товарів/послуг та знижує ризик відмови. Іноземці без адреси в ЄС зобов'язані діяти через польського представника.",
      },
      {
        q: "Який клас Ніцци обрати для інтернет-магазину на Allegro?",
        a: "Для роздрібної торгівлі через інтернет обов'язково оберіть клас 35 (e-commerce, управління інтернет-магазином, просування товарів в мережі). Якщо ви продаєте власні фізичні товари — додайте відповідний клас для самих товарів (наприклад, клас 25 для одягу). Для програмного забезпечення — клас 42.",
      },
      {
        q: "Що відбувається, якщо хтось вже використовує схожу назву в Польщі?",
        a: "UPRP перевіряє лише абсолютні підстави для відмови. Питання схожості з існуючими знаками вирішуються через процедуру заперечень (sprzeciw) від правовласників. Тому перед подачею обов'язково перевірте бази TMview.org та e-uprp.pl на наявність конфліктуючих знаків у ваших класах.",
      },
    ] satisfies FaqEntry[],

    faqEn: [
      {
        q: "Do I need a patent attorney to register a trademark in Poland?",
        a: "No — individuals and companies with an EU address can file applications themselves via e-uprp.pl. A patent attorney (rzecznik patentowy) helps draft an accurate list of goods and services and reduces the risk of refusal. Applicants outside the EU must act through a Polish representative.",
      },
      {
        q: "Which Nice class should I choose for an online store on Allegro?",
        a: "For online retail you must select Class 35 (e-commerce, online store management, promotion of goods on the internet). If you sell your own physical products, add the class corresponding to those goods (e.g., Class 25 for clothing). For software or an application, use Class 42.",
      },
      {
        q: "What happens if someone is already using a similar name in Poland?",
        a: "UPRP only examines absolute grounds for refusal. Similarity to existing marks is handled through the opposition (sprzeciw) procedure by earlier rights holders. Always check TMview.org and the UPRP database for conflicting marks in your classes before filing.",
      },
    ] satisfies FaqEntry[],

    category: "intellectual-property",
    tags: ["uprp", "znak-towarowy", "trademark", "nice-classification", "e-commerce", "allegro", "brand-registry"],
    sortOrder: 20,
    isPublished: true,
  },

  // ── 2. trademark-eu-euipo ────────────────────────────────────────────────
  {
    slug: "trademark-eu-euipo",
    titleRu: "Регистрация торговой марки ЕС (EUIPO)",
    titlePl: "Rejestracja znaku towarowego UE (EUIPO)",
    titleUa: "Реєстрація торговельної марки ЄС (EUIPO)",
    titleEn: "EU Trademark Registration (EUIPO)",

    contentRu: `## Регистрация торговой марки ЕС через EUIPO

**Ведомство Европейского Союза по интеллектуальной собственности (EUIPO)** предоставляет единственный в своём роде инструмент: одна регистрация — защита бренда сразу во **всех 27 странах ЕС**. Это значительно эффективнее, чем регистрировать знак отдельно в каждой стране.

### Когда выгоднее EUIPO, а когда UPRP

**Выбирайте EUIPO, если:**
- Вы продаёте или планируете продавать в нескольких странах ЕС
- Вам нужна защита для Amazon.de, Amazon.fr, Amazon.it и других европейских площадок
- Вы хотите зарегистрироваться в Amazon Brand Registry (принимает EU TM)
- Стоимость 3 и более национальных регистраций превышает стоимость EU TM

**Выбирайте UPRP, если:**
- Вы работаете только на польском рынке
- Ваш знак имеет риск оспаривания в одной из стран ЕС (унитарный знак аннулируется полностью)
- Вам нужна более быстрая и дешёвая защита только для Польши

### Стоимость регистрации в EUIPO

| Позиция | Сумма |
|---|---|
| Первый класс (онлайн) | 850 EUR |
| Второй класс | +50 EUR |
| Каждый последующий класс | +150 EUR |
| Fast-track (ускоренная процедура) | включён в онлайн-подачу |
| Итого (1 класс) | **850 EUR** |
| Итого (3 класса) | **1 050 EUR** |

Физические лица и МСП могут претендовать на **скидку 25%** при соответствии критериям малого предприятия.

### Процедура подачи через euipo.europa.eu

1. Зарегистрируйтесь на **euipo.europa.eu** и создайте аккаунт.
2. Используйте инструмент **TMview** для поиска конфликтующих знаков.
3. Перейдите в раздел «Apply for a trademark» → «eSearch Plus» для поиска классов.
4. Составьте перечень товаров/услуг, используя базу **TMClass**.
5. Загрузите изображение знака и оплатите пошлину.
6. При использовании Fast-track (все товары/услуги из TMClass) — экспертиза ускоряется до 2–4 недель.

### Сроки и процедура

- **Fast-track заявки** (предварительно согласованные термины): 4–8 недель
- **Стандартные заявки**: 4–8 месяцев
- **Публикация** в Официальном журнале EUIPO
- **3 месяца** — период возражений (opposition period)
- **Регистрация**: при отсутствии возражений — автоматически

### Amazon Brand Registry и EUIPO

Для регистрации в **Amazon Brand Registry** необходимо:
- Активный зарегистрированный или **ожидающий рассмотрения** товарный знак
- EUIPO полностью принимается для регистрации во всех европейских Amazon-магазинах (Amazon.de, .fr, .it, .es, .nl, .pl и др.)
- Номер заявки EUIPO уже позволяет подать заявку в Brand Registry («pending trademark»)

### Allegro Brand Zone и EU TM

Allegro принимает знаки EUIPO для регистрации в **Allegro Brand Zone**. Вам потребуется:
- Свидетельство о регистрации EUIPO (или подтверждение подачи заявки)
- Заявка подаётся через форму на allegro.pl/brand-zone

### Требования к доказательству использования

Через **5 лет** после регистрации знак должен реально использоваться в ЕС. Доказательствами служат: счета-фактуры, упаковка, скриншоты сайта, рекламные материалы. Неиспользование = основание для аннулирования по заявлению конкурента.`,

    contentPl: `## Rejestracja znaku towarowego UE (EUIPO)

**Urząd Unii Europejskiej ds. Własności Intelektualnej (EUIPO)** oferuje wyjątkowe rozwiązanie: jedna rejestracja — ochrona marki we **wszystkich 27 krajach UE**. Jest to znacznie efektywniejsze niż rejestrowanie znaku oddzielnie w każdym kraju.

### Kiedy wybrać EUIPO, a kiedy UPRP

**Wybierz EUIPO, jeśli:**
- Sprzedajesz lub planujesz sprzedawać w kilku krajach UE
- Potrzebujesz ochrony dla Amazon.de, Amazon.fr, Amazon.it i innych europejskich platform
- Chcesz zarejestrować się w Amazon Brand Registry (akceptuje EU TM)
- Koszt 3 lub więcej rejestracji krajowych przekracza koszt EU TM

**Wybierz UPRP, jeśli:**
- Działasz wyłącznie na rynku polskim
- Twój znak może zostać zakwestionowany w jednym z krajów UE (unitarny znak jest unieważniany w całości)
- Potrzebujesz szybszej i tańszej ochrony tylko dla Polski

### Koszty rejestracji w EUIPO

| Pozycja | Kwota |
|---|---|
| Pierwsza klasa (online) | 850 EUR |
| Druga klasa | +50 EUR |
| Każda kolejna klasa | +150 EUR |
| Fast-track | wliczony w zgłoszenie online |
| Razem (1 klasa) | **850 EUR** |
| Razem (3 klasy) | **1 050 EUR** |

Osoby fizyczne i MŚP mogą ubiegać się o **zniżkę 25%** przy spełnieniu kryteriów małego przedsiębiorcy.

### Procedura zgłoszenia przez euipo.europa.eu

1. Zarejestruj się na **euipo.europa.eu** i utwórz konto.
2. Sprawdź kolizyjne znaki w narzędziu **TMview**.
3. Przejdź do sekcji «Apply for a trademark» i użyj **eSearch Plus** do weryfikacji klas.
4. Sformułuj wykaz towarów/usług za pomocą bazy **TMClass**.
5. Wgraj graficzny wizerunek znaku i opłać zgłoszenie.
6. Przy zastosowaniu Fast-track (wszystkie terminy z TMClass) — badanie przyspiesza do 2–4 tygodni.

### Terminy i procedura

- **Zgłoszenia Fast-track**: 4–8 tygodni
- **Zgłoszenia standardowe**: 4–8 miesięcy
- **Publikacja** w Dzienniku Urzędowym EUIPO
- **3 miesiące** — okres sprzeciwów
- **Rejestracja**: automatyczna przy braku sprzeciwów

### Amazon Brand Registry i EUIPO

Do rejestracji w **Amazon Brand Registry** potrzebujesz:
- Aktywnego zarejestrowanego lub **oczekującego na rozpatrzenie** znaku towarowego
- EUIPO jest w pełni akceptowany dla wszystkich europejskich sklepów Amazon (.de, .fr, .it, .es, .nl, .pl i inne)
- Numer zgłoszenia EUIPO pozwala już złożyć wniosek do Brand Registry jako «pending trademark»

### Allegro Brand Zone i EU TM

Allegro akceptuje znaki EUIPO do rejestracji w **Allegro Brand Zone**. Wymagane są:
- Świadectwo rejestracji EUIPO (lub potwierdzenie złożenia zgłoszenia)
- Wniosek składany przez formularz na allegro.pl/brand-zone

### Wymóg używania znaku

Po **5 latach** od rejestracji znak musi być rzeczywiście używany na terenie UE. Dowodami są: faktury, opakowania, zrzuty ekranu strony, materiały reklamowe. Brak używania = podstawa do unieważnienia na wniosek konkurenta.`,

    contentUa: `## Реєстрація торговельної марки ЄС (EUIPO)

**Відомство Європейського Союзу з інтелектуальної власності (EUIPO)** надає унікальний інструмент: одна реєстрація — захист бренду одразу у **всіх 27 країнах ЄС**. Це значно ефективніше, ніж реєструвати знак окремо в кожній країні.

### Коли вигідніше EUIPO, а коли UPRP

**Обирайте EUIPO, якщо:**
- Ви продаєте або плануєте продавати у кількох країнах ЄС
- Вам потрібен захист для Amazon.de, Amazon.fr та інших європейських майданчиків
- Ви хочете зареєструватися в Amazon Brand Registry (приймає EU TM)

**Обирайте UPRP, якщо:**
- Ви працюєте лише на польському ринку
- Ваш знак має ризик оспорювання в одній із країн ЄС (унітарний знак скасовується повністю)

### Вартість реєстрації в EUIPO

| Позиція | Сума |
|---|---|
| Перший клас (онлайн) | 850 EUR |
| Другий клас | +50 EUR |
| Кожен наступний клас | +150 EUR |
| Разом (1 клас) | **850 EUR** |
| Разом (3 класи) | **1 050 EUR** |

### Процедура подачі через euipo.europa.eu

1. Зареєструйтесь на **euipo.europa.eu** та створіть акаунт.
2. Перевірте конфліктуючі знаки у **TMview**.
3. Складіть перелік товарів/послуг за допомогою бази **TMClass**.
4. Завантажте зображення знаку та сплатіть мито.
5. При використанні Fast-track — експертиза прискорюється до 2–4 тижнів.

### Строки та процедура

- **Fast-track заявки**: 4–8 тижнів
- **Стандартні заявки**: 4–8 місяців
- **3 місяці** — строк заперечень
- **Реєстрація**: автоматична за відсутності заперечень

### Amazon Brand Registry та EUIPO

Номер заявки EUIPO вже дозволяє подати заявку до Brand Registry як «pending trademark». EUIPO повністю приймається для всіх європейських магазинів Amazon (.de, .fr, .it, .es, .nl, .pl та інші).

### Allegro Brand Zone та EU TM

Allegro приймає знаки EUIPO для реєстрації в **Allegro Brand Zone**. Необхідні свідоцтво про реєстрацію EUIPO або підтвердження подачі заявки.

### Вимога доказу використання

Через **5 років** після реєстрації знак повинен реально використовуватися в ЄС. Доказами слугують: рахунки-фактури, упаковка, скриншоти сайту. Невикористання є підставою для скасування за заявою конкурента.`,

    contentEn: `## EU Trademark Registration (EUIPO)

The **European Union Intellectual Property Office (EUIPO)** provides a unique tool: a single registration gives brand protection across **all 27 EU member states**. This is far more efficient than registering separately in each country.

### When to Choose EUIPO vs. National Registration (UPRP)

**Choose EUIPO if:**
- You sell or plan to sell in multiple EU countries
- You need protection across Amazon.de, Amazon.fr, Amazon.it and other European marketplaces
- You want to enrol in Amazon Brand Registry (EU TM is fully accepted)
- The cost of 3 or more national registrations exceeds the EU TM fee

**Choose UPRP if:**
- You operate exclusively in the Polish market
- Your mark faces opposition risk in one EU country (a unitary mark is cancelled entirely)
- You need faster, cheaper protection for Poland only

### EUIPO Registration Costs

| Item | Amount |
|---|---|
| First class (online) | EUR 850 |
| Second class | +EUR 50 |
| Each additional class | +EUR 150 |
| Fast-track | included in online filing |
| Total (1 class) | **EUR 850** |
| Total (3 classes) | **EUR 1,050** |

Individuals and SMEs may qualify for a **25% reduction** if they meet small enterprise criteria.

### Filing Procedure via euipo.europa.eu

1. Register at **euipo.europa.eu** and create an account.
2. Search for conflicting marks using **TMview**.
3. Go to "Apply for a trademark" and use **eSearch Plus** to verify classes.
4. Build your goods/services list using the **TMClass** database.
5. Upload the mark image and pay the application fee.
6. With Fast-track (all terms from TMClass): examination accelerates to 2–4 weeks.

### Timeline and Procedure

- **Fast-track applications**: 4–8 weeks to registration
- **Standard applications**: 4–8 months
- **Publication** in the EUIPO Official Journal
- **3 months** — opposition period
- **Registration**: automatic if no opposition is filed

### Amazon Brand Registry and EUIPO

For **Amazon Brand Registry** enrolment you need:
- An active registered or **pending** EU trademark
- EUIPO marks are fully accepted for all EU Amazon stores (.de, .fr, .it, .es, .nl, .pl, and others)
- Even an EUIPO application number (pending trademark) allows Brand Registry submission

### Allegro Brand Zone and EU TM

Allegro accepts EUIPO marks for **Allegro Brand Zone** registration. You will need:
- EUIPO registration certificate or proof of application
- Application submitted via the allegro.pl/brand-zone form

### Proof of Use Requirements

**5 years** after registration the mark must be genuinely used in the EU. Acceptable evidence includes: invoices, packaging, website screenshots, advertising materials. Non-use is grounds for cancellation upon a competitor's request.`,

    faqRu: [
      {
        q: "Можно ли использовать номер заявки EUIPO (не зарегистрированный знак) для Amazon Brand Registry?",
        a: "Да, Amazon Brand Registry принимает «pending trademarks» — заявки, находящиеся на рассмотрении в EUIPO. Вы можете подать заявку в Brand Registry сразу после получения номера заявки EUIPO, не дожидаясь финальной регистрации.",
      },
      {
        q: "Сколько времени занимает регистрация EU TM по Fast-track?",
        a: "При использовании Fast-track (все товары и услуги выбраны из базы TMClass EUIPO) процесс экспертизы занимает 2–4 недели. Затем следует обязательный 3-месячный период возражений. Таким образом, полная регистрация возможна за 4–5 месяцев. Стандартная процедура занимает 4–8 месяцев.",
      },
      {
        q: "Что происходит с EU TM, если одна страна ЕС отказала в охране?",
        a: "Знак ЕС носит унитарный характер: если основания для отказа существуют хотя бы в одной стране-члене ЕС (например, обозначение описательно в определённом языке), заявка может быть отклонена полностью. В таком случае можно преобразовать заявку EUIPO в национальные заявки тех стран, где препятствий нет.",
      },
    ] satisfies FaqEntry[],

    faqPl: [
      {
        q: "Czy numer zgłoszenia EUIPO (nieprzyznany znak) działa w Amazon Brand Registry?",
        a: "Tak, Amazon Brand Registry akceptuje «pending trademarks» — zgłoszenia oczekujące na rozpatrzenie w EUIPO. Możesz złożyć wniosek do Brand Registry od razu po otrzymaniu numeru zgłoszenia EUIPO, bez czekania na rejestrację.",
      },
      {
        q: "Ile trwa rejestracja EU TM w trybie Fast-track?",
        a: "Przy Fast-track (wszystkie towary i usługi z bazy TMClass) badanie zajmuje 2–4 tygodnie. Następuje obligatoryjny 3-miesięczny okres sprzeciwów. Pełna rejestracja jest możliwa w 4–5 miesięcy. Standardowa procedura trwa 4–8 miesięcy.",
      },
      {
        q: "Co się stanie z EU TM, jeśli jeden kraj UE odmówi ochrony?",
        a: "Znak UE ma charakter unitarny: jeśli podstawy odmowy istnieją choćby w jednym państwie członkowskim, wniosek może zostać całkowicie odrzucony. W takim przypadku można przekształcić wniosek EUIPO na krajowe zgłoszenia krajów, w których nie ma przeszkód.",
      },
    ] satisfies FaqEntry[],

    faqUa: [
      {
        q: "Чи можна використовувати номер заявки EUIPO (не зареєстровану марку) для Amazon Brand Registry?",
        a: "Так, Amazon Brand Registry приймає «pending trademarks» — заявки, що перебувають на розгляді в EUIPO. Ви можете подати заявку до Brand Registry одразу після отримання номера заявки EUIPO, не чекаючи фінальної реєстрації.",
      },
      {
        q: "Скільки часу займає реєстрація EU TM за Fast-track?",
        a: "При використанні Fast-track (усі товари та послуги з бази TMClass) процес експертизи займає 2–4 тижні. Потім слідує обов'язковий 3-місячний строк заперечень. Таким чином, повна реєстрація можлива за 4–5 місяців.",
      },
      {
        q: "Що відбувається з EU TM, якщо одна країна ЄС відмовила в охороні?",
        a: "Знак ЄС має унітарний характер: якщо підстави для відмови існують хоча б в одній країні-члені ЄС, заявка може бути відхилена повністю. У такому випадку можна перетворити заявку EUIPO на національні заявки тих країн, де перешкод немає.",
      },
    ] satisfies FaqEntry[],

    faqEn: [
      {
        q: "Can I use an EUIPO application number (pending trademark) for Amazon Brand Registry?",
        a: "Yes, Amazon Brand Registry accepts pending trademarks — applications under examination at EUIPO. You can apply to Brand Registry immediately after receiving your EUIPO application number, without waiting for final registration.",
      },
      {
        q: "How long does EU TM registration take with Fast-track?",
        a: "With Fast-track (all goods and services selected from TMClass), examination takes 2–4 weeks. A mandatory 3-month opposition period follows. Full registration is possible within 4–5 months. The standard procedure takes 4–8 months.",
      },
      {
        q: "What happens to an EU TM if one EU country denies protection?",
        a: "An EU mark is unitary: if grounds for refusal exist in even one member state (e.g., descriptive in a specific language), the application may be rejected entirely. In that case, you can convert the EUIPO application into national applications for the countries where no obstacles exist.",
      },
    ] satisfies FaqEntry[],

    category: "intellectual-property",
    tags: ["euipo", "eu-trademark", "brand-registry", "allegro-brand-zone", "fast-track", "tmclass", "tmview"],
    sortOrder: 21,
    isPublished: true,
  },

  // ── 3. ean-gs1-guide ─────────────────────────────────────────────────────
  {
    slug: "ean-gs1-guide",
    titleRu: "Коды EAN/GTIN для маркетплейсов: GS1 Polska",
    titlePl: "Kody EAN/GTIN na marketplace'ach: GS1 Polska",
    titleUa: "Коди EAN/GTIN для маркетплейсів: GS1 Polska",
    titleEn: "EAN/GTIN Codes for Marketplaces: GS1 Polska",

    contentRu: `## Коды EAN/GTIN: полное руководство для e-commerce в Польше

Штрихкод EAN-13 — это **13-значный глобальный идентификатор торговой единицы (GTIN-13)**. Он обязателен для продажи большинства физических товаров на Allegro, является обязательным требованием Amazon и необходим для автоматизированного складского учёта.

### Что такое GS1 и зачем с ним регистрироваться

**GS1** — единственная международно признанная организация, которая выдаёт подлинные префиксы компании (GCP — GS1 Company Prefix). Покупка «EAN-кодов» на eBay, Amazon или в сомнительных интернет-сервисах даёт вам коды от ликвидированных компаний, которые уже числятся в базах GS1 как «неактивные». Allegro и Amazon выявляют такие коды и блокируют листинги.

**GS1 Polska** (gs1pl.org) — польский оператор системы GS1. Членство даёт:
- Уникальный префикс компании (6–9 цифр)
- Право самостоятельно присваивать GTIN своим товарам
- Запись в глобальной базе GEPIR
- Доступ к базе GS1 Registry Platform для верификации кодов

### Типы кодов

| Код | Длина | Применение |
|---|---|---|
| GTIN-13 (EAN-13) | 13 цифр | Потребительские товары в Европе |
| GTIN-12 (UPC-A) | 12 цифр | США и Канада |
| GTIN-8 (EAN-8) | 8 цифр | Мелкие товары (сигареты, жвачка) |
| GTIN-14 | 14 цифр | Транспортные упаковки |

Для продажи в Польше и ЕС используйте **GTIN-13 (EAN-13)**.

### Стоимость членства в GS1 Polska

Членские взносы зависят от годового оборота компании:

| Годовой оборот | Ежегодный взнос |
|---|---|
| До 300 000 PLN | ~250 PLN/год |
| 300 000 – 1 000 000 PLN | ~450 PLN/год |
| 1 000 000 – 5 000 000 PLN | ~750 PLN/год |
| Свыше 5 000 000 PLN | индивидуально |

Первоначальный вступительный взнос ~250–750 PLN (зависит от уровня). Все суммы без НДС.

### Сколько кодов вам нужно

Каждой уникальной торговой единице (SKU) нужен свой GTIN. Если у вас рубашка в 3 цветах и 5 размерах — это 15 различных GTIN. При стандартном членстве GS1 Polska выдаёт от **1 000 до 100 000** кодов в зависимости от длины вашего префикса.

### Регистрация на gs1pl.org: пошаговая инструкция

1. Зайдите на **gs1pl.org** → «Zostań członkiem GS1 Polska».
2. Заполните форму с данными компании (NIP, REGON, адрес).
3. Выберите тип членства в зависимости от оборота.
4. Оплатите вступительный и ежегодный взносы.
5. Получите свидетельство члена и **GS1 Company Prefix**.
6. Начните присваивать GTIN: [Prefix] + [код товара] + [контрольная цифра].
7. Зарегистрируйте коды в **GS1 Registry Platform** (рекомендуется).

### Генерация штрихкода

После присвоения GTIN используйте бесплатные инструменты:
- **gs1pl.org/narzedzia** — официальный генератор GS1 Polska
- **barcode.tec-it.com** — онлайн-генератор
- Требования к печати: разрешение ≥ 300 DPI, чёрный штрихкод на белом фоне

### Требования Allegro к кодам EAN

На Allegro EAN является **обязательным** для большинства категорий (электроника, бытовая химия, игрушки, спорт, одежда). Allegro проверяет EAN через базы GS1 и отклоняет:
- Дублирующиеся EAN на разных листингах
- EAN, не принадлежащие вашей компании (если вы продаёте под своей маркой)
- EAN из «баз eBay»

**Исключение**: если вы перепродаёте товары известных брендов (например, Lego, Samsung) — используйте EAN производителя.

### Требования Amazon GTIN

Amazon требует GTIN для всех новых листингов. При продаже брендовых товаров — используйте GTIN производителя. При продаже под собственной торговой маркой — обязательно ваш собственный GS1-сертифицированный GTIN. Amazon предоставляет исключения (GTIN Exemption) только для хендмейда и некоторых категорий.

### Распространённые ошибки

1. **Покупка «дешёвых EAN» на eBay** — коды от умерших компаний, заблокируют листинги.
2. **Один EAN на все варианты** — каждый цвет/размер требует отдельного GTIN.
3. **Неправильная контрольная цифра** — всегда проверяйте расчёт по алгоритму GS1.
4. **Отсутствие регистрации в GS1 Registry** — Amazon и Allegro могут верифицировать ваш GTIN.`,

    contentPl: `## Kody EAN/GTIN: kompletny przewodnik dla e-commerce w Polsce

Kod kreskowy EAN-13 to **13-cyfrowy globalny identyfikator jednostki handlowej (GTIN-13)**. Jest wymagany przy sprzedaży większości produktów fizycznych na Allegro, stanowi obowiązkowy wymóg Amazona i jest niezbędny do zautomatyzowanej ewidencji magazynowej.

### Czym jest GS1 i dlaczego warto się rejestrować

**GS1** to jedyna uznana na całym świecie organizacja wystawiająca autentyczne prefiksy firm (GCP — GS1 Company Prefix). Kupowanie «kodów EAN» na eBay lub w podejrzanych serwisach daje kody od nieistniejących firm, widniejące w bazach GS1 jako «nieaktywne». Allegro i Amazon wykrywają takie kody i blokują oferty.

**GS1 Polska** (gs1pl.org) — polski operator systemu GS1. Członkostwo daje:
- Unikalny prefiks firmy (6–9 cyfr)
- Prawo do samodzielnego nadawania GTIN produktom
- Wpis w globalnej bazie GEPIR
- Dostęp do GS1 Registry Platform do weryfikacji kodów

### Typy kodów

| Kod | Długość | Zastosowanie |
|---|---|---|
| GTIN-13 (EAN-13) | 13 cyfr | Produkty konsumenckie w Europie |
| GTIN-12 (UPC-A) | 12 cyfr | USA i Kanada |
| GTIN-8 (EAN-8) | 8 cyfr | Małe produkty |
| GTIN-14 | 14 cyfr | Opakowania transportowe |

Do sprzedaży w Polsce i UE używaj **GTIN-13 (EAN-13)**.

### Koszty członkostwa w GS1 Polska

| Roczny obrót | Składka roczna |
|---|---|
| Do 300 000 PLN | ~250 PLN/rok |
| 300 000 – 1 000 000 PLN | ~450 PLN/rok |
| 1 000 000 – 5 000 000 PLN | ~750 PLN/rok |
| Powyżej 5 000 000 PLN | indywidualnie |

Wpisowe wynosi ~250–750 PLN (zależnie od poziomu). Wszystkie kwoty netto.

### Ile kodów potrzebujesz

Każda unikalna jednostka handlowa (SKU) potrzebuje własnego GTIN. Jeśli masz koszulę w 3 kolorach i 5 rozmiarach — to 15 różnych GTIN. Standardowe członkostwo GS1 Polska daje od **1 000 do 100 000** kodów zależnie od długości prefiksu.

### Rejestracja na gs1pl.org: instrukcja krok po kroku

1. Wejdź na **gs1pl.org** → «Zostań członkiem GS1 Polska».
2. Wypełnij formularz z danymi firmy (NIP, REGON, adres).
3. Wybierz typ członkostwa stosownie do obrotu.
4. Opłać wpisowe i składkę roczną.
5. Otrzymaj certyfikat członkowski i **GS1 Company Prefix**.
6. Zacznij nadawać GTIN: [Prefix] + [kod produktu] + [cyfra kontrolna].
7. Zarejestruj kody w **GS1 Registry Platform** (zalecane).

### Generowanie kodów kreskowych

Po nadaniu GTIN użyj bezpłatnych narzędzi:
- **gs1pl.org/narzedzia** — oficjalny generator GS1 Polska
- **barcode.tec-it.com** — generator online
- Wymagania druku: rozdzielczość ≥ 300 DPI, czarny kod na białym tle

### Wymagania Allegro dotyczące kodów EAN

Na Allegro EAN jest **obowiązkowy** w większości kategorii (elektronika, chemia, zabawki, sport, odzież). Allegro weryfikuje EAN przez bazy GS1 i odrzuca:
- Duplikaty EAN na różnych ofertach
- EAN nienależące do Twojej firmy (przy sprzedaży pod własną marką)
- Kody z «baz eBay»

**Wyjątek**: przy odsprzedaży towarów znanych marek (np. Lego, Samsung) — używaj EAN producenta.

### Wymagania Amazon GTIN

Amazon wymaga GTIN dla wszystkich nowych ofert. Przy sprzedaży markowych towarów — używaj GTIN producenta. Przy własnej marce — obowiązkowo własny GTIN z certyfikatem GS1. Amazon przyznaje wyjątki (GTIN Exemption) tylko dla handmade i niektórych kategorii.

### Częste błędy

1. **Kupowanie «tanich EAN» z eBay** — kody po nieistniejących firmach, zablokują oferty.
2. **Jeden EAN dla wszystkich wariantów** — każdy kolor/rozmiar wymaga osobnego GTIN.
3. **Błędna cyfra kontrolna** — zawsze sprawdzaj obliczenie algorytmem GS1.
4. **Brak rejestracji w GS1 Registry** — Amazon i Allegro mogą weryfikować Twój GTIN.`,

    contentUa: `## Коди EAN/GTIN: повний посібник для e-commerce в Польщі

Штрихкод EAN-13 — це **13-значний глобальний ідентифікатор торгової одиниці (GTIN-13)**. Він обов'язковий для продажу більшості фізичних товарів на Allegro, є обов'язковою вимогою Amazon і необхідний для автоматизованого складського обліку.

### Що таке GS1 і навіщо реєструватись

**GS1** — єдина міжнародно визнана організація, яка видає справжні префікси компанії (GCP — GS1 Company Prefix). Купівля «EAN-кодів» на eBay або в сумнівних сервісах дає коди від ліквідованих компаній, які числяться в базах GS1 як «неактивні». Allegro та Amazon виявляють такі коди та блокують лістинги.

**GS1 Polska** (gs1pl.org) — польський оператор системи GS1. Членство надає:
- Унікальний префікс компанії (6–9 цифр)
- Право самостійно привласнювати GTIN своїм товарам
- Запис у глобальній базі GEPIR
- Доступ до GS1 Registry Platform для верифікації кодів

### Вартість членства в GS1 Polska

| Річний оборот | Щорічний внесок |
|---|---|
| До 300 000 PLN | ~250 PLN/рік |
| 300 000 – 1 000 000 PLN | ~450 PLN/рік |
| 1 000 000 – 5 000 000 PLN | ~750 PLN/рік |

### Скільки кодів вам потрібно

Кожній унікальній торговій одиниці (SKU) потрібен свій GTIN. Якщо у вас сорочка в 3 кольорах та 5 розмірах — це 15 різних GTIN. Стандартне членство GS1 Polska надає від **1 000 до 100 000** кодів залежно від довжини вашого префіксу.

### Реєстрація на gs1pl.org: покрокова інструкція

1. Зайдіть на **gs1pl.org** → «Zostań członkiem GS1 Polska».
2. Заповніть форму з даними компанії (NIP, REGON, адреса).
3. Виберіть тип членства відповідно до обороту.
4. Сплатіть вступний та щорічний внески.
5. Отримайте свідоцтво члена та **GS1 Company Prefix**.
6. Починайте присвоювати GTIN: [Prefix] + [код товару] + [контрольна цифра].

### Вимоги Allegro до кодів EAN

На Allegro EAN є **обов'язковим** для більшості категорій. Allegro перевіряє EAN через бази GS1 та відхиляє коди від неіснуючих компаній та дублікати.

**Виняток**: при перепродажі товарів відомих брендів — використовуйте EAN виробника.

### Вимоги Amazon GTIN

Amazon вимагає GTIN для всіх нових лістингів. При продажу під власною торговельною маркою — обов'язково ваш власний GS1-сертифікований GTIN.

### Поширені помилки

1. Купівля «дешевих EAN» на eBay — заблокують лістинги.
2. Один EAN на всі варіанти — кожен колір/розмір вимагає окремого GTIN.
3. Неправильна контрольна цифра — завжди перевіряйте розрахунок за алгоритмом GS1.
4. Відсутність реєстрації в GS1 Registry — Amazon та Allegro можуть верифікувати ваш GTIN.`,

    contentEn: `## EAN/GTIN Codes for Marketplaces: GS1 Polska Complete Guide

The EAN-13 barcode is a **13-digit Global Trade Item Number (GTIN-13)**. It is required for selling most physical products on Allegro, is a mandatory Amazon requirement, and is essential for automated inventory management.

### What Is GS1 and Why Register

**GS1** is the only internationally recognised organisation that issues genuine company prefixes (GCP — GS1 Company Prefix). Buying "EAN codes" on eBay, Amazon, or dubious online services gives you codes from dissolved companies, which appear in GS1 databases as "inactive". Allegro and Amazon detect these codes and block listings.

**GS1 Polska** (gs1pl.org) is the Polish GS1 operator. Membership gives you:
- A unique company prefix (6–9 digits)
- The right to assign GTINs to your products yourself
- An entry in the global GEPIR database
- Access to the GS1 Registry Platform for code verification

### Code Types

| Code | Length | Use |
|---|---|---|
| GTIN-13 (EAN-13) | 13 digits | Consumer goods in Europe |
| GTIN-12 (UPC-A) | 12 digits | USA and Canada |
| GTIN-8 (EAN-8) | 8 digits | Small products |
| GTIN-14 | 14 digits | Shipping cases |

For selling in Poland and the EU, use **GTIN-13 (EAN-13)**.

### GS1 Polska Membership Costs

| Annual turnover | Annual fee |
|---|---|
| Up to PLN 300,000 | ~PLN 250/year |
| PLN 300,000 – 1,000,000 | ~PLN 450/year |
| PLN 1,000,000 – 5,000,000 | ~PLN 750/year |
| Over PLN 5,000,000 | individual pricing |

One-time joining fee: ~PLN 250–750 (depending on tier). All amounts net of VAT.

### How Many Codes Do You Need

Each unique trade unit (SKU) needs its own GTIN. A shirt in 3 colours and 5 sizes = 15 different GTINs. Standard GS1 Polska membership provides from **1,000 to 100,000** codes depending on your prefix length.

### Registration at gs1pl.org: Step-by-Step

1. Go to **gs1pl.org** → "Zostań członkiem GS1 Polska".
2. Fill in the company data form (NIP, REGON, address).
3. Select the membership tier based on your turnover.
4. Pay the joining fee and annual membership fee.
5. Receive your member certificate and **GS1 Company Prefix**.
6. Start assigning GTINs: [Prefix] + [item reference] + [check digit].
7. Register codes in the **GS1 Registry Platform** (recommended).

### Generating Barcodes

After assigning a GTIN, use free tools:
- **gs1pl.org/narzedzia** — official GS1 Polska generator
- **barcode.tec-it.com** — online generator
- Print requirements: ≥ 300 DPI resolution, black bars on white background

### Allegro EAN Requirements

EAN is **mandatory** on Allegro for most categories (electronics, household chemicals, toys, sport, clothing). Allegro validates EANs against GS1 databases and rejects:
- Duplicate EANs across different listings
- EANs not belonging to your company (when selling under your own brand)
- Codes from "eBay databases"

**Exception**: when reselling known brand products (e.g., Lego, Samsung), use the manufacturer's EAN.

### Amazon GTIN Requirements

Amazon requires a GTIN for all new listings. For branded goods — use the manufacturer's GTIN. For your own private label — you must use your own GS1-certified GTIN. Amazon grants GTIN Exemptions only for handmade and select categories.

### Common Mistakes

1. **Buying "cheap EANs" on eBay** — codes from dissolved companies will get your listings blocked.
2. **One EAN for all variants** — each colour/size combination requires a separate GTIN.
3. **Wrong check digit** — always verify the calculation using the GS1 algorithm.
4. **No GS1 Registry registration** — Amazon and Allegro can verify your GTIN against the registry.`,

    faqRu: [
      {
        q: "Можно ли использовать EAN от производителя, если я перепродаю его товар?",
        a: "Да, при перепродаже оригинальных товаров (whitesale/resale) вы должны использовать EAN производителя. Создавать свой собственный GTIN для товаров чужого бренда запрещено — это нарушает политику Allegro и Amazon. Собственный GTIN нужен только тогда, когда вы продаёте товар под своей торговой маркой (private label).",
      },
      {
        q: "Что будет, если я куплю EAN на eBay за 5 долларов?",
        a: "Эти коды принадлежат ликвидированным компаниям и числятся в базах GS1 как неактивные. Allegro проверяет EAN через GS1 Registry и может заблокировать ваши листинги или аккаунт. Amazon также проверяет коды и может удалить листинги. В долгосрочной перспективе это риск потери всего аккаунта — экономия в 5 долларов не стоит этого риска.",
      },
      {
        q: "Сколько EAN-кодов дают при вступлении в GS1 Polska?",
        a: "Количество зависит от длины префикса компании: 7-значный префикс даёт 100 000 кодов, 8-значный — 10 000 кодов, 9-значный — 1 000 кодов. Для большинства малых e-commerce бизнесов достаточно 1 000 кодов (9-значный префикс с минимальным взносом). При необходимости всегда можно обновить членство до более высокого уровня.",
      },
    ] satisfies FaqEntry[],

    faqPl: [
      {
        q: "Czy mogę używać EAN producenta przy odsprzedaży jego towaru?",
        a: "Tak, przy odsprzedaży oryginalnych produktów (whitesale/resale) powinieneś używać EAN producenta. Tworzenie własnego GTIN dla towarów cudzej marki jest niedozwolone — narusza politykę Allegro i Amazona. Własny GTIN jest potrzebny tylko wtedy, gdy sprzedajesz pod własną marką (private label).",
      },
      {
        q: "Co się stanie, jeśli kupię EAN na eBay za 5 dolarów?",
        a: "Kody te należą do likwidowanych firm i widnieją w bazach GS1 jako nieaktywne. Allegro weryfikuje EAN przez GS1 Registry i może zablokować Twoje oferty lub konto. Amazon też weryfikuje kody i może usunąć oferty. W dłuższej perspektywie to ryzyko utraty całego konta — oszczędność 5 dolarów nie jest tego warta.",
      },
      {
        q: "Ile kodów EAN dostaje się przy wstąpieniu do GS1 Polska?",
        a: "Liczba zależy od długości prefiksu firmy: 7-cyfrowy prefiks daje 100 000 kodów, 8-cyfrowy — 10 000, 9-cyfrowy — 1 000. Dla większości małych firm e-commerce wystarczy 1 000 kodów (9-cyfrowy prefiks z minimalną składką). W razie potrzeby można zawsze uaktualnić członkostwo do wyższego poziomu.",
      },
    ] satisfies FaqEntry[],

    faqUa: [
      {
        q: "Чи можна використовувати EAN від виробника, якщо я перепродаю його товар?",
        a: "Так, при перепродажі оригінальних товарів (whitesale/resale) ви повинні використовувати EAN виробника. Створювати власний GTIN для товарів чужого бренду заборонено — це порушує політику Allegro та Amazon. Власний GTIN потрібен лише тоді, коли ви продаєте товар під своєю торговельною маркою (private label).",
      },
      {
        q: "Що буде, якщо я куплю EAN на eBay за 5 доларів?",
        a: "Ці коди належать ліквідованим компаніям та числяться в базах GS1 як неактивні. Allegro перевіряє EAN через GS1 Registry і може заблокувати ваші лістинги або акаунт. Amazon також перевіряє коди. Економія 5 доларів не варта ризику втрати всього акаунту.",
      },
      {
        q: "Скільки EAN-кодів надається при вступі до GS1 Polska?",
        a: "Кількість залежить від довжини префіксу компанії: 7-значний префікс дає 100 000 кодів, 8-значний — 10 000, 9-значний — 1 000. Для більшості малих e-commerce бізнесів достатньо 1 000 кодів. При необхідності завжди можна оновити членство до вищого рівня.",
      },
    ] satisfies FaqEntry[],

    faqEn: [
      {
        q: "Can I use the manufacturer's EAN when reselling their product?",
        a: "Yes — when reselling original products (whitesale/resale) you must use the manufacturer's EAN. Creating your own GTIN for another brand's products is not allowed and violates Allegro and Amazon policy. Your own GTIN is only needed when selling under your own private label brand.",
      },
      {
        q: "What happens if I buy EAN codes on eBay for $5?",
        a: "Those codes belong to dissolved companies and appear in GS1 databases as inactive. Allegro validates EANs against GS1 Registry and may block your listings or account. Amazon also checks codes and may remove listings. The long-term risk of losing your entire account is not worth the $5 saving.",
      },
      {
        q: "How many EAN codes are included with GS1 Polska membership?",
        a: "The number depends on your company prefix length: a 7-digit prefix gives 100,000 codes, 8-digit gives 10,000, and 9-digit gives 1,000. For most small e-commerce businesses, 1,000 codes (9-digit prefix, minimum fee) is sufficient. You can always upgrade your membership tier if you need more.",
      },
    ] satisfies FaqEntry[],

    category: "logistics",
    tags: ["ean", "gtin", "gs1", "gs1-polska", "barcode", "allegro", "amazon", "private-label"],
    sortOrder: 22,
    isPublished: true,
  },

  // ── 4. brand-protection-allegro ──────────────────────────────────────────
  {
    slug: "brand-protection-allegro",
    titleRu: "Защита бренда на Allegro: Brand Zone и борьба с подделками",
    titlePl: "Ochrona marki na Allegro: Brand Zone i walka z podróbkami",
    titleUa: "Захист бренду на Allegro: Brand Zone та боротьба з підробками",
    titleEn: "Brand Protection on Allegro: Brand Zone and Anti-Counterfeiting",

    contentRu: `## Защита бренда на Allegro: Brand Zone и инструменты против подделок

Allegro — крупнейший маркетплейс Польши и один из ведущих в ЦВЕ. При достижении узнаваемости бренда вы неизбежно столкнётесь с «хайджекерами» (угонщиками листингов), продавцами контрафакта и нарушителями авторских прав. Allegro предоставляет несколько инструментов для защиты.

### Allegro Brand Zone: что это и как получить доступ

**Brand Zone (Strefa Marki)** — это выделенное брендированное пространство на Allegro, которое позволяет:
- Создать **страницу бренда** с логотипом, баннером и описанием
- Выделить все свои товары в одном разделе
- Получить защищённый **URL-адрес** (allegro.pl/uzytkownik/[brand-name])
- Использовать расширенные карточки товаров с дополнительными фото и контентом
- Получить антиконтрафактную защиту (инструменты удаления поддельных листингов)

**Требования для получения Brand Zone:**
1. Активная регистрация знака (зарегистрированный знак, не заявка) в: UPRP (Польша), EUIPO (ЕС), WIPO или USPTO
2. Знак должен быть идентичен или аналогичен вашему торговому наименованию на Allegro
3. Верификация права собственности на торговый знак

**Подача заявки:** через форму на allegro.pl или через аккаунт менеджера Allegro (для крупных продавцов). Срок рассмотрения — 7–30 рабочих дней.

### Защита листингов от «хайджекеров»

«Хайджекеры» — продавцы, которые прикрепляются к вашим листингам и продают под вашим EAN, нередко с поддельными или низкокачественными товарами. Стратегии защиты:

**1. Уникальные EAN от GS1**
Используйте собственные GTIN из GS1 Polska. Allegro привязывает листинги к EAN — никто другой не имеет права продавать под вашим GS1-сертифицированным GTIN.

**2. Регистрация в Allegro Brand Zone**
После получения Brand Zone ваш бренд получает статус «верифицированного». Это сигнал покупателям о подлинности и усложняет жизнь подделывателям.

**3. Мониторинг листингов**
Регулярно проверяйте поиск по вашему бренду и EAN-кодам. Инструменты: Allegro Analytics, базовый мониторинг вручную, сторонние сервисы (Tradle, Brand24).

### Как сообщить о продаже контрафакта на Allegro

**Процедура подачи жалобы:**
1. Найдите нарушающий листинг.
2. Нажмите «Zgłoś naruszenie» (Сообщить о нарушении) под листингом.
3. Выберите тип нарушения: «Podróbka / naruszenie praw własności intelektualnej».
4. Заполните форму: укажите ваши права (номер TM, страна регистрации), приложите доказательства.
5. Allegro рассматривает жалобу в течение 3–10 рабочих дней.
6. При подтверждённом нарушении — листинг удаляется, аккаунт продавца может быть заблокирован.

**Важно:** для подачи жалобы необходимо иметь **зарегистрированный** товарный знак (заявка не принимается). Это ещё один аргумент в пользу ранней регистрации.

### Защита авторских прав на фотографии и описания

Если кто-то копирует ваши фотографии или описания товаров:
1. Сделайте скриншоты с датой и временем (инструмент: Wayback Machine или сервис нотариального скриншота).
2. Отправьте DMCA-подобное уведомление через форму «Zgłoś naruszenie» на Allegro (выбрать: «Naruszenie praw autorskich»).
3. Сохраните все доказательства для возможного судебного разбирательства.

### Инструменты мониторинга и бюджет защиты бренда

| Инструмент | Стоимость | Что даёт |
|---|---|---|
| Allegro Brand Zone | Бесплатно (нужен TM) | Страница бренда, защита |
| Ручной мониторинг | 0 PLN | Базовая проверка раз в неделю |
| Brand24 | от 119 PLN/мес | Упоминания бренда в интернете |
| Tradle | по запросу | Мониторинг маркетплейсов ЦВЕ |
| Rzecznik patentowy (ретейнер) | от 500 PLN/мес | Юридическая поддержка |`,

    contentPl: `## Ochrona marki na Allegro: Brand Zone i narzędzia antykontrfaktowe

Allegro to największy marketplace w Polsce i jeden z czołowych w Europie Środkowo-Wschodniej. Gdy Twoja marka staje się rozpoznawalna, nieuchronnie spotkasz się z «hijackerami» ofert, sprzedawcami podróbek i naruszycielami praw autorskich. Allegro oferuje kilka narzędzi ochrony.

### Allegro Brand Zone: co to jest i jak uzyskać dostęp

**Brand Zone (Strefa Marki)** to wydzielona przestrzeń marki na Allegro, która umożliwia:
- Stworzenie **strony marki** z logo, banerem i opisem
- Wyróżnienie wszystkich swoich produktów w jednej sekcji
- Uzyskanie chronionego **adresu URL** (allegro.pl/uzytkownik/[brand-name])
- Korzystanie z rozszerzonych kart produktów z dodatkowymi zdjęciami i treściami
- Dostęp do narzędzi antykontrfaktowych (usuwanie podejrzanych ofert)

**Wymagania do uzyskania Brand Zone:**
1. Aktywna rejestracja znaku (zarejestrowany znak, nie zgłoszenie) w: UPRP, EUIPO, WIPO lub USPTO
2. Znak musi być identyczny lub zbliżony do Twojej nazwy handlowej na Allegro
3. Weryfikacja prawa własności do znaku towarowego

**Złożenie wniosku:** przez formularz na allegro.pl lub przez opiekuna konta Allegro (dla dużych sprzedawców). Czas rozpatrzenia: 7–30 dni roboczych.

### Ochrona ofert przed «hijackerami»

«Hijackerzy» to sprzedawcy, którzy dołączają do Twoich ofert i sprzedają pod Twoim EAN, często z podrobionymi lub niskiej jakości towarami. Strategie ochrony:

**1. Własne EAN z GS1**
Używaj własnych GTIN z GS1 Polska. Allegro wiąże oferty z EAN — nikt inny nie ma prawa sprzedawać pod Twoim GTIN z certyfikatem GS1.

**2. Rejestracja w Allegro Brand Zone**
Po uzyskaniu Brand Zone Twoja marka otrzymuje status «zweryfikowanej». To sygnał dla kupujących o autentyczności i utrudnia działanie fałszerzom.

**3. Monitoring ofert**
Regularnie sprawdzaj wyszukiwanie po swojej marce i kodach EAN. Narzędzia: Allegro Analytics, ręczny monitoring, zewnętrzne serwisy (Tradle, Brand24).

### Jak zgłosić sprzedaż podróbek na Allegro

**Procedura składania skargi:**
1. Znajdź naruszającą ofertę.
2. Kliknij «Zgłoś naruszenie» pod ofertą.
3. Wybierz typ naruszenia: «Podróbka / naruszenie praw własności intelektualnej».
4. Wypełnij formularz: podaj swoje prawa (numer TM, kraj rejestracji), dołącz dowody.
5. Allegro rozpatruje skargę w ciągu 3–10 dni roboczych.
6. Po potwierdzeniu naruszenia — oferta jest usuwana, konto sprzedawcy może zostać zablokowane.

**Ważne:** do złożenia skargi konieczny jest **zarejestrowany** znak towarowy (samo zgłoszenie nie jest akceptowane). To kolejny argument za wczesną rejestracją.

### Ochrona praw autorskich do zdjęć i opisów

Jeśli ktoś kopiuje Twoje zdjęcia lub opisy produktów:
1. Wykonaj zrzuty ekranu z datą i godziną (narzędzie: Wayback Machine lub usługa notarialnego screenshotu).
2. Wyślij zgłoszenie DMCA przez formularz «Zgłoś naruszenie» na Allegro (wybierz: «Naruszenie praw autorskich»).
3. Zachowaj wszystkie dowody na potrzeby ewentualnego postępowania sądowego.

### Narzędzia monitoringu i budżet ochrony marki

| Narzędzie | Koszt | Co daje |
|---|---|---|
| Allegro Brand Zone | Bezpłatnie (wymaga TM) | Strona marki, ochrona |
| Ręczny monitoring | 0 PLN | Podstawowe sprawdzanie raz w tygodniu |
| Brand24 | od 119 PLN/mies. | Wzmianki o marce w internecie |
| Tradle | na zapytanie | Monitoring marketplace'ów w CEE |
| Rzecznik patentowy (retainer) | od 500 PLN/mies. | Wsparcie prawne |`,

    contentUa: `## Захист бренду на Allegro: Brand Zone та інструменти проти підробок

Allegro — найбільший маркетплейс Польщі та один з провідних у ЦСЄ. При досягненні впізнаваності бренду ви неминуче зіткнетеся з «хайджекерами» (викрадачами лістингів), продавцями контрафакту та порушниками авторських прав. Allegro надає кілька інструментів захисту.

### Allegro Brand Zone: що це і як отримати доступ

**Brand Zone (Strefa Marki)** — це виділений брендований простір на Allegro, який дозволяє:
- Створити **сторінку бренду** з логотипом, банером та описом
- Виділити всі свої товари в одному розділі
- Отримати захищену **URL-адресу** (allegro.pl/uzytkownik/[brand-name])
- Використовувати розширені картки товарів
- Отримати антиконтрафактний захист

**Вимоги для отримання Brand Zone:**
1. Активна реєстрація знаку (зареєстрований знак, не заявка) в: UPRP, EUIPO, WIPO або USPTO
2. Знак повинен бути ідентичним або подібним до вашого торгового найменування на Allegro
3. Верифікація права власності на торговельну марку

### Захист лістингів від «хайджекерів»

**1. Унікальні EAN від GS1**
Використовуйте власні GTIN з GS1 Polska. Allegro прив'язує лістинги до EAN — ніхто інший не має права продавати під вашим GS1-сертифікованим GTIN.

**2. Реєстрація в Allegro Brand Zone**
Після отримання Brand Zone ваш бренд отримує статус «верифікованого».

**3. Моніторинг лістингів**
Регулярно перевіряйте пошук за вашим брендом та EAN-кодами.

### Як повідомити про продаж контрафакту на Allegro

**Процедура подачі скарги:**
1. Знайдіть лістинг, що порушує права.
2. Натисніть «Zgłoś naruszenie» під лістингом.
3. Оберіть тип порушення: «Podróbka / naruszenie praw własności intelektualnej».
4. Заповніть форму: вкажіть ваші права (номер TM, країна реєстрації), додайте докази.
5. Allegro розглядає скаргу протягом 3–10 робочих днів.
6. При підтвердженому порушенні — лістинг видаляється, акаунт продавця може бути заблокований.

**Важливо:** для подачі скарги необхідно мати **зареєстровану** торговельну марку (заявка не приймається).

### Захист авторських прав на фотографії та описи

Якщо хтось копіює ваші фотографії або описи товарів:
1. Зробіть скриншоти з датою та часом.
2. Надішліть DMCA-подібне повідомлення через форму «Zgłoś naruszenie» на Allegro (обрати: «Naruszenie praw autorskich»).
3. Зберіть усі докази для можливого судового розгляду.`,

    contentEn: `## Brand Protection on Allegro: Brand Zone and Anti-Counterfeiting Tools

Allegro is Poland's largest marketplace and one of the leaders in Central and Eastern Europe. Once your brand gains recognition, you will inevitably encounter listing hijackers, counterfeit sellers, and intellectual property infringers. Allegro provides several protection tools.

### Allegro Brand Zone: What It Is and How to Get Access

**Brand Zone (Strefa Marki)** is a dedicated branded space on Allegro that allows you to:
- Create a **brand page** with your logo, banner, and description
- Consolidate all your products in one dedicated section
- Obtain a protected **URL** (allegro.pl/uzytkownik/[brand-name])
- Use enhanced product cards with additional images and rich content
- Access anti-counterfeiting tools (removal of suspected infringing listings)

**Requirements for Brand Zone:**
1. An active registered trademark (registered mark, not application) at: UPRP (Poland), EUIPO (EU), WIPO, or USPTO
2. The mark must be identical or similar to your trading name on Allegro
3. Verification of trademark ownership

**How to apply:** via the form at allegro.pl or through your Allegro account manager (for larger sellers). Processing time: 7–30 business days.

### Protecting Your Listings from Hijackers

Hijackers are sellers who attach themselves to your listings and sell under your EAN, often with counterfeit or substandard goods. Protection strategies:

**1. Unique GS1 EAN Codes**
Use your own GTINs from GS1 Polska. Allegro binds listings to EANs — no one else has the right to sell under your GS1-certified GTIN.

**2. Allegro Brand Zone Registration**
After receiving Brand Zone, your brand gets "verified" status. This signals authenticity to buyers and makes life harder for counterfeiters.

**3. Listing Monitoring**
Regularly check search results for your brand name and EAN codes. Tools: Allegro Analytics, basic manual monitoring, third-party services (Tradle, Brand24).

### How to Report Counterfeit Sales on Allegro

**Complaint procedure:**
1. Find the infringing listing.
2. Click "Zgłoś naruszenie" (Report violation) under the listing.
3. Select the violation type: "Podróbka / naruszenie praw własności intelektualnej" (Counterfeit / IP infringement).
4. Fill in the form: state your rights (TM number, country of registration), attach evidence.
5. Allegro reviews the complaint within 3–10 business days.
6. If infringement is confirmed: the listing is removed, the seller's account may be blocked.

**Important:** to file a complaint you must have a **registered** trademark (an application is not accepted). This is another strong reason for early registration.

### Protecting Copyright on Photos and Descriptions

If someone copies your product photos or descriptions:
1. Take timestamped screenshots (use Wayback Machine or a notarised screenshot service).
2. Submit a DMCA-style notice via the "Zgłoś naruszenie" form on Allegro (select: "Naruszenie praw autorskich" — copyright infringement).
3. Preserve all evidence for potential legal proceedings.

### Monitoring Tools and Brand Protection Budget

| Tool | Cost | What it provides |
|---|---|---|
| Allegro Brand Zone | Free (requires registered TM) | Brand page, IP protection |
| Manual monitoring | PLN 0 | Basic weekly search checks |
| Brand24 | from PLN 119/month | Brand mentions across the web |
| Tradle | on request | CEE marketplace monitoring |
| Patent attorney (retainer) | from PLN 500/month | Legal support and enforcement |`,

    faqRu: [
      {
        q: "Принимает ли Allegro заявку на товарный знак (не зарегистрированный) для Brand Zone?",
        a: "Нет. В отличие от Amazon Brand Registry, Allegro Brand Zone требует **зарегистрированного** знака (не заявки). Вы должны иметь действующее свидетельство о регистрации от UPRP, EUIPO, WIPO или USPTO. Процедура рассмотрения занимает 7–30 рабочих дней после подачи всех необходимых документов.",
      },
      {
        q: "Что делать, если продавец продаёт мои товары с поддельными EAN?",
        a: "Сначала проверьте: если продавец использует ваш GTIN без права на это — это нарушение. Подайте жалобу через «Zgłoś naruszenie» с указанием вашего свидетельства GS1. Если также нарушены права на торговый знак — дополнительно укажите TM. При систематических нарушениях обратитесь к rzecznik patentowy для направления официального письма о прекращении нарушений (wezwanie do zaprzestania).",
      },
      {
        q: "Может ли конкурент использовать моё название бренда в ключевых словах своих листингов на Allegro?",
        a: "Использование зарегистрированного товарного знака конкурентов в ключевых словах листингов на Allegro является нарушением. Allegro имеет право удалять такие листинги по жалобе правообладателя. Для подачи жалобы используйте форму «Zgłoś naruszenie», выберите «Naruszenie znaku towarowego» и укажите номер вашей регистрации.",
      },
    ] satisfies FaqEntry[],

    faqPl: [
      {
        q: "Czy Allegro akceptuje zgłoszenie znaku towarowego (nie rejestrację) do Brand Zone?",
        a: "Nie. W przeciwieństwie do Amazon Brand Registry, Allegro Brand Zone wymaga **zarejestrowanego** znaku (nie zgłoszenia). Musisz posiadać ważne świadectwo rejestracji z UPRP, EUIPO, WIPO lub USPTO. Procedura rozpatrzenia trwa 7–30 dni roboczych po złożeniu wszystkich niezbędnych dokumentów.",
      },
      {
        q: "Co zrobić, jeśli sprzedawca sprzedaje moje produkty z fałszywymi EAN?",
        a: "Najpierw sprawdź: jeśli sprzedawca używa Twojego GTIN bez uprawnień — to naruszenie. Złóż skargę przez «Zgłoś naruszenie» z podaniem swojego certyfikatu GS1. Jeśli naruszono też prawa do znaku towarowego — wskaż TM. Przy systematycznych naruszeniach zwróć się do rzecznika patentowego w celu wysłania oficjalnego wezwania do zaprzestania.",
      },
      {
        q: "Czy konkurent może używać nazwy mojej marki w słowach kluczowych swoich ofert na Allegro?",
        a: "Używanie zarejestrowanego znaku towarowego konkurentów w słowach kluczowych ofert na Allegro stanowi naruszenie. Allegro może usunąć takie oferty na wniosek właściciela praw. Do złożenia skargi użyj formularza «Zgłoś naruszenie», wybierz «Naruszenie znaku towarowego» i podaj numer swojej rejestracji.",
      },
    ] satisfies FaqEntry[],

    faqUa: [
      {
        q: "Чи приймає Allegro заявку на торговельну марку (не зареєстровану) для Brand Zone?",
        a: "Ні. На відміну від Amazon Brand Registry, Allegro Brand Zone вимагає **зареєстрованої** марки (не заявки). Ви повинні мати чинне свідоцтво про реєстрацію від UPRP, EUIPO, WIPO або USPTO. Термін розгляду — 7–30 робочих днів після подачі всіх необхідних документів.",
      },
      {
        q: "Що робити, якщо продавець продає мої товари з підробленими EAN?",
        a: "Спочатку перевірте: якщо продавець використовує ваш GTIN без права на це — це порушення. Подайте скаргу через «Zgłoś naruszenie» із зазначенням вашого свідоцтва GS1. Якщо також порушені права на торговельну марку — вкажіть TM додатково. При систематичних порушеннях зверніться до rzecznik patentowy для направлення офіційного листа про припинення порушень.",
      },
      {
        q: "Чи може конкурент використовувати назву мого бренду в ключових словах своїх лістингів на Allegro?",
        a: "Використання зареєстрованої торговельної марки конкурентів у ключових словах лістингів на Allegro є порушенням. Allegro має право видаляти такі лістинги за скаргою правовласника. Використовуйте форму «Zgłoś naruszenie», оберіть «Naruszenie znaku towarowego» та вкажіть номер вашої реєстрації.",
      },
    ] satisfies FaqEntry[],

    faqEn: [
      {
        q: "Does Allegro accept a trademark application (not registration) for Brand Zone?",
        a: "No. Unlike Amazon Brand Registry, Allegro Brand Zone requires a **registered** trademark (not a pending application). You must hold a valid registration certificate from UPRP, EUIPO, WIPO, or USPTO. The review process takes 7–30 business days after all required documents have been submitted.",
      },
      {
        q: "What should I do if a seller is selling products using my EAN codes without permission?",
        a: "First verify: if the seller is using your GTIN without authorisation — that is an infringement. File a complaint via 'Zgłoś naruszenie' referencing your GS1 certificate. If trademark rights are also violated, include your TM number. For systematic violations, engage a patent attorney to send a formal cease-and-desist letter (wezwanie do zaprzestania).",
      },
      {
        q: "Can a competitor use my brand name in the keywords of their Allegro listings?",
        a: "Using a registered trademark belonging to competitors in listing keywords on Allegro constitutes infringement. Allegro can remove such listings upon a rights holder's complaint. Use the 'Zgłoś naruszenie' form, select 'Naruszenie znaku towarowego' (trademark infringement), and provide your registration number.",
      },
    ] satisfies FaqEntry[],

    category: "intellectual-property",
    tags: ["allegro", "brand-zone", "trademark", "counterfeit", "hijacking", "brand-protection", "gs1", "ean"],
    sortOrder: 23,
    isPublished: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed function
// ─────────────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const db = getDb();

  write("Seeding trademark & EAN topics...");

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

  write(`\nSeeded ${topics.length} trademark/EAN topics.\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

seed()
  .then(() => {
    write("Trademark seed complete.\n");
    return closeDb();
  })
  .then(() => {
    process.exit(0);
  })
  .catch((err: unknown) => {
    process.stderr.write(`Trademark seed failed: ${String(err)}\n`);
    return closeDb().finally(() => {
      process.exit(1);
    });
  });
