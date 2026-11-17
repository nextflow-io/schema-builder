"""Command-line interface for nf-schema-builder."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.logging import RichHandler
from rich.table import Table

from nf_schema_builder import __version__
from nf_schema_builder.editor import edit_schema
from nf_schema_builder.exceptions import SchemaBuilderError
from nf_schema_builder.schema import (
    Schema,
    SchemaKind,
    add_params,
    check_schema,
    dump_schema,
    iter_params,
    load_schema,
    schema_kind,
)
from nf_schema_builder.workflow import ParamReport, compare_with_workflow

DEFAULT_SCHEMA = Path("nextflow_schema.json")

app = typer.Typer(
    name="nf-schema-builder",
    help="Build and edit JSON schemas for Nextflow pipelines in a local web editor.",
)
console = Console(stderr=True)
log = logging.getLogger("nf_schema_builder")

SchemaArgument = Annotated[
    Path, typer.Argument(help="Schema file: a pipeline nextflow_schema.json or a samplesheet schema.")
]
WorkflowDirOption = Annotated[
    Path | None,
    typer.Option(
        "--workflow-dir",
        "-w",
        help="Pipeline directory to compare parameters with. [default: the schema's directory, "
        "if it contains a nextflow.config]",
        show_default=False,
    ),
]
DebugOption = Annotated[bool, typer.Option("--debug", "-d", help="Enable debug logging.")]


def setup_logging(debug: bool) -> None:
    """Send the library's log messages to the terminal."""
    log.handlers = [RichHandler(console=console, show_time=False, show_path=debug, markup=False)]
    log.setLevel(logging.DEBUG if debug else logging.INFO)
    log.propagate = False


def fail(error: Exception) -> typer.Exit:
    """Report an error and return the exception that ends the command."""
    console.print(f"[bold red]Error:[/] {error}", highlight=False)
    return typer.Exit(1)


def find_workflow_dir(schema_file: Path, schema: Schema, workflow_dir: Path | None) -> Path | None:
    """Return the pipeline directory whose parameters should be compared with the schema, if any."""
    if schema_kind(schema) is not SchemaKind.PARAMETERS:
        return None
    if workflow_dir is not None:
        return workflow_dir
    parent = schema_file.resolve().parent
    return parent if (parent / "nextflow.config").is_file() else None


def get_param_report(schema: Schema, workflow_dir: Path) -> ParamReport:
    """Compare a schema with the parameters of the pipeline in ``workflow_dir``."""
    with console.status(f"Resolving the Nextflow config of {workflow_dir}..."):
        return compare_with_workflow(schema, workflow_dir)


def print_param_report(report: ParamReport) -> None:
    """Show the differences between a schema and a pipeline's parameters."""
    table = Table(title="Schema and pipeline parameters differ", title_justify="left")
    table.add_column("Parameter", style="bold")
    table.add_column("Problem")
    for name, value in report.missing_from_schema.items():
        table.add_row(name, f"[yellow]Not in the schema[/] (pipeline default: {value!r})")
    for name in report.missing_from_workflow:
        table.add_row(name, "[yellow]In the schema, but not a pipeline parameter[/]")
    for name, message in report.invalid_defaults.items():
        table.add_row(name, f"[red]Pipeline default is not valid:[/] {message}")
    console.print(table)


def version_callback(value: bool) -> None:
    """Print the version and exit."""
    if value:
        typer.echo(f"nf-schema-builder {__version__}")
        raise typer.Exit


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    version: Annotated[
        bool, typer.Option("--version", callback=version_callback, is_eager=True, help="Show the version and exit.")
    ] = False,
) -> None:
    """Edit ./nextflow_schema.json when no command is given."""
    if ctx.invoked_subcommand is None:
        edit(DEFAULT_SCHEMA)


@app.command()
def edit(
    schema_file: SchemaArgument = DEFAULT_SCHEMA,
    host: Annotated[str, typer.Option(help="Interface to serve the editor on.")] = "127.0.0.1",
    port: Annotated[int, typer.Option("--port", "-p", help="Port to serve the editor on. 0 picks a free port.")] = 0,
    no_browser: Annotated[bool, typer.Option("--no-browser", help="Don't open a browser window.")] = False,
    add_missing: Annotated[
        bool,
        typer.Option(
            "--add-missing",
            help="Add pipeline parameters that are missing from the schema before editing (needs Nextflow).",
        ),
    ] = False,
    workflow_dir: WorkflowDirOption = None,
    debug: DebugOption = False,
) -> None:
    """Open a schema in the web editor. Changes are written back to the file when you save."""
    setup_logging(debug)
    try:
        if add_missing:
            schema = load_schema(schema_file)
            check_schema(schema)
            pipeline_dir = find_workflow_dir(schema_file, schema, workflow_dir)
            if pipeline_dir is None:
                raise SchemaBuilderError("--add-missing needs a pipeline: no nextflow.config found, use --workflow-dir")
            added = add_params(schema, get_param_report(schema, pipeline_dir).missing_from_schema)
            if added:
                dump_schema(schema, schema_file)
                log.info("Added %d parameter(s) to the schema: %s", len(added), ", ".join(added))

        edit_schema(schema_file, host=host, port=port, open_browser=not no_browser)
    except KeyboardInterrupt:
        log.info("Stopped. Changes you saved in the editor have been kept.")
        raise typer.Exit(130) from None
    except SchemaBuilderError as e:
        raise fail(e) from e
    log.info("Finished editing %s", schema_file)


# `send` was the name of this command before 0.2
app.command("send", hidden=True, deprecated=True, help="Deprecated alias of `edit`.")(edit)


@app.command()
def validate(
    schema_file: SchemaArgument = DEFAULT_SCHEMA,
    workflow_dir: WorkflowDirOption = None,
    debug: DebugOption = False,
) -> None:
    """Check that a schema is valid, and that it matches the pipeline's parameters."""
    setup_logging(debug)
    try:
        schema = load_schema(schema_file)
        check_schema(schema)
        kind = schema_kind(schema)
        count = sum(1 for _ in iter_params(schema))
        noun = "columns" if kind is SchemaKind.SAMPLESHEET else "parameters"
        log.info("Valid JSON schema (%s schema, %d %s)", kind.value, count, noun)

        pipeline_dir = find_workflow_dir(schema_file, schema, workflow_dir)
        if pipeline_dir is None:
            return
        report = get_param_report(schema, pipeline_dir)
    except SchemaBuilderError as e:
        raise fail(e) from e

    if not report.ok:
        print_param_report(report)
        raise typer.Exit(1)
    log.info("The schema matches the parameters of the pipeline in %s", pipeline_dir)
