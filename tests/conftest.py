"""Shared pytest fixtures."""

import pytest


@pytest.fixture
def workspace_dir(tmp_path):
    """Create a temporary workspace directory."""
    return tmp_path


@pytest.fixture
def mock_nextflow_workspace(workspace_dir):
    """Create a mock Nextflow workspace with basic files."""
    # Create nextflow.config
    config_content = """
    params {
        test = 'value'
        number = 42
    }
    plugins {
        id = 'nf-schema'
    }
    """
    (workspace_dir / "nextflow.config").write_text(config_content)

    # Create main.nf
    main_content = """
    #!/usr/bin/env nextflow
    params.additional = null
    """
    (workspace_dir / "main.nf").write_text(main_content)

    return workspace_dir
