# -----------------------------------------------------------------------------
# Vault Policy: ai-service
# Grants read-only access to ai-service secrets.
# -----------------------------------------------------------------------------

path "secret/data/ai/*" {
  capabilities = ["read"]
}

path "secret/metadata/ai/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
