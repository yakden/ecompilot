-- ─────────────────────────────────────────────────────────────────────────────
-- EcomPilot PL — Kong Plugin: ecompilot-plan-limiter
-- Enforces per-plan API quotas using Redis counters.
--
-- Decision matrix:
--   blocked: true  => 403 PLAN_LIMIT_EXCEEDED (plan has no access at all)
--   quota    > 0   => count usage; 429 MONTHLY_LIMIT_EXCEEDED when exhausted
--   quota   == -1  => unlimited; pass through immediately
--
-- Redis key schema:
--   {prefix}:{userId}:{window}:{uri_slug}
-- where window is:
--   daily   => YYYY-MM-DD
--   monthly => YYYY-MM
-- ─────────────────────────────────────────────────────────────────────────────

local BasePlugin = require("kong.plugins.base_plugin")
local redis      = require("resty.redis")

-- ─── Priority ────────────────────────────────────────────────────────────────
-- Runs after JWT (1005) and request-transformer (801) but before the upstream.
local EcomPilotPlanLimiter = {
  PRIORITY = 900,
  VERSION  = "1.0.0",
}

-- ─── Helpers ─────────────────────────────────────────────────────────────────

--- Connects to Redis and returns the client or raises a Kong error.
---@param conf table Plugin configuration
---@return table redis_client
local function connect_redis(conf)
  local red = redis:new()
  red:set_timeout(1000) -- 1 second

  local ok, err = red:connect(conf.redis_host, conf.redis_port)
  if not ok then
    kong.log.err("ecompilot-plan-limiter: Redis connect failed: ", err)
    return kong.response.exit(503, {
      error = {
        code    = "SERVICE_UNAVAILABLE",
        message = "Rate-limit store unavailable.",
      },
    })
  end

  if conf.redis_password and conf.redis_password ~= "" then
    local auth_ok, auth_err = red:auth(conf.redis_password)
    if not auth_ok then
      kong.log.err("ecompilot-plan-limiter: Redis auth failed: ", auth_err)
      return kong.response.exit(503, {
        error = {
          code    = "SERVICE_UNAVAILABLE",
          message = "Rate-limit store unavailable.",
        },
      })
    end
  end

  if conf.redis_database and conf.redis_database ~= 0 then
    red:select(conf.redis_database)
  end

  return red
end

--- Returns the current window string for a given quota type.
---@param window_type string "daily" | "monthly"
---@return string
local function current_window(window_type)
  if window_type == "daily" then
    return os.date("%Y-%m-%d")
  end
  return os.date("%Y-%m")
end

--- Determines the TTL (seconds) that covers the rest of the current window.
---@param window_type string "daily" | "monthly"
---@return number
local function ttl_for_window(window_type)
  local now    = os.time()
  local t      = os.date("*t", now)
  local window_end

  if window_type == "daily" then
    window_end = os.time({
      year  = t.year,
      month = t.month,
      day   = t.day + 1,
      hour  = 0,
      min   = 0,
      sec   = 0,
    })
  else
    -- Next month, day 1
    local next_month = t.month == 12 and 1 or t.month + 1
    local next_year  = t.month == 12 and t.year + 1 or t.year
    window_end = os.time({
      year  = next_year,
      month = next_month,
      day   = 1,
      hour  = 0,
      min   = 0,
      sec   = 0,
    })
  end

  local ttl = window_end - now
  return ttl > 0 and ttl or 86400
end

--- Slugifies a URI path for use as a Redis key segment.
---@param uri string
---@return string
local function uri_slug(uri)
  -- Strip query string, replace slashes and non-alnum with underscores.
  local path = uri:match("^([^?]+)") or uri
  return path:gsub("[^%w%-]", "_"):lower()
end

--- Resolves the plan-specific limit config for the current plan.
--- Returns nil if the plan key is not configured (treated as unlimited).
---@param limits table  conf.limits map
---@param plan string   e.g. "free", "pro", "business"
---@return table|nil
local function resolve_plan_limits(limits, plan)
  if not limits then return nil end
  return limits[plan]
end

--- Determines which window type applies for the given plan limit config.
---@param plan_cfg table
---@return string "daily" | "monthly"
---@return number quota   (-1 = unlimited)
local function extract_quota(plan_cfg)
  if plan_cfg.daily ~= nil then
    return "daily", plan_cfg.daily
  end
  if plan_cfg.monthly ~= nil then
    return "monthly", plan_cfg.monthly
  end
  -- Fallback to monthly unlimited
  return "monthly", -1
end

-- ─── Access handler ──────────────────────────────────────────────────────────

function EcomPilotPlanLimiter:access(conf)
  -- Retrieve plan from header injected by request-transformer (from JWT claims)
  local plan    = kong.request.get_header("X-User-Plan")
  local user_id = kong.request.get_header("X-User-ID")

  -- If no plan header, the request is unauthenticated — skip (JWT plugin
  -- will have already rejected it; this guards belt-and-suspenders).
  if not plan or plan == "" then
    return
  end

  if not user_id or user_id == "" then
    return
  end

  local plan_cfg = resolve_plan_limits(conf.limits, plan)

  -- Unknown plan -> treat as unlimited (forward-compatible)
  if not plan_cfg then
    return
  end

  -- Blocked plan (no access at all)
  if plan_cfg.blocked == true then
    kong.response.set_header("X-Plan-Limit", "0")
    kong.response.set_header("X-Plan-Used",  "0")
    kong.response.set_header("X-Plan-Remaining", "0")
    return kong.response.exit(403, {
      error = {
        code    = "PLAN_LIMIT_EXCEEDED",
        message = "This feature is not available on the " .. plan .. " plan. Please upgrade.",
        details = { current_plan = plan, upgrade_url = "https://app.ecompilot.com/billing" },
      },
    })
  end

  local window_type, quota = extract_quota(plan_cfg)

  -- Unlimited — no Redis interaction needed
  if quota == -1 then
    kong.response.set_header("X-Plan-Limit",     "unlimited")
    kong.response.set_header("X-Plan-Used",      "0")
    kong.response.set_header("X-Plan-Remaining", "unlimited")
    return
  end

  -- Build Redis key
  local slug    = uri_slug(kong.request.get_path())
  local window  = current_window(window_type)
  local key     = conf.redis_prefix .. ":" .. user_id .. ":" .. window .. ":" .. slug

  local red = connect_redis(conf)

  -- INCR then set TTL atomically via pipelining
  red:init_pipeline()
  red:incr(key)
  red:ttl(key)
  local results, pipe_err = red:commit_pipeline()

  if not results then
    kong.log.err("ecompilot-plan-limiter: Redis pipeline error: ", pipe_err)
    -- Fail open: let the request through rather than block on Redis failure
    return
  end

  local current_count = results[1]
  local current_ttl   = results[2]

  -- Set TTL only on first creation (ttl == -1 means key has no expiry)
  if current_ttl == -1 then
    red:expire(key, ttl_for_window(window_type))
  end

  -- Return connection to pool
  red:set_keepalive(10000, 100)

  local remaining = math.max(0, quota - current_count)

  kong.response.set_header("X-Plan-Limit",     tostring(quota))
  kong.response.set_header("X-Plan-Used",      tostring(current_count))
  kong.response.set_header("X-Plan-Remaining", tostring(remaining))

  if current_count > quota then
    return kong.response.exit(429, {
      error = {
        code    = "MONTHLY_LIMIT_EXCEEDED",
        message = "You have reached your " .. window_type .. " quota of " ..
                  tostring(quota) .. " requests on the " .. plan .. " plan.",
        details = {
          current_plan   = plan,
          quota          = quota,
          used           = current_count,
          resets_at      = window .. (window_type == "daily" and "T00:00:00Z" or "-01T00:00:00Z"),
          upgrade_url    = "https://app.ecompilot.com/billing",
        },
      },
    })
  end
end

return EcomPilotPlanLimiter
