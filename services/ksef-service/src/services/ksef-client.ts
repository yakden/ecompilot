// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ksef-service: KSeF 2.0 API Client
// Challenge-Response authentication, interactive & batch sessions,
// invoice submission, UPO retrieval, and rate-limit handling.
// ─────────────────────────────────────────────────────────────────────────────

import { createCipheriv, randomBytes, createHash } from "node:crypto";
import type { Logger } from "pino";
import {
  type KsefEnvironment,
  type KsefAuthChallenge,
  type KsefAuthToken,
  type KsefAuthStatus,
  type KsefSession,
  type KsefSubmissionResult,
  type KsefBatchSubmissionResult,
  type KsefBatchPackage,
  type KsefUpo,
  type FA3InvoiceXml,
  type InvoiceNumber,
  KsefError,
  KSEF_API_URLS,
  asNip,
  asKsefReferenceNumber,
  asInvoiceNumber,
  type Nip,
} from "../types/ksef.js";

// ─────────────────────────────────────────────────────────────────────────────
// Rate limit configuration (per KSeF 2.0 documentation)
// ─────────────────────────────────────────────────────────────────────────────

interface RateLimitConfig {
  /** Maximum requests per second for this endpoint group */
  readonly maxRps: number;
  /** Retry-After header fallback delay in milliseconds */
  readonly retryAfterMs: number;
}

const RATE_LIMITS = {
  auth: { maxRps: 10, retryAfterMs: 1_000 },
  invoices: { maxRps: 100, retryAfterMs: 500 },
  sessions: { maxRps: 20, retryAfterMs: 2_000 },
  upo: { maxRps: 50, retryAfterMs: 1_000 },
} as const satisfies Record<string, RateLimitConfig>;

// ─────────────────────────────────────────────────────────────────────────────
// HTTP response shape from KSeF API
// ─────────────────────────────────────────────────────────────────────────────

interface KsefAuthChallengeResponse {
  readonly referenceNumber: string;
  readonly challenge: string;
  readonly timestamp: string;
}

interface KsefTokenRedeemResponse {
  readonly referenceNumber: string;
}

interface KsefTokenStatusResponse {
  readonly processingCode: number;
  readonly processingDescription: string;
  readonly sessionToken?: {
    readonly token: string;
    readonly generatedAt: string;
    readonly activeAt: string;
  };
  readonly elementReferenceNumber: string;
}

interface KsefSessionOpenResponse {
  readonly referenceNumber: string;
  readonly timestamp: string;
  readonly processingCode: number;
}

interface KsefInvoiceSubmitResponse {
  readonly referenceNumber: string;
  readonly processingCode: number;
  readonly processingDescription: string;
  readonly elementReferenceNumber: string;
  readonly timestamp: string;
}

interface KsefInvoiceStatusResponse {
  readonly processingCode: number;
  readonly ksefReferenceNumber?: string;
  readonly timestamp?: string;
  readonly acquisitionTimestamp?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// KSeF API Client class
// ─────────────────────────────────────────────────────────────────────────────

export class KsefClient {
  private readonly _baseUrl: string;
  private readonly _environment: KsefEnvironment;
  private readonly _logger: Logger;

  /** Active session token — set after successful auth */
  private _sessionToken: string | null = null;
  private _sessionTokenExpiresAt: Date | null = null;

  /** Last request timestamps per endpoint group for client-side rate limiting */
  private readonly _lastRequestAt: Map<string, number> = new Map();

  constructor(environment: KsefEnvironment, logger: Logger) {
    this._environment = environment;
    this._baseUrl = KSEF_API_URLS[environment];
    this._logger = logger;
  }

  // ── Internal HTTP helper ───────────────────────────────────────────────────

  private async request<TResponse>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    rateLimitGroup: keyof typeof RATE_LIMITS,
    options?: {
      readonly body?: unknown;
      readonly rawBody?: ArrayBuffer;
      readonly sessionToken?: string;
      readonly contentType?: string;
    },
  ): Promise<TResponse> {
    await this._enforceRateLimit(rateLimitGroup);

    const url = `${this._baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };

    if (options?.sessionToken !== undefined) {
      headers["SessionToken"] = options.sessionToken;
    } else if (this._sessionToken !== null) {
      headers["SessionToken"] = this._sessionToken;
    }

    const fetchInit: { method: string; headers: Record<string, string>; body?: ArrayBuffer | string } = {
      method,
      headers,
    };

    if (options?.rawBody !== undefined) {
      headers["Content-Type"] = options.contentType ?? "application/octet-stream";
      fetchInit.body = options.rawBody;
    } else if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchInit.body = JSON.stringify(options.body);
    }

    this._logger.debug({ method, url, rateLimitGroup }, "KSeF API request");

    let response: Response;
    try {
      response = await fetch(url, fetchInit);
    } catch (err) {
      this._logger.error({ err, method, url }, "KSeF API network error");
      throw new KsefError({
        code: "NETWORK_ERROR",
        message: `Network error calling KSeF API: ${String(err)}`,
        timestamp: new Date().toISOString(),
      });
    }

    this._lastRequestAt.set(rateLimitGroup, Date.now());

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = retryAfter !== null
        ? Number(retryAfter) * 1_000
        : RATE_LIMITS[rateLimitGroup].retryAfterMs;

      this._logger.warn({ url, waitMs }, "KSeF rate limit hit — waiting before retry");
      await this._sleep(waitMs);

      // Single retry after rate limit
      response = await fetch(url, fetchInit);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      let parsed: KsefError | null = null;
      try {
        const raw = JSON.parse(errorBody) as { code?: string; message?: string; timestamp?: string };
        parsed = new KsefError({
          code: raw.code ?? `HTTP_${response.status}`,
          message: raw.message ?? `KSeF API error: ${response.status} ${response.statusText}`,
          timestamp: raw.timestamp ?? new Date().toISOString(),
        });
      } catch {
        parsed = new KsefError({
          code: `HTTP_${response.status}`,
          message: `KSeF API error: ${response.status} ${response.statusText}`,
          timestamp: new Date().toISOString(),
        });
      }

      this._logger.error(
        { status: response.status, url, code: parsed.code },
        "KSeF API error response",
      );
      throw parsed;
    }

    const responseText = await response.text();
    if (responseText.trim() === "") {
      return {} as TResponse;
    }

    return JSON.parse(responseText) as TResponse;
  }

  // ── Rate limiting helper ───────────────────────────────────────────────────

  private async _enforceRateLimit(group: keyof typeof RATE_LIMITS): Promise<void> {
    const config = RATE_LIMITS[group];
    const minIntervalMs = Math.ceil(1_000 / config.maxRps);
    const lastAt = this._lastRequestAt.get(group);

    if (lastAt !== undefined) {
      const elapsed = Date.now() - lastAt;
      if (elapsed < minIntervalMs) {
        await this._sleep(minIntervalMs - elapsed);
      }
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auth: Challenge-Response flow
  //
  // 1. POST /auth/challenge   → server returns base64-encoded challenge
  // 2. AES-256-ECB encrypt the challenge with the API token as the key
  // 3. POST /auth/token/redeem → server starts async verification
  // 4. GET  /auth/{ref}        → poll until session token is issued
  // ─────────────────────────────────────────────────────────────────────────

  async initAuthChallenge(nip: Nip): Promise<KsefAuthChallenge> {
    const response = await this.request<KsefAuthChallengeResponse>(
      "POST",
      "/auth/challenge",
      "auth",
      {
        body: {
          contextIdentifier: {
            type: "onip",
            identifier: nip,
          },
        },
      },
    );

    this._logger.info(
      { nip, referenceNumber: response.referenceNumber },
      "KSeF auth challenge initiated",
    );

    return {
      referenceNumber: response.referenceNumber,
      challenge: response.challenge,
      timestamp: response.timestamp,
    };
  }

  /**
   * Encrypt the challenge bytes using AES-256-ECB with the API token.
   * The token must be exactly 32 bytes (256 bits); if shorter it is zero-padded.
   */
  encryptChallenge(challengeBase64: string, apiToken: string): string {
    const challengeBytes = Buffer.from(challengeBase64, "base64");

    // Pad or truncate token to 32 bytes for AES-256
    const keyBuffer = Buffer.alloc(32, 0);
    const tokenBuffer = Buffer.from(apiToken, "utf-8");
    tokenBuffer.copy(keyBuffer, 0, 0, Math.min(tokenBuffer.length, 32));

    const cipher = createCipheriv("aes-256-ecb", keyBuffer, null);
    cipher.setAutoPadding(true);

    const encrypted = Buffer.concat([
      cipher.update(challengeBytes),
      cipher.final(),
    ]);

    return encrypted.toString("base64");
  }

  async redeemAuthToken(
    referenceNumber: string,
    encryptedChallenge: string,
    nip: Nip,
  ): Promise<string> {
    const response = await this.request<KsefTokenRedeemResponse>(
      "POST",
      "/auth/token/redeem",
      "auth",
      {
        body: {
          referenceNumber,
          encryptedChallenge,
          contextIdentifier: {
            type: "onip",
            identifier: nip,
          },
        },
      },
    );

    this._logger.info(
      { nip, referenceNumber: response.referenceNumber },
      "KSeF auth token redemption submitted",
    );

    return response.referenceNumber;
  }

  async pollAuthToken(referenceNumber: string): Promise<KsefAuthStatus> {
    const response = await this.request<KsefTokenStatusResponse>(
      "GET",
      `/auth/${referenceNumber}`,
      "auth",
    );

    // processingCode 200 = token ready, 202 = still processing
    if (response.processingCode === 200 && response.sessionToken !== undefined) {
      const token: KsefAuthToken = {
        referenceNumber,
        sessionToken: response.sessionToken.token,
        expiresAt: response.sessionToken.activeAt,
        nip: asNip(""),
      };
      this._sessionToken = token.sessionToken;
      this._sessionTokenExpiresAt = new Date(token.expiresAt);

      this._logger.info({ referenceNumber }, "KSeF session token acquired");
      return { status: "active", token };
    }

    if (response.processingCode === 202) {
      return { status: "pending", referenceNumber };
    }

    return {
      status: "error",
      errorCode: String(response.processingCode),
      errorMessage: response.processingDescription,
    };
  }

  /**
   * Full auth flow: challenge → encrypt → redeem → poll until active.
   * Polls with exponential backoff, max 10 attempts.
   */
  async authenticate(nip: Nip, apiToken: string): Promise<KsefAuthToken> {
    const challenge = await this.initAuthChallenge(nip);
    const encryptedChallenge = this.encryptChallenge(challenge.challenge, apiToken);
    const redeemRef = await this.redeemAuthToken(
      challenge.referenceNumber,
      encryptedChallenge,
      nip,
    );

    let attempt = 0;
    const maxAttempts = 10;
    let delayMs = 500;

    while (attempt < maxAttempts) {
      await this._sleep(delayMs);
      const status = await this.pollAuthToken(redeemRef);

      if (status.status === "active") {
        return status.token;
      }

      if (status.status === "error") {
        throw new KsefError({
          code: status.errorCode,
          message: status.errorMessage,
          timestamp: new Date().toISOString(),
          referenceNumber: redeemRef,
        });
      }

      attempt++;
      delayMs = Math.min(delayMs * 2, 5_000);
    }

    throw new KsefError({
      code: "AUTH_TIMEOUT",
      message: `KSeF authentication timed out after ${maxAttempts} polling attempts`,
      timestamp: new Date().toISOString(),
      referenceNumber: redeemRef,
    });
  }

  setSessionToken(token: string, expiresAt: Date): void {
    this._sessionToken = token;
    this._sessionTokenExpiresAt = expiresAt;
  }

  isSessionActive(): boolean {
    if (this._sessionToken === null || this._sessionTokenExpiresAt === null) {
      return false;
    }
    return this._sessionTokenExpiresAt > new Date();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Interactive session: POST /sessions/online
  // Used for real-time invoice submission and immediate KSeF reference retrieval
  // ─────────────────────────────────────────────────────────────────────────

  async openInteractiveSession(nip: Nip): Promise<KsefSession> {
    if (!this.isSessionActive()) {
      throw new KsefError({
        code: "SESSION_NOT_AUTHENTICATED",
        message: "Must authenticate before opening a KSeF session",
        timestamp: new Date().toISOString(),
      });
    }

    const response = await this.request<KsefSessionOpenResponse>(
      "POST",
      "/sessions/online",
      "sessions",
      {
        body: {
          partnerSystemContextIdentifier: {
            type: "onip",
            identifier: nip,
          },
        },
      },
    );

    this._logger.info(
      { nip, referenceNumber: response.referenceNumber },
      "KSeF interactive session opened",
    );

    return {
      referenceNumber: response.referenceNumber,
      sessionType: "interactive",
      status: "active",
      environment: this._environment,
      nip,
      openedAt: response.timestamp,
      sessionToken: this._sessionToken ?? "",
      expiresAt: this._sessionTokenExpiresAt?.toISOString() ?? "",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Submit invoice to active interactive session
  // POST /invoices — returns processing reference number, poll for KSeF number
  // ─────────────────────────────────────────────────────────────────────────

  async submitInvoice(
    xml: FA3InvoiceXml,
    sessionReferenceNumber: string,
  ): Promise<KsefSubmissionResult> {
    const xmlBytes = Buffer.from(xml.xmlContent, "utf-8");

    const response = await this.request<KsefInvoiceSubmitResponse>(
      "POST",
      "/invoices",
      "invoices",
      {
        rawBody: xmlBytes.buffer as ArrayBuffer,
        contentType: "application/octet-stream",
      },
    );

    this._logger.info(
      {
        referenceNumber: response.referenceNumber,
        elementRef: response.elementReferenceNumber,
        processingCode: response.processingCode,
      },
      "KSeF invoice submitted — polling for acceptance",
    );

    // Poll for the KSeF reference number
    const ksefRef = await this._pollInvoiceAcceptance(response.elementReferenceNumber);

    return {
      ksefReferenceNumber: asKsefReferenceNumber(ksefRef.ksefReferenceNumber ?? ""),
      ksefTimestamp: ksefRef.acquisitionTimestamp ?? response.timestamp,
      processingCode: response.processingCode,
      processingDescription: response.processingDescription,
      sessionReferenceNumber,
    };
  }

  private async _pollInvoiceAcceptance(
    elementReferenceNumber: string,
  ): Promise<KsefInvoiceStatusResponse> {
    let attempt = 0;
    const maxAttempts = 20;
    let delayMs = 300;

    while (attempt < maxAttempts) {
      await this._sleep(delayMs);

      const status = await this.request<KsefInvoiceStatusResponse>(
        "GET",
        `/invoices/${elementReferenceNumber}`,
        "invoices",
      );

      if (status.processingCode === 200 && status.ksefReferenceNumber !== undefined) {
        this._logger.info(
          { elementReferenceNumber, ksefRef: status.ksefReferenceNumber },
          "KSeF invoice accepted",
        );
        return status;
      }

      if (status.processingCode >= 400) {
        throw new KsefError({
          code: `INVOICE_REJECTED_${status.processingCode}`,
          message: `KSeF rejected invoice: processing code ${status.processingCode}`,
          timestamp: new Date().toISOString(),
          referenceNumber: elementReferenceNumber,
        });
      }

      attempt++;
      delayMs = Math.min(delayMs * 1.5, 3_000);
    }

    throw new KsefError({
      code: "INVOICE_ACCEPTANCE_TIMEOUT",
      message: `KSeF invoice acceptance timed out after ${maxAttempts} polling attempts`,
      timestamp: new Date().toISOString(),
      referenceNumber: elementReferenceNumber,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Terminate interactive session
  // POST /sessions/{referenceNumber}/terminate
  // ─────────────────────────────────────────────────────────────────────────

  async terminateSession(referenceNumber: string): Promise<void> {
    await this.request<unknown>(
      "POST",
      `/sessions/${referenceNumber}/terminate`,
      "sessions",
    );

    this._logger.info({ referenceNumber }, "KSeF interactive session terminated");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Batch session: POST /sessions/batch
  // Used for submitting multiple invoices as an AES-256 encrypted ZIP archive.
  // ─────────────────────────────────────────────────────────────────────────

  async openBatchSession(
    nip: Nip,
    batchPackage: KsefBatchPackage,
  ): Promise<KsefBatchSubmissionResult> {
    if (!this.isSessionActive()) {
      throw new KsefError({
        code: "SESSION_NOT_AUTHENTICATED",
        message: "Must authenticate before opening a KSeF batch session",
        timestamp: new Date().toISOString(),
      });
    }

    const response = await this.request<{
      referenceNumber: string;
      processingCode: number;
      timestamp: string;
    }>(
      "POST",
      "/sessions/batch",
      "sessions",
      {
        body: {
          partnerSystemContextIdentifier: {
            type: "onip",
            identifier: nip,
          },
          encryptedDocumentList: {
            encryptedDocument: {
              encryptedContent: batchPackage.encryptedZip,
              encryptedKey: batchPackage.encryptedKey,
              initializationVector: batchPackage.iv,
              hashSHA: {
                algorithm: "SHA-256",
                value: batchPackage.packageHash,
              },
            },
          },
        },
      },
    );

    this._logger.info(
      {
        nip,
        referenceNumber: response.referenceNumber,
        invoiceCount: batchPackage.invoiceCount,
      },
      "KSeF batch session submitted",
    );

    return {
      batchReferenceNumber: response.referenceNumber,
      invoicesSubmitted: batchPackage.invoiceCount,
      status: response.processingCode === 202 ? "processing" : "accepted",
      acceptedAt: response.timestamp,
    };
  }

  /**
   * Encrypt invoices into an AES-256-CBC ZIP package for batch submission.
   * In production, the encryptedKey would be RSA-encrypted with KSeF's public key.
   */
  encryptBatchPackage(xmlDocuments: readonly string[]): KsefBatchPackage {
    const aesKey = randomBytes(32);
    const iv = randomBytes(16);

    const zipContent = xmlDocuments.join("\n---\n");
    const zipBuffer = Buffer.from(zipContent, "utf-8");

    const cipher = createCipheriv("aes-256-cbc", aesKey, iv);
    const encrypted = Buffer.concat([cipher.update(zipBuffer), cipher.final()]);

    const hash = createHash("sha256").update(zipBuffer).digest("hex");

    return {
      encryptedZip: encrypted.toString("base64"),
      encryptedKey: aesKey.toString("base64"),
      iv: iv.toString("base64"),
      invoiceCount: xmlDocuments.length,
      packageHash: hash,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPO retrieval: GET /sessions/{ref}/invoices/{invoiceRef}/upo
  // Urzędowe Potwierdzenie Odbioru — Official Receipt Confirmation
  // ─────────────────────────────────────────────────────────────────────────

  async getUpo(
    sessionReferenceNumber: string,
    invoiceReferenceNumber: string,
  ): Promise<KsefUpo> {
    const response = await this.request<{
      ksefReferenceNumber: string;
      invoiceNumber: string;
      nip: string;
      upoContent: string;
    }>(
      "GET",
      `/sessions/${sessionReferenceNumber}/invoices/${invoiceReferenceNumber}/upo`,
      "upo",
    );

    this._logger.info(
      { sessionReferenceNumber, invoiceReferenceNumber },
      "KSeF UPO retrieved",
    );

    return {
      ksefReferenceNumber: asKsefReferenceNumber(response.ksefReferenceNumber),
      invoiceNumber: asInvoiceNumber(response.invoiceNumber),
      nip: asNip(response.nip),
      upoContent: response.upoContent,
      upoContentType: "application/xml",
      issuedAt: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Service health check
  // GET /common/Status
  // ─────────────────────────────────────────────────────────────────────────

  async checkKsefStatus(): Promise<{ readonly available: boolean; readonly timestamp: string }> {
    try {
      const response = await this.request<{ processingCode: number; timestamp: string }>(
        "GET",
        "/common/Status",
        "sessions",
      );

      return {
        available: response.processingCode === 200,
        timestamp: response.timestamp,
      };
    } catch {
      return { available: false, timestamp: new Date().toISOString() };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton — one client per environment
// ─────────────────────────────────────────────────────────────────────────────

const _clients = new Map<KsefEnvironment, KsefClient>();

export function getKsefClient(environment: KsefEnvironment, logger: Logger): KsefClient {
  const existing = _clients.get(environment);
  if (existing !== undefined) return existing;

  const client = new KsefClient(environment, logger);
  _clients.set(environment, client);
  return client;
}
