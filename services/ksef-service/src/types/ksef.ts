// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ksef-service: KSeF domain types
// Full TypeScript type definitions for KSeF 2.0 / Schema FA(3) compliance
// Mandatory e-invoicing in Poland from April 1, 2026
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Branded types for domain safety
// ─────────────────────────────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, TBrand extends string> = T & { readonly [__brand]: TBrand };

/** Validated Polish 10-digit NIP (tax identification number) */
export type Nip = Brand<string, "Nip">;

/** KSeF-assigned invoice reference number */
export type KsefReferenceNumber = Brand<string, "KsefReferenceNumber">;

/** Polish invoice number in the seller's internal numbering series */
export type InvoiceNumber = Brand<string, "InvoiceNumber">;

/** Amount in grosze (1 PLN = 100 grosze) — integer, never floating point */
export type Grosze = Brand<number, "Grosze">;

export function asNip(value: string): Nip {
  return value as Nip;
}

export function asKsefReferenceNumber(value: string): KsefReferenceNumber {
  return value as KsefReferenceNumber;
}

export function asInvoiceNumber(value: string): InvoiceNumber {
  return value as InvoiceNumber;
}

export function asGrosze(value: number): Grosze {
  return value as Grosze;
}

// ─────────────────────────────────────────────────────────────────────────────
// KSeF environment
// ─────────────────────────────────────────────────────────────────────────────

export type KsefEnvironment = "test" | "demo" | "production";

export const KSEF_API_URLS = {
  test: "https://api-test.ksef.mf.gov.pl/v2",
  demo: "https://api-demo.ksef.mf.gov.pl/v2",
  production: "https://api.ksef.mf.gov.pl/v2",
} as const satisfies Record<KsefEnvironment, string>;

// ─────────────────────────────────────────────────────────────────────────────
// Invoice types (FA(3) schema)
// VAT  — standard VAT invoice
// KOR  — corrective invoice (korekta)
// ZAL  — advance/prepayment invoice (zaliczkowa)
// ROZ  — settlement invoice (rozliczeniowa) for advances
// UPR  — simplified invoice (uproszczona) for transactions up to 450 PLN
// ─────────────────────────────────────────────────────────────────────────────

export type KsefInvoiceType = "VAT" | "KOR" | "ZAL" | "ROZ" | "UPR";

export const KSEF_INVOICE_TYPES = ["VAT", "KOR", "ZAL", "ROZ", "UPR"] as const satisfies readonly KsefInvoiceType[];

// ─────────────────────────────────────────────────────────────────────────────
// VAT rate codes — stawkaPodatku in FA(3)
// ─────────────────────────────────────────────────────────────────────────────

export type VatRate = 23 | 8 | 5 | 0;

/** Tax rate code as it appears in the XML schema */
export type StawkaPodatku = "VAT23" | "VAT8" | "VAT5" | "VAT0" | "ZW" | "NP";

export const VAT_RATE_TO_STAWKA = {
  23: "VAT23",
  8: "VAT8",
  5: "VAT5",
  0: "VAT0",
} as const satisfies Record<VatRate, StawkaPodatku>;

// ─────────────────────────────────────────────────────────────────────────────
// GTU codes (Grupy Towarów i Usług) — mandatory for certain product categories
// GTU_06 — electronic devices (RTV, AGD, computers, phones, tablets)
// GTU_12 — digital services (software, streaming, SaaS, apps)
// GTU_13 — transport and warehousing services
// ─────────────────────────────────────────────────────────────────────────────

export type GtuCode = "GTU_01" | "GTU_02" | "GTU_03" | "GTU_04" | "GTU_05"
  | "GTU_06" | "GTU_07" | "GTU_08" | "GTU_09" | "GTU_10"
  | "GTU_11" | "GTU_12" | "GTU_13";

/** Subset of GTU codes relevant to e-commerce */
export type EcommerceGtuCode = "GTU_06" | "GTU_12" | "GTU_13";

export const GTU_DESCRIPTIONS: Record<EcommerceGtuCode, string> = {
  GTU_06: "Electronic devices (RTV/AGD, computers, phones, tablets, other electronics)",
  GTU_12: "Digital services (software, apps, SaaS, streaming, e-books, games)",
  GTU_13: "Transport and warehousing services",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// JPK_V7 markers
// NrKSeF — invoice accepted and assigned KSeF reference number
// OFF    — KSeF offline mode: invoice issued when KSeF system was unavailable
// BFK    — excluded from KSeF obligation (e.g. B2C without request, OSS/IOSS)
// DI     — digital services subject to OSS/IOSS rules
// ─────────────────────────────────────────────────────────────────────────────

export type JpkV7Marker = "NrKSeF" | "OFF" | "BFK" | "DI";

// ─────────────────────────────────────────────────────────────────────────────
// Payment method (metoda platnosci)
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentMethod = "przelew" | "gotowka" | "karta" | "blik" | "inna";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  przelew: "Bank transfer",
  gotowka: "Cash",
  karta: "Card",
  blik: "BLIK",
  inna: "Other",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// FA(3) Address type — adres podmiotu
// ─────────────────────────────────────────────────────────────────────────────

export interface KsefAddress {
  readonly kodKraju: string;          // ISO 3166-1 alpha-2, e.g. "PL"
  readonly miejscowosc: string;       // city
  readonly kodPocztowy?: string;      // postal code (optional for foreign addresses)
  readonly ulica?: string;            // street name (optional)
  readonly nrDomu?: string;           // building number (optional)
  readonly nrLokalu?: string;         // flat/suite number (optional)
}

// ─────────────────────────────────────────────────────────────────────────────
// FA(3) Party (podmiot) — seller or buyer
// ─────────────────────────────────────────────────────────────────────────────

export interface KsefParty {
  /** NIP — required for Polish VAT payers */
  readonly nip?: Nip;
  /** EU VAT number for EU buyers */
  readonly nipUe?: string;
  /** Buyer country code for OSS/IOSS */
  readonly krajNabywcy?: string;
  readonly pelnanazwa: string;        // full legal name
  readonly adres: KsefAddress;
  readonly email?: string;
  readonly telefon?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FA(3) Line item (pozycja faktury)
// ─────────────────────────────────────────────────────────────────────────────

export interface KsefLineItem {
  readonly lp: number;                    // line position (1-based)
  readonly nazwa: string;                 // product/service name
  readonly jednostkaMiary?: string;       // unit of measure (e.g. "szt", "kg", "h")
  readonly ilosc: number;                 // quantity
  readonly cenaJednostkowa: Grosze;       // unit net price in grosze
  readonly wartoscNetto: Grosze;          // line net value in grosze
  readonly stawkaPodatku: StawkaPodatku;  // VAT rate code
  readonly kwotaPodatku: Grosze;          // VAT amount in grosze
  readonly wartoscBrutto: Grosze;         // line gross value in grosze
  readonly gtuKod?: GtuCode;              // GTU classification code
  readonly pkwiu?: string;               // Polish Classification of Products and Services
  readonly cn?: string;                  // Combined Nomenclature (customs) code
}

// ─────────────────────────────────────────────────────────────────────────────
// FA(3) Tax summary per VAT rate (sumy podatku)
// ─────────────────────────────────────────────────────────────────────────────

export interface KsefVatSummary {
  readonly stawkaPodatku: StawkaPodatku;
  readonly wartoscNetto: Grosze;
  readonly kwotaPodatku: Grosze;
  readonly wartoscBrutto: Grosze;
}

// ─────────────────────────────────────────────────────────────────────────────
// FA(3) Payment terms (warunki platnosci)
// ─────────────────────────────────────────────────────────────────────────────

export interface KsefPaymentTerms {
  readonly metodaPlatnosci: PaymentMethod;
  readonly terminPlatnosci?: string;      // ISO 8601 date
  readonly numerRachunku?: string;        // IBAN for bank transfer
  readonly nazwaKonta?: string;           // bank account holder name
}

// ─────────────────────────────────────────────────────────────────────────────
// Main KSeF invoice structure — maps to FA(3) Schema template #13775
// ─────────────────────────────────────────────────────────────────────────────

export interface KsefInvoice {
  // naglowek — invoice header
  readonly naglowek: {
    readonly kodFormularza: "FA";
    readonly wariantFormularza: "3";
    readonly dataWytworzeniaFa: string;   // ISO 8601 datetime of XML generation
    readonly schemaVersion: "1-0E";
  };

  // podmiot1 — seller (mandatory)
  readonly podmiot1: KsefParty & {
    readonly nip: Nip;                    // seller NIP always required
    readonly rolaPodmiotu1: "Sprzedawca";
  };

  // podmiot2 — buyer
  readonly podmiot2: KsefParty & {
    readonly rolaPodmiotu2: "Nabywca";
  };

  // faktura — invoice body
  readonly faktura: {
    readonly rodzajFaktury: KsefInvoiceType;
    readonly numerFaktury: InvoiceNumber;
    readonly dataWystawienia: string;     // ISO 8601 date (YYYY-MM-DD)
    readonly dataSprzedazy?: string;      // sale date if different from issue date
    readonly waluta: "PLN";              // only PLN supported in current KSeF 2.0

    readonly pozycje: readonly KsefLineItem[];
    readonly sumy: readonly KsefVatSummary[];

    readonly wartoscNetto: Grosze;        // total net value
    readonly kwotaPodatku: Grosze;        // total VAT
    readonly wartoscBrutto: Grosze;       // total gross value

    readonly warunki: KsefPaymentTerms;

    // Optional fields
    readonly notatkiDodatkowe?: string;  // additional notes (max 500 chars)
    readonly nrKsefFaktury?: string;     // reference to original invoice (for corrections)
  };

  // JPK_V7 marker — set after submission or in offline/excluded cases
  readonly jpkMarker?: JpkV7Marker;
}

// ─────────────────────────────────────────────────────────────────────────────
// FA(3) XML structure — full XML envelope for KSeF API submission
// Namespace: http://crd.gov.pl/wzor/2023/06/29/12648/
// ─────────────────────────────────────────────────────────────────────────────

export interface FA3InvoiceXml {
  /** Raw XML string conforming to FA(3) schema template #13775 */
  readonly xmlContent: string;
  /** SHA-256 hex digest of xmlContent (for integrity verification) */
  readonly sha256: string;
  /** Byte size of the UTF-8 encoded XML */
  readonly byteSize: number;
  /** Timestamp when the XML was generated */
  readonly generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// KSeF authentication types — Challenge-Response flow
// ─────────────────────────────────────────────────────────────────────────────

/** Step 1: POST /auth/challenge — returns a challenge to encrypt */
export interface KsefAuthChallenge {
  readonly referenceNumber: string;
  /** Base64-encoded challenge bytes to encrypt with AES-256 */
  readonly challenge: string;
  readonly timestamp: string;
}

/** Step 2: POST /auth/token/redeem — exchange encrypted challenge for a token */
export interface KsefAuthTokenRequest {
  readonly referenceNumber: string;
  /** AES-256-ECB encrypted challenge, Base64-encoded */
  readonly encryptedChallenge: string;
  readonly nip: Nip;
}

/** Step 3: GET /auth/{referenceNumber} — poll until token is issued */
export interface KsefAuthToken {
  readonly referenceNumber: string;
  readonly sessionToken: string;
  readonly expiresAt: string;
  readonly nip: Nip;
}

export type KsefAuthStatus =
  | { readonly status: "pending"; readonly referenceNumber: string }
  | { readonly status: "active"; readonly token: KsefAuthToken }
  | { readonly status: "expired"; readonly referenceNumber: string }
  | { readonly status: "error"; readonly errorCode: string; readonly errorMessage: string };

// ─────────────────────────────────────────────────────────────────────────────
// KSeF session types
// ─────────────────────────────────────────────────────────────────────────────

export type KsefSessionType = "interactive" | "batch";

export type KsefSessionStatus = "opening" | "active" | "closing" | "closed" | "error";

export interface KsefSession {
  readonly referenceNumber: string;
  readonly sessionType: KsefSessionType;
  readonly status: KsefSessionStatus;
  readonly environment: KsefEnvironment;
  readonly nip: Nip;
  readonly openedAt: string;
  readonly closedAt?: string;
  readonly sessionToken: string;
  readonly expiresAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice submission types
// ─────────────────────────────────────────────────────────────────────────────

export interface KsefSubmissionResult {
  /** KSeF-assigned unique reference number for this invoice */
  readonly ksefReferenceNumber: KsefReferenceNumber;
  /** ISO 8601 datetime when KSeF accepted and assigned the reference number */
  readonly ksefTimestamp: string;
  /** Submission processing reference (for UPO retrieval) */
  readonly processingCode: number;
  readonly processingDescription: string;
  /** Session reference number used for submission */
  readonly sessionReferenceNumber: string;
}

export interface KsefBatchSubmissionResult {
  readonly batchReferenceNumber: string;
  readonly invoicesSubmitted: number;
  readonly status: "accepted" | "processing" | "rejected";
  readonly acceptedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// UPO — Urzędowe Potwierdzenie Odbioru (Official Receipt Confirmation)
// ─────────────────────────────────────────────────────────────────────────────

export interface KsefUpo {
  readonly ksefReferenceNumber: KsefReferenceNumber;
  readonly invoiceNumber: InvoiceNumber;
  readonly nip: Nip;
  /** Base64-encoded UPO PDF or XML document */
  readonly upoContent: string;
  readonly upoContentType: "application/pdf" | "application/xml";
  readonly issuedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch ZIP archive structure (for batch session submission)
// ─────────────────────────────────────────────────────────────────────────────

export interface KsefBatchPackage {
  /** AES-256 encrypted ZIP archive, Base64-encoded */
  readonly encryptedZip: string;
  /** AES-256 key encrypted with KSeF public RSA key, Base64-encoded */
  readonly encryptedKey: string;
  /** IV used for AES encryption, Base64-encoded */
  readonly iv: string;
  readonly invoiceCount: number;
  readonly packageHash: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-invoice rules for e-commerce orders
// ─────────────────────────────────────────────────────────────────────────────

export type OrderType = "B2B" | "B2C" | "OSS" | "IOSS";

export interface AutoInvoiceRule {
  readonly orderType: OrderType;
  /** Whether KSeF submission is mandatory for this order type */
  readonly ksefMandatory: boolean;
  /** Default JPK_V7 marker before submission */
  readonly defaultJpkMarker: JpkV7Marker;
  /** Whether to auto-generate invoice without buyer request (B2C) */
  readonly autoGenerate: boolean;
}

export const AUTO_INVOICE_RULES = {
  B2B: {
    orderType: "B2B",
    ksefMandatory: true,
    defaultJpkMarker: "NrKSeF",
    autoGenerate: true,
  },
  B2C: {
    orderType: "B2C",
    ksefMandatory: false,
    defaultJpkMarker: "BFK",
    autoGenerate: false,
  },
  OSS: {
    orderType: "OSS",
    ksefMandatory: false,
    defaultJpkMarker: "BFK",
    autoGenerate: false,
  },
  IOSS: {
    orderType: "IOSS",
    ksefMandatory: false,
    defaultJpkMarker: "BFK",
    autoGenerate: false,
  },
} as const satisfies Record<OrderType, AutoInvoiceRule>;

// ─────────────────────────────────────────────────────────────────────────────
// KSeF API error response
// ─────────────────────────────────────────────────────────────────────────────

export interface KsefApiError {
  readonly code: string;
  readonly message: string;
  readonly timestamp: string;
  readonly referenceNumber?: string;
}

export class KsefError extends Error {
  readonly code: string;
  readonly ksefTimestamp: string;
  readonly referenceNumber: string | undefined;

  constructor(error: KsefApiError) {
    super(`KSeF API error [${error.code}]: ${error.message}`);
    this.name = "KsefError";
    this.code = error.code;
    this.ksefTimestamp = error.timestamp;
    this.referenceNumber = error.referenceNumber;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

export function isKsefInvoiceType(value: unknown): value is KsefInvoiceType {
  return typeof value === "string" && (KSEF_INVOICE_TYPES as readonly string[]).includes(value);
}

export function isGtuCode(value: unknown): value is GtuCode {
  const codes = [
    "GTU_01", "GTU_02", "GTU_03", "GTU_04", "GTU_05",
    "GTU_06", "GTU_07", "GTU_08", "GTU_09", "GTU_10",
    "GTU_11", "GTU_12", "GTU_13",
  ];
  return typeof value === "string" && codes.includes(value);
}

export function isEcommerceGtuCode(value: unknown): value is EcommerceGtuCode {
  return typeof value === "string" && ["GTU_06", "GTU_12", "GTU_13"].includes(value);
}

export function isVatRate(value: unknown): value is VatRate {
  return typeof value === "number" && [23, 8, 5, 0].includes(value);
}
