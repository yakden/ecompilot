// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// DHL connector — STUB (two separate APIs)
//
// IMPLEMENTATION NOTES — TWO DISTINCT DHL PRODUCTS:
//
// ─── Product A: DHL24 Domestic (Polska) ─────────────────────────────────────
//   API type: SOAP only
//   WSDL (sandbox): https://dhl24.com.pl/webapi2/provider/service.html?ws=1
//   WSDL (prod):    https://dhl24.com.pl/webapi2/provider/service.html?ws=1
//   Auth: Username/Password in SOAP header (WSS UsernameToken)
//   Key ops:
//     createShipments             → createShipment
//     getShipmentData             → getShipment, getTracking
//     getLabels / generateBill    → getLabel (returns base64 PDF)
//     bookCourier                 → schedulePickup
//   Tracking: SOAP only (no public REST endpoint for DHL24)
//   COD: supported, max 10 000 PLN
//   ServiceType: AH (at-home), EX (express), DW (evening)
//
// ─── Product B: MyDHL Express (international / premium) ─────────────────────
//   API type: REST / JSON
//   Base URL: https://express.api.dhl.com/mydhlapi
//   Auth: HTTP Basic (API key + secret), X-Partner-ID header
//   Docs: https://developer.dhl.com/api-reference/dhl-express-mydhl-api
//   Key endpoints:
//     POST /shipments                → createShipment
//     GET  /shipments/{shipmentId}   → getShipment
//     POST /shipments/{id}/cancel    → cancelShipment
//     GET  /shipments/{id}/label     → getLabel
//     GET  /tracking?shipmentTrackingNumber=  → getTracking
//     POST /pickup-requests          → schedulePickup
//   Webhooks: available (DHL Connect webhook service)
//   Service products: P (Express Worldwide), N (Express 9:00), etc.
//   Max weight: 300 kg per shipment piece
//
// IMPORTANT DISTINCTION:
//   DHL24 is the main domestic carrier used by Polish e-commerce.
//   MyDHL Express is used for international B2B shipments.
//   Each requires a separate account and credentials.
//   This connector stub handles both under a single interface but
//   routes to the correct backend based on `serviceType` in ShipmentRequest.
//
// References:
//   https://developer.dhl.com/
//   https://dhl24.com.pl/webapi2/
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger } from "pino";
import { BaseConnector } from "./base.connector.js";
import {
  ConnectorError,
  type CarrierCapabilities,
  type CarrierConnector,
  type CarrierShipmentId,
  type Label,
  type LabelFormat,
  type PickupPoint,
  type PickupScheduleRequest,
  type PickupScheduleResponse,
  type ShipmentRequest,
  type ShipmentResponse,
  type TrackingNumber,
  type TrackingResult,
} from "../types/carrier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Capabilities
// ─────────────────────────────────────────────────────────────────────────────

const DHL_DOMESTIC_CAPABILITIES: CarrierCapabilities = {
  hasWebhooks: false,
  hasPickupPoints: false,
  hasCOD: true,
  maxCODAmount: 10_000,
  maxWeightKg: 30,
  maxDimensionsCm: [240, 120, 120],
  hasReturnLabels: true,
  labelFormats: ["PDF"],
  isSOAP: true,
  rateLimit: undefined,
  requiresMutex: false,
  isImplemented: false,
} as const;

const DHL_EXPRESS_CAPABILITIES: CarrierCapabilities = {
  hasWebhooks: true,
  hasPickupPoints: false,
  hasCOD: false,
  maxCODAmount: 0,
  maxWeightKg: 300,
  maxDimensionsCm: [300, 300, 300],
  hasReturnLabels: true,
  labelFormats: ["PDF", "ZPL_300DPI"],
  isSOAP: false,
  rateLimit: undefined,
  requiresMutex: false,
  isImplemented: false,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export interface DhlConnectorConfig {
  // DHL24 Domestic
  readonly dhl24AccountId?: string | undefined;
  readonly dhl24Login?: string | undefined;
  readonly dhl24Password?: string | undefined;
  // MyDHL Express
  readonly expressApiKey?: string | undefined;
  readonly expressApiSecret?: string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// DHL Domestic stub
// ─────────────────────────────────────────────────────────────────────────────

export class DhlDomesticConnector extends BaseConnector implements CarrierConnector {
  override readonly code = "dhl_domestic" as const;
  override readonly capabilities = DHL_DOMESTIC_CAPABILITIES;

  constructor(
    private readonly config: DhlConnectorConfig,
    logger: Logger,
  ) {
    super("dhl_domestic", DHL_DOMESTIC_CAPABILITIES, logger);
    void this.config;
  }

  async createShipment(_request: ShipmentRequest): Promise<ShipmentResponse> {
    throw new ConnectorError(
      "UNSUPPORTED_OPERATION",
      "DHL24 Domestic connector is not yet implemented (SOAP — see connector stub)",
      "dhl_domestic",
    );
  }

  async getShipment(_id: CarrierShipmentId): Promise<ShipmentResponse> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "DHL24 Domestic connector is not yet implemented", "dhl_domestic");
  }

  async cancelShipment(_id: CarrierShipmentId): Promise<void> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "DHL24 Domestic connector is not yet implemented", "dhl_domestic");
  }

  async getLabel(_id: CarrierShipmentId, _format?: LabelFormat): Promise<Label> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "DHL24 Domestic connector is not yet implemented", "dhl_domestic");
  }

  async getBatchLabels(
    _ids: readonly CarrierShipmentId[],
    _format?: LabelFormat,
  ): Promise<Label> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "DHL24 Domestic connector is not yet implemented", "dhl_domestic");
  }

  async getTracking(_trackingNumber: TrackingNumber): Promise<TrackingResult> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "DHL24 Domestic connector is not yet implemented", "dhl_domestic");
  }

  async schedulePickup(_request: PickupScheduleRequest): Promise<PickupScheduleResponse> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "DHL24 Domestic connector is not yet implemented", "dhl_domestic");
  }

  async getPickupPoints(_params: {
    city?: string | undefined;
    postalCode?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
  }): Promise<readonly PickupPoint[]> {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DHL Express (MyDHL API) stub
// ─────────────────────────────────────────────────────────────────────────────

export class DhlExpressConnector extends BaseConnector implements CarrierConnector {
  override readonly code = "dhl_express" as const;
  override readonly capabilities = DHL_EXPRESS_CAPABILITIES;

  constructor(
    private readonly config: DhlConnectorConfig,
    logger: Logger,
  ) {
    super("dhl_express", DHL_EXPRESS_CAPABILITIES, logger);
    void this.config;
  }

  async createShipment(_request: ShipmentRequest): Promise<ShipmentResponse> {
    throw new ConnectorError(
      "UNSUPPORTED_OPERATION",
      "MyDHL Express connector is not yet implemented (REST — see connector stub)",
      "dhl_express",
    );
  }

  async getShipment(_id: CarrierShipmentId): Promise<ShipmentResponse> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "MyDHL Express connector is not yet implemented", "dhl_express");
  }

  async cancelShipment(_id: CarrierShipmentId): Promise<void> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "MyDHL Express connector is not yet implemented", "dhl_express");
  }

  async getLabel(_id: CarrierShipmentId, _format?: LabelFormat): Promise<Label> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "MyDHL Express connector is not yet implemented", "dhl_express");
  }

  async getBatchLabels(
    _ids: readonly CarrierShipmentId[],
    _format?: LabelFormat,
  ): Promise<Label> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "MyDHL Express connector is not yet implemented", "dhl_express");
  }

  async getTracking(_trackingNumber: TrackingNumber): Promise<TrackingResult> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "MyDHL Express connector is not yet implemented", "dhl_express");
  }

  async schedulePickup(_request: PickupScheduleRequest): Promise<PickupScheduleResponse> {
    throw new ConnectorError("UNSUPPORTED_OPERATION", "MyDHL Express connector is not yet implemented", "dhl_express");
  }

  async getPickupPoints(_params: {
    city?: string | undefined;
    postalCode?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
  }): Promise<readonly PickupPoint[]> {
    return [];
  }
}
