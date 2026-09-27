from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

SECRET_PLACEHOLDER = "${SECRET_STORE_BINDING_REQUIRED}"
ENDPOINT_PLACEHOLDER = "${PROVIDER_ENDPOINT_CONFIGURED_EXTERNALLY}"
RESOURCE_PLACEHOLDER = "${RUNTIME_RESOURCE_ID_REQUIRED}"
OWNER_PLACEHOLDER = "${OWNER_CONFIG_REQUIRED}"
ENV_PLACEHOLDER = "${ENVIRONMENT_BINDING_REQUIRED}"

_SECRET_KEYS = ("secret", "token", "password", "authorization", "api_key", "apikey", "private_key", "service_role", "credential")
_ENDPOINT_KEYS = ("url", "endpoint", "host", "webhook")
_OWNER_KEYS = ("owner_phone", "owner_email", "telegram_owner", "owner_chat", "primary_email")
_RESOURCE_KEYS = ("account_sid", "agent_id", "branch_id", "phone_number_id", "workspace_id", "base_id", "automation_id")
_RAG_TERMS = ("rag", "retriev", "embedding", "vector", "document_chunk", "call_transcript_chunk", "agent_memory", "memory_items", "contact_profile_items")

@dataclass(frozen=True)
class RedactionEntry:
    path: str
    category: str
    reason: str
    replacement: str


def _category_for_key(key: str) -> tuple[str, str, str] | None:
    k = key.lower()
    if any(term in k for term in _RAG_TERMS):
        return ("legacy_rag_reference", "Legacy RAG material is outside migration scope.", ENV_PLACEHOLDER)
    if any(term in k for term in _SECRET_KEYS):
        return ("credential_or_secret", "Credential/secret values are prohibited from export.", SECRET_PLACEHOLDER)
    if any(term in k for term in _OWNER_KEYS):
        return ("owner_configuration", "Owner-specific configuration must be supplied outside archived templates.", OWNER_PLACEHOLDER)
    if any(term in k for term in _ENDPOINT_KEYS):
        return ("provider_endpoint", "Live endpoint configuration is not portable template material.", ENDPOINT_PLACEHOLDER)
    if any(term in k for term in _RESOURCE_KEYS):
        return ("runtime_resource_identifier", "Provider/runtime resource identifiers are environment-specific.", RESOURCE_PLACEHOLDER)
    return None


def sanitize(value: Any, *, path: str = "$") -> tuple[Any, list[RedactionEntry]]:
    report: list[RedactionEntry] = []
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            key_path = f"{path}.{key}"
            category = _category_for_key(str(key))
            if category:
                cat, reason, replacement = category
                out[key] = replacement
                report.append(RedactionEntry(key_path, cat, reason, replacement))
            else:
                cleaned, nested = sanitize(item, path=key_path)
                out[key] = cleaned
                report.extend(nested)
        return out, report
    if isinstance(value, list):
        out = []
        for i, item in enumerate(value):
            cleaned, nested = sanitize(item, path=f"{path}[{i}]")
            out.append(cleaned)
            report.extend(nested)
        return out, report
    return value, report


def redaction_report(source_category: str, entries: list[RedactionEntry]) -> dict[str, Any]:
    return {
        "policy_version": "caroline.export-redaction.v1",
        "source_category": source_category,
        "redactions": [asdict(e) for e in entries],
        "legacy_value_exported": False,
        "confirmation": "Original secret/credential/live endpoint values are not included in this report.",
    }
