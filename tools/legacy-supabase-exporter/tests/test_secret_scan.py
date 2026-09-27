import pytest

from caroline_archive.errors import SecretScanError
from caroline_archive.secret_scan import assert_clean_text, scan_text


@pytest.mark.parametrize("sample", [
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345",
    "api_key=abcdefghijklmnopqrstuvwxyz0123456789",
    "postgresql://user:supersecret@db.example.invalid/postgres",
    "-----BEGIN PRIVATE KEY-----\nabc",
    "SUPABASE_SERVICE_ROLE_KEY=abcdefghijklmnopqrstuvwxyz012345",
    "CLOUDFLARE_API_TOKEN=abcdefghijklmnopqrstuvwxyz012345",
])
def test_scanner_detects_credential_material(sample):
    assert scan_text(sample)
    with pytest.raises(SecretScanError):
        assert_clean_text(sample)


def test_scanner_allows_explicit_placeholders():
    assert not scan_text("api_key=${SECRET_STORE_BINDING_REQUIRED}\nendpoint=${PROVIDER_ENDPOINT_CONFIGURED_EXTERNALLY}")
