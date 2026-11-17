"""The main entry point of the library: open a schema in the web editor."""

from __future__ import annotations

import copy
import logging
import os
import webbrowser
from collections.abc import Callable
from pathlib import Path

from nf_schema_builder.schema import Schema, check_schema, dump_schema, load_schema
from nf_schema_builder.server import SchemaServer

log = logging.getLogger(__name__)


def edit_schema(
    schema: Schema | str | os.PathLike[str],
    *,
    host: str = "127.0.0.1",
    port: int = 0,
    open_browser: bool = True,
    timeout: float | None = None,
    on_save: Callable[[Schema], None] | None = None,
) -> Schema:
    """
    Open a schema in the web editor and block until the user clicks "Finish".

    Works with pipeline parameter schemas (``nextflow_schema.json``) and
    samplesheet schemas (e.g. ``assets/schema_input.json``).

    Args:
        schema: Either a schema as a dict, or the path of a schema file.
            A dict is left untouched and the edited copy is returned.
            A file is rewritten every time the user saves in the editor.
        host: Interface to serve the editor on.
        port: Port to serve the editor on. ``0`` picks a free port.
        open_browser: Open the editor in the default web browser.
        timeout: Give up after this many seconds. ``None`` waits forever.
        on_save: Called with the schema every time the user saves a change.

    Returns:
        The edited schema, as last saved by the user.

    Raises:
        InvalidSchemaError: if the schema cannot be read or is not a valid JSON Schema.
        TimeoutError: if ``timeout`` passes before the user finishes.

    """
    path: Path | None = None
    if isinstance(schema, str | os.PathLike):
        path = Path(schema)
        schema = load_schema(path)
    else:
        schema = copy.deepcopy(schema)
    check_schema(schema)

    def handle_save(saved: Schema) -> None:
        if path is not None:
            dump_schema(saved, path)
            log.info("Saved %s", path)
        if on_save is not None:
            on_save(saved)

    with SchemaServer(schema, host=host, port=port, name=path.name if path else None, on_save=handle_save) as server:
        if not (open_browser and webbrowser.open(server.url)):
            log.info("Open the schema editor in your browser: %s", server.url)
        else:
            log.info("Schema editor opened at %s", server.url)
        log.info('Waiting for you to finish editing. Click "Finish" in the browser when you are done.')
        if not server.wait(timeout):
            raise TimeoutError(f"The schema editor was not finished within {timeout} seconds")
        return server.schema
