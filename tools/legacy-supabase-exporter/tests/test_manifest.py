from caroline_archive.manifest import build_manifest, dump_manifest, validate_manifest


def test_manifest_schema_and_no_credentials():
    manifest = build_manifest(
        relation="events_processed",
        export_id="01ARZ3NDEKTSV4RRFFQ69G5FAV",
        exporter_version="0.1.0",
        schema_fingerprint="a" * 64,
        source_query_description="SELECT approved columns from public.events_processed",
        watermark_column=None,
        watermark_through=None,
        row_count=0,
        primary_key_columns=["event_id"],
        primary_key_checksum="b" * 64,
        object_entries=[],
        secret_scan_passed=True,
    )
    validate_manifest(manifest)
    text = dump_manifest(manifest)
    assert "Bearer " not in text
    assert "postgresql://" not in text
    assert '"contains_credentials": false' in text
