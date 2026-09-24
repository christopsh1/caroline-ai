# R2 extraction map

All real archive keys use a new immutable ULID segment: `export=<ULID>`. No exporter code supports delete or overwrite.

## `caroline-events-raw`

```text
supabase/drsyygxqwxuyoyjbsaqs/events/<relation>/export=<ULID>/
  data-00001.jsonl.gz
  data-00001.parquet      # optional
  redaction-report.json
  manifest.json
```

Used for approved event, queue/status, metrics, retry and audit histories.

## `caroline-transcripts`

```text
supabase/drsyygxqwxuyoyjbsaqs/communications/<relation>/export=<ULID>/
```

Used only for approved `call_history`, `call_turns`, and `sms_history`. Legacy RAG transcript projections are excluded.

## `caroline-artifacts`

```text
supabase/drsyygxqwxuyoyjbsaqs/<category>/<relation>/export=<ULID>/
```

For approved reference relations. Sanitized schemas/config/contracts/reports use dedicated artifact categories outside raw relation export and require review before R2 write.

## `caroline-media`

Inventory only in this project. No external provider media fetch/copy is authorized.

## Upload ordering

1. Generate and secret-scan local data/report objects.
2. `HEAD` every destination key.
3. Any collision fails the run.
4. Create object with a no-overwrite precondition.
5. Read back and compare size + SHA-256.
6. Only after every referenced object verifies, create the manifest object.
