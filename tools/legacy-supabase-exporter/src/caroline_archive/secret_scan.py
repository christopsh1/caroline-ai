from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .errors import SecretScanError

_PLACEHOLDER_RE = re.compile(r"\$\{[A-Z0-9_]+\}")

_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("authorization_header", re.compile(r"(?i)\bauthorization\s*[:=]\s*(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}")),
    ("bearer_token", re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{20,}")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("credential_database_url", re.compile(r"(?i)\bpostgres(?:ql)?://[^\s:@/]+:[^\s@/]+@[^\s]+")),
    ("aws_style_access_key", re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("generic_secret_assignment", re.compile(
        r"(?i)\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|service[_-]?role[_-]?key|auth[_-]?token|password|private[_-]?key|webhook[_-]?secret|account[_-]?auth[_-]?token)\b\s*[:=]\s*[\"']?[A-Za-z0-9._~+/=-]{16,}"
    )),
    ("cloudflare_token_assignment", re.compile(r"(?i)\b(?:cloudflare|cf)[_-]?(?:api[_-]?)?token\b\s*[:=]\s*[\"']?[A-Za-z0-9_-]{20,}")),
    ("supabase_key_assignment", re.compile(r"(?i)\bsupabase[_-]?(?:service[_-]?role[_-]?)?key\b\s*[:=]\s*[\"']?[A-Za-z0-9._-]{20,}")),
)

@dataclass(frozen=True)
class Finding:
    kind: str
    line: int


def _without_placeholders(text: str) -> str:
    return _PLACEHOLDER_RE.sub("${PLACEHOLDER}", text)


def scan_text(text: str) -> list[Finding]:
    cleaned = _without_placeholders(text)
    findings: list[Finding] = []
    for kind, pattern in _PATTERNS:
        for match in pattern.finditer(cleaned):
            line = cleaned.count("\n", 0, match.start()) + 1
            findings.append(Finding(kind, line))
    return sorted(set(findings), key=lambda x: (x.line, x.kind))


def scan_file(path: str | Path) -> list[Finding]:
    return scan_text(Path(path).read_text(encoding="utf-8", errors="replace"))


def assert_clean_text(text: str, label: str = "artifact") -> None:
    findings = scan_text(text)
    if findings:
        summary = ", ".join(f"{f.kind}@L{f.line}" for f in findings)
        raise SecretScanError(f"{label}: {summary}")


def assert_clean_file(path: str | Path) -> None:
    findings = scan_file(path)
    if findings:
        summary = ", ".join(f"{f.kind}@L{f.line}" for f in findings)
        raise SecretScanError(f"{path}: {summary}")
