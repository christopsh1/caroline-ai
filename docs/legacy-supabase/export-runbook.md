# Legacy Supabase export runbook

## 1. Inspect static plan

```bash
cd tools/legacy-supabase-exporter
caroline-archive --plan
```

No external access occurs.

## 2. Validate policy/schema

```bash
caroline-archive --validate
pytest
```

## 3. Owner approval gate

Before a real archive, record explicit approval for:

- exact relation set,
- current approved-column/redaction policy,
- destination bucket/prefix routing,
- restricted-data handling,
- read-only Supabase credential scope,
- create-only/non-delete R2 credential scope.

## 4. Dry run

Use a runtime-supplied read-only database credential. Do not paste it into Git or logs.

```bash
caroline-archive --dry-run --relation <approved_relation> --output-dir .archive-staging
```

Review the local manifest, row count, checksum, and redaction report.

## 5. Real archive write

Only after the approval gate:

```bash
caroline-archive --confirm-archive-write --relation <approved_relation> --output-dir .archive-staging
```

The command performs only create-new R2 writes. It does not mutate Supabase.

## 6. Verify evidence

```bash
caroline-archive --verify --manifest .archive-staging/<relation>/export=<ULID>/manifest.json
```

Review read-back verification in the uploaded final manifest.

## 7. Restore-test planning

```bash
caroline-archive --restore-test-plan
```

A real restore requires separate owner approval and an isolated disposable database.
