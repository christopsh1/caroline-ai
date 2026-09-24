# Approved archive execution command

The 26-relation raw-export set and redaction policy are owner-approved.

After runtime secrets are present, the required sequence is:

```bash
cd tools/legacy-supabase-exporter
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
caroline-archive --validate
pytest
bash scripts/run-approved-set.sh dry-run
```

Review the staged manifests and verify them locally. When the dry-run succeeds and the R2 runtime bindings are present, the approved write command is:

```bash
bash scripts/run-approved-set.sh write
```

The write runner invokes the exporter only through `--confirm-archive-write` and uses the same approved 26-relation list.

Required runtime bindings:

```text
SUPABASE_DB_URL
R2_ENDPOINT_URL
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

Secret values must remain outside Git, chat, manifests, logs, and reports.
