# -----------------------------------------------------------------------------
# Vault Policy: payment-reconciliation
# Grants read-only access to payment-reconciliation secrets.
# -----------------------------------------------------------------------------

path "secret/data/payment-reconciliation/*" {
  capabilities = ["read"]
}

path "secret/metadata/payment-reconciliation/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
