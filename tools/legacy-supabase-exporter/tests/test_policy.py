import pytest

from caroline_archive.errors import ProhibitedSecretSourceError, RagExcludedError, RelationNotAllowlistedError, RelationNotExportableError
from caroline_archive.policy import RAG_EXCLUDED_RELATIONS, assert_raw_export_allowed, assert_relation_safe


def test_every_rag_relation_fails_closed():
    for relation in RAG_EXCLUDED_RELATIONS:
        with pytest.raises(RagExcludedError) as exc:
            assert_relation_safe(relation, operation="row_export")
        assert exc.value.code == "RAG_EXCLUDED_LEGACY_SURFACE"


def test_secret_source_fails_closed():
    with pytest.raises(ProhibitedSecretSourceError) as exc:
        assert_relation_safe("vault.decrypted_secrets", operation="row_export")
    assert exc.value.code == "PROHIBITED_SECRET_SOURCE"


def test_non_allowlisted_relation_fails_closed():
    with pytest.raises(RelationNotAllowlistedError):
        assert_relation_safe("definitely_not_a_real_relation")


def test_derived_view_is_not_raw_exportable():
    with pytest.raises(RelationNotExportableError):
        assert_raw_export_allowed("agent_performance")
