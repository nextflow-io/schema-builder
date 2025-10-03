# nf-schema-builder

A minimal CLI tool built with Typer.

## Installation

### Using uv (Recommended)

1. Sync dependencies and create virtual environment:
```bash
uv sync --extra dev
```

2. Install pre-commit hooks:
```bash
uv run pre-commit install
```

3. Build GUI assets:
```bash
npm install --prefix gui
npm run build --prefix gui
```

### Alternative Installation (pip)

If you prefer using pip directly:
```bash
pip install -e ".[dev]"
pre-commit install
npm install --prefix gui && npm run build --prefix gui
```

## Usage

```bash
uv run nf-schema-builder send tests/test-schema-full.json
```

Or activate the virtual environment first:
```bash
source .venv/bin/activate
nf-schema-builder send tests/test-schema-full.json
```

## Development

This project uses [Ruff](https://github.com/astral-sh/ruff) for linting and formatting.

## Development Tools

This project uses:
- [Ruff](https://github.com/astral-sh/ruff) for linting and formatting
- [pyright](https://github.com/microsoft/pyright) for static type checking
- [pre-commit](https://pre-commit.com/) for automated checks

### Setup

Follow the installation instructions above using `uv sync --extra dev`.

### Development Workflow

The pre-commit hooks will automatically run on every commit. You can also run them manually:

```bash
uv run pre-commit run --all-files
```

To check types:

```bash
uv run pyright nf_schema_builder
```

To run tests:

```bash
uv run pytest
```
