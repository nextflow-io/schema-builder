"""Hatch build hook: make sure the web editor is built before it is packaged."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class GuiBuildHook(BuildHookInterface):
    """Build the Lit GUI into nf_schema_builder/static."""

    def initialize(self, version: str, build_data: dict[str, Any]) -> None:
        """Run before each build target."""
        root = Path(self.root)
        gui = root / "gui"
        built = (root / "nf_schema_builder" / "static" / "index.html").is_file()
        if version == "editable":
            # Don't make `uv sync` / `pip install -e .` depend on Node.js
            if not built:
                self.app.display_warning(
                    "The web editor has not been built yet. Run: npm ci --prefix gui && npm run build --prefix gui"
                )
            return
        if not (gui / "package.json").is_file():
            # Building from an sdist, which ships the built editor instead of its sources
            if not built:
                raise RuntimeError("The web editor is missing from this source distribution.")
            return
        npm = shutil.which("npm")
        if npm is None:
            raise RuntimeError("npm is needed to build the web editor (gui/). Install Node.js and try again.")
        # In a checkout, always rebuild so the package never ships a stale editor
        self.app.display_info("Building the web editor...")
        if not (gui / "node_modules").is_dir():
            subprocess.run([npm, "ci"], cwd=gui, check=True)
        subprocess.run([npm, "run", "build"], cwd=gui, check=True)
