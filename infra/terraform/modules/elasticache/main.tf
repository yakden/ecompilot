# ─────────────────────────────────────────────────────────────────────────────
# ElastiCache Module — Redis 7 with encryption at-rest + in-transit, 2 nodes
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

data "aws_partition" "current" {}
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# ── KMS key for ElastiCache at-rest encryption ────────────────────────────────
resource "aws_kms_key" "elasticache" {
  description             = "ElastiCache encryption key for ${var.cluster_id}"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow ElastiCache to use the key"
        Effect = "Allow"
        Principal = {
          Service = "elasticache.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:CreateGrant",
          "kms:DescribeKey",
          "kms:ReEncrypt*",
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name    = "${var.cluster_id}-elasticache-kms"
    Service = "elasticache"
  })
}

resource "aws_kms_alias" "elasticache" {
  name          = "alias/${var.cluster_id}-elasticache"
  target_key_id = aws_kms_key.elasticache.key_id
}

# ── Auth token (Redis password) ───────────────────────────────────────────────
resource "random_password" "auth_token" {
  length  = 64
  special = false  # ElastiCache auth token must be alphanumeric
}

# ── Security Group ────────────────────────────────────────────────────────────
resource "aws_security_group" "elasticache" {
  name        = "${var.cluster_id}-elasticache-sg"
  description = "Security group for ElastiCache cluster ${var.cluster_id}"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = "${var.cluster_id}-elasticache-sg" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "elasticache_ingress_eks" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = var.eks_node_security_group_id
  security_group_id        = aws_security_group.elasticache.id
  description              = "Redis access from EKS nodes"
}

resource "aws_security_group_rule" "elasticache_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.elasticache.id
  description       = "Allow all outbound"
}

# ── Subnet Group ──────────────────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "this" {
  name        = "${var.cluster_id}-subnet-group"
  description = "ElastiCache subnet group for ${var.cluster_id}"
  subnet_ids  = var.subnet_ids

  tags = merge(var.tags, { Name = "${var.cluster_id}-subnet-group" })
}

# ── Parameter Group ───────────────────────────────────────────────────────────
resource "aws_elasticache_parameter_group" "this" {
  name        = "${var.cluster_id}-redis7-params"
  family      = "redis7"
  description = "Custom parameter group for ${var.cluster_id}"

  parameter {
    name  = "maxmemory-policy"
    value = var.maxmemory_policy
  }

  parameter {
    name  = "notify-keyspace-events"
    value = ""
  }

  parameter {
    name  = "latency-tracking"
    value = "yes"
  }

  parameter {
    name  = "latency-tracking-info-percentiles"
    value = "50 99 99.9"
  }

  parameter {
    name  = "slowlog-log-slower-than"
    value = "10000"
  }

  parameter {
    name  = "slowlog-max-len"
    value = "128"
  }

  parameter {
    name  = "activerehashing"
    value = "yes"
  }

  parameter {
    name  = "lazyfree-lazy-eviction"
    value = "yes"
  }

  parameter {
    name  = "lazyfree-lazy-expire"
    value = "yes"
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# ── ElastiCache Replication Group (2-node cluster) ────────────────────────────
resource "aws_elasticache_replication_group" "this" {
  replication_group_id = var.cluster_id
  description          = "Redis replication group for EcomPilot ${var.environment}"

  # Engine
  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  parameter_group_name = aws_elasticache_parameter_group.this.name
  port                 = 6379

  # Cluster topology — 1 shard, 2 nodes (primary + 1 replica)
  num_cache_clusters = var.num_cache_nodes

  # Network
  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.elasticache.id]

  # Encryption
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  transit_encryption_mode     = "required"
  kms_key_id                  = aws_kms_key.elasticache.arn
  auth_token                  = random_password.auth_token.result
  auth_token_update_strategy  = "ROTATE"

  # Availability
  automatic_failover_enabled  = var.num_cache_nodes >= 2 ? true : false
  multi_az_enabled            = var.num_cache_nodes >= 2 ? true : false
  preferred_cache_cluster_azs = var.availability_zones

  # Backups
  snapshot_retention_limit = var.snapshot_retention_limit
  snapshot_window          = var.snapshot_window

  # Maintenance
  maintenance_window         = var.maintenance_window
  auto_minor_version_upgrade = true
  apply_immediately          = false

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.elasticache_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.elasticache_engine.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }

  tags = merge(var.tags, {
    Name    = var.cluster_id
    Service = "elasticache"
  })

  lifecycle {
    ignore_changes = [auth_token]
  }
}

# ── CloudWatch log groups for Redis logs ──────────────────────────────────────
resource "aws_cloudwatch_log_group" "elasticache_slow" {
  name              = "/aws/elasticache/${var.cluster_id}/slow-log"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.elasticache.arn

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "elasticache_engine" {
  name              = "/aws/elasticache/${var.cluster_id}/engine-log"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.elasticache.arn

  tags = var.tags
}

# ── Store auth token in Secrets Manager ──────────────────────────────────────
resource "aws_secretsmanager_secret" "elasticache_auth" {
  name                    = "${var.cluster_id}/elasticache/auth-token"
  description             = "ElastiCache auth token for ${var.cluster_id}"
  kms_key_id              = aws_kms_key.elasticache.arn
  recovery_window_in_days = 7

  tags = merge(var.tags, { Name = "${var.cluster_id}-elasticache-auth" })
}

resource "aws_secretsmanager_secret_version" "elasticache_auth" {
  secret_id = aws_secretsmanager_secret.elasticache_auth.id
  secret_string = jsonencode({
    auth_token           = random_password.auth_token.result
    primary_endpoint     = aws_elasticache_replication_group.this.primary_endpoint_address
    reader_endpoint      = aws_elasticache_replication_group.this.reader_endpoint_address
    port                 = 6379
    url                  = "rediss://:${random_password.auth_token.result}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
    reader_url           = "rediss://:${random_password.auth_token.result}@${aws_elasticache_replication_group.this.reader_endpoint_address}:6379"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
