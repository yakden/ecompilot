output "bucket_id" {
  description = "S3 bucket ID (name)"
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.this.arn
}

output "bucket_domain_name" {
  description = "S3 bucket domain name"
  value       = aws_s3_bucket.this.bucket_domain_name
}

output "bucket_regional_domain_name" {
  description = "S3 bucket regional domain name"
  value       = aws_s3_bucket.this.bucket_regional_domain_name
}

output "kms_key_arn" {
  description = "KMS key ARN used for S3 server-side encryption"
  value       = aws_kms_key.s3.arn
}

output "kms_key_id" {
  description = "KMS key ID used for S3 server-side encryption"
  value       = aws_kms_key.s3.key_id
}
