# -----------------------------------------------------------------------------
# Vault Policy: analytics-service
# Grants read-only access to analytics-service secrets.
# -----------------------------------------------------------------------------

path "secret/data/analytics/*" {
  capabilities = ["read"]
}

path "secret/metadata/analytics/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
