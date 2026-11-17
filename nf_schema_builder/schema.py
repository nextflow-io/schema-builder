"""
Load, inspect and validate Nextflow JSON schemas.

Two kinds of schema are understood:

* **parameters** - a pipeline ``nextflow_schema.json``: an object whose parameters
  live in groups under ``$defs`` (nf-schema) or ``definitions`` (nf-validation),
  and/or directly under the top-level ``properties``.
* **samplesheet** - e.g. ``assets/schema_input.json``: an array whose ``items``
  describe the columns of a samplesheet.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Iterator, Mapping
from enum import Enum
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from jsonschema.protocols import Validator
from jsonschema.validators import validator_for

from nf_schema_builder.exceptions import InvalidSchemaError

Schema = dict[str, Any]

DEFS_KEYS = ("$defs", "definitions")
DEFAULT_INDENT = 4


class SchemaKind(str, Enum):
    """The kind of Nextflow schema a document describes."""

    PARAMETERS = "parameters"
    SAMPLESHEET = "samplesheet"


def load_schema(path: str | os.PathLike[str]) -> Schema:
    """Read a JSON schema file and return it as a dict."""
    path = Path(path)
    try:
        schema = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise InvalidSchemaError(f"Schema file not found: {path}") from e
    except json.JSONDecodeError as e:
        raise InvalidSchemaError(f"{path} is not valid JSON: {e}") from e
    if not isinstance(schema, dict):
        raise InvalidSchemaError(f"{path} must contain a JSON object at the top level")
    return schema


def detect_indent(text: str) -> int | str:
    """Return the indentation used by a JSON document, so edits can keep it."""
    match = re.search(r'^([ \t]+)"', text, flags=re.MULTILINE)
    if not match:
        return DEFAULT_INDENT
    indent = match.group(1)
    return indent if "\t" in indent else len(indent)


def dump_schema(schema: Schema, path: str | os.PathLike[str], indent: int | str | None = None) -> None:
    """
    Write a schema to disk.

    If ``indent`` is not given, the indentation of the existing file is kept
    (four spaces for new files, the nf-core convention).
    """
    path = Path(path)
    if indent is None:
        indent = detect_indent(path.read_text(encoding="utf-8")) if path.exists() else DEFAULT_INDENT
    path.write_text(json.dumps(schema, indent=indent, ensure_ascii=False) + "\n", encoding="utf-8")


def schema_kind(schema: Schema) -> SchemaKind:
    """Tell a samplesheet schema from a pipeline parameter schema."""
    if schema.get("type") == "array" or isinstance(schema.get("items"), dict):
        return SchemaKind.SAMPLESHEET
    return SchemaKind.PARAMETERS


def validator_class(schema: Schema) -> type[Validator]:
    """Return the validator for the draft named in ``$schema`` (2020-12 if there is none)."""
    return validator_for(schema, default=Draft202012Validator)


def check_schema(schema: object) -> None:
    """
    Check that ``schema`` is a valid JSON Schema for the draft named in ``$schema``.

    Raises:
        InvalidSchemaError: if it is not.

    """
    if not isinstance(schema, dict):
        raise InvalidSchemaError("A schema must be a JSON object")
    try:
        validator_class(schema).check_schema(schema)
    except SchemaError as e:
        location = "/".join(str(part) for part in e.absolute_path) or "<root>"
        raise InvalidSchemaError(f"Invalid JSON schema at {location}: {e.message}") from e


def _params(container: object) -> Iterator[tuple[str, Schema]]:
    properties = container.get("properties") if isinstance(container, dict) else None
    if isinstance(properties, dict):
        yield from ((name, definition) for name, definition in properties.items() if isinstance(definition, dict))


def iter_params(schema: Schema) -> Iterator[tuple[str, Schema, str | None]]:
    """
    Yield ``(name, definition, group)`` for every parameter (or samplesheet column).

    ``group`` is the key of the definition group holding the parameter, or
    ``None`` for parameters that are not in a group.
    """
    if schema_kind(schema) is SchemaKind.SAMPLESHEET:
        yield from ((name, definition, None) for name, definition in _params(schema.get("items")))
        return

    yield from ((name, definition, None) for name, definition in _params(schema))
    for defs_key in DEFS_KEYS:
        groups = schema.get(defs_key)
        for group_key, group in groups.items() if isinstance(groups, dict) else ():
            yield from ((name, definition, group_key) for name, definition in _params(group))


def infer_param_schema(value: object) -> Schema:
    """Build a minimal parameter definition from a default value."""
    if isinstance(value, bool):
        param_type = "boolean"
    elif isinstance(value, int):
        param_type = "integer"
    elif isinstance(value, float):
        param_type = "number"
    else:
        param_type = "string"
        value = None if value is None else str(value)

    definition: Schema = {"type": param_type}
    # Same convention as nf-core: no default for false-y values, except 0
    if value or (value == 0 and value is not False):
        definition["default"] = value
    return definition


def add_params(schema: Schema, params: Mapping[str, object]) -> list[str]:
    """
    Add parameters that are not yet in the schema, inferring types from their values.

    New parameters are added ungrouped, to the top-level ``properties``, so they
    can be sorted into groups in the editor. Returns the names that were added.
    """
    if schema_kind(schema) is not SchemaKind.PARAMETERS:
        raise InvalidSchemaError("Parameters can only be added to a pipeline parameter schema")
    existing = {name for name, _, _ in iter_params(schema)}
    added = [name for name in params if name not in existing]
    if added:
        properties = schema.setdefault("properties", {})
        for name in added:
            properties[name] = infer_param_schema(params[name])
    return added
