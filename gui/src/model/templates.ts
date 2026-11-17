/** Starting points for new schemas, following the nf-core conventions. */

import type { Schema } from "./schema";

export const parametersTemplate = (): Schema => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Pipeline parameters",
  description: "",
  type: "object",
  $defs: {
    input_output_options: {
      title: "Input/output options",
      type: "object",
      fa_icon: "fas fa-terminal",
      description: "Define where the pipeline should find input data and save output data.",
      required: ["input", "outdir"],
      properties: {
        input: {
          type: "string",
          format: "file-path",
          exists: true,
          mimetype: "text/csv",
          pattern: "^\\S+\\.csv$",
          description: "Path to comma-separated file containing information about the samples in the experiment.",
          fa_icon: "fas fa-file-csv",
        },
        outdir: {
          type: "string",
          format: "directory-path",
          description: "The output directory where the results will be saved.",
          fa_icon: "fas fa-folder-open",
        },
      },
    },
  },
  allOf: [{ $ref: "#/$defs/input_output_options" }],
});

export const samplesheetTemplate = (): Schema => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Samplesheet",
  description: "Schema for the file provided with params.input",
  type: "array",
  items: {
    type: "object",
    properties: {
      sample: {
        type: "string",
        pattern: "^\\S+$",
        errorMessage: "Sample name must be provided and cannot contain spaces",
        meta: ["id"],
      },
      fastq_1: {
        type: "string",
        format: "file-path",
        exists: true,
        pattern: "^\\S+\\.f(ast)?q\\.gz$",
        errorMessage: "FastQ file for reads 1 must be provided, cannot contain spaces and must have extension '.fq.gz' or '.fastq.gz'",
      },
    },
    required: ["sample", "fastq_1"],
  },
});
