#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-dry-run}"
OUTPUT_DIR="${ARCHIVE_OUTPUT_DIR:-.archive-staging}"

RELATIONS=(
  agent_creator_runs
  agent_improvements
  agent_runs
  airtable_sync_jobs
  availability_state
  brain_turn_metrics
  calendar_events
  calendar_shares
  call_answering_restrictions
  call_history
  call_turns
  commitments
  contact_card_details
  contact_card_field_provenance
  contact_mentions
  contact_permissions
  contacts
  events_processed
  instructions
  phone_admission_events
  project_contacts
  projects
  relationships
  scheduled_actions
  sms_history
  transcript_ingestion_jobs
)

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required secret/config binding: %s\n' "$name" >&2
    exit 2
  fi
}

require_var SUPABASE_DB_URL

ARGS=(--output-dir "$OUTPUT_DIR")
for relation in "${RELATIONS[@]}"; do
  ARGS+=(--relation "$relation")
done

case "$MODE" in
  dry-run)
    printf 'Running approved 26-relation archive dry-run. R2 writes are disabled.\n' >&2
    exec caroline-archive --dry-run "${ARGS[@]}"
    ;;
  write)
    require_var R2_ENDPOINT_URL
    require_var R2_ACCESS_KEY_ID
    require_var R2_SECRET_ACCESS_KEY
    printf 'Running owner-approved 26-relation immutable archive write.\n' >&2
    exec caroline-archive --confirm-archive-write "${ARGS[@]}"
    ;;
  *)
    printf 'Usage: %s [dry-run|write]\n' "$0" >&2
    exit 2
    ;;
esac
