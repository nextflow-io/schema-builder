"""Exceptions raised by nf-schema-builder."""


class SchemaBuilderError(Exception):
    """Base class for all errors raised by nf-schema-builder."""


class InvalidSchemaError(SchemaBuilderError):
    """The schema could not be read or is not a valid JSON Schema."""


class NextflowError(SchemaBuilderError):
    """Nextflow is not installed or failed to resolve the workflow config."""
