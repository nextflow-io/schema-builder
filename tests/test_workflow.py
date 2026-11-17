"""Tests for workflow.py."""

import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from nf_schema_builder import NextflowError, compare_params, fetch_workflow_config, ignored_params, workflow_params
from nf_schema_builder.workflow import parse_config_value, parse_flat_config

FLAT_CONFIG = """\
params.input = null
params.outdir = 'results'
params.max_cpus = 16
params.skip_qc = false
params.genomes.GRCh38.fasta = 's3://bucket/genome.fa'
plugins = ['nf-schema@2.3.0']
validation.defaultIgnoreParams = ['genomes', "igenomes_base"]
validation.help.shortParameter = 'h'
"""


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("null", None),
        ("true", True),
        ("false", False),
        ("16", 16),
        ("1.0E-5", 1e-5),
        ("'a b'", "a b"),
        ("[1, 2]", "[1, 2]"),
    ],
)
def test_parse_config_value(raw: str, expected: Any) -> None:
    """Values printed by Nextflow become Python values."""
    assert parse_config_value(raw) == expected


def run_result(returncode: int = 0, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess[str]:
    """Build a fake result of running Nextflow."""
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


def test_fetch_workflow_config(tmp_path: Path) -> None:
    """The flat config is parsed into raw key/value strings."""
    with patch("nf_schema_builder.workflow.subprocess.run", return_value=run_result(stdout=FLAT_CONFIG)) as run:
        config = fetch_workflow_config(tmp_path)
    assert run.call_args.args[0] == ["nextflow", "config", "-flat", str(tmp_path)]
    assert config["params.outdir"] == "'results'"
    assert config["params.max_cpus"] == "16"


def test_fetch_workflow_config_no_nextflow(tmp_path: Path) -> None:
    """A missing Nextflow installation is reported."""
    with (
        patch("nf_schema_builder.workflow.subprocess.run", side_effect=FileNotFoundError),
        pytest.raises(NextflowError, match="not installed"),
    ):
        fetch_workflow_config(tmp_path)


def test_fetch_workflow_config_failure(tmp_path: Path) -> None:
    """A failing `nextflow config` is reported with its output."""
    with (
        patch("nf_schema_builder.workflow.subprocess.run", return_value=run_result(1, stderr="Unknown config")),
        pytest.raises(NextflowError, match="Unknown config"),
    ):
        fetch_workflow_config(tmp_path)


def test_workflow_params(tmp_path: Path) -> None:
    """Top-level params come from the config and from main.nf; nested ones are skipped."""
    (tmp_path / "main.nf").write_text("params.from_main = 1\nif (params.outdir == 'x') {}\n")
    params = workflow_params(tmp_path, parse_flat_config(FLAT_CONFIG))
    assert params == {"input": None, "outdir": "results", "max_cpus": 16, "skip_qc": False, "from_main": None}


def test_ignored_params_nf_schema() -> None:
    """nf-schema ignores its help parameters and `defaultIgnoreParams`."""
    assert ignored_params(parse_flat_config(FLAT_CONFIG)) == {
        "h",
        "helpFull",
        "showHidden",
        "trace_report_suffix",
        "genomes",
        "igenomes_base",
    }


def test_ignored_params_nf_validation() -> None:
    """nf-validation ignores `validationSchemaIgnoreParams`."""
    config = {"plugins": "['nf-validation@1.1.3']", "params.validationSchemaIgnoreParams": "'genomes,igenomes_base'"}
    assert ignored_params(config) == {"genomes", "igenomes_base", "validationSchemaIgnoreParams"}


def test_compare_params(params_schema: dict[str, Any]) -> None:
    """Missing parameters and invalid defaults are reported."""
    params = {"input": None, "max_cpus": 0, "outdir": "results", "help": False}
    report = compare_params(params_schema, params, ignored=["help"])
    assert report.missing_from_schema == {"outdir": "results"}
    assert report.missing_from_workflow == ["ungrouped"]
    assert list(report.invalid_defaults) == ["max_cpus"]
    assert not report.ok


def test_compare_params_ok(params_schema: dict[str, Any]) -> None:
    """A schema that matches the workflow is ok."""
    report = compare_params(params_schema, {"input": "samples.csv", "max_cpus": 4, "ungrouped": True})
    assert report.ok
