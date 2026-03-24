// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ksef-service: NATS JetStream service
// Subscribe: marketplace.order.created → auto-generate invoice
// Publish:   ksef.invoice.created / ksef.invoice.submitted / ksef.invoice.accepted
// ─────────────────────────────────────────────────────────────────────────────

import {
  connect,
  type NatsConnection,
  type JetStreamClient,
  type JetStreamManager,
  StringCodec,
  type ConsumerConfig,
  AckPolicy,
  DeliverPolicy,
  StorageType,
} from "nats";
import {
  JETSTREAM_CONFIG,
  SUBJECTS,
  type MarketplaceOrderCreatedEvent,
  MarketplaceOrderCreatedEventSchema,
} from "@ecompilot/event-contracts";
import { env } from "../config/env.js";
import type { Logger } from "pino";
import type { KsefClient } from "./ksef-client.js";
import {
  InvoiceService,
  type OrderInvoiceRequest,
  type OrderContext,
  determineOrderType,
} from "./invoice.service.js";
import { asNip, asInvoiceNumber, asGrosze, type Nip } from "../types/ksef.js";

// ─────────────────────────────────────────────────────────────────────────────
// KSeF event subjects (ksef-service owns these subjects)
// ─────────────────────────────────────────────────────────────────────────────

export const KSEF_SUBJECTS = {
  INVOICE_CREATED: "ecompilot.ksef.invoice.created",
  INVOICE_SUBMITTED: "ecompilot.ksef.invoice.submitted",
  INVOICE_ACCEPTED: "ecompilot.ksef.invoice.accepted",
  INVOICE_REJECTED: "ecompilot.ksef.invoice.rejected",
  OFFLINE_RECOVERY_COMPLETE: "ecompilot.ksef.offline.recovery_complete",
} as const;

export type KsefSubject = (typeof KSEF_SUBJECTS)[keyof typeof KSEF_SUBJECTS];

// ─────────────────────────────────────────────────────────────────────────────
// Event payload types
// ─────────────────────────────────────────────────────────────────────────────

interface KsefEventEnvelope<TPayload> {
  readonly eventId: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly source: "ksef-service";
  readonly schemaVersion: 1;
  readonly payload: TPayload;
}

interface KsefInvoiceCreatedPayload {
  readonly invoiceId: string;
  readonly userId: string;
  readonly invoiceNumber: string;
  readonly sellerNip: string;
  readonly buyerNip: string | null;
  readonly netAmount: number;
  readonly vatAmount: number;
  readonly grossAmount: number;
  readonly jpkMarker: string | null;
  readonly issueDate: string;
  readonly createdAt: string;
}

interface KsefInvoiceSubmittedPayload {
  readonly invoiceId: string;
  readonly userId: string;
  readonly invoiceNumber: string;
  readonly ksefReferenceNumber: string;
  readonly submittedAt: string;
}

interface KsefInvoiceAcceptedPayload {
  readonly invoiceId: string;
  readonly userId: string;
  readonly invoiceNumber: string;
  readonly ksefReferenceNumber: string;
  readonly ksefNumber: string;
  readonly ksefTimestamp: string;
  readonly acceptedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// NatsService — NATS subscriber + publisher for ksef-service
// ─────────────────────────────────────────────────────────────────────────────

export class NatsService {
  private _nc: NatsConnection | null = null;
  private _js: JetStreamClient | null = null;
  private _jsm: JetStreamManager | null = null;
  private readonly _codec = StringCodec();
  private readonly _logger: Logger;
  private readonly _invoiceService: InvoiceService;
  private readonly _ksefClient: KsefClient | null;
  private readonly _sellerNip: Nip;

  constructor(
    logger: Logger,
    invoiceService: InvoiceService,
    sellerNip: Nip,
    ksefClient: KsefClient | null = null,
  ) {
    this._logger = logger;
    this._invoiceService = invoiceService;
    this._sellerNip = sellerNip;
    this._ksefClient = ksefClient;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this._nc = await connect({ servers: env.NATS_URL });
    this._js = this._nc.jetstream();
    this._jsm = await this._nc.jetstreamManager();

    this._logger.info({ url: env.NATS_URL }, "Connected to NATS JetStream");

    await this._ensureStream();
    await this._subscribeToOrderCreated();
  }

  async close(): Promise<void> {
    if (this._nc !== null) {
      await this._nc.drain();
      this._nc = null;
      this._js = null;
      this._jsm = null;
      this._logger.info("NATS connection drained and closed");
    }
  }

  // ── Stream setup ──────────────────────────────────────────────────────────

  private async _ensureStream(): Promise<void> {
    if (this._jsm === null) return;

    try {
      await this._jsm.streams.info(JETSTREAM_CONFIG.streamName);
      // Stream already exists — nothing to do.
      this._logger.info({ stream: JETSTREAM_CONFIG.streamName }, "JetStream stream already exists");
      return;
    } catch {
      // Stream does not exist (or is unreachable) — attempt to create it.
    }

    const allSubjects = [
      ...JETSTREAM_CONFIG.subjects,
      ...Object.values(KSEF_SUBJECTS),
    ];

    try {
      await this._jsm.streams.add({
        name: JETSTREAM_CONFIG.streamName,
        subjects: allSubjects,
        max_age: JETSTREAM_CONFIG.maxAge,
        max_msg_size: JETSTREAM_CONFIG.maxMsgSize,
        storage: StorageType.File,
        num_replicas: JETSTREAM_CONFIG.replicas,
      });
      this._logger.info({ stream: JETSTREAM_CONFIG.streamName }, "JetStream stream created");
    } catch (createErr) {
      // NATS error 10052 = "stream name already in use with a different config".
      // This happens in a race condition where another instance created the
      // stream between our info() call and this add() call, or the server
      // already holds the stream under a conflicting config. Treat it as
      // success — the stream exists and is usable.
      const errMessage =
        createErr instanceof Error ? createErr.message : String(createErr);
      const isAlreadyExists =
        errMessage.includes("10052") ||
        errMessage.toLowerCase().includes("stream name already in use") ||
        errMessage.toLowerCase().includes("already exists");

      if (isAlreadyExists) {
        this._logger.warn(
          { stream: JETSTREAM_CONFIG.streamName, err: errMessage },
          "JetStream stream already exists (error 10052) — continuing with existing stream",
        );
        return;
      }

      // Any other error is fatal — re-throw so connect() fails loudly.
      throw createErr;
    }
  }

  // ── Subscribe: marketplace.order.created ─────────────────────────────────

  private async _subscribeToOrderCreated(): Promise<void> {
    if (this._js === null || this._jsm === null) return;

    const consumerName = "ksef-service-order-invoice";
    const durableName = consumerName;

    // Create or update durable push consumer
    try {
      await this._jsm.consumers.info(JETSTREAM_CONFIG.streamName, durableName);
    } catch {
      const consumerConfig: Partial<ConsumerConfig> = {
        durable_name: durableName,
        deliver_policy: DeliverPolicy.New,
        ack_policy: AckPolicy.Explicit,
        filter_subject: SUBJECTS.MARKETPLACE_ORDER_CREATED,
        max_deliver: 5,
        ack_wait: 30_000_000_000, // 30 seconds in nanoseconds
      };
      await this._jsm.consumers.add(JETSTREAM_CONFIG.streamName, consumerConfig as ConsumerConfig);
    }

    const consumer = await this._js.consumers.get(
      JETSTREAM_CONFIG.streamName,
      durableName,
    );

    this._logger.info(
      { subject: SUBJECTS.MARKETPLACE_ORDER_CREATED, consumer: durableName },
      "Subscribed to marketplace order created events",
    );

    // Process messages in an async loop
    void (async () => {
      const messages = await consumer.consume({ max_messages: 10 });

      for await (const msg of messages) {
        try {
          const raw = JSON.parse(this._codec.decode(msg.data)) as unknown;
          const parseResult = MarketplaceOrderCreatedEventSchema.safeParse(raw);

          if (!parseResult.success) {
            this._logger.error(
              { errors: parseResult.error.issues },
              "Invalid marketplace.order.created event schema",
            );
            msg.nak();
            continue;
          }

          await this._handleOrderCreated(parseResult.data);
          msg.ack();
        } catch (err) {
          this._logger.error({ err }, "Failed to process marketplace.order.created event");
          msg.nak();
        }
      }
    })();
  }

  private async _handleOrderCreated(event: MarketplaceOrderCreatedEvent): Promise<void> {
    const { payload } = event;

    this._logger.info(
      { orderId: payload.orderId, marketplace: payload.marketplace, userId: payload.userId },
      "Processing order for auto-invoice generation",
    );

    // Determine order type from available context
    const ctx: OrderContext = {
      buyerNip: undefined, // Marketplace orders typically don't include buyer NIP
      buyerCountryCode: payload.shippingAddress.country,
      isDigitalService: false,
      usesIoss: payload.shippingAddress.country !== "PL",
    };
    const orderType = determineOrderType(ctx);

    // Generate sequential invoice number
    const now = new Date();
    // Simple sequence: use timestamp-based suffix for uniqueness
    const sequence = parseInt(
      payload.orderId.replace(/[^0-9]/g, "").slice(-4) || "0001",
      10,
    );
    const invoiceNumber = InvoiceService.buildInvoiceNumber(
      now.getFullYear(),
      now.getMonth() + 1,
      sequence,
    );

    const items = payload.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPriceGrosze: asGrosze(item.unitPrice.amount * 100),
      vatRate: 23 as const,
    }));

    const req: OrderInvoiceRequest = {
      orderId: payload.orderId,
      userId: payload.userId,
      orderType,
      buyerNip: undefined,
      buyerNipUe: undefined,
      buyerCountryCode: payload.shippingAddress.country,
      buyerName: payload.buyerName,
      buyerCity: payload.shippingAddress.city,
      buyerPostalCode: payload.shippingAddress.postalCode,
      buyerStreet: payload.shippingAddress.street,
      sellerNip: this._sellerNip,
      sellerName: "EcomPilot Seller",
      sellerCity: "Warszawa",
      sellerPostalCode: "00-001",
      sellerStreet: "ul. Testowa 1",
      items,
      invoiceNumber,
      issueDate: now.toISOString().slice(0, 10),
      paymentMethod: "przelew",
      paymentDueDate: undefined,
      bankAccountIban: undefined,
    };

    const { invoiceId, jpkMarker } = await this._invoiceService.createInvoiceFromOrder(req);

    await this.publishInvoiceCreated({
      invoiceId,
      userId: payload.userId,
      invoiceNumber,
      sellerNip: this._sellerNip,
      buyerNip: null,
      netAmount: payload.totalAmount.amount * 100,
      vatAmount: Math.round(payload.totalAmount.amount * 100 * 0.23),
      grossAmount: Math.round(payload.totalAmount.amount * 100 * 1.23),
      jpkMarker,
      issueDate: now.toISOString().slice(0, 10),
      createdAt: now.toISOString(),
    });
  }

  // ── Publish helpers ───────────────────────────────────────────────────────

  private _buildEnvelope<TPayload>(
    type: string,
    payload: TPayload,
  ): KsefEventEnvelope<TPayload> {
    return {
      eventId: crypto.randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
      source: "ksef-service",
      schemaVersion: 1,
      payload,
    };
  }

  private async _publish<TPayload>(
    subject: KsefSubject,
    payload: TPayload,
  ): Promise<void> {
    if (this._js === null) {
      throw new Error("NatsService not connected. Call connect() first.");
    }

    const envelope = this._buildEnvelope(subject, payload);
    const data = this._codec.encode(JSON.stringify(envelope));

    await this._js.publish(subject, data, { msgID: envelope.eventId });

    this._logger.info(
      { subject, eventId: envelope.eventId },
      "NATS event published",
    );
  }

  async publishInvoiceCreated(payload: KsefInvoiceCreatedPayload): Promise<void> {
    await this._publish(KSEF_SUBJECTS.INVOICE_CREATED, payload);
  }

  async publishInvoiceSubmitted(payload: KsefInvoiceSubmittedPayload): Promise<void> {
    await this._publish(KSEF_SUBJECTS.INVOICE_SUBMITTED, payload);
  }

  async publishInvoiceAccepted(payload: KsefInvoiceAcceptedPayload): Promise<void> {
    await this._publish(KSEF_SUBJECTS.INVOICE_ACCEPTED, payload);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let _natsService: NatsService | null = null;

export function initNatsService(
  logger: Logger,
  invoiceService: InvoiceService,
  sellerNip: Nip,
  ksefClient: KsefClient | null = null,
): NatsService {
  if (_natsService !== null) return _natsService;
  _natsService = new NatsService(logger, invoiceService, sellerNip, ksefClient);
  return _natsService;
}

export function getNatsService(): NatsService {
  if (_natsService === null) {
    throw new Error("NatsService not initialized. Call initNatsService() first.");
  }
  return _natsService;
}
