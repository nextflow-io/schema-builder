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

from aiohttp import WSMsgType, web

from nf_schema_builder.logger import log
from nf_schema_builder.utils import handle_schema_errors

STATIC_PATH = Path(__file__).parent.parent / "gui" / "dist"

# Global server instance and thread
_server_instance = None
_server_thread = None


class SchemaServer:
    """
    Serve the schema editor.

    A web server that provides a GUI for editing JSON schema files. It handles WebSocket
    connections for real-time updates and file saving.

    Args:
        host (str): The hostname to bind the server to
        port (int): The port number to listen on
        schema_file (Path, optional): Path to the schema file. Defaults to "nextflow_schema.json"

    """

    def __init__(self, host: str, port: int, schema_file: Path = Path("nextflow_schema.json")):
        """
        Initialize the SchemaServer.

        Args:
            host (str): The hostname to bind the server to
            port (int): The port number to listen on
            schema_file (Path, optional): Path to the schema file. Defaults to "nextflow_schema.json"

        """
        self.host = host
        self.port = port
        self.schema_file = schema_file
        self.app = web.Application()
        self.websockets: set[web.WebSocketResponse] = set()
        self.ready = threading.Event()
        self.schema_saved = threading.Event()
        self.setup_routes()

    def setup_routes(self):
        """Configure the application routes for the web server."""
        self.app.router.add_post("/schema", self.handle_schema)
        self.app.router.add_get("/ws", self.websocket_handler)
        self.app.router.add_static("/assets/", STATIC_PATH / "assets")
        self.app.router.add_get("/", self.serve_index)

    async def serve_index(self, request):
        """
        Serve the main index.html file.

        Args:
            request: The incoming HTTP request

        Returns:
            FileResponse: The index.html file response

        """
        return web.FileResponse(STATIC_PATH / "index.html")

    async def broadcast_schema(self, schema_data):
        """
        Broadcast schema updates to all connected WebSocket clients.

        Args:
            schema_data: The schema data to broadcast

        """
        if not self.websockets:
            return

        for ws in self.websockets:
            try:
                await ws.send_json(schema_data)
            except Exception:
                self.websockets.discard(ws)

    async def handle_schema(self, request):
        """
        Handle incoming schema POST requests.

        Args:
            request: The incoming HTTP request containing schema data

        Returns:
            Response: HTTP response indicating success or failure

        """
        try:
            schema_data = await request.json()
            await self.broadcast_schema(schema_data)
            return web.Response(text="Schema received and broadcasted", status=200)
        except Exception as e:
            return web.Response(text=str(e), status=400)

    async def websocket_handler(self, request):
        """
        Handle WebSocket connections and messages.

        Manages WebSocket lifecycle including connection setup, message handling,
        and cleanup. Supports schema operations like saving and retrieving.

        Args:
            request: The incoming WebSocket request

        Returns:
            WebSocketResponse: The WebSocket response object

        """
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self.websockets.add(ws)

        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                        if data.get("type") == "save_schema":
                            try:
                                self.schema_file.write_text(json.dumps(data["data"], indent=2))
                                await ws.send_json({"status": "success", "message": "Schema saved successfully"})
                                self.schema_saved.set()
                                log.info(f"Schema saved successfully to {self.schema_file}")
                            except Exception as e:
                                log.error(f"Error saving schema: {e}")
                                await ws.send_json({"status": "error", "message": str(e)})
                        elif data.get("type") == "get_schema":
                            try:
                                if self.schema_file.exists():
                                    schema_data = json.loads(self.schema_file.read_text())
                                    await ws.send_json({"type": "schema_update", "data": schema_data})
                                    log.info(f"Schema sent to client from {self.schema_file}")
                                else:
                                    log.error(f"Schema file not found: {self.schema_file}")
                                    await ws.send_json(
                                        {"status": "error", "message": f"Schema file not found: {self.schema_file}"}
                                    )
                            except Exception as e:
                                log.error(f"Error sending schema: {e}")
                                await ws.send_json({"status": "error", "message": str(e)})
                        elif data.get("type") == "close":
                            break
                    except json.JSONDecodeError:
                        log.error("Invalid JSON data received")
                        await ws.send_json({"status": "error", "message": "Invalid JSON data"})
                elif msg.type == WSMsgType.ERROR:
                    log.error(f"WebSocket error: {ws.exception()}")
        finally:
            self.websockets.discard(ws)
        return ws

    async def start(self):
        """
        Start the web server and wait for schema save.

        Sets up and starts the web server, then waits for a schema save event
        before cleaning up.
        """
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, self.host, self.port)
        await site.start()
        self.ready.set()
        log.info(f"Server started at http://{self.host}:{self.port}")

        try:
            while not self.schema_saved.is_set():
                await asyncio.sleep(1)
        finally:
            await runner.cleanup()

    def is_ready(self) -> bool:
        """
        Check if server is ready.

        Returns:
            bool: True if the server is ready and the port is open

        """
        return self.ready.is_set() and is_port_open(self.host, self.port)


def cleanup_server():
    """
    Cleanup function to be called on exit.

    Cleans up global server instance and thread when the application exits.
    """
    global _server_instance, _server_thread
    if _server_thread is not None:
        _server_thread = None
    if _server_instance is not None:
        _server_instance = None


atexit.register(cleanup_server)


def is_port_open(host: str, port: int) -> bool:
    """
    Check if a port is open on the given host.

    Args:
        host (str): The hostname to check
        port (int): The port number to check

    Returns:
        bool: True if the port is open, False otherwise

    """
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
        timeout (int, optional): Maximum time to wait in seconds. Defaults to 10.
        interval (float, optional): Time between checks in seconds. Defaults to 0.1.

    Returns:
        bool: True if server is ready within timeout, False otherwise

    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        # Get current instance to avoid race conditions
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

    Starts the server if it's not already running and optionally opens the browser.

    Args:
        url (str): The URL where the server should run
        schema_file (Path, optional): Path to the schema file. Defaults to "nextflow_schema.json".
        timeout (int, optional): Maximum time to wait for server start in seconds. Defaults to 10.
        no_browser (bool, optional): If True, don't open browser automatically. Defaults to False.

    Returns:
        bool: True if server is running successfully, False otherwise

    """
    global _server_instance, _server_thread

    if _server_thread is not None and _server_thread.is_alive():
        return True

    parsed_url = urllib.parse.urlparse(f"http://{url}" if not url.startswith(("http://", "https://")) else url)
    host = parsed_url.hostname or "localhost"
    port = parsed_url.port or 5173

    # Clear any previous state
    _server_instance = None
    _server_thread = None

    def run_server():
        """Run the server in a separate thread."""
        global _server_instance
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        # Create server instance with schema file
        server = SchemaServer(host, port, schema_file)
        _server_instance = server

        async def start_server():
            await server.start()

        try:
            loop.run_until_complete(start_server())
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
        # Open browser after confirming server is ready, unless no_browser is True
        if not no_browser:
            webbrowser.open(f"http://{host}:{port}")
        return True
    else:
        log.error(f"Server failed to start at {host}:{port} within {timeout} seconds")
        _server_thread = None
        _server_instance = None
        return False


def wait_for_schema_save() -> bool:
    """
    Wait for schema to be saved by the GUI.

    Returns:
        bool: True if schema was saved successfully, False otherwise

    """
    global _server_instance
    if _server_instance is None:
        return False
    while not _server_instance.schema_saved.is_set():
        time.sleep(0.5)
    if _server_instance.schema_saved.is_set():
        log.info("Schema saved successfully")
        return True
    else:
        log.info("Waiting for schema to be saved...")
        return False


@handle_schema_errors
def send_schema(schema_file: Path, url: str, timeout: int = 10, no_browser: bool = False) -> Optional[str]:
    """
    Send schema file to URL.

    Sends a JSON schema file to a specified URL, handling both local and remote destinations.

    Args:
        schema_file (Path): Path to the schema file to send
        url (str): Destination URL
        timeout (int, optional): Request timeout in seconds. Defaults to 10.
        no_browser (bool, optional): If True, don't open browser for local URLs. Defaults to False.

    Returns:
        Optional[str]: Response data if successful, None if failed

    """
    # Ensure server is running if sending to localhost
    if "localhost" in url or "127.0.0.1" in url:
        if not ensure_server_running(url, schema_file=schema_file, timeout=timeout, no_browser=no_browser):
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

    headers = {"Content-Type": "application/json", "User-Agent": "nf-schema-builder"}

    # Ensure URL has protocol and path
    if not url.startswith(("http://", "https://")):
        url = f"http://{url}"
    if not url.endswith("/schema"):
        url = f"{url.rstrip('/')}/schema"

    # Create and send request
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    log.debug(f"Sending schema to {url}")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            response_data: str = response.read().decode("utf-8")
            log.info(f"✅ Schema sent successfully to {url}")
            log.debug(f"Response: {response_data}")

            # For localhost, wait for schema to be saved
            if "localhost" in url or "127.0.0.1" in url:
                if not wait_for_schema_save():
                    log.error("Timed out waiting for schema to be saved")
                    return None

            return response_data
    except urllib.error.URLError as e:
        log.error(f"Failed to connect to {url}: {e}")
        return None
    except Exception as e:
        log.error(f"Unexpected error: {e}")
        return None
