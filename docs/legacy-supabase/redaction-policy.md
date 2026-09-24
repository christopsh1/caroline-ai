# Legacy archive redaction policy

Policy version: `caroline.export-redaction.v1`

## Absolute prohibition

`vault.decrypted_secrets` must never be queried for this project. The required failure code is `PROHIBITED_SECRET_SOURCE`.

Never place credential values in R2, Git, manifests, reports, fixtures, or logs. This includes API keys, access/refresh tokens, authorization headers, bearer tokens, webhook secrets, provider credentials, database passwords, credential-bearing connection URLs, R2 secret keys, service-role keys, private keys, or hard-coded credential hashes.

## Sanitized template placeholders

- `${ENVIRONMENT_BINDING_REQUIRED}`
- `${SECRET_STORE_BINDING_REQUIRED}`
- `${PROVIDER_ENDPOINT_CONFIGURED_EXTERNALLY}`
- `${RUNTIME_RESOURCE_ID_REQUIRED}`
- `${OWNER_CONFIG_REQUIRED}`

## Raw archive selection

Raw relation exports use explicit approved-column allowlists. Omitted columns are not queried. Generated row JSON is secret-scanned before it is written to the local JSONL stream. A scanner hit fails the run for manual review; it does not silently redact historical communications.

This distinction matters: raw historical records should either be approved and faithful or blocked. Silent mutation of transcript/event evidence is not acceptable.

## Sanitized artifacts

Configuration/contract artifacts may replace sensitive field categories with placeholders. A redaction report may identify only the field category, reason, replacement mechanism, and confirmation that the original value was not exported.

## Legacy RAG references

Sanitized configuration/template output must remove legacy RAG-specific configuration and content rather than turning it into future-system requirements.
