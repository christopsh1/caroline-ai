# Isolated restore-test plan

This environment is intentionally **not** a production restore utility. It is a disposable evidence environment for a future owner-approved restore test.

Rules:

- Validate the archive manifest and every object SHA-256 before loading anything.
- Supply archive objects to the container from a local read-only staging directory; do not give the container R2 write credentials.
- Do not provide Supabase production credentials, Twilio credentials, ElevenLabs credentials, Telegram credentials, provider tokens, or live endpoint configuration.
- Restore only relations approved in the non-RAG archive manifest. The RAG exclusion denylist still applies.
- Keep the Docker network internal so restored data cannot call production providers.
- Compare restored row counts and deterministic dataset checksums with the manifest.
- Save only a sanitized restore evidence report, then destroy the container and tmpfs database.

Planned operator sequence after separate approval:

```bash
# 1. Verify local archive files first.
caroline-archive --verify --manifest /approved/staging/manifest.json

# 2. Start isolated temporary Postgres.
docker compose -f restore-test/docker-compose.yml up -d

# 3. Load only an approved, purpose-built relational fixture/restore script.
#    This step is intentionally not automated until the exact restore mapping is approved.

# 4. Run row-count/checksum assertions.

# 5. Destroy the temporary database.
docker compose -f restore-test/docker-compose.yml down -v
```
