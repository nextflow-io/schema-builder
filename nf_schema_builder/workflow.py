"""Compare a parameter schema with the parameters a Nextflow workflow defines."""

from __future__ import annotations

import os
import re
import subprocess
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from nf_schema_builder.exceptions import NextflowError
from nf_schema_builder.schema import Schema, iter_params, validator_class

_MAIN_NF_PARAM = re.compile(r"^\s*params\.([a-zA-Z0-9_]+)\s*=(?!=)", flags=re.MULTILINE)
_QUOTED = re.compile(r"""['"]([^'"]+)['"]""")


def parse_config_value(raw: str) -> Any:
    """Convert a value printed by ``nextflow config -flat`` to a Python value."""
    raw = raw.strip()
    if raw in ("", "null"):
        return None
    if raw in ("true", "false"):
        return raw == "true"
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "'\"":
        return raw[1:-1]
    for convert in (int, float):
        try:
            return convert(raw)
        except ValueError:
            pass
    return raw


def parse_flat_config(text: str) -> dict[str, str]:
    """Parse the ``key = value`` lines printed by ``nextflow config -flat``."""
    config: dict[str, str] = {}
    for line in text.splitlines():
        key, sep, value = line.partition(" = ")
        if sep:
            config[key.strip()] = value.strip()
    return config


def fetch_workflow_config(workflow_dir: str | os.PathLike[str]) -> dict[str, str]:
    """
    Resolve a workflow's configuration with ``nextflow config -flat``.

    Values are returned as the raw strings Nextflow prints; use
    :func:`parse_config_value` to convert them.

    Raises:
        NextflowError: if Nextflow is not installed or the config cannot be resolved.

    """
    try:
        result = subprocess.run(
            ["nextflow", "config", "-flat", str(workflow_dir)], capture_output=True, text=True, check=False
        )
    except FileNotFoundError as e:
        raise NextflowError("Nextflow is not installed. See https://www.nextflow.io/docs/latest/install.html") from e
    if result.returncode != 0:
        raise NextflowError(f"`nextflow config` failed for {workflow_dir}:\n{result.stderr.strip()}")
    return parse_flat_config(result.stdout)


def workflow_params(workflow_dir: str | os.PathLike[str], config: Mapping[str, str] | None = None) -> dict[str, Any]:
    """
    Return the top-level parameters of a workflow with their default values.

    Parameters come from the resolved config and from ``params.x = ...``
    assignments in ``main.nf``. Nested parameters (``params.a.b``) are skipped.
    """
    if config is None:
        config = fetch_workflow_config(workflow_dir)

    params: dict[str, Any] = {}
    for key, raw in config.items():
        name = key.removeprefix("params.")
        if name != key and "." not in name:
            params[name] = parse_config_value(raw)

    main_nf = Path(workflow_dir, "main.nf")
    if main_nf.is_file():
        for name in _MAIN_NF_PARAM.findall(main_nf.read_text(encoding="utf-8")):
            params.setdefault(name, None)
    return params


def ignored_params(config: Mapping[str, str]) -> set[str]:
    """Return the parameters that the workflow's validation plugin does not expect in the schema."""

    def setting(key: str, default: str) -> str:
        return str(parse_config_value(config.get(key, default)) or default)

    if "nf-validation" in config.get("plugins", ""):
        ignored = set(setting("params.validationSchemaIgnoreParams", "").split(","))
        ignored.add("validationSchemaIgnoreParams")
    else:  # nf-schema
        ignored = {
            setting("validation.help.shortParameter", "help"),
            setting("validation.help.fullParameter", "helpFull"),
            setting("validation.help.showHiddenParameter", "showHidden"),
            "trace_report_suffix",  # a Java Date object, which cannot be described in the schema
        }
        ignored.update(_QUOTED.findall(config.get("validation.defaultIgnoreParams", "")))
    return {name.strip() for name in ignored if name.strip()}


@dataclass
class ParamReport:
    """Differences between a parameter schema and the parameters of a workflow."""

    missing_from_schema: dict[str, Any] = field(default_factory=dict)
    """Workflow parameters (with their defaults) that the schema does not describe."""

    missing_from_workflow: list[str] = field(default_factory=list)
    """Schema parameters that the workflow does not define."""

    invalid_defaults: dict[str, str] = field(default_factory=dict)
    """Parameters whose workflow default is rejected by the schema, with the reason."""

    @property
    def ok(self) -> bool:
        """Whether the schema and the workflow agree."""
        return not (self.missing_from_schema or self.missing_from_workflow or self.invalid_defaults)


def compare_params(schema: Schema, params: Mapping[str, Any], ignored: Iterable[str] = ()) -> ParamReport:
    """Compare the parameters a workflow defines with the ones its schema describes."""
    ignored = set(ignored)
    validator_cls = validator_class(schema)
    schema_params = {name: definition for name, definition, _ in iter_params(schema)}
    report = ParamReport()

    for name, value in params.items():
        if name in ignored:
            continue
        if name not in schema_params:
            report.missing_from_schema[name] = value
        elif value is not None:
            error = next(iter(validator_cls(schema_params[name]).iter_errors(value)), None)
            if error is not None:
                report.invalid_defaults[name] = error.message

    report.missing_from_workflow = [name for name in schema_params if name not in params and name not in ignored]
    return report


def compare_with_workflow(schema: Schema, workflow_dir: str | os.PathLike[str]) -> ParamReport:
    """
    Compare a parameter schema with the parameters of the pipeline in ``workflow_dir``.

    Resolves the pipeline's config with Nextflow (once) and leaves out the
    parameters its validation plugin ignores.
    """
    config = fetch_workflow_config(workflow_dir)
    return compare_params(schema, workflow_params(workflow_dir, config), ignored_params(config))
