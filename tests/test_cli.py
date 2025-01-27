"""Tests for cli.py module."""

import shutil
from pathlib import Path
from unittest.mock import patch

import pytest
from typer.testing import CliRunner

from nf_schema_builder.cli import app

runner = CliRunner(mix_stderr=False)


@pytest.fixture
def schema_file(tmp_path: Path) -> Path:
    """Copy schema file for testing from tests/test-schema.json to tmp_path."""
    shutil.copy("tests/test-schema.json", tmp_path / "nextflow_schema.json")
    shutil.copy("tests/main.nf", tmp_path / "main.nf")

    return Path(tmp_path / "nextflow_schema.json")


# def test_send_command_success(schema_file: Path) -> None:
#     """Test successful schema sending."""
#     with patch("nf_schema_builder.cli.send_schema") as mock_send:
#         mock_send.return_value = "Success"
#         result = runner.invoke(app, ["send", str(schema_file)])
#         assert result.exit_code == 0
#         assert "✅ Schema sent successfully" in result.stdout


# def test_send_command_no_file() -> None:
#     """Test send command with non-existent file."""
#     result = runner.invoke(app, ["send", "nonexistent.json"])
#     assert result.exit_code == 1
#     assert "Schema file not found" in result.stdout


# def test_send_command_invalid_schema(tmp_path: Path) -> None:
#     """Test send command with invalid schema."""
#     invalid_file = tmp_path / "invalid.json"
#     with open(invalid_file, "w") as f:
#         f.write("invalid json")

#     result = runner.invoke(app, ["send", str(invalid_file)])
#     assert result.exit_code == 1


def test_validate_command_success(schema_file: Path, caplog: pytest.LogCaptureFixture) -> None:
    """Test successful schema validation."""
    mock_config = {"plugins": "nf-schema", "params.test_param": "value"}

    with (
        patch("nf_schema_builder.utils.check_nextflow_installation", return_value=True),
        patch("nf_schema_builder.utils.fetch_wf_config", return_value=mock_config),
    ):
        result = runner.invoke(app, ["validate", str(schema_file)], catch_exceptions=False)
        assert result.exit_code == 0
        assert "All parameters are valid!" in caplog.text


def test_validate_command_no_nextflow(schema_file: Path, caplog: pytest.LogCaptureFixture) -> None:
    """Test validate command without Nextflow installed."""
    with patch("nf_schema_builder.utils.check_nextflow_installation", return_value=False):
        result = runner.invoke(app, ["validate", str(schema_file)], catch_exceptions=False)
        assert result.exit_code == 1
        assert "Nextflow is not installed" in caplog.text


def test_validate_command_invalid_params(schema_file: Path, caplog: pytest.LogCaptureFixture) -> None:
    """Test validate command with invalid parameters."""
    mock_config = {
        "plugins": "nf-schema",
        "params.test_param": 42,  # Should be string according to schema
    }

    with (
        patch("nf_schema_builder.utils.check_nextflow_installation", return_value=True),
        patch("nf_schema_builder.utils.fetch_wf_config", return_value=mock_config),
    ):
        result = runner.invoke(app, ["validate", str(schema_file)], catch_exceptions=False)
        assert result.exit_code == 1  # Should fail due to invalid params
        assert "Schema validation failed" in caplog.text


def test_debug_mode(schema_file: Path) -> None:
    """Test debug mode in commands."""
    with (
        patch("nf_schema_builder.utils.check_nextflow_installation", return_value=True),
        patch("nf_schema_builder.utils.fetch_wf_config", return_value={}),
        patch("nf_schema_builder.cli.set_debug") as mock_set_debug,
    ):
        runner.invoke(app, ["validate", str(schema_file), "--debug"], catch_exceptions=False)
        mock_set_debug.assert_called_once_with(True)
