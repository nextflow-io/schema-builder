# nf-schema-builder

Edit the JSON schemas of Nextflow pipelines in a local web editor.

It understands the two kinds of schema used by [nf-schema](https://nextflow-io.github.io/nf-schema/) and nf-core:

- **Pipeline parameters** (`nextflow_schema.json`): parameters in groups under `$defs` (or `definitions`), with nf-core
  extras such as `fa_icon`, `help_text` and `hidden`.
- **Samplesheets** (e.g. `assets/schema_input.json`): the columns of a samplesheet, with `meta`, `unique`, `exists`,
  `errorMessage` and optional pattern-checked columns.

Keywords the editor does not know about are kept as they are, and every parameter can also be edited as raw JSON.

## Command line

```bash
nf-schema-builder edit nextflow_schema.json       # or: nfsb edit ...
nf-schema-builder edit assets/schema_input.json
nf-schema-builder validate nextflow_schema.json
```

`edit` opens the editor in your browser and waits until you click **Finish**. The file is rewritten each time you save,
keeping its indentation. Without arguments, `nf-schema-builder` edits `./nextflow_schema.json`.

`validate` checks that the file is a valid JSON Schema. If it is a parameter schema next to a `nextflow.config` (or
`--workflow-dir` is given), it also compares the schema with the pipeline's parameters, which needs Nextflow.
`edit --add-missing` adds the pipeline parameters that the schema lacks before opening the editor.

## Python library

```python
from nf_schema_builder import edit_schema

edited = edit_schema(schema)                   # a dict: returns the edited copy, writes nothing
edited = edit_schema("nextflow_schema.json")   # a file: rewritten on every save
```

`edit_schema` blocks until the user clicks Finish and returns the schema as last saved. It raises
`nf_schema_builder.InvalidSchemaError` for input that is not a valid JSON Schema, and `TimeoutError` if a `timeout` is
given and passes. It logs through the standard `logging` module (logger `nf_schema_builder`) and never prints, prompts
or exits.

For example, in nf-core/tools, `PipelineSchema.launch_web_builder` could become:

```python
from nf_schema_builder import edit_schema

def launch_web_builder(self):
    self.schema = edit_schema(self.schema)
    self.remove_schema_empty_definitions()
    self.validate_schema()
    self.save_schema()
```

For more control, `SchemaServer` runs the editor without blocking, and `check_schema`, `iter_params`, `add_params`,
`compare_with_workflow` are available on their own. The library needs Python 3.10+ and depends only on
`jsonschema`, `rich` and `typer`.

To use it from another project before a release is published, build the editor once (see below) and install the
checkout, e.g. `pip install -e ../nf-schema-builder`.

## Development

```bash
uv sync --extra dev
npm ci --prefix gui
npm run build --prefix gui      # builds the editor into nf_schema_builder/static
uv run nfsb edit tests/test-schema.json
```

The editor is a [Lit](https://lit.dev) app in `gui/`. To work on it with hot reload, run the backend on port 5173 and
the Vite dev server (port 5174) next to it:

```bash
uv run nfsb edit tests/test-schema.json --port 5173 --no-browser
npm run dev --prefix gui
```

Without a backend, the editor opens and downloads schema files itself.

Checks:

```bash
uv run pytest
uv run ruff check . && uv run ruff format --check .
uv run pyright
npm run typecheck --prefix gui && npm test --prefix gui
```

The built editor is not tracked by git. `uv build` bundles it into the wheel, building it first if needed (requires
npm).
