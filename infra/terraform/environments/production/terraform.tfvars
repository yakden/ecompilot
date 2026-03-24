# ─────────────────────────────────────────────────────────────────────────────
# EcomPilot Production — Terraform variable values
# IMPORTANT: Sensitive values (passwords, ARNs with account IDs) should be
# provided via environment variables (TF_VAR_*) or a secrets manager.
# Do NOT commit actual account IDs or sensitive ARNs to version control.
# ─────────────────────────────────────────────────────────────────────────────

aws_region         = "eu-central-1"
kubernetes_version = "1.30"

# ── EKS node groups ───────────────────────────────────────────────────────────
# General ON_DEMAND: baseline capacity for core services
general_node_desired = 3
general_node_min     = 2
general_node_max     = 10

# SPOT: burst capacity for non-critical workloads
spot_node_desired = 2
spot_node_min     = 0
spot_node_max     = 20

# ── RDS ───────────────────────────────────────────────────────────────────────
# db.t3.medium: 2 vCPU, 4GB RAM — suitable for up to ~200 concurrent connections
# Upgrade to db.r6g.large for production load > 500 req/s
rds_instance_class = "db.t3.medium"

# ── ElastiCache ───────────────────────────────────────────────────────────────
# cache.t3.medium: 2 vCPU, 3.09 GB — suitable for session + caching workload
# Upgrade to cache.r7g.large for > 10k ops/s
redis_node_type = "cache.t3.medium"

# ── Alerting ──────────────────────────────────────────────────────────────────
# Set these via TF_VAR_alarm_sns_topic_arn environment variable
# alarm_sns_topic_arn = "arn:aws:sns:eu-central-1:ACCOUNT_ID:ecompilot-prod-alerts"

# ── Cluster access ────────────────────────────────────────────────────────────
# Set via TF_VAR_cluster_admin_arns or GitHub Actions OIDC role
# cluster_admin_arns = [
#   "arn:aws:iam::ACCOUNT_ID:role/DevOpsAdmin",
#   "arn:aws:iam::ACCOUNT_ID:role/GitHubActionsEKS",
# ]

# ── CloudFront ────────────────────────────────────────────────────────────────
# ACM certificate must be issued in us-east-1 for CloudFront
# Set via TF_VAR_cloudfront_acm_certificate_arn
# cloudfront_acm_certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/UUID"
