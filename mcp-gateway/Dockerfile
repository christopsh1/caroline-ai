FROM node:20-alpine

WORKDIR /app

RUN npm install -g supergateway

EXPOSE 8811

CMD ["sh", "-c", "supergateway \\
  --port 8811 \\
  --server github:https://api.githubcopilot.com/mcp \\
  --server cloudflare:https://bindings.mcp.cloudflare.com/mcp \\
  --server elevenlabs:https://api.elevenlabs.io/v1/mcp \\
  --server supabase:https://mcp.supabase.com/mcp \\
  --server neon:https://mcp.neon.tech/sse"]
