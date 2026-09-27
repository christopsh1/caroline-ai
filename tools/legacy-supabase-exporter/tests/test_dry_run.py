import json
from unittest.mock import Mock
from contextlib import contextmanager

from caroline_archive.exporter import stage_export
from caroline_archive.cli import verify_local_manifest


class FakeSource:
    @contextmanager
    def export_stream(self, relation):
        description = {
            "relation": relation,
            "columns": ("event_id", "processed_at", "event_type"),
            "actual_columns": ["event_id", "processed_at", "event_type", "details"],
            "primary_key": ["event_id"],
            "schema_fingerprint": "a" * 64,
        }
        rows = iter([{"event_id": "e1", "processed_at": "2026-09-23T00:00:00Z", "event_type": "test"}])
        yield description, rows


def test_dry_run_stages_complete_manifest_without_upload(tmp_path):
    upload = Mock()
    staged = stage_export(FakeSource(), "events_processed", tmp_path, export_id="01ARZ3NDEKTSV4RRFFQ69G5FAV")
    assert staged.manifest_path.exists()
    manifest = json.loads(staged.manifest_path.read_text())
    assert manifest["dataset"]["row_count"] == 1
    assert manifest["integrity"]["readback_verified"] is False
    upload.assert_not_called()


def test_verify_checks_staged_object_hashes(tmp_path):
    staged = stage_export(FakeSource(), "events_processed", tmp_path, export_id="01ARZ3NDEKTSV4RRFFQ69G5FAA")
    result = verify_local_manifest(staged.manifest_path)
    assert result["ok"] is True
    assert "data-00001.jsonl.gz" in result["verified_objects"]
    staged.data_objects[0][0].write_bytes(b"tampered")
    import pytest
    with pytest.raises(ValueError, match="size mismatch|SHA-256 mismatch"):
        verify_local_manifest(staged.manifest_path)
