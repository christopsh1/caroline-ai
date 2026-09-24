# Exporter CI safety boundary

The `validate-legacy-supabase-exporter.yml` workflow is validation-only.

It installs the exporter, validates the static policy/manifest schema, and runs the unit/safety tests.

It has no Supabase database credential, no R2 credential, no deployment step, and no archive-write invocation.

The workflow must not be repurposed into an archive-write workflow. Real archive execution remains a separately invoked runtime operation using the explicit `--confirm-archive-write` mode and secret-store bindings.
