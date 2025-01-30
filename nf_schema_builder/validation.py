"""Validation module for nf-schema-builder."""

from typing import Optional, Union

from jsonschema import Draft7Validator, Draft202012Validator
from rich.panel import Panel
from rich.progress import BarColumn, Progress, TextColumn
from rich.prompt import Confirm
from rich.table import Table

from nf_schema_builder.config import ValidationConfig
from nf_schema_builder.logger import console, log
from nf_schema_builder.schema import SchemaValidator
from nf_schema_builder.utils import handle_schema_errors


def convert_param_value(value: str, param_type: str) -> Union[bool, int, float, str]:
    """Convert parameter value to the correct type based on schema."""
    if param_type == "boolean":
        # Convert string boolean to actual boolean
        return value.lower() == "true"
    elif param_type == "integer":
        # Convert string integer to actual integer
        try:
            return int(value)
        except ValueError:
            return value
    elif param_type == "number":
        # Convert string number to actual float
        try:
            return float(value)
        except ValueError:
            return value
    return value


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

        workflow_params = config.workflow_config.get_params()
        progress.update(task, advance=20, description="Initializing validator...")
        validator = SchemaValidator(schema, config.defs_notation)

        # Filter and prepare parameters for validation
        progress.update(task, advance=20, description="Preparing parameters...")
        params_to_validate = [
            (key.removeprefix("params."), value)
            for key, value in workflow_params.items()
            if not any(
                key.removeprefix("params.") == ignored or key.removeprefix("params.").startswith(f"{ignored}.")
                for ignored in config.ignored_params
            )
        ]

        invalid_params = {}

        # Reset task for parameter validation
        progress.update(task, total=len(params_to_validate), completed=0, description="Validating parameters...")

        for param_name, value in params_to_validate:
            progress.advance(task)
            progress.update(task, description=f"Validating {param_name}")

            # Get parameter schema to determine type
            param_schema = validator.find_parameter(param_name)
            if param_schema:
                param_type = param_schema.get("type", "string")
                # Convert value to correct type before validation
                converted_value = convert_param_value(value, param_type)
                is_valid, error_msg = validator.validate_parameter(param_name, converted_value)
            else:
                should_add = Confirm.ask(
                    f"[yellow]Parameter '{param_name}' not found in schema. Would you like to add it?[/]",
                    default=True,
                )
                if should_add:
                    validator.add_parameter(param_name, value)
                    log.info(f"Adding '{param_name}' to schema...")
                    is_valid = True
                    error_msg = ""
                else:
                    is_valid = False
                    error_msg = "Parameter not defined in schema"

            log.debug(f"Validating '{param_name}' with default value '{value}': {is_valid} {error_msg}")
            if not is_valid:
                invalid_params[param_name] = error_msg

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
