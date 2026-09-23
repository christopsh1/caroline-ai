import gzip
import json

from caroline_archive.writers import write_jsonl_gz


def test_jsonl_row_count_and_checksum_deterministic(tmp_path):
    rows = [{"event_id": "b", "status": None}, {"event_id": "a", "status": "ok"}]
    a = write_jsonl_gz(iter(rows), tmp_path / "a.jsonl.gz", ["event_id"])
    b = write_jsonl_gz(iter(reversed(rows)), tmp_path / "b.jsonl.gz", ["event_id"])
    assert a.row_count == b.row_count == 2
    assert a.primary_key_checksum == b.primary_key_checksum
    with gzip.open(a.path, "rt", encoding="utf-8") as handle:
        decoded = [json.loads(line) for line in handle if line.strip()]
    assert decoded == rows
