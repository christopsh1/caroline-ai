FROM docker/mcp-gateway:latest

EXPOSE 8811

ENTRYPOINT ["sh", "-c"]
CMD ["/docker-mcp gateway run --transport=sse --host=0.0.0.0 --port=${PORT:-8811} --servers=github --servers=cloudflare --servers=elevenlabs --servers=supabase --servers=neon"]
