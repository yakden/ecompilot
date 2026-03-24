// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Integration tests
// Uses Vitest + in-memory mocks (no real DB/Redis/NATS)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

// ─────────────────────────────────────────────────────────────────────────────
// Environment setup — must be before any module imports that read env
// ─────────────────────────────────────────────────────────────────────────────

// Real RSA-2048 key pair for tests — generated via Node.js crypto.generateKeyPairSync
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDMIrpoJAMOirg2
gPLNWTsLpdktY1bQ3zEqBwbD4Kc0m5brx9d27yu7pieQAvuMXtmZ2LtkpUPj+mid
n/wK/spgyahEo5EGbn8PBOAt1DTNwwid2NQephe/rqrynLwqa6wSy2ZZTCW4qrSW
NJj+Bpj+13886e8uaPvv9YQVdgiSd3wfG7iBVMzPF0dTRaI0stcVZgOHz4SufIqv
wwuEub4hDQzTW4GCosscnI9S6eo7apkMA4DzK9bihRuj4H+rzwlOQ7xT3V1lrAqo
Vbm32lXD0JbCtNvE2ORt9PXZrTWnMqc/wSVeqYBgvWuKs7ZZGlCNook36u/8JxB+
iNKG8N/vAgMBAAECggEAAO1L/R8pd9iSl6jEJdinSk2RccGixGvEH25S0/MlPzmW
6kKJAOOpl8Q5bX41PzU/O8wbjhgIYnp+1waTRNMmLadVfjnvAT5tHQCStgbtVkYJ
IMDotglH298xN/ugq6deguMnpgycbILtM0WXDYfhI4SPccIjdGa5ALDlTbFH1d2x
C6SJ6kj1Vg95ZNjHzVB1N1HuODD9dcGV0ZyRUQd9Me2cyaKQvVRkojyWle6ySiRs
Yw0TDowcz9vSGyVMigg68gTIAJfOV7g8BfxveYl2BCM8LT/lhzNMM7pMhfmibZco
fekuRyeMhv+KGmODARMN6Hkgcl6QX6eXblnjTUy/bQKBgQDoFc80V2o1WqaBwLbx
pCt7JXVm02J05d0iVzwjdjm3wjMheNCNNhyH08elG7LGDm6MzuCleO+b7qcY7PoL
DsDqJvNahHBJWLrG/JilF6+yows7ycvwMudcLxt+HWNS849knkd6SMGMIazKD3So
1320xuqYQZdbsMrii6rTh4egWwKBgQDhK6LXrjqHaCtTtJUXejZuY44on62bIF4V
Ab2D81/OuLdw/I0OblnL337tIW11VWOag297frQe0vJVt6+NyLIYXszTRlfmv5xc
T5JgO7rgoO0gDxiAvRD50IrQOM9EYVUQXVQf3kGxYXTNBkWiwyKgK85WW1FCOhtk
Y4TeV7MS/QKBgDNIBmXJXvV1F0+aVpIkNVtblopm8N1loSwiXG51hCFfbs7ZlDNv
nnRAzl9kNGdg7vp8B9VoWIF7BT8TtdhVpTjX7HO2ydzbF0I6tDvedPsi3auTVlW3
2blby1ZdhgHhQXD5LFAP3XxqQHTRX3SjUOpt/Y4xCBHBicLvG4rr6oL7AoGBALYO
7xqOP7qN6kJCxy11Xh9BFYcZHGhJ8mfvwUi39eYSChgryu05IheqPFkE5xiwktky
nmfumTo2+0N9Qk9UT1NPCzNkM9xZXtZwa/ytLrtCwpdiPUCSHfCuwh37YPJ79ChI
HaWqsdj24FaJVLJ2Lj/tS2cdbIUssEsqABs6M4sNAoGADMZA05gmAHWaaGczVesf
P4bsW9Cxs3B2UU5wPNyQSBtCJZnxTM1kNCgNs0+DqH9G6NNZ6wlMQSrS8kEWLyDc
hSX88yjvZRP87InCvkMPlKcqDjXuqp/8FoCOzJytnuYLfOE+1zhKYpRW1KzCz6bO
gtWBLnxCWw9IS6UigV4sYeE=
-----END PRIVATE KEY-----`;

const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzCK6aCQDDoq4NoDyzVk7
C6XZLWNW0N8xKgcGw+CnNJuW68fXdu8ru6YnkAL7jF7Zmdi7ZKVD4/ponZ/8Cv7K
YMmoRKORBm5/DwTgLdQ0zcMIndjUHqYXv66q8py8KmusEstmWUwluKq0ljSY/gaY
/td/POnvLmj77/WEFXYIknd8Hxu4gVTMzxdHU0WiNLLXFWYDh8+ErnyKr8MLhLm+
IQ0M01uBgqLLHJyPUunqO2qZDAOA8yvW4oUbo+B/q88JTkO8U91dZawKqFW5t9pV
w9CWwrTbxNjkbfT12a01pzKnP8ElXqmAYL1rirO2WRpQjaKJN+rv/CcQfojShvDf
7wIDAQAB
-----END PUBLIC KEY-----`;

vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
vi.stubEnv("REDIS_URL", "redis://localhost:6379");
vi.stubEnv("NATS_URL", "nats://localhost:4222");
vi.stubEnv("JWT_PRIVATE_KEY", TEST_PRIVATE_KEY.replace(/\n/g, "\\n"));
vi.stubEnv("JWT_PUBLIC_KEY", TEST_PUBLIC_KEY.replace(/\n/g, "\\n"));
vi.stubEnv("JWT_ACCESS_TTL", "15m");
vi.stubEnv("JWT_REFRESH_TTL", "30d");
vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client-id");
vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
vi.stubEnv("RESEND_API_KEY", "re_test_key");
vi.stubEnv("APP_URL", "http://localhost:3000");
vi.stubEnv("ALLOWED_ORIGINS", "http://localhost:3000");
vi.stubEnv("PORT", "3001");
vi.stubEnv("NODE_ENV", "test");

// ─────────────────────────────────────────────────────────────────────────────
// In-memory user store for mocking
// ─────────────────────────────────────────────────────────────────────────────

type MockUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  language: string;
  plan: string;
  emailVerified: boolean;
  emailVerificationToken: string | null;
  passwordResetToken: string | null;
  passwordResetExpires: Date | null;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaBackupCodes: string[] | null;
  googleId: string | null;
  appleId: string | null;
  metadata: Record<string, unknown> | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockRefreshToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revoked: boolean;
  revokedAt: Date | null;
  family: string;
  deviceInfo: Record<string, unknown> | null;
};

const mockUsers = new Map<string, MockUser>();
const mockRefreshTokens = new Map<string, MockRefreshToken>();
const mockAuditLog: unknown[] = [];

// Redis mock: simple in-memory key-value store
const redisStore = new Map<string, { value: string; expiry: number | null }>();

const mockRedis = {
  incr: vi.fn(async (key: string) => {
    const entry = redisStore.get(key);
    const current = entry ? parseInt(entry.value, 10) : 0;
    const next = current + 1;
    redisStore.set(key, { value: String(next), expiry: entry?.expiry ?? null });
    return next;
  }),
  expire: vi.fn(async (key: string, ttl: number) => {
    const entry = redisStore.get(key);
    if (entry) {
      redisStore.set(key, { ...entry, expiry: Date.now() + ttl * 1000 });
    }
    return 1;
  }),
  ttl: vi.fn(async (_key: string) => 900),
  del: vi.fn(async (key: string) => {
    const existed = redisStore.has(key);
    redisStore.delete(key);
    return existed ? 1 : 0;
  }),
  ping: vi.fn(async () => "PONG"),
  quit: vi.fn(async () => "OK"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock modules
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../services/redis.service.js", () => ({
  connectRedis: vi.fn(async () => mockRedis),
  closeRedis: vi.fn(async () => undefined),
  getRedis: vi.fn(() => mockRedis),
}));

vi.mock("../services/nats.service.js", () => ({
  connectNats: vi.fn(async () => undefined),
  closeNats: vi.fn(async () => undefined),
  publishUserRegistered: vi.fn(async () => undefined),
  publishEvent: vi.fn(async () => undefined),
}));

vi.mock("../db/client.js", () => {
  const buildMockDb = () => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  });

  let _db: ReturnType<typeof buildMockDb> | null = null;

  return {
    initDb: vi.fn(() => {
      _db = buildMockDb();
      return _db;
    }),
    getDb: vi.fn(() => {
      if (!_db) _db = buildMockDb();
      return _db;
    }),
    closeDb: vi.fn(async () => undefined),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Build test app — lightweight Fastify instance without infra
// ─────────────────────────────────────────────────────────────────────────────

import { authRoutes } from "../routes/auth.routes.js";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "../services/password.service.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
  verifyAccessToken,
} from "../services/token.service.js";
import { getDb } from "../db/client.js";
import type { Logger } from "pino";
import pino from "pino";

// Use a test-only no-op logger to avoid noise
const testLogger = pino({ level: "silent" });

function createTestApp(): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: true });
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: configure DB mock for a given test scenario
// ─────────────────────────────────────────────────────────────────────────────

function setupDbMock(overrides: {
  findUserByEmail?: MockUser | null;
  findUserById?: MockUser | null;
  findRefreshToken?: MockRefreshToken | null;
  insertUser?: MockUser;
  insertRefreshToken?: MockRefreshToken;
} = {}): void {
  const db = getDb() as ReturnType<typeof import("../db/client.js").getDb>;

  // Build chainable mock that resolves based on scenario
  let _selectResult: unknown[] = [];
  let _insertResult: unknown[] = [];

  const chain = {
    select: vi.fn().mockImplementation(() => chain),
    from: vi.fn().mockImplementation(() => chain),
    where: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => {
      return Promise.resolve(_selectResult);
    }),
    insert: vi.fn().mockImplementation(() => chain),
    values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
      // Determine what we're inserting by checking for 'email' (users) vs 'tokenHash' (refresh_tokens)
      if ("email" in vals && overrides.insertUser) {
        _insertResult = [overrides.insertUser];
      } else if ("tokenHash" in vals && overrides.insertRefreshToken) {
        _insertResult = [overrides.insertRefreshToken];
      } else {
        _insertResult = [];
      }
      return chain;
    }),
    returning: vi.fn().mockImplementation(() => Promise.resolve(_insertResult)),
    update: vi.fn().mockImplementation(() => chain),
    set: vi.fn().mockImplementation(() => chain),
  };

  // The "where" call determines what we're selecting
  let _callCount = 0;
  chain.from.mockImplementation(() => {
    _callCount++;
    if (_callCount === 1 && overrides.findUserByEmail !== undefined) {
      _selectResult = overrides.findUserByEmail ? [overrides.findUserByEmail] : [];
    } else if (overrides.findUserById !== undefined) {
      _selectResult = overrides.findUserById ? [overrides.findUserById] : [];
    } else if (overrides.findRefreshToken !== undefined) {
      _selectResult = overrides.findRefreshToken ? [overrides.findRefreshToken] : [];
    } else {
      _selectResult = [];
    }
    return chain;
  });

  Object.assign(db, chain);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Password Service", () => {
  it("hashes and verifies a valid password", async () => {
    const password = "SecurePass1!";
    const hash = await hashPassword(password);
    expect(hash).toBeTruthy();
    expect(hash).not.toBe(password);
    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("SecurePass1!");
    const valid = await verifyPassword("WrongPass1!", hash);
    expect(valid).toBe(false);
  });

  it("validates strong password", () => {
    const result = validatePasswordStrength("StrongPass1!");
    expect(result.valid).toBe(true);
  });

  it("rejects password shorter than 8 chars", () => {
    const result = validatePasswordStrength("Ab1!");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("8"))).toBe(true);
    }
  });

  it("rejects password without uppercase", () => {
    const result = validatePasswordStrength("lowercase1!");
    expect(result.valid).toBe(false);
  });

  it("rejects password without lowercase", () => {
    const result = validatePasswordStrength("UPPERCASE1!");
    expect(result.valid).toBe(false);
  });

  it("rejects password without digit", () => {
    const result = validatePasswordStrength("NoDigitPass!");
    expect(result.valid).toBe(false);
  });

  it("rejects password without special char", () => {
    const result = validatePasswordStrength("NoSpecial1A");
    expect(result.valid).toBe(false);
  });
});

describe("Token Service", () => {
  it("generates and verifies an access token", async () => {
    const token = await generateAccessToken({
      id: crypto.randomUUID(),
      email: "test@example.com",
      plan: "free",
      language: "en",
    });
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const payload = await verifyAccessToken(token);
    expect(payload.email).toBe("test@example.com");
    expect(payload.plan).toBe("free");
    expect(payload.language).toBe("en");
  });

  it("rejects a tampered token", async () => {
    const token = await generateAccessToken({
      id: crypto.randomUUID(),
      email: "test@example.com",
      plan: "free",
      language: "en",
    });

    const parts = token.split(".");
    // Tamper the payload
    const tampered = `${parts[0]}.INVALID_PAYLOAD.${parts[2]}`;
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });

  it("generates unique refresh tokens", () => {
    const t1 = generateRefreshToken();
    const t2 = generateRefreshToken();
    expect(t1.raw).not.toBe(t2.raw);
    expect(t1.hash).not.toBe(t2.hash);
  });

  it("hashes refresh token consistently", () => {
    const raw = "test-refresh-token-value";
    const hash1 = hashRefreshToken(raw);
    const hash2 = hashRefreshToken(raw);
    expect(hash1).toBe(hash2);
  });

  it("refresh token hash differs from raw", () => {
    const { raw, hash } = generateRefreshToken();
    expect(raw).not.toBe(hash);
  });

  it("generates future expiry date", () => {
    const expiry = getRefreshTokenExpiry();
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
    // 30 days in future
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(expiry.getTime()).toBeCloseTo(Date.now() + thirtyDays, -4);
  });
});

describe("Rate Limiting", () => {
  beforeEach(() => {
    redisStore.clear();
    mockRedis.incr.mockClear();
    mockRedis.del.mockClear();
  });

  it("allows first 5 attempts", async () => {
    const { checkLoginRateLimit } = await import("../middleware/rate-limit.js");
    const ip = "192.168.1.100";

    for (let i = 1; i <= 5; i++) {
      redisStore.set(`rate_limit:login:${ip}`, {
        value: String(i),
        expiry: Date.now() + 900_000,
      });
      mockRedis.incr.mockResolvedValueOnce(i);
      const result = await checkLoginRateLimit(ip);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks 6th attempt", async () => {
    const { checkLoginRateLimit } = await import("../middleware/rate-limit.js");
    const ip = "192.168.1.101";

    mockRedis.incr.mockResolvedValueOnce(6);
    const result = await checkLoginRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets rate limit on successful login", async () => {
    const { resetLoginRateLimit } = await import("../middleware/rate-limit.js");
    const ip = "192.168.1.102";
    redisStore.set(`rate_limit:login:${ip}`, { value: "3", expiry: null });

    await resetLoginRateLimit(ip);

    expect(mockRedis.del).toHaveBeenCalledWith(`rate_limit:login:${ip}`);
  });
});

describe("Auth Routes — Register", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = createTestApp();
    await authRoutes(app, { logger: testLogger as Logger });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/v1/auth/register — 201 with tokens, no passwordHash in response", async () => {
    const userId = crypto.randomUUID();
    const now = new Date();

    const mockUser: MockUser = {
      id: userId,
      email: "newuser@example.com",
      passwordHash: "$argon2id$...",
      language: "en",
      plan: "free",
      emailVerified: false,
      emailVerificationToken: "abc123",
      passwordResetToken: null,
      passwordResetExpires: null,
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
      googleId: null,
      appleId: null,
      metadata: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const db = getDb();

    // Simulate: no existing user (empty array), then insert returns user
    let callIdx = 0;
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callIdx++;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(callIdx === 1 ? [] : [mockUser]),
          }),
        }),
      };
    });

    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockUser]),
      }),
    }));

    (db.update as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      body: {
        email: "newuser@example.com",
        password: "SecurePass1!",
        language: "en",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      success: boolean;
      data: {
        accessToken: string;
        refreshToken: string;
        user: Record<string, unknown>;
      };
    }>();

    expect(body.success).toBe(true);
    expect(typeof body.data.accessToken).toBe("string");
    expect(typeof body.data.refreshToken).toBe("string");
    expect(body.data.user).toBeDefined();

    // Critical: passwordHash must NOT appear in response
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(JSON.stringify(body)).not.toContain("$argon2");
    expect(body.data.user["passwordHash"]).toBeUndefined();
    expect(body.data.user["password_hash"]).toBeUndefined();

    // User fields present
    expect(body.data.user["id"]).toBe(userId);
    expect(body.data.user["email"]).toBe("newuser@example.com");
    expect(body.data.user["plan"]).toBe("free");
    expect(body.data.user["emailVerified"]).toBe(false);
  });

  it("POST /api/v1/auth/register — 409 on duplicate email", async () => {
    const existingUser: MockUser = {
      id: crypto.randomUUID(),
      email: "existing@example.com",
      passwordHash: null,
      language: "ru",
      plan: "free",
      emailVerified: true,
      emailVerificationToken: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
      googleId: null,
      appleId: null,
      metadata: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = getDb();

    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([existingUser]),
        }),
      }),
    }));

    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      body: {
        email: "existing@example.com",
        password: "SecurePass1!",
        language: "ru",
      },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json<{ success: boolean; error: { code: string } }>();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTH_EMAIL_ALREADY_EXISTS");
  });

  it("POST /api/v1/auth/register — 400 on weak password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      body: {
        email: "weakpass@example.com",
        password: "weak",
        language: "en",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{ success: boolean; error: { code: string } }>();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/v1/auth/register — 400 on invalid email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      body: {
        email: "not-an-email",
        password: "SecurePass1!",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{ success: boolean; error: { code: string } }>();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Auth Routes — Login", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = createTestApp();
    await authRoutes(app, { logger: testLogger as Logger });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    redisStore.clear();
    mockRedis.incr.mockReset();
    mockRedis.incr.mockImplementation(async (key: string) => {
      const entry = redisStore.get(key);
      const current = entry ? parseInt(entry.value, 10) : 0;
      const next = current + 1;
      redisStore.set(key, { value: String(next), expiry: null });
      return next;
    });
    mockRedis.del.mockReset();
    mockRedis.del.mockImplementation(async (key: string) => {
      redisStore.delete(key);
      return 1;
    });
    mockRedis.ttl.mockResolvedValue(900);
  });

  it("POST /api/v1/auth/login — 200 with tokens on valid credentials", async () => {
    const passwordHash = await hashPassword("SecurePass1!");
    const userId = crypto.randomUUID();
    const now = new Date();

    const user: MockUser = {
      id: userId,
      email: "login@example.com",
      passwordHash,
      language: "en",
      plan: "pro",
      emailVerified: true,
      emailVerificationToken: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
      googleId: null,
      appleId: null,
      metadata: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const db = getDb();

    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([user]),
        }),
      }),
    }));

    (db.update as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }));

    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      body: {
        email: "login@example.com",
        password: "SecurePass1!",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      success: boolean;
      data: { accessToken: string; refreshToken: string };
    }>();
    expect(body.success).toBe(true);
    expect(typeof body.data.accessToken).toBe("string");
    expect(typeof body.data.refreshToken).toBe("string");

    // Verify the access token is valid
    const payload = await verifyAccessToken(body.data.accessToken);
    expect(payload.sub).toBe(userId);
    expect(payload.plan).toBe("pro");
  });

  it("POST /api/v1/auth/login — 401 on invalid credentials", async () => {
    const db = getDb();

    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }));

    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      body: {
        email: "notfound@example.com",
        password: "WrongPass1!",
      },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ success: boolean; error: { code: string } }>();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("POST /api/v1/auth/login — 429 after 5 failed attempts", async () => {
    const db = getDb();

    // Simulate no user found (invalid credentials path)
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }));

    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }));

    const ip = "10.0.0.1";
    let attemptCount = 0;

    mockRedis.incr.mockImplementation(async () => {
      attemptCount++;
      return attemptCount;
    });

    // First 5 attempts — should get 401 (invalid credentials, not rate limited)
    for (let i = 0; i < 5; i++) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: { "x-forwarded-for": ip },
        body: {
          email: "ratelimit@example.com",
          password: "WrongPass1!",
        },
      });
      expect(response.statusCode).toBe(401);
    }

    // 6th attempt — should be rate limited
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "x-forwarded-for": ip },
      body: {
        email: "ratelimit@example.com",
        password: "WrongPass1!",
      },
    });

    expect(response.statusCode).toBe(429);
    const body = response.json<{ success: boolean; error: { code: string } }>();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});

describe("Auth Routes — Token Refresh Rotation", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = createTestApp();
    await authRoutes(app, { logger: testLogger as Logger });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/v1/auth/refresh — 200 with new token pair", async () => {
    const userId = crypto.randomUUID();
    const { raw, hash } = generateRefreshToken();
    const family = crypto.randomUUID();
    const now = new Date();

    const storedToken: MockRefreshToken = {
      id: crypto.randomUUID(),
      userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 86400_000), // 1 day from now
      revoked: false,
      revokedAt: null,
      family,
      deviceInfo: null,
    };

    const user: MockUser = {
      id: userId,
      email: "refresh@example.com",
      passwordHash: null,
      language: "pl",
      plan: "business",
      emailVerified: true,
      emailVerificationToken: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
      googleId: null,
      appleId: null,
      metadata: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const db = getDb();

    let selectCallCount = 0;
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(async () => {
            selectCallCount++;
            // First call: find refresh token; second call: find user
            return selectCallCount === 1 ? [storedToken] : [user];
          }),
        }),
      }),
    }));

    (db.update as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }));

    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      body: { refreshToken: raw },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      success: boolean;
      data: { accessToken: string; refreshToken: string };
    }>();
    expect(body.success).toBe(true);
    expect(typeof body.data.accessToken).toBe("string");
    expect(typeof body.data.refreshToken).toBe("string");

    // New refresh token must differ from original
    expect(body.data.refreshToken).not.toBe(raw);

    // Access token must be valid RS256 JWT
    const payload = await verifyAccessToken(body.data.accessToken);
    expect(payload.sub).toBe(userId);
    expect(payload.plan).toBe("business");
    expect(payload.language).toBe("pl");
  });

  it("POST /api/v1/auth/refresh — 401 on revoked token (theft detection)", async () => {
    const { raw, hash } = generateRefreshToken();
    const family = crypto.randomUUID();

    const revokedToken: MockRefreshToken = {
      id: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 86400_000),
      revoked: true, // Already revoked!
      revokedAt: new Date(),
      family,
      deviceInfo: null,
    };

    const db = getDb();

    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([revokedToken]),
        }),
      }),
    }));

    (db.update as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }));

    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      body: { refreshToken: raw },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ success: boolean; error: { code: string } }>();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("POST /api/v1/auth/refresh — 401 on expired token", async () => {
    const { raw, hash } = generateRefreshToken();

    const expiredToken: MockRefreshToken = {
      id: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      tokenHash: hash,
      expiresAt: new Date(Date.now() - 86400_000), // Past!
      revoked: false,
      revokedAt: null,
      family: crypto.randomUUID(),
      deviceInfo: null,
    };

    const db = getDb();

    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([expiredToken]),
        }),
      }),
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      body: { refreshToken: raw },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ success: boolean; error: { code: string } }>();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTH_TOKEN_EXPIRED");
  });

  it("POST /api/v1/auth/refresh — 401 on non-existent token", async () => {
    const db = getDb();

    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      body: { refreshToken: "nonexistent-token-value" },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("Auth Routes — Me endpoint", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = createTestApp();
    await authRoutes(app, { logger: testLogger as Logger });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/auth/me — 200 with user data when authenticated", async () => {
    const userId = crypto.randomUUID();
    const now = new Date();

    const user: MockUser = {
      id: userId,
      email: "me@example.com",
      passwordHash: "$argon2id$v=19$...",
      language: "ua",
      plan: "free",
      emailVerified: false,
      emailVerificationToken: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
      googleId: null,
      appleId: null,
      metadata: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const db = getDb();
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([user]),
        }),
      }),
    }));

    // Generate a valid access token for this user
    const accessToken = await generateAccessToken({
      id: userId,
      email: "me@example.com",
      plan: "free",
      language: "ua",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      success: boolean;
      data: { user: Record<string, unknown> };
    }>();
    expect(body.success).toBe(true);
    expect(body.data.user["id"]).toBe(userId);
    expect(body.data.user["email"]).toBe("me@example.com");

    // passwordHash must not appear
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(JSON.stringify(body)).not.toContain("$argon2");
  });

  it("GET /api/v1/auth/me — 401 without token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    expect(response.statusCode).toBe(401);
  });

  it("GET /api/v1/auth/me — 401 with malformed token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: "Bearer invalid.token.here" },
    });

    expect(response.statusCode).toBe(401);
  });
});
