variable "cluster_id" {
  description = "Unique ID for the ElastiCache replication group"
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]*$", var.cluster_id)) && length(var.cluster_id) <= 40
    error_message = "Cluster ID must start with a lowercase letter, contain only lowercase letters, numbers, and hyphens, and be <= 40 characters."
  }
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.1"
  validation {
    condition     = can(regex("^7\\.", var.engine_version))
    error_message = "Engine version must be Redis 7.x."
  }
}

variable "node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.medium"
}

variable "num_cache_nodes" {
  description = "Number of cache nodes (1 = no replication, 2+ = with replica)"
  type        = number
  default     = 2
  validation {
    condition     = var.num_cache_nodes >= 1 && var.num_cache_nodes <= 6
    error_message = "Number of cache nodes must be between 1 and 6."
  }
}

variable "maxmemory_policy" {
  description = "Redis maxmemory eviction policy"
  type        = string
  default     = "allkeys-lru"
  validation {
    condition = contains([
      "noeviction", "allkeys-lru", "allkeys-lfu", "allkeys-random",
      "volatile-lru", "volatile-lfu", "volatile-random", "volatile-ttl"
    ], var.maxmemory_policy)
    error_message = "Invalid maxmemory policy."
  }
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the ElastiCache subnet group"
  type        = list(string)
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnets required."
  }
}

variable "availability_zones" {
  description = "Availability zones for cache clusters"
  type        = list(string)
  default     = []
}

variable "eks_node_security_group_id" {
  description = "EKS node security group ID for ingress rules"
  type        = string
}

variable "snapshot_retention_limit" {
  description = "Number of days to retain automatic snapshots (0 = disabled)"
  type        = number
  default     = 7
  validation {
    condition     = var.snapshot_retention_limit >= 0 && var.snapshot_retention_limit <= 35
    error_message = "Snapshot retention must be between 0 and 35 days."
  }
}

variable "snapshot_window" {
  description = "Daily time range for creating snapshots (UTC)"
  type        = string
  default     = "05:00-06:00"
}

variable "maintenance_window" {
  description = "Weekly maintenance window"
  type        = string
  default     = "sun:06:00-sun:07:00"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
