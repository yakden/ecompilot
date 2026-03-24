// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// DPD Poland connector — STUB
//
// IMPLEMENTATION NOTES:
//   DPD Poland exposes a SOAP-only API (no REST equivalent).
//   Requirements for full implementation:
//
//   1. SOAP client: use the `soap` npm package (npm i soap @types/soap)
//      WSDL endpoints:
//        Sandbox: https://dpdsandbox.pl/ws/xml/webservice.php?wsdl
//        Prod:    https://ws.dpd.com.pl/services/PackageService?wsdl
//
//   2. Rate limit: 60 calls / minute — enforced via a token-bucket limiter.
//      DPD explicitly states that concurrent calls from the same account
//      cause integrity errors; ALL calls must be serialised behind a
//      per-process Mutex (p-mutex or async-mutex npm packages).
//
//   3. Authentication: each SOAP call includes a `authData` block:
//        { login: DPD_LOGIN, password: DPD_PASSWORD, masterFid: DPD_FID }
//
//   4. Key WSDL operations:
//        generatePackagesNumbersV5  → createShipment
//        findPackage                → getShipment / getTracking
//        generateSpedLabelsV4       → getLabel (returns base64 PDF/EPL/ZPL)
//        generateProtocolV2         → getBatchLabels / protocol PDF
//        createCourierOrderWithPickupWindow → schedulePickup
//
//   5. COD: set `parcels[].services.cod.amount` in the SOAP payload.
//        COD max: no published hard limit but advised < 50 000 PLN.
//
//   6. Error handling: SOAP faults must be mapped to ConnectorError codes.
//      DPD returns business errors inside the SOAP response body
//      (not SOAP faults), check `status.info[].infoCode` fields.
//
//   7. Tracking: also SOAP via findPackage.
//        Alternative: DPD Tracker REST API (separate registration needed)
//        GET https://tracktrace.dpd.com.pl/parcelDetails?q={trackingNumber}&locale=pl_PL
//
//   8. Webhook support: NOT available — polling only.
//
// References:
//   https://ws.dpd.com.pl/services/PackageService?wsdl
//   https://www.dpd.com/pl/pl/otrzymaj-paczke/sledzenie-paczek/
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
  type PickupPointType,
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

const DPD_CAPABILITIES: CarrierCapabilities = {
  hasWebhooks: false,
  hasPickupPoints: false,
  hasCOD: true,
  maxCODAmount: 50_000,
  maxWeightKg: 31.5,
  maxDimensionsCm: [175, 175, 175],
  hasReturnLabels: true,
  labelFormats: ["PDF", "ZPL_200DPI", "ZPL_300DPI", "EPL"],
  isSOAP: true,
  rateLimit: 60,
  requiresMutex: true,
  isImplemented: false,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export interface DpdConnectorConfig {
  readonly login: string;
  readonly password: string;
  readonly masterFid: string;
  readonly sandbox?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stub connector
// ─────────────────────────────────────────────────────────────────────────────

export class DpdConnector extends BaseConnector implements CarrierConnector {
  override readonly code = "dpd" as const;
  override readonly capabilities = DPD_CAPABILITIES;

  constructor(
    private readonly config: DpdConnectorConfig,
    logger: Logger,
  ) {
    super("dpd", DPD_CAPABILITIES, logger);
    // Suppress unused-variable warning for config fields used in future implementation
    void this.config;
  }

  async createShipment(_request: ShipmentRequest): Promise<ShipmentResponse> {
    throw new ConnectorError(
      "UNSUPPORTED_OPERATION",
      "DPD connector is not yet implemented (SOAP — see connector stub for implementation guide)",
      "dpd",
    );
  }

  async getShipment(_carrierShipmentId: CarrierShipmentId): Promise<ShipmentResponse> {
    throw new ConnectorError(
      "UNSUPPORTED_OPERATION",
      "DPD connector is not yet implemented",
      "dpd",
    );
  }

  async cancelShipment(_carrierShipmentId: CarrierShipmentId): Promise<void> {
    throw new ConnectorError(
      "UNSUPPORTED_OPERATION",
      "DPD connector is not yet implemented",
      "dpd",
    );
  }

  async getLabel(
    _carrierShipmentId: CarrierShipmentId,
    _format?: LabelFormat,
  ): Promise<Label> {
    throw new ConnectorError(
      "UNSUPPORTED_OPERATION",
      "DPD connector is not yet implemented",
      "dpd",
    );
  }

  async getBatchLabels(
    _carrierShipmentIds: readonly CarrierShipmentId[],
    _format?: LabelFormat,
  ): Promise<Label> {
    throw new ConnectorError(
      "UNSUPPORTED_OPERATION",
      "DPD connector is not yet implemented",
      "dpd",
    );
  }

  async getTracking(_trackingNumber: TrackingNumber): Promise<TrackingResult> {
    throw new ConnectorError(
      "UNSUPPORTED_OPERATION",
      "DPD connector is not yet implemented",
      "dpd",
    );
  }

  async schedulePickup(
    _request: PickupScheduleRequest,
  ): Promise<PickupScheduleResponse> {
    throw new ConnectorError(
      "UNSUPPORTED_OPERATION",
      "DPD connector is not yet implemented",
      "dpd",
    );
  }

  async getPickupPoints(_params: {
    city?: string | undefined;
    postalCode?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    radiusKm?: number | undefined;
    type?: PickupPointType | undefined;
    limit?: number | undefined;
  }): Promise<readonly PickupPoint[]> {
    // DPD Poland does not have a widespread pickup-point network
    return [];
  }
}
