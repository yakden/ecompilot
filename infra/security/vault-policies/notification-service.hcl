# -----------------------------------------------------------------------------
# Vault Policy: notification-service
# Grants read-only access to notification-service secrets.
# -----------------------------------------------------------------------------

path "secret/data/notification/*" {
  capabilities = ["read"]
}

path "secret/metadata/notification/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
