"""Tests for utils.py module."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import typer

from nf_schema_builder.utils import check_nextflow_installation, fetch_wf_config


def test_check_nextflow_installation() -> None:
    """Test Nextflow installation check."""
    with patch("nf_schema_builder.utils.run") as mock_run:
        # Test successful installation
        mock_run.reset_mock()
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_run.return_value = mock_process
        assert check_nextflow_installation() is True
        mock_run.assert_called_once_with(["nextflow", "-version"], capture_output=True)

        # Test failed installation
        mock_run.reset_mock()
        mock_process = MagicMock()
        mock_process.returncode = 1
        mock_run.return_value = mock_process
        assert check_nextflow_installation() is False
        mock_run.assert_called_once_with(["nextflow", "-version"], capture_output=True)

        # Test FileNotFoundError
        mock_run.reset_mock()
        mock_run.side_effect = FileNotFoundError()
        assert check_nextflow_installation() is False


@pytest.fixture
def mock_workflow_files(tmp_path: Path) -> Path:
    """Create mock workflow files for testing."""
    # Create nextflow.config
    config_content = """
    params.test = 'value'
    params.number = 42
    plugins = 'nf-schema'
    """
    config_file = tmp_path / "nextflow.config"
    config_file.write_text(config_content)

    # Create main.nf
    main_content = """
    params.additional = null
    """
    main_file = tmp_path / "main.nf"
    main_file.write_text(main_content)

    return tmp_path


def test_fetch_wf_config(mock_workflow_files: Path, tmp_path: Path) -> None:
    """Test fetching workflow configuration."""
    with (
        patch("nf_schema_builder.utils.check_nextflow_installation") as mock_check,
        patch("nf_schema_builder.utils.run_cmd") as mock_run,
    ):
        mock_check.return_value = True
        mock_run.return_value = (b"params.test = 'value'\nparams.number = 42\nplugins = 'nf-schema'\n", b"")

        # Test with cache disabled
        config = fetch_wf_config(mock_workflow_files, cache_config=False)
        assert isinstance(config, dict)
        assert config["params.test"] == "value"
        assert config["params.number"] == "42"
        assert config["plugins"] == "nf-schema"

        # Test with cache enabled
        config = fetch_wf_config(mock_workflow_files, cache_config=True)
        assert isinstance(config, dict)
        assert config["params.test"] == "value"
        assert config["params.number"] == "42"
        assert config["plugins"] == "nf-schema"


def test_fetch_wf_config_no_nextflow(mock_workflow_files: Path) -> None:
    """Test fetching workflow configuration without Nextflow installed."""
    with patch("nf_schema_builder.utils.check_nextflow_installation") as mock_check:
        mock_check.return_value = False
        with pytest.raises(typer.Exit):
            fetch_wf_config(mock_workflow_files)
