# -----------------------------------------------------------------------------
# Vault Policy: suppliers-service
# Grants read-only access to suppliers-service secrets.
# -----------------------------------------------------------------------------

path "secret/data/suppliers/*" {
  capabilities = ["read"]
}

path "secret/metadata/suppliers/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
