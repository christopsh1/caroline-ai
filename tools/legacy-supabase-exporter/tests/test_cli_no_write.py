from types import SimpleNamespace
from unittest.mock import patch

from caroline_archive.cli import main


def test_plan_mode_never_builds_r2_client(capsys):
    with patch("caroline_archive.cli.r2_client_from_env") as r2:
        assert main(["--plan"]) == 0
        r2.assert_not_called()
    assert '"external_writes": false' in capsys.readouterr().out


def test_validate_mode_never_builds_r2_client(capsys):
    with patch("caroline_archive.cli.r2_client_from_env") as r2:
        assert main(["--validate"]) == 0
        r2.assert_not_called()


def test_multi_relation_dry_run_uses_one_export_id(tmp_path, capsys):
    export_id = "01ARZ3NDEKTSV4RRFFQ69G5FZZ"
    staged = [
        SimpleNamespace(
            relation="events_processed",
            export_id=export_id,
            bucket="caroline-events-raw",
            prefix=f"supabase/drsyygxqwxuyoyjbsaqs/events/events_processed/export={export_id}",
            manifest_path=tmp_path / "events-manifest.json",
        ),
        SimpleNamespace(
            relation="contacts",
            export_id=export_id,
            bucket="caroline-artifacts",
            prefix=f"supabase/drsyygxqwxuyoyjbsaqs/reference/contacts/export={export_id}",
            manifest_path=tmp_path / "contacts-manifest.json",
        ),
    ]
    with (
        patch("caroline_archive.cli.ReadOnlySupabaseSource"),
        patch("caroline_archive.cli.new_ulid", return_value=export_id),
        patch("caroline_archive.cli.stage_export", side_effect=staged) as stage,
        patch("caroline_archive.cli.r2_client_from_env") as r2,
    ):
        assert main([
            "--dry-run",
            "--relation", "events_processed",
            "--relation", "contacts",
            "--output-dir", str(tmp_path),
        ]) == 0
        r2.assert_not_called()

    assert stage.call_count == 2
    assert {call.kwargs["export_id"] for call in stage.call_args_list} == {export_id}
    output = capsys.readouterr().out
    assert f'"export_id": "{export_id}"' in output
