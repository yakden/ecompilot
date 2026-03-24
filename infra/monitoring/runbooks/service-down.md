# Runbook: Service Down

**Alert:** `ServiceDown`
**Severity:** Critical
**Team:** Platform SRE
**SLO impact:** API Availability (SLO-001) — every minute of downtime burns error budget

---

## What is happening

Prometheus cannot scrape the `/metrics` endpoint of a microservice for more than
1 minute. This means the service is either crashed, evicted, failing its readiness
probe, or the network path to it is broken.

---

## Immediate impact assessment

| Service | Blast radius |
|---------|-------------|
| api-gateway | All traffic to all services blocked |
| auth-service | Login and token validation broken — all authenticated requests fail |
| billing-service | Subscription upgrades/cancellations blocked |
| ai-service | AI features unavailable |
| notification-service | Emails and push notifications queued up |
| Any other service | Feature degradation for that service's functionality |

---

## Response steps

### Step 1 — Verify the alert (2 minutes)

Open Grafana Service Overview dashboard and confirm the service shows red.

```bash
# Check pod status
kubectl get pods -n ecompilot -l app=<SERVICE_NAME>

# Check recent pod events
kubectl describe pod -n ecompilot -l app=<SERVICE_NAME> | tail -40

# Check if the deployment exists and has desired replicas
kubectl get deployment -n ecompilot <SERVICE_NAME>
```

### Step 2 — Check pod logs (3 minutes)

```bash
# Last 100 lines of the failing pod
kubectl logs -n ecompilot -l app=<SERVICE_NAME> --tail=100

# If the pod is crash-looping, check previous container logs
kubectl logs -n ecompilot -l app=<SERVICE_NAME> --previous --tail=100

# Check for OOMKills
kubectl get events -n ecompilot --field-selector reason=OOMKilling --sort-by=.lastTimestamp
```

### Step 3 — Triage the root cause

**Pod in CrashLoopBackOff:**
```bash
# Get exit code
kubectl get pod -n ecompilot -l app=<SERVICE_NAME> -o jsonpath='{.items[0].status.containerStatuses[0].lastState.terminated.exitCode}'
# Exit 137 = OOMKill, Exit 1 = app crash, Exit 143 = SIGTERM timeout
```

**Pod pending (scheduling failure):**
```bash
kubectl get events -n ecompilot | grep <SERVICE_NAME>
# Look for: Insufficient memory, Insufficient cpu, No nodes available
```

**Pod running but readiness probe failing:**
```bash
kubectl describe pod -n ecompilot -l app=<SERVICE_NAME> | grep -A5 "Readiness"
# Check the health endpoint manually
kubectl exec -n ecompilot -it $(kubectl get pod -n ecompilot -l app=<SERVICE_NAME> -o name | head -1) -- wget -qO- localhost:3000/health
```

**Image pull failure:**
```bash
kubectl get events -n ecompilot | grep "Failed to pull image"
# Check registry credentials and image tag
```

### Step 4 — Attempt recovery

**Restart the deployment (safe — rolling restart):**
```bash
kubectl rollout restart deployment/<SERVICE_NAME> -n ecompilot
kubectl rollout status deployment/<SERVICE_NAME> -n ecompilot
```

**Scale up if under-resourced:**
```bash
kubectl scale deployment/<SERVICE_NAME> -n ecompilot --replicas=3
```

**Roll back to the previous known-good image:**
```bash
kubectl rollout history deployment/<SERVICE_NAME> -n ecompilot
kubectl rollout undo deployment/<SERVICE_NAME> -n ecompilot
kubectl rollout status deployment/<SERVICE_NAME> -n ecompilot
```

**Force pod recreation (last resort — brief downtime):**
```bash
kubectl delete pod -n ecompilot -l app=<SERVICE_NAME>
```

### Step 5 — Confirm recovery

```bash
# Watch pods become ready
kubectl get pods -n ecompilot -l app=<SERVICE_NAME> -w

# Confirm Prometheus sees the service as up
# In Grafana: query up{job="ecompilot-services", service="<SERVICE_NAME>"}
```

Alert should auto-resolve within 2 minutes of the service responding.

---

## Escalation

| Condition | Action |
|-----------|--------|
| Cannot determine root cause in 15 min | Escalate to service owner via PagerDuty |
| Multiple services down simultaneously | Declare P1 incident, page VP Engineering |
| api-gateway or auth-service down > 5 min | Customer communication via Statuspage |
| Pod restarts > 5 in 30 min (instability) | Pull service from Kong routing, investigate offline |

---

## Post-incident

1. Update the incident timeline in the incident doc.
2. Identify whether this was a deployment regression, config drift, or infrastructure issue.
3. Open a postmortem within 24 hours if downtime > 5 minutes.
4. Create a JIRA ticket for the root cause fix.
5. Consider adding a synthetic health probe if not already present.

---

## Useful queries

```promql
# How long has the service been down?
(time() - max(last_over_time(up{job="ecompilot-services", service="<SERVICE_NAME>"}[1h]))) / 60

# Error budget burned in the last hour
(1 - sum(rate(http_server_request_duration_seconds_count{http_response_status_code!~"5.."}[1h])) / sum(rate(http_server_request_duration_seconds_count[1h]))) / 0.001
```
