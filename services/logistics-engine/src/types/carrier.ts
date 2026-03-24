// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// Carrier domain types — strict TypeScript with branded IDs
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Branded primitives
// ─────────────────────────────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type TrackingNumber = Brand<string, "TrackingNumber">;
export type ShipmentId = Brand<string, "ShipmentId">;
export type PickupPointId = Brand<string, "PickupPointId">;
export type CarrierShipmentId = Brand<string, "CarrierShipmentId">;

export function asTrackingNumber(n: string): TrackingNumber {
  return n as TrackingNumber;
}
export function asShipmentId(id: string): ShipmentId {
  return id as ShipmentId;
}
export function asPickupPointId(id: string): PickupPointId {
  return id as PickupPointId;
}
export function asCarrierShipmentId(id: string): CarrierShipmentId {
  return id as CarrierShipmentId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carrier codes — all supported Polish carriers
// ─────────────────────────────────────────────────────────────────────────────

export type CarrierCode =
  | "inpost"
  | "dpd"
  | "dhl_domestic"
  | "dhl_express"
  | "orlen"
  | "gls"
  | "poczta_polska";

export const CARRIER_CODES = [
  "inpost",
  "dpd",
  "dhl_domestic",
  "dhl_express",
  "orlen",
  "gls",
  "poczta_polska",
] as const satisfies readonly CarrierCode[];

// ─────────────────────────────────────────────────────────────────────────────
// Label formats
// ─────────────────────────────────────────────────────────────────────────────

export type LabelFormat = "PDF" | "ZPL_200DPI" | "ZPL_300DPI" | "EPL" | "PNG";

export const LABEL_FORMATS = [
  "PDF",
  "ZPL_200DPI",
  "ZPL_300DPI",
  "EPL",
  "PNG",
] as const satisfies readonly LabelFormat[];

// ─────────────────────────────────────────────────────────────────────────────
// Parcel size / service type
// ─────────────────────────────────────────────────────────────────────────────

/** InPost Paczkomat size templates */
export type InPostParcelSize = "A" | "B" | "C";

/** Generic parcel dimensions in cm/kg */
export interface ParcelDimensions {
  readonly weightKg: number;
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Address types
// ─────────────────────────────────────────────────────────────────────────────

export interface Address {
  readonly firstName: string;
  readonly lastName: string;
  readonly company?: string | undefined;
  readonly street: string;
  readonly buildingNumber: string;
  readonly flatNumber?: string | undefined;
  readonly city: string;
  readonly postalCode: string;
  readonly countryCode: string; // ISO 3166-1 alpha-2
  readonly phone: string;
  readonly email: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COD — Cash on Delivery
// ─────────────────────────────────────────────────────────────────────────────

export interface CodConfig {
  readonly amount: number; // PLN, precision: 2dp
  readonly bankAccount: string; // IBAN PL
  readonly reference?: string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shipment request / response
// ─────────────────────────────────────────────────────────────────────────────

export interface ShipmentRequest {
  /** Internal EcomPilot order reference */
  readonly orderId: string;
  /** Sender details — defaults to org address if omitted */
  readonly sender?: Address | undefined;
  /** Recipient details */
  readonly receiver: Address;
  /** Target Paczkomat ID (InPost locker delivery) */
  readonly targetPickupPointId?: PickupPointId | undefined;
  /** Parcel dimensions — required for courier services */
  readonly dimensions?: ParcelDimensions | undefined;
  /** InPost template size (A/B/C) — overrides dimensions for locker services */
  readonly parcelSize?: InPostParcelSize | undefined;
  /** Cash on delivery configuration */
  readonly cod?: CodConfig | undefined;
  /** Insurance amount in PLN */
  readonly insuranceAmount?: number | undefined;
  /** Preferred label format */
  readonly labelFormat?: LabelFormat | undefined;
  /** Reference / comment visible on label */
  readonly reference?: string | undefined;
  /** Courier service type — e.g. "standard" | "express" | "weekend" */
  readonly serviceType?: string | undefined;
  /** True = generate return label alongside shipment */
  readonly includeReturn?: boolean | undefined;
  /** Whether this is a Paczkomat locker delivery (InPost) */
  readonly isLockerDelivery?: boolean | undefined;
  /** Custom metadata passthrough */
  readonly meta?: Record<string, string> | undefined;
}

export interface ShipmentResponse {
  /** Carrier-assigned shipment/parcel ID */
  readonly carrierShipmentId: CarrierShipmentId;
  /** Canonical tracking number */
  readonly trackingNumber: TrackingNumber;
  /** Current shipment status (carrier-native, normalised) */
  readonly status: NormalisedShipmentStatus;
  /** S3 URL populated after async label generation */
  readonly labelUrl?: string | undefined;
  /** Return label URL (if requested) */
  readonly returnLabelUrl?: string | undefined;
  /** Estimated delivery ISO 8601 datetime */
  readonly estimatedDeliveryAt?: string | undefined;
  /** Raw carrier API response — stored for audit */
  readonly rawResponse: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalised shipment status — maps all carrier statuses onto this enum
// ─────────────────────────────────────────────────────────────────────────────

export type NormalisedShipmentStatus =
  | "created"
  | "label_ready"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "ready_for_pickup"
  | "delivered"
  | "failed_delivery"
  | "returned"
  | "cancelled"
  | "exception";

// ─────────────────────────────────────────────────────────────────────────────
// Tracking event
// ─────────────────────────────────────────────────────────────────────────────

export interface TrackingEvent {
  /** Canonical normalised status */
  readonly status: NormalisedShipmentStatus;
  /** Raw carrier status string */
  readonly rawStatus: string;
  /** ISO 8601 event timestamp */
  readonly occurredAt: string;
  /** Human-readable location description */
  readonly location?: string | undefined;
  /** Event description in Polish (carrier provides PL locale) */
  readonly description?: string | undefined;
  /** Additional carrier-specific attributes */
  readonly attributes?: Record<string, string> | undefined;
}

export interface TrackingResult {
  readonly trackingNumber: TrackingNumber;
  readonly carrier: CarrierCode;
  readonly currentStatus: NormalisedShipmentStatus;
  readonly events: readonly TrackingEvent[];
  /** ISO 8601 datetime of last successful carrier API poll */
  readonly lastCheckedAt: string;
  /** Estimated delivery window */
  readonly estimatedDeliveryAt?: string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Label
// ─────────────────────────────────────────────────────────────────────────────

export interface Label {
  readonly trackingNumber: TrackingNumber;
  readonly format: LabelFormat;
  /** Raw label bytes (PDF / ZPL / EPL content) */
  readonly content: Buffer;
  /** MIME type e.g. "application/pdf" */
  readonly mimeType: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pickup point (Paczkomat / ORLEN / other lockers)
// ─────────────────────────────────────────────────────────────────────────────

export type PickupPointType =
  | "parcel_locker"
  | "parcel_locker_superpop"
  | "pop"  // Point of Pickup
  | "post_office";

export interface PickupPointOpeningHours {
  readonly weekdays: string; // e.g. "07:00-22:00"
  readonly saturday: string;
  readonly sunday: string;
}

export interface PickupPoint {
  readonly id: PickupPointId;
  readonly carrier: CarrierCode;
  readonly name: string;
  readonly type: PickupPointType;
  readonly address: {
    readonly street: string;
    readonly buildingNumber: string;
    readonly city: string;
    readonly postalCode: string;
    readonly province: string;
  };
  readonly location: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly openingHours?: PickupPointOpeningHours | undefined;
  readonly isActive: boolean;
  readonly amenities?: readonly string[] | undefined;
  readonly distanceKm?: number | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pickup scheduling
// ─────────────────────────────────────────────────────────────────────────────

export interface PickupScheduleRequest {
  readonly trackingNumbers: readonly TrackingNumber[];
  readonly pickupDate: string; // YYYY-MM-DD
  readonly pickupTimeFrom: string; // HH:MM
  readonly pickupTimeTo: string; // HH:MM
  readonly contactPhone: string;
  readonly additionalInfo?: string | undefined;
}

export interface PickupScheduleResponse {
  readonly confirmationNumber: string;
  readonly scheduledDate: string;
  readonly scheduledTimeFrom: string;
  readonly scheduledTimeTo: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Return shipment
// ─────────────────────────────────────────────────────────────────────────────

export interface ReturnRequest {
  readonly originalTrackingNumber: TrackingNumber;
  readonly orderId: string;
  readonly reason?: string | undefined;
  readonly labelFormat?: LabelFormat | undefined;
}

export interface ReturnResponse {
  readonly returnTrackingNumber: TrackingNumber;
  readonly qrCodeUrl?: string | undefined; // InPost Fast Return: label-free
  readonly labelUrl?: string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carrier capabilities
// ─────────────────────────────────────────────────────────────────────────────

export interface CarrierCapabilities {
  /** Carrier uses webhooks for push tracking updates */
  readonly hasWebhooks: boolean;
  /** Carrier offers pickup point (locker/PUDO) delivery */
  readonly hasPickupPoints: boolean;
  /** Carrier supports Cash on Delivery */
  readonly hasCOD: boolean;
  /** Maximum COD amount in PLN (0 if hasCOD=false) */
  readonly maxCODAmount: number;
  /** Maximum parcel weight in kg */
  readonly maxWeightKg: number;
  /** Maximum parcel dimensions in cm [L, W, H] */
  readonly maxDimensionsCm: readonly [number, number, number];
  /** Carrier supports return labels */
  readonly hasReturnLabels: boolean;
  /** Supported label output formats */
  readonly labelFormats: readonly LabelFormat[];
  /** API uses SOAP (affects connector implementation) */
  readonly isSOAP: boolean;
  /** Rate limit: requests per minute */
  readonly rateLimit?: number | undefined;
  /** True if carrier requires a sequential mutex (e.g. DPD) */
  readonly requiresMutex: boolean;
  /** True if connector is fully implemented */
  readonly isImplemented: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carrier connector interface — all connectors must implement this
// ─────────────────────────────────────────────────────────────────────────────

export interface CarrierConnector {
  readonly code: CarrierCode;
  readonly capabilities: CarrierCapabilities;

  /**
   * Create a new shipment.
   * For async carriers (InPost) the label may not be immediately available;
   * poll getShipment until status === "label_ready".
   */
  createShipment(request: ShipmentRequest): Promise<ShipmentResponse>;

  /**
   * Fetch current shipment data by carrier-assigned shipment ID.
   */
  getShipment(carrierShipmentId: CarrierShipmentId): Promise<ShipmentResponse>;

  /**
   * Cancel a shipment before pickup.
   */
  cancelShipment(carrierShipmentId: CarrierShipmentId): Promise<void>;

  /**
   * Download a single label.
   */
  getLabel(
    carrierShipmentId: CarrierShipmentId,
    format?: LabelFormat,
  ): Promise<Label>;

  /**
   * Download labels for multiple shipments in one call.
   * Returns a ZIP/PDF bundle depending on the carrier.
   */
  getBatchLabels(
    carrierShipmentIds: readonly CarrierShipmentId[],
    format?: LabelFormat,
  ): Promise<Label>;

  /**
   * Poll or fetch tracking events for a tracking number.
   * InPost: public endpoint, no auth required.
   */
  getTracking(trackingNumber: TrackingNumber): Promise<TrackingResult>;

  /**
   * Schedule a courier pickup window (optional — not all carriers).
   */
  schedulePickup?(request: PickupScheduleRequest): Promise<PickupScheduleResponse>;

  /**
   * Retrieve nearby pickup points / Paczkomaty (optional).
   */
  getPickupPoints?(params: {
    city?: string | undefined;
    postalCode?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    radiusKm?: number | undefined;
    type?: PickupPointType | undefined;
    limit?: number | undefined;
  }): Promise<readonly PickupPoint[]>;

  /**
   * Generate a return shipment (optional — Fast Returns for InPost).
   */
  createReturn?(request: ReturnRequest): Promise<ReturnResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carrier registry helpers
// ─────────────────────────────────────────────────────────────────────────────

export type CarrierRegistry = Partial<Record<CarrierCode, CarrierConnector>>;

/** Discriminated union for connector operation results */
export type ConnectorResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ConnectorError };

export type ConnectorErrorCode =
  | "CARRIER_API_ERROR"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "CIRCUIT_OPEN"
  | "TIMEOUT"
  | "UNSUPPORTED_OPERATION"
  | "LABEL_NOT_READY"
  | "VALIDATION_ERROR";

export class ConnectorError extends Error {
  constructor(
    public readonly code: ConnectorErrorCode,
    message: string,
    public readonly carrierCode: CarrierCode,
    public readonly statusCode?: number | undefined,
    public readonly rawError?: unknown,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}
