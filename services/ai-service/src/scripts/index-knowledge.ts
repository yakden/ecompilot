// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ai-service / scripts/index-knowledge.ts
// One-time script: index 50+ knowledge base documents into Pinecone
// Run: tsx src/scripts/index-knowledge.ts
// ─────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@ecompilot/shared-observability";
import { RagService } from "../services/rag.service.js";
import type { Language } from "@ecompilot/shared-types";
import { db } from "../db/client.js";
import { knowledgeDocuments } from "../db/schema.js";

const logger = createLogger({ service: "ai-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge base document definitions
// ─────────────────────────────────────────────────────────────────────────────

interface KnowledgeDoc {
  readonly title: string;
  readonly content: string;
  readonly category: string;
  readonly language: Language;
}

const KNOWLEDGE_DOCS: readonly KnowledgeDoc[] = [
  // ─── ALLEGRO ALGORITHM ───────────────────────────────────────────────────

  {
    title: "Allegro Algorithm: Key Ranking Factors",
    category: "allegro-algorithm",
    language: "en",
    content: `Allegro's search algorithm ranks listings based on several critical factors. First, conversion rate is paramount — listings with higher purchase-to-view ratios rank better. Second, the number of positive opinions and ratings directly impacts visibility. Third, Smart! delivery and free shipping dramatically improve conversion and ranking. Fourth, listing completeness including all parameters, photos, and descriptions ensures the algorithm can properly index and show your offers. Fifth, sales history and velocity signal product popularity. Sixth, price competitiveness relative to similar listings affects ranking. Seventh, Allegro Coins and Allegro Pay integration can improve conversion rates. Keep titles under 75 characters with key keywords in the first 40 characters. Use all available photo slots (up to 8 images). Always fill in all optional parameters — they help with filtering and visibility.`,
  },
  {
    title: "Allegro Algorithm: Promoted Listings (Ads)",
    category: "allegro-algorithm",
    language: "en",
    content: `Allegro Ads (Oferty Promowane) works on a CPC (cost-per-click) bidding system. The recommended bid range is 3–15% of the product price for most categories. Electronics typically require higher bids (8–15%) while fashion and accessories do well at 3–7%. Campaign performance metrics: CTR above 2% is good, above 5% is excellent. ROAS (Return on Ad Spend) target should be minimum 400%. Use automatic bidding for new campaigns to gather data, then switch to manual bidding once you have 30+ clicks. Allegro Analytics shows impression share — if below 30%, increase your bid. Promoted listings appear in top positions and are marked with a subtle "Promowane" label. External traffic from Google Shopping also benefits from promoted status.`,
  },
  {
    title: "Allegro: Optimizing Listing Titles and Descriptions",
    category: "allegro-algorithm",
    language: "en",
    content: `Allegro listing optimization starts with keyword research. Use Allegro's search suggestions and competitor analysis to find high-volume keywords. Title structure: [Brand] + [Product Name] + [Key Feature] + [Model/Variant] + [Size/Color if relevant]. Never use ALL CAPS. Avoid punctuation in titles. Description should be structured with HTML: use bullet points for key features, bold important specifications, and include a clear warranty/return policy statement. Allegro allows basic HTML in descriptions — use <ul>, <li>, <strong>, <br> tags. Product parameters (parametry) are searchable filters — fill in every applicable parameter. Adding EAN/GTIN codes helps with Google Shopping and SEO. Use all 8 photo slots. First photo should have white background for category pages; additional photos can show usage, dimensions, and details.`,
  },
  {
    title: "Allegro: Customer Reviews and Reputation Management",
    category: "allegro-algorithm",
    language: "en",
    content: `Allegro feedback system directly impacts your Super Seller status and algorithm ranking. Target: 99%+ positive ratings, minimum 100 ratings for new sellers. After each successful transaction, send a polite message requesting feedback — timing is key, send it 3 days after estimated delivery. Respond to all negative reviews professionally and offer solutions (refund, replacement). Dispute process: use Allegro's dispute resolution system for unjustified negative reviews — provide evidence (tracking, photos, correspondence). Super Seller badge requires: 98% positive rating, 100+ transactions in last 12 months, 5% or less disputes, and on-time shipping rate above 95%. Super Seller listings receive a badge that increases conversion by approximately 15–20%.`,
  },
  {
    title: "Allegro: Mobile App and Smart Delivery Integration",
    category: "allegro-algorithm",
    language: "pl",
    content: `Allegro Smart! to program lojalnościowy z darmową dostawą dla subskrybentów. Jako sprzedawca, udział w Allegro Smart! wymaga: czasu wysyłki do 24h w dni robocze, obsługi zwrotów do 30 dni, minimalnej ceny kwalifikującej (zależy od kategorii). Smart! znacząco podnosi konwersję — kupujący preferują oferty ze Smart!. Allegro One Box i Allegro One Click to usługi logistyczne Allegro. Integracja z InPost Paczkomaty: użyj API InPost lub integracji przez Allegro do generowania etykiet. Aplikacja Allegro dla sprzedawców: zarządzaj zamówieniami, odpowiadaj na pytania, monitoruj sprzedaż w czasie rzeczywistym. Push notyfikacje pomagają reagować szybko na pytania kupujących — szybka odpowiedź (do 1h) poprawia konwersję.`,
  },

  // ─── POLAND LEGAL / JDG ──────────────────────────────────────────────────

  {
    title: "Starting Business in Poland: JDG (Sole Proprietorship)",
    category: "poland-legal",
    language: "en",
    content: `JDG (Jednoosobowa Działalność Gospodarcza) is the simplest business form in Poland for e-commerce sellers. Registration: free via CEIDG (Centralna Ewidencja i Informacja o Działalności Gospodarczej) at ceidg.gov.pl — takes 15 minutes online. Required: Polish PESEL number (for EU citizens, can be obtained at local Urząd Stanu Cywilnego). PKD codes for e-commerce: 47.91.Z (retail via internet), 47.99.Z (other retail), 46.90.Z (wholesale). Tax options: ryczałt (lump sum tax) — 3% on product sales, 8.5% on services up to 100k PLN then 12.5%; skala podatkowa (progressive) — 12% up to 120k PLN then 32%; podatek liniowy (flat tax) — 19%. For most e-commerce sellers, ryczałt at 3% on product sales is most advantageous. Choose tax form at registration — can change annually by January 20th.`,
  },
  {
    title: "ZUS Contributions for E-commerce Entrepreneurs in Poland",
    category: "zus-contributions",
    language: "en",
    content: `ZUS (Zakład Ubezpieczeń Społecznych) social insurance contributions in Poland are mandatory for JDG owners. First 6 months: Ulga na start — NO ZUS social contributions, only zdrowotna (health) 9% of income. Months 7–30: Mały ZUS (preferential) — reduced contribution based on minimum wage. After 30 months: Full ZUS. 2024 full ZUS monthly: emerytalne ~793 PLN, rentowe ~325 PLN, chorobowe ~81 PLN, wypadkowe ~71 PLN, Fundusz Pracy ~111 PLN, zdrowotna (9% of income). Total full ZUS approximately 1,600–2,500 PLN/month depending on income. Mały ZUS Plus: available for 36 months if previous year revenue under 120,000 PLN — contribution based on 50% of average monthly income. Pay ZUS by 20th of each month. ZUS contributions are tax-deductible (except zdrowotna under ryczałt).`,
  },
  {
    title: "VAT in Poland for E-commerce Sellers",
    category: "vat-tax",
    language: "en",
    content: `VAT (podatek od towarów i usług) registration in Poland: mandatory when annual turnover exceeds 200,000 PLN. Voluntary registration below threshold is beneficial if buying from VAT-registered suppliers (reclaim input VAT). Standard VAT rate: 23%. Reduced rates: 8% (food, baby products, construction services), 5% (basic foods, books, pharmaceuticals). E-commerce VAT in EU: OSS (One-Stop Shop) procedure — register in one EU country, report all EU sales there. Threshold: €10,000 annual cross-border B2C sales across EU triggers OSS obligation. Poland OSS registration: via Ministerstwo Finansów portal. For B2C sales below threshold, charge Polish VAT. B2B sales to EU with valid VAT number: zero-rated (reverse charge mechanism). Keep VAT invoices for 5 years. JPK (Jednolity Plik Kontrolny) — monthly electronic reporting required for VAT payers.`,
  },
  {
    title: "Podatek dochodowy dla sprzedawców e-commerce w Polsce",
    category: "vat-tax",
    language: "pl",
    content: `Wybór formy opodatkowania jest kluczową decyzją dla sprzedawców. Ryczałt 3% od sprzedaży towarów: najkorzystniejszy dla handlu online, prosty w rozliczeniu, brak możliwości odliczenia kosztów. Skala podatkowa 12%/32%: możliwość odliczenia kosztów (zakup towaru, opakowania, wysyłka, reklama, oprogramowanie), bardziej korzystna przy wysokich kosztach. Podatek liniowy 19%: dla wysokich dochodów bez możliwości wspólnego rozliczenia z małżonkiem. Koszty podatkowe w e-commerce: zakup towaru i komponentów, koszty wysyłki i opakowań, opłaty marketplace (prowizje Allegro), koszty reklamy, oprogramowanie (Fakturownia, BaseLinker), biuro/magazyn. PIT-28 (ryczałt) lub PIT-36/PIT-36L do 30 kwietnia za rok poprzedni. Zaliczki kwartalne lub miesięczne. Przychód = wpływy od klientów minus zwroty. Wydatki dokumentuj fakturami.`,
  },
  {
    title: "Bookkeeping and Accounting for Polish E-commerce",
    category: "poland-legal",
    language: "en",
    content: `Polish e-commerce sellers must maintain proper records. KPiR (Księga Przychodów i Rozchodów) — income and expense ledger required for skala/liniowy tax payers. Ewidencja przychodów — simpler records for ryczałt taxpayers. Required documents: purchase invoices, sales invoices, customs documents, bank statements, ZUS payment confirmations. Recommended accounting software: iFirma, Infakt, Fakturownia, wFirma — all integrate with Allegro, Amazon, and Polish payment systems. E-invoice (KSeF): Poland's National e-Invoice System — mandatory for B2B from February 2026. For B2C, paragon (receipt) is sufficient for sales under 450 PLN, invoice for larger amounts. Foreign currency transactions: use NBP (National Bank of Poland) average exchange rate from the previous business day. Annual tax return deadline: April 30th for previous year.`,
  },

  // ─── CHINA IMPORT ────────────────────────────────────────────────────────

  {
    title: "Importing from China to Poland: Complete Guide",
    category: "china-import",
    language: "en",
    content: `Importing from China to Poland requires understanding customs, VAT, and logistics. Sourcing platforms: Alibaba (bulk B2B), 1688.com (Chinese domestic, cheapest, needs agent), AliExpress (small quantities). Agent services: Supplyia, Sino Buying, EJET — they handle quality control, consolidation, and shipping. Minimum order quantities (MOQ) typically 50–500 units for branded products. Customs duties: varies by HS code — clothing 12%, electronics 0–14%, toys 4.7%, furniture 5.6%. Calculate total landed cost: product price + shipping + customs duty + VAT (23%). De minimis threshold abolished in EU 2021 — all imports now taxed. CE marking required for electronics, toys, medical devices, PPE. Customs documentation: Commercial Invoice, Packing List, Bill of Lading/AWB, CE certificates, origin declaration.`,
  },
  {
    title: "China Import: Shipping Methods and Lead Times",
    category: "china-import",
    language: "en",
    content: `Shipping from China to Poland — method comparison. Sea freight (FCL/LCL): 25–35 days transit, cheapest for large volumes. FCL (Full Container Load) for 20+ CBM, LCL (Less than Container Load) for smaller shipments. Cost: 0.5–2 USD per kg for LCL. Air freight: 7–12 days, 3–5 USD per kg. Best for high-value electronics, time-sensitive stock. Express couriers (DHL, FedEx, UPS): 3–7 days, 5–12 USD per kg. For small parcels under 30kg. Railway (China-Europe): 18–22 days, 1.5–3 USD per kg — good middle ground. Ports in Poland: Gdańsk (main container port), Gdynia, Szczecin. Warsaw and Łódź have major logistics hubs. Lead time from factory: 15–45 days production + shipping. Always order samples first. Use China Export Label for CE marking on electronics.`,
  },
  {
    title: "Import z Chin — Produkty popularne w Polsce",
    category: "china-import",
    language: "pl",
    content: `Najpopularniejsze kategorie produktów importowanych z Chin do sprzedaży na Allegro: elektronika i akcesoria (ładowarki, słuchawki, pokrowce), artykuły domowe i kuchenne, odzież i obuwie (sezon letni/zimowy), zabawki i artykuły dziecięce, narzędzia i artykuły budowlane, kosmetyki i pielęgnacja (wymaga badań CPNP), artykuły sportowe. Marże typowe: elektronika akcesoria 100–200%, artykuły domowe 150–300%, odzież 200–400%. Kluczowe: sprawdź regulacje CE i bezpieczeństwo produktu przed importem. Strona check.allegro.pl do weryfikacji wymagań dla kategorii. Rejestracja WEEE dla elektroniki. Dyrektywa RoHS dla urządzeń elektrycznych. Ustaw konto Allegro jako firma (VATIN) — niższe prowizje na niektórych kategoriach. Alibaba Trade Assurance oferuje ochronę kupującego dla zamówień B2B.`,
  },
  {
    title: "China Import: Quality Control and Supplier Vetting",
    category: "china-import",
    language: "en",
    content: `Quality control when importing from China is critical. Supplier verification steps: check Alibaba Gold Supplier status and years in business, request factory audit report (SGS, Bureau Veritas), verify business license, check Trade Assurance coverage. Sample ordering: always order 3–5 samples from 3 different suppliers before bulk order. Quality inspection services: SGS, Bureau Veritas, Intertek — cost 150–300 EUR per inspection, inspect before shipment (pre-shipment inspection). Check points: dimensions, weight, materials, functionality, packaging quality, labeling compliance. Red flags: prices 50%+ below market, no factory photos, unwilling to provide samples, pressure to pay outside Alibaba. Payment terms: 30% deposit via T/T, 70% on B/L copy. Never pay 100% upfront. Use Alibaba Trade Assurance for protection. Factory visits: worth it for orders above 50,000 EUR.`,
  },

  // ─── LOGISTICS ───────────────────────────────────────────────────────────

  {
    title: "InPost Paczkomaty: Integration Guide for E-commerce",
    category: "logistics",
    language: "en",
    content: `InPost Paczkomaty (parcel lockers) dominate Polish e-commerce logistics with 20,000+ locations nationwide. Business account setup: inpost.pl/biznes — minimum monthly volume commitments unlock better rates. Pricing: A size (max 8x38x64cm, 25kg) ~7–9 PLN, B size (max 19x38x64cm, 25kg) ~8–10 PLN, C size (max 41x38x64cm, 25kg) ~10–12 PLN. API integration: InPost REST API or ShipX API for label generation. Allegro integration: built-in Allegro Shipping module with InPost — no manual API needed, just enable in Allegro settings. BaseLinker integration available. Shipment tracking via API or webhook notifications. Cash on delivery (pobranie) available — funds transferred within 2 business days. Returns: InPost Returns generates return QR codes for customers. Weekend delivery available in major cities. For high volume (1000+ shipments/month), negotiate rates directly with InPost regional manager.`,
  },
  {
    title: "DPD Poland: E-commerce Shipping Integration",
    category: "logistics",
    language: "en",
    content: `DPD Polska offers reliable courier services for e-commerce with extensive delivery options. Business rates: from ~9 PLN for standard 30kg shipment, varies by contract volume. DPD Classic: next business day delivery for Polish addresses. DPD Pickup: 3,000+ pickup points across Poland. API integration: DPD Web Services SOAP API — available at dpd.com.pl for business clients. PHP/Python/Node.js libraries available. Features: automatic COD, delivery notifications by SMS/email, proof of delivery, international shipping to 230+ countries. DPD Predict: real-time 1-hour delivery window notification for recipients — reduces failed deliveries. For Allegro: use DPD as an option in Allegro Shipping or integrate via BaseLinker. DPD Pick Up Point map API available for checkout integration. Document return (zwrot dokumentów) service for contracts/signatures. Labeling: 100x150mm ZPL or PDF label format.`,
  },
  {
    title: "DHL Express i DHL Parcel Polska — Porównanie dla e-commerce",
    category: "logistics",
    language: "pl",
    content: `DHL Parcel to usługa do e-commerce krajowego (Polska), DHL Express to ekspresowa dostawa międzynarodowa. DHL Parcel: Dostawa następnego dnia roboczego, sieć 4000+ punktów (DHL Parcelshop), integracja przez API lub Allegro Wysyłka. Cennik: od ~10 PLN za paczkę do 31.5kg. DHL Express: dostawa w 1–2 dni do UE, 1–3 dni globalnie. Idealny dla pilnych, wartościowych przesyłek. Konto biznesowe DHL: rejestracja na dhl.com.pl/business. MyDHL+ platforma do zarządzania wysyłkami. BaseLinker integracja — generowanie etykiet automatycznie. DHL Fulfillment (3PL): DHL oferuje usługi magazynowania i fulfillment w Polsce — opcja dla sprzedawców 100+ zamówień/dzień. Odprawa celna: DHL Express ma własnych agentów celnych — korzystaj do importu z Chin. Ubezpieczenie przesyłki: opcjonalne, rekomendowane dla wartościowych towarów >500 PLN.`,
  },
  {
    title: "Logistics: Fulfillment Centers and 3PL in Poland",
    category: "logistics",
    language: "en",
    content: `Third-party logistics (3PL) in Poland is mature and cost-effective for growing e-commerce sellers. When to use 3PL: processing 50+ orders daily, storage issues, international expansion plans. Major 3PL providers in Poland: Fulfilio (Kraków), Omnipack (Warsaw), Apaczka Pro (nationwide), Amazon FBA (for Amazon sellers). Cost structure: receiving fee (1–3 PLN/unit), monthly storage (3–15 PLN/pallet/day), pick & pack (2–5 PLN/order), shipping at negotiated rates. Integration options: most Polish 3PLs integrate with BaseLinker, WooCommerce, Allegro, Shopify via API. SLA expectations: same-day shipping for orders before 14:00, 99.5%+ accuracy rate. Amazon FBA in Poland (Amazon.pl): storage in Amazon's Łódź and Poznań warehouses, Prime badge for listings, Amazon handles returns. FBA fees: approximately 20–35% of sale price including storage, pick, pack, ship.`,
  },
  {
    title: "BaseLinker: Multi-channel Order Management",
    category: "logistics",
    language: "pl",
    content: `BaseLinker to kluczowe narzędzie dla polskich sprzedawców wielokanałowych. Integruje Allegro, Amazon, OLX, Etsy, sklep własny (WooCommerce, PrestaShop, Shopify) w jednym panelu. Kluczowe funkcje: automatyzacja statusów zamówień, generowanie etykiet (InPost, DPD, DHL, GLS, UPS), fakturowanie (integracja z iFirma, wFirma, Fakturownia), zarządzanie magazynem, automatyczne wiadomości do kupujących, synchronizacja stanów magazynowych między kanałami. Cennik BaseLinker: od 99 PLN/miesiąc + prowizja 0.02 PLN za zamówienie. Automaty (BaseLinker Automator): reguły automatyczne — np. "jeśli zamówienie opłacone, wyślij potwierdzenie i wygeneruj etykietę InPost". Integracja z Allegro: synchronizacja ofert, zamówień, opinii, faktur. Kluczowe dla skalowalności — bez BaseLinker obsługa 100+ zamówień/dzień jest bardzo trudna.`,
  },

  // ─── VAT / TAX ADDITIONAL ────────────────────────────────────────────────

  {
    title: "OSS (One-Stop Shop) for EU E-commerce VAT",
    category: "vat-tax",
    language: "en",
    content: `OSS (One-Stop Shop) is the EU mechanism for declaring VAT on cross-border B2C sales. Threshold: €10,000 combined annual cross-border sales to EU consumers. Below threshold: charge VAT of seller's country. Above threshold: charge VAT of consumer's country. OSS registration in Poland: via podatki.gov.pl — Union OSS scheme. Quarterly VAT returns submitted through OSS portal. EU VAT rates vary widely: Germany 19%, France 20%, Italy 22%, Czech Republic 21%, Hungary 27%, Luxembourg 17%. Price display: show gross prices including local VAT. OSS does not cover: sales to businesses (B2B), import of goods from outside EU (IOSS scheme applies), services to EU businesses. IOSS (Import One-Stop Shop): for imports under €150 — register in one EU state, collect and remit VAT at checkout. Avoiding OSS: if selling only to Poland, standard Polish VAT registration sufficient regardless of amount.`,
  },
  {
    title: "Podatek VAT — Zwolnienie i rejestracja w Polsce",
    category: "vat-tax",
    language: "pl",
    content: `Zwolnienie z VAT do 200 000 PLN obrotu rocznie (art. 113 ustawy o VAT). Rejestracja dobrowolna poniżej progu: opłacalna jeśli kupujesz od podatników VAT i możesz odliczyć VAT naliczony. Rejestracja VAT: formularz VAT-R na podatki.gov.pl lub w Urzędzie Skarbowym. Numer VAT (NIP) nadawany w 1–7 dni roboczych. VAT na Allegro: Allegro wystawia faktury z polskim VAT 23%. Jeśli jesteś vatowcem, odliczasz VAT od prowizji. Allegro nie jest płatnikiem VAT od Twoich sprzedaży — Ty odprowadzasz VAT od swoich przychodów. Deklaracja JPK_V7M (miesięczna) lub JPK_V7K (kwartalna). Plik JPK_VAT generują programy Fakturownia, iFirma, Comarch ERP. Stawki VAT w Polsce: 23% standard, 8% żywność przetworzona/usługi budowlane, 5% podstawowe artykuły spożywcze/leki/książki, 0% eksport/WDT.`,
  },

  // ─── ALLEGRO ADDITIONAL ──────────────────────────────────────────────────

  {
    title: "Vinted: Selling Second-hand on Poland's Leading Platform",
    category: "allegro-algorithm",
    language: "en",
    content: `Vinted is Poland's dominant second-hand marketplace, particularly strong for fashion, accessories, and children's items. Key facts: 75 million+ users across Europe, strong in Poland, France, Germany, Lithuania. Seller fees: Vinted charges buyers (Buyer Protection fee), sellers pay nothing on standard sales. Boosted listings: promotional feature to increase visibility, cost varies. Shipping via Vinted shipping labels (InPost, DPD, DHL) — labels generated in app. Pricing strategy: research completed sales, not just listed prices. Competitive pricing is critical — Vinted buyers are price-sensitive. Photos: 5 photos per listing, natural light, clean background. Condition descriptions: New with tags (nowe z metką), Like new (jak nowe), Good (dobry), Satisfactory (zadowalający). Vinted Pro: for business sellers — adds legal requirements (returns, VAT), unlocks bulk features. Cross-listing from Vinted to Allegro via tools like Vendfly increases reach.`,
  },
  {
    title: "OLX Polska: Ogłoszenia lokalne dla sprzedawców",
    category: "allegro-algorithm",
    language: "pl",
    content: `OLX to platforma ogłoszeniowa idealna dla lokalnej sprzedaży i produktów używanych. Konto firmowe OLX: umożliwia wystawienie nieograniczonej liczby ogłoszeń (płatnych) z marką firmy. OLX Kup Teraz: funkcja zakupu online z płatnością, dostępna dla wybranych kategorii. Wysyłka przez OLX: integracja z InPost i Allegro Smart! Płatności OLX: DotPay/PayU integracja. Dobre kategorie na OLX: elektronika (szczególnie używana), meble, samochody, nieruchomości, zwierzęta, usługi lokalne. Prowizja OLX: 0–11% w zależności od kategorii przy Kup Teraz. Ogłoszenia podstawowe: bezpłatne do limitu, potem pakiety płatne. Promowanie ogłoszeń: odświeżanie (darmowe co kilka dni), TopOgłoszenie (premium widoczność). Niedziela i poniedziałek to najlepsze dni na publikację ogłoszeń — wyższy ruch. Cross-listing OLX + Allegro przez BaseLinker pozwala zarządzać stanami z jednego miejsca.`,
  },
  {
    title: "Etsy for Polish Sellers: Handmade and Vintage Products",
    category: "allegro-algorithm",
    language: "en",
    content: `Etsy provides Polish artisans and vintage sellers with access to global markets. Etsy fees: listing fee $0.20 per item (4 months), transaction fee 6.5% of sale price + shipping, payment processing 3% + €0.25. Opening an Etsy shop from Poland: requires valid payment method (credit card or PayPal), Etsy Payments supported in Poland for receiving funds. Shipping from Poland to EU: use Poczta Polska (cheapest), InPost international, or DHL. Tracked shipping highly recommended — Etsy Star Seller requires tracking. Customs for international orders: buyers in UK, USA, Canada pay import duties — Etsy collects and remits taxes for certain countries (seller not responsible). Polish products that sell well on Etsy: amber jewelry, folk art (wycinanki, hafty), linen products, wooden crafts, personalized gifts. SEO on Etsy: 13 tags per listing (all in English), keyword-rich titles, use Etsy's search bar for keyword ideas. Etsy Ads: starting budget 1–5 USD/day, monitor ROAS.`,
  },

  // ─── ZUS ADDITIONAL ──────────────────────────────────────────────────────

  {
    title: "ZUS dla sprzedawców e-commerce — Praktyczny przewodnik",
    category: "zus-contributions",
    language: "pl",
    content: `ZUS (Zakład Ubezpieczeń Społecznych) to obowiązkowe ubezpieczenie społeczne w Polsce. Ulga na start: pierwsze 6 miesięcy JDG — brak składek społecznych (tylko zdrowotna). Uwaga: Ulga na start nie przerywa 24-miesięcznego okresu Małego ZUS. Mały ZUS (preferencyjne): miesiące 7–30 — składka 30% minimalnego wynagrodzenia. 2024: ~380 PLN/miesiąc za składki społeczne. Mały ZUS Plus (36 miesięcy): dostępny jeśli przychód poprzedniego roku nie przekroczył 120 000 PLN — składka 50% dochodu (proporcjonalna). Pełny ZUS 2024: łącznie ok. 1 600–2 500 PLN miesięcznie. Składka zdrowotna: 9% dochodu (skala i liniowy), 9% przychodu (ryczałt — stawki zmienne). eZUS: platforma do opłacania ZUS online — ustaw stałe zlecenie. Konta ZUS: 83 składki społeczne (jedno konto dla wszystkich), 27 składka zdrowotna. Termin płatności: do 20. dnia następnego miesiąca. ZUS obniża podstawę opodatkowania (oprócz zdrowotnej przy ryczałcie).`,
  },
  {
    title: "Health Insurance (Składka Zdrowotna) for Polish Entrepreneurs",
    category: "zus-contributions",
    language: "en",
    content: `Health insurance contribution (składka zdrowotna) in Poland underwent major changes in 2022. Calculation methods differ by tax form. Ryczałt (lump-sum): income up to 60,000 PLN = 9% of 60% of minimum wage (~335 PLN/month in 2024); 60,000–300,000 PLN = 9% of 100% of average salary (~561 PLN/month); above 300,000 PLN = 9% of 180% of average salary (~1,008 PLN/month). Skala podatkowa (progressive): 9% of actual monthly income, minimum 9% of minimum wage. Podatek liniowy (flat 19%): 4.9% of income, minimum 9% of minimum wage. Health contribution is NOT tax-deductible for ryczałt. For skala and liniowy, health contribution deductible up to specific limits. Sick leave insurance (chorobowe) is optional but allows claiming L4 sick leave benefits. Maternity leave benefits require sick leave insurance. Pay health contribution to a separate ZUS bank account.`,
  },

  // ─── RUSSIA-LANGUAGE CONTENT ─────────────────────────────────────────────

  {
    title: "Allegro для русскоязычных продавцов — Начало работы",
    category: "allegro-algorithm",
    language: "ru",
    content: `Allegro — крупнейший маркетплейс Польши с более чем 20 миллионами активных покупателей. Регистрация продавца: allegro.pl, нужен польский NIP (налоговый номер) или EU VAT. Для JDG (ИП): автоматически получаете NIP при регистрации в CEIDG. Категории с наибольшим оборотом: электроника, мода, товары для дома и сада, детские товары, авто-товары. Создание объявления: раздел "Moje Allegro" → "Sprzedaж" → "Dodaj ofertę". Листинг: название до 75 символов, минимум 3 фото, описание (разрешён базовый HTML), параметры товара (обязательно заполнить все). Способы оплаты: Allegro Pay, BLIK, карты — Allegro сам принимает оплаты. Выплаты продавцу: раз в 2 недели, на польский или иностранный банковский счёт. Инструменты аналитики: Allegro Analytics показывает просмотры, конверсию, позиции в поиске. Первые продажи: участие в "Tydzień z rabatami" и акциях Allegro увеличивает видимость новых аккаунтов.`,
  },
  {
    title: "Импорт из Китая в Польшу — Пошаговый гайд",
    category: "china-import",
    language: "ru",
    content: `Пошаговый процесс импорта товаров из Китая в Польшу. Шаг 1 — Выбор товара: анализ спроса на Allegro (инструменты: Allegro Analytics, Helium 10 для Amazon), проверка наценки (минимум 200% от закупочной цены с учётом всех расходов). Шаг 2 — Поиск поставщика: Alibaba (международный B2B), 1688.com (китайский рынок — дешевле на 20-40%, нужен агент), выставки (Canton Fair, апрель и октябрь). Шаг 3 — Заказ образцов: 3-5 образцов от разных поставщиков, оценка качества и соответствия CE. Шаг 4 — Переговоры: обсуждение MOQ, цены при разных объёмах, условий оплаты (30/70), сроков производства. Шаг 5 — Логистика: морской фрахт (LCL 0.5-2 $/кг, 30-35 дней), авиа (3-5 $/кг, 7-12 дней), железная дорога (1.5-3 $/кг, 20 дней). Шаг 6 — Таможня в Польше: таможенный агент (брокер), сертификат CE, инвойс, упаковочный лист, коносамент. Шаг 7 — Продажи и реинвестирование.`,
  },
  {
    title: "ZUS и налоги для русскоязычных предпринимателей в Польше",
    category: "zus-contributions",
    language: "ru",
    content: `Налогообложение бизнеса в Польше для иностранцев. JDG (ИП) доступно гражданам ЕС без ограничений, а также гражданам Украины на основании специальных законов о защите. Для граждан других стран — нужен вид на жительство (карта побыту). Налоговые ставки: рычалт (ryczałt) 3% от оборота для торговли товарами — самый выгодный для e-commerce. Нет возможности вычитать расходы. ZUS-взносы: первые 6 месяцев — только медицинская страховка ~335 PLN/мес. Затем льготный ZUS ~380 PLN/мес (до 30 месяцев). Потом полный ZUS ~1600 PLN/мес. Платить ZUS нужно до 20-го числа каждого месяца. Налоговая декларация: до 30 апреля за прошлый год. Рекомендуемые бухгалтеры для русскоязычных в Польше: ищите в группах Facebook "Ukrainians/Russians in Poland business". Банковский счёт для JDG: mBank, ING, Santander — онлайн-открытие за 1 день.`,
  },

  // ─── UKRAINIAN-LANGUAGE CONTENT ──────────────────────────────────────────

  {
    title: "Allegro для українських продавців — Старт бізнесу",
    category: "allegro-algorithm",
    language: "ua",
    content: `Allegro — найбільший маркетплейс Польщі з 20+ мільйонами активних покупців. Реєстрація продавця-фізособи (JDG): потрібен польський NIP, отримується при реєстрації JDG в CEIDG. Громадяни України мають право відкривати JDG в Польщі за спеціальним законом про захист. Для реєстрації JDG: PESEL (отримати в місцевому USC), потім реєстрація на ceidg.gov.pl онлайн безкоштовно. Allegro провізія: 5-15% в залежності від категорії. Виплати: раз на 2 тижні. Перші кроки: 1) Відкрийте польський банківський рахунок (mBank, ING, Alior — онлайн за 1 день), 2) Зареєструйте JDG, 3) Відкрийте акаунт Allegro як компанія, 4) Налаштуйте InPost для відправок. Корисні інструменты: BaseLinker для автоматизації, Fakturownia для виставлення рахунків. Найбільш прибуткові категорії для старту: аксесуари для смартфонів, товари для дому, дитячі товари.`,
  },
  {
    title: "Logistyka w Polsce dla sprzedawców — Wybór kuriera",
    category: "logistics",
    language: "pl",
    content: `Wybór odpowiedniego kuriera to kluczowa decyzja dla e-commerce. Porównanie popularnych opcji: InPost Paczkomaty — najtańszy dla paczek do 25kg, klienci uwielbiają (65% polskich kupujących woli paczkomaty), czas dostawy 1-2 dni robocze. DPD Polska — dobry dla przesyłek ponadgabarytowych, dostawa do drzwi lub punktu, czas 1-2 dni. DHL Parcel — niezawodny, dobra obsługa reklamacji, nieco droższy. GLS — tańsza alternatywa dla DPD, dobra do dostawy w UE. Poczta Polska — najtańsza dla lekkich paczek (do 2kg), najwolniejsza (2-5 dni). Strategia: oferuj minimum 2 metody dostawy (paczkomat + kurier do drzwi). Bezpłatna dostawa od określonej kwoty (np. 199 PLN) zwiększa średnią wartość zamówienia. Czas wysyłki "do 24h" to wymóg Allegro Smart! — automatyzuj generowanie etykiet przez BaseLinker. Ubezpieczenie paczki: standardowo do 500 PLN, dla droższych towarów dokup rozszerzenie.`,
  },

  // ─── ADDITIONAL TOPICS ────────────────────────────────────────────────────

  {
    title: "Amazon.pl: Selling on Amazon Poland",
    category: "allegro-algorithm",
    language: "en",
    content: `Amazon.pl launched in 2021 and is growing rapidly in Poland. Seller registration: sellercentral.amazon.pl — EU entity (PL, DE, CZ, etc.) required, Polish VAT registration recommended. Fee structure: Individual (no monthly fee, 0.99 PLN/item) or Professional (165 PLN/month, unlimited items). Referral fees: 8–15% depending on category. FBA (Fulfilled by Amazon) in Poland: warehouses in Łódź and Poznań, Prime badge improves conversion significantly. FBA costs: storage (2.17–3.19 PLN/unit/month standard, higher Oct–Dec), fulfillment (6–15 PLN per order depending on size/weight). Amazon SEO: A9 algorithm favors keywords in title, bullet points, backend keywords. Amazon Brand Registry: protects brand, unlocks A+ content and Sponsored Brands ads. Amazon Ads Poland: PPC campaigns in PLN. Start with Sponsored Products (auto-targeting) to gather data, then manual keyword campaigns. Amazon vs Allegro: Amazon growing but Allegro still dominates in Poland with 5x more GMV.`,
  },
  {
    title: "E-commerce Photography: Product Photos that Convert",
    category: "allegro-algorithm",
    language: "en",
    content: `Product photography directly impacts conversion rates on all Polish marketplaces. Technical requirements: Allegro minimum 400x400px, recommended 1500x1500px or larger. White background for main photo is best practice (and required for Amazon). Equipment options: DSLR or mirrorless camera, but modern smartphones (iPhone 14+, Samsung S23+) produce excellent results. Lighting: natural diffused light near window, or simple LED softbox setup (cost ~200-500 PLN). For Amazon: pure white background (#FFFFFF), product occupying 85% of frame, no watermarks. Photo types needed: hero shot (white background), lifestyle photos (product in use), detail shots (texture, materials), size reference shot, packaging photo. Number of photos: use all available slots (8 on Allegro, 9 on Amazon). Video: Allegro supports product videos — 30-60 seconds significantly boosts conversion. Editing tools: free (Canva, Photoshop Express), professional (Adobe Lightroom + Photoshop). Remove background: remove.bg (automatic, excellent quality for product photos).`,
  },
  {
    title: "Pricing Strategy for Polish Marketplaces",
    category: "allegro-algorithm",
    language: "en",
    content: `Competitive pricing on Polish marketplaces requires a systematic approach. Price monitoring tools: Allegro's built-in price comparison, Pricespy.pl, Ceneo.pl (comparison engine). Dynamic pricing: manually review prices weekly for top sellers, use automated repricing tools for large catalogs. Price floors: calculate minimum viable price = (purchase price + VAT + shipping + marketplace commission + desired margin). For Allegro: commission 5-15%, Allegro Smart delivery ~3-4 PLN per shipment. Total cost example: product cost 50 PLN + shipping 8 PLN + Allegro commission 8 PLN (10%) + packaging 1.50 PLN = 67.50 PLN total cost. At 200 PLN sale price = 132.50 PLN gross margin = 66%. Psychological pricing: 99 PLN, 199 PLN, 299 PLN. Bundle pricing: combine related products for higher AOV. Quantity discounts: Allegro supports multi-buy promotions. Seasonal pricing: increase prices before holidays (Christmas, Valentine's Day, Mother's Day).`,
  },
  {
    title: "Customer Service Excellence in Polish E-commerce",
    category: "allegro-algorithm",
    language: "pl",
    content: `Obsługa klienta jest fundamentem długoterminowego sukcesu na polskich marketplace'ach. Czas odpowiedzi: Allegro monitoruje czas odpowiedzi na pytania — cel poniżej 1 godziny w godzinach pracy. Nieodpowiedziane pytania obniżają scoring. Narzędzia: wbudowany czat Allegro, BaseLinker (integracja wszystkich kanałów), Tidio lub LiveChat dla sklepu własnego. Zwroty: prawo konsumenta do zwrotu bez podania przyczyny w ciągu 14 dni (zakupy online). Przyjmuj zwroty sprawnie — 70% klientów, którzy zwrócili towar bez problemów, kupuje ponownie. Reklamacje: ustawa o prawach konsumenta — 2 lata rękojmi na nowe towary. Szablony wiadomości: przygotuj szablony dla najczęstszych sytuacji (potwierdzenie wysyłki, odpowiedź na reklamację, prośba o opinię). Proaktywna komunikacja: informuj o opóźnieniach zanim klient zapyta. Programy lojalnościowe: kupony dla stałych klientów, pakiety rabatowe. Opinie negatywne: zawsze odpowiadaj publicznie, zaproponuj rozwiązanie.`,
  },
  {
    title: "Dropshipping in Poland: Legal and Practical Guide",
    category: "poland-legal",
    language: "en",
    content: `Dropshipping in Poland is legal but has specific requirements. Business model: you list products, supplier ships directly to customer. Legal requirements: registered business (JDG or sp. z o.o.), customer contract clearly stating your business details (not supplier's), consumer rights apply to you (not supplier). VAT on dropshipping: you collect VAT from customer, pay it to tax authority, can reclaim VAT from supplier. Dropshipping suppliers in Poland: Hurt.pl, GlobaleSklepy, Droplo, Modivo (fashion), 4trade. EU dropshipping: AliDropship plugin, CJ Dropshipping (faster shipping). Allegro dropshipping rules: allowed, but you must ship within declared timeframe — use suppliers with Polish/EU warehouses for <48h shipping. Margins in Polish dropshipping: typically 15-40% — lower than own-inventory but no upfront capital. Key risk: supplier stock-outs causing cancelled orders (damages Allegro metrics). Mitigation: work with 2-3 suppliers per product, monitor stock via API.`,
  },
  {
    title: "Allegro: Bezpłatne narzędzia sprzedawcy",
    category: "allegro-algorithm",
    language: "pl",
    content: `Allegro oferuje rozbudowane bezpłatne narzędzia dla sprzedawców. Allegro Analytics: statystyki ofert (wyświetlenia, kliknięcia, konwersja, przychody), analiza rynku, trendy wyszukiwania. Dostępna w Moje Allegro → Analytics. Asystent Allegro: AI-powered sugestie optymalizacji ofert, automatyczne wypełnianie parametrów. Allegro Smart! kalkulator: sprawdź czy Twoja oferta kwalifikuje się do programu Smart! Alegrowy cennik: porównaj prowizje dla różnych kategorii przed wystawieniem. Allegro Lokalnie: platforma do sprzedaży lokalnej bez dostawy. Allegro Biznes: dedykowana sekcja B2B z cenami netto. Panel Sprzedawcy: zarządzanie zamówieniami, generowanie etykiet, raportowanie. Allegro One: własny sklep internetowy zintegrowany z Allegro — bezpłatny dla sprzedawców z subskrypcją. Allegro Pay Odroczenie płatności: zwiększa konwersję, Allegro wypłaca pełną kwotę natychmiast. Alerty cenowe: monitoruj ceny konkurencji i automatycznie dostosowuj własne ceny.`,
  },
  {
    title: "Allegro: Управление возвратами и спорами",
    category: "allegro-algorithm",
    language: "ru",
    content: `Управление возвратами на Allegro — ключевой аспект для поддержания рейтинга Super Seller. Право покупателя: по закону ЕС и польскому законодательству покупатель может вернуть любой товар в течение 14 дней без объяснения причин (покупки онлайн). Процесс возврата: покупатель инициирует возврат в личном кабинете Allegro, вы обязаны принять. Стоимость обратной доставки: по умолчанию оплачивает покупатель, но указание "darmowy zwrot" (бесплатный возврат) увеличивает конверсию на 15-20%. Возврат денег: в течение 14 дней после получения товара обратно. Спорные ситуации: использует платформу Allegro Mediator. При повреждении товара — фотографии обязательны. Рекламация (rękojmia): 2 года по закону на новые товары. Ответственность продавца: дефект производителя = ваша ответственность (возмещайте затем у поставщика). Совет: принимайте возвраты быстро и без споров — это сохраняет позитивный рейтинг и часто клиент покупает снова.`,
  },
  {
    title: "Повернення товарів та права покупців в Польщі",
    category: "poland-legal",
    language: "ua",
    content: `Права споживачів в Польщі при онлайн-покупках — одні з найсильніших в ЄС. 14-денне право на повернення: покупець може повернути будь-який товар без пояснень протягом 14 днів з моменту отримання. Продавець зобов'язаний повернути гроші протягом 14 днів після отримання повернутого товару. Рекламація (Rękojmia): 2 роки на новий товар — продавець відповідальний за дефекти. Гарантія (Gwarancja): додаткова, від виробника, умови зазначені в документах. Як обробляти повернення на Allegro: прийміть повернення в системі Allegro, перевірте товар, поверніть гроші. Безкоштовне повернення: якщо зазначено в оголошенні — інакше покупець платить за зворотню доставку. Excepted items (не підлягають поверненню): розпаковані медіа (CD, DVD), персоналізовані товари, швидкопсувні продукти, нижня білизна. Документація: зберігайте всі листування та фото для можливих спорів. Порада: швидке вирішення проблем утримує клієнтів та підтримує рейтинг.`,
  },
  {
    title: "Social Media Marketing for Polish E-commerce",
    category: "allegro-algorithm",
    language: "en",
    content: `Social media drives significant traffic to Polish marketplace listings and online stores. Key platforms for Polish e-commerce: Facebook (most important — 20M+ Polish users), Instagram (fashion, lifestyle, home decor), TikTok (growing fast, younger demographics), Pinterest (DIY, home, fashion). Facebook strategy: Polish Facebook groups (e.g., "Allegro Deals", niche groups), Facebook Marketplace for local sales, Facebook Ads targeting Polish users by interest and behavior. Instagram: product photos and reels, use Polish hashtags (#allegro, #polskasklep, #handmade), collaborate with micro-influencers (10k-50k followers, 500-2000 EUR per post). TikTok Shop: available in Poland — tag products in videos, direct purchase. TikTok organic: product unboxing, "thrift with me", before/after transformations. Content calendar: post 3-5 times per week consistently. User-generated content: encourage customers to share photos, offer discount for review with photo.`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Indexing runner
// ─────────────────────────────────────────────────────────────────────────────

async function indexAllDocuments(): Promise<void> {
  logger.info(
    { totalDocuments: KNOWLEDGE_DOCS.length },
    "Starting knowledge base indexing",
  );

  const ragService = new RagService(logger);

  // Verify Pinecone connectivity
  const pineconeOk = await ragService.ping();
  if (!pineconeOk) {
    throw new Error("Cannot reach Pinecone — check PINECONE_API_KEY and PINECONE_INDEX");
  }

  let indexed = 0;
  let failed = 0;
  const vectorIdMap: Record<string, string[]> = {};

  for (const doc of KNOWLEDGE_DOCS) {
    const docKey = `${doc.language}:${doc.category}:${doc.title}`;
    logger.info(
      { title: doc.title, category: doc.category, language: doc.language },
      "Indexing document",
    );

    try {
      const result = await ragService.indexDocument(doc.content, {
        title: doc.title,
        category: doc.category,
        language: doc.language,
      });

      vectorIdMap[docKey] = [...result.vectorIds];

      // Persist to PostgreSQL
      await db.insert(knowledgeDocuments).values({
        title: doc.title,
        content: doc.content,
        category: doc.category,
        language: doc.language,
        vectorId: result.vectorIds[0] ?? "",
        indexedAt: new Date(),
      });

      indexed++;
      logger.info(
        { title: doc.title, chunks: result.chunksIndexed },
        "Document indexed",
      );

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (err) {
      failed++;
      logger.error({ err, title: doc.title }, "Failed to index document");
    }
  }

  logger.info(
    { indexed, failed, total: KNOWLEDGE_DOCS.length },
    "Knowledge base indexing complete",
  );

  if (failed > 0) {
    logger.warn({ failed }, "Some documents failed to index — re-run to retry");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

indexAllDocuments()
  .then(() => {
    process.exit(0);
  })
  .catch((err: unknown) => {
    logger.fatal({ err }, "Knowledge indexing failed");
    process.exit(1);
  });
