# -----------------------------------------------------------------------------
# Vault Policy: marketplace-hub
# Grants read-only access to marketplace-hub secrets.
# -----------------------------------------------------------------------------

path "secret/data/marketplace/*" {
  capabilities = ["read"]
}

path "secret/metadata/marketplace/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
