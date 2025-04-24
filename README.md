# nf-schema-builder

A minimal CLI tool built with Typer.

## Installation

### Using Conda (Recommended)

1. Create and activate the conda environment:
```bash
conda env create -f environment.yml
conda activate nf-schema-builder
```

2. Install pre-commit hooks:
```bash
pre-commit install
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

1. Install development dependencies:

```bash
pip install -e ".[dev]"
```

2. Install pre-commit hooks:

```bash
pre-commit install
```

### Development Workflow

The pre-commit hooks will automatically run on every commit. You can also run them manually:

```bash
pre-commit run --all-files
```

To check types:

```bash
pyright nf_schema_builder
```
