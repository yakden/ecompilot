# -----------------------------------------------------------------------------
# Vault Policy: billing-service
# Grants read-only access to billing-service secrets.
# -----------------------------------------------------------------------------

path "secret/data/billing/*" {
  capabilities = ["read"]
}

path "secret/metadata/billing/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
