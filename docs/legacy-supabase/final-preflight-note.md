# Final preflight note

Before any real archive write:

1. Runtime secrets must be present outside Git/chat.
2. `bash scripts/run-approved-set.sh dry-run` must complete successfully.
3. Local manifests must verify.
4. Only then may `bash scripts/run-approved-set.sh write` be invoked.

RAG exclusions and prohibited secret sources remain fail-closed regardless of owner approval for the non-RAG archive set.
