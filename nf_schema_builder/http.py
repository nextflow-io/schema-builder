"""HTTP utilities for nf-schema-builder."""

import asyncio
import atexit
import json
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path
from typing import Optional

from aiohttp import web
from aiohttp.web import Application, FileResponse, Request, Response

from nf_schema_builder.logger import log
from nf_schema_builder.utils import handle_schema_errors

STATIC_PATH = Path(__file__).parent.parent / "gui" / "dist"

# Global server instance and thread
_server_instance = None
_server_thread = None


class SchemaServer:
    """A web server that provides a GUI for editing JSON schema files using HTTP endpoints."""

    def __init__(
        self, host: str, port: int, schema_file: Path = Path("nextflow_schema.json"), static_path: Optional[Path] = None
    ):
        """
        Initialize the schema server.

        Args:
            host: The hostname to bind the server to
            port: The port number to listen on
            schema_file: Path to the schema file
            static_path: Path to static files directory

        """
        self.host = host
        self.port = port
        self.schema_file = schema_file
        self.static_path = static_path or STATIC_PATH

        # Server state
        self.app: Application = web.Application()
        self.ready: threading.Event = threading.Event()
        self.schema_saved: threading.Event = threading.Event()
        self.finished: threading.Event = threading.Event()
        self._runner: Optional[web.AppRunner] = None

        self._setup_routes()

    def _setup_routes(self) -> None:
        """Configure the application routes for the web server."""
        # Static file serving
        self.app.router.add_static("/assets/", self.static_path / "assets")
        self.app.router.add_get("/", self.serve_index)

        # API endpoints
        self.app.router.add_get("/api/schema", self.get_schema)
        self.app.router.add_post("/api/schema", self.save_schema)
        self.app.router.add_post("/api/finish", self.handle_finish)
        self.app.router.add_get("/api/health", self.health_check)

    async def serve_index(self, request: Request) -> FileResponse:
        """Serve the main index.html file."""
        return web.FileResponse(self.static_path / "index.html")

    async def get_schema(self, request: Request) -> Response:
        """Get the current schema."""
        try:
            if self.schema_file.exists():
                schema_data = json.loads(self.schema_file.read_text())
                log.debug(f"Sending schema to client: {json.dumps(schema_data, indent=2)}")
                return web.json_response({"status": "success", "type": "schema_update", "data": schema_data})

            log.error(f"Schema file not found: {self.schema_file}")
            return web.json_response(
                {"status": "error", "message": f"Schema file not found: {self.schema_file}"}, status=404
            )
        except Exception as e:
            log.error(f"Error reading schema: {e}")
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def save_schema(self, request: Request) -> Response:
        """Save schema changes."""
        try:
            schema_data = await request.json()
            self.schema_file.write_text(json.dumps(schema_data, indent=2))
            self.schema_saved.set()
            log.info(f"Schema saved successfully to {self.schema_file}")
            return web.json_response({"status": "success", "message": "Schema saved successfully"})
        except Exception as e:
            log.error(f"Error saving schema: {e}")
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_finish(self, request: Request) -> Response:
        """Handle the finish command."""
        try:
            self.finished.set()
            return web.json_response({"status": "success", "message": "Finished successfully"})
        except Exception as e:
            log.error(f"Error handling finish: {e}")
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def health_check(self, request: Request) -> Response:
        """Check server health status."""
        return web.json_response(
            {"status": "healthy", "schema_file": str(self.schema_file), "schema_exists": self.schema_file.exists()}
        )

    async def start(self) -> None:
        """Start the web server."""
        self._runner = web.AppRunner(self.app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, self.host, self.port)
        await site.start()
        self.ready.set()
        log.info(f"Server started at http://{self.host}:{self.port}")

        try:
            while not self.finished.is_set():
                await asyncio.sleep(1)
        finally:
            await self.cleanup()

    async def cleanup(self) -> None:
        """Clean up server resources."""
        if self._runner is not None:
            await self._runner.cleanup()
            self._runner = None

    def is_ready(self) -> bool:
        """Check if server is ready."""
        return self.ready.is_set()


def cleanup_server() -> None:
    """Clean up server instance and thread on exit."""
    global _server_instance, _server_thread
    _server_thread = None
    _server_instance = None


atexit.register(cleanup_server)


def is_port_open(host: str, port: int) -> bool:
    """Check if a port is open on the given host."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.connect((host, port))
            return True
        except (OSError, ConnectionRefusedError):
            return False


def wait_for_server(timeout: int = 10, interval: float = 0.1) -> bool:
    """
    Wait for server to be ready.

    Args:
        timeout: Maximum time to wait in seconds
        interval: Time between checks in seconds

    Returns:
        bool: True if server is ready, False otherwise

    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        server = _server_instance
        if server is not None and server.is_ready():
            return True
        time.sleep(interval)
    return False


def ensure_server_running(
    url: str, schema_file: Path = Path("nextflow_schema.json"), timeout: int = 10, no_browser: bool = False
) -> bool:
    """
    Ensure the schema server is running.

    Args:
        url: Server URL
        schema_file: Path to schema file
        timeout: Maximum time to wait for server
        no_browser: Whether to open browser

    Returns:
        bool: True if server is running, False otherwise

    """
    global _server_instance, _server_thread

    if _server_thread is not None and _server_thread.is_alive():
        return True

    # Parse URL for host and port
    parsed_url = urllib.parse.urlparse(f"http://{url}" if not url.startswith(("http://", "https://")) else url)
    host = parsed_url.hostname or "localhost"
    port = parsed_url.port or 5173

    # Clear any previous state
    cleanup_server()

    def run_server() -> None:
        """Run the server in a separate thread."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        server = SchemaServer(host=host, port=port, schema_file=schema_file)
        global _server_instance
        _server_instance = server

        try:
            loop.run_until_complete(server.start())
        except KeyboardInterrupt:
            pass
        finally:
            loop.close()

    # Start new server thread
    _server_thread = threading.Thread(target=run_server, daemon=True)
    _server_thread.start()

    # Wait for server to be ready
    if wait_for_server(timeout):
        log.debug(f"Started schema server at {host}:{port} with schema file {schema_file}")
        if not no_browser:
            webbrowser.open(f"http://{host}:{port}")
        return True

    log.error(f"Server failed to start at {host}:{port} within {timeout} seconds")
    cleanup_server()
    return False


def wait_for_finish(base_url: str) -> bool:
    """
    Wait for the finish signal from the client.

    Args:
        base_url: Base URL of the server

    Returns:
        bool: True if finished successfully, False otherwise

    """
    # Get the server instance
    server = _server_instance
    if server is None:
        return False

    # Wait indefinitely for the finished event to be set
    while not server.finished.is_set():
        time.sleep(1)

    return True


@handle_schema_errors
def send_schema(schema_file: Path, url: str, no_browser: bool = False) -> Optional[str]:
    """
    Send schema file to URL using HTTP.

    Args:
        schema_file: Path to schema file
        url: Target URL
        no_browser: Whether to open browser

    Returns:
        Optional[str]: Response data if successful, None otherwise

    """
    # Ensure server is running if sending to localhost
    if "localhost" in url or "127.0.0.1" in url:
        if not ensure_server_running(url, schema_file=schema_file, timeout=10, no_browser=no_browser):
            return None

    try:
        # Load schema file
        with open(schema_file, encoding="utf-8") as f:
            schema = json.load(f)
    except json.JSONDecodeError as e:
        log.error(f"Failed to parse schema file: {e}")
        return None

    # Prepare request
    try:
        data = json.dumps(schema).encode("utf-8")
    except (TypeError, ValueError) as e:
        log.error(f"Failed to serialize schema: {e}")
        return None

    headers = {"Content-Type": "application/json"}

    # Ensure URL has protocol and correct endpoint
    if not url.startswith(("http://", "https://")):
        url = f"http://{url}"
    if not url.endswith("/api/schema"):
        url = f"{url.rstrip('/')}/api/schema"

    # Send request
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    log.debug(f"Sending schema to {url}")

    try:
        with urllib.request.urlopen(req, timeout=30) as response:  # Keep reasonable timeout for HTTP request
            response_data: str = response.read().decode("utf-8")
            log.info(f"✅ Schema sent successfully to {url}")
            log.debug(f"Response: {response_data}")

            # For localhost, wait for finish signal
            if "localhost" in url or "127.0.0.1" in url:
                log.info("Waiting for you to finish editing. Click the 'Finish' button when done...")
                if not wait_for_finish(url):
                    log.error("Failed to receive finish signal")
                    return None

            return response_data
    except urllib.error.URLError as e:
        log.error(f"Failed to connect to {url}: {e}")
        return None
    except Exception as e:
        log.error(f"Unexpected error: {e}")
        return None
