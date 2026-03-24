output "cluster_id" {
  description = "EKS cluster ID"
  value       = aws_eks_cluster.this.id
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.this.name
}

output "cluster_arn" {
  description = "EKS cluster ARN"
  value       = aws_eks_cluster.this.arn
}

output "cluster_endpoint" {
  description = "Endpoint URL for the EKS Kubernetes API server"
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_ca_certificate" {
  description = "Base64-encoded certificate authority data for the cluster"
  value       = aws_eks_cluster.this.certificate_authority[0].data
  sensitive   = true
}

output "cluster_version" {
  description = "The Kubernetes server version for the EKS cluster"
  value       = aws_eks_cluster.this.version
}

output "cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = aws_security_group.cluster.id
}

output "node_security_group_id" {
  description = "Security group ID attached to EKS worker nodes"
  value       = aws_security_group.nodes.id
}

output "oidc_provider_arn" {
  description = "ARN of the OIDC provider for IRSA"
  value       = aws_iam_openid_connect_provider.this.arn
}

output "oidc_provider_url" {
  description = "URL of the OIDC provider (without https://)"
  value       = replace(aws_iam_openid_connect_provider.this.url, "https://", "")
}

output "node_role_arn" {
  description = "ARN of the IAM role for EKS worker nodes"
  value       = aws_iam_role.nodes.arn
}

output "cluster_autoscaler_role_arn" {
  description = "ARN of the IAM role for Cluster Autoscaler"
  value       = aws_iam_role.cluster_autoscaler.arn
}

output "ebs_csi_role_arn" {
  description = "ARN of the IAM role for EBS CSI driver"
  value       = aws_iam_role.ebs_csi.arn
}

output "kms_key_arn" {
  description = "ARN of the KMS key used for EKS secrets encryption"
  value       = aws_kms_key.eks.arn
}

output "kms_key_id" {
  description = "ID of the KMS key used for EKS secrets encryption"
  value       = aws_kms_key.eks.key_id
}

output "general_node_group_name" {
  description = "Name of the general ON_DEMAND node group"
  value       = aws_eks_node_group.general.node_group_name
}

output "spot_node_group_name" {
  description = "Name of the SPOT node group"
  value       = aws_eks_node_group.spot.node_group_name
}

output "kubeconfig_command" {
  description = "AWS CLI command to update kubeconfig"
  value       = "aws eks update-kubeconfig --name ${aws_eks_cluster.this.name} --region ${data.aws_region.current.name}"
}
