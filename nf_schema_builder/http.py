"""HTTP utilities for nf-schema-builder."""

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

from nf_schema_builder.logger import log
from nf_schema_builder.utils import handle_schema_errors


@handle_schema_errors
def send_schema(schema_file: Path, url: str, timeout: int = 10) -> Optional[str]:
    """
    Send schema file to URL.

    Args:
        schema_file: Path to schema file
        url: URL to send schema to
        timeout: Timeout in seconds

    Returns:
        str: Response from server if successful, None if failed

    """
    try:
        # Load schema file
        with open(schema_file, encoding="utf-8") as f:
            schema = json.load(f)
    except json.JSONDecodeError as e:
        log.error(f"Failed to parse schema file: {e}")
        return None

    # Prepare request
    try:
        data = json.dumps(schema).encode("utf-8")
    except (TypeError, ValueError) as e:
        log.error(f"Failed to serialize schema: {e}")
        return None

    headers = {"Content-Type": "application/json", "User-Agent": "nf-schema-builder"}

    # Ensure URL has protocol
    if not url.startswith(("http://", "https://")):
        url = f"http://{url}"

    # Create and send request
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    log.debug(f"Sending schema to {url}")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            response_data: str = response.read().decode("utf-8")
            log.info(f"✅ Schema sent successfully to {url}")
            log.debug(f"Response: {response_data}")
            return response_data
    except urllib.error.URLError as e:
        log.error(f"Failed to connect to {url}: {e}")
        return None
    except Exception as e:
        log.error(f"Unexpected error: {e}")
        return None
