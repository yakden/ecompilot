// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — community-service: Socket.io WebSocket service
// Manages real-time events for community posts and replies
// ─────────────────────────────────────────────────────────────────────────────

import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { getAllowedOrigins } from "../config/env.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Socket.io event payload types
// ─────────────────────────────────────────────────────────────────────────────

export interface NewReplyPayload {
  readonly replyId: string;
  readonly postId: string;
  readonly parentId: string | null;
  readonly authorId: string;
  readonly content: string;
  readonly upvotes: number;
  readonly isAccepted: boolean;
  readonly createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server → Client event map (type-safe Socket.io)
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  "new:reply": (payload: NewReplyPayload) => void;
}

export interface ClientToServerEvents {
  "join:post": (postId: string) => void;
  "leave:post": (postId: string) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: string;
}

export type TypedSocketIOServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ─────────────────────────────────────────────────────────────────────────────
// Room name helpers
// ─────────────────────────────────────────────────────────────────────────────

export function postRoom(postId: string): string {
  return `post:${postId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let _io: TypedSocketIOServer | null = null;

/**
 * Initialises Socket.io on top of the existing HTTP server created by Fastify.
 * Must be called after Fastify has bound its HTTP server (i.e. after listen()).
 */
export function initSocketIO(
  httpServer: HttpServer,
  logger: Logger,
): TypedSocketIOServer {
  if (_io !== null) return _io;

  const allowedOrigins = getAllowedOrigins();

  _io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  _io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket.io client connected");

    socket.on("join:post", (postId: string) => {
      const room = postRoom(postId);
      void socket.join(room);
      logger.debug({ socketId: socket.id, room }, "Socket joined post room");
    });

    socket.on("leave:post", (postId: string) => {
      const room = postRoom(postId);
      void socket.leave(room);
      logger.debug({ socketId: socket.id, room }, "Socket left post room");
    });

    socket.on("disconnect", (reason) => {
      logger.info({ socketId: socket.id, reason }, "Socket.io client disconnected");
    });

    socket.on("error", (err) => {
      logger.error({ socketId: socket.id, err }, "Socket.io socket error");
    });
  });

  logger.info({ allowedOrigins }, "Socket.io initialized");
  return _io;
}

export function getSocketIO(): TypedSocketIOServer {
  if (_io === null) {
    throw new Error("Socket.io not initialized. Call initSocketIO() first.");
  }
  return _io;
}

/**
 * Emits a new:reply event to all clients in the post room.
 * Called from the reply creation route handler.
 */
export function emitNewReply(
  postId: string,
  payload: NewReplyPayload,
  logger: Logger,
): void {
  const io = getSocketIO();
  const room = postRoom(postId);
  io.to(room).emit("new:reply", payload);
  logger.debug(
    { room, replyId: payload.replyId, postId },
    "Socket.io: emitted new:reply event",
  );
}

/**
 * Gracefully closes the Socket.io server.
 */
export async function closeSocketIO(logger: Logger): Promise<void> {
  if (_io !== null) {
    await new Promise<void>((resolve) => {
      _io!.close(() => {
        resolve();
      });
    });
    _io = null;
    logger.info("Socket.io server closed");
  }
}
