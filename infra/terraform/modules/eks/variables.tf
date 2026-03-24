variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9-]*$", var.cluster_name)) && length(var.cluster_name) <= 100
    error_message = "Cluster name must start with a letter, contain only alphanumeric characters and hyphens, and be <= 100 characters."
  }
}

variable "kubernetes_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.30"
  validation {
    condition     = can(regex("^1\\.(2[8-9]|3[0-9])$", var.kubernetes_version))
    error_message = "Kubernetes version must be 1.28 or higher."
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

variable "vpc_id" {
  description = "VPC ID where the cluster will be deployed"
  type        = string
  validation {
    condition     = can(regex("^vpc-[a-z0-9]+$", var.vpc_id))
    error_message = "VPC ID must be in the format vpc-xxxxxxxx."
  }
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for worker nodes"
  type        = list(string)
  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least 2 private subnets required for high availability."
  }
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs (for load balancers)"
  type        = list(string)
  default     = []
}

variable "endpoint_public_access" {
  description = "Whether the Kubernetes API server endpoint is publicly accessible"
  type        = bool
  default     = false
}

variable "public_access_cidrs" {
  description = "CIDR blocks that can access the public API server endpoint"
  type        = list(string)
  default     = ["0.0.0.0/0"]
  validation {
    condition = alltrue([
      for cidr in var.public_access_cidrs : can(cidrhost(cidr, 0))
    ])
    error_message = "All values must be valid CIDR blocks."
  }
}

variable "service_ipv4_cidr" {
  description = "The CIDR block for Kubernetes service IP addresses"
  type        = string
  default     = "172.20.0.0/16"
  validation {
    condition     = can(cidrhost(var.service_ipv4_cidr, 0))
    error_message = "Service CIDR must be a valid CIDR block."
  }
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 90
  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "Log retention must be a valid CloudWatch Logs retention value."
  }
}

# ── General node group ────────────────────────────────────────────────────────
variable "general_instance_types" {
  description = "Instance types for general ON_DEMAND node group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "general_desired_size" {
  description = "Desired number of nodes in the general node group"
  type        = number
  default     = 2
  validation {
    condition     = var.general_desired_size >= 1
    error_message = "Desired size must be at least 1."
  }
}

variable "general_min_size" {
  description = "Minimum number of nodes in the general node group"
  type        = number
  default     = 2
  validation {
    condition     = var.general_min_size >= 1
    error_message = "Minimum size must be at least 1."
  }
}

variable "general_max_size" {
  description = "Maximum number of nodes in the general node group"
  type        = number
  default     = 10
  validation {
    condition     = var.general_max_size >= var.general_min_size
    error_message = "Maximum size must be greater than or equal to minimum size."
  }
}

# ── Spot node group ───────────────────────────────────────────────────────────
variable "spot_instance_types" {
  description = "Instance types for SPOT node group (multiple types for availability)"
  type        = list(string)
  default     = ["t3.large", "m5.large", "m5a.large", "m4.large"]
}

variable "spot_desired_size" {
  description = "Desired number of nodes in the spot node group"
  type        = number
  default     = 0
}

variable "spot_min_size" {
  description = "Minimum number of nodes in the spot node group"
  type        = number
  default     = 0
}

variable "spot_max_size" {
  description = "Maximum number of nodes in the spot node group"
  type        = number
  default     = 20
}

variable "cluster_admin_arns" {
  description = "List of IAM ARNs to grant cluster admin access"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
