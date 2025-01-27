"""Utility functions for nf-schema-builder."""

import hashlib
import json
import re
from dataclasses import dataclass
from functools import wraps
from pathlib import Path
from subprocess import run
from typing import Callable, Optional, TypeVar, Union, cast

import typer
from jsonschema.exceptions import SchemaError, ValidationError

from nf_schema_builder.logger import log


# Type definitions
T = TypeVar("T")
ConfigDict = dict[str, str]


def handle_schema_errors(func: Callable[..., T]) -> Callable[..., T]:
    """Standardize error handling for schema operations with this decorator."""

    @wraps(func)
    def wrapper(*args: object, **kwargs: object) -> T:
        try:
            return func(*args, **kwargs)
        except SchemaError as e:
            log.error(f"❌ Invalid schema: {e}")
            raise typer.Exit(1) from e
        except ValidationError as e:
            log.error(f"❌ Invalid parameters: {e}")
            raise typer.Exit(1) from e
        except Exception as e:
            log.error(f"❌ Error: {e}")
            raise typer.Exit(1) from e

    return wrapper


@dataclass
class CacheManager:
    """Manages caching of workflow configurations."""

    cache_dir: Path = Path.home() / ".config" / ".nextflow" / "nf-schema-builder"

    def __post_init__(self) -> None:
        """Ensure cache directory exists."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def get_cached_config(self, wf_path: Path) -> Optional[ConfigDict]:
        """Get cached configuration if it exists."""
        cache_key = self._compute_cache_key(wf_path)
        cache_file = self.cache_dir / f"{cache_key}.json"
        return self._load_cache(cache_file) if cache_file.exists() else None

    def save_config(self, wf_path: Path, config: ConfigDict) -> None:
        """Save configuration to cache."""
        cache_key = self._compute_cache_key(wf_path)
        cache_file = self.cache_dir / f"{cache_key}.json"
        self._save_cache(cache_file, config)

    def _compute_cache_key(self, wf_path: Path) -> str:
        """Compute cache key from workflow files."""
        content_hash = ""
        for fn in ["nextflow.config", "main.nf"]:
            try:
                with open(wf_path / fn, "rb") as fh:
                    content_hash += hashlib.sha256(fh.read()).hexdigest()
            except FileNotFoundError:
                continue
        return hashlib.sha256(content_hash.encode("utf-8")).hexdigest()[:25]

    def _load_cache(self, cache_file: Path) -> Optional[ConfigDict]:
        """Load configuration from cache file."""
        try:
            with open(cache_file) as f:
                data = json.load(f)
                if isinstance(data, dict) and all(
                    isinstance(k, str) and (isinstance(v, str) or v is None) for k, v in data.items()
                ):
                    return data
                return None
        except (json.JSONDecodeError, OSError) as e:
            log.debug(f"Failed to load cache: {e}")
            return None

    def _save_cache(self, cache_file: Path, config: ConfigDict) -> None:
        """Save configuration to cache file."""
        try:
            with open(cache_file, "w") as f:
                json.dump(config, f, indent=4)
        except OSError as e:
            log.debug(f"Failed to save cache: {e}")


class ConfigParser:
    """Parses Nextflow configuration files."""

    @staticmethod
    def parse_config_line(line: str) -> tuple[Optional[str], Optional[str]]:
        """Parse a single configuration line."""
        try:
            key, value = line.split(" = ", 1)
            return key, value.strip("'\"")
        except ValueError:
            return None, None

    @staticmethod
    def parse_main_nf(content: str) -> ConfigDict:
        """Parse main.nf file for parameter declarations."""
        params = {}
        for line in content.splitlines():
            match = re.match(r"^\s*(params\.[a-zA-Z0-9_]+)\s*=(?!=)", line)
            if match:
                params[match.group(1)] = "null"
        return params


def check_nextflow_installation() -> bool:
    """
    Check if Nextflow is installed and accessible.

    Returns:
        bool: True if Nextflow is installed, False otherwise

    """
    try:
        result = run("nextflow", capture_output=True)
        return result.returncode == 0
    except FileNotFoundError:
        return False


@handle_schema_errors
def fetch_wf_config(wf_path: Path, cache_config: bool = True) -> ConfigDict:
    """
    Fetch workflow configuration from Nextflow.

    Args:
        wf_path: Nextflow workflow file system path
        cache_config: Whether to use config caching (default: True)

    Returns:
        Dictionary of workflow configuration settings

    """
    if not check_nextflow_installation():
        log.error("Nextflow is not installed")
        raise typer.Exit(1)

    log.debug(f"Got '{wf_path}' as path")

    cache_manager = CacheManager()
    config_parser = ConfigParser()

    # Try cache first
    if cache_config:
        cached_config = cache_manager.get_cached_config(wf_path)
        if cached_config:
            return cached_config

    # Parse configuration
    config: ConfigDict = {}

    # Parse nextflow config
    try:
        result = run(["nextflow", "config", "-flat", str(wf_path)], capture_output=True)
        if result.returncode == 0:
            nfconfig_raw = result.stdout.decode("utf-8")
            for line in nfconfig_raw.splitlines():
                key, value = config_parser.parse_config_line(line)
                if key and value:
                    config[key] = value
    except Exception as e:
        log.error(f"Error running nextflow config command: {e}")
        raise typer.Exit(1) from e

    # Parse main.nf
    try:
        main_nf = Path(wf_path, "main.nf")
        with open(main_nf, "rb") as fh:
            content = fh.read().decode("utf-8")
            config.update(config_parser.parse_main_nf(content))
    except FileNotFoundError as e:
        log.warning(f"Could not open main.nf: {e}")

    # Cache the results if needed
    if cache_config and config:
        cache_manager.save_config(wf_path, config)

    return config
