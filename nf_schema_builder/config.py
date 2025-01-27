"""Configuration handling for nf-schema-builder."""

from dataclasses import dataclass, field
from pathlib import Path

from nf_schema_builder.logger import log
from nf_schema_builder.utils import fetch_wf_config


@dataclass
class WorkflowConfig:
    """Class to handle workflow configuration."""

    _config: dict[str, str]

    @classmethod
    def from_workflow(cls, workflow_dir: Path) -> "WorkflowConfig":
        """Create WorkflowConfig from workflow directory."""
        config = fetch_wf_config(workflow_dir)
        return cls(_config=config)

    def get(self, key: str, default: str = "") -> str:
        """Get config value."""
        return self._config.get(key, default)

    def get_params(self) -> dict[str, str]:
        """Get all params prefixed entries."""
        return {key: value for key, value in self._config.items() if key.startswith("params.")}

    @property
    def plugins(self) -> list[str]:
        """Get list of plugins."""
        return str(self.get("plugins", "")).strip("'\"").strip(" ").split(",")


@dataclass
class ValidationConfig:
    """Configuration for schema validation."""

    validation_plugin: str = "nf-schema"  # nf-schema or nf-validation
    defs_notation: str = "$defs"  # $defs or definitions
    schema_draft: str = "https://json-schema.org/draft/2020-12/schema"
    ignored_params: list[str] = field(default_factory=list)
    workflow_dir: Path = field(default_factory=Path)
    workflow_config: WorkflowConfig = field(init=False)

    def __post_init__(self):
        """Initialize workflow config."""
        self.workflow_config = WorkflowConfig.from_workflow(self.workflow_dir)

    @classmethod
    def from_workflow(cls, workflow_dir: Path) -> "ValidationConfig":
        """Create configuration from workflow directory."""
        config = cls(workflow_dir=workflow_dir)
        wf_config = config.workflow_config

        # Determine which validation plugin to use
        plugin = "nf-schema"  # default
        for plugin_instance in wf_config.plugins:
            if any(p in plugin_instance for p in ["nf-schema", "nf-validation"]):
                plugin = "nf-schema" if "nf-schema" in plugin_instance else "nf-validation"
                break
        else:  # no plugin found
            log.info(
                "Could not find nf-schema or nf-validation in the pipeline config. "
                "Defaulting to nf-schema notation for the JSON schema."
            )

        # Update config based on plugin
        config.validation_plugin = plugin

        if plugin == "nf-schema":
            config.defs_notation = "$defs"
            config.schema_draft = "https://json-schema.org/draft/2020-12/schema"

            # Get ignored parameters
            ignored_params = [
                wf_config.get("validation.help.shortParameter", "help"),
                wf_config.get("validation.help.fullParameter", "helpFull"),
                wf_config.get("validation.help.showHiddenParameter", "showHidden"),
                "trace_report_suffix",  # report suffix should be ignored by default as it is a Java Date object
            ]

            # Add ignored parameters from config
            ignored_params_config_str = wf_config.get("validation.defaultIgnoreParams", "")
            if ignored_params_config_str:
                cleaned_str = ignored_params_config_str.strip("[]'\"")
                ignored_params_config = [
                    item.strip().strip("'").strip('"') for item in cleaned_str.split(",") if item.strip()
                ]
                if ignored_params_config:
                    log.debug(f"Ignoring parameters from config: {ignored_params_config}")
                    ignored_params.extend(ignored_params_config)

        else:  # nf-validation
            config.defs_notation = "definitions"
            config.schema_draft = "https://json-schema.org/draft-07/schema"
            # Get ignored parameters from pipeline params
            ignored_params = wf_config.get("validationSchemaIgnoreParams", "").strip("\"'").split(",")
            ignored_params.append("validationSchemaIgnoreParams")

        config.ignored_params = [p for p in ignored_params if p]  # Remove empty strings
        log.debug(f"Ignoring parameters: {config.ignored_params}")

        return config
