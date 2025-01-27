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

### Alternative Installation (pip)

If you prefer using pip directly:
```bash
pip install -e ".[dev]"
pre-commit install
```

## Usage

The tool can validate JSON or YAML schema files against JSON Schema specifications:

```bash
# Validate the default schema file (nextflow_schema.json)
nf-schema-builder validate

# Validate a specific schema file
nf-schema-builder validate path/to/schema.json

# Validate a YAML schema file
nf-schema-builder validate path/to/schema.yaml
```

The validator will:
- Check if the file is valid JSON/YAML
- Validate the schema against JSON Schema Draft 2020-12
- Display basic schema information (title, description, type)

## Development

This project uses [Ruff](https://github.com/astral-sh/ruff) for linting and formatting.

## Development Tools

This project uses:
- [Ruff](https://github.com/astral-sh/ruff) for linting and formatting
- [MyPy](https://mypy.readthedocs.io/) for static type checking
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
mypy nf_schema_builder
```
