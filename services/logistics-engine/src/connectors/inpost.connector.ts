// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// InPost ShipX API v2 connector — FULL IMPLEMENTATION
//
// Documentation: https://api-shipx-pl.easypack24.net/v1/docs
// Auth: OAuth 2.0 Bearer token (static token in current ShipX implementation)
// Tracking: Public endpoint — no auth required
//
// Parcel sizes:
//   A — 8x38x64cm    max 25kg
//   B — 19x38x64cm   max 25kg
//   C — 41x38x64cm   max 25kg
//   Courier — max 350x240x240cm, 50kg
// COD: max 5 000 PLN
// Labels: PDF | ZPL 200/300 DPI | EPL
// Fast Returns: QR code, label-free
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger } from "pino";
import { BaseConnector } from "./base.connector.js";
import {
  ConnectorError,
  asCarrierShipmentId,
  asTrackingNumber,
  type CarrierCapabilities,
  type CarrierConnector,
  type CodConfig,
  type Label,
  type LabelFormat,
  type NormalisedShipmentStatus,
  type PickupPoint,
  type PickupPointType,
  type PickupScheduleRequest,
  type PickupScheduleResponse,
  type ReturnRequest,
  type ReturnResponse,
  type ShipmentRequest,
  type ShipmentResponse,
  type TrackingEvent,
  type TrackingResult,
  type CarrierShipmentId,
  type TrackingNumber,
} from "../types/carrier.js";

// ─────────────────────────────────────────────────────────────────────────────
// InPost ShipX API response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface InPostAddress {
  street: string;
  building_number: string;
  city: string;
  post_code: string;
  country_code: string;
}

interface InPostParcel {
  id: string;
  href: string;
  status: string;
  tracking_number: string;
  reference: string | null;
  is_cod: boolean;
  cod_amount: number | null;
  cod_currency: string | null;
  label_format?: string;
  created_at: string;
  updated_at: string;
  estimated_delivery_datetime: string | null;
  receiver: {
    name: string;
    company_name: string | null;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address?: InPostAddress;
    point?: {
      name: string;
    };
  };
  sender: {
    name: string;
    company_name: string | null;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: InPostAddress;
  };
  service?: string;
  parcels?: InPostParcelItem[];
}

interface InPostParcelItem {
  id: string;
  template?: string; // A|B|C for Paczkomat, "custom" for courier
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: string;
  };
  weight?: {
    amount: number;
    unit: string;
  };
  tracking_number: string;
}

interface InPostCreateParcelPayload {
  receiver: InPostReceiverPayload;
  sender: InPostSenderPayload;
  service: string;
  reference?: string;
  comments?: string;
  insurance?: { amount: number; currency: string } | undefined;
  cod?: InPostCodPayload | undefined;
  custom_attributes?: {
    sending_method?: string;
    target_point?: string;
  };
  parcels: InPostParcelSizePayload[];
}

interface InPostReceiverPayload {
  first_name: string;
  last_name: string;
  company_name?: string | undefined;
  email: string;
  phone: string;
  address?: InPostAddress | undefined;
  point?: { name: string } | undefined;
}

interface InPostSenderPayload {
  first_name: string;
  last_name: string;
  company_name?: string | undefined;
  email: string;
  phone: string;
  address: InPostAddress;
}

interface InPostCodPayload {
  amount: number;
  currency: string;
  bank_account_number: string;
}

type InPostParcelSizePayload =
  | { template: "A" | "B" | "C" }
  | {
      template: "custom";
      dimensions: { length: number; width: number; height: number; unit: "mm" };
      weight: { amount: number; unit: "kg" };
    };

interface InPostParcelsListResponse {
  href: string;
  count: number;
  page: number;
  per_page: number;
  items: InPostParcel[];
}

interface InPostTrackingResponse {
  tracking_number: string;
  tracking_details: InPostTrackingDetail[];
}

interface InPostTrackingDetail {
  status: string;
  datetime: string;
  point: string | null;
  description: string | null;
  description_en: string | null;
}

interface InPostPickupPointsResponse {
  href: string;
  count: number;
  page: number;
  per_page: number;
  items: InPostPickupPointItem[];
}

interface InPostPickupPointItem {
  name: string;
  href: string;
  id: string;
  status: string;
  address: {
    street: string;
    building_number: string;
    city: string;
    post_code: string;
    province: string;
    country_code: string;
  };
  location: { latitude: number; longitude: number };
  opening_hours: string | null;
  type: string[];
  distance: number | null;
  functions: string[];
}

interface InPostPickupScheduleResponse {
  id: string;
  href: string;
  status: string;
  requested_time: {
    date: string;
    time_from: string;
    time_to: string;
  };
  confirmation_number?: string;
}

interface InPostReturnPayload {
  reference?: string | undefined;
  custom_attributes?: { sending_method?: string } | undefined;
}

interface InPostReturnResponse {
  id: string;
  href: string;
  status: string;
  tracking_number: string;
  qr_code_url?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capabilities definition
// ─────────────────────────────────────────────────────────────────────────────

const INPOST_CAPABILITIES: CarrierCapabilities = {
  hasWebhooks: true,
  hasPickupPoints: true,
  hasCOD: true,
  maxCODAmount: 5_000,
  maxWeightKg: 50,
  maxDimensionsCm: [350, 240, 240],
  hasReturnLabels: true,
  labelFormats: ["PDF", "ZPL_200DPI", "ZPL_300DPI", "EPL"],
  isSOAP: false,
  rateLimit: undefined, // no documented hard limit
  requiresMutex: false,
  isImplemented: true,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Status mapping — InPost → Normalised
// ─────────────────────────────────────────────────────────────────────────────

const INPOST_STATUS_MAP: Readonly<Record<string, NormalisedShipmentStatus>> = {
  // Creation / label generation
  created: "created",
  offers_prepared: "created",
  offer_selected: "created",
  confirmed: "label_ready",
  prepared: "label_ready",

  // Transit
  dispatched_by_sender: "picked_up",
  collected_from_sender: "picked_up",
  taken_by_courier: "picked_up",
  adopted_at_source_branch: "in_transit",
  sent_from_source_branch: "in_transit",
  adopted_at_sorting_center: "in_transit",
  sent_from_sorting_center: "in_transit",
  adopted_at_target_branch: "in_transit",
  out_for_delivery: "out_for_delivery",

  // Locker states
  ready_to_pickup: "ready_for_pickup",
  pickup_reminder_sent: "ready_for_pickup",
  pickup_time_expired: "failed_delivery",

  // Delivery
  delivered: "delivered",
  picked_up_by_receiver: "delivered",

  // Failures / returns
  avizo: "failed_delivery",
  undelivered: "failed_delivery",
  not_neighborhood: "failed_delivery",
  returned_to_sender: "returned",
  return_pickup_confirmation_to_sender: "returned",
  canceled: "cancelled",
  claimed: "exception",
  unknown: "exception",
};

function mapInPostStatus(raw: string): NormalisedShipmentStatus {
  return INPOST_STATUS_MAP[raw.toLowerCase()] ?? "exception";
}

// ─────────────────────────────────────────────────────────────────────────────
// Label format mapping
// ─────────────────────────────────────────────────────────────────────────────

function mapLabelFormat(format: LabelFormat): string {
  switch (format) {
    case "PDF":
      return "pdf";
    case "ZPL_200DPI":
      return "zpl";
    case "ZPL_300DPI":
      return "zpl2";
    case "EPL":
      return "epl2";
    case "PNG":
      return "pdf"; // fallback — InPost does not support PNG
  }
}

function labelMimeType(format: LabelFormat): string {
  switch (format) {
    case "PDF":
      return "application/pdf";
    case "ZPL_200DPI":
    case "ZPL_300DPI":
      return "application/x-zpl";
    case "EPL":
      return "application/x-epl";
    case "PNG":
      return "image/png";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// InPost connector
// ─────────────────────────────────────────────────────────────────────────────

export interface InPostConnectorConfig {
  readonly apiToken: string;
  readonly organizationId: string;
  readonly baseUrl?: string;
  readonly cbFailureThreshold?: number;
  readonly cbRecoveryTimeoutMs?: number;
}

export class InPostConnector extends BaseConnector implements CarrierConnector {
  override readonly code = "inpost" as const;
  override readonly capabilities = INPOST_CAPABILITIES;

  private readonly apiToken: string;
  private readonly organizationId: string;
  private readonly baseUrl: string;

  /** Public tracking base URL — no auth needed */
  private static readonly TRACKING_BASE = "https://api-shipx-pl.easypack24.net";

  constructor(config: InPostConnectorConfig, logger: Logger) {
    super(
      "inpost",
      INPOST_CAPABILITIES,
      logger,
      {
        failureThreshold: config.cbFailureThreshold ?? 5,
        recoveryTimeoutMs: config.cbRecoveryTimeoutMs ?? 30_000,
        successThreshold: 2,
      },
    );
    this.apiToken = config.apiToken;
    this.organizationId = config.organizationId;
    this.baseUrl = config.baseUrl ?? "https://api-shipx-pl.easypack24.net";
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiToken}` };
  }

  private orgUrl(path: string): string {
    return `${this.baseUrl}/v1/organizations/${this.organizationId}${path}`;
  }

  // ── createShipment ─────────────────────────────────────────────────────────

  async createShipment(request: ShipmentRequest): Promise<ShipmentResponse> {
    return this.withResilience("createShipment", async () => {
      // Determine service type
      const isLocker = request.isLockerDelivery === true;
      const service = isLocker
        ? "inpost_locker_standard"
        : (request.serviceType ?? "inpost_courier_standard");

      // Build receiver
      const receiver: InPostReceiverPayload = {
        first_name: request.receiver.firstName,
        last_name: request.receiver.lastName,
        company_name: request.receiver.company,
        email: request.receiver.email,
        phone: sanitizePhone(request.receiver.phone),
      };

      if (isLocker && request.targetPickupPointId !== undefined) {
        receiver.point = { name: request.targetPickupPointId };
      } else {
        receiver.address = {
          street: request.receiver.street,
          building_number: request.receiver.buildingNumber,
          city: request.receiver.city,
          post_code: request.receiver.postalCode,
          country_code: request.receiver.countryCode.toUpperCase(),
        };
      }

      // Sender — required
      const senderAddr = request.sender;
      if (senderAddr === undefined) {
        throw new ConnectorError(
          "INVALID_REQUEST",
          "InPost requires an explicit sender address",
          "inpost",
        );
      }

      const sender: InPostSenderPayload = {
        first_name: senderAddr.firstName,
        last_name: senderAddr.lastName,
        company_name: senderAddr.company,
        email: senderAddr.email,
        phone: sanitizePhone(senderAddr.phone),
        address: {
          street: senderAddr.street,
          building_number: senderAddr.buildingNumber,
          city: senderAddr.city,
          post_code: senderAddr.postalCode,
          country_code: senderAddr.countryCode.toUpperCase(),
        },
      };

      // Build parcel size
      const parcels: InPostParcelSizePayload[] = buildParcelPayload(request);

      // COD
      let cod: InPostCodPayload | undefined;
      if (request.cod !== undefined) {
        validateCod(request.cod);
        cod = {
          amount: Math.round(request.cod.amount * 100) / 100,
          currency: "PLN",
          bank_account_number: request.cod.bankAccount,
        };
      }

      const payload: InPostCreateParcelPayload = {
        receiver,
        sender,
        service,
        parcels,
        ...(request.reference !== undefined && { reference: request.reference }),
        ...(request.cod !== undefined && { cod }),
        ...(request.insuranceAmount !== undefined && {
          insurance: { amount: request.insuranceAmount, currency: "PLN" },
        }),
        ...(isLocker &&
          request.targetPickupPointId !== undefined && {
            custom_attributes: {
              sending_method: "parcel_locker",
              target_point: request.targetPickupPointId,
            },
          }),
      };

      const response = await this.httpRequest<InPostParcel>({
        method: "POST",
        url: this.orgUrl("/parcels"),
        headers: this.authHeaders(),
        body: payload,
      });

      this.assertSuccessStatus(response.status, response.data, "createShipment");

      const parcel = response.data;

      this.logger.info(
        {
          carrierShipmentId: parcel.id,
          trackingNumber: parcel.tracking_number,
          status: parcel.status,
          orderId: request.orderId,
        },
        "InPost shipment created",
      );

      return {
        carrierShipmentId: asCarrierShipmentId(parcel.id),
        trackingNumber: asTrackingNumber(parcel.tracking_number),
        status: mapInPostStatus(parcel.status),
        estimatedDeliveryAt: parcel.estimated_delivery_datetime ?? undefined,
        rawResponse: parcel,
      };
    });
  }

  // ── getShipment ────────────────────────────────────────────────────────────

  async getShipment(carrierShipmentId: CarrierShipmentId): Promise<ShipmentResponse> {
    return this.withResilience("getShipment", async () => {
      const response = await this.httpRequest<InPostParcel>({
        method: "GET",
        url: this.orgUrl(`/parcels/${carrierShipmentId}`),
        headers: this.authHeaders(),
      });

      this.assertSuccessStatus(response.status, response.data, "getShipment");
      const parcel = response.data;

      return {
        carrierShipmentId: asCarrierShipmentId(parcel.id),
        trackingNumber: asTrackingNumber(parcel.tracking_number),
        status: mapInPostStatus(parcel.status),
        estimatedDeliveryAt: parcel.estimated_delivery_datetime ?? undefined,
        rawResponse: parcel,
      };
    });
  }

  // ── cancelShipment ─────────────────────────────────────────────────────────

  async cancelShipment(carrierShipmentId: CarrierShipmentId): Promise<void> {
    return this.withResilience("cancelShipment", async () => {
      const response = await this.httpRequest<unknown>({
        method: "DELETE",
        url: this.orgUrl(`/parcels/${carrierShipmentId}`),
        headers: this.authHeaders(),
      });

      // 204 No Content = success
      if (response.status !== 204 && response.status !== 200) {
        this.assertSuccessStatus(response.status, response.data, "cancelShipment");
      }

      this.logger.info({ carrierShipmentId }, "InPost shipment cancelled");
    });
  }

  // ── getLabel ───────────────────────────────────────────────────────────────

  async getLabel(
    carrierShipmentId: CarrierShipmentId,
    format: LabelFormat = "PDF",
  ): Promise<Label> {
    return this.withResilience("getLabel", async () => {
      const inpostFormat = mapLabelFormat(format);
      const url = this.orgUrl(
        `/parcels/${carrierShipmentId}/label?format=${inpostFormat}`,
      );

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: {
            ...this.authHeaders(),
            Accept: "application/pdf, application/x-zpl, application/x-epl, */*",
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          this.assertSuccessStatus(res.status, body, "getLabel");
        }

        const buffer = Buffer.from(await res.arrayBuffer());

        // Retrieve tracking number via getShipment for the label metadata
        const shipmentRes = await this.httpRequest<InPostParcel>({
          method: "GET",
          url: this.orgUrl(`/parcels/${carrierShipmentId}`),
          headers: this.authHeaders(),
        });
        const trackingNumber = shipmentRes.status < 300
          ? asTrackingNumber(shipmentRes.data.tracking_number)
          : asTrackingNumber(carrierShipmentId);

        this.logger.info(
          { carrierShipmentId, format, sizeBytes: buffer.length },
          "InPost label downloaded",
        );

        return {
          trackingNumber,
          format,
          content: buffer,
          mimeType: labelMimeType(format),
        };
      } finally {
        clearTimeout(timer);
      }
    });
  }

  // ── getBatchLabels ─────────────────────────────────────────────────────────

  async getBatchLabels(
    carrierShipmentIds: readonly CarrierShipmentId[],
    format: LabelFormat = "PDF",
  ): Promise<Label> {
    return this.withResilience("getBatchLabels", async () => {
      if (carrierShipmentIds.length === 0) {
        throw new ConnectorError(
          "INVALID_REQUEST",
          "getBatchLabels requires at least one shipment ID",
          "inpost",
        );
      }

      const inpostFormat = mapLabelFormat(format);
      const url = this.orgUrl("/parcels/labels");

      const response = await this.httpRequest<unknown>({
        method: "POST",
        url,
        headers: {
          ...this.authHeaders(),
          Accept: "application/pdf, application/x-zpl, */*",
        },
        body: {
          format: inpostFormat,
          parcel_ids: carrierShipmentIds,
        },
      });

      this.assertSuccessStatus(response.status, response.data, "getBatchLabels");

      // Response is raw binary content or base64 depending on format
      const content =
        response.data instanceof Buffer
          ? response.data
          : Buffer.from(
              typeof response.data === "string"
                ? response.data
                : JSON.stringify(response.data),
              "utf-8",
            );

      this.logger.info(
        {
          count: carrierShipmentIds.length,
          format,
          sizeBytes: content.length,
        },
        "InPost batch labels downloaded",
      );

      // For batch, use a composite tracking number placeholder
      return {
        trackingNumber: asTrackingNumber(`batch-${Date.now()}`),
        format,
        content,
        mimeType: format === "PDF" ? "application/pdf" : "application/zip",
      };
    });
  }

  // ── getTracking ────────────────────────────────────────────────────────────

  /**
   * Uses the public InPost tracking endpoint — no authentication required.
   * GET /v1/tracking/{tracking_number}
   */
  async getTracking(trackingNumber: TrackingNumber): Promise<TrackingResult> {
    return this.withResilience("getTracking", async () => {
      const url = `${InPostConnector.TRACKING_BASE}/v1/tracking/${trackingNumber}`;

      const response = await this.httpRequest<InPostTrackingResponse>({
        method: "GET",
        url,
        // No Authorization header — public endpoint
        headers: { Accept: "application/json" },
        timeoutMs: 10_000,
      });

      this.assertSuccessStatus(response.status, response.data, "getTracking");

      const raw = response.data;
      const events: TrackingEvent[] = raw.tracking_details.map((detail) => ({
        status: mapInPostStatus(detail.status),
        rawStatus: detail.status,
        occurredAt: detail.datetime,
        location: detail.point ?? undefined,
        description: detail.description ?? undefined,
      }));

      // Sort events descending by date to find current status
      const sorted = [...events].sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );

      const currentStatus: NormalisedShipmentStatus =
        sorted[0]?.status ?? "exception";

      this.logger.debug(
        {
          trackingNumber,
          currentStatus,
          eventCount: events.length,
        },
        "InPost tracking fetched",
      );

      return {
        trackingNumber,
        carrier: "inpost",
        currentStatus,
        events: sorted,
        lastCheckedAt: new Date().toISOString(),
      };
    });
  }

  // ── schedulePickup ─────────────────────────────────────────────────────────

  async schedulePickup(
    request: PickupScheduleRequest,
  ): Promise<PickupScheduleResponse> {
    return this.withResilience("schedulePickup", async () => {
      const response = await this.httpRequest<InPostPickupScheduleResponse>({
        method: "POST",
        url: this.orgUrl("/dispatch_orders"),
        headers: this.authHeaders(),
        body: {
          parcels: request.trackingNumbers.map((n) => ({ tracking_number: n })),
          pickup_date: request.pickupDate,
          time_from: request.pickupTimeFrom,
          time_to: request.pickupTimeTo,
          comments: request.additionalInfo,
          contact_phone: sanitizePhone(request.contactPhone),
        },
      });

      this.assertSuccessStatus(response.status, response.data, "schedulePickup");
      const data = response.data;

      this.logger.info(
        {
          confirmationId: data.id,
          pickupDate: data.requested_time?.date,
          parcelCount: request.trackingNumbers.length,
        },
        "InPost courier pickup scheduled",
      );

      return {
        confirmationNumber: data.confirmation_number ?? data.id,
        scheduledDate: data.requested_time?.date ?? request.pickupDate,
        scheduledTimeFrom: data.requested_time?.time_from ?? request.pickupTimeFrom,
        scheduledTimeTo: data.requested_time?.time_to ?? request.pickupTimeTo,
      };
    });
  }

  // ── getPickupPoints ────────────────────────────────────────────────────────

  async getPickupPoints(params: {
    city?: string | undefined;
    postalCode?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    radiusKm?: number | undefined;
    type?: PickupPointType | undefined;
    limit?: number | undefined;
  }): Promise<readonly PickupPoint[]> {
    return this.withResilience("getPickupPoints", async () => {
      const queryParams = new URLSearchParams();

      if (params.city !== undefined) queryParams.set("city", params.city);
      if (params.postalCode !== undefined) queryParams.set("post_code", params.postalCode);
      if (params.latitude !== undefined) queryParams.set("relative_point", `${params.latitude},${params.longitude ?? 0}`);
      if (params.radiusKm !== undefined) queryParams.set("max_distance", String(params.radiusKm * 1000)); // to metres
      if (params.limit !== undefined) queryParams.set("per_page", String(params.limit));

      // InPost type filter — map generic type to InPost type
      if (params.type !== undefined) {
        queryParams.set("type", mapPickupPointType(params.type));
      }

      const url = `${this.baseUrl}/v1/points?${queryParams.toString()}`;

      const response = await this.httpRequest<InPostPickupPointsResponse>({
        method: "GET",
        url,
        headers: { Accept: "application/json" }, // public endpoint
        timeoutMs: 10_000,
      });

      this.assertSuccessStatus(response.status, response.data, "getPickupPoints");

      return response.data.items.map(mapPickupPoint);
    });
  }

  // ── createReturn ───────────────────────────────────────────────────────────

  /**
   * InPost Fast Returns — generates a QR code for label-free returns.
   * The customer shows the QR at any Paczkomat / InPost point.
   */
  async createReturn(request: ReturnRequest): Promise<ReturnResponse> {
    return this.withResilience("createReturn", async () => {
      // First resolve the parcel ID from tracking number
      const searchResponse = await this.httpRequest<InPostParcelsListResponse>({
        method: "GET",
        url: this.orgUrl(
          `/parcels?tracking_number=${request.originalTrackingNumber}`,
        ),
        headers: this.authHeaders(),
      });

      this.assertSuccessStatus(
        searchResponse.status,
        searchResponse.data,
        "createReturn:search",
      );

      const parcels = searchResponse.data.items;
      if (parcels.length === 0) {
        throw new ConnectorError(
          "NOT_FOUND",
          `No InPost parcel found for tracking number ${request.originalTrackingNumber}`,
          "inpost",
          404,
        );
      }

      const parcelId = parcels[0]?.id;
      if (parcelId === undefined) {
        throw new ConnectorError("NOT_FOUND", "Parcel ID missing in response", "inpost");
      }

      const returnPayload: InPostReturnPayload = {
        ...(request.reason !== undefined && { reference: request.reason }),
        custom_attributes: { sending_method: "qr_code" },
      };

      const response = await this.httpRequest<InPostReturnResponse>({
        method: "POST",
        url: this.orgUrl(`/parcels/${parcelId}/returns`),
        headers: this.authHeaders(),
        body: returnPayload,
      });

      this.assertSuccessStatus(response.status, response.data, "createReturn");
      const data = response.data;

      this.logger.info(
        {
          returnTrackingNumber: data.tracking_number,
          hasQrCode: data.qr_code_url !== null && data.qr_code_url !== undefined,
          originalTrackingNumber: request.originalTrackingNumber,
          orderId: request.orderId,
        },
        "InPost Fast Return created",
      );

      return {
        returnTrackingNumber: asTrackingNumber(data.tracking_number),
        qrCodeUrl: data.qr_code_url ?? undefined,
      };
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level helpers
// ─────────────────────────────────────────────────────────────────────────────

function sanitizePhone(phone: string): string {
  // InPost expects digits only, no country prefix for PL numbers
  return phone.replace(/\D/g, "").replace(/^48/, "");
}

function validateCod(cod: CodConfig): void {
  if (cod.amount > 5_000) {
    throw new ConnectorError(
      "INVALID_REQUEST",
      `InPost COD amount cannot exceed 5000 PLN (got: ${cod.amount})`,
      "inpost",
    );
  }
  if (cod.amount <= 0) {
    throw new ConnectorError(
      "INVALID_REQUEST",
      "InPost COD amount must be positive",
      "inpost",
    );
  }
}

function buildParcelPayload(request: ShipmentRequest): InPostParcelSizePayload[] {
  // Template (A/B/C) takes priority
  if (request.parcelSize !== undefined) {
    return [{ template: request.parcelSize }];
  }

  // Custom dimensions for courier
  if (request.dimensions !== undefined) {
    const d = request.dimensions;
    return [
      {
        template: "custom",
        dimensions: {
          length: Math.ceil(d.lengthCm * 10), // cm → mm
          width: Math.ceil(d.widthCm * 10),
          height: Math.ceil(d.heightCm * 10),
          unit: "mm",
        },
        weight: { amount: d.weightKg, unit: "kg" },
      },
    ];
  }

  // Default to size B if neither provided
  return [{ template: "B" }];
}

function mapPickupPointType(type: PickupPointType): string {
  switch (type) {
    case "parcel_locker":
      return "parcel_locker";
    case "parcel_locker_superpop":
      return "parcel_locker_superpop";
    case "pop":
      return "pop";
    case "post_office":
      return "pop"; // InPost maps post offices as POPs
  }
}

function mapPickupPoint(item: InPostPickupPointItem): PickupPoint {
  return {
    id: item.name as PickupPoint["id"],
    carrier: "inpost",
    name: item.name,
    type: inferPickupPointType(item.type),
    address: {
      street: item.address.street,
      buildingNumber: item.address.building_number,
      city: item.address.city,
      postalCode: item.address.post_code,
      province: item.address.province,
    },
    location: {
      latitude: item.location.latitude,
      longitude: item.location.longitude,
    },
    isActive: item.status === "Operating",
    distanceKm:
      item.distance !== null ? Math.round(item.distance / 100) / 10 : undefined,
  };
}

function inferPickupPointType(types: string[]): PickupPointType {
  if (types.includes("parcel_locker_superpop")) return "parcel_locker_superpop";
  if (types.includes("parcel_locker")) return "parcel_locker";
  if (types.includes("pop")) return "pop";
  return "parcel_locker";
}
