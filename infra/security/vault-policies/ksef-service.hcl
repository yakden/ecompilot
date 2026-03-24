# -----------------------------------------------------------------------------
# Vault Policy: ksef-service
# Grants read-only access to ksef-service secrets (Polish e-invoice system).
# -----------------------------------------------------------------------------

path "secret/data/ksef/*" {
  capabilities = ["read"]
}

path "secret/metadata/ksef/*" {
  capabilities = ["list"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
