"""Tests for logger.py module."""

import logging

from nf_schema_builder.logger import log, set_debug


def test_set_debug() -> None:
    """Test setting debug mode."""
    # Test enabling debug mode
    set_debug(True)
    assert log.level == logging.DEBUG

    # Test disabling debug mode
    set_debug(False)
    assert log.level == logging.INFO
