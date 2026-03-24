// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ksef-service: Invoice service
// FA(3) XML generation, GTU assignment, auto-invoice from orders,
// JPK_V7 marker logic, and order-type classification.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import type { Logger } from "pino";
import {
  type KsefInvoice,
  type FA3InvoiceXml,
  type KsefLineItem,
  type KsefVatSummary,
  type KsefParty,
  type GtuCode,
  type JpkV7Marker,
  type StawkaPodatku,
  type Grosze,
  type Nip,
  type InvoiceNumber,
  type OrderType,
  AUTO_INVOICE_RULES,
  VAT_RATE_TO_STAWKA,
  GTU_DESCRIPTIONS,
  asGrosze,
  asNip,
  asInvoiceNumber,
} from "../types/ksef.js";
import { getDb } from "../db/client.js";
import { invoices } from "../db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// GTU category keywords for automatic classification
// ─────────────────────────────────────────────────────────────────────────────

const GTU_06_KEYWORDS = [
  "tablet", "laptop", "komputer", "smartphone", "telefon", "monitor",
  "telewizor", "tv", "lodówka", "pralka", "zmywarka", "kuchenka",
  "mikrofala", "odkurzacz", "żelazko", "robot", "elektronik", "ładowarka",
  "słuchawki", "głośnik", "kamera", "aparat",
] as const;

const GTU_12_KEYWORDS = [
  "software", "oprogramowanie", "licencja", "subskrypcja", "saas", "app",
  "aplikacja", "gra", "game", "streaming", "e-book", "ebook", "audiobook",
  "cyfrowy", "digital", "online", "plugin", "extension", "api dostęp",
] as const;

const GTU_13_KEYWORDS = [
  "transport", "dostawa", "przesyłka", "kuriersk", "logistyka", "magazyn",
  "składowanie", "spedycja", "frachtowy", "przewóz",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// GTU code assignment
// ─────────────────────────────────────────────────────────────────────────────

export function assignGtuCode(productName: string): GtuCode | undefined {
  const normalized = productName.toLowerCase();

  for (const keyword of GTU_06_KEYWORDS) {
    if (normalized.includes(keyword)) return "GTU_06";
  }
  for (const keyword of GTU_12_KEYWORDS) {
    if (normalized.includes(keyword)) return "GTU_12";
  }
  for (const keyword of GTU_13_KEYWORDS) {
    if (normalized.includes(keyword)) return "GTU_13";
  }

  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// XML escaping helper
// ─────────────────────────────────────────────────────────────────────────────

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatGrosze(grosze: Grosze): string {
  return (grosze / 100).toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// FA(3) XML generation — Schema template #13775
// Namespace: http://crd.gov.pl/wzor/2023/06/29/12648/
// ─────────────────────────────────────────────────────────────────────────────

export function generateInvoiceXml(invoice: KsefInvoice): FA3InvoiceXml {
  const { podmiot1, podmiot2, faktura } = invoice;

  // Build address XML fragment
  function addressXml(party: KsefParty, tag: "Adres" | "AdresP"): string {
    const addr = party.adres;
    return `
      <${tag}>
        <KodKraju>${escapeXml(addr.kodKraju)}</KodKraju>
        ${addr.kodPocztowy !== undefined ? `<KodPocztowy>${escapeXml(addr.kodPocztowy)}</KodPocztowy>` : ""}
        <Miejscowosc>${escapeXml(addr.miejscowosc)}</Miejscowosc>
        ${addr.ulica !== undefined ? `<Ulica>${escapeXml(addr.ulica)}</Ulica>` : ""}
        ${addr.nrDomu !== undefined ? `<NrDomu>${escapeXml(addr.nrDomu)}</NrDomu>` : ""}
        ${addr.nrLokalu !== undefined ? `<NrLokalu>${escapeXml(addr.nrLokalu)}</NrLokalu>` : ""}
      </${tag}>`;
  }

  // Build line items XML
  const pozycjeXml = faktura.pozycje.map((item) => `
    <Pozycja>
      <NrWiersza>${item.lp}</NrWiersza>
      <P_2B>${escapeXml(item.nazwa)}</P_2B>
      ${item.jednostkaMiary !== undefined ? `<P_3>${escapeXml(item.jednostkaMiary)}</P_3>` : ""}
      <P_4>${item.ilosc}</P_4>
      <P_5>${formatGrosze(item.cenaJednostkowa)}</P_5>
      <P_6A>${formatGrosze(item.wartoscNetto)}</P_6A>
      <P_12>${item.stawkaPodatku}</P_12>
      <P_13_1>${formatGrosze(item.kwotaPodatku)}</P_13_1>
      <P_14_1>${formatGrosze(item.wartoscBrutto)}</P_14_1>
      ${item.gtuKod !== undefined ? `<GTU>${item.gtuKod}</GTU>` : ""}
      ${item.pkwiu !== undefined ? `<PKWIU>${escapeXml(item.pkwiu)}</PKWIU>` : ""}
      ${item.cn !== undefined ? `<CN>${escapeXml(item.cn)}</CN>` : ""}
    </Pozycja>`).join("");

  // Build VAT summary XML
  const sumyXml = faktura.sumy.map((sum) => `
    <Suma>
      <P_12>${sum.stawkaPodatku}</P_12>
      <P_13>${formatGrosze(sum.wartoscNetto)}</P_13>
      <P_14>${formatGrosze(sum.kwotaPodatku)}</P_14>
      <P_15>${formatGrosze(sum.wartoscBrutto)}</P_15>
    </Suma>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://crd.gov.pl/wzor/2023/06/29/12648/ schemat.xsd">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${escapeXml(invoice.naglowek.dataWytworzeniaFa)}</DataWytworzeniaFa>
    <SystemInfo>EcomPilot-ksef-service</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${escapeXml(podmiot1.nip)}</NIP>
      <PelnaNazwa>${escapeXml(podmiot1.pelnanazwa)}</PelnaNazwa>
    </DaneIdentyfikacyjne>
    ${addressXml(podmiot1, "Adres")}
    ${podmiot1.email !== undefined ? `<Email>${escapeXml(podmiot1.email)}</Email>` : ""}
    ${podmiot1.telefon !== undefined ? `<Telefon>${escapeXml(podmiot1.telefon)}</Telefon>` : ""}
    <Rola>Sprzedawca</Rola>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      ${podmiot2.nip !== undefined ? `<NIP>${escapeXml(podmiot2.nip)}</NIP>` : ""}
      ${podmiot2.nipUe !== undefined ? `<NIPUe>${escapeXml(podmiot2.nipUe)}</NIPUe>` : ""}
      ${podmiot2.krajNabywcy !== undefined ? `<KrajNabywcy>${escapeXml(podmiot2.krajNabywcy)}</KrajNabywcy>` : ""}
      <PelnaNazwa>${escapeXml(podmiot2.pelnanazwa)}</PelnaNazwa>
    </DaneIdentyfikacyjne>
    ${addressXml(podmiot2, "Adres")}
    ${podmiot2.email !== undefined ? `<Email>${escapeXml(podmiot2.email)}</Email>` : ""}
    <Rola>Nabywca</Rola>
  </Podmiot2>
  <Fa>
    <KodWaluty>${escapeXml(faktura.waluta)}</KodWaluty>
    <P_1>${escapeXml(faktura.dataWystawienia)}</P_1>
    ${faktura.dataSprzedazy !== undefined ? `<P_2>${escapeXml(faktura.dataSprzedazy)}</P_2>` : ""}
    <P_2A>${escapeXml(faktura.numerFaktury)}</P_2A>
    <RodzajFaktury>${escapeXml(faktura.rodzajFaktury)}</RodzajFaktury>
    <FaWiersz>${pozycjeXml}
    </FaWiersz>
    ${sumyXml}
    <P_15>${formatGrosze(faktura.wartoscBrutto)}</P_15>
    <Adnotacje>
      <P_16>${faktura.warunki.metodaPlatnosci === "przelew" ? "1" : "2"}</P_16>
      ${faktura.warunki.numerRachunku !== undefined ? `<Rachunek>${escapeXml(faktura.warunki.numerRachunku)}</Rachunek>` : ""}
      ${faktura.warunki.terminPlatnosci !== undefined ? `<P_22>${escapeXml(faktura.warunki.terminPlatnosci)}</P_22>` : ""}
    </Adnotacje>
    ${faktura.notatkiDodatkowe !== undefined ? `<Stopka><Informacja>${escapeXml(faktura.notatkiDodatkowe.slice(0, 500))}</Informacja></Stopka>` : ""}
    ${faktura.nrKsefFaktury !== undefined ? `<ZalacznikFaktury><NrKSeFFaKorygowanej>${escapeXml(faktura.nrKsefFaktury)}</NrKSeFFaKorygowanej></ZalacznikFaktury>` : ""}
  </Fa>
</Faktura>`;

  const utf8Buffer = Buffer.from(xml, "utf-8");
  const sha256 = createHash("sha256").update(utf8Buffer).digest("hex");

  return {
    xmlContent: xml,
    sha256,
    byteSize: utf8Buffer.byteLength,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VAT summary computation — aggregate line items by VAT rate
// ─────────────────────────────────────────────────────────────────────────────

export function computeVatSummary(lineItems: readonly KsefLineItem[]): KsefVatSummary[] {
  const groups = new Map<StawkaPodatku, { netto: number; podatek: number; brutto: number }>();

  for (const item of lineItems) {
    const existing = groups.get(item.stawkaPodatku) ?? { netto: 0, podatek: 0, brutto: 0 };
    groups.set(item.stawkaPodatku, {
      netto: existing.netto + item.wartoscNetto,
      podatek: existing.podatek + item.kwotaPodatku,
      brutto: existing.brutto + item.wartoscBrutto,
    });
  }

  return Array.from(groups.entries()).map(([stawka, totals]) => ({
    stawkaPodatku: stawka,
    wartoscNetto: asGrosze(totals.netto),
    kwotaPodatku: asGrosze(totals.podatek),
    wartoscBrutto: asGrosze(totals.brutto),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-invoice from marketplace order
// B2B = mandatory KSeF submission, B2C = optional (BFK marker),
// OSS/IOSS = excluded from KSeF (BFK marker, DI for digital services)
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderItem {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceGrosze: Grosze;
  readonly vatRate: 23 | 8 | 5 | 0;
}

export interface OrderInvoiceRequest {
  readonly orderId: string;
  readonly userId: string;
  readonly orderType: OrderType;
  readonly buyerNip: Nip | undefined;
  readonly buyerNipUe: string | undefined;
  readonly buyerCountryCode: string | undefined;
  readonly buyerName: string;
  readonly buyerCity: string;
  readonly buyerPostalCode: string | undefined;
  readonly buyerStreet: string | undefined;
  readonly sellerNip: Nip;
  readonly sellerName: string;
  readonly sellerCity: string;
  readonly sellerPostalCode: string;
  readonly sellerStreet: string;
  readonly items: readonly OrderItem[];
  readonly invoiceNumber: InvoiceNumber;
  readonly issueDate: string;
  readonly paymentMethod: "przelew" | "gotowka" | "karta" | "blik" | "inna";
  readonly paymentDueDate: string | undefined;
  readonly bankAccountIban: string | undefined;
}

export function buildAutoInvoice(req: OrderInvoiceRequest): KsefInvoice {
  const rule = AUTO_INVOICE_RULES[req.orderType];

  // Build line items with GTU codes assigned from product names
  let linePosition = 1;
  const lineItems: KsefLineItem[] = req.items.map((item) => {
    const stawkaPodatku = VAT_RATE_TO_STAWKA[item.vatRate];
    const wartoscNetto = asGrosze(item.quantity * item.unitPriceGrosze);

    // Compute VAT — apply Polish VAT rounding rules (Math.round to grosze)
    let kwotaPodatku: Grosze;
    if (item.vatRate === 0) {
      kwotaPodatku = asGrosze(0);
    } else {
      const vatFactor = item.vatRate / 100;
      kwotaPodatku = asGrosze(Math.round(wartoscNetto * vatFactor));
    }

    const wartoscBrutto = asGrosze(wartoscNetto + kwotaPodatku);
    const gtuKod = assignGtuCode(item.name);

    return {
      lp: linePosition++,
      nazwa: item.name,
      jednostkaMiary: "szt",
      ilosc: item.quantity,
      cenaJednostkowa: item.unitPriceGrosze,
      wartoscNetto,
      stawkaPodatku,
      kwotaPodatku,
      wartoscBrutto,
      ...(gtuKod !== undefined ? { gtuKod } : {}),
    };
  });

  const sumy = computeVatSummary(lineItems);

  const totalNetto = asGrosze(lineItems.reduce((acc, l) => acc + l.wartoscNetto, 0));
  const totalPodatek = asGrosze(lineItems.reduce((acc, l) => acc + l.kwotaPodatku, 0));
  const totalBrutto = asGrosze(lineItems.reduce((acc, l) => acc + l.wartoscBrutto, 0));

  // Determine JPK marker based on order type
  const jpkMarker: JpkV7Marker = rule.defaultJpkMarker;

  const invoice: KsefInvoice = {
    naglowek: {
      kodFormularza: "FA",
      wariantFormularza: "3",
      dataWytworzeniaFa: new Date().toISOString(),
      schemaVersion: "1-0E",
    },
    podmiot1: {
      nip: req.sellerNip,
      pelnanazwa: req.sellerName,
      adres: {
        kodKraju: "PL",
        miejscowosc: req.sellerCity,
        kodPocztowy: req.sellerPostalCode,
        ulica: req.sellerStreet,
      },
      rolaPodmiotu1: "Sprzedawca",
    },
    podmiot2: {
      ...(req.buyerNip !== undefined ? { nip: req.buyerNip } : {}),
      ...(req.buyerNipUe !== undefined ? { nipUe: req.buyerNipUe } : {}),
      ...(req.buyerCountryCode !== undefined ? { krajNabywcy: req.buyerCountryCode } : {}),
      pelnanazwa: req.buyerName,
      adres: {
        kodKraju: req.buyerCountryCode ?? "PL",
        miejscowosc: req.buyerCity,
        ...(req.buyerPostalCode !== undefined ? { kodPocztowy: req.buyerPostalCode } : {}),
        ...(req.buyerStreet !== undefined ? { ulica: req.buyerStreet } : {}),
      },
      rolaPodmiotu2: "Nabywca",
    },
    faktura: {
      rodzajFaktury: "VAT",
      numerFaktury: req.invoiceNumber,
      dataWystawienia: req.issueDate,
      waluta: "PLN",
      pozycje: lineItems,
      sumy,
      wartoscNetto: totalNetto,
      kwotaPodatku: totalPodatek,
      wartoscBrutto: totalBrutto,
      warunki: {
        metodaPlatnosci: req.paymentMethod,
        ...(req.paymentDueDate !== undefined ? { terminPlatnosci: req.paymentDueDate } : {}),
        ...(req.bankAccountIban !== undefined ? { numerRachunku: req.bankAccountIban } : {}),
      },
    },
    jpkMarker,
  };

  return invoice;
}

// ─────────────────────────────────────────────────────────────────────────────
// Determine order type from order context
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderContext {
  readonly buyerNip: string | undefined;
  readonly buyerCountryCode: string;
  readonly isDigitalService: boolean;
  readonly usesIoss: boolean;
}

export function determineOrderType(ctx: OrderContext): OrderType {
  // OSS/IOSS — cross-border B2C EU sales
  if (ctx.usesIoss) return "IOSS";
  if (ctx.buyerCountryCode !== "PL" && ctx.buyerNip === undefined) return "OSS";

  // B2B — buyer provided a NIP
  if (ctx.buyerNip !== undefined && ctx.buyerNip.length === 10) return "B2B";

  // Default — domestic B2C
  return "B2C";
}

// ─────────────────────────────────────────────────────────────────────────────
// InvoiceService — orchestrates invoice creation and persistence
// ─────────────────────────────────────────────────────────────────────────────

export class InvoiceService {
  private readonly _logger: Logger;

  constructor(logger: Logger) {
    this._logger = logger;
  }

  /**
   * Build and persist a draft invoice from an order.
   * Returns the invoice ID and the generated XML.
   */
  async createInvoiceFromOrder(
    req: OrderInvoiceRequest,
  ): Promise<{ invoiceId: string; xml: FA3InvoiceXml; jpkMarker: JpkV7Marker }> {
    const db = getDb();
    const rule = AUTO_INVOICE_RULES[req.orderType];

    // Check if this order type requires auto-generation
    if (!rule.autoGenerate && req.orderType !== "B2B") {
      this._logger.info(
        { orderId: req.orderId, orderType: req.orderType },
        "Order type does not require auto-invoice generation",
      );
    }

    const invoice = buildAutoInvoice(req);
    const xml = generateInvoiceXml(invoice);

    const gtuCodesInInvoice = invoice.faktura.pozycje
      .filter((item): item is KsefLineItem & { gtuKod: GtuCode } => item.gtuKod !== undefined)
      .map((item) => item.gtuKod);

    const uniqueGtuCodes = [...new Set(gtuCodesInInvoice)];

    const [inserted] = await db
      .insert(invoices)
      .values({
        userId: req.userId,
        invoiceNumber: req.invoiceNumber,
        invoiceType: "VAT",
        status: rule.ksefMandatory ? "pending_ksef" : "draft",
        xmlContent: xml.xmlContent,
        sellerNip: req.sellerNip,
        buyerNip: req.buyerNip ?? null,
        netAmount: invoice.faktura.wartoscNetto,
        vatAmount: invoice.faktura.kwotaPodatku,
        grossAmount: invoice.faktura.wartoscBrutto,
        jpkMarker: rule.defaultJpkMarker,
        gtuCodes: uniqueGtuCodes.length > 0 ? uniqueGtuCodes : null,
        paymentMethod: req.paymentMethod,
        issueDate: req.issueDate,
      })
      .returning({ id: invoices.id });

    if (inserted === undefined) {
      throw new Error("Failed to insert invoice into database");
    }

    this._logger.info(
      {
        invoiceId: inserted.id,
        invoiceNumber: req.invoiceNumber,
        orderType: req.orderType,
        jpkMarker: rule.defaultJpkMarker,
        gtuCodes: uniqueGtuCodes,
      },
      "Invoice created from order",
    );

    return {
      invoiceId: inserted.id,
      xml,
      jpkMarker: rule.defaultJpkMarker,
    };
  }

  /**
   * List all GTU code definitions for the UI reference.
   */
  getGtuCodeDescriptions(): typeof GTU_DESCRIPTIONS {
    return GTU_DESCRIPTIONS;
  }

  /** Generate a sequential invoice number in Polish format FV/YYYY/MM/NNNN */
  static buildInvoiceNumber(year: number, month: number, sequence: number): InvoiceNumber {
    const mm = String(month).padStart(2, "0");
    const seq = String(sequence).padStart(4, "0");
    return asInvoiceNumber(`FV/${year}/${mm}/${seq}`);
  }
}
