-- ─────────────────────────────────────────────────────────────────────────────
-- EcomPilot PL — Kong Plugin Schema: ecompilot-plan-limiter
-- Declares the config fields validated by Kong before the plugin runs.
-- ─────────────────────────────────────────────────────────────────────────────

local typedefs = require("kong.db.schema.typedefs")

-- ─── Per-plan limit record ────────────────────────────────────────────────────
-- Each plan entry can declare:
--   blocked  boolean  If true, the plan is entirely denied (403).
--   daily    integer  Max requests per day   (-1 = unlimited).
--   monthly  integer  Max requests per month (-1 = unlimited).
-- At most one of daily / monthly should be set; daily takes precedence.

local plan_limit_schema = {
  type   = "record",
  fields = {
    {
      blocked = {
        type     = "boolean",
        required = false,
        default  = false,
      },
    },
    {
      daily = {
        type     = "integer",
        required = false,
        -- -1 means unlimited; 0 or positive is a real cap.
        gt       = -2,
        default  = nil,
      },
    },
    {
      monthly = {
        type     = "integer",
        required = false,
        gt       = -2,
        default  = nil,
      },
    },
  },
}

-- ─── Plugin schema ────────────────────────────────────────────────────────────

local schema = {
  name = "ecompilot-plan-limiter",

  fields = {
    -- Attach at service, route, or globally.
    { consumer = typedefs.no_consumer },
    { protocols = typedefs.protocols_http },

    {
      config = {
        type   = "record",
        fields = {

          -- ── Plan-limit map ─────────────────────────────────────────────────
          -- Keys are plan names ("free", "pro", "business").
          -- Values follow plan_limit_schema above.
          {
            limits = {
              type     = "map",
              required = true,
              keys     = {
                type        = "string",
                -- Plan names must be non-empty strings, max 64 chars.
                len_min     = 1,
                len_max     = 64,
              },
              values = plan_limit_schema,
            },
          },

          -- ── Redis connection ───────────────────────────────────────────────
          {
            redis_host = {
              type     = "string",
              required = true,
              default  = "redis",
            },
          },
          {
            redis_port = {
              type     = "integer",
              required = true,
              default  = 6379,
              between  = { 1, 65535 },
            },
          },
          {
            redis_password = {
              type      = "string",
              required  = false,
              default   = nil,
              encrypted = true,   -- stored encrypted in Kong DB
              referenceable = true,
            },
          },
          {
            redis_database = {
              type    = "integer",
              required = false,
              default = 0,
              between = { 0, 15 },
            },
          },

          -- ── Key prefix ────────────────────────────────────────────────────
          {
            redis_prefix = {
              type     = "string",
              required = false,
              default  = "ecompilot:plan",
              len_min  = 1,
              len_max  = 128,
            },
          },

        }, -- fields[]

        -- Custom validators run after field-level validation.
        custom_validator = function(config)
          if not config.limits or next(config.limits) == nil then
            return nil, "limits map must contain at least one plan entry"
          end

          for plan_name, plan_cfg in pairs(config.limits) do
            if plan_cfg.daily ~= nil and plan_cfg.monthly ~= nil then
              return nil,
                "plan '" .. plan_name .. "': specify either daily or monthly quota, not both"
            end

            if not plan_cfg.blocked then
              if plan_cfg.daily == nil and plan_cfg.monthly == nil then
                return nil,
                  "plan '" .. plan_name .. "': must specify daily, monthly, or blocked = true"
              end
            end
          end

          return true
        end,

      }, -- config record
    },
  },
}

return schema
