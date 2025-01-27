"""Tests for http.py module."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import URLError

import pytest

from nf_schema_builder.http import send_schema


@pytest.fixture
def schema_file(tmp_path) -> Path:
    """Create a sample schema file for testing."""
    schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Test Schema",
        "type": "object",
        "properties": {"test": {"type": "string"}},
    }
    file_path = tmp_path / "schema.json"
    with open(file_path, "w") as f:
        json.dump(schema, f)
    return file_path


def test_send_schema_success(schema_file: Path) -> None:
    """Test successful schema sending."""
    mock_response = MagicMock()
    mock_response.read.return_value = b'{"status": "success"}'
    mock_response.__enter__.return_value = mock_response

    with patch("urllib.request.urlopen", return_value=mock_response):
        response = send_schema(schema_file, "http://example.com")
        assert response == '{"status": "success"}'


def test_send_schema_no_scheme(schema_file: Path) -> None:
    """Test sending schema to URL without scheme."""
    mock_response = MagicMock()
    mock_response.read.return_value = b'{"status": "success"}'
    mock_response.__enter__.return_value = mock_response

    with patch("urllib.request.urlopen", return_value=mock_response):
        response = send_schema(schema_file, "example.com")
        assert response == '{"status": "success"}'


def test_send_schema_invalid_json(tmp_path: Path) -> None:
    """Test sending invalid JSON schema."""
    invalid_file = tmp_path / "invalid.json"
    with open(invalid_file, "w") as f:
        f.write("invalid json")

    response = send_schema(invalid_file, "http://example.com")
    assert response is None


def test_send_schema_connection_error(schema_file: Path) -> None:
    """Test schema sending with connection error."""
    with patch("urllib.request.urlopen", side_effect=URLError("Connection failed")):
        response = send_schema(schema_file, "http://example.com")
        assert response is None


def test_send_schema_unexpected_error(schema_file: Path) -> None:
    """Test schema sending with unexpected error."""
    with patch("urllib.request.urlopen", side_effect=Exception("Unexpected error")):
        response = send_schema(schema_file, "http://example.com")
        assert response is None
