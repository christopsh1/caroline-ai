#!/bin/sh
set -u

PORT="${PORT:-8811}"

add_remote() {
  name="$1"
  url="$2"

  # Containers are ephemeral; ensure the registry entry is recreated cleanly.
  mcp-gway remove "$name" >/dev/null 2>&1 || true

  if ! mcp-gway add "$name" --type remote --url "$url" --timeout 3000; then
    echo "warning: initial discovery failed for ${name}; gateway will still start and the server can be authenticated/refreshed later" >&2
  fi
}

add_remote github "https://api.githubcopilot.com/mcp/"
add_remote cloudflare-bindings "https://bindings.mcp.cloudflare.com/mcp"
add_remote elevenlabs "https://api.elevenlabs.io/v1/mcp"
add_remote supabase "https://mcp.supabase.com/mcp"
add_remote neon "https://mcp.neon.tech/mcp"

exec mcp-gway serve --host 0.0.0.0 --port "$PORT"
