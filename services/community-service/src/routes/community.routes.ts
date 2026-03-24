// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — community-service: Community forum routes
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq, desc, asc, sql, and } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  categories,
  posts,
  replies,
  userReputation,
  postVotes,
} from "../db/schema.js";
import type { NewPost, NewReply } from "../db/schema.js";
import { authenticate, requireProPlan } from "../middleware/authenticate.js";
import { moderateContent } from "../services/moderation.service.js";
import { emitNewReply } from "../services/websocket.service.js";
import { getNatsPublisher } from "../services/nats.publisher.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Request/query Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const PostsQuerySchema = z.object({
  category: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(["latest", "popular"]).default("latest"),
  cursor: z.string().uuid().optional(),
});

const CreatePostBodySchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().min(5).max(300),
  content: z.string().min(10).max(20_000),
  contentMarkdown: z.string().max(20_000).optional(),
  language: z.enum(["ru", "pl", "ua", "en"]).default("ru"),
  tags: z.array(z.string().min(1).max(50)).max(10).default([]),
});

const CreateReplyBodySchema = z.object({
  content: z.string().min(3).max(10_000),
  parentId: z.string().uuid().optional(),
});

const PostParamsSchema = z.object({
  id: z.string().uuid(),
});

const ReplyParamsSchema = z.object({
  id: z.string().uuid(),
});

const SearchQuerySchema = z.object({
  q: z.string().min(2).max(200),
  lang: z.enum(["ru", "pl", "ua", "en"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const LeaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: send validation error
// ─────────────────────────────────────────────────────────────────────────────

async function sendValidationError(
  reply: FastifyReply,
  message: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await reply.status(400).send({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message,
      details,
      timestamp: new Date().toISOString(),
    },
  });
}

async function sendNotFound(reply: FastifyReply, message: string): Promise<void> {
  await reply.status(404).send({
    success: false,
    error: {
      code: "NOT_FOUND",
      message,
      timestamp: new Date().toISOString(),
    },
  });
}

async function sendForbidden(reply: FastifyReply, message: string): Promise<void> {
  await reply.status(403).send({
    success: false,
    error: {
      code: "AUTH_FORBIDDEN",
      message,
      timestamp: new Date().toISOString(),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reputation helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ensureReputation(userId: string): Promise<void> {
  const db = getDb();
  await db
    .insert(userReputation)
    .values({ userId })
    .onConflictDoNothing({ target: userReputation.userId });
}

async function incrementReputation(
  userId: string,
  delta: Partial<{
    points: number;
    postsCount: number;
    repliesCount: number;
    upvotesReceived: number;
  }>,
): Promise<void> {
  const db = getDb();
  await db
    .insert(userReputation)
    .values({ userId })
    .onConflictDoUpdate({
      target: userReputation.userId,
      set: {
        points: sql`user_reputation.points + ${delta.points ?? 0}`,
        postsCount: sql`user_reputation.posts_count + ${delta.postsCount ?? 0}`,
        repliesCount: sql`user_reputation.replies_count + ${delta.repliesCount ?? 0}`,
        upvotesReceived: sql`user_reputation.upvotes_received + ${delta.upvotesReceived ?? 0}`,
        updatedAt: sql`NOW()`,
      },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Route plugin
// ─────────────────────────────────────────────────────────────────────────────

export async function communityRoutes(
  app: FastifyInstance,
  _opts: Record<string, unknown>,
): Promise<void> {
  const logger: Logger = app.log as unknown as Logger;

  // ── GET /api/v1/community/categories ─────────────────────────────────────

  app.get(
    "/api/v1/community/categories",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(categories)
        .orderBy(asc(categories.sortOrder));

      await reply.status(200).send({
        success: true,
        data: rows,
      });
    },
  );

  // ── GET /api/v1/community/posts ───────────────────────────────────────────

  app.get(
    "/api/v1/community/posts",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const queryResult = PostsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        await sendValidationError(reply, "Invalid query parameters", {
          issues: queryResult.error.issues,
        });
        return;
      }

      const { category, page, limit, sort } = queryResult.data;
      const db = getDb();
      const offset = (page - 1) * limit;

      const conditions = [
        eq(posts.isDeleted, false),
        ...(category !== undefined
          ? [
              sql`${posts.categoryId} = (
                SELECT id FROM categories WHERE slug = ${category} LIMIT 1
              )`,
            ]
          : []),
      ];

      const orderBy =
        sort === "popular"
          ? [desc(posts.isPinned), desc(posts.upvotes), desc(posts.createdAt)]
          : [desc(posts.isPinned), desc(posts.createdAt)];

      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: posts.id,
            authorId: posts.authorId,
            categoryId: posts.categoryId,
            title: posts.title,
            language: posts.language,
            tags: posts.tags,
            upvotes: posts.upvotes,
            replyCount: posts.replyCount,
            viewCount: posts.viewCount,
            isPinned: posts.isPinned,
            isClosed: posts.isClosed,
            createdAt: posts.createdAt,
            updatedAt: posts.updatedAt,
          })
          .from(posts)
          .where(and(...conditions))
          .orderBy(...orderBy)
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(posts)
          .where(and(...conditions)),
      ]);

      const total = countRows[0]?.count ?? 0;

      await reply.status(200).send({
        success: true,
        data: rows,
        meta: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
      });
    },
  );

  // ── POST /api/v1/community/posts ──────────────────────────────────────────

  app.post(
    "/api/v1/community/posts",
    { preHandler: [authenticate, requireProPlan] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodyResult = CreatePostBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        await sendValidationError(reply, "Invalid request body", {
          issues: bodyResult.error.issues,
        });
        return;
      }

      const { categoryId, title, content, contentMarkdown, language, tags } =
        bodyResult.data;
      const user = request.authUser!;
      const db = getDb();

      // Verify category exists
      const [category] = await db
        .select({ id: categories.id, isRestricted: categories.isRestricted })
        .from(categories)
        .where(eq(categories.id, categoryId))
        .limit(1);

      if (category === undefined) {
        await sendNotFound(reply, "Category not found");
        return;
      }

      // Restricted categories require Pro+ (already guaranteed by requireProPlan)
      // But business-only categories could be added in future — no-op here

      // AI + regex moderation on title + content
      const textToModerate = `${title}\n\n${content}`;
      const moderation = await moderateContent(textToModerate, logger);

      if (!moderation.isSafe) {
        await reply.status(422).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Your post was flagged by content moderation and cannot be published",
            details: {
              flaggedCategories: moderation.flaggedCategories,
              spamScore: moderation.spamScore,
            },
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const newPost: NewPost = {
        authorId: user.sub,
        categoryId,
        title,
        content,
        contentMarkdown: contentMarkdown ?? null,
        language,
        tags,
      };

      const [insertedPost] = await db
        .insert(posts)
        .values(newPost)
        .returning();

      if (insertedPost === undefined) {
        throw new Error("Failed to insert post");
      }

      // Update search vector (tsvector) via raw SQL after insert
      await db.execute(
        sql`
          UPDATE posts
          SET search_vector = to_tsvector('simple', ${title} || ' ' || ${content})
          WHERE id = ${insertedPost.id}
        `,
      );

      // Update reputation
      await ensureReputation(user.sub);
      await incrementReputation(user.sub, { points: 5, postsCount: 1 });

      logger.info(
        { postId: insertedPost.id, authorId: user.sub },
        "Community post created",
      );

      await reply.status(201).send({
        success: true,
        data: insertedPost,
      });
    },
  );

  // ── GET /api/v1/community/posts/:id ──────────────────────────────────────

  app.get(
    "/api/v1/community/posts/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsResult = PostParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        await sendValidationError(reply, "Invalid post ID");
        return;
      }

      const { id } = paramsResult.data;
      const db = getDb();

      const [post] = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, id), eq(posts.isDeleted, false)))
        .limit(1);

      if (post === undefined) {
        await sendNotFound(reply, "Post not found");
        return;
      }

      // Fetch replies (non-deleted), nested structure
      const allReplies = await db
        .select()
        .from(replies)
        .where(and(eq(replies.postId, id), eq(replies.isDeleted, false)))
        .orderBy(desc(replies.isAccepted), asc(replies.createdAt));

      // Increment view count (fire and forget)
      void db
        .update(posts)
        .set({ viewCount: sql`view_count + 1` })
        .where(eq(posts.id, id));

      await reply.status(200).send({
        success: true,
        data: {
          post,
          replies: allReplies,
        },
      });
    },
  );

  // ── POST /api/v1/community/posts/:id/replies ──────────────────────────────

  app.post(
    "/api/v1/community/posts/:id/replies",
    { preHandler: [authenticate, requireProPlan] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsResult = PostParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        await sendValidationError(reply, "Invalid post ID");
        return;
      }

      const bodyResult = CreateReplyBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        await sendValidationError(reply, "Invalid request body", {
          issues: bodyResult.error.issues,
        });
        return;
      }

      const { id: postId } = paramsResult.data;
      const { content, parentId } = bodyResult.data;
      const user = request.authUser!;
      const db = getDb();

      // Verify post exists and is open
      const [post] = await db
        .select({
          id: posts.id,
          authorId: posts.authorId,
          isClosed: posts.isClosed,
          isDeleted: posts.isDeleted,
        })
        .from(posts)
        .where(eq(posts.id, postId))
        .limit(1);

      if (post === undefined || post.isDeleted) {
        await sendNotFound(reply, "Post not found");
        return;
      }

      if (post.isClosed) {
        await reply.status(409).send({
          success: false,
          error: {
            code: "CONFLICT",
            message: "This post is closed and no longer accepts replies",
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Enforce max 3 nesting levels
      if (parentId !== undefined) {
        const [parentReply] = await db
          .select({ id: replies.id, parentId: replies.parentId })
          .from(replies)
          .where(eq(replies.id, parentId))
          .limit(1);

        if (parentReply === undefined) {
          await sendNotFound(reply, "Parent reply not found");
          return;
        }

        // Check nesting level: if parent already has a parent that has a parent,
        // that is level 3 — reject further nesting
        if (parentReply.parentId !== null) {
          const [grandParentReply] = await db
            .select({ parentId: replies.parentId })
            .from(replies)
            .where(eq(replies.id, parentReply.parentId))
            .limit(1);

          if (grandParentReply !== undefined && grandParentReply.parentId !== null) {
            await reply.status(422).send({
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Maximum reply nesting depth (3 levels) reached",
                timestamp: new Date().toISOString(),
              },
            });
            return;
          }
        }
      }

      // AI + regex moderation
      const moderation = await moderateContent(content, logger);
      if (!moderation.isSafe) {
        await reply.status(422).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Your reply was flagged by content moderation and cannot be published",
            details: {
              flaggedCategories: moderation.flaggedCategories,
              spamScore: moderation.spamScore,
            },
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const newReply: NewReply = {
        postId,
        parentId: parentId ?? null,
        authorId: user.sub,
        content,
      };

      const [insertedReply] = await db
        .insert(replies)
        .values(newReply)
        .returning();

      if (insertedReply === undefined) {
        throw new Error("Failed to insert reply");
      }

      // Increment post reply count
      await db
        .update(posts)
        .set({ replyCount: sql`reply_count + 1`, updatedAt: sql`NOW()` })
        .where(eq(posts.id, postId));

      // Update reputation for reply author (+2 pts)
      await ensureReputation(user.sub);
      await incrementReputation(user.sub, { points: 2, repliesCount: 1 });

      // Emit Socket.io event to post room
      try {
        emitNewReply(
          postId,
          {
            replyId: insertedReply.id,
            postId,
            parentId: insertedReply.parentId,
            authorId: insertedReply.authorId,
            content: insertedReply.content,
            upvotes: insertedReply.upvotes,
            isAccepted: insertedReply.isAccepted,
            createdAt: insertedReply.createdAt.toISOString(),
          },
          logger,
        );
      } catch (err) {
        // Non-fatal — log and continue
        logger.warn({ err, postId }, "Failed to emit Socket.io new:reply event");
      }

      // Publish NATS event: community.post.reply.created
      try {
        const publisher = getNatsPublisher();
        const preview = content.slice(0, 200);
        await publisher.publishReplyCreated({
          replyId: insertedReply.id,
          postId,
          threadId: postId,
          authorId: user.sub,
          recipientId: post.authorId,
          preview,
          createdAt: insertedReply.createdAt.toISOString(),
          notifyEmail: true,
          notifyPush: true,
        });
      } catch (err) {
        // Non-fatal — log and continue
        logger.warn({ err, postId }, "Failed to publish NATS reply.created event");
      }

      logger.info(
        { replyId: insertedReply.id, postId, authorId: user.sub },
        "Community reply created",
      );

      await reply.status(201).send({
        success: true,
        data: insertedReply,
      });
    },
  );

  // ── POST /api/v1/community/posts/:id/upvote ───────────────────────────────

  app.post(
    "/api/v1/community/posts/:id/upvote",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsResult = PostParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        await sendValidationError(reply, "Invalid post ID");
        return;
      }

      const { id: postId } = paramsResult.data;
      const user = request.authUser!;
      const db = getDb();

      // Check post exists
      const [post] = await db
        .select({ id: posts.id, authorId: posts.authorId })
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.isDeleted, false)))
        .limit(1);

      if (post === undefined) {
        await sendNotFound(reply, "Post not found");
        return;
      }

      // Check existing vote
      const [existingVote] = await db
        .select({ id: postVotes.id, value: postVotes.value })
        .from(postVotes)
        .where(and(eq(postVotes.postId, postId), eq(postVotes.userId, user.sub)))
        .limit(1);

      if (existingVote !== undefined) {
        // Toggle off — remove the vote
        await db.delete(postVotes).where(eq(postVotes.id, existingVote.id));

        await db
          .update(posts)
          .set({ upvotes: sql`upvotes - 1` })
          .where(eq(posts.id, postId));

        // Decrease author reputation
        await incrementReputation(post.authorId, {
          points: -1,
          upvotesReceived: -1,
        });

        await reply.status(200).send({
          success: true,
          data: { voted: false },
        });
        return;
      }

      // Add upvote
      await db.insert(postVotes).values({
        postId,
        userId: user.sub,
        value: 1,
      });

      await db
        .update(posts)
        .set({ upvotes: sql`upvotes + 1` })
        .where(eq(posts.id, postId));

      // Increase author reputation (+1 pt per upvote received)
      await ensureReputation(post.authorId);
      await incrementReputation(post.authorId, {
        points: 1,
        upvotesReceived: 1,
      });

      await reply.status(200).send({
        success: true,
        data: { voted: true },
      });
    },
  );

  // ── POST /api/v1/community/replies/:id/accept ─────────────────────────────

  app.post(
    "/api/v1/community/replies/:id/accept",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsResult = ReplyParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        await sendValidationError(reply, "Invalid reply ID");
        return;
      }

      const { id: replyId } = paramsResult.data;
      const user = request.authUser!;
      const db = getDb();

      // Fetch the reply and its post
      const [targetReply] = await db
        .select({ id: replies.id, postId: replies.postId, isAccepted: replies.isAccepted, authorId: replies.authorId })
        .from(replies)
        .where(and(eq(replies.id, replyId), eq(replies.isDeleted, false)))
        .limit(1);

      if (targetReply === undefined) {
        await sendNotFound(reply, "Reply not found");
        return;
      }

      const [post] = await db
        .select({ id: posts.id, authorId: posts.authorId })
        .from(posts)
        .where(eq(posts.id, targetReply.postId))
        .limit(1);

      if (post === undefined) {
        await sendNotFound(reply, "Post not found");
        return;
      }

      // Only the post author can accept a reply
      if (post.authorId !== user.sub) {
        await sendForbidden(
          reply,
          "Only the post author can accept a reply as best answer",
        );
        return;
      }

      // Unaccept any previously accepted reply on this post
      await db
        .update(replies)
        .set({ isAccepted: false, updatedAt: sql`NOW()` })
        .where(
          and(
            eq(replies.postId, targetReply.postId),
            eq(replies.isAccepted, true),
          ),
        );

      // Toggle: if already accepted, just unaccept; otherwise accept
      const newAcceptedState = !targetReply.isAccepted;

      await db
        .update(replies)
        .set({ isAccepted: newAcceptedState, updatedAt: sql`NOW()` })
        .where(eq(replies.id, replyId));

      // Reward reply author with reputation points for best answer
      if (newAcceptedState) {
        await ensureReputation(targetReply.authorId);
        await incrementReputation(targetReply.authorId, { points: 10 });
      }

      logger.info(
        { replyId, postId: targetReply.postId, accepted: newAcceptedState },
        "Reply accept status toggled",
      );

      await reply.status(200).send({
        success: true,
        data: { replyId, isAccepted: newAcceptedState },
      });
    },
  );

  // ── GET /api/v1/community/search ──────────────────────────────────────────

  app.get(
    "/api/v1/community/search",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const queryResult = SearchQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        await sendValidationError(reply, "Invalid search parameters", {
          issues: queryResult.error.issues,
        });
        return;
      }

      const { q, lang, page, limit } = queryResult.data;
      const db = getDb();
      const offset = (page - 1) * limit;

      // Build tsquery from the search string (websearch_to_tsquery handles phrase/operators)
      const langCondition =
        lang !== undefined ? sql`AND ${posts.language} = ${lang}` : sql``;

      const rows = await db.execute(
        sql`
          SELECT
            p.id,
            p.author_id     AS "authorId",
            p.category_id   AS "categoryId",
            p.title,
            p.language,
            p.tags,
            p.upvotes,
            p.reply_count   AS "replyCount",
            p.view_count    AS "viewCount",
            p.is_pinned     AS "isPinned",
            p.is_closed     AS "isClosed",
            p.created_at    AS "createdAt",
            ts_rank(p.search_vector, websearch_to_tsquery('simple', ${q})) AS rank
          FROM posts p
          WHERE
            p.is_deleted = false
            AND p.search_vector @@ websearch_to_tsquery('simple', ${q})
            ${langCondition}
          ORDER BY rank DESC, p.created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `,
      );

      await reply.status(200).send({
        success: true,
        data: rows.rows,
        meta: { page, limit, query: q },
      });
    },
  );

  // ── GET /api/v1/community/leaderboard ────────────────────────────────────

  app.get(
    "/api/v1/community/leaderboard",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const queryResult = LeaderboardQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        await sendValidationError(reply, "Invalid query parameters");
        return;
      }

      const { limit } = queryResult.data;
      const db = getDb();

      const rows = await db
        .select({
          userId: userReputation.userId,
          points: userReputation.points,
          postsCount: userReputation.postsCount,
          repliesCount: userReputation.repliesCount,
          upvotesReceived: userReputation.upvotesReceived,
          role: userReputation.role,
          updatedAt: userReputation.updatedAt,
        })
        .from(userReputation)
        .orderBy(desc(userReputation.points))
        .limit(limit);

      await reply.status(200).send({
        success: true,
        data: rows,
        meta: { limit },
      });
    },
  );
}
