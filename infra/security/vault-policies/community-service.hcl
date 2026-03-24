# -----------------------------------------------------------------------------
# Vault Policy: community-service
# Grants read-only access to community-service secrets.
# -----------------------------------------------------------------------------

path "secret/data/community/*" {
  capabilities = ["read"]
}

path "secret/metadata/community/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
