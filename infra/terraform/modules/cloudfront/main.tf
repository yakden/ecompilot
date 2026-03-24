# ─────────────────────────────────────────────────────────────────────────────
# CloudFront Module — CDN with S3 origin, TLSv1.2_2021, PriceClass_100
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

# ── KMS key for CloudFront logs ───────────────────────────────────────────────
# Note: CloudFront access logs cannot be encrypted with KMS (S3 restriction)
# We use SSE-S3 for logs bucket and KMS for the origin S3 bucket

# ── Origin Access Control (OAC) — replaces OAI ───────────────────────────────
resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.distribution_name}-oac"
  description                       = "OAC for ${var.distribution_name} S3 origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── CloudFront Log Bucket ─────────────────────────────────────────────────────
resource "aws_s3_bucket" "logs" {
  bucket        = "${var.distribution_name}-cf-logs"
  force_destroy = var.force_destroy

  tags = merge(var.tags, {
    Name    = "${var.distribution_name}-cf-logs"
    Service = "cloudfront-logs"
  })
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "log-retention"
    status = "Enabled"

    filter {}

    expiration {
      days = var.log_retention_days
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }
}

# ── Response Headers Policy ───────────────────────────────────────────────────
resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name    = "${var.distribution_name}-security-headers"
  comment = "Security headers for ${var.distribution_name}"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    content_security_policy {
      content_security_policy = "default-src 'self'; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'"
      override                = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=()"
      override = true
    }
    items {
      header   = "Cache-Control"
      value    = "public, max-age=31536000, immutable"
      override = false
    }
  }
}

# ── Cache Policies ────────────────────────────────────────────────────────────
resource "aws_cloudfront_cache_policy" "media" {
  name        = "${var.distribution_name}-media-cache"
  comment     = "Cache policy for media files (long TTL)"
  default_ttl = 86400    # 1 day
  max_ttl     = 31536000 # 1 year
  min_ttl     = 3600     # 1 hour

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# ── CloudFront Distribution ───────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "EcomPilot ${var.distribution_name} CDN"
  default_root_object = var.default_root_object
  price_class         = "PriceClass_100"
  http_version        = "http2and3"
  web_acl_id          = var.waf_web_acl_arn

  # S3 Origin
  origin {
    domain_name              = var.s3_bucket_regional_domain_name
    origin_id                = "S3-${var.distribution_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id

    origin_shield {
      enabled              = var.origin_shield_enabled
      origin_shield_region = var.origin_shield_region
    }
  }

  # Default cache behavior
  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "S3-${var.distribution_name}"
    cache_policy_id            = aws_cloudfront_cache_policy.media.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id
    compress                   = true
    viewer_protocol_policy     = "redirect-to-https"

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.url_rewrite.arn
    }
  }

  # Path-specific behaviors
  ordered_cache_behavior {
    path_pattern               = "/media/*"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "S3-${var.distribution_name}"
    cache_policy_id            = aws_cloudfront_cache_policy.media.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id
    compress                   = true
    viewer_protocol_policy     = "redirect-to-https"
  }

  ordered_cache_behavior {
    path_pattern               = "/public/*"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "S3-${var.distribution_name}"
    cache_policy_id            = aws_cloudfront_cache_policy.media.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id
    compress                   = true
    viewer_protocol_policy     = "redirect-to-https"
  }

  # Custom error responses
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  # TLS configuration
  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # Aliases (CNAMEs)
  aliases = var.domain_aliases

  # Geo restrictions (none for SaaS PL — open worldwide)
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Access logging
  logging_config {
    include_cookies = false
    bucket          = aws_s3_bucket.logs.bucket_domain_name
    prefix          = "cloudfront/"
  }

  tags = merge(var.tags, {
    Name    = var.distribution_name
    Service = "cloudfront"
  })

  depends_on = [
    aws_s3_bucket_public_access_block.logs,
    aws_s3_bucket_ownership_controls.logs,
  ]
}

# ── CloudFront Function — URL normalization ───────────────────────────────────
resource "aws_cloudfront_function" "url_rewrite" {
  name    = "${var.distribution_name}-url-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Normalize URLs and add security headers"
  publish = true

  code = <<-EOT
    async function handler(event) {
      const request = event.request;
      const uri = request.uri;

      // Remove trailing slash for non-root requests
      if (uri.endsWith('/') && uri !== '/') {
        return {
          statusCode: 301,
          headers: {
            location: { value: uri.slice(0, -1) }
          }
        };
      }

      // Normalize to lowercase
      if (uri !== uri.toLowerCase()) {
        return {
          statusCode: 301,
          headers: {
            location: { value: uri.toLowerCase() }
          }
        };
      }

      return request;
    }
  EOT
}

# ── WAF Web ACL Association (optional) ───────────────────────────────────────
# WAF ACL is created separately and referenced via var.waf_web_acl_arn

# ── CloudWatch Alarms for CloudFront ──────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "cf_5xx" {
  alarm_name          = "${var.distribution_name}-5xx-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "5xxErrorRate"
  namespace           = "AWS/CloudFront"
  period              = 300
  statistic           = "Average"
  threshold           = 5
  alarm_description   = "CloudFront 5xx error rate exceeds 5%"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DistributionId = aws_cloudfront_distribution.this.id
    Region         = "Global"
  }

  alarm_actions = var.alarm_sns_topic_arn != null ? [var.alarm_sns_topic_arn] : []
  ok_actions    = var.alarm_sns_topic_arn != null ? [var.alarm_sns_topic_arn] : []

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "cf_4xx" {
  alarm_name          = "${var.distribution_name}-4xx-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "4xxErrorRate"
  namespace           = "AWS/CloudFront"
  period              = 300
  statistic           = "Average"
  threshold           = 10
  alarm_description   = "CloudFront 4xx error rate exceeds 10%"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DistributionId = aws_cloudfront_distribution.this.id
    Region         = "Global"
  }

  alarm_actions = var.alarm_sns_topic_arn != null ? [var.alarm_sns_topic_arn] : []

  tags = var.tags
}
