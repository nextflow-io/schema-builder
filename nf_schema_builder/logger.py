"""Logging configuration for nf-schema-builder."""

import logging

from rich.console import Console
from rich.logging import RichHandler

# Create console for output
console = Console()

# Configure logging with rich
rich_handler = RichHandler(console=console, rich_tracebacks=False, show_time=False)
logging.basicConfig(level=logging.INFO, handlers=[rich_handler], format="%(message)s")

# Get logger
log = logging.getLogger("nf-schema-builder")


def set_debug(debug: bool = False) -> None:
    """
    Set debug logging level.

    Args:
        debug: If True, set logging level to DEBUG

    """
    if debug:
        log.setLevel(logging.DEBUG)
        # Also set rich console options
        console.options.update(width=120, height=40)
        logging.basicConfig(handlers=[RichHandler(console=console, rich_tracebacks=False)])
    else:
        log.setLevel(logging.INFO)
