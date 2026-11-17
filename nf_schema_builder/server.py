"""
A small local web server that serves the schema editor and its JSON API.

Built on the standard library only, so it can be embedded in other tools
without pulling in a web framework or an event loop.

API:

* ``GET  /api/schema`` - ``{"schema": {...}, "name": "nextflow_schema.json"}``
* ``PUT  /api/schema`` - replace the schema (body: the schema)
* ``POST /api/finish`` - end the editing session (optional body: the final schema)
* ``GET  /api/health``
"""

from __future__ import annotations

import copy
import json
import logging
import mimetypes
import threading
from collections.abc import Callable
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import TracebackType
from typing import Any
from urllib.parse import urlsplit

from nf_schema_builder import __version__
from nf_schema_builder.exceptions import InvalidSchemaError, SchemaBuilderError
from nf_schema_builder.schema import Schema, check_schema

log = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent / "static"
MAX_BODY_BYTES = 50 * 1024 * 1024
_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}
_WILDCARD_HOSTS = {"", "0.0.0.0", "::"}


class _RequestError(Exception):
    def __init__(self, status: HTTPStatus, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class _HTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], owner: SchemaServer):
        self.owner = owner
        super().__init__(address, _Handler)


class _Handler(BaseHTTPRequestHandler):
    server: _HTTPServer  # pyright: ignore[reportIncompatibleVariableOverride]
    server_version = f"nf-schema-builder/{__version__}"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        log.debug("%s - %s", self.address_string(), format % args)

    # -- responses ---------------------------------------------------------

    def _send(self, status: HTTPStatus, body: bytes, content_type: str, cache: str = "no-store") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        self._send(status, json.dumps(payload).encode("utf-8"), "application/json")

    # -- request checks ----------------------------------------------------

    def _check_host(self) -> None:
        """
        Only answer requests addressed to this server.

        Rejecting unexpected ``Host`` headers stops DNS-rebinding attacks, where
        a web page points its own domain at 127.0.0.1 to reach local servers.
        """
        allowed = self.server.owner.allowed_hosts
        if allowed is None:
            return
        hostname = urlsplit(f"//{self.headers.get('Host', '')}").hostname
        if hostname not in allowed:
            raise _RequestError(HTTPStatus.FORBIDDEN, "Unexpected Host header")

    def _check_same_origin(self) -> None:
        """Refuse writes made by other web pages (cross-site request forgery)."""
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc != self.headers.get("Host"):
            raise _RequestError(HTTPStatus.FORBIDDEN, "Cross-origin requests are not allowed")

    def _read_json(self, required: bool = True) -> Any:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise _RequestError(HTTPStatus.BAD_REQUEST, "Invalid Content-Length") from None
        if length == 0 and not required:
            return None
        if length > MAX_BODY_BYTES:
            raise _RequestError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Schema is too large")
        if self.headers.get_content_type() != "application/json":
            raise _RequestError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "Content-Type must be application/json")
        try:
            return json.loads(self.rfile.read(length))
        except ValueError:
            raise _RequestError(HTTPStatus.BAD_REQUEST, "Request body is not valid JSON") from None

    # -- routing -----------------------------------------------------------

    def _dispatch(self, write: bool = False) -> None:
        try:
            self._check_host()
            if write:
                self._check_same_origin()
            self._route(urlsplit(self.path).path)
        except _RequestError as e:
            self._send_json({"error": e.message}, e.status)
        except InvalidSchemaError as e:
            self._send_json({"error": str(e)}, HTTPStatus.UNPROCESSABLE_ENTITY)
        except Exception as e:  # e.g. an on_save callback that fails to write the file
            log.exception("Error handling %s %s", self.command, self.path)
            self._send_json({"error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def _route(self, path: str) -> None:
        owner = self.server.owner
        route = (self.command, path)
        if route == ("GET", "/api/schema"):
            self._send_json({"schema": owner.schema, "name": owner.name})
        elif route == ("GET", "/api/health"):
            self._send_json({"status": "ok", "version": __version__})
        elif route == ("PUT", "/api/schema"):
            owner.save(self._read_json())
            self._send_json({"status": "saved"})
        elif route == ("POST", "/api/finish"):
            schema = self._read_json(required=False)
            if schema is not None:
                owner.save(schema)
            self._send_json({"status": "finished"})
            owner.finished.set()
        elif path.startswith("/api/"):
            raise _RequestError(HTTPStatus.NOT_FOUND, "Not found")
        elif self.command in ("GET", "HEAD"):
            self._serve_static(path)
        else:
            raise _RequestError(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    def _serve_static(self, path: str) -> None:
        root = self.server.owner.static_dir.resolve()
        target = (root / path.lstrip("/")).resolve()
        if not target.is_relative_to(root):
            raise _RequestError(HTTPStatus.NOT_FOUND, "Not found")
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            raise _RequestError(HTTPStatus.NOT_FOUND, "Not found")
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        # Built assets have content hashes in their names, the entry page does not
        cache = "no-cache" if target.suffix == ".html" else "public, max-age=31536000, immutable"
        self._send(HTTPStatus.OK, target.read_bytes(), content_type, cache)

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch()

    def do_HEAD(self) -> None:  # noqa: N802
        self._dispatch()

    def do_PUT(self) -> None:  # noqa: N802
        self._dispatch(write=True)

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch(write=True)


class SchemaServer:
    """
    Serve the schema editor for one schema.

    Use as a context manager, or call :meth:`start` and :meth:`stop`::

        with SchemaServer(schema) as server:
            webbrowser.open(server.url)
            server.wait()
            edited = server.schema

    Args:
        schema: The schema to edit. It is copied; the caller's dict is never modified.
        host: Interface to bind to. Keep the default unless the editor must be
            reachable from another machine: binding to ``0.0.0.0`` lets anyone
            on the network read and change the schema.
        port: Port to listen on. ``0`` picks a free port.
        name: Display name for the schema, e.g. its file name.
        on_save: Called with the schema every time the user saves a change.
        validate: Reject saves that are not a valid JSON Schema.
        static_dir: Directory with the built editor. Defaults to the bundled one.

    """

    def __init__(
        self,
        schema: Schema,
        *,
        host: str = "127.0.0.1",
        port: int = 0,
        name: str | None = None,
        on_save: Callable[[Schema], None] | None = None,
        validate: bool = True,
        static_dir: Path | None = None,
    ):
        """Create a server; see the class docstring for the arguments."""
        self.host = host
        self.port = port
        self.name = name
        self.on_save = on_save
        self.validate = validate
        self.static_dir = Path(static_dir) if static_dir else STATIC_DIR
        self.finished = threading.Event()
        self.allowed_hosts: set[str] | None = None if host in _WILDCARD_HOSTS else {host, *_LOOPBACK_HOSTS}

        self._schema = copy.deepcopy(schema)
        self._lock = threading.Lock()
        self._httpd: _HTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def schema(self) -> Schema:
        """A copy of the schema as last saved by the user."""
        with self._lock:
            return copy.deepcopy(self._schema)

    @property
    def url(self) -> str:
        """The address of the editor."""
        host = f"[{self.host}]" if ":" in self.host else self.host
        return f"http://{'localhost' if self.host in _WILDCARD_HOSTS else host}:{self.port}/"

    def save(self, schema: object) -> None:
        """Store a new version of the schema and pass it to ``on_save``."""
        if not isinstance(schema, dict):
            raise InvalidSchemaError("A schema must be a JSON object")
        if self.validate:
            check_schema(schema)
        with self._lock:
            # Compared as text, because the order of keys matters. Saving without
            # changes (e.g. clicking "Finish" straight away) must not touch the file.
            if json.dumps(schema) == json.dumps(self._schema):
                return
            if self.on_save is not None:
                self.on_save(copy.deepcopy(schema))
            self._schema = schema

    def start(self) -> str:
        """Start serving in a background thread and return the editor's URL."""
        if self._httpd is not None:
            return self.url
        if not (self.static_dir / "index.html").is_file():
            raise SchemaBuilderError(
                f"The schema editor has not been built: {self.static_dir / 'index.html'} is missing.\n"
                "From a source checkout, run: npm ci --prefix gui && npm run build --prefix gui"
            )
        try:
            self._httpd = _HTTPServer((self.host, self.port), self)
        except OSError as e:
            raise SchemaBuilderError(f"Could not start the schema editor on {self.host}:{self.port}: {e}") from e
        self.port = self._httpd.server_address[1]
        self._thread = threading.Thread(
            target=self._httpd.serve_forever, kwargs={"poll_interval": 0.05}, name="nf-schema-builder", daemon=True
        )
        self._thread.start()
        log.debug("Schema editor listening on %s", self.url)
        return self.url

    def wait(self, timeout: float | None = None) -> bool:
        """Block until the user clicks "Finish". Returns ``False`` if ``timeout`` (seconds) passes first."""
        return self.finished.wait(timeout)

    def stop(self) -> None:
        """Stop serving and release the port."""
        httpd, self._httpd = self._httpd, None
        if httpd is None:
            return
        httpd.shutdown()
        httpd.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    def __enter__(self) -> SchemaServer:
        """Start the server."""
        self.start()
        return self

    def __exit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None:
        """Stop the server."""
        self.stop()
