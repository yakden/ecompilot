output "replication_group_id" {
  description = "ID of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.this.id
}

output "replication_group_arn" {
  description = "ARN of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.this.arn
}

output "primary_endpoint_address" {
  description = "Primary endpoint address for write operations"
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "reader_endpoint_address" {
  description = "Reader endpoint address for read operations"
  value       = aws_elasticache_replication_group.this.reader_endpoint_address
}

output "port" {
  description = "Port of the Redis cluster"
  value       = 6379
}

output "security_group_id" {
  description = "Security group ID for the ElastiCache cluster"
  value       = aws_security_group.elasticache.id
}

output "kms_key_arn" {
  description = "KMS key ARN used for encryption at rest"
  value       = aws_kms_key.elasticache.arn
}

output "secret_arn" {
  description = "Secrets Manager secret ARN for the auth token"
  value       = aws_secretsmanager_secret.elasticache_auth.arn
}

output "secret_name" {
  description = "Secrets Manager secret name for the auth token"
  value       = aws_secretsmanager_secret.elasticache_auth.name
}
