// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service: Firebase Admin SDK FCM push service
// ─────────────────────────────────────────────────────────────────────────────

import admin from "firebase-admin";
import type { Message, MulticastMessage } from "firebase-admin/messaging";
import { env, decodePemKey } from "../config/env.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Admin singleton
// ─────────────────────────────────────────────────────────────────────────────

let _app: admin.app.App | null = null;

/**
 * Returns true when the Firebase private key env var holds a real PEM block.
 * In dev/test environments it is acceptable to set FIREBASE_PRIVATE_KEY=stub
 * (or any value that does not begin with "-----BEGIN") to skip Firebase init
 * and run without push-notification support.
 */
function isRealPemKey(raw: string): boolean {
  return raw.trim().startsWith("-----BEGIN");
}

export function initFirebase(): void {
  if (_app !== null) return;

  const privateKeyRaw = env.FIREBASE_PRIVATE_KEY;

  if (!isRealPemKey(privateKeyRaw)) {
    // Dev/test mode — skip Firebase Admin SDK initialization rather than
    // crashing with "Invalid PEM formatted message". Push notifications will
    // be no-ops until a real key is supplied.
    console.warn(
      "[notification-service] FIREBASE_PRIVATE_KEY is not a valid PEM key " +
        "(got: stub/placeholder). Firebase Admin SDK will NOT be initialized. " +
        "Push notifications are disabled in this environment.",
    );
    return;
  }

  _app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      privateKey: decodePemKey(privateKeyRaw),
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

/** Returns null when Firebase was intentionally skipped (stub key in dev). */
function getMessaging(): admin.messaging.Messaging | null {
  if (_app === null) return null;
  return admin.messaging(_app);
}

// ─────────────────────────────────────────────────────────────────────────────
// Push payload helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Arbitrary string → string data map for FCM data payload */
export type FcmData = Record<string, string>;

/** Build platform-specific config applied to every message */
function buildPlatformConfig(): Pick<Message, "android" | "apns"> {
  return {
    android: {
      priority: "high",
    },
    apns: {
      payload: {
        aps: {
          badge: 1,
          sound: "default",
        },
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Send to a single device
// ─────────────────────────────────────────────────────────────────────────────

export async function sendPush(
  token: string,
  title: string,
  body: string,
  data: FcmData,
  logger: Logger,
): Promise<void> {
  const messaging = getMessaging();

  if (messaging === null) {
    logger.warn({ title }, "Firebase not initialized (stub key) — push notification skipped");
    return;
  }

  const message: Message = {
    token,
    notification: { title, body },
    data,
    ...buildPlatformConfig(),
  };

  try {
    const messageId = await messaging.send(message);
    logger.info({ messageId, title }, "Push notification sent");
  } catch (err) {
    logger.error({ err, token: token.slice(0, 10) + "...", title }, "Failed to send push notification");
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Send to multiple devices (multicast — up to 500 tokens per call)
// ─────────────────────────────────────────────────────────────────────────────

export interface MulticastResult {
  readonly successCount: number;
  readonly failureCount: number;
  readonly failedTokens: readonly string[];
}

export async function sendMulticast(
  tokens: readonly string[],
  title: string,
  body: string,
  data: FcmData,
  logger: Logger,
): Promise<MulticastResult> {
  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0, failedTokens: [] };
  }

  const messaging = getMessaging();

  if (messaging === null) {
    logger.warn({ title, tokenCount: tokens.length }, "Firebase not initialized (stub key) — multicast skipped");
    return { successCount: 0, failureCount: 0, failedTokens: [] };
  }

  // FCM multicast accepts at most 500 tokens per request
  const BATCH_SIZE = 500;
  let totalSuccess = 0;
  let totalFailure = 0;
  const failedTokens: string[] = [];

  const batches: readonly string[][] = chunkArray(tokens, BATCH_SIZE);

  for (const batch of batches) {
    const message: MulticastMessage = {
      tokens: batch as string[],
      notification: { title, body },
      data,
      ...buildPlatformConfig(),
    };

    try {
      const response = await messaging.sendEachForMulticast(message);
      totalSuccess += response.successCount;
      totalFailure += response.failureCount;

      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const failedToken = batch[idx];
          if (failedToken !== undefined) {
            failedTokens.push(failedToken);
            logger.warn(
              { error: resp.error?.message, tokenPrefix: failedToken.slice(0, 10) },
              "FCM multicast: individual token failed",
            );
          }
        }
      });
    } catch (err) {
      logger.error({ err, batchSize: batch.length, title }, "FCM multicast batch failed");
      totalFailure += batch.length;
      failedTokens.push(...batch);
    }
  }

  logger.info(
    { title, successCount: totalSuccess, failureCount: totalFailure },
    "FCM multicast complete",
  );

  return { successCount: totalSuccess, failureCount: totalFailure, failedTokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
