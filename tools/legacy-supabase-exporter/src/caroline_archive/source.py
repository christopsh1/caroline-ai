from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager
from typing import Iterable, Iterator

try:
    import psycopg
    from psycopg import sql
    from psycopg.rows import dict_row
except ImportError:  # allows policy/tests to run before optional runtime deps are installed
    psycopg = None
    sql = None
    dict_row = None

from .policy import (
    APPROVED_COLUMNS,
    FILTER_RAG_REFERENCES,
    RAG_EXCLUDED_RELATIONS,
    assert_raw_export_allowed,
)


class ReadOnlySupabaseSource:
    def __init__(self, db_url: str):
        if not db_url:
            raise ValueError("SUPABASE_DB_URL is required")
        self._db_url = db_url

    @contextmanager
    def connection(self):
        if psycopg is None:
            raise RuntimeError("psycopg is required for Supabase extraction; install the package dependencies")
        conn = psycopg.connect(
            self._db_url,
            row_factory=dict_row,
            autocommit=False,
            options="-c default_transaction_read_only=on -c statement_timeout=600000",
        )
        try:
            with conn.transaction(isolation_level=psycopg.IsolationLevel.REPEATABLE_READ, read_only=True):
                yield conn
        finally:
            conn.close()

    def describe(self, relation: str) -> dict:
        relation = assert_raw_export_allowed(relation)  # fail before any SQL
        with self.connection() as conn:
            columns = conn.execute(
                """
                select column_name, data_type, udt_name, is_nullable, ordinal_position
                from information_schema.columns
                where table_schema = 'public' and table_name = %s
                order by ordinal_position
                """,
                (relation,),
            ).fetchall()
            if not columns:
                raise ValueError(f"relation not found in public schema: {relation}")
            actual = {row["column_name"] for row in columns}
            approved = APPROVED_COLUMNS[relation]
            missing = [column for column in approved if column not in actual]
            if missing:
                raise ValueError(f"approved columns missing from {relation}: {missing}")
            pk_rows = conn.execute(
                """
                select a.attname as column_name
                from pg_index i
                join pg_class c on c.oid = i.indrelid
                join pg_namespace n on n.oid = c.relnamespace
                join unnest(i.indkey) with ordinality as k(attnum, ord) on true
                join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
                where n.nspname = 'public' and c.relname = %s and i.indisprimary
                order by k.ord
                """,
                (relation,),
            ).fetchall()
            pk = [row["column_name"] for row in pk_rows if row["column_name"] in approved]
            fingerprint_payload = {
                "relation": relation,
                "approved_columns": approved,
                "actual_types": [row for row in columns if row["column_name"] in approved],
                "primary_key": pk,
            }
            fingerprint = hashlib.sha256(
                json.dumps(fingerprint_payload, sort_keys=True, default=str, separators=(",", ":")).encode()
            ).hexdigest()
            return {"relation": relation, "columns": approved, "actual_columns": [row["column_name"] for row in columns], "primary_key": pk, "schema_fingerprint": fingerprint}

    def stream_rows(self, relation: str, *, batch_size: int = 1000) -> Iterator[dict]:
        relation = assert_raw_export_allowed(relation)  # fail before connection/query
        columns = APPROVED_COLUMNS[relation]
        with self.connection() as conn:
            query = sql.SQL("select {} from {}.{}").format(
                sql.SQL(", ").join(sql.Identifier(c) for c in columns),
                sql.Identifier("public"),
                sql.Identifier(relation),
            )
            params: list[object] = []
            if relation in FILTER_RAG_REFERENCES:
                query += sql.SQL(" where not ({} = any(%s))").format(sql.Identifier("source_table"))
                params.append(list(RAG_EXCLUDED_RELATIONS))
            # Stable order where possible. If no known key, fallback checksum remains order-independent.
            description = self.describe_with_connection(conn, relation)
            if description["primary_key"]:
                query += sql.SQL(" order by {} ").format(
                    sql.SQL(", ").join(sql.Identifier(c) for c in description["primary_key"])
                )
            with conn.cursor(name=f"archive_{relation}") as cur:
                cur.itersize = batch_size
                cur.execute(query, params)
                for row in cur:
                    yield dict(row)

    def describe_with_connection(self, conn, relation: str) -> dict:
        # Same metadata check as describe(), but shares the relation's repeatable-read transaction.
        columns = conn.execute(
            """
            select column_name, data_type, udt_name, is_nullable, ordinal_position
            from information_schema.columns
            where table_schema = 'public' and table_name = %s
            order by ordinal_position
            """,
            (relation,),
        ).fetchall()
        actual = {row["column_name"] for row in columns}
        approved = APPROVED_COLUMNS[relation]
        missing = [column for column in approved if column not in actual]
        if missing:
            raise ValueError(f"approved columns missing from {relation}: {missing}")
        pk_rows = conn.execute(
            """
            select a.attname as column_name
            from pg_index i
            join pg_class c on c.oid = i.indrelid
            join pg_namespace n on n.oid = c.relnamespace
            join unnest(i.indkey) with ordinality as k(attnum, ord) on true
            join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
            where n.nspname = 'public' and c.relname = %s and i.indisprimary
            order by k.ord
            """,
            (relation,),
        ).fetchall()
        pk = [row["column_name"] for row in pk_rows if row["column_name"] in approved]
        fingerprint_payload = {
            "relation": relation,
            "approved_columns": approved,
            "actual_types": [row for row in columns if row["column_name"] in approved],
            "primary_key": pk,
        }
        fingerprint = hashlib.sha256(
            json.dumps(fingerprint_payload, sort_keys=True, default=str, separators=(",", ":")).encode()
        ).hexdigest()
        return {"relation": relation, "columns": approved, "actual_columns": [row["column_name"] for row in columns], "primary_key": pk, "schema_fingerprint": fingerprint}

    def export_stream(self, relation: str, *, batch_size: int = 1000) -> tuple[dict, Iterable[dict]]:
        relation = assert_raw_export_allowed(relation)
        # Metadata is queried only after the relation passed the hard deny/allow checks.
        description = self.describe(relation)
        return description, self.stream_rows(relation, batch_size=batch_size)
