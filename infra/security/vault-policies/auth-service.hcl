# -----------------------------------------------------------------------------
# Vault Policy: auth-service
# Grants read-only access to auth-service secrets.
# -----------------------------------------------------------------------------

path "secret/data/auth/*" {
  capabilities = ["read"]
}

path "secret/metadata/auth/*" {
  capabilities = ["list"]
}

# Allow the service to renew its own token
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Allow the service to look up its own token
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
