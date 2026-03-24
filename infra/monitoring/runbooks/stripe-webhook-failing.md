# Runbook: Stripe Webhook Failing

**Alert:** `StripeWebhookFailing`
**Severity:** Critical
**Team:** Billing
**SLO impact:** Indirect — subscription state diverges from Stripe, causing customer support load and potential revenue loss

---

## What is happening

One or more Stripe webhook events could not be processed by `billing-service`.
The counter `stripe_webhook_events_failed_total` has increased, meaning at least
one subscription lifecycle event (payment succeeded, subscription cancelled, invoice
paid, etc.) has not been applied to EcomPilot's database.

This is time-sensitive: Stripe retries webhooks for up to 72 hours with exponential
backoff. If the root cause is not fixed within that window, events are permanently lost.

---

## Webhook events and their consequences if missed

| Event | Consequence of missing |
|-------|----------------------|
| `checkout.session.completed` | User pays but never gets their subscription activated |
| `invoice.payment_succeeded` | Subscription not renewed — user loses access incorrectly |
| `invoice.payment_failed` | Failed payment not recorded — user retains access they shouldn't |
| `customer.subscription.deleted` | Cancellation not processed — user billed next cycle incorrectly |
| `customer.subscription.updated` | Plan change not applied — wrong feature set served |

---

## Response steps

### Step 1 — Identify which events are failing (2 minutes)

```bash
# Check billing-service logs for webhook errors
kubectl logs -n ecompilot -l app=billing-service --tail=200 | grep -i "webhook\|stripe\|error\|failed"

# Look at structured error logs with jq
kubectl logs -n ecompilot -l app=billing-service --tail=500 | \
  grep '"event_type"' | jq '{ts: .timestamp, event: .event_type, error: .error, id: .event_id}'
```

### Step 2 — Check Stripe Dashboard (2 minutes)

1. Log in to https://dashboard.stripe.com
2. Navigate to Developers > Webhooks
3. Select the EcomPilot webhook endpoint
4. Review "Recent deliveries" — look for red (failed) events
5. Note the event IDs and types that failed

### Step 3 — Test the webhook endpoint directly

```bash
# Check if the billing-service webhook endpoint is reachable
kubectl exec -n ecompilot -it deployment/api-gateway -- \
  wget -qO- --post-data='{}' \
  --header='Content-Type: application/json' \
  http://billing-service:3000/webhooks/stripe 2>&1 | head -20

# Check billing-service health
kubectl exec -n ecompilot -it deployment/billing-service -- wget -qO- localhost:3000/health
```

### Step 4 — Diagnose the failure mode

**Signature validation failure (HTTP 400 from billing-service):**
```bash
# Most common cause: STRIPE_WEBHOOK_SECRET mismatch or missing
kubectl get secret -n ecompilot billing-service-secrets -o jsonpath='{.data.STRIPE_WEBHOOK_SECRET}' | base64 -d | head -c 10
# Compare with the secret shown in Stripe Dashboard > Webhooks > Signing secret
```
Fix: Update the secret in Kubernetes and restart billing-service.
```bash
kubectl set env deployment/billing-service -n ecompilot STRIPE_WEBHOOK_SECRET=<new_secret>
kubectl rollout restart deployment/billing-service -n ecompilot
```

**Database write failure (HTTP 500 from billing-service):**
```bash
# Check postgres connectivity from billing-service
kubectl exec -n ecompilot -it deployment/billing-service -- \
  pg_isready -h postgres -p 5432 -U billing

# Check for DB errors in billing-service logs
kubectl logs -n ecompilot -l app=billing-service --tail=200 | grep -i "postgres\|database\|sql\|connection"
```

**billing-service pod crash / OOM:**
```bash
kubectl get pods -n ecompilot -l app=billing-service
kubectl describe pod -n ecompilot -l app=billing-service | grep -A5 "Last State"
```

**Kong routing issue (webhook not reaching billing-service):**
```bash
# Check Kong upstream health for billing-service
kubectl exec -n ecompilot -it deployment/kong -- \
  curl -s http://localhost:8001/upstreams/billing-service/health | jq '.data[].health'
```

### Step 5 — Replay failed events

Once the root cause is fixed, replay events from Stripe:

**Option A — Stripe Dashboard (manual, for a few events):**
1. Go to Developers > Webhooks > Recent deliveries
2. Find each failed event
3. Click the event, then "Resend"

**Option B — Stripe CLI (for bulk replay):**
```bash
# Install Stripe CLI if not present
# Then replay events within a time range
stripe events resend <event_id>

# Or trigger a test event to verify the endpoint works
stripe trigger invoice.payment_succeeded
```

**Option C — EcomPilot admin endpoint (if implemented):**
```bash
# Trigger a sync for a specific customer
curl -X POST http://billing-service:3000/admin/sync-stripe-customer \
  -H 'Authorization: Bearer <admin_token>' \
  -H 'Content-Type: application/json' \
  -d '{"customer_id": "cus_xxxxx"}'
```

### Step 6 — Verify recovery

```bash
# Watch the failure counter — it should stop increasing
# In Prometheus: increase(stripe_webhook_events_failed_total[2m])

# Confirm billing-service is processing events
kubectl logs -n ecompilot -l app=billing-service --tail=50 -f | grep "webhook processed"
```

---

## Escalation

| Condition | Action |
|-----------|--------|
| STRIPE_WEBHOOK_SECRET needs rotation | Billing lead + security team |
| Failed events > 10 spanning > 1h | Page billing lead + product |
| Stripe reports outage | Check status.stripe.com, pause alerting, post status update |
| Data inconsistency found (users with wrong plan) | Billing lead + customer success |

---

## Reconciliation procedure

If webhook replay is not possible (events older than 72h or Stripe retry limit exceeded):

```bash
# Run the billing reconciliation job
kubectl create job -n ecompilot --from=cronjob/billing-reconciliation billing-reconciliation-manual-$(date +%s)
kubectl logs -n ecompilot -l job-name=billing-reconciliation-manual-* -f
```

This job pulls the current subscription state from the Stripe API and reconciles
it with the EcomPilot database.

---

## Post-incident

1. Document which event types failed and for how long.
2. Check if any customers ended up with incorrect subscription state.
3. Issue corrections via the billing-service admin API.
4. If customers were incorrectly charged or denied access, coordinate with customer success.
5. Review webhook idempotency handling — ensure replaying events is safe.
6. Consider implementing a webhook event inbox/outbox pattern for durability.
