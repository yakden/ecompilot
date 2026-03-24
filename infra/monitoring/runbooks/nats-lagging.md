# Runbook: NATS Consumer Lagging

**Alert:** `NATSConsumerLagging`
**Severity:** Warning
**Team:** Platform SRE
**SLO impact:** Indirect — events not processed cause delayed or missed functionality (notifications, analytics, webhooks)

---

## What is happening

A NATS JetStream consumer has more than 1000 unprocessed messages pending. The
consumer is not keeping up with the producer. If left unresolved, the backlog
will grow until:
- The stream's storage limit is exceeded and messages are dropped
- The stream's age limit is reached and messages expire
- The downstream service's state falls critically out of sync

---

## NATS streams and their consumers in EcomPilot

| Stream | Consumer | Producing service | Consuming service | Consequence of lag |
|--------|----------|------------------|-------------------|--------------------|
| `user-events` | `analytics-consumer` | auth, billing | analytics-service | Analytics data delayed |
| `order-events` | `notification-consumer` | marketplace-hub | notification-service | Order notifications delayed |
| `payment-events` | `reconciliation-consumer` | billing-service | payment-reconciliation | Reconciliation delayed |
| `supplier-events` | `calc-consumer` | suppliers-service | calc-service | Price calculations stale |
| `audit-log` | `legal-consumer` | all services | legal-service | Audit trail delayed |

---

## Response steps

### Step 1 — Identify the lagging consumer (2 minutes)

```bash
# List all consumers and their pending message counts
kubectl exec -n ecompilot -it deployment/nats -- \
  nats consumer list --all

# Get detailed status for a specific consumer
kubectl exec -n ecompilot -it deployment/nats -- \
  nats consumer info <STREAM_NAME> <CONSUMER_NAME>
```

```promql
# In Prometheus — which consumers are lagging?
sort_desc(nats_consumer_num_pending)

# Lag growth rate (positive = growing backlog)
deriv(nats_consumer_num_pending[5m])
```

### Step 2 — Check the consuming service

```bash
# Is the consumer service healthy?
kubectl get pods -n ecompilot -l app=<CONSUMER_SERVICE>
kubectl logs -n ecompilot -l app=<CONSUMER_SERVICE> --tail=100 | \
  grep -i "nats\|consumer\|error\|failed\|timeout"
```

If the consuming service is down: follow the `service-down` runbook, then the
backlog should drain automatically once the service recovers.

### Step 3 — Determine lag growth trend

```bash
# Is the backlog growing, stable, or shrinking?
kubectl exec -n ecompilot -it deployment/nats -- \
  nats consumer info <STREAM_NAME> <CONSUMER_NAME> --json | \
  jq '{pending: .num_pending, ack_pending: .num_ack_pending, redelivered: .num_redelivered}'

# Watch it over 60 seconds
watch -n 10 'kubectl exec -n ecompilot -it deployment/nats -- nats consumer info <STREAM_NAME> <CONSUMER_NAME> --json | jq .num_pending'
```

- Growing rapidly: consumer is completely stopped or processing is broken
- Growing slowly: consumer processing rate < production rate (capacity problem)
- Stable: consumer is keeping up but behind (may self-resolve)
- Shrinking: consumer is recovering (monitor until cleared)

### Step 4 — Check for processing errors

```bash
# High redelivery count indicates messages are failing to process
kubectl exec -n ecompilot -it deployment/nats -- \
  nats consumer info <STREAM_NAME> <CONSUMER_NAME> --json | \
  jq '.num_redelivered'

# A high redelivery count means the consumer is nacking or timing out
# Check the consumer service for the specific error
kubectl logs -n ecompilot -l app=<CONSUMER_SERVICE> --tail=500 | \
  grep -i "nack\|nak\|error processing\|failed to process" | tail -20
```

**If a specific message type is failing repeatedly:**
```bash
# Peek at the first pending message to inspect it
kubectl exec -n ecompilot -it deployment/nats -- \
  nats stream get <STREAM_NAME> --last

# Check if it's a poison message (malformed payload)
kubectl exec -n ecompilot -it deployment/nats -- \
  nats consumer next <STREAM_NAME> <CONSUMER_NAME> --count 1
```

If a poison message is blocking the consumer, move it to the dead letter stream:
```bash
# This requires implementing a dead letter handler — check if one exists
kubectl exec -n ecompilot -it deployment/nats -- \
  nats stream purge <STREAM_NAME> --subject <SPECIFIC_SUBJECT> --seq <SEQUENCE_NUMBER>
```

### Step 5 — Scale up the consuming service

If the consumer is healthy but just too slow:

```bash
# Scale to process the backlog faster
kubectl scale deployment/<CONSUMER_SERVICE> -n ecompilot --replicas=5

# Monitor backlog drain rate
kubectl exec -n ecompilot -it deployment/nats -- \
  nats consumer info <STREAM_NAME> <CONSUMER_NAME> --json | jq .num_pending
```

Note: Scaling horizontally only helps if the consumer is designed for concurrent processing
with competing consumers. Check whether the consumer uses queue groups.

### Step 6 — Check NATS server health

```bash
# NATS server status
kubectl exec -n ecompilot -it deployment/nats -- nats server check

# JetStream storage usage
kubectl exec -n ecompilot -it deployment/nats -- nats stream report

# Check if storage is nearly full (messages will be dropped)
kubectl exec -n ecompilot -it deployment/nats -- \
  nats stream info <STREAM_NAME> --json | \
  jq '{storage_mb: (.state.bytes / 1048576), max_mb: (.config.max_bytes / 1048576), msgs: .state.messages}'
```

If storage is nearly full and messages are critical (cannot be lost):
```bash
# Increase stream storage limit temporarily
kubectl exec -n ecompilot -it deployment/nats -- \
  nats stream edit <STREAM_NAME> --max-bytes=10GB
```

---

## If the backlog cannot be drained (emergency)

Only for non-critical streams where message loss is acceptable (e.g. analytics):

```bash
# WARNING: This permanently deletes all unprocessed messages
# Get explicit approval from service owner before running
kubectl exec -n ecompilot -it deployment/nats -- \
  nats stream purge <STREAM_NAME> --force
```

For critical streams (billing, legal audit), never purge without explicit approval
from the CTO. Instead, store the messages externally first:

```bash
# Export messages to a file before purging
kubectl exec -n ecompilot -it deployment/nats -- \
  nats stream copy <STREAM_NAME> <STREAM_NAME>-backup --source-start-all
```

---

## Escalation

| Condition | Action |
|-----------|--------|
| Backlog > 50,000 messages | Notify service owner and product |
| Storage > 80% full | Immediate scaling or purge decision required |
| Critical stream (billing/legal) lagging | Page billing/legal team lead |
| Consumer completely stopped | Follow service-down runbook |

---

## Post-incident

1. Determine why the consumer fell behind (deployment issue, slow downstream, traffic spike).
2. Verify all messages in the backlog were eventually processed.
3. Check for message expiry losses and assess data impact.
4. Add a dead letter queue if not present to handle poison messages.
5. Review stream storage limits relative to expected peak backlog.
6. Consider implementing consumer lag dashboards with historical trending.
