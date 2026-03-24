# Runbook: Database High Load

**Alerts:** `DatabaseConnectionsExhausted` (Critical), `DatabaseConnectionsHigh` (Warning)
**Team:** Platform SRE / DBA
**SLO impact:** All services that use PostgreSQL will start failing when connections are exhausted

---

## What is happening

PostgreSQL is approaching or has reached its maximum connection limit. When at 100%,
new connection attempts will be rejected with:
```
FATAL: sorry, too many clients already
```

Every service that cannot acquire a database connection will start returning 500 errors.

---

## Connection architecture

```
Services (16) -> PgBouncer (connection pooler) -> PostgreSQL (max_connections: 200)

PgBouncer pools:
- pool_mode: transaction  (default for most services)
- max_client_conn: 1000   (client-facing limit)
- default_pool_size: 10   (per-user/database pool)
```

---

## Response steps

### Step 1 — Assess severity (1 minute)

```promql
# Current connection percentage
(pg_stat_database_numbackends / pg_settings_max_connections) * 100

# Connections by database
pg_stat_database_numbackends

# Connections by state (active, idle, idle in transaction)
pg_stat_activity_count
```

```bash
# Real-time connection breakdown
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "
    SELECT state, wait_event_type, count(*)
    FROM pg_stat_activity
    WHERE datname = 'ecompilot'
    GROUP BY state, wait_event_type
    ORDER BY count DESC;
  "
```

### Step 2 — Identify which services hold the most connections

```bash
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "
    SELECT
      application_name,
      state,
      count(*) AS connections,
      max(now() - state_change) AS max_duration
    FROM pg_stat_activity
    WHERE datname = 'ecompilot'
    GROUP BY application_name, state
    ORDER BY connections DESC
    LIMIT 20;
  "
```

### Step 3 — Kill idle connections leaking from a service

**Idle connections (state = 'idle') held for more than 5 minutes are connection leaks:**

```bash
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "
    SELECT pid, application_name, state, now() - state_change AS duration
    FROM pg_stat_activity
    WHERE state = 'idle'
      AND now() - state_change > interval '5 minutes'
      AND datname = 'ecompilot'
    ORDER BY duration DESC;
  "

# Terminate specific idle connections (replace $PID with actual values)
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND now() - state_change > interval '5 minutes' AND datname = 'ecompilot';"
```

**Idle-in-transaction connections are dangerous — they hold locks:**

```bash
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "
    SELECT pid, application_name, now() - xact_start AS txn_duration, query
    FROM pg_stat_activity
    WHERE state = 'idle in transaction'
      AND now() - xact_start > interval '1 minute'
    ORDER BY txn_duration DESC;
  "

# Terminate idle-in-transaction connections
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND now() - xact_start > interval '1 minute';"
```

### Step 4 — Check PgBouncer status

```bash
# PgBouncer admin console
kubectl exec -n ecompilot -it deployment/pgbouncer -- \
  psql -p 6432 -U pgbouncer pgbouncer -c "SHOW POOLS;"

kubectl exec -n ecompilot -it deployment/pgbouncer -- \
  psql -p 6432 -U pgbouncer pgbouncer -c "SHOW STATS;"

kubectl exec -n ecompilot -it deployment/pgbouncer -- \
  psql -p 6432 -U pgbouncer pgbouncer -c "SHOW CLIENTS;"
```

If PgBouncer pool is exhausted, reload its configuration:
```bash
kubectl exec -n ecompilot -it deployment/pgbouncer -- \
  psql -p 6432 -U pgbouncer pgbouncer -c "RELOAD;"
```

### Step 5 — Identify slow or blocking queries

Long-running queries hold connections and can cascade:

```bash
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "
    SELECT
      pid,
      now() - pg_stat_activity.query_start AS duration,
      application_name,
      state,
      left(query, 100) AS query_snippet
    FROM pg_stat_activity
    WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds'
      AND state != 'idle'
    ORDER BY duration DESC
    LIMIT 10;
  "
```

**Cancel a slow query (safe — only cancels the query, not the connection):**
```bash
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "SELECT pg_cancel_backend(<PID>);"
```

**Terminate a blocking connection (last resort — disconnects the client):**
```bash
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "SELECT pg_terminate_backend(<PID>);"
```

### Step 6 — Check for lock contention

```bash
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "
    SELECT
      blocked.pid AS blocked_pid,
      blocked.query AS blocked_query,
      blocking.pid AS blocking_pid,
      blocking.query AS blocking_query,
      blocked.wait_event_type,
      blocked.wait_event
    FROM pg_stat_activity AS blocked
    JOIN pg_stat_activity AS blocking
      ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
    WHERE cardinality(pg_blocking_pids(blocked.pid)) > 0;
  "
```

### Step 7 — Emergency: increase max_connections temporarily

Only if connections are truly exhausted and services are failing. This requires a
PostgreSQL restart and brief downtime.

```bash
# Edit the postgresql.conf
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "ALTER SYSTEM SET max_connections = 400;"

# Reload (no restart needed for most settings, but max_connections requires restart)
kubectl rollout restart deployment/postgres -n ecompilot
```

Note: Increasing `max_connections` without increasing `shared_buffers` proportionally
can cause memory pressure. Plan accordingly.

---

## Common root causes

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Idle connections from one service | Connection pool not releasing on idle | Tune pool idle timeout, deploy fix |
| Idle-in-transaction from one service | Transaction not committed/rolled back | Fix application bug, deploy rollback |
| Sudden spike in connections | Traffic spike, missing connection pool | Enable/tune PgBouncer |
| Gradual growth over hours | Connection leak in new deployment | Roll back or fix the deployment |
| Many short-lived connections | Connecting directly without pool | Route through PgBouncer |

---

## Escalation

| Condition | Action |
|-----------|--------|
| Connections exhausted, services failing | P1 incident, page on-call DBA |
| Lock contention blocking writes | Page service owner immediately |
| Idle-in-transaction > 10 min | Potential data integrity risk, page DBA |
| All actions tried, still > 95% | Consider emergency failover to replica |

---

## Post-incident

1. Identify which service caused the connection leak.
2. Review connection pool configuration for that service (pool size, idle timeout).
3. Add an integration test that verifies connections are released.
4. Consider implementing a connection watcher that alerts on leaked connections faster.
5. Review PgBouncer `default_pool_size` and `max_client_conn` for current service count.
6. Document the query that caused the problem if it was a slow query issue.
