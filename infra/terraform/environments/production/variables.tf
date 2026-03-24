variable "aws_region" {
  description = "AWS region for the production environment"
  type        = string
  default     = "eu-central-1"
  validation {
    condition     = can(regex("^[a-z]+-[a-z]+-[0-9]$", var.aws_region))
    error_message = "AWS region must be in the format like eu-central-1."
  }
}

variable "kubernetes_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.30"
}

# ── EKS node sizing ───────────────────────────────────────────────────────────
variable "general_node_desired" {
  description = "Desired number of general ON_DEMAND nodes"
  type        = number
  default     = 3
}

variable "general_node_min" {
  description = "Minimum number of general ON_DEMAND nodes"
  type        = number
  default     = 2
}

variable "general_node_max" {
  description = "Maximum number of general ON_DEMAND nodes"
  type        = number
  default     = 10
}

variable "spot_node_desired" {
  description = "Desired number of SPOT nodes"
  type        = number
  default     = 2
}

variable "spot_node_min" {
  description = "Minimum number of SPOT nodes"
  type        = number
  default     = 0
}

variable "spot_node_max" {
  description = "Maximum number of SPOT nodes"
  type        = number
  default     = 20
}

# ── RDS ───────────────────────────────────────────────────────────────────────
variable "rds_instance_class" {
  description = "RDS instance class for production"
  type        = string
  default     = "db.t3.medium"
}

# ── ElastiCache ───────────────────────────────────────────────────────────────
variable "redis_node_type" {
  description = "ElastiCache node type for production"
  type        = string
  default     = "cache.t3.medium"
}

# ── CloudFront ────────────────────────────────────────────────────────────────
variable "cloudfront_acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for CloudFront"
  type        = string
  default     = ""
}

variable "waf_web_acl_arn" {
  description = "WAF Web ACL ARN for CloudFront (null = no WAF)"
  type        = string
  default     = null
}

# ── Alerting ──────────────────────────────────────────────────────────────────
variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms"
  type        = string
  default     = null
}

# ── Access control ────────────────────────────────────────────────────────────
variable "cluster_admin_arns" {
  description = "IAM ARNs to grant cluster admin access"
  type        = list(string)
  default     = []
}
