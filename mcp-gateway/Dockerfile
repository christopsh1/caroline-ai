FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MCP_GWAY_ALLOW_REMOTE=1

WORKDIR /app

RUN pip install --no-cache-dir "mcp-gway==1.4.2"

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8811

ENTRYPOINT ["/app/entrypoint.sh"]
