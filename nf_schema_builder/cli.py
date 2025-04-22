"""Command-line interface for nf-schema-builder."""

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any, Optional

import typer
from jsonschema.exceptions import SchemaError, ValidationError

from nf_schema_builder.config import ValidationConfig
from nf_schema_builder.http import send_schema
from nf_schema_builder.logger import log, set_debug
from nf_schema_builder.schema import load_schema
from nf_schema_builder.utils import check_nextflow_installation, handle_schema_errors
from nf_schema_builder.validation import (
    validate_json_schema,
    validate_workflow_parameters,
)

app = typer.Typer(
    name="nf-schema-builder",
    help="A CLI tool to build JSON schemas for Nextflow",
    add_completion=True,
)


@dataclass
class CLIConfig:
    """Configuration class for CLI settings."""

    schema_file: Path
    url: str = "localhost:5173"
    debug: bool = False
    no_browser: bool = False


def handle_cli_error(error: Exception) -> None:
    """Centralized error handling for CLI commands."""
    error_messages: dict[type[Exception], str] = {
        SchemaError: "Invalid schema",
        ValidationError: "Invalid parameters",
        FileNotFoundError: "Schema file not found",
        ConnectionError: "Failed to connect to server",
    }

    message = error_messages.get(type(error), "An unexpected error occurred")
    log.error(f"❌ {message}: {str(error)}")
    raise typer.Exit(1) from error


def perform_validation(schema_file: Path, debug: bool = False) -> None:
    """Perform all validation steps for a schema file."""
    if not check_nextflow_installation():
        raise RuntimeError(
            "Nextflow is not installed. Please install Nextflow first: "
            "https://www.nextflow.io/docs/latest/getstarted.html"
        )

    schema = load_schema(schema_file)
    validate_json_schema(schema)

    if schema_file.name == "nextflow_schema.json":
        config = ValidationConfig.from_workflow(schema_file.parent)
        invalid_params = validate_workflow_parameters(schema, config)
        if invalid_params:
            raise ValidationError("One or more parameters are invalid")


def handle_send_response(response: Any, url: str, debug: bool) -> None:
    """Handle the response from sending schema."""
    if response:
        log.info(f"✅ Schema sent successfully to {url}")
        if debug:
            log.debug(f"Response: {response}")
    else:
        raise ConnectionError(f"Failed to send schema to {url}")


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context) -> None:
    """Handle default command when no subcommand is provided."""
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
    debug: Annotated[
        bool,
        typer.Option(
            "--debug",
            "-d",
            help="Enable debug logging",
        ),
    ] = False,
    no_browser: Annotated[
        bool,
        typer.Option(
            "--no-browser",
            help="Don't open a new browser window",
        ),
    ] = False,
) -> None:
    """Send schema file to URL for visualization or processing."""
    try:
        if schema_file is None:
            schema_file = Path("nextflow_schema.json")

        config = CLIConfig(
            schema_file=schema_file,
            url=url,
            debug=debug,
            no_browser=no_browser,
        )
        set_debug(config.debug)

        # Run validation steps first
        perform_validation(config.schema_file, config.debug)

        # Send schema
        response = send_schema(config.schema_file, config.url, no_browser=config.no_browser)
        handle_send_response(response, config.url, config.debug)

    except Exception as err:
        handle_cli_error(err)


@app.command()
@handle_schema_errors
def validate(
    schema_file: Annotated[Path, typer.Argument(help="Path to the schema file (JSON/YAML)")],
    debug: Annotated[bool, typer.Option("--debug", "-d", help="Enable debug logging")] = False,
) -> None:
    """Validate a JSON/YAML schema file against JSON Schema specifications and compare with Nextflow parameters."""
    try:
        set_debug(debug)
        perform_validation(schema_file, debug)
        log.info("✅ All parameters are valid!")
    except Exception as err:
        handle_cli_error(err)


if __name__ == "__main__":
    app()
