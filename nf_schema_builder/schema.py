"""Schema validation functions for nf-schema-builder."""

import json
from pathlib import Path
from typing import Any, Optional, cast

import typer
import yaml
from jsonschema import validate
from jsonschema.exceptions import ValidationError

from nf_schema_builder.utils import handle_schema_errors


@handle_schema_errors
def load_schema(file_path: Path) -> dict:
    """Load schema from JSON or YAML file."""
    try:
        if file_path.suffix.lower() in (".yml", ".yaml"):
            with file_path.open() as f:
                result = yaml.safe_load(f)
        else:
            with file_path.open() as f:
                result = json.load(f)

        if not isinstance(result, dict):
            raise typer.BadParameter("Schema must be a dictionary")
        return result
    except (json.JSONDecodeError, yaml.YAMLError) as e:
        raise typer.BadParameter(f"Invalid file format: {e}") from e


class SchemaValidator:
    """Handles schema validation operations."""

    def __init__(self, schema: dict, defs_key: str = "$defs"):
        """
        Initialize SchemaValidator with schema and definitions key.

        Args:
            schema: The JSON schema dictionary
            defs_key: The key used for definitions in the schema (defaults to "$defs")

        """
        self.schema = schema
        self.defs_key = defs_key

    def validate_parameter(self, param_name: str, param_value: Any) -> tuple[bool, str]:
        """Validate a parameter against its schema definition."""
        schema_param = self.find_parameter(param_name)
        if not schema_param:
            return False, "Parameter not found in schema"

        if schema_param.get("hidden", False) or param_value == "null":
            return True, ""

        # Create a mini-schema for this parameter
        param_schema = {"type": "object", "properties": {param_name: schema_param}}

        try:
            # Validate using jsonschema
            validate({param_name: param_value}, param_schema)
            return True, ""
        except ValidationError as e:
            return False, str(e.message)

    def find_parameter(self, param_name: str) -> Optional[dict[str, Any]]:
        """Find parameter definition in schema."""
        # Check top-level properties
        properties = self.schema.get("properties", {})
        if param_name in properties and isinstance(properties[param_name], dict):
            return cast(dict[str, Any], properties[param_name].copy())

        # Check definitions referenced in allOf
        for section in self.schema.get("allOf", []):
            if "$ref" in section:
                def_name = section["$ref"].split("/")[-1]
                defs = self.schema.get(self.defs_key, {})
                if def_name in defs and isinstance(defs[def_name], dict):
                    definition = defs[def_name]
                    def_properties = definition.get("properties", {})
                    if param_name in def_properties and isinstance(def_properties[param_name], dict):
                        return cast(dict[str, Any], def_properties[param_name].copy())

        return None

    def add_parameter(self, param_name: str, param_value: str) -> None:
        """Add a new parameter to the schema."""
        # Infer parameter type
        param_type = "string"  # default type
        try:
            if str(param_value).lower() in ["true", "false"]:
                param_type = "boolean"
            elif str(param_value).replace(".", "").isdigit():
                param_type = "number" if "." in str(param_value) else "integer"
        except (ValueError, AttributeError):
            pass

        # Create parameter definition
        param_def = {
            "type": param_type,
            "description": f"Parameter {param_name}",
        }

        # Add to top-level properties
        if "properties" not in self.schema:
            self.schema["properties"] = {}
        self.schema["properties"][param_name] = param_def
