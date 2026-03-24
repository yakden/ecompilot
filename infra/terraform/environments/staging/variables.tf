variable "aws_region" {
  description = "AWS region for the staging environment"
  type        = string
  default     = "eu-central-1"
}

variable "kubernetes_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.30"
}

variable "endpoint_public_access" {
  description = "Allow public access to EKS API server (staging only)"
  type        = bool
  default     = true
}

variable "public_access_cidrs" {
  description = "CIDRs allowed to reach the public EKS API server"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "cluster_admin_arns" {
  description = "IAM ARNs to grant cluster admin access"
  type        = list(string)
  default     = []
}
