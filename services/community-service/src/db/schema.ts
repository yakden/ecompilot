// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — community-service: Drizzle ORM PostgreSQL schema
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
  pgEnum,
  customType,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Custom tsvector type (PostgreSQL full-text search vector)
// ─────────────────────────────────────────────────────────────────────────────

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const userReputationRoleEnum = pgEnum("user_reputation_role", [
  "member",
  "expert",
  "moderator",
  "admin",
]);

// ─────────────────────────────────────────────────────────────────────────────
// I18n label type — {ru, pl, ua, en}
// ─────────────────────────────────────────────────────────────────────────────

export interface I18nLabel {
  readonly ru: string;
  readonly pl: string;
  readonly ua: string;
  readonly en: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// categories
// ─────────────────────────────────────────────────────────────────────────────

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: jsonb("name").$type<I18nLabel>().notNull(),
    slug: text("slug").notNull().unique(),
    description: jsonb("description").$type<I18nLabel>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    iconEmoji: text("icon_emoji").notNull(),
    /** Restricted to Pro+ plans only */
    isRestricted: boolean("is_restricted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("categories_slug_idx").on(table.slug),
    sortOrderIdx: index("categories_sort_order_idx").on(table.sortOrder),
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// posts
// ─────────────────────────────────────────────────────────────────────────────

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    contentMarkdown: text("content_markdown"),
    language: text("language").notNull().default("ru"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    upvotes: integer("upvotes").notNull().default(0),
    replyCount: integer("reply_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    isPinned: boolean("is_pinned").notNull().default(false),
    isClosed: boolean("is_closed").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),
    /**
     * Generated tsvector column for full-text search.
     * PostgreSQL generates this from title + content using to_tsvector().
     * We declare it as a regular column and maintain it via trigger or
     * on-insert/update logic; Drizzle does not natively support GENERATED ALWAYS.
     */
    searchVector: tsvector("search_vector"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    authorIdIdx: index("posts_author_id_idx").on(table.authorId),
    categoryIdIdx: index("posts_category_id_idx").on(table.categoryId),
    createdAtIdx: index("posts_created_at_idx").on(table.createdAt),
    isPinnedIdx: index("posts_is_pinned_idx").on(table.isPinned),
    isDeletedIdx: index("posts_is_deleted_idx").on(table.isDeleted),
    // GIN index on tsvector for fast full-text search
    searchVectorIdx: index("posts_search_vector_gin_idx")
      .using("gin", table.searchVector),
  }),
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// replies
// ─────────────────────────────────────────────────────────────────────────────

export const replies = pgTable(
  "replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    /** Self-referencing parent — max 3 nesting levels enforced in application logic */
    parentId: uuid("parent_id"),
    authorId: uuid("author_id").notNull(),
    content: text("content").notNull(),
    upvotes: integer("upvotes").notNull().default(0),
    isDeleted: boolean("is_deleted").notNull().default(false),
    /** Best answer mark — post author can accept one reply per post */
    isAccepted: boolean("is_accepted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    postIdIdx: index("replies_post_id_idx").on(table.postId),
    authorIdIdx: index("replies_author_id_idx").on(table.authorId),
    parentIdIdx: index("replies_parent_id_idx").on(table.parentId),
    createdAtIdx: index("replies_created_at_idx").on(table.createdAt),
  }),
);

export type Reply = typeof replies.$inferSelect;
export type NewReply = typeof replies.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// user_reputation
// ─────────────────────────────────────────────────────────────────────────────

export const userReputation = pgTable(
  "user_reputation",
  {
    userId: uuid("user_id").primaryKey(),
    points: integer("points").notNull().default(0),
    postsCount: integer("posts_count").notNull().default(0),
    repliesCount: integer("replies_count").notNull().default(0),
    upvotesReceived: integer("upvotes_received").notNull().default(0),
    role: userReputationRoleEnum("role").notNull().default("member"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pointsIdx: index("user_reputation_points_idx").on(table.points),
    roleIdx: index("user_reputation_role_idx").on(table.role),
  }),
);

export type UserReputation = typeof userReputation.$inferSelect;
export type NewUserReputation = typeof userReputation.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// post_votes
// ─────────────────────────────────────────────────────────────────────────────

export const postVotes = pgTable(
  "post_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    /** 1 = upvote, -1 = downvote */
    value: integer("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    postUserUnique: uniqueIndex("post_votes_post_user_unique_idx").on(
      table.postId,
      table.userId,
    ),
    postIdIdx: index("post_votes_post_id_idx").on(table.postId),
    userIdIdx: index("post_votes_user_id_idx").on(table.userId),
  }),
);

export type PostVote = typeof postVotes.$inferSelect;
export type NewPostVote = typeof postVotes.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const categoriesRelations = relations(categories, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  category: one(categories, {
    fields: [posts.categoryId],
    references: [categories.id],
  }),
  replies: many(replies),
  votes: many(postVotes),
}));

export const repliesRelations = relations(replies, ({ one, many }) => ({
  post: one(posts, {
    fields: [replies.postId],
    references: [posts.id],
  }),
  parent: one(replies, {
    fields: [replies.parentId],
    references: [replies.id],
    relationName: "reply_thread",
  }),
  children: many(replies, { relationName: "reply_thread" }),
}));

export const postVotesRelations = relations(postVotes, ({ one }) => ({
  post: one(posts, {
    fields: [postVotes.postId],
    references: [posts.id],
  }),
}));
