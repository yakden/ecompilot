# -----------------------------------------------------------------------------
# Vault Policy: legal-service
# Grants read-only access to legal-service secrets.
# -----------------------------------------------------------------------------

path "secret/data/legal/*" {
  capabilities = ["read"]
}

path "secret/metadata/legal/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
