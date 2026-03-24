# ─────────────────────────────────────────────────────────────────────────────
# Terraform State Backend Bootstrap
# Run ONCE before any other Terraform configurations.
# Usage: cd infra/terraform/bootstrap && terraform init && terraform apply
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
  # Bootstrap uses local state — keep this .tfstate file in a secure location
  # and commit it to a private, access-restricted repository or use Terraform Cloud
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "ecompilot"
      ManagedBy = "terraform-bootstrap"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── KMS key for state bucket encryption ───────────────────────────────────────
resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for Terraform state S3 bucket encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true
  multi_region            = false

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow S3 service"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })

  tags = {
    Name    = "ecompilot-terraform-state-kms"
    Purpose = "terraform-state-encryption"
  }
}

resource "aws_kms_alias" "terraform_state" {
  name          = "alias/ecompilot-terraform-state"
  target_key_id = aws_kms_key.terraform_state.key_id
}

# ── S3 Bucket for Terraform State ─────────────────────────────────────────────
resource "aws_s3_bucket" "terraform_state" {
  bucket = "ecompilot-terraform-state"

  tags = {
    Name    = "ecompilot-terraform-state"
    Purpose = "terraform-state"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.terraform_state.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "terraform_state" {
  bucket        = aws_s3_bucket.terraform_state.id
  target_bucket = aws_s3_bucket.terraform_state_logs.id
  target_prefix = "access-logs/"
}

resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonHTTPS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.terraform_state.arn,
          "${aws_s3_bucket.terraform_state.arn}/*",
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
      {
        Sid       = "DenyNonEncryptedUploads"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.terraform_state.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      },
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.terraform_state]
}

# Logs bucket for state bucket access logs
resource "aws_s3_bucket" "terraform_state_logs" {
  bucket        = "ecompilot-terraform-state-logs"
  force_destroy = false

  tags = {
    Name    = "ecompilot-terraform-state-logs"
    Purpose = "terraform-state-access-logs"
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state_logs" {
  bucket                  = aws_s3_bucket.terraform_state_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state_logs" {
  bucket = aws_s3_bucket.terraform_state_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "terraform_state_logs" {
  bucket = aws_s3_bucket.terraform_state_logs.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "terraform_state_logs" {
  bucket = aws_s3_bucket.terraform_state_logs.id

  rule {
    id     = "log-retention"
    status = "Enabled"
    filter {}
    expiration { days = 365 }
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }
}

# ── DynamoDB Table for State Locking ──────────────────────────────────────────
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "ecompilot-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  # Enable point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  # Enable server-side encryption
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.terraform_state.arn
  }

  # Enable deletion protection
  deletion_protection_enabled = true

  tags = {
    Name    = "ecompilot-terraform-locks"
    Purpose = "terraform-state-locking"
  }
}

variable "aws_region" {
  description = "AWS region for the state backend resources"
  type        = string
  default     = "eu-central-1"
}

output "state_bucket_name" {
  value = aws_s3_bucket.terraform_state.id
}

output "state_bucket_arn" {
  value = aws_s3_bucket.terraform_state.arn
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.terraform_locks.name
}

output "kms_key_arn" {
  value = aws_kms_key.terraform_state.arn
}

output "backend_config" {
  value = <<-EOT
    # Add this backend configuration to your Terraform root modules:
    terraform {
      backend "s3" {
        bucket         = "${aws_s3_bucket.terraform_state.id}"
        key            = "ecompilot/ENV/terraform.tfstate"
        region         = "${data.aws_region.current.name}"
        encrypt        = true
        kms_key_id     = "${aws_kms_key.terraform_state.arn}"
        dynamodb_table = "${aws_dynamodb_table.terraform_locks.name}"
      }
    }
  EOT
}
