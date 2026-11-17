"""Tests for server.py and editor.py."""

import json
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import pytest

from nf_schema_builder import InvalidSchemaError, SchemaBuilderError, SchemaServer, edit_schema


def request(url: str, method: str = "GET", body: Any = None, headers: dict[str, str] | None = None) -> tuple[int, Any]:
    """Send a request and return the status and the decoded body."""
    headers = dict(headers or {})
    data = None
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    try:
        return status, json.loads(raw)
    except ValueError:
        return status, raw.decode()


@pytest.fixture
def server(params_schema: dict[str, Any], static_dir: Path):
    """Run a server for the test schema."""
    with SchemaServer(params_schema, name="nextflow_schema.json", static_dir=static_dir) as running:
        yield running


def test_get_schema(server: SchemaServer, params_schema: dict[str, Any]) -> None:
    """The schema and its name are served."""
    assert server.url.startswith("http://127.0.0.1:")
    assert request(server.url + "api/schema") == (200, {"schema": params_schema, "name": "nextflow_schema.json"})
    assert request(server.url + "api/health")[1]["status"] == "ok"


def test_save_schema(params_schema: dict[str, Any], static_dir: Path) -> None:
    """Saving stores the schema and calls on_save; the caller's dict is untouched."""
    saved: list[dict[str, Any]] = []
    edited = {**params_schema, "title": "Edited"}
    with SchemaServer(params_schema, on_save=saved.append, static_dir=static_dir) as server:
        assert request(server.url + "api/schema", "PUT", edited) == (200, {"status": "saved"})
        assert server.schema == edited
        # Saving the same thing again is not a change
        assert request(server.url + "api/schema", "PUT", edited)[0] == 200
    assert saved == [edited]
    assert params_schema["title"] == "Test pipeline parameters"


@pytest.mark.parametrize(
    ("body", "headers", "status"),
    [
        ({"type": "nonsense"}, {}, 422),
        ([1, 2], {}, 422),
        (b"{not json", {}, 400),
        ({"type": "object"}, {"Content-Type": "text/plain"}, 415),
        ({"type": "object"}, {"Origin": "https://evil.example"}, 403),
        ({"type": "object"}, {"Host": "evil.example"}, 403),
    ],
)
def test_save_rejected(
    server: SchemaServer, params_schema: dict[str, Any], body: Any, headers: Any, status: int
) -> None:
    """Invalid schemas and requests from other sites are refused, and nothing is stored."""
    code, payload = request(server.url + "api/schema", "PUT", body, headers)
    assert code == status
    assert payload["error"]
    assert server.schema == params_schema


def test_same_origin_write_allowed(server: SchemaServer) -> None:
    """The editor's own page may write."""
    origin = server.url.rstrip("/")
    assert request(server.url + "api/schema", "PUT", {"type": "object"}, {"Origin": origin})[0] == 200


def test_on_save_failure_is_reported(params_schema: dict[str, Any], static_dir: Path) -> None:
    """If the schema cannot be written, the editor is told and the old schema is kept."""

    def on_save(_: dict[str, Any]) -> None:
        raise OSError("disk full")

    with SchemaServer(params_schema, on_save=on_save, static_dir=static_dir) as server:
        code, payload = request(server.url + "api/schema", "PUT", {"type": "object"})
        assert (code, payload) == (500, {"error": "disk full"})
        assert server.schema == params_schema


def test_finish(server: SchemaServer, params_schema: dict[str, Any]) -> None:
    """Finishing saves the final schema and releases wait()."""
    assert server.wait(timeout=0.01) is False
    edited = {**params_schema, "title": "Final"}
    assert request(server.url + "api/finish", "POST", edited) == (200, {"status": "finished"})
    assert server.wait(timeout=1) is True
    assert server.schema == edited


def test_finish_without_body(server: SchemaServer, params_schema: dict[str, Any]) -> None:
    """Finishing without a body keeps the last saved schema."""
    assert request(server.url + "api/finish", "POST")[0] == 200
    assert server.wait(timeout=1)
    assert server.schema == params_schema


def test_static_files(server: SchemaServer) -> None:
    """The editor is served, and nothing outside its directory."""
    assert "<title>editor</title>" in request(server.url)[1]
    assert request(server.url + "assets/app.js") == (200, "console.log('hi')")
    assert request(server.url + "assets/missing.js")[0] == 404
    assert request(server.url + "../secret.txt")[0] == 404
    assert request(server.url + "%2e%2e/secret.txt")[0] == 404
    assert request(server.url + "api/unknown")[0] == 404
    assert request(server.url, "POST", {})[0] == 405


def test_missing_gui(params_schema: dict[str, Any], tmp_path: Path) -> None:
    """A clear error is raised when the editor has not been built."""
    with pytest.raises(SchemaBuilderError, match="npm"):
        SchemaServer(params_schema, static_dir=tmp_path).start()


def test_stop_releases_port(params_schema: dict[str, Any], static_dir: Path) -> None:
    """After stop() the server no longer answers, and stop() can be called twice."""
    server = SchemaServer(params_schema, static_dir=static_dir)
    url = server.start()
    server.stop()
    server.stop()
    with pytest.raises(urllib.error.URLError):
        urllib.request.urlopen(url + "api/health", timeout=2)


class FakeBrowser:
    """Stands in for the user: saves an edit, then clicks Finish."""

    def __init__(self, edit: dict[str, Any] | None = None):
        """Remember the edit to make."""
        self.edit = edit
        self.opened: list[str] = []

    def open(self, url: str) -> bool:
        """Act like `webbrowser.open`."""
        self.opened.append(url)
        threading.Thread(target=self.act, args=(url,), daemon=True).start()
        return True

    def act(self, url: str) -> None:
        """Load the schema, change it and finish."""
        schema = request(url + "api/schema")[1]["schema"]
        request(url + "api/finish", "POST", {**schema, **(self.edit or {})})


@pytest.fixture
def browser(monkeypatch: pytest.MonkeyPatch, built_editor: Path) -> FakeBrowser:
    """Replace the web browser and the built editor."""
    fake = FakeBrowser({"title": "Edited"})
    monkeypatch.setattr("nf_schema_builder.editor.webbrowser.open", fake.open)
    return fake


def test_edit_schema_dict(browser: FakeBrowser, params_schema: dict[str, Any]) -> None:
    """Editing a dict returns the edited copy and leaves the original alone."""
    saves: list[dict[str, Any]] = []
    result = edit_schema(params_schema, on_save=saves.append, timeout=5)
    assert result["title"] == "Edited"
    assert saves == [result]
    assert params_schema["title"] == "Test pipeline parameters"
    assert len(browser.opened) == 1


def test_edit_schema_file(browser: FakeBrowser, tmp_path: Path, params_schema: dict[str, Any]) -> None:
    """Editing a file writes the result back, keeping the file's indentation."""
    path = tmp_path / "nextflow_schema.json"
    path.write_text(json.dumps(params_schema, indent=2))
    result = edit_schema(path, timeout=5)
    assert result["title"] == "Edited"
    assert path.read_text() == json.dumps(result, indent=2) + "\n"


def test_edit_schema_timeout(built_editor: Path, params_schema: dict[str, Any]) -> None:
    """A timeout is raised when the user never finishes."""
    with pytest.raises(TimeoutError):
        edit_schema(params_schema, open_browser=False, timeout=0.05)


def test_edit_schema_invalid(params_schema: dict[str, Any]) -> None:
    """An invalid schema is rejected before anything is served."""
    with pytest.raises(InvalidSchemaError):
        edit_schema({"type": "nonsense"}, open_browser=False)


def test_edit_schema_file_unchanged(
    monkeypatch: pytest.MonkeyPatch, built_editor: Path, tmp_path: Path, params_schema: dict[str, Any]
) -> None:
    """Finishing without changes leaves the file exactly as it was, whatever its formatting."""
    monkeypatch.setattr("nf_schema_builder.editor.webbrowser.open", FakeBrowser().open)
    path = tmp_path / "nextflow_schema.json"
    original = json.dumps(params_schema)  # on one line, no trailing newline
    path.write_text(original)
    assert edit_schema(path, timeout=5) == params_schema
    assert path.read_text() == original


def test_edit_schema_file_reordered(
    monkeypatch: pytest.MonkeyPatch, built_editor: Path, tmp_path: Path, params_schema: dict[str, Any]
) -> None:
    """Changing only the order of keys counts as a change and is written."""
    reordered = dict(reversed(list(params_schema.items())))

    def finish_reordered(url: str) -> bool:
        threading.Thread(target=request, args=(url + "api/finish", "POST", reordered), daemon=True).start()
        return True

    monkeypatch.setattr("nf_schema_builder.editor.webbrowser.open", finish_reordered)
    path = tmp_path / "nextflow_schema.json"
    path.write_text(json.dumps(params_schema))
    edit_schema(path, timeout=5)
    assert list(json.loads(path.read_text())) == list(reordered)
