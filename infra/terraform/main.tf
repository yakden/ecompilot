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
  }
  backend "s3" {
    # Configure via terraform init -backend-config
    key = "ecompilot/terraform.tfstate"
  }
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "ecompilot"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
