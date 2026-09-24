from caroline_archive.checksum import CommutativeChecksum
from caroline_archive.keys import relation_prefix


def checksum(rows):
    c = CommutativeChecksum()
    for row in rows:
        c.update(row)
    return c.hexdigest()


def test_checksum_is_deterministic_and_order_independent():
    rows = [{"id": 1, "v": "a"}, {"id": 2, "v": "b"}, {"id": 3, "v": None}]
    assert checksum(rows) == checksum(list(reversed(rows)))


def test_bucket_routing():
    bucket, prefix = relation_prefix("events_processed", "01ARZ3NDEKTSV4RRFFQ69G5FAV")
    assert bucket == "caroline-events-raw"
    assert "/events/events_processed/export=01ARZ3NDEKTSV4RRFFQ69G5FAV" in prefix
    bucket, prefix = relation_prefix("call_history", "01ARZ3NDEKTSV4RRFFQ69G5FAV")
    assert bucket == "caroline-transcripts"
    assert "/communications/call_history/" in prefix
