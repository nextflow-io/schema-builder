"""Schema validation functions for nf-schema-builder."""

import json
from pathlib import Path
from typing import Any, Optional, cast

import typer
import yaml

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


def find_schema_param(schema: dict[str, Any], param_name: str) -> Optional[dict[str, Any]]:
    """Find parameter definition in schema."""
    # Check top-level properties
    properties = schema.get("properties", {})
    if param_name in properties and isinstance(properties[param_name], dict):
        return cast(dict[str, Any], properties[param_name].copy())

    # Check definitions referenced in allOf
    for section in schema.get("allOf", []):
        if "$ref" in section:
            def_name = section["$ref"].split("/")[-1]
            defs = schema.get("$defs", {})
            if def_name in defs and isinstance(defs[def_name], dict):
                definition = defs[def_name]
                def_properties = definition.get("properties", {})
                if param_name in def_properties and isinstance(def_properties[param_name], dict):
                    return cast(dict[str, Any], def_properties[param_name].copy())

    return None


def get_schema_defaults(schema: dict[str, Any]) -> dict[str, Any]:
    """Get all default values from schema."""
    defaults = {}
    
    # Get defaults from top-level properties
    for param_name, param_def in schema.get("properties", {}).items():
        if "default" in param_def:
            defaults[param_name] = param_def["default"]
    
    # Get defaults from allOf sections
    for section in schema.get("allOf", []):
        if "$ref" in section:
            def_name = section["$ref"].split("/")[-1]
            defs = schema.get("$defs", {})
            if def_name in defs:
                definition = defs[def_name]
                for param_name, param_def in definition.get("properties", {}).items():
                    if "default" in param_def:
                        defaults[param_name] = param_def["default"]
    
    return defaults


def validate_config_default_parameter(param_name: str, param_def: dict[str, Any], param_value: Any) -> tuple[bool, str]:
    """Validate a parameter against its schema definition."""
    # Handle hidden parameters
    if param_def.get("hidden", False):
        return True, ""

    # Handle null values
    if param_value == "null":
        return True, ""

    # Validate type
    param_type = param_def.get("type", "string")
    
    # Type-specific validation
    if param_type == "boolean":
        if str(param_value).lower() not in ["true", "false"]:
            return False, f"Booleans should only be true or false, not `{param_value}`"
    elif param_type == "integer":
        try:
            int(param_value)
        except ValueError:
            return False, f"Not an integer: `{param_value}`"
    elif param_type == "number":
        try:
            float(param_value)
        except ValueError:
            return False, f"Not a number: `{param_value}`"
    elif param_type == "string":
        if str(param_value) in ["false", "true", "''"]:
            return False, f"String should not be set to `{param_value}`"
        # Check pattern if specified
        if "pattern" in param_def:
            import re
            if not re.match(param_def["pattern"], str(param_value)):
                return False, f"Value '{param_value}' does not match required pattern '{param_def['pattern']}'"

    return True, ""


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

    def validate_parameter(self, param_name: str, param_value: Any) -> tuple[bool, str]:
        """Validate a parameter against its schema definition."""
        schema_param = self.find_parameter(param_name)
        if not schema_param:
            return False, "Parameter not found in schema"

        # Handle hidden parameters
        if schema_param.get("hidden", False):
            return True, ""

        # Handle null values
        if param_value == "null":
            return True, ""

        # Validate type
        param_type = schema_param.get("type", "string")
        
        # Type-specific validation
        if param_type == "boolean":
            if str(param_value).lower() not in ["true", "false"]:
                return False, f"Boolean must be true or false, not `{param_value}`"
        elif param_type == "integer":
            try:
                int(param_value)
            except (ValueError, TypeError):
                return False, f"Not an integer: `{param_value}`"
        elif param_type == "number":
            try:
                float(param_value)
            except (ValueError, TypeError):
                return False, f"Not a number: `{param_value}`"
        elif param_type == "string":
            if not isinstance(param_value, str):
                return False, f"Not a string: `{param_value}`"
            if str(param_value) in ["false", "true", "''"]:
                return False, f"String should not be set to `{param_value}`"
            # Check pattern if specified
            if "pattern" in schema_param:
                import re
                if not re.match(schema_param["pattern"], str(param_value)):
                    return False, f"Value '{param_value}' does not match required pattern '{schema_param['pattern']}'"

        return True, ""

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
