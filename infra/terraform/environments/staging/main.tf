# ─────────────────────────────────────────────────────────────────────────────
# EcomPilot — Staging Environment
# Region: eu-central-1 (Frankfurt)
# Cost-optimized: smaller instances, single-AZ where possible
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
    key            = "ecompilot/staging/terraform.tfstate"
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
      Environment = "staging"
      ManagedBy   = "terraform"
      CostCenter  = "engineering"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "ecompilot"
      Environment = "staging"
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

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  environment  = "staging"
  cluster_name = "ecompilot-staging"
  region       = var.aws_region
  account_id   = data.aws_caller_identity.current.account_id

  # Use only 2 AZs for staging to reduce cost
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  common_tags = {
    Project     = "ecompilot"
    Environment = local.environment
    ManagedBy   = "terraform"
    CostCenter  = "engineering"
  }

  vpc_cidr             = "10.1.0.0/16"
  private_subnet_cidrs = ["10.1.1.0/24", "10.1.2.0/24"]
  public_subnet_cidrs  = ["10.1.101.0/24", "10.1.102.0/24"]
  db_subnet_cidrs      = ["10.1.201.0/24", "10.1.202.0/24"]
}

# ── VPC (simplified for staging) ──────────────────────────────────────────────
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
  count             = length(local.azs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.public_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

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

  tags = merge(local.common_tags, { Name = "${local.cluster_name}-db-${local.azs[count.index]}" })
}

# Single NAT gateway for staging (cost saving)
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = merge(local.common_tags, { Name = "${local.cluster_name}-nat-eip" })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = merge(local.common_tags, { Name = "${local.cluster_name}-nat" })
  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }

  tags = merge(local.common_tags, { Name = "${local.cluster_name}-private-rt" })
}

resource "aws_route_table_association" "private" {
  count          = length(local.azs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
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

# ── EKS Module (cost-optimized for staging) ───────────────────────────────────
module "eks" {
  source = "../../modules/eks"

  cluster_name       = local.cluster_name
  kubernetes_version = var.kubernetes_version
  environment        = local.environment

  vpc_id             = aws_vpc.this.id
  private_subnet_ids = aws_subnet.private[*].id
  public_subnet_ids  = aws_subnet.public[*].id

  endpoint_public_access = var.endpoint_public_access
  public_access_cidrs    = var.public_access_cidrs

  # Smaller node groups for staging
  general_instance_types = ["t3.medium"]
  general_desired_size   = 2
  general_min_size       = 1
  general_max_size       = 5

  spot_instance_types = ["t3.large", "t3a.large"]
  spot_desired_size   = 0
  spot_min_size       = 0
  spot_max_size       = 5

  log_retention_days = 30
  cluster_admin_arns = var.cluster_admin_arns

  tags = local.common_tags
}

# ── RDS Module (staging: no multi-AZ, shorter retention) ─────────────────────
module "rds" {
  source = "../../modules/rds"

  identifier     = "ecompilot-staging"
  engine_version = "16.3"
  instance_class = "db.t3.micro"

  allocated_storage     = 20
  max_allocated_storage = 100

  db_name         = "ecompilot"
  master_username = "ecompilot_admin"

  vpc_id                     = aws_vpc.this.id
  subnet_ids                 = aws_subnet.database[*].id
  eks_node_security_group_id = module.eks.node_security_group_id

  multi_az                              = false
  backup_retention_period               = 3
  backup_window                         = "03:00-04:00"
  maintenance_window                    = "sun:04:00-sun:05:00"
  performance_insights_retention_period = 7
  deletion_protection                   = false
  skip_final_snapshot                   = true

  tags = local.common_tags
}

# ── ElastiCache Module (staging: single node) ─────────────────────────────────
module "elasticache" {
  source = "../../modules/elasticache"

  cluster_id     = "ecompilot-staging"
  environment    = local.environment
  engine_version = "7.1"
  node_type      = "cache.t3.micro"

  num_cache_nodes = 1

  vpc_id                     = aws_vpc.this.id
  subnet_ids                 = aws_subnet.private[*].id
  eks_node_security_group_id = module.eks.node_security_group_id

  snapshot_retention_limit = 1
  log_retention_days       = 7

  tags = local.common_tags
}

# ── S3 Module ─────────────────────────────────────────────────────────────────
module "s3_media" {
  source = "../../modules/s3"

  bucket_name        = "ecompilot-media-staging-${local.account_id}-${local.region}"
  versioning_enabled = true
  force_destroy      = true

  cors_allowed_origins = [
    "https://app-staging.ecompilot.com",
    "http://localhost:3000",
  ]

  tags = local.common_tags
}

# ── gp3 StorageClass ──────────────────────────────────────────────────────────
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
  reclaim_policy         = "Delete"

  parameters = {
    type      = "gp3"
    fsType    = "ext4"
    encrypted = "true"
  }

  depends_on = [module.eks]
}
