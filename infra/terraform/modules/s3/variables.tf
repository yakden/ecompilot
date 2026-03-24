variable "bucket_name" {
  description = "Name of the S3 bucket (must be globally unique)"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.bucket_name)) && length(var.bucket_name) >= 3 && length(var.bucket_name) <= 63
    error_message = "Bucket name must be 3-63 characters, lowercase, and follow S3 naming rules."
  }
}

variable "versioning_enabled" {
  description = "Enable S3 versioning"
  type        = bool
  default     = true
}

variable "force_destroy" {
  description = "Allow bucket deletion even when not empty (should be false for production)"
  type        = bool
  default     = false
}

variable "object_expiration_days" {
  description = "Number of days after which objects expire (0 = never)"
  type        = number
  default     = 0
}

variable "cors_allowed_origins" {
  description = "CORS allowed origins for browser uploads"
  type        = list(string)
  default     = []
}

variable "notification_queue_arn" {
  description = "SQS queue ARN for S3 event notifications (null = disabled)"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
