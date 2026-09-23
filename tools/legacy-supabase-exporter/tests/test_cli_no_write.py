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
