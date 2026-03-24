# -----------------------------------------------------------------------------
# Vault Policy: logistics-engine
# Grants read-only access to logistics-engine secrets.
# -----------------------------------------------------------------------------

path "secret/data/logistics/*" {
  capabilities = ["read"]
}

path "secret/metadata/logistics/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
