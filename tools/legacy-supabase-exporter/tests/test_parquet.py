import importlib.util

import pytest

from caroline_archive.writers import write_jsonl_gz, write_parquet_from_jsonl_gz


@pytest.mark.skipif(importlib.util.find_spec("pyarrow") is None, reason="optional parquet dependency not installed")
def test_parquet_row_count_matches(tmp_path):
    rows = [{"id": 1, "value": "a"}, {"id": 2, "value": "b"}]
    json_result = write_jsonl_gz(iter(rows), tmp_path / "data.jsonl.gz", ["id"])
    parquet_result = write_parquet_from_jsonl_gz(json_result.path, tmp_path / "data.parquet")
    assert parquet_result.row_count == json_result.row_count
