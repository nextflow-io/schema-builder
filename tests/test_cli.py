"""Tests for cli.py."""

import json
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
from typer.testing import CliRunner

from nf_schema_builder import NextflowError, __version__
from nf_schema_builder.cli import app

runner = CliRunner()

FLAT_CONFIG = {
    "params.input": "null",
    "params.max_cpus": "16",
    "params.ungrouped": "false",
    "plugins": "['nf-schema@2.3.0']",
}


@pytest.fixture
def pipeline(tmp_path: Path, params_schema: dict[str, Any]) -> Path:
    """Create a pipeline directory and return the path of its schema."""
    (tmp_path / "nextflow.config").write_text("params { input = null }")
    schema_file = tmp_path / "nextflow_schema.json"
    schema_file.write_text(json.dumps(params_schema, indent=4) + "\n")
    return schema_file


def test_version() -> None:
    """--version prints the version."""
    result = runner.invoke(app, ["--version"])
    assert result.exit_code == 0
    assert __version__ in result.output


def test_validate_schema_only(tmp_path: Path, samplesheet_schema: dict[str, Any]) -> None:
    """A schema outside a pipeline is validated without needing Nextflow."""
    schema_file = tmp_path / "schema_input.json"
    schema_file.write_text(json.dumps(samplesheet_schema))
    with patch("nf_schema_builder.workflow.fetch_workflow_config", side_effect=AssertionError("must not be called")):
        result = runner.invoke(app, ["validate", str(schema_file)])
    assert result.exit_code == 0, result.output
    assert "samplesheet schema, 15 columns" in result.output


def test_validate_matches_pipeline(pipeline: Path) -> None:
    """A schema that matches the pipeline passes."""
    with patch("nf_schema_builder.workflow.fetch_workflow_config", return_value=FLAT_CONFIG):
        result = runner.invoke(app, ["validate", str(pipeline)])
    assert result.exit_code == 0, result.output
    assert "matches the parameters" in result.output


def test_validate_reports_differences(pipeline: Path) -> None:
    """Differences with the pipeline are listed and fail the command."""
    config = {"params.input": "null", "params.max_cpus": "0", "params.outdir": "'results'"}
    with patch("nf_schema_builder.workflow.fetch_workflow_config", return_value=config):
        result = runner.invoke(app, ["validate", str(pipeline)])
    assert result.exit_code == 1
    for expected in ("outdir", "Not in the schema", "ungrouped", "max_cpus", "not valid"):
        assert expected in result.output


def test_validate_invalid_schema(tmp_path: Path) -> None:
    """An invalid schema fails with a message."""
    schema_file = tmp_path / "schema.json"
    schema_file.write_text('{"type": "nonsense"}')
    result = runner.invoke(app, ["validate", str(schema_file)])
    assert result.exit_code == 1
    assert "Invalid JSON schema" in result.output


def test_validate_missing_file(tmp_path: Path) -> None:
    """A missing file fails with a message."""
    result = runner.invoke(app, ["validate", str(tmp_path / "nope.json")])
    assert result.exit_code == 1
    assert "not found" in result.output


def test_validate_without_nextflow(pipeline: Path) -> None:
    """A missing Nextflow installation is reported."""
    with patch(
        "nf_schema_builder.workflow.fetch_workflow_config", side_effect=NextflowError("Nextflow is not installed")
    ):
        result = runner.invoke(app, ["validate", str(pipeline)])
    assert result.exit_code == 1
    assert "Nextflow is not installed" in result.output


@pytest.mark.parametrize("command", ["edit", "send"])
def test_edit(pipeline: Path, command: str) -> None:
    """`edit` (and its old name `send`) opens the editor without needing Nextflow."""
    with (
        patch("nf_schema_builder.cli.edit_schema") as edit_schema,
        patch("nf_schema_builder.workflow.fetch_workflow_config", side_effect=AssertionError("must not be called")),
    ):
        result = runner.invoke(app, [command, str(pipeline), "--no-browser", "--port", "5173"])
    assert result.exit_code == 0, result.output
    edit_schema.assert_called_once_with(pipeline, host="127.0.0.1", port=5173, open_browser=False)


def test_default_command_edits_nextflow_schema(pipeline: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Without a command, ./nextflow_schema.json is edited."""
    monkeypatch.chdir(pipeline.parent)
    with patch("nf_schema_builder.cli.edit_schema") as edit_schema:
        result = runner.invoke(app, [])
    assert result.exit_code == 0, result.output
    edit_schema.assert_called_once_with(Path("nextflow_schema.json"), host="127.0.0.1", port=0, open_browser=True)


def test_edit_add_missing(pipeline: Path) -> None:
    """--add-missing writes the pipeline's new parameters to the schema before editing."""
    config = {**FLAT_CONFIG, "params.outdir": "'results'"}
    with (
        patch("nf_schema_builder.cli.edit_schema"),
        patch("nf_schema_builder.workflow.fetch_workflow_config", return_value=config),
    ):
        result = runner.invoke(app, ["edit", str(pipeline), "--add-missing"])
    assert result.exit_code == 0, result.output
    assert json.loads(pipeline.read_text())["properties"]["outdir"] == {"type": "string", "default": "results"}


def test_edit_invalid_schema(tmp_path: Path) -> None:
    """An invalid schema is not opened."""
    schema_file = tmp_path / "schema.json"
    schema_file.write_text("not json")
    with patch("nf_schema_builder.editor.SchemaServer") as server:
        result = runner.invoke(app, ["edit", str(schema_file)])
    assert result.exit_code == 1
    assert "not valid JSON" in result.output
    server.assert_not_called()
