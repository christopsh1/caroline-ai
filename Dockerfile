FROM docker/mcp-gateway@sha256:f5a679a05fc39022a046167bef92aeeb01bcd59485ad27843ae5227db7950688

EXPOSE 8811

# MCP_GATEWAY_AUTH_TOKEN is read by the gateway for bearer-token auth.
ENTRYPOINT ["/docker-mcp", "gateway", "run"]
CMD ["--transport=sse", "--host=0.0.0.0", "--port=8811"]
