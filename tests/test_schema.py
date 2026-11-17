"""Tests for schema.py."""

import json
from pathlib import Path
from typing import Any

import pytest

from nf_schema_builder import (
    InvalidSchemaError,
    SchemaKind,
    add_params,
    check_schema,
    dump_schema,
    iter_params,
    load_schema,
    schema_kind,
)
from nf_schema_builder.schema import detect_indent, infer_param_schema


def test_load_schema(tmp_path: Path, params_schema: dict[str, Any]) -> None:
    """A schema file is read into a dict."""
    path = tmp_path / "nextflow_schema.json"
    path.write_text(json.dumps(params_schema))
    assert load_schema(path) == params_schema


@pytest.mark.parametrize("content", ["not json", "[1, 2]"])
def test_load_schema_invalid(tmp_path: Path, content: str) -> None:
    """Files that are not a JSON object are rejected."""
    path = tmp_path / "schema.json"
    path.write_text(content)
    with pytest.raises(InvalidSchemaError):
        load_schema(path)


def test_load_schema_missing(tmp_path: Path) -> None:
    """A missing file gives a clear error."""
    with pytest.raises(InvalidSchemaError, match="not found"):
        load_schema(tmp_path / "nope.json")


@pytest.mark.parametrize(("indent", "expected"), [(2, 2), (4, 4), ("\t", "\t")])
def test_dump_schema_keeps_indentation(tmp_path: Path, indent: Any, expected: Any) -> None:
    """Rewriting a file keeps its indentation and ends it with a newline."""
    path = tmp_path / "schema.json"
    path.write_text(json.dumps({"a": {"b": 1}}, indent=indent))
    assert detect_indent(path.read_text()) == expected

    dump_schema({"a": {"b": 2}, "ü": 1}, path)
    text = path.read_text(encoding="utf-8")
    assert text == json.dumps({"a": {"b": 2}, "ü": 1}, indent=indent, ensure_ascii=False) + "\n"


def test_dump_schema_new_file(tmp_path: Path) -> None:
    """New files use four spaces, like nf-core."""
    path = tmp_path / "new.json"
    dump_schema({"a": 1}, path)
    assert path.read_text() == '{\n    "a": 1\n}\n'


def test_schema_kind(params_schema: dict[str, Any], samplesheet_schema: dict[str, Any]) -> None:
    """Parameter and samplesheet schemas are told apart."""
    assert schema_kind(params_schema) is SchemaKind.PARAMETERS
    assert schema_kind(samplesheet_schema) is SchemaKind.SAMPLESHEET
    assert schema_kind({}) is SchemaKind.PARAMETERS


def test_check_schema(params_schema: dict[str, Any], samplesheet_schema: dict[str, Any]) -> None:
    """Valid schemas of both drafts pass."""
    check_schema(params_schema)
    check_schema(samplesheet_schema)  # draft-07


@pytest.mark.parametrize(
    "schema",
    [
        [],
        {"type": "nonsense"},
        {"$schema": "http://json-schema.org/draft-07/schema", "properties": {"a": {"minimum": "one"}}},
    ],
)
def test_check_schema_invalid(schema: Any) -> None:
    """Invalid schemas are rejected."""
    with pytest.raises(InvalidSchemaError):
        check_schema(schema)


def test_check_schema_error_names_location() -> None:
    """The error says where the problem is."""
    with pytest.raises(InvalidSchemaError, match="properties/a/type"):
        check_schema({"properties": {"a": {"type": "nonsense"}}})


def test_iter_params(params_schema: dict[str, Any]) -> None:
    """Grouped and ungrouped parameters are found."""
    found = {name: group for name, _, group in iter_params(params_schema)}
    assert found == {"ungrouped": None, "input": "input_output_options", "max_cpus": "input_output_options"}


def test_iter_params_definitions_notation() -> None:
    """The nf-validation `definitions` notation is understood."""
    schema = {"definitions": {"group": {"properties": {"a": {"type": "string"}}}}}
    assert [(name, group) for name, _, group in iter_params(schema)] == [("a", "group")]


def test_iter_params_samplesheet(samplesheet_schema: dict[str, Any]) -> None:
    """The columns of a samplesheet schema are found."""
    names = [name for name, _, _ in iter_params(samplesheet_schema)]
    assert names[:4] == ["patient", "sample", "status", "lane"]
    assert len(names) == 15


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (True, {"type": "boolean", "default": True}),
        (False, {"type": "boolean"}),
        (0, {"type": "integer", "default": 0}),
        (2.5, {"type": "number", "default": 2.5}),
        ("results", {"type": "string", "default": "results"}),
        ("", {"type": "string"}),
        (None, {"type": "string"}),
    ],
)
def test_infer_param_schema(value: Any, expected: dict[str, Any]) -> None:
    """Types and defaults are inferred from values."""
    assert infer_param_schema(value) == expected


def test_add_params(params_schema: dict[str, Any]) -> None:
    """Only parameters that are not in the schema yet are added."""
    added = add_params(params_schema, {"input": "x.csv", "outdir": "results", "ungrouped": True})
    assert added == ["outdir"]
    assert params_schema["properties"]["outdir"] == {"type": "string", "default": "results"}
    assert params_schema["properties"]["ungrouped"] == {"type": "boolean"}


def test_add_params_samplesheet(samplesheet_schema: dict[str, Any]) -> None:
    """Parameters cannot be added to a samplesheet schema."""
    with pytest.raises(InvalidSchemaError):
        add_params(samplesheet_schema, {"a": 1})
