# Archive validation plan

Every future real archive must produce evidence for human review before any legacy cleanup is considered.

Required evidence per relation:

1. Source relation passed RAG/secret/allowlist guards before row access.
2. Source connection was read-only and the row stream ran in a repeatable-read transaction.
3. Only approved columns were selected.
4. Generated rows passed secret scanning.
5. JSONL.gz row count recorded.
6. Deterministic primary-key checksum recorded; if no approved stable PK exists, use deterministic multiset row checksum.
7. Optional Parquet row count equals canonical JSONL row count.
8. Every R2 key was absent before upload.
9. Every object SHA-256 matches after read-back.
10. Manifest validates against `archive-manifest.schema.json`.
11. Manifest contains no credentials and marks the archive as non-runtime/reference-only.
12. Representative restore remains a separate owner-approved isolated test.

No successful archive result authorizes table deletion, truncation, trigger/function/scheduler changes, RAG changes, credential rotation, phone changes, Worker deployment, Neon migration, or live cutover.
