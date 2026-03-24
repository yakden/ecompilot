# Runbook: High Error Rate (5xx)

**Alert:** `HighErrorRate5xx`
**Severity:** Critical
**Team:** Platform SRE
**SLO impact:** API Availability (SLO-001) and Error Rate (SLO-004) — error budget burning

---

## What is happening

More than 1% of HTTP requests to one or more services are returning 5xx responses
over a 5-minute window. This is both a customer-facing problem and an active SLO
breach that burns error budget.

---

## Response steps

### Step 1 — Determine scope (2 minutes)

Is this one service, a subset, or all services?

```promql
# In Grafana Explore or Prometheus UI
sum by (service) (rate(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[5m]))
/ sum by (service) (rate(http_server_request_duration_seconds_count[5m]))
```

- Single service: follow the targeted triage below
- Multiple services: likely a shared dependency (database, NATS, Redis, auth)
- All services: check api-gateway, check for a bad deployment, check infrastructure

### Step 2 — Identify the error type

```bash
# What HTTP status codes are being returned?
kubectl logs -n ecompilot -l app=<SERVICE_NAME> --tail=300 | \
  grep '"status":5' | jq '{status: .status, path: .path, error: .error, trace: .trace_id}' | head -20

# Are errors from a specific endpoint?
kubectl logs -n ecompilot -l app=<SERVICE_NAME> --tail=300 | \
  grep '"status":5' | jq '.path' | sort | uniq -c | sort -rn
```

### Step 3 — Check for recent deployments

A deployment in the last 30 minutes is the most common cause.

```bash
# Recent rollout history
kubectl rollout history deployment/<SERVICE_NAME> -n ecompilot

# Check when the current pods started
kubectl get pods -n ecompilot -l app=<SERVICE_NAME> \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.startTime}{"\n"}{end}'

# Check deployment events
kubectl get events -n ecompilot --field-selector involvedObject.name=<SERVICE_NAME> --sort-by=.lastTimestamp | tail -20
```

**If a deployment is the cause — roll back immediately:**
```bash
kubectl rollout undo deployment/<SERVICE_NAME> -n ecompilot
kubectl rollout status deployment/<SERVICE_NAME> -n ecompilot
```

### Step 4 — Check downstream dependencies

```bash
# Is the database reachable?
kubectl exec -n ecompilot -it deployment/<SERVICE_NAME> -- \
  pg_isready -h postgres -p 5432

# Is Redis reachable?
kubectl exec -n ecompilot -it deployment/<SERVICE_NAME> -- \
  redis-cli -h redis ping

# Is NATS reachable?
kubectl exec -n ecompilot -it deployment/<SERVICE_NAME> -- \
  nats-cli server check connection --server nats://nats:4222
```

```promql
# Check if postgres connection pool is saturated
pg_stat_database_numbackends / pg_settings_max_connections

# Check Redis memory pressure
redis_memory_used_bytes / redis_memory_max_bytes
```

### Step 5 — Check resource exhaustion

```bash
# CPU and memory pressure
kubectl top pods -n ecompilot -l app=<SERVICE_NAME>

# OOMKill events
kubectl get events -n ecompilot --field-selector reason=OOMKilling

# Resource limits
kubectl get pod -n ecompilot -l app=<SERVICE_NAME> -o json | \
  jq '.items[0].spec.containers[0].resources'
```

### Step 6 — Triage via Jaeger traces

1. Open Grafana, navigate to the Explore panel, select Jaeger datasource.
2. Search for service: `<SERVICE_NAME>`, Tags: `error=true`, Time: last 15 minutes.
3. Open a sample failed trace to see:
   - Which span failed
   - The error message and stack trace
   - Which downstream call timed out or returned an error

### Step 7 — Circuit breaker / load shedding

If the service is overwhelmed and cannot self-recover:

```bash
# Reduce traffic to the service via Kong (add a rate limit)
kubectl exec -n ecompilot -it deployment/kong -- \
  curl -s -X PATCH http://localhost:8001/routes/<ROUTE_ID>/plugins \
  -d '{"name":"rate-limiting","config":{"minute":100,"policy":"local"}}'

# Or temporarily route traffic to a fallback / maintenance page
# (Requires Kong route weight configuration)
```

Scale up the deployment to absorb load:
```bash
kubectl scale deployment/<SERVICE_NAME> -n ecompilot --replicas=5
```

---

## Common causes and fixes

| Symptom in logs | Root cause | Fix |
|----------------|------------|-----|
| `connection refused` to postgres | DB overloaded or down | Check DB runbook |
| `context deadline exceeded` | Slow downstream call, no timeout | Check downstream service, tune timeout |
| `too many connections` | Connection pool exhausted | Increase pool size or reduce replicas |
| `out of memory` | Memory leak or OOM | Restart pods, add memory limit, profile app |
| `invalid argument` / `nil pointer` | Application bug | Roll back deployment |
| `certificate: expired` | TLS cert expired | Rotate cert |
| `no such file or directory` | Missing config/secret | Check configmap and secret mounts |

---

## Burn rate check

Before closing the incident, assess the error budget damage:

```promql
# Remaining error budget percentage
(1 - (
  (1 - (sum(rate(http_server_request_duration_seconds_count{http_response_status_code!~"5.."}[30d]))
        / sum(rate(http_server_request_duration_seconds_count[30d]))))
  / 0.001
)) * 100
```

If budget < 50%, schedule a reliability sprint item. If < 10%, trigger the feature freeze policy.

---

## Escalation

| Condition | Action |
|-----------|--------|
| Error rate > 10% for > 10 min | P1 incident, page VP Engineering |
| Multiple services affected | Declare major incident, open war room |
| api-gateway error rate > 1% | All customers affected, Statuspage update |
| Cannot identify root cause in 20 min | Escalate to service owner |

---

## Post-incident

1. Capture the incident timeline (detection time, response time, resolution time).
2. Run a postmortem if error rate was > 1% for more than 10 minutes.
3. Add integration tests for the failing endpoint if not present.
4. Review alert thresholds if the alert fired too late or too early.
5. Update this runbook with any new troubleshooting steps discovered.
