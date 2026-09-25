FROM ghcr.io/cociweb/mcp-gateway:latest

COPY config/mcpServers.json /app/config/mcpServers.json

ENV MCP_SERVERS_CONFIG=/app/config/mcpServers.json

EXPOSE 8811

ENTRYPOINT ["sh", "-c", "export GATEWAY_PORT=${PORT:-8811}; exec python -m gateway.main"]
