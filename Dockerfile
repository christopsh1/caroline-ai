FROM docker/mcp-gateway:latest

EXPOSE 8811

# MCP_GATEWAY_AUTH_TOKEN is read by the gateway for bearer-token auth.
CMD ["--transport=sse", "--host=0.0.0.0", "--port=8811"]
