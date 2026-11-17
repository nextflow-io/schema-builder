"""
Build and edit JSON schemas for Nextflow pipelines in a local web editor.

Typical use from another tool::

    from nf_schema_builder import edit_schema

    schema = edit_schema(schema)                      # edit a dict, get the edited dict back
    schema = edit_schema("nextflow_schema.json")      # edit a file in place
"""

__version__ = "0.2.0"

from nf_schema_builder.editor import edit_schema
from nf_schema_builder.exceptions import InvalidSchemaError, NextflowError, SchemaBuilderError
from nf_schema_builder.schema import (
    SchemaKind,
    add_params,
    check_schema,
    dump_schema,
    iter_params,
    load_schema,
    schema_kind,
)
from nf_schema_builder.server import SchemaServer
from nf_schema_builder.workflow import (
    ParamReport,
    compare_params,
    compare_with_workflow,
    fetch_workflow_config,
    ignored_params,
    workflow_params,
)

__all__ = [
    "InvalidSchemaError",
    "NextflowError",
    "ParamReport",
    "SchemaBuilderError",
    "SchemaKind",
    "SchemaServer",
    "__version__",
    "add_params",
    "check_schema",
    "compare_params",
    "compare_with_workflow",
    "dump_schema",
    "edit_schema",
    "fetch_workflow_config",
    "ignored_params",
    "iter_params",
    "load_schema",
    "schema_kind",
    "workflow_params",
]
