# ─────────────────────────────────────────────────────────────────────────────
# RDS Module — PostgreSQL 16.3 with Multi-AZ, Performance Insights, encryption
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

# ── KMS key for RDS encryption ────────────────────────────────────────────────
resource "aws_kms_key" "rds" {
  description             = "RDS encryption key for ${var.identifier}"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  multi_region            = false

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
        Sid    = "Allow RDS to use the key"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:CreateGrant",
          "kms:DescribeKey",
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name    = "${var.identifier}-rds-kms"
    Service = "rds"
  })
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.identifier}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# ── Random password if not provided ──────────────────────────────────────────
resource "random_password" "master" {
  count   = var.master_password == null ? 1 : 0
  length  = 32
  special = true
  # Avoid characters that can break connection strings
  override_special = "!#$%&*()-_=+[]{}:?"
}

# ── Security Group ────────────────────────────────────────────────────────────
resource "aws_security_group" "rds" {
  name        = "${var.identifier}-rds-sg"
  description = "Security group for RDS instance ${var.identifier}"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = "${var.identifier}-rds-sg" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "rds_ingress_eks" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = var.eks_node_security_group_id
  security_group_id        = aws_security_group.rds.id
  description              = "PostgreSQL access from EKS nodes"
}

resource "aws_security_group_rule" "rds_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.rds.id
  description       = "Allow all outbound (needed for monitoring/patching)"
}

# ── DB Subnet Group ───────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "this" {
  name        = "${var.identifier}-subnet-group"
  description = "DB subnet group for ${var.identifier}"
  subnet_ids  = var.subnet_ids

  tags = merge(var.tags, { Name = "${var.identifier}-subnet-group" })
}

# ── Parameter Group ───────────────────────────────────────────────────────────
resource "aws_db_parameter_group" "this" {
  name        = "${var.identifier}-pg16-params"
  family      = "postgres16"
  description = "Custom parameter group for ${var.identifier} PostgreSQL 16"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  parameter {
    name  = "log_temp_files"
    value = "0"
  }

  parameter {
    name  = "log_autovacuum_min_duration"
    value = "0"
  }

  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements,auto_explain"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "pg_stat_statements.track"
    value = "ALL"
  }

  parameter {
    name  = "auto_explain.log_min_duration"
    value = "1000"
  }

  parameter {
    name  = "auto_explain.log_analyze"
    value = "1"
  }

  parameter {
    name  = "auto_explain.log_buffers"
    value = "1"
  }

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "ssl"
    value = "1"
  }

  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "300000"  # 5 minutes in milliseconds
  }

  parameter {
    name  = "statement_timeout"
    value = "30000"  # 30 seconds
  }

  parameter {
    name  = "track_activity_query_size"
    value = "4096"
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# ── CloudWatch Enhanced Monitoring Role ───────────────────────────────────────
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.identifier}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(var.tags, { Name = "${var.identifier}-rds-monitoring-role" })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
  role       = aws_iam_role.rds_monitoring.name
}

# ── RDS Instance ──────────────────────────────────────────────────────────────
resource "aws_db_instance" "this" {
  identifier = var.identifier

  # Engine
  engine               = "postgres"
  engine_version       = var.engine_version
  instance_class       = var.instance_class
  parameter_group_name = aws_db_parameter_group.this.name

  # Storage
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn
  iops                  = var.iops
  storage_throughput    = var.storage_throughput

  # Database
  db_name  = var.db_name
  username = var.master_username
  password = var.master_password != null ? var.master_password : random_password.master[0].result

  # Network
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  port                   = 5432

  # High availability
  multi_az = var.multi_az

  # Backup
  backup_retention_period   = var.backup_retention_period
  backup_window             = var.backup_window
  delete_automated_backups  = false
  copy_tags_to_snapshot     = true

  # Maintenance
  maintenance_window          = var.maintenance_window
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  apply_immediately           = false

  # Monitoring
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.rds_monitoring.arn
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.rds.arn
  performance_insights_retention_period = var.performance_insights_retention_period
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  # Protection
  deletion_protection      = var.deletion_protection
  skip_final_snapshot      = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.identifier}-final-snapshot-${formatdate("YYYYMMDD-HHmmss", timestamp())}"

  # Other
  ca_cert_identifier        = "rds-ca-rsa2048-g1"
  iam_database_authentication_enabled = true

  tags = merge(var.tags, {
    Name    = var.identifier
    Service = "rds"
  })

  lifecycle {
    ignore_changes = [
      password,
      final_snapshot_identifier,
    ]
    prevent_destroy = false
  }

  depends_on = [aws_iam_role_policy_attachment.rds_monitoring]
}

# ── Store master password in Secrets Manager ──────────────────────────────────
resource "aws_secretsmanager_secret" "rds_password" {
  name                    = "${var.identifier}/rds/master-password"
  description             = "Master password for RDS instance ${var.identifier}"
  kms_key_id              = aws_kms_key.rds.arn
  recovery_window_in_days = 7

  tags = merge(var.tags, { Name = "${var.identifier}-rds-password" })
}

resource "aws_secretsmanager_secret_version" "rds_password" {
  secret_id = aws_secretsmanager_secret.rds_password.id
  secret_string = jsonencode({
    username = var.master_username
    password = var.master_password != null ? var.master_password : random_password.master[0].result
    host     = aws_db_instance.this.address
    port     = aws_db_instance.this.port
    dbname   = var.db_name
    engine   = "postgres"
    url      = "postgresql://${var.master_username}:${var.master_password != null ? var.master_password : random_password.master[0].result}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${var.db_name}?sslmode=require"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
