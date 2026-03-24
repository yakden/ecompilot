# -----------------------------------------------------------------------------
# Vault Policy: api-gateway
# Grants read-only access to api-gateway secrets.
# -----------------------------------------------------------------------------

path "secret/data/api-gateway/*" {
  capabilities = ["read"]
}

path "secret/metadata/api-gateway/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
