"""Tests for schema.py module."""

import json
from pathlib import Path
from typing import Any

import pytest

from nf_schema_builder.schema import (
    load_schema,
    validate_config_default_parameter,
)


@pytest.fixture
def sample_schema() -> dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "properties": {"top_param": {"type": "string", "default": "top_value"}},
        "allOf": [{"$ref": "#/$defs/section1"}],
        "$defs": {
            "section1": {
                "properties": {
                    "param1": {"type": "string", "default": "value1"},
                    "param2": {"type": "integer", "default": 42},
                    "param3": {"type": "boolean", "default": True},
                    "param4": {"type": "string", "pattern": "^[A-Z]+$", "default": "ABC"},
                    "hidden_param": {"type": "string", "hidden": True},
                }
            }
        },
    }


@pytest.fixture
def schema_file(tmp_path: Path, sample_schema: dict[str, Any]) -> Path:
    json_file = tmp_path / "schema.json"
    with open(json_file, "w") as f:
        json.dump(sample_schema, f)
    return json_file


@pytest.fixture
def yaml_schema_file(tmp_path: Path, sample_schema: dict[str, Any]) -> Path:
    yaml_file = tmp_path / "schema.yaml"
    import yaml

    with open(yaml_file, "w") as f:
        yaml.dump(sample_schema, f)
    return yaml_file


def test_load_schema_json(schema_file: Path) -> None:
    """Test loading schema from JSON file."""
    schema = load_schema(schema_file)
    assert isinstance(schema, dict)
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert "properties" in schema
    assert "allOf" in schema
    assert "$defs" in schema


def test_load_schema_yaml(yaml_schema_file: Path) -> None:
    """Test loading schema from YAML file."""
    schema = load_schema(yaml_schema_file)
    assert isinstance(schema, dict)
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert "properties" in schema
    assert "allOf" in schema
    assert "$defs" in schema


def test_load_schema_invalid_file(tmp_path: Path) -> None:
    """Test loading invalid schema file."""
    invalid_file = tmp_path / "invalid.json"
    with open(invalid_file, "w") as f:
        f.write("invalid json")
    with pytest.raises(Exception):
        load_schema(invalid_file)


def test_validate_config_default_parameter(sample_schema: dict[str, Any]) -> None:
    """Test validation of config default parameters."""
    # Test valid string parameter
    is_valid, msg = validate_config_default_parameter(
        "param1", sample_schema["$defs"]["section1"]["properties"]["param1"], "value1"
    )
    assert is_valid
    assert msg == ""

    # Test valid integer parameter
    is_valid, msg = validate_config_default_parameter(
        "param2", sample_schema["$defs"]["section1"]["properties"]["param2"], 42
    )
    assert is_valid
    assert msg == ""

    # Test valid boolean parameter
    is_valid, msg = validate_config_default_parameter(
        "param3", sample_schema["$defs"]["section1"]["properties"]["param3"], "true"
    )
    assert is_valid
    assert msg == ""

    # Test invalid string for boolean
    is_valid, msg = validate_config_default_parameter(
        "param3", sample_schema["$defs"]["section1"]["properties"]["param3"], "not_a_boolean"
    )
    assert not is_valid
    assert "Booleans should only be true or false" in msg

    # Test pattern validation
    is_valid, msg = validate_config_default_parameter(
        "param4",
        sample_schema["$defs"]["section1"]["properties"]["param4"],
        "abc",  # Should be uppercase
    )
    assert not is_valid
    assert "does not match required pattern" in msg

    # Test hidden parameter
    is_valid, msg = validate_config_default_parameter(
        "hidden_param", sample_schema["$defs"]["section1"]["properties"]["hidden_param"], "any_value"
    )
    assert is_valid
    assert msg == ""
