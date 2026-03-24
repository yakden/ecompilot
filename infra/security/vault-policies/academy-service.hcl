# -----------------------------------------------------------------------------
# Vault Policy: academy-service
# Grants read-only access to academy-service secrets.
# -----------------------------------------------------------------------------

path "secret/data/academy/*" {
  capabilities = ["read"]
}

path "secret/metadata/academy/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
