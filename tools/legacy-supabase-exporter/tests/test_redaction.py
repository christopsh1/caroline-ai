from caroline_archive.redaction import sanitize


def test_redaction_transforms_sensitive_configuration():
    source = {
        "api_token": "never-export-this-value",
        "endpoint_url": "https://live.example.invalid/hook",
        "agent_id": "runtime-id",
        "owner_phone": "+15555555555",
        "rag_embedding_model": "legacy-model",
        "safe_policy": "owner-approval-required",
    }
    cleaned, report = sanitize(source)
    assert cleaned["api_token"] == "${SECRET_STORE_BINDING_REQUIRED}"
    assert cleaned["endpoint_url"] == "${PROVIDER_ENDPOINT_CONFIGURED_EXTERNALLY}"
    assert cleaned["agent_id"] == "${RUNTIME_RESOURCE_ID_REQUIRED}"
    assert cleaned["owner_phone"] == "${OWNER_CONFIG_REQUIRED}"
    assert cleaned["rag_embedding_model"] == "${ENVIRONMENT_BINDING_REQUIRED}"
    assert cleaned["safe_policy"] == "owner-approval-required"
    assert len(report) == 5
    assert "never-export-this-value" not in repr(report)
