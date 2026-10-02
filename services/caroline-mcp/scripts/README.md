# Caroline MCP CI bootstrap

This directory contains deployment-process helpers for GitHub Actions. They normalize Cloudflare deployment authentication and resolve the account that owns `caroline-mcp` without logging credential values.

These scripts do **not** provision Caroline MCP runtime credentials into Cloudflare Worker Secrets. Runtime credentials are resolved by the deployed Worker from the Infisical-backed `secrets-gateway` using `WORKER_NAME=caroline-mcp`.

The only Cloudflare Worker secrets permitted on `caroline-mcp` are `GATEWAY_TOKEN` and `GATEWAY_URL`.
