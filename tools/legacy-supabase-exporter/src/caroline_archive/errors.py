class ArchiveError(RuntimeError):
    code = "ARCHIVE_ERROR"

    def __init__(self, message: str | None = None):
        super().__init__(message or self.code)


class RagExcludedError(ArchiveError):
    code = "RAG_EXCLUDED_LEGACY_SURFACE"


class ProhibitedSecretSourceError(ArchiveError):
    code = "PROHIBITED_SECRET_SOURCE"


class RelationNotAllowlistedError(ArchiveError):
    code = "RELATION_NOT_ALLOWLISTED"


class RelationNotExportableError(ArchiveError):
    code = "RELATION_NOT_EXPORTABLE"


class ObjectCollisionError(ArchiveError):
    code = "R2_OBJECT_COLLISION"


class SecretScanError(ArchiveError):
    code = "SECRET_SCAN_FAILED"


class ArchiveWriteConfirmationRequired(ArchiveError):
    code = "ARCHIVE_WRITE_CONFIRMATION_REQUIRED"
