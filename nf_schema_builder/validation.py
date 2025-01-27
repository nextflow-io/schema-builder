"""Validation module for nf-schema-builder."""

from pathlib import Path
from typing import Optional

from jsonschema import Draft7Validator, Draft202012Validator
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, TextColumn, BarColumn

from nf_schema_builder.config import ValidationConfig
from nf_schema_builder.logger import console, log
from nf_schema_builder.schema import SchemaValidator, load_schema
from nf_schema_builder.utils import handle_schema_errors


@handle_schema_errors
def validate_json_schema(schema: dict) -> None:
    """Validate schema against JSON Schema specifications."""
    schema_version = schema.get("$schema", "")
    if schema_version == "https://json-schema.org/draft/2020-12/schema":
        Draft202012Validator.check_schema(schema)
    elif schema_version == "http://json-schema.org/draft-07/schema":
        Draft7Validator.check_schema(schema)
    else:
        log.error(f"❌ Unsupported schema version: {schema_version}")
        raise ValueError("Unsupported schema version")

    log.info("✅ Valid JSON schema!")


def validate_workflow_parameters(schema: dict, config: ValidationConfig) -> Optional[dict[str, str]]:
    """Validate workflow parameters against schema."""
    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
    ) as progress:
        task = progress.add_task("Loading workflow configuration...", total=100)

        # Use the workflow_config from ValidationConfig
        workflow_params = config.workflow_config.get_params()
        progress.update(task, advance=20, description="Initializing validator...")
        validator = SchemaValidator(schema, config.defs_notation)

        # Filter and prepare parameters for validation
        progress.update(task, advance=20, description="Preparing parameters...")
        params_to_validate = [
            (key[7:], value)
            for key, value in workflow_params.items()
            if not any(key[7:] == ignored or key[7:].startswith(f"{ignored}.") for ignored in config.ignored_params)
        ]

        invalid_params = {}

        # Reset task for parameter validation
        progress.update(task, total=len(params_to_validate), completed=0, description="Validating parameters...")

        for param_name, value in params_to_validate:
            progress.update(task, description=f"Validating {param_name}")
            is_valid, error_msg = validator.validate_parameter(param_name, value)
            if not is_valid:
                invalid_params[param_name] = error_msg
            progress.advance(task)

        progress.update(task, description=f"Validated {len(params_to_validate)} parameters")

    if invalid_params:
        display_validation_errors(invalid_params)
        return invalid_params

    log.info("✅ All workflow parameters are valid!")
    return None


def display_validation_errors(invalid_params: dict[str, str]) -> None:
    """Display validation errors in a formatted table."""
    error_table = Table()
    error_table.add_column("Parameter", style="red")
    error_table.add_column("Error", style="yellow")

    for param, msg in invalid_params.items():
        error_table.add_row(param, msg)

    error_panel = Panel.fit(error_table, title="Invalid Parameters", title_align="left")
    console.print(error_panel)
