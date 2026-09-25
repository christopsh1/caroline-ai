# Caroline MCP CI bootstrap

This directory contains the non-interactive bootstrap used by GitHub Actions to load Caroline MCP credentials from Infisical via GitHub OIDC, normalize Cloudflare authentication, resolve the account that owns `caroline-mcp`, and provision Worker runtime secrets without logging secret values.
