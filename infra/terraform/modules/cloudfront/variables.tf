variable "distribution_name" {
  description = "Logical name for the CloudFront distribution (used in resource names)"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.distribution_name))
    error_message = "Distribution name must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "s3_bucket_regional_domain_name" {
  description = "Regional domain name of the S3 origin bucket"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for the distribution (must be in us-east-1)"
  type        = string
  validation {
    condition     = can(regex("^arn:aws:acm:us-east-1:", var.acm_certificate_arn))
    error_message = "ACM certificate must be in us-east-1 for CloudFront."
  }
}

variable "domain_aliases" {
  description = "Domain aliases (CNAMEs) for the distribution"
  type        = list(string)
  default     = []
}

variable "default_root_object" {
  description = "Default root object served by CloudFront"
  type        = string
  default     = "index.html"
}

variable "origin_shield_enabled" {
  description = "Enable CloudFront Origin Shield to reduce load on origin"
  type        = bool
  default     = false
}

variable "origin_shield_region" {
  description = "AWS region for Origin Shield"
  type        = string
  default     = "eu-central-1"
}

variable "waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL to associate (null = no WAF)"
  type        = string
  default     = null
}

variable "log_retention_days" {
  description = "Number of days to retain CloudFront access logs"
  type        = number
  default     = 90
}

variable "force_destroy" {
  description = "Allow log bucket deletion when not empty"
  type        = bool
  default     = false
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms (null = no alarms)"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
