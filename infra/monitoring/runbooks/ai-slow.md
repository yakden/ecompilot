# Runbook: AI Service Latency High

**Alert:** `AIServiceLatencyHigh`
**Severity:** Warning
**Team:** AI / Platform SRE
**SLO impact:** AI Response Latency p95 (SLO-003) — threshold is 3000 ms

---

## What is happening

The AI service p95 response latency has exceeded 5 seconds (warning threshold) or
3 seconds (SLO threshold) over a 5-minute window. End users will experience slow
or timing-out AI-powered features (product descriptions, supplier recommendations,
legal document analysis, etc.).

---

## Response steps

### Step 1 — Quantify the slowdown (2 minutes)

```promql
# Current p50, p95, p99
histogram_quantile(0.50, sum by (le) (rate(http_server_request_duration_seconds_bucket{service="ai-service"}[5m])))
histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket{service="ai-service"}[5m])))
histogram_quantile(0.99, sum by (le) (rate(http_server_request_duration_seconds_bucket{service="ai-service"}[5m])))

# Is it all operations or a specific one?
histogram_quantile(0.95, sum by (operation, le) (rate(ai_operation_duration_seconds_bucket{service="ai-service"}[5m])))
```

Open the AI Service Grafana dashboard for a visual overview.

### Step 2 — Check LLM provider status (2 minutes)

Check the upstream LLM provider status pages:

- OpenAI: https://status.openai.com
- Anthropic: https://status.anthropic.com
- Azure OpenAI: https://azure.status.microsoft.com

```bash
# Check recent AI service logs for provider errors
kubectl logs -n ecompilot -l app=ai-service --tail=200 | \
  grep -i "openai\|anthropic\|timeout\|rate.limit\|429\|503\|overloaded" | tail -30
```

**If the provider is degraded:**
- Enable the fallback model if configured.
- Consider temporarily disabling AI features for non-premium users.
- Post a status update if ETA > 15 minutes.

### Step 3 — Check rate limiting and token quotas

```bash
# Look for 429 (rate limit) responses from the LLM provider
kubectl logs -n ecompilot -l app=ai-service --tail=500 | grep '"status":429'

# Check token budget
# In Prometheus:
# ai_token_budget_remaining_tokens / ai_token_budget_total_tokens
```

If rate limited: reduce concurrency or enable request queuing.

```bash
# Check current request queue depth
kubectl exec -n ecompilot -it deployment/ai-service -- \
  wget -qO- localhost:3000/metrics | grep ai_request_queue_depth
```

### Step 4 — Check RAG pipeline performance

```promql
# RAG retrieval latency
histogram_quantile(0.95, sum by (le) (rate(ai_rag_retrieval_duration_seconds_bucket[5m])))

# Vector DB (pgvector/qdrant) latency — high values indicate index degradation
histogram_quantile(0.95, sum by (le) (rate(ai_vector_search_duration_seconds_bucket[5m])))

# RAG cache hit rate — if low, more retrievals are happening
sum(rate(ai_rag_cache_hits_total[5m])) / sum(rate(ai_rag_requests_total[5m]))
```

**If RAG retrieval is slow:**

```bash
# Check vector database pod
kubectl get pods -n ecompilot -l app=qdrant
kubectl logs -n ecompilot -l app=qdrant --tail=50

# Check postgres vector extension if using pgvector
kubectl exec -n ecompilot -it deployment/postgres -- \
  psql -U postgres -c "SELECT query, mean_exec_time FROM pg_stat_statements WHERE query LIKE '%<->%' ORDER BY mean_exec_time DESC LIMIT 10;"
```

Fix: Increase vector index cache, rebuild HNSW index, or reduce k (number of chunks retrieved).

### Step 5 — Check for large/expensive prompts

```bash
# Log the largest prompts in the last 5 minutes
kubectl logs -n ecompilot -l app=ai-service --tail=500 | \
  jq 'select(.prompt_tokens > 2000) | {tokens: .prompt_tokens, operation: .operation, user_id: .user_id}' | head -10
```

Unusually large prompts (> 4000 tokens) from a single user or operation can cause cascading slowness.

**Mitigation:** Apply a per-user prompt size limit or per-operation token budget.

```bash
# Check if a specific user is hammering the API
kubectl logs -n ecompilot -l app=ai-service --tail=1000 | \
  jq '.user_id' | sort | uniq -c | sort -rn | head -10
```

### Step 6 — Check ai-service resource utilisation

```bash
# CPU and memory
kubectl top pods -n ecompilot -l app=ai-service

# Check if pod is hitting CPU limits (throttled)
kubectl get pod -n ecompilot -l app=ai-service -o json | \
  jq '.items[0].spec.containers[0].resources'
```

```promql
# CPU throttling ratio
sum(rate(container_cpu_cfs_throttled_seconds_total{pod=~"ai-service.*"}[5m]))
/ sum(rate(container_cpu_cfs_periods_total{pod=~"ai-service.*"}[5m]))
```

If CPU is throttled: increase CPU limit or scale out.
```bash
kubectl scale deployment/ai-service -n ecompilot --replicas=3
```

---

## Mitigation options (escalating severity)

| Action | Impact | When to use |
|--------|--------|-------------|
| Enable response caching (increase TTL) | Reduced diversity of responses | p95 > 3s for > 10 min |
| Switch to faster/cheaper model | Lower quality responses | Provider throttling |
| Rate limit per user (50 req/h) | Reduced AI feature access | p95 > 5s or rate limiting |
| Disable RAG, use base model only | Lower answer quality | RAG slow, p95 > 8s |
| Disable AI for free-tier users | Premium users unaffected | Budget or capacity exhaustion |
| Circuit-break AI endpoints | AI features entirely offline | SLO > 5s sustained > 30 min |

### Enabling fast fallback model

```bash
# Set environment variable to override default model
kubectl set env deployment/ai-service -n ecompilot AI_FALLBACK_MODEL=gpt-3.5-turbo AI_FALLBACK_ENABLED=true
```

---

## Escalation

| Condition | Action |
|-----------|--------|
| p95 > 10s for > 15 min | Page AI team lead |
| LLM provider incident confirmed | Notify product, prepare status page update |
| Token budget < 10% remaining | Page billing + AI leads |
| Error rate > 5% on ai-service | Switch to `high-error-rate` runbook |

---

## Post-incident

1. Check AI dashboard for the latency timeline — when did it start?
2. Correlate with token usage — was there a spike in requests?
3. Review if the fallback model was automatically triggered and whether quality was acceptable.
4. If RAG index was degraded, schedule a reindex outside business hours.
5. Consider implementing adaptive token budgeting and request queuing.
6. Update SLO-003 if target needs adjustment based on provider SLA.
