"""Command-line interface for nf-schema-builder."""

from pathlib import Path
from typing import Annotated, Optional

import typer
from jsonschema.exceptions import SchemaError, ValidationError

from nf_schema_builder.http import send_schema
from nf_schema_builder.logger import log, set_debug
from nf_schema_builder.schema import SchemaValidator, load_schema
from nf_schema_builder.utils import check_nextflow_installation, handle_schema_errors
from nf_schema_builder.config import ValidationConfig
from nf_schema_builder.validation import (
    validate_json_schema,
    validate_workflow_parameters,
)

app = typer.Typer(
    name="nf-schema-builder",
    help="A CLI tool to build JSON schemas for Nextflow",
    add_completion=True,
)


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
) -> None:
    """Main callback to handle default command."""
    if ctx.invoked_subcommand is None:
        ctx.invoke(send)


@app.command()
def send(
    schema_file: Annotated[
        Optional[Path],
        typer.Argument(
            help="Path to the schema file (JSON/YAML)",
            exists=True,
            dir_okay=False,
            resolve_path=True,
        ),
    ] = Path("nextflow_schema.json"),
    url: Annotated[
        str,
        typer.Option(
            "--url",
            "-u",
            help="URL to send schema to",
        ),
    ] = "localhost:5173",
    timeout: Annotated[
        int,
        typer.Option(
            "--timeout",
            "-t",
            help="Timeout in seconds",
        ),
    ] = 10,
    debug: Annotated[
        bool,
        typer.Option(
            "--debug",
            "-d",
            help="Enable debug logging",
        ),
    ] = False,
) -> None:
    """Send schema file to URL for visualization or processing."""
    try:
        # Set debug logging if requested
        set_debug(debug)

        # Validate schema file exists
        assert schema_file is not None

        # Run validation steps first
        validate(schema_file, debug)

        # Send schema
        response = send_schema(schema_file, url, timeout)
        if response:
            log.info(f"✅ Schema sent successfully to {url}")
            if debug:
                log.debug(f"Response: {response}")
        else:
            log.error(f"❌ Failed to send schema to {url}")
            raise typer.Exit(1)

    except SchemaError as err:
        log.error(f"❌ Invalid schema: {err}")
        raise typer.Exit(1) from err
    except ValidationError as err:
        log.error(f"❌ Invalid parameters: {err}")
        raise typer.Exit(1) from err
    except Exception as err:
        log.error(f"❌ Error: {err}")
        raise typer.Exit(1) from err


@app.command()
@handle_schema_errors
def validate(
    schema_file: Annotated[Path, typer.Argument(help="Path to the schema file (JSON/YAML)")],
    debug: Annotated[bool, typer.Option("--debug", "-d", help="Enable debug logging")] = False,
) -> None:
    """Validate a JSON/YAML schema file against JSON Schema specifications and compare with Nextflow parameters."""
    # Set debug logging if requested
    set_debug(debug)

    # First check if Nextflow is installed
    if not check_nextflow_installation():
        log.error(
            "❌ Nextflow is not installed. Please install Nextflow first: https://www.nextflow.io/docs/latest/getstarted.html"
        )
        raise typer.Exit(1)

    # Load schema
    schema = load_schema(schema_file)

    # Validate JSON schema
    validate_json_schema(schema)

    # If we are validating the main schema file, get the config and validate parameters
    if schema_file.name == "nextflow_schema.json":
        config = ValidationConfig.from_workflow(schema_file.parent)

        # Validate workflow parameters
        invalid_params = validate_workflow_parameters(schema, config)
        if invalid_params:
            log.error("❌ Schema validation failed: One or more parameters are invalid")
            raise typer.Exit(1)

        log.info("✅ All parameters are valid!")


if __name__ == "__main__":
    app()
