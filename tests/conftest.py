"""Shared pytest fixtures."""

import json
from pathlib import Path
from typing import Any

import pytest

DATA = Path(__file__).parent / "data"


@pytest.fixture
def params_schema() -> dict[str, Any]:
    """Return a small pipeline parameter schema with one group and one ungrouped parameter."""
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Test pipeline parameters",
        "type": "object",
        "$defs": {
            "input_output_options": {
                "title": "Input/output options",
                "type": "object",
                "required": ["input"],
                "properties": {
                    "input": {"type": "string", "format": "file-path", "pattern": "^\\S+\\.csv$"},
                    "max_cpus": {"type": "integer", "default": 16, "minimum": 1},
                },
            }
        },
        "allOf": [{"$ref": "#/$defs/input_output_options"}],
        "properties": {"ungrouped": {"type": "boolean"}},
    }


@pytest.fixture
def samplesheet_schema() -> dict[str, Any]:
    """Return the samplesheet schema of nf-core/rnadnavar."""
    return json.loads((DATA / "schema_input.json").read_text())


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    """Create a stand-in for the built web editor."""
    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<!doctype html><title>editor</title>")
    (static / "assets" / "app.js").write_text("console.log('hi')")
    (tmp_path / "secret.txt").write_text("secret")
    return static


@pytest.fixture
def built_editor(monkeypatch: pytest.MonkeyPatch, static_dir: Path) -> Path:
    """Make servers that are not given a `static_dir` serve the stand-in editor."""
    monkeypatch.setattr("nf_schema_builder.server.STATIC_DIR", static_dir)
    return static_dir
