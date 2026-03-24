output "eks_cluster_name" {
  description = "EKS staging cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "eks_kubeconfig_command" {
  description = "Command to update local kubeconfig"
  value       = module.eks.kubeconfig_command
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.db_instance_endpoint
  sensitive   = true
}

output "rds_secret_arn" {
  description = "Secrets Manager ARN for RDS credentials"
  value       = module.rds.secret_arn
}

output "redis_primary_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.elasticache.primary_endpoint_address
  sensitive   = true
}

output "s3_media_bucket" {
  description = "S3 media bucket name"
  value       = module.s3_media.bucket_id
}

output "vpc_id" {
  description = "Staging VPC ID"
  value       = aws_vpc.this.id
}
