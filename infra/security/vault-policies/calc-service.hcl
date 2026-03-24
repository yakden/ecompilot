# -----------------------------------------------------------------------------
# Vault Policy: calc-service
# Grants read-only access to calc-service secrets.
# -----------------------------------------------------------------------------

path "secret/data/calc/*" {
  capabilities = ["read"]
}

path "secret/metadata/calc/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
