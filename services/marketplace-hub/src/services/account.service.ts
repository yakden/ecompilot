// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: Seller account service
// Manages OAuth flows, token storage, and account CRUD
// ─────────────────────────────────────────────────────────────────────────────

import { eq, and } from "drizzle-orm";
import type { Logger } from "pino";
import type { Db } from "../db/client.js";
import { sellerAccounts } from "../db/schema.js";
import { encrypt, decrypt } from "@ecompilot/shared-security";
import { env } from "../config/env.js";
import type { MarketplacePlatform, MarketplaceConnector, ConnectorAuthContext } from "../types/marketplace.js";
import type { NatsPublisher } from "./nats.publisher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectAccountResult {
  readonly accountId: string;
  readonly platform: MarketplacePlatform;
  readonly platformUserId: string;
  readonly accountName: string | null;
}

export interface AccountSummary {
  readonly id: string;
  readonly platform: MarketplacePlatform;
  readonly platformUserId: string;
  readonly accountName: string | null;
  readonly active: boolean;
  readonly tokenExpiresAt: Date;
  readonly lastRefreshedAt: Date | null;
  readonly lastErrorMessage: string | null;
  readonly lastErrorAt: Date | null;
  readonly createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// AccountService
// ─────────────────────────────────────────────────────────────────────────────

export class AccountService {
  constructor(
    private readonly db: Db,
    private readonly connectors: Map<string, MarketplaceConnector>,
    private readonly nats: NatsPublisher,
    private readonly logger: Logger,
  ) {}

  /**
   * Generate OAuth2 authorization URL for a given platform.
   */
  getAuthorizationUrl(
    platform: MarketplacePlatform,
    state: string,
  ): string {
    const connector = this.requireConnector(platform);
    return connector.getAuthorizationUrl(state);
  }

  /**
   * Complete OAuth2 flow: exchange code for tokens, persist encrypted account.
   */
  async connectAccount(
    userId: string,
    platform: MarketplacePlatform,
    code: string,
    state: string,
  ): Promise<ConnectAccountResult> {
    const connector = this.requireConnector(platform);

    const tokens = await connector.exchangeCode(code, state);

    // Upsert account (one per user x platform)
    const [account] = await this.db
      .insert(sellerAccounts)
      .values({
        userId,
        platform,
        platformUserId: tokens.platformUserId,
        encryptedAccessToken: encrypt(tokens.accessToken, env.ENCRYPTION_KEY),
        encryptedRefreshToken: encrypt(tokens.refreshToken, env.ENCRYPTION_KEY),
        tokenExpiresAt: tokens.expiresAt,
        active: true,
        lastRefreshedAt: new Date(),
        capabilities: connector.capabilities,
      })
      .onConflictDoUpdate({
        target: [sellerAccounts.userId, sellerAccounts.platform],
        set: {
          platformUserId: tokens.platformUserId,
          encryptedAccessToken: encrypt(tokens.accessToken, env.ENCRYPTION_KEY),
          encryptedRefreshToken: encrypt(tokens.refreshToken, env.ENCRYPTION_KEY),
          tokenExpiresAt: tokens.expiresAt,
          active: true,
          lastRefreshedAt: new Date(),
          lastErrorMessage: null,
          lastErrorAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (account === undefined) {
      throw new Error("Failed to persist seller account");
    }

    this.logger.info(
      { accountId: account.id, platform, userId, platformUserId: tokens.platformUserId },
      "Marketplace account connected",
    );

    await this.nats.publishAccountConnected({
      accountId: account.id,
      userId,
      platform,
      platformUserId: tokens.platformUserId,
    });

    return {
      accountId: account.id,
      platform,
      platformUserId: tokens.platformUserId,
      accountName: account.accountName,
    };
  }

  /**
   * List all connected accounts for a user.
   */
  async listAccounts(userId: string): Promise<AccountSummary[]> {
    const rows = await this.db
      .select({
        id: sellerAccounts.id,
        platform: sellerAccounts.platform,
        platformUserId: sellerAccounts.platformUserId,
        accountName: sellerAccounts.accountName,
        active: sellerAccounts.active,
        tokenExpiresAt: sellerAccounts.tokenExpiresAt,
        lastRefreshedAt: sellerAccounts.lastRefreshedAt,
        lastErrorMessage: sellerAccounts.lastErrorMessage,
        lastErrorAt: sellerAccounts.lastErrorAt,
        createdAt: sellerAccounts.createdAt,
      })
      .from(sellerAccounts)
      .where(eq(sellerAccounts.userId, userId));

    return rows.map((r) => ({
      ...r,
      platform: r.platform as MarketplacePlatform,
    }));
  }

  /**
   * Disconnect an account (soft delete — marks as inactive).
   */
  async disconnectAccount(
    userId: string,
    accountId: string,
  ): Promise<void> {
    const [account] = await this.db
      .update(sellerAccounts)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(sellerAccounts.id, accountId),
          eq(sellerAccounts.userId, userId),
        ),
      )
      .returning({ id: sellerAccounts.id });

    if (account === undefined) {
      throw new Error("Account not found or not owned by user");
    }

    this.logger.info({ accountId, userId }, "Marketplace account disconnected");
  }

  /**
   * Refresh token for an account if it's about to expire (< 30 min remaining).
   * Returns the auth context with fresh tokens.
   */
  async getAuthContext(accountId: string): Promise<ConnectorAuthContext> {
    const account = await this.db.query.sellerAccounts.findFirst({
      where: eq(sellerAccounts.id, accountId),
    });

    if (account === undefined) {
      throw new Error(`Seller account ${accountId} not found`);
    }

    const now = Date.now();
    const expiresIn = account.tokenExpiresAt.getTime() - now;
    const thirtyMinMs = 30 * 60 * 1000;

    // Proactively refresh if expiry within 30 minutes
    if (expiresIn < thirtyMinMs) {
      return this.refreshAccountToken(account);
    }

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accountId: account.id as any,
      accessToken: decrypt(account.encryptedAccessToken, env.ENCRYPTION_KEY),
      refreshToken: decrypt(account.encryptedRefreshToken, env.ENCRYPTION_KEY),
      tokenExpiresAt: account.tokenExpiresAt,
    };
  }

  private async refreshAccountToken(account: {
    id: string;
    platform: "allegro" | "amazon" | "ebay" | "etsy" | "olx" | "vinted" | "empik" | "erli";
    encryptedRefreshToken: string;
    userId: string;
  }): Promise<ConnectorAuthContext> {
    const connector = this.requireConnector(account.platform);
    const currentRefreshToken = decrypt(
      account.encryptedRefreshToken,
      env.ENCRYPTION_KEY,
    );

    try {
      const newTokens = await connector.refreshToken(currentRefreshToken);

      await this.db
        .update(sellerAccounts)
        .set({
          encryptedAccessToken: encrypt(newTokens.accessToken, env.ENCRYPTION_KEY),
          encryptedRefreshToken: encrypt(newTokens.refreshToken, env.ENCRYPTION_KEY),
          tokenExpiresAt: newTokens.expiresAt,
          lastRefreshedAt: new Date(),
          lastErrorMessage: null,
          lastErrorAt: null,
          updatedAt: new Date(),
        })
        .where(eq(sellerAccounts.id, account.id));

      this.logger.info(
        { accountId: account.id, platform: account.platform },
        "Token refreshed successfully",
      );

      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accountId: account.id as any,
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        tokenExpiresAt: newTokens.expiresAt,
      };
    } catch (err) {
      // Record refresh failure
      await this.db
        .update(sellerAccounts)
        .set({
          lastErrorMessage: err instanceof Error ? err.message : "Token refresh failed",
          lastErrorAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sellerAccounts.id, account.id));

      this.logger.error(
        { accountId: account.id, platform: account.platform, err },
        "Token refresh failed",
      );

      throw err;
    }
  }

  private requireConnector(platform: string): MarketplaceConnector {
    const connector = this.connectors.get(platform);
    if (connector === undefined) {
      throw new Error(`No connector registered for platform: ${platform}`);
    }
    return connector;
  }
}
