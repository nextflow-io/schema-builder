"""Tests for config.py module."""

from pathlib import Path
from unittest.mock import patch

import pytest

from nf_schema_builder.config import ValidationConfig


@pytest.fixture
def mock_workflow_config() -> dict[str, str]:
    """Mock workflow configuration."""
    return {
        "plugins": "nf-schema",
        "validation.help.shortParameter": "h",
        "validation.help.fullParameter": "help",
        "validation.help.showHiddenParameter": "showHidden",
        "validation.defaultIgnoreParams": "['param1', 'param2']",
    }


def test_validation_config_nf_schema(mock_workflow_config: dict[str, str]) -> None:
    """Test ValidationConfig with nf-schema plugin."""
    with patch("nf_schema_builder.config.fetch_wf_config", return_value=mock_workflow_config):
        config = ValidationConfig.from_workflow(Path("/mock/path"))

        assert config.validation_plugin == "nf-schema"
        assert config.defs_notation == "$defs"
        assert config.schema_draft == "https://json-schema.org/draft/2020-12/schema"
        assert "h" in config.ignored_params
        assert "help" in config.ignored_params
        assert "showHidden" in config.ignored_params
        assert "param1" in config.ignored_params
        assert "param2" in config.ignored_params
        assert "trace_report_suffix" in config.ignored_params


def test_validation_config_nf_validation() -> None:
    """Test ValidationConfig with nf-validation plugin."""
    mock_config = {"plugins": "nf-validation", "validationSchemaIgnoreParams": "param1,param2"}

    with patch("nf_schema_builder.config.fetch_wf_config", return_value=mock_config):
        config = ValidationConfig.from_workflow(Path("/mock/path"))

        assert config.validation_plugin == "nf-validation"
        assert config.defs_notation == "definitions"
        assert config.schema_draft == "https://json-schema.org/draft-07/schema"
        assert "param1" in config.ignored_params
        assert "param2" in config.ignored_params
        assert "validationSchemaIgnoreParams" in config.ignored_params


def test_validation_config_no_plugin() -> None:
    """Test ValidationConfig with no plugin specified."""
    mock_config = {"plugins": ""}

    with patch("nf_schema_builder.config.fetch_wf_config", return_value=mock_config):
        config = ValidationConfig.from_workflow(Path("/mock/path"))

        assert config.validation_plugin == "nf-schema"  # default
        assert config.defs_notation == "$defs"
        assert config.schema_draft == "https://json-schema.org/draft/2020-12/schema"


def test_validation_config_empty_ignored_params() -> None:
    """Test ValidationConfig with empty ignored parameters."""
    mock_config = {"plugins": "nf-schema", "validation.defaultIgnoreParams": ""}

    with patch("nf_schema_builder.config.fetch_wf_config", return_value=mock_config):
        config = ValidationConfig.from_workflow(Path("/mock/path"))

        # Should still contain default ignored parameters
        assert "trace_report_suffix" in config.ignored_params
