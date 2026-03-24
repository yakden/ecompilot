// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — scripts/push-schemas.ts
//
// Creates all database tables across every service using raw
// CREATE TABLE IF NOT EXISTS SQL.  Run with:
//
//   DATABASE_URL=postgresql://ecompilot:ecompilot_secret@localhost:5432/ecompilot \
//   npx tsx scripts/push-schemas.ts
//
// The script is intentionally dependency-free beyond pg so that it works
// without building any service package first.
// ─────────────────────────────────────────────────────────────────────────────

import pg from "pg";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://ecompilot:ecompilot_secret@localhost:5432/ecompilot";

const { Pool } = pg;

const pool = new Pool({ connectionString: DATABASE_URL });

async function run(sql: string): Promise<void> {
  await pool.query(sql);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createEnumIfNotExists(name: string, values: string[]): Promise<void> {
  const quoted = values.map((v) => `'${v}'`).join(", ");
  // DO $$ … END $$ lets us use IF NOT EXISTS without a separate function
  await run(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}') THEN
        CREATE TYPE ${name} AS ENUM (${quoted});
      END IF;
    END$$;
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// auth-service: users, refresh_tokens, audit_log
// ─────────────────────────────────────────────────────────────────────────────

async function pushAuthService(): Promise<void> {
  console.log("  [auth-service] creating tables...");

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email                    TEXT NOT NULL UNIQUE,
      password_hash            TEXT,
      language                 TEXT NOT NULL DEFAULT 'ru',
      plan                     TEXT NOT NULL DEFAULT 'free',
      email_verified           BOOLEAN NOT NULL DEFAULT FALSE,
      email_verification_token TEXT,
      password_reset_token     TEXT,
      password_reset_expires   TIMESTAMPTZ,
      mfa_enabled              BOOLEAN NOT NULL DEFAULT FALSE,
      mfa_secret               TEXT,
      mfa_backup_codes         JSONB,
      google_id                TEXT UNIQUE,
      apple_id                 TEXT UNIQUE,
      metadata                 JSONB,
      last_login_at            TIMESTAMPTZ,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS users_email_idx     ON users (email);`);
  await run(`CREATE INDEX IF NOT EXISTS users_google_id_idx ON users (google_id);`);

  await run(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL UNIQUE,
      expires_at  TIMESTAMPTZ NOT NULL,
      revoked     BOOLEAN NOT NULL DEFAULT FALSE,
      revoked_at  TIMESTAMPTZ,
      family      TEXT NOT NULL,
      device_info JSONB
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx   ON refresh_tokens (user_id);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON refresh_tokens (token_hash);`);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
      action         TEXT NOT NULL,
      ip_address     TEXT,
      user_agent     TEXT,
      success        BOOLEAN NOT NULL,
      failure_reason TEXT,
      metadata       JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log (user_id);`);
  await run(`CREATE INDEX IF NOT EXISTS audit_log_action_idx  ON audit_log (action);`);

  console.log("  [auth-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// analytics-service: niche_analyses, competitor_snapshots, usage_counters
// ─────────────────────────────────────────────────────────────────────────────

async function pushAnalyticsService(): Promise<void> {
  console.log("  [analytics-service] creating tables...");

  await createEnumIfNotExists("analysis_status", [
    "pending",
    "processing",
    "completed",
    "failed",
  ]);

  await run(`
    CREATE TABLE IF NOT EXISTS niche_analyses (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT NOT NULL,
      keyword       TEXT NOT NULL,
      score         NUMERIC(5, 2),
      result        JSONB,
      status        analysis_status NOT NULL DEFAULT 'pending',
      job_id        TEXT NOT NULL,
      error_message TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS niche_analyses_user_id_idx    ON niche_analyses (user_id);`);
  await run(`CREATE INDEX IF NOT EXISTS niche_analyses_keyword_idx     ON niche_analyses (keyword);`);
  await run(`CREATE INDEX IF NOT EXISTS niche_analyses_job_id_idx      ON niche_analyses (job_id);`);
  await run(`CREATE INDEX IF NOT EXISTS niche_analyses_status_idx      ON niche_analyses (status);`);
  await run(`CREATE INDEX IF NOT EXISTS niche_analyses_created_at_idx  ON niche_analyses (created_at);`);

  await run(`
    CREATE TABLE IF NOT EXISTS competitor_snapshots (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keyword         TEXT NOT NULL,
      seller_id       TEXT NOT NULL,
      seller_name     TEXT NOT NULL,
      rating          NUMERIC(5, 2) NOT NULL DEFAULT 0,
      listings_count  INTEGER NOT NULL DEFAULT 0,
      avg_price       NUMERIC(10, 2) NOT NULL DEFAULT 0,
      snapshot_date   DATE NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS competitor_snapshots_keyword_idx       ON competitor_snapshots (keyword);`);
  await run(`CREATE INDEX IF NOT EXISTS competitor_snapshots_seller_id_idx     ON competitor_snapshots (seller_id);`);
  await run(`CREATE INDEX IF NOT EXISTS competitor_snapshots_snapshot_date_idx ON competitor_snapshots (snapshot_date);`);
  await run(`CREATE INDEX IF NOT EXISTS competitor_snapshots_keyword_seller_idx ON competitor_snapshots (keyword, seller_id);`);

  await run(`
    CREATE TABLE IF NOT EXISTS usage_counters (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL,
      feature    TEXT NOT NULL,
      period     TEXT NOT NULL,
      count      INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS usage_counters_user_period_feature_idx ON usage_counters (user_id, period, feature);`);

  console.log("  [analytics-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// suppliers-service: suppliers, supplier_reviews, partner_clicks,
//                    partner_conversions
// ─────────────────────────────────────────────────────────────────────────────

async function pushSuppliersService(): Promise<void> {
  console.log("  [suppliers-service] creating tables...");

  await createEnumIfNotExists("supplier_type", [
    "china",
    "poland",
    "turkey",
    "eu",
    "dropship",
  ]);

  await createEnumIfNotExists("conversion_status", ["pending", "confirmed", "paid"]);

  await run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                  TEXT NOT NULL,
      slug                  TEXT NOT NULL UNIQUE,
      type                  supplier_type NOT NULL,
      country               TEXT,
      website               TEXT,
      logo_url              TEXT,
      description           JSONB,
      minimum_order_eur     INTEGER,
      categories            TEXT[] NOT NULL DEFAULT '{}',
      platforms             TEXT[] NOT NULL DEFAULT '{}',
      supports_dropship     BOOLEAN NOT NULL DEFAULT FALSE,
      has_baselinker_id     TEXT,
      is_verified           BOOLEAN NOT NULL DEFAULT FALSE,
      rating                NUMERIC(3, 2) NOT NULL DEFAULT 0,
      review_count          INTEGER NOT NULL DEFAULT 0,
      languages             TEXT[] NOT NULL DEFAULT '{}',
      contacts              JSONB,
      shipping_info         JSONB,
      partner_commission_pct NUMERIC(5, 2),
      tags                  TEXT[] NOT NULL DEFAULT '{}',
      is_active             BOOLEAN NOT NULL DEFAULT TRUE,
      is_featured           BOOLEAN NOT NULL DEFAULT FALSE,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS supplier_reviews (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      user_id     UUID NOT NULL,
      rating      INTEGER NOT NULL,
      comment     TEXT,
      language    TEXT,
      pros        TEXT[] NOT NULL DEFAULT '{}',
      cons        TEXT[] NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS partner_clicks (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      supplier_id UUID NOT NULL REFERENCES suppliers(id),
      user_id     UUID,
      utm_source  TEXT,
      ip_address  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS partner_conversions (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      click_id          UUID NOT NULL REFERENCES partner_clicks(id),
      supplier_id       UUID NOT NULL REFERENCES suppliers(id),
      user_id           UUID NOT NULL,
      order_amount      INTEGER NOT NULL,
      commission_amount INTEGER NOT NULL,
      status            conversion_status NOT NULL DEFAULT 'pending',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("  [suppliers-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// calc-service: calculation_history, rate_config
// ─────────────────────────────────────────────────────────────────────────────

async function pushCalcService(): Promise<void> {
  console.log("  [calc-service] creating tables...");

  await createEnumIfNotExists("calculation_type", [
    "margin",
    "zus",
    "allegro-fees",
    "delivery",
    "breakeven",
    "roi",
  ]);

  await run(`
    CREATE TABLE IF NOT EXISTS calculation_history (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL,
      type       calculation_type NOT NULL,
      input      JSONB NOT NULL,
      result     JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS calc_history_user_idx    ON calculation_history (user_id);`);
  await run(`CREATE INDEX IF NOT EXISTS calc_history_type_idx    ON calculation_history (type);`);
  await run(`CREATE INDEX IF NOT EXISTS calc_history_created_idx ON calculation_history (created_at);`);

  await run(`
    CREATE TABLE IF NOT EXISTS rate_config (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key        TEXT NOT NULL,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS rate_config_key_unique_idx ON rate_config (key);`);
  await run(`CREATE INDEX        IF NOT EXISTS rate_config_updated_idx     ON rate_config (updated_at);`);

  console.log("  [calc-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// ai-service: chat_sessions, chat_messages, knowledge_documents
// ─────────────────────────────────────────────────────────────────────────────

async function pushAiService(): Promise<void> {
  console.log("  [ai-service] creating tables...");

  await createEnumIfNotExists("message_role", ["user", "assistant", "system"]);

  await run(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL,
      title           TEXT NOT NULL DEFAULT 'New conversation',
      language        TEXT NOT NULL DEFAULT 'en',
      message_count   INTEGER NOT NULL DEFAULT 0,
      last_message_at TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role       message_role NOT NULL,
      content    TEXT NOT NULL,
      tokens     INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title      TEXT NOT NULL,
      content    TEXT NOT NULL,
      category   TEXT NOT NULL,
      language   TEXT NOT NULL,
      vector_id  TEXT NOT NULL,
      indexed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("  [ai-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// billing-service: subscriptions, webhook_events, invoices
// ─────────────────────────────────────────────────────────────────────────────

async function pushBillingService(): Promise<void> {
  console.log("  [billing-service] creating tables...");

  await run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                 UUID NOT NULL UNIQUE,
      stripe_customer_id      TEXT NOT NULL UNIQUE,
      stripe_subscription_id  TEXT UNIQUE,
      plan                    TEXT NOT NULL DEFAULT 'free',
      interval                TEXT,
      status                  TEXT NOT NULL DEFAULT 'active',
      current_period_start    TIMESTAMPTZ,
      current_period_end      TIMESTAMPTZ,
      cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
      trial_end               TIMESTAMPTZ,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_idx              ON subscriptions (user_id);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_idx   ON subscriptions (stripe_customer_id);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx ON subscriptions (stripe_subscription_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS subscriptions_plan_idx                 ON subscriptions (plan);`);
  await run(`CREATE INDEX        IF NOT EXISTS subscriptions_status_idx               ON subscriptions (status);`);

  await run(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id           TEXT PRIMARY KEY,
      type         TEXT NOT NULL,
      payload      JSONB NOT NULL,
      processed    BOOLEAN NOT NULL DEFAULT FALSE,
      processed_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS webhook_events_type_idx       ON webhook_events (type);`);
  await run(`CREATE INDEX IF NOT EXISTS webhook_events_processed_idx  ON webhook_events (processed);`);
  await run(`CREATE INDEX IF NOT EXISTS webhook_events_created_at_idx ON webhook_events (created_at);`);

  await run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID NOT NULL,
      stripe_invoice_id TEXT NOT NULL UNIQUE,
      amount            INTEGER NOT NULL,
      currency          TEXT NOT NULL DEFAULT 'eur',
      status            TEXT NOT NULL,
      pdf_url           TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS invoices_user_id_idx          ON invoices (user_id);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS invoices_stripe_invoice_id_idx ON invoices (stripe_invoice_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS invoices_status_idx            ON invoices (status);`);
  await run(`CREATE INDEX        IF NOT EXISTS invoices_created_at_idx        ON invoices (created_at);`);

  console.log("  [billing-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// content-service: generated_content, usage_counters
// (usage_counters table name re-used — we add a schema prefix note)
// ─────────────────────────────────────────────────────────────────────────────

async function pushContentService(): Promise<void> {
  console.log("  [content-service] creating tables...");

  await createEnumIfNotExists("content_type", [
    "thumbnail",
    "description",
    "background_removal",
    "translation",
  ]);

  await createEnumIfNotExists("content_status", [
    "pending",
    "processing",
    "completed",
    "failed",
  ]);

  await run(`
    CREATE TABLE IF NOT EXISTS generated_content (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL,
      type         content_type NOT NULL,
      status       content_status NOT NULL DEFAULT 'pending',
      input        JSONB NOT NULL,
      result       JSONB,
      job_id       TEXT,
      tokens_used  INTEGER,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_generated_content_user_id    ON generated_content (user_id);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_generated_content_job_id     ON generated_content (job_id);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_generated_content_status     ON generated_content (status);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_generated_content_type       ON generated_content (type);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_generated_content_created_at ON generated_content (created_at);`);

  // content-service has its own usage_counters table (different from analytics)
  // Both share the same table name in the single shared DB — they are the same table
  // so we ensure it exists with the superset of columns.
  await run(`
    CREATE TABLE IF NOT EXISTS content_usage_counters (
      id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      feature TEXT NOT NULL,
      period  TEXT NOT NULL,
      count   INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT uq_content_usage_counters_user_feature_period UNIQUE (user_id, feature, period)
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_content_usage_counters_user_id ON content_usage_counters (user_id);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_content_usage_counters_period  ON content_usage_counters (period);`);

  console.log("  [content-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// legal-service: legal_topics, legal_limits
// ─────────────────────────────────────────────────────────────────────────────

async function pushLegalService(): Promise<void> {
  console.log("  [legal-service] creating tables...");

  await run(`
    CREATE TABLE IF NOT EXISTS legal_topics (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug         TEXT NOT NULL UNIQUE,
      title_ru     TEXT NOT NULL,
      title_pl     TEXT NOT NULL,
      title_ua     TEXT NOT NULL,
      title_en     TEXT NOT NULL,
      content_ru   TEXT NOT NULL,
      content_pl   TEXT NOT NULL,
      content_ua   TEXT NOT NULL,
      content_en   TEXT NOT NULL,
      faq_ru       JSONB NOT NULL DEFAULT '[]',
      faq_pl       JSONB NOT NULL DEFAULT '[]',
      faq_ua       JSONB NOT NULL DEFAULT '[]',
      faq_en       JSONB NOT NULL DEFAULT '[]',
      category     TEXT NOT NULL,
      tags         TEXT[] NOT NULL DEFAULT '{}',
      sort_order   INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_legal_topics_category  ON legal_topics (category);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_legal_topics_sort      ON legal_topics (sort_order);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_legal_topics_published ON legal_topics (is_published);`);

  await run(`
    CREATE TABLE IF NOT EXISTS legal_limits (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      year        INTEGER NOT NULL,
      key         TEXT NOT NULL,
      value       JSONB NOT NULL,
      description TEXT NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_legal_limits_year_key UNIQUE (year, key)
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_legal_limits_year ON legal_limits (year);`);

  console.log("  [legal-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// academy-service: courses, lessons, user_progress, certificates
// ─────────────────────────────────────────────────────────────────────────────

async function pushAcademyService(): Promise<void> {
  console.log("  [academy-service] creating tables...");

  await createEnumIfNotExists("course_level", ["beginner", "intermediate", "advanced"]);

  await createEnumIfNotExists("course_category", [
    "allegro",
    "import",
    "legal",
    "dropship",
    "ads",
    "amazon",
  ]);

  await run(`
    CREATE TABLE IF NOT EXISTS courses (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug                TEXT NOT NULL UNIQUE,
      title_ru            TEXT NOT NULL,
      title_pl            TEXT NOT NULL,
      title_ua            TEXT NOT NULL,
      title_en            TEXT NOT NULL,
      description_ru      TEXT NOT NULL,
      description_pl      TEXT NOT NULL,
      description_ua      TEXT NOT NULL,
      description_en      TEXT NOT NULL,
      level               course_level NOT NULL,
      category            course_category NOT NULL,
      thumbnail_url       TEXT,
      total_duration_min  INTEGER NOT NULL DEFAULT 0,
      lesson_count        INTEGER NOT NULL DEFAULT 0,
      is_published        BOOLEAN NOT NULL DEFAULT TRUE,
      is_free             BOOLEAN NOT NULL DEFAULT FALSE,
      price_eur           NUMERIC(10, 2),
      required_plan       TEXT NOT NULL DEFAULT 'pro',
      sort_order          INTEGER NOT NULL DEFAULT 0,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS lessons (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title_ru       TEXT NOT NULL,
      title_pl       TEXT NOT NULL,
      title_ua       TEXT NOT NULL,
      title_en       TEXT NOT NULL,
      video_url      TEXT NOT NULL,
      duration_min   INTEGER NOT NULL DEFAULT 0,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      is_preview     BOOLEAN NOT NULL DEFAULT FALSE,
      transcript_ru  TEXT,
      transcript_pl  TEXT,
      resources_json JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_progress (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL,
      course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      lesson_id    UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      watched_pct  INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMPTZ
    );
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS user_progress_user_lesson_idx
      ON user_progress (user_id, lesson_id);
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS certificates (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID NOT NULL,
      course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      certificate_url   TEXT,
      verification_code TEXT NOT NULL UNIQUE
    );
  `);

  console.log("  [academy-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// community-service: categories, posts, replies, user_reputation, post_votes
// ─────────────────────────────────────────────────────────────────────────────

async function pushCommunityService(): Promise<void> {
  console.log("  [community-service] creating tables...");

  await createEnumIfNotExists("user_reputation_role", [
    "member",
    "expert",
    "moderator",
    "admin",
  ]);

  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          JSONB NOT NULL,
      slug          TEXT NOT NULL UNIQUE,
      description   JSONB NOT NULL,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      icon_emoji    TEXT NOT NULL,
      is_restricted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_idx       ON categories (slug);`);
  await run(`CREATE INDEX        IF NOT EXISTS categories_sort_order_idx ON categories (sort_order);`);

  await run(`
    CREATE TABLE IF NOT EXISTS posts (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      author_id        UUID NOT NULL,
      category_id      UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      title            TEXT NOT NULL,
      content          TEXT NOT NULL,
      content_markdown TEXT,
      language         TEXT NOT NULL DEFAULT 'ru',
      tags             TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
      upvotes          INTEGER NOT NULL DEFAULT 0,
      reply_count      INTEGER NOT NULL DEFAULT 0,
      view_count       INTEGER NOT NULL DEFAULT 0,
      is_pinned        BOOLEAN NOT NULL DEFAULT FALSE,
      is_closed        BOOLEAN NOT NULL DEFAULT FALSE,
      is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
      search_vector    TSVECTOR,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS posts_author_id_idx   ON posts (author_id);`);
  await run(`CREATE INDEX IF NOT EXISTS posts_category_id_idx ON posts (category_id);`);
  await run(`CREATE INDEX IF NOT EXISTS posts_created_at_idx  ON posts (created_at);`);
  await run(`CREATE INDEX IF NOT EXISTS posts_is_pinned_idx   ON posts (is_pinned);`);
  await run(`CREATE INDEX IF NOT EXISTS posts_is_deleted_idx  ON posts (is_deleted);`);
  await run(`CREATE INDEX IF NOT EXISTS posts_search_vector_gin_idx ON posts USING gin (search_vector);`);

  await run(`
    CREATE TABLE IF NOT EXISTS replies (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      parent_id   UUID,
      author_id   UUID NOT NULL,
      content     TEXT NOT NULL,
      upvotes     INTEGER NOT NULL DEFAULT 0,
      is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
      is_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS replies_post_id_idx   ON replies (post_id);`);
  await run(`CREATE INDEX IF NOT EXISTS replies_author_id_idx ON replies (author_id);`);
  await run(`CREATE INDEX IF NOT EXISTS replies_parent_id_idx ON replies (parent_id);`);
  await run(`CREATE INDEX IF NOT EXISTS replies_created_at_idx ON replies (created_at);`);

  await run(`
    CREATE TABLE IF NOT EXISTS user_reputation (
      user_id          UUID PRIMARY KEY,
      points           INTEGER NOT NULL DEFAULT 0,
      posts_count      INTEGER NOT NULL DEFAULT 0,
      replies_count    INTEGER NOT NULL DEFAULT 0,
      upvotes_received INTEGER NOT NULL DEFAULT 0,
      role             user_reputation_role NOT NULL DEFAULT 'member',
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS user_reputation_points_idx ON user_reputation (points);`);
  await run(`CREATE INDEX IF NOT EXISTS user_reputation_role_idx   ON user_reputation (role);`);

  await run(`
    CREATE TABLE IF NOT EXISTS post_votes (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    UUID NOT NULL,
      value      INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS post_votes_post_user_unique_idx ON post_votes (post_id, user_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS post_votes_post_id_idx          ON post_votes (post_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS post_votes_user_id_idx          ON post_votes (user_id);`);

  console.log("  [community-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// notification-service: notification_preferences, in_app_notifications,
//                       fcm_tokens
// ─────────────────────────────────────────────────────────────────────────────

async function pushNotificationService(): Promise<void> {
  console.log("  [notification-service] creating tables...");

  await run(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL UNIQUE,
      email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      push_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
      in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      channels      JSONB DEFAULT '{}',
      language      TEXT NOT NULL DEFAULT 'ru',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_user_id_idx ON notification_preferences (user_id);`);

  await run(`
    CREATE TABLE IF NOT EXISTS in_app_notifications (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      data       JSONB,
      is_read    BOOLEAN NOT NULL DEFAULT FALSE,
      read_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS in_app_notifications_user_id_idx          ON in_app_notifications (user_id);`);
  await run(`CREATE INDEX IF NOT EXISTS in_app_notifications_is_read_idx           ON in_app_notifications (is_read);`);
  await run(`CREATE INDEX IF NOT EXISTS in_app_notifications_user_id_is_read_idx   ON in_app_notifications (user_id, is_read);`);

  await run(`
    CREATE TABLE IF NOT EXISTS fcm_tokens (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL,
      token       TEXT NOT NULL UNIQUE,
      device_info JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS fcm_tokens_user_id_idx ON fcm_tokens (user_id);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS fcm_tokens_token_idx   ON fcm_tokens (token);`);

  console.log("  [notification-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// marketplace-hub: seller_accounts, product_listings, orders,
//                  stock_reservations, idempotency_keys
// ─────────────────────────────────────────────────────────────────────────────

async function pushMarketplaceHub(): Promise<void> {
  console.log("  [marketplace-hub] creating tables...");

  await createEnumIfNotExists("marketplace_platform", [
    "allegro",
    "amazon",
    "ebay",
    "etsy",
    "olx",
    "vinted",
    "empik",
    "erli",
  ]);

  await createEnumIfNotExists("listing_status", [
    "draft",
    "pending",
    "active",
    "inactive",
    "rejected",
    "ended",
  ]);

  await createEnumIfNotExists("order_status", [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "returned",
    "refunded",
  ]);

  await createEnumIfNotExists("reservation_status", [
    "active",
    "fulfilled",
    "expired",
    "cancelled",
  ]);

  await run(`
    CREATE TABLE IF NOT EXISTS seller_accounts (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                 UUID NOT NULL,
      platform                marketplace_platform NOT NULL,
      platform_user_id        TEXT NOT NULL,
      account_name            TEXT,
      encrypted_access_token  TEXT NOT NULL,
      encrypted_refresh_token TEXT NOT NULL,
      token_expires_at        TIMESTAMPTZ NOT NULL,
      scopes                  TEXT[],
      active                  BOOLEAN NOT NULL DEFAULT TRUE,
      last_refreshed_at       TIMESTAMPTZ,
      capabilities            JSONB,
      last_error_message      TEXT,
      last_error_at           TIMESTAMPTZ,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS seller_accounts_user_id_idx       ON seller_accounts (user_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS seller_accounts_platform_idx      ON seller_accounts (platform);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS seller_accounts_user_platform_uq  ON seller_accounts (user_id, platform);`);

  await run(`
    CREATE TABLE IF NOT EXISTS product_listings (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id           UUID NOT NULL REFERENCES seller_accounts(id) ON DELETE CASCADE,
      platform             marketplace_platform NOT NULL,
      sku                  TEXT NOT NULL,
      ean                  TEXT,
      external_offer_id    TEXT,
      status               listing_status NOT NULL DEFAULT 'draft',
      last_synced_product  JSONB,
      last_synced_at       TIMESTAMPTZ,
      listing_url          TEXT,
      published_price_grosze INTEGER,
      published_stock      INTEGER,
      rejection_reason     TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS product_listings_account_id_idx       ON product_listings (account_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS product_listings_sku_idx               ON product_listings (sku);`);
  await run(`CREATE INDEX        IF NOT EXISTS product_listings_platform_idx          ON product_listings (platform);`);
  await run(`CREATE INDEX        IF NOT EXISTS product_listings_external_offer_id_idx ON product_listings (external_offer_id);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS product_listings_sku_platform_account_uq ON product_listings (sku, platform, account_id);`);

  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id               UUID NOT NULL REFERENCES seller_accounts(id) ON DELETE RESTRICT,
      platform                 marketplace_platform NOT NULL,
      marketplace_order_id     TEXT NOT NULL,
      status                   order_status NOT NULL DEFAULT 'pending',
      encrypted_buyer_name     TEXT NOT NULL,
      encrypted_buyer_email    TEXT NOT NULL,
      encrypted_buyer_phone    TEXT,
      shipping_city            TEXT,
      shipping_postal_code     TEXT,
      shipping_country_code    TEXT NOT NULL DEFAULT 'PL',
      encrypted_shipping_street TEXT,
      shipping_carrier         TEXT,
      tracking_number          TEXT,
      shipped_at               TIMESTAMPTZ,
      estimated_delivery_at    TIMESTAMPTZ,
      payment_method           TEXT,
      payment_status           TEXT NOT NULL DEFAULT 'pending',
      total_price_grosze       INTEGER NOT NULL,
      paid_at                  TIMESTAMPTZ,
      external_payment_id      TEXT,
      items                    JSONB NOT NULL,
      marketplace_created_at   TIMESTAMPTZ NOT NULL,
      confirmed_at             TIMESTAMPTZ,
      cancelled_at             TIMESTAMPTZ,
      delivered_at             TIMESTAMPTZ,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS orders_account_id_idx           ON orders (account_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS orders_platform_idx              ON orders (platform);`);
  await run(`CREATE INDEX        IF NOT EXISTS orders_status_idx                ON orders (status);`);
  await run(`CREATE INDEX        IF NOT EXISTS orders_marketplace_created_at_idx ON orders (marketplace_created_at);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS orders_platform_order_uq         ON orders (platform, marketplace_order_id, account_id);`);

  await run(`
    CREATE TABLE IF NOT EXISTS stock_reservations (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sku               TEXT NOT NULL,
      reserved_quantity INTEGER NOT NULL,
      status            reservation_status NOT NULL DEFAULT 'active',
      order_id          UUID REFERENCES orders(id) ON DELETE SET NULL,
      platform          marketplace_platform,
      expires_at        TIMESTAMPTZ NOT NULL,
      fulfilled_at      TIMESTAMPTZ,
      cancelled_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS stock_reservations_sku_idx        ON stock_reservations (sku);`);
  await run(`CREATE INDEX IF NOT EXISTS stock_reservations_status_idx     ON stock_reservations (status);`);
  await run(`CREATE INDEX IF NOT EXISTS stock_reservations_expires_at_idx ON stock_reservations (expires_at);`);
  await run(`CREATE INDEX IF NOT EXISTS stock_reservations_order_id_idx   ON stock_reservations (order_id);`);

  await run(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key          TEXT NOT NULL,
      source       TEXT NOT NULL,
      result_code  INTEGER,
      result_body  JSONB,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at   TIMESTAMPTZ NOT NULL
    );
  `);

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_key_source_uq  ON idempotency_keys (key, source);`);
  await run(`CREATE INDEX        IF NOT EXISTS idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);`);

  console.log("  [marketplace-hub] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// logistics-engine: shipments, tracking_events, carrier_credentials
// ─────────────────────────────────────────────────────────────────────────────

async function pushLogisticsEngine(): Promise<void> {
  console.log("  [logistics-engine] creating tables...");

  await createEnumIfNotExists("shipment_status", [
    "created",
    "label_ready",
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "ready_for_pickup",
    "delivered",
    "failed_delivery",
    "returned",
    "cancelled",
    "exception",
  ]);

  await createEnumIfNotExists("carrier_code", [
    "inpost",
    "dpd",
    "dhl_domestic",
    "dhl_express",
    "orlen",
    "gls",
    "poczta_polska",
  ]);

  await createEnumIfNotExists("label_format", [
    "PDF",
    "ZPL_200DPI",
    "ZPL_300DPI",
    "EPL",
    "PNG",
  ]);

  await createEnumIfNotExists("tracking_event_status", [
    "created",
    "label_ready",
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "ready_for_pickup",
    "delivered",
    "failed_delivery",
    "returned",
    "cancelled",
    "exception",
  ]);

  await run(`
    CREATE TABLE IF NOT EXISTS shipments (
      id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id                  UUID NOT NULL,
      user_id                   UUID NOT NULL,
      organization_id           UUID,
      carrier                   carrier_code NOT NULL,
      carrier_shipment_id       VARCHAR(100),
      tracking_number           VARCHAR(100),
      service_type              VARCHAR(50),
      status                    shipment_status NOT NULL DEFAULT 'created',
      receiver_encrypted        TEXT NOT NULL,
      label_s3_url              TEXT,
      label_format              label_format,
      return_label_s3_url       TEXT,
      is_cod                    BOOLEAN NOT NULL DEFAULT FALSE,
      cod_amount                NUMERIC(10, 2),
      cod_bank_account          VARCHAR(34),
      weight_kg                 NUMERIC(7, 3),
      length_cm                 NUMERIC(7, 1),
      width_cm                  NUMERIC(7, 1),
      height_cm                 NUMERIC(7, 1),
      parcel_size               VARCHAR(10),
      is_locker_delivery        BOOLEAN NOT NULL DEFAULT FALSE,
      target_pickup_point_id    VARCHAR(100),
      insurance_amount          NUMERIC(10, 2),
      pickup_confirmation_number VARCHAR(100),
      estimated_delivery_at     TIMESTAMPTZ,
      reference                 VARCHAR(255),
      raw_carrier_response      JSONB,
      created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at              TIMESTAMPTZ,
      deleted_at                TIMESTAMPTZ
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS shipments_order_id_idx       ON shipments (order_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS shipments_user_id_idx        ON shipments (user_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS shipments_organization_id_idx ON shipments (organization_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS shipments_carrier_idx        ON shipments (carrier);`);
  await run(`CREATE INDEX        IF NOT EXISTS shipments_status_idx         ON shipments (status);`);
  await run(`CREATE INDEX        IF NOT EXISTS shipments_created_at_idx     ON shipments (created_at);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS shipments_tracking_number_unique ON shipments (tracking_number);`);

  await run(`
    CREATE TABLE IF NOT EXISTS tracking_events (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shipment_id    UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      tracking_number VARCHAR(100) NOT NULL,
      carrier        carrier_code NOT NULL,
      status         tracking_event_status NOT NULL,
      raw_status     VARCHAR(100) NOT NULL,
      occurred_at    TIMESTAMPTZ NOT NULL,
      location       VARCHAR(255),
      description    TEXT,
      attributes     JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS tracking_events_shipment_id_idx    ON tracking_events (shipment_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS tracking_events_tracking_number_idx ON tracking_events (tracking_number);`);
  await run(`CREATE INDEX        IF NOT EXISTS tracking_events_occurred_at_idx     ON tracking_events (occurred_at);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS tracking_events_unique_event_idx    ON tracking_events (tracking_number, raw_status, occurred_at);`);

  await run(`
    CREATE TABLE IF NOT EXISTS carrier_credentials (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id         UUID NOT NULL,
      carrier                 carrier_code NOT NULL,
      api_token_encrypted     TEXT,
      api_secret_encrypted    TEXT,
      username_encrypted      TEXT,
      account_id_encrypted    TEXT,
      carrier_organization_id VARCHAR(100),
      is_active               BOOLEAN NOT NULL DEFAULT TRUE,
      environment             VARCHAR(10) NOT NULL DEFAULT 'production',
      password_expires_at     TIMESTAMPTZ,
      last_verified_at        TIMESTAMPTZ,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by_user_id      UUID,
      updated_by_user_id      UUID
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS carrier_creds_organization_id_idx    ON carrier_credentials (organization_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS carrier_creds_carrier_idx            ON carrier_credentials (carrier);`);
  await run(`CREATE INDEX        IF NOT EXISTS carrier_creds_password_expires_at_idx ON carrier_credentials (password_expires_at);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS carrier_creds_org_carrier_env_unique  ON carrier_credentials (organization_id, carrier, environment);`);

  console.log("  [logistics-engine] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// ksef-service: invoices (ksef), ksef_sessions, ksef_credentials
// ─────────────────────────────────────────────────────────────────────────────

async function pushKsefService(): Promise<void> {
  console.log("  [ksef-service] creating tables...");

  await run(`
    CREATE TABLE IF NOT EXISTS ksef_invoices (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                 UUID NOT NULL,
      invoice_number          TEXT NOT NULL,
      invoice_type            TEXT NOT NULL DEFAULT 'VAT',
      status                  TEXT NOT NULL DEFAULT 'draft',
      xml_content             TEXT NOT NULL,
      ksef_number             TEXT,
      ksef_reference_number   TEXT,
      seller_nip              TEXT NOT NULL,
      buyer_nip               TEXT,
      net_amount              INTEGER NOT NULL,
      vat_amount              INTEGER NOT NULL,
      gross_amount            INTEGER NOT NULL,
      jpk_marker              TEXT,
      gtu_codes               TEXT[],
      payment_method          TEXT NOT NULL DEFAULT 'przelew',
      issue_date              TEXT NOT NULL,
      ksef_accepted_at        TIMESTAMPTZ,
      offline_submit_deadline TIMESTAMPTZ,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS invoices_user_id_idx             ON ksef_invoices (user_id);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_idx      ON ksef_invoices (invoice_number);`);
  await run(`CREATE INDEX        IF NOT EXISTS invoices_status_idx              ON ksef_invoices (status);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS invoices_ksef_reference_number_idx ON ksef_invoices (ksef_reference_number);`);
  await run(`CREATE INDEX        IF NOT EXISTS invoices_seller_nip_idx          ON ksef_invoices (seller_nip);`);
  await run(`CREATE INDEX        IF NOT EXISTS invoices_issue_date_idx          ON ksef_invoices (issue_date);`);
  await run(`CREATE INDEX        IF NOT EXISTS invoices_jpk_marker_idx          ON ksef_invoices (jpk_marker);`);
  await run(`CREATE INDEX        IF NOT EXISTS invoices_created_at_idx          ON ksef_invoices (created_at);`);
  await run(`CREATE INDEX        IF NOT EXISTS invoices_offline_deadline_idx    ON ksef_invoices (offline_submit_deadline);`);

  await run(`
    CREATE TABLE IF NOT EXISTS ksef_sessions (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL,
      session_type     TEXT NOT NULL,
      reference_number TEXT NOT NULL UNIQUE,
      status           TEXT NOT NULL DEFAULT 'opening',
      environment      TEXT NOT NULL,
      session_token    TEXT,
      token_expires_at TIMESTAMPTZ,
      opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at        TIMESTAMPTZ
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS ksef_sessions_user_id_idx          ON ksef_sessions (user_id);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS ksef_sessions_reference_number_idx ON ksef_sessions (reference_number);`);
  await run(`CREATE INDEX        IF NOT EXISTS ksef_sessions_status_idx           ON ksef_sessions (status);`);
  await run(`CREATE INDEX        IF NOT EXISTS ksef_sessions_environment_idx      ON ksef_sessions (environment);`);
  await run(`CREATE INDEX        IF NOT EXISTS ksef_sessions_opened_at_idx        ON ksef_sessions (opened_at);`);

  await run(`
    CREATE TABLE IF NOT EXISTS ksef_credentials (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL,
      environment     TEXT NOT NULL,
      auth_method     TEXT NOT NULL DEFAULT 'token',
      encrypted_token TEXT NOT NULL,
      nip_number      TEXT NOT NULL,
      is_active       TEXT NOT NULL DEFAULT 'true',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS ksef_credentials_user_id_idx ON ksef_credentials (user_id);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS ksef_credentials_user_env_idx ON ksef_credentials (user_id, environment);`);
  await run(`CREATE INDEX        IF NOT EXISTS ksef_credentials_nip_idx     ON ksef_credentials (nip_number);`);

  console.log("  [ksef-service] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// payment-reconciliation: transactions, refunds, reconciliation_reports,
//                         gateway_credentials
// ─────────────────────────────────────────────────────────────────────────────

async function pushPaymentReconciliation(): Promise<void> {
  console.log("  [payment-reconciliation] creating tables...");

  await createEnumIfNotExists("gateway_code", [
    "przelewy24",
    "payu",
    "tpay",
    "paynow",
    "imoje",
  ]);

  await createEnumIfNotExists("currency", ["PLN", "EUR", "GBP", "USD", "CZK"]);

  await createEnumIfNotExists("transaction_status", [
    "pending",
    "waiting_for_payment",
    "processing",
    "completed",
    "failed",
    "cancelled",
    "refunded",
    "partially_refunded",
    "disputed",
    "chargeback",
  ]);

  await createEnumIfNotExists("payment_method", [
    "blik",
    "blik_recurring",
    "card",
    "bank_transfer",
    "pbl",
    "installments",
    "bnpl",
    "b2b_bnpl",
    "apple_pay",
    "google_pay",
  ]);

  await createEnumIfNotExists("refund_status", [
    "pending",
    "processing",
    "completed",
    "failed",
    "cancelled",
  ]);

  await createEnumIfNotExists("reconciliation_status", [
    "pending",
    "completed",
    "failed",
  ]);

  await createEnumIfNotExists("discrepancy_type", [
    "order_without_payment",
    "payment_without_order",
    "amount_mismatch",
    "missing_b2b_invoice",
    "refund_without_credit_note",
    "duplicate_payment",
    "currency_mismatch",
    "status_mismatch",
  ]);

  await run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      gateway_code          gateway_code NOT NULL,
      gateway_transaction_id TEXT NOT NULL,
      order_id              UUID,
      seller_id             UUID NOT NULL,
      organization_id       UUID,
      amount_grosze         INTEGER NOT NULL,
      fee_grosze            INTEGER NOT NULL DEFAULT 0,
      net_grosze            INTEGER NOT NULL DEFAULT 0,
      currency              currency NOT NULL DEFAULT 'PLN',
      status                transaction_status NOT NULL DEFAULT 'pending',
      payment_method        payment_method,
      return_url            TEXT NOT NULL,
      notify_url            TEXT NOT NULL,
      description           TEXT NOT NULL,
      language              TEXT NOT NULL DEFAULT 'pl',
      gateway_metadata      JSONB NOT NULL DEFAULT '{}',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at          TIMESTAMPTZ,
      expires_at            TIMESTAMPTZ
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS transactions_seller_id_idx   ON transactions (seller_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS transactions_order_id_idx    ON transactions (order_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS transactions_status_idx      ON transactions (status);`);
  await run(`CREATE INDEX        IF NOT EXISTS transactions_created_at_idx  ON transactions (created_at);`);
  await run(`CREATE INDEX        IF NOT EXISTS transactions_gateway_code_idx ON transactions (gateway_code);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS transactions_gateway_tx_id_uidx ON transactions (gateway_code, gateway_transaction_id);`);

  await run(`
    CREATE TABLE IF NOT EXISTS refunds (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id    UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
      gateway_code      gateway_code NOT NULL,
      gateway_refund_id TEXT,
      amount_grosze     INTEGER NOT NULL,
      currency          currency NOT NULL DEFAULT 'PLN',
      status            refund_status NOT NULL DEFAULT 'pending',
      reason            TEXT NOT NULL,
      credit_note_issued BOOLEAN NOT NULL DEFAULT FALSE,
      credit_note_id    UUID,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at      TIMESTAMPTZ
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS refunds_transaction_id_idx   ON refunds (transaction_id);`);
  await run(`CREATE INDEX IF NOT EXISTS refunds_status_idx            ON refunds (status);`);
  await run(`CREATE INDEX IF NOT EXISTS refunds_gateway_refund_id_idx ON refunds (gateway_refund_id);`);

  await run(`
    CREATE TABLE IF NOT EXISTS reconciliation_reports (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reconciled_date      TEXT NOT NULL,
      seller_id            UUID,
      total_orders         INTEGER NOT NULL DEFAULT 0,
      total_transactions   INTEGER NOT NULL DEFAULT 0,
      total_invoices       INTEGER NOT NULL DEFAULT 0,
      matched_count        INTEGER NOT NULL DEFAULT 0,
      discrepancy_count    INTEGER NOT NULL DEFAULT 0,
      discrepancies        JSONB NOT NULL DEFAULT '[]',
      total_revenue_grosze INTEGER NOT NULL DEFAULT 0,
      total_fees_grosze    INTEGER NOT NULL DEFAULT 0,
      total_net_grosze     INTEGER NOT NULL DEFAULT 0,
      status               reconciliation_status NOT NULL DEFAULT 'pending',
      error_message        TEXT,
      generated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS reconciliation_reports_date_idx   ON reconciliation_reports (reconciled_date);`);
  await run(`CREATE INDEX        IF NOT EXISTS reconciliation_reports_seller_idx ON reconciliation_reports (seller_id);`);
  await run(`CREATE INDEX        IF NOT EXISTS reconciliation_reports_status_idx ON reconciliation_reports (status);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_reports_date_seller_uidx ON reconciliation_reports (reconciled_date, seller_id);`);

  await run(`
    CREATE TABLE IF NOT EXISTS gateway_credentials (
      id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id              UUID NOT NULL,
      gateway_code           gateway_code NOT NULL,
      encrypted_credentials  TEXT NOT NULL,
      is_active              BOOLEAN NOT NULL DEFAULT TRUE,
      is_sandbox             BOOLEAN NOT NULL DEFAULT FALSE,
      commission_rate_override NUMERIC(6, 4),
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at             TIMESTAMPTZ
    );
  `);

  await run(`CREATE INDEX        IF NOT EXISTS gateway_credentials_seller_idx          ON gateway_credentials (seller_id);`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS gateway_credentials_seller_gateway_uidx ON gateway_credentials (seller_id, gateway_code);`);

  console.log("  [payment-reconciliation] done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("EcomPilot PL — push-schemas");
  console.log(`Target: ${DATABASE_URL.replace(/:([^:@]+)@/, ":***@")}`);
  console.log("");

  try {
    await pushAuthService();
    await pushAnalyticsService();
    await pushSuppliersService();
    await pushCalcService();
    await pushAiService();
    await pushBillingService();
    await pushContentService();
    await pushLegalService();
    await pushAcademyService();
    await pushCommunityService();
    await pushNotificationService();
    await pushMarketplaceHub();
    await pushLogisticsEngine();
    await pushKsefService();
    await pushPaymentReconciliation();

    console.log("");
    console.log("All schemas pushed successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("push-schemas failed:", err);
  process.exit(1);
});
