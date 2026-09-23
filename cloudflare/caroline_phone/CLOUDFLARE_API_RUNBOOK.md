# Cloudflare Existing-Resource Inventory Runbook — v3.10

This runbook is read-only. It does not create Workers, KV namespaces, R2 buckets, Queues, Durable Objects, routes, or secrets.

Inventory:
- Workers: `GET accounts/$ACCOUNT_ID/workers/scripts`
- KV: `GET accounts/$ACCOUNT_ID/storage/kv/namespaces`
- R2: `GET accounts/$ACCOUNT_ID/r2/buckets`
- Queues: `GET accounts/$ACCOUNT_ID/queues`

Expected known values:
- account ID: `882fc7501e4632c7c58879d5c1d5b672`
- KV title: `Caroline_Phone`
- KV ID: `85679a0030e846ee931226aa1a6e6332`

The project automation only reports whether configured R2/Queue names are present. It performs no create/update/delete API call.
