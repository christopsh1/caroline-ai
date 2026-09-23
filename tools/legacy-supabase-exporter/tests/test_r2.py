from unittest.mock import patch

import pytest

from caroline_archive.errors import ArchiveWriteConfirmationRequired, ObjectCollisionError
from caroline_archive.r2 import R2ArchiveClient


class ExistsClient:
    def head_object(self, **kwargs):
        return {"ContentLength": 1}


def test_r2_client_requires_explicit_confirmation():
    with pytest.raises(ArchiveWriteConfirmationRequired):
        R2ArchiveClient(endpoint_url="https://example.invalid", access_key_id="placeholder", secret_access_key="placeholder", confirmed=False)


def test_collision_fails_before_put(tmp_path):
    path = tmp_path / "x"
    path.write_bytes(b"x")
    fake = ExistsClient()
    with patch("caroline_archive.r2.boto3.client", return_value=fake):
        client = R2ArchiveClient(endpoint_url="https://example.invalid", access_key_id="placeholder", secret_access_key="placeholder", confirmed=True)
        with pytest.raises(ObjectCollisionError):
            client.upload_new("bucket", "key", path, content_type="application/octet-stream")
