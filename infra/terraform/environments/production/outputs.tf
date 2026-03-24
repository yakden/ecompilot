output "eks_cluster_name" {
  description = "EKS cluster name"
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

output "eks_oidc_provider_arn" {
  description = "OIDC provider ARN for IRSA configuration"
  value       = module.eks.oidc_provider_arn
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
  description = "ElastiCache Redis primary endpoint"
  value       = module.elasticache.primary_endpoint_address
  sensitive   = true
}

output "redis_secret_arn" {
  description = "Secrets Manager ARN for Redis auth token"
  value       = module.elasticache.secret_arn
}

output "s3_media_bucket" {
  description = "S3 media bucket name"
  value       = module.s3_media.bucket_id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = module.cloudfront_media.distribution_domain_name
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.this.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}
