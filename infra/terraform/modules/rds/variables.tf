variable "identifier" {
  description = "Unique identifier for the RDS instance"
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]*$", var.identifier)) && length(var.identifier) <= 63
    error_message = "Identifier must start with a lowercase letter, contain only lowercase letters, numbers, and hyphens, and be <= 63 characters."
  }
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.3"
  validation {
    condition     = can(regex("^16\\.", var.engine_version))
    error_message = "Engine version must be PostgreSQL 16.x."
  }
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "allocated_storage" {
  description = "Initial allocated storage in GB"
  type        = number
  default     = 100
  validation {
    condition     = var.allocated_storage >= 20
    error_message = "Allocated storage must be at least 20 GB."
  }
}

variable "max_allocated_storage" {
  description = "Maximum allocated storage for autoscaling in GB (0 = disabled)"
  type        = number
  default     = 500
}

variable "iops" {
  description = "IOPS for gp3 storage (3000-64000, 0 = use default)"
  type        = number
  default     = 3000
}

variable "storage_throughput" {
  description = "Storage throughput in MB/s for gp3 (125-4000, 0 = use default)"
  type        = number
  default     = 125
}

variable "db_name" {
  description = "Name of the initial database"
  type        = string
  default     = "ecompilot"
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.db_name))
    error_message = "Database name must start with a letter and contain only alphanumeric characters and underscores."
  }
}

variable "master_username" {
  description = "Master username for the RDS instance"
  type        = string
  default     = "ecompilot_admin"
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.master_username)) && length(var.master_username) <= 63
    error_message = "Master username must start with a letter and contain only alphanumeric characters and underscores."
  }
}

variable "master_password" {
  description = "Master password (null = auto-generate and store in Secrets Manager)"
  type        = string
  default     = null
  sensitive   = true
}

variable "vpc_id" {
  description = "VPC ID where the RDS instance will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for the DB subnet group (minimum 2, in different AZs)"
  type        = list(string)
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnets in different AZs are required."
  }
}

variable "eks_node_security_group_id" {
  description = "Security group ID of EKS nodes to allow DB access"
  type        = string
}

variable "multi_az" {
  description = "Whether to enable Multi-AZ deployment"
  type        = bool
  default     = true
}

variable "backup_retention_period" {
  description = "Number of days to retain automated backups (0 = disabled)"
  type        = number
  default     = 7
  validation {
    condition     = var.backup_retention_period >= 0 && var.backup_retention_period <= 35
    error_message = "Backup retention period must be between 0 and 35 days."
  }
}

variable "backup_window" {
  description = "Daily time range during which automated backups are created (UTC)"
  type        = string
  default     = "03:00-04:00"
  validation {
    condition     = can(regex("^([01]?[0-9]|2[0-3]):[0-5][0-9]-([01]?[0-9]|2[0-3]):[0-5][0-9]$", var.backup_window))
    error_message = "Backup window must be in format HH:MM-HH:MM."
  }
}

variable "maintenance_window" {
  description = "Weekly time range during which system maintenance can occur"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "performance_insights_retention_period" {
  description = "Performance Insights data retention in days (7 or 731)"
  type        = number
  default     = 7
  validation {
    condition     = contains([7, 731], var.performance_insights_retention_period)
    error_message = "Performance Insights retention must be 7 or 731 days."
  }
}

variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on deletion (set to false for production)"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
