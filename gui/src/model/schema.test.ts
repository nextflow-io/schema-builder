import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint, lintParam } from "./lint";
import {
  ROOT,
  type Schema,
  addGroup,
  addParam,
  coerce,
  defsKey,
  groupsOf,
  kindOf,
  moveGroup,
  moveParam,
  paramNameError,
  parseList,
  patternOrEmpty,
  removeGroup,
  removeParam,
  renameParam,
  setField,
  setFormat,
  setPattern,
  setRequired,
  setType,
  slugify,
  updateGroup,
  updateMeta,
  updateParam,
  viewOf,
} from "./schema";

const load = (path: string): Schema => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8"));
const samplesheet = load("../../../tests/data/schema_input.json");

const params = (): Schema => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Test pipeline",
  description: "A test",
  type: "object",
  $defs: {
    input_output: {
      title: "Input/output",
      type: "object",
      fa_icon: "fas fa-terminal",
      description: "Where to find data",
      required: ["input"],
      properties: {
        input: { type: "string", format: "file-path", pattern: "^\\S+\\.csv$" },
        outdir: { type: "string", default: "results" },
      },
    },
    resources: {
      title: "Resources",
      type: "object",
      properties: { max_cpus: { type: "integer", default: 16, "x-custom": true } },
    },
  },
  allOf: [{ $ref: "#/$defs/input_output" }, { $ref: "#/$defs/resources" }],
});

const names = (schema: Schema, groupId: string) =>
  groupsOf(schema)
    .find((group) => group.id === groupId)!
    .params.map((param) => param.name);

describe("reading schemas", () => {
  it("tells parameter and samplesheet schemas apart", () => {
    expect(kindOf(params())).toBe("parameters");
    expect(kindOf(samplesheet)).toBe("samplesheet");
    expect(kindOf({})).toBe("parameters");
  });

  it("picks the definitions keyword that fits the schema", () => {
    expect(defsKey(params())).toBe("$defs");
    expect(defsKey({ definitions: {} })).toBe("definitions");
    expect(defsKey({ $schema: "http://json-schema.org/draft-07/schema" })).toBe("definitions");
    expect(defsKey({})).toBe("$defs");
  });

  it("lists groups with their parameters, ungrouped last", () => {
    const schema = { ...params(), properties: { loose: { type: "boolean" } }, required: ["loose"] };
    const groups = groupsOf(schema);
    expect(groups.map((group) => group.id)).toEqual(["input_output", "resources", ROOT]);
    expect(groups[2].params).toEqual([{ name: "loose", def: { type: "boolean" }, required: true }]);
    expect(groups[0]).toMatchObject({ title: "Input/output", icon: "fas fa-terminal" });
    expect(groups[0].params.map((param) => [param.name, param.required])).toEqual([
      ["input", true],
      ["outdir", false],
    ]);
  });

  it("ignores definitions that are not groups", () => {
    const schema = { $defs: { a_string: { type: "string" }, group: { properties: {} } } };
    expect(groupsOf(schema).map((group) => group.id)).toEqual(["group", ROOT]);
  });

  it("reads the columns of a samplesheet schema", () => {
    const [columns, ...rest] = groupsOf(samplesheet);
    expect(rest).toEqual([]);
    expect(columns.params).toHaveLength(15);
    expect(columns.params.filter((param) => param.required).map((param) => param.name)).toEqual(["patient", "sample"]);
  });
});

describe("editing groups", () => {
  it("adds a group and references it from allOf", () => {
    const { schema, id } = addGroup(params(), "Reference genome");
    expect(id).toBe("reference_genome");
    expect(schema.$defs[id]).toMatchObject({ title: "Reference genome", type: "object", properties: {} });
    expect(schema.allOf.at(-1)).toEqual({ $ref: "#/$defs/reference_genome" });
    expect(addGroup(schema, "Reference genome").id).toBe("reference_genome_2");
  });

  it("uses the definitions notation of draft-07 schemas", () => {
    const { schema } = addGroup({ $schema: "http://json-schema.org/draft-07/schema" }, "Options");
    expect(schema.definitions.options.title).toBe("Options");
    expect(schema.allOf).toEqual([{ $ref: "#/definitions/options" }]);
  });

  it("renames the key along with the title, in place", () => {
    const { schema, id } = updateGroup(params(), "input_output", { title: "Input options", fa_icon: "" });
    expect(id).toBe("input_options");
    expect(Object.keys(schema.$defs)).toEqual(["input_options", "resources"]);
    expect(schema.$defs.input_options).not.toHaveProperty("fa_icon");
    expect(schema.allOf).toEqual([{ $ref: "#/$defs/input_options" }, { $ref: "#/$defs/resources" }]);
  });

  it("keeps the key when the new title would clash", () => {
    const { schema, id } = updateGroup(params(), "input_output", { title: "Resources" });
    expect(id).toBe("input_output");
    expect(schema.$defs.input_output.title).toBe("Resources");
  });

  it("removes a group but keeps its parameters", () => {
    const schema = removeGroup(params(), "input_output");
    expect(Object.keys(schema.$defs)).toEqual(["resources"]);
    expect(schema.allOf).toEqual([{ $ref: "#/$defs/resources" }]);
    expect(names(schema, ROOT)).toEqual(["input", "outdir"]);
    expect(schema.required).toEqual(["input"]);
  });

  it("reorders groups and allOf together, keeping other allOf entries", () => {
    const start = { ...params(), allOf: [...params().allOf, { required: ["x"] }] };
    const schema = moveGroup(start, "resources", { before: "input_output" });
    expect(Object.keys(schema.$defs)).toEqual(["resources", "input_output"]);
    expect(schema.allOf).toEqual([
      { $ref: "#/$defs/resources" },
      { $ref: "#/$defs/input_output" },
      { required: ["x"] },
    ]);
  });

  it("does not modify its input", () => {
    const original = params();
    removeGroup(original, "resources");
    updateGroup(original, "input_output", { title: "Changed" });
    expect(original).toEqual(params());
  });
});

describe("editing parameters", () => {
  it("adds parameters with unique names", () => {
    const first = addParam(params(), "resources");
    expect(first.name).toBe("new_param");
    const second = addParam(first.schema, ROOT);
    expect(second.name).toBe("new_param_2");
    expect(second.schema.properties.new_param_2).toEqual({ type: "string" });
    expect(addParam(samplesheet, ROOT).name).toBe("new_column");
  });

  it("removes a parameter and its required entry", () => {
    const schema = removeParam(params(), "input_output", "input");
    expect(names(schema, "input_output")).toEqual(["outdir"]);
    expect(schema.$defs.input_output).not.toHaveProperty("required");
  });

  it("renames a parameter in place", () => {
    const schema = renameParam(params(), "input_output", "input", "samplesheet");
    expect(names(schema, "input_output")).toEqual(["samplesheet", "outdir"]);
    expect(schema.$defs.input_output.required).toEqual(["samplesheet"]);
  });

  it("refuses names that are invalid or taken", () => {
    expect(paramNameError(params(), "max_cpus")).toMatch(/already exists/);
    expect(paramNameError(params(), "max_cpus", "max_cpus")).toBeNull();
    expect(paramNameError(params(), "has space")).toMatch(/spaces/);
    expect(paramNameError(params(), "")).toMatch(/required/);
    expect(() => renameParam(params(), "input_output", "input", "max_cpus")).toThrow(/already exists/);
  });

  it("toggles required", () => {
    let schema = setRequired(params(), "resources", "max_cpus", true);
    expect(schema.$defs.resources.required).toEqual(["max_cpus"]);
    schema = setRequired(schema, "resources", "max_cpus", false);
    expect(schema.$defs.resources).not.toHaveProperty("required");
  });

  it("reorders within a group", () => {
    expect(names(moveParam(params(), "input_output", "outdir", "input_output", { before: "input" }), "input_output")).toEqual([
      "outdir",
      "input",
    ]);
  });

  it("moves between groups, taking required along", () => {
    const schema = moveParam(params(), "input_output", "input", "resources", { after: "max_cpus" });
    expect(names(schema, "input_output")).toEqual(["outdir"]);
    expect(names(schema, "resources")).toEqual(["max_cpus", "input"]);
    expect(schema.$defs.input_output).not.toHaveProperty("required");
    expect(schema.$defs.resources.required).toEqual(["input"]);
  });

  it("moves to and from the ungrouped parameters", () => {
    let schema = moveParam(params(), "resources", "max_cpus", ROOT, "end");
    expect(schema.properties).toEqual({ max_cpus: { type: "integer", default: 16, "x-custom": true } });
    schema = moveParam(schema, ROOT, "max_cpus", "input_output", "end");
    expect(schema).not.toHaveProperty("properties");
    expect(names(schema, "input_output")).toEqual(["input", "outdir", "max_cpus"]);
  });

  it("reorders samplesheet columns", () => {
    const schema = moveParam(samplesheet, ROOT, "lane", ROOT, { before: "patient" });
    expect(Object.keys(schema.items.properties).slice(0, 3)).toEqual(["lane", "patient", "sample"]);
    expect(schema.items.required).toEqual(["patient", "sample"]);
  });

  it("replaces a definition, keeping unknown keywords", () => {
    const def = setField(params().$defs.resources.properties.max_cpus, "minimum", 1);
    const schema = updateParam(params(), "resources", "max_cpus", def);
    expect(schema.$defs.resources.properties.max_cpus).toEqual({
      type: "integer",
      default: 16,
      "x-custom": true,
      minimum: 1,
    });
  });

  it("updates top-level keywords", () => {
    const schema = updateMeta(params(), { title: "New title", description: " " });
    expect(schema.title).toBe("New title");
    expect(schema).not.toHaveProperty("description");
  });
});

describe("parameter definitions", () => {
  const fastq = samplesheet.items.properties.fastq_1;

  it("recognises optional pattern-checked columns", () => {
    expect(patternOrEmpty(fastq)).toBe("^\\S+\\.f(ast)?q\\.gz$");
    expect(viewOf(fastq)).toMatchObject({ type: "string", allowEmpty: true, pattern: "^\\S+\\.f(ast)?q\\.gz$" });
    expect(patternOrEmpty({ type: "string", pattern: "a" })).toBeNull();
    expect(patternOrEmpty({ anyOf: [{ type: "string" }, { type: "integer" }] })).toBeNull();
  });

  it("describes types the form cannot edit", () => {
    expect(viewOf({ type: ["string", "integer"] })).toMatchObject({ type: null, typeLabel: "string | integer" });
    expect(viewOf({ anyOf: [{ type: "string" }, { type: "integer" }] })).toMatchObject({
      type: null,
      typeLabel: "anyOf",
    });
    expect(viewOf({})).toMatchObject({ type: null, typeLabel: "any" });
  });

  it("edits the pattern of an optional column in place", () => {
    const next = setPattern(fastq, "^\\S+\\.fq$", true);
    expect(next.anyOf).toEqual([
      { type: "string", pattern: "^\\S+\\.fq$" },
      { type: "string", maxLength: 0 },
    ]);
    expect(next).toMatchObject({ format: "file-path", exists: true, errorMessage: fastq.errorMessage });
    expect(next).not.toHaveProperty("type");
  });

  it("converts between optional and plain patterns", () => {
    const plain = setPattern(fastq, "^a$", false);
    expect(plain).toMatchObject({ type: "string", pattern: "^a$", format: "file-path" });
    expect(plain).not.toHaveProperty("anyOf");
    expect(patternOrEmpty(setPattern(plain, "^a$", true))).toBe("^a$");
    expect(setPattern(fastq, "", true)).toEqual({ type: "string", ...fastq, anyOf: undefined });
  });

  it("drops keywords that do not fit a new type", () => {
    const def = { type: "string", pattern: "^\\d+$", format: "file-path", default: "12", enum: ["12", "13"] };
    expect(setType(def, "integer")).toEqual({ type: "integer", default: 12, enum: [12, 13] });
    expect(setType({ type: "integer", minimum: 1, default: 3 }, "string")).toEqual({ type: "string", default: "3" });
    expect(setType({ type: "string", default: "yes", enum: ["yes"] }, "boolean")).toEqual({ type: "boolean" });
    expect(setType(fastq, "integer")).not.toHaveProperty("anyOf");
  });

  it("drops keywords that do not fit a new format", () => {
    const file = { type: "string", format: "file-path", exists: true, mimetype: "text/csv", schema: "a.json" };
    expect(setFormat(file, "directory-path")).toEqual({ type: "string", format: "directory-path", exists: true });
    expect(setFormat(file, "")).toEqual({ type: "string" });
    expect(setFormat({ type: "string" }, "file-path")).toEqual({ type: "string", format: "file-path" });
  });

  it("keeps an empty top-level properties object that an edit did not empty", () => {
    const schema = { ...params(), properties: {} };
    expect(moveParam(schema, "input_output", "outdir", "resources", "end").properties).toEqual({});
  });

  it("coerces typed-in values", () => {
    expect(coerce("12", "integer")).toBe(12);
    expect(coerce("1.5", "integer")).toBeUndefined();
    expect(coerce("1.5", "number")).toBe(1.5);
    expect(coerce("abc", "number")).toBeUndefined();
    expect(coerce("true", "boolean")).toBe(true);
    expect(coerce("", "string")).toBeUndefined();
    expect(parseList("1, 2, x, 3", "integer")).toEqual([1, 2, 3]);
    expect(parseList(" a , b ,, ")).toEqual(["a", "b"]);
  });

  it("makes keys from titles", () => {
    expect(slugify("Input/output options")).toBe("input_output_options");
    expect(slugify("  --  ")).toBe("");
  });
});

describe("lint", () => {
  it("accepts the example schemas", () => {
    expect(lint(params())).toEqual([]);
    expect(lint(samplesheet).filter((issue) => issue.level === "error")).toEqual([
      // `"default": "1"` on an integer column: a genuine mistake in the example
      { level: "error", message: "The default is not of type integer", groupId: ROOT, param: "status" },
    ]);
  });

  it("finds problems in parameter definitions", () => {
    const messages = (def: object) => lintParam(def).map((issue) => issue.message);
    expect(messages({ type: "string", pattern: "(" })).toEqual(["The pattern is not a valid regular expression"]);
    expect(messages({ type: "string", pattern: "^a", default: "b" })).toEqual(["The default does not match the pattern"]);
    expect(messages({ type: "string", enum: ["a"], default: "b" })).toEqual([
      "The default is not one of the allowed values",
    ]);
    expect(messages({ type: "integer", minimum: 5, maximum: 1, default: 3 })).toEqual([
      "The minimum is larger than the maximum",
      "The default is below the minimum",
      "The default is above the maximum",
    ]);
    expect(messages({ type: "boolean", default: "true" })).toEqual(["The default is not of type boolean"]);
  });

  it("finds duplicate parameters and missing titles", () => {
    const schema = params();
    delete schema.title;
    schema.$defs.resources.properties.input = { type: "string" };
    expect(lint(schema)).toEqual([
      { level: "warning", message: "The schema has no title" },
      expect.objectContaining({ level: "error", groupId: "resources", param: "input" }),
    ]);
  });
});
