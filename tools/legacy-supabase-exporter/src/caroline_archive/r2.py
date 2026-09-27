from __future__ import annotations

import hashlib
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from .errors import ArchiveWriteConfirmationRequired, ObjectCollisionError


class R2ArchiveClient:
    """Create-only R2 writer.

    This class intentionally exposes no delete operation and no overwrite option.
    Every upload is preceded by HEAD and also uses IfNoneMatch='*' to protect
    against a race between the collision check and PUT.
    """

    def __init__(self, *, endpoint_url: str, access_key_id: str, secret_access_key: str, confirmed: bool):
        if not confirmed:
            raise ArchiveWriteConfirmationRequired()
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name="auto",
        )

    def exists(self, bucket: str, key: str) -> bool:
        try:
            self._client.head_object(Bucket=bucket, Key=key)
            return True
        except ClientError as exc:
            status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if status == 404 or code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise

    def upload_new(self, bucket: str, key: str, path: str | Path, *, content_type: str) -> dict:
        path = Path(path)
        if self.exists(bucket, key):
            raise ObjectCollisionError(f"{bucket}/{key}")
        try:
            with path.open("rb") as handle:
                self._client.put_object(
                    Bucket=bucket,
                    Key=key,
                    Body=handle,
                    ContentType=content_type,
                    IfNoneMatch="*",
                )
        except ClientError as exc:
            status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if status == 412 or code in {"PreconditionFailed", "412"}:
                raise ObjectCollisionError(f"{bucket}/{key}") from exc
            raise
        return self.verify(bucket, key, path)

    def verify(self, bucket: str, key: str, path: str | Path) -> dict:
        path = Path(path)
        expected_size = path.stat().st_size
        expected_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        head = self._client.head_object(Bucket=bucket, Key=key)
        if int(head.get("ContentLength", -1)) != expected_size:
            raise RuntimeError(f"R2 size mismatch for {bucket}/{key}")
        response = self._client.get_object(Bucket=bucket, Key=key)
        digest = hashlib.sha256()
        while chunk := response["Body"].read(1024 * 1024):
            digest.update(chunk)
        actual_hash = digest.hexdigest()
        if actual_hash != expected_hash:
            raise RuntimeError(f"R2 SHA-256 mismatch for {bucket}/{key}")
        return {"size_bytes": expected_size, "sha256": actual_hash, "readback_verified": True}
