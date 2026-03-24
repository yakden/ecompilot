# -----------------------------------------------------------------------------
# Vault Policy: content-service
# Grants read-only access to content-service secrets.
# -----------------------------------------------------------------------------

path "secret/data/content/*" {
  capabilities = ["read"]
}

path "secret/metadata/content/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
