# ─────────────────────────────────────────────────────────────────────────────
# EcomPilot — Production Environment
# Region: eu-central-1 (Frankfurt)
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.32"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.15"
    }
  }

  backend "s3" {
    bucket         = "ecompilot-terraform-state"
    key            = "ecompilot/production/terraform.tfstate"
    region         = "eu-central-1"
    encrypt        = true
    kms_key_id     = "alias/ecompilot-terraform-state"
    dynamodb_table = "ecompilot-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "ecompilot"
      Environment = "production"
      ManagedBy   = "terraform"
      CostCenter  = "engineering"
      Repository  = "ecompilot/infra"
    }
  }
}

# ── Provider for us-east-1 (ACM certs for CloudFront) ─────────────────────────
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "ecompilot"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name, "--region", var.aws_region]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name, "--region", var.aws_region]
    }
  }
}

# ── Data sources ─────────────────────────────────────────────────────────────
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# ── Local values ──────────────────────────────────────────────────────────────
locals {
  environment  = "production"
  cluster_name = "ecompilot-prod"
  region       = var.aws_region
  account_id   = data.aws_caller_identity.current.account_id

  azs = slice(data.aws_availability_zones.available.names, 0, 3)

  common_tags = {
    Project     = "ecompilot"
    Environment = local.environment
    ManagedBy   = "terraform"
    CostCenter  = "engineering"
  }

  # VPC CIDR planning
  vpc_cidr             = "10.0.0.0/16"
  private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnet_cidrs  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  db_subnet_cidrs      = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
}

# ── VPC ───────────────────────────────────────────────────────────────────────
resource "aws_vpc" "this" {
  cidr_block           = local.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, { Name = "${local.cluster_name}-vpc" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.common_tags, { Name = "${local.cluster_name}-igw" })
}

resource "aws_subnet" "private" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(local.common_tags, {
    Name                                          = "${local.cluster_name}-private-${local.azs[count.index]}"
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
    "kubernetes.io/role/internal-elb"             = "1"
  })
}

resource "aws_subnet" "public" {
  count                   = length(local.azs)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name                                          = "${local.cluster_name}-public-${local.azs[count.index]}"
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
    "kubernetes.io/role/elb"                      = "1"
  })
}

resource "aws_subnet" "database" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.db_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-db-${local.azs[count.index]}"
    Tier = "database"
  })
}

resource "aws_eip" "nat" {
  count  = length(local.azs)
  domain = "vpc"
  tags   = merge(local.common_tags, { Name = "${local.cluster_name}-nat-eip-${count.index}" })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  count         = length(local.azs)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-nat-${local.azs[count.index]}"
  })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "private" {
  count  = length(local.azs)
  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[count.index].id
  }

  tags = merge(local.common_tags, { Name = "${local.cluster_name}-private-rt-${count.index}" })
}

resource "aws_route_table_association" "private" {
  count          = length(local.azs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(local.common_tags, { Name = "${local.cluster_name}-public-rt" })
}

resource "aws_route_table_association" "public" {
  count          = length(local.azs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ── VPC Flow Logs ─────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  name              = "/aws/vpc/${local.cluster_name}/flow-logs"
  retention_in_days = 90

  tags = local.common_tags
}

resource "aws_iam_role" "vpc_flow_logs" {
  name = "${local.cluster_name}-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "vpc_flow_logs" {
  name = "${local.cluster_name}-vpc-flow-logs-policy"
  role = aws_iam_role.vpc_flow_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_flow_log" "vpc" {
  iam_role_arn    = aws_iam_role.vpc_flow_logs.arn
  log_destination = aws_cloudwatch_log_group.vpc_flow_logs.arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.this.id

  tags = merge(local.common_tags, { Name = "${local.cluster_name}-vpc-flow-logs" })
}

# ── EKS Module ────────────────────────────────────────────────────────────────
module "eks" {
  source = "../../modules/eks"

  cluster_name       = local.cluster_name
  kubernetes_version = var.kubernetes_version
  environment        = local.environment

  vpc_id             = aws_vpc.this.id
  private_subnet_ids = aws_subnet.private[*].id
  public_subnet_ids  = aws_subnet.public[*].id

  endpoint_public_access = false
  service_ipv4_cidr      = "172.20.0.0/16"

  # General ON_DEMAND nodes
  general_instance_types = ["t3.medium"]
  general_desired_size   = var.general_node_desired
  general_min_size       = var.general_node_min
  general_max_size       = var.general_node_max

  # SPOT burst nodes
  spot_instance_types = ["t3.large", "m5.large", "m5a.large"]
  spot_desired_size   = var.spot_node_desired
  spot_min_size       = var.spot_node_min
  spot_max_size       = var.spot_node_max

  log_retention_days  = 90
  cluster_admin_arns  = var.cluster_admin_arns

  tags = local.common_tags
}

# ── RDS Module ────────────────────────────────────────────────────────────────
module "rds" {
  source = "../../modules/rds"

  identifier     = "ecompilot-prod"
  engine_version = "16.3"
  instance_class = var.rds_instance_class

  allocated_storage     = 100
  max_allocated_storage = 1000
  iops                  = 3000
  storage_throughput    = 125

  db_name         = "ecompilot"
  master_username = "ecompilot_admin"

  vpc_id                     = aws_vpc.this.id
  subnet_ids                 = aws_subnet.database[*].id
  eks_node_security_group_id = module.eks.node_security_group_id

  multi_az                              = true
  backup_retention_period               = 7
  backup_window                         = "03:00-04:00"
  maintenance_window                    = "sun:04:00-sun:05:00"
  performance_insights_retention_period = 7
  deletion_protection                   = true
  skip_final_snapshot                   = false

  tags = local.common_tags
}

# ── ElastiCache Module ────────────────────────────────────────────────────────
module "elasticache" {
  source = "../../modules/elasticache"

  cluster_id    = "ecompilot-prod"
  environment   = local.environment
  engine_version = "7.1"
  node_type     = var.redis_node_type

  num_cache_nodes    = 2
  availability_zones = local.azs

  vpc_id                     = aws_vpc.this.id
  subnet_ids                 = aws_subnet.private[*].id
  eks_node_security_group_id = module.eks.node_security_group_id

  snapshot_retention_limit = 7
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "sun:06:00-sun:07:00"
  log_retention_days       = 30

  tags = local.common_tags
}

# ── S3 Module ─────────────────────────────────────────────────────────────────
module "s3_media" {
  source = "../../modules/s3"

  bucket_name        = "ecompilot-media-${local.account_id}-${local.region}"
  versioning_enabled = true
  force_destroy      = false

  cors_allowed_origins = [
    "https://app.ecompilot.com",
    "https://admin.ecompilot.com",
  ]

  tags = local.common_tags
}

# ── CloudFront Module ─────────────────────────────────────────────────────────
module "cloudfront_media" {
  source = "../../modules/cloudfront"

  providers = {
    aws = aws.us_east_1
  }

  distribution_name              = "ecompilot-media-prod"
  s3_bucket_regional_domain_name = module.s3_media.bucket_regional_domain_name
  acm_certificate_arn            = var.cloudfront_acm_certificate_arn
  domain_aliases                 = ["cdn.ecompilot.com", "media.ecompilot.com"]

  origin_shield_enabled = true
  origin_shield_region  = local.region

  waf_web_acl_arn = var.waf_web_acl_arn
  log_retention_days = 90

  alarm_sns_topic_arn = var.alarm_sns_topic_arn

  tags = local.common_tags
}

# ── Terraform State Backend Resources ────────────────────────────────────────
# These resources are managed separately (bootstrapped once via init script)
# Referenced here for documentation purposes

# ── gp3 StorageClass for EKS ─────────────────────────────────────────────────
resource "kubernetes_storage_class" "gp3" {
  metadata {
    name = "gp3"
    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "true"
    }
  }

  storage_provisioner    = "ebs.csi.aws.com"
  volume_binding_mode    = "WaitForFirstConsumer"
  allow_volume_expansion = true
  reclaim_policy         = "Retain"

  parameters = {
    type       = "gp3"
    fsType     = "ext4"
    encrypted  = "true"
    kmsKeyId   = module.eks.kms_key_id
    throughput = "125"
    iops       = "3000"
  }

  depends_on = [module.eks]
}
