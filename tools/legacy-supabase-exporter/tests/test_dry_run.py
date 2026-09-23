import json
from unittest.mock import Mock

from caroline_archive.exporter import stage_export


class FakeSource:
    def describe(self, relation):
        return {
            "relation": relation,
            "columns": ("event_id", "processed_at", "event_type"),
            "actual_columns": ["event_id", "processed_at", "event_type", "details"],
            "primary_key": ["event_id"],
            "schema_fingerprint": "a" * 64,
        }

    def stream_rows(self, relation):
        yield {"event_id": "e1", "processed_at": "2026-09-23T00:00:00Z", "event_type": "test"}


def test_dry_run_stages_complete_manifest_without_upload(tmp_path):
    upload = Mock()
    staged = stage_export(FakeSource(), "events_processed", tmp_path, export_id="01ARZ3NDEKTSV4RRFFQ69G5FAV")
    assert staged.manifest_path.exists()
    manifest = json.loads(staged.manifest_path.read_text())
    assert manifest["dataset"]["row_count"] == 1
    assert manifest["integrity"]["readback_verified"] is False
    upload.assert_not_called()
