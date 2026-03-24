# ─────────────────────────────────────────────────────────────────────────────
# EcomPilot Staging — Terraform variable values
# Cost-optimized for lower traffic and testing purposes.
# ─────────────────────────────────────────────────────────────────────────────

aws_region         = "eu-central-1"
kubernetes_version = "1.30"

# Staging allows public API access from developer IPs (replace with actual CIDRs)
endpoint_public_access = true
public_access_cidrs    = ["0.0.0.0/0"]

# ── Cluster access ────────────────────────────────────────────────────────────
# Set via TF_VAR_cluster_admin_arns or GitHub Actions OIDC role
# cluster_admin_arns = [
#   "arn:aws:iam::ACCOUNT_ID:role/DevOpsAdmin",
#   "arn:aws:iam::ACCOUNT_ID:role/GitHubActionsEKS",
# ]
