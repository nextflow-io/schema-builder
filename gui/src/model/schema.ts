/**
 * Pure functions to read and edit Nextflow JSON schemas.
 *
 * Two kinds of schema are supported:
 *  - "parameters": a pipeline `nextflow_schema.json`. Parameters live in groups
 *    under `$defs` (nf-schema) or `definitions` (nf-validation), which are pulled
 *    in through `allOf`, and/or directly under the top-level `properties`.
 *  - "samplesheet": e.g. `assets/schema_input.json`. An array whose `items`
 *    describe the columns of a samplesheet.
 *
 * Every edit returns a new schema and leaves its input untouched. Keywords the
 * editor does not know about are always preserved.
 */

export type JsonObject = Record<string, any>;
export type Schema = JsonObject;
export type ParamDef = JsonObject;
export type SchemaKind = "parameters" | "samplesheet";

/** Id of the container for parameters outside any group (or the samplesheet columns). */
export const ROOT = "#root";

export interface Param {
  name: string;
  def: ParamDef;
  required: boolean;
}

export interface Group {
  /** `ROOT`, or the key of the group in `$defs` / `definitions`. */
  id: string;
  title: string;
  description: string;
  icon: string;
  params: Param[];
}

export const PARAM_TYPES = ["string", "integer", "number", "boolean"] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

export const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Where to put something that is being moved, relative to its new siblings. */
export type Position = { before: string } | { after: string } | "end";

const clone = <T>(value: T): T => structuredClone(value);

export function kindOf(schema: Schema): SchemaKind {
  return schema.type === "array" || isObject(schema.items) ? "samplesheet" : "parameters";
}

/** The keyword holding the groups: an existing one, else the one matching the schema draft. */
export function defsKey(schema: Schema): "$defs" | "definitions" {
  if (isObject(schema.$defs)) return "$defs";
  if (isObject(schema.definitions)) return "definitions";
  return /draft-0[467]/.test(String(schema.$schema ?? "")) ? "definitions" : "$defs";
}

function isGroup(def: unknown): def is JsonObject {
  return isObject(def) && (def.type === "object" || isObject(def.properties));
}

/** The object that holds `properties` and `required` for a group. */
function container(schema: Schema, groupId: string): JsonObject | undefined {
  if (groupId === ROOT) {
    return kindOf(schema) === "samplesheet" ? (isObject(schema.items) ? schema.items : undefined) : schema;
  }
  const def = schema[defsKey(schema)]?.[groupId];
  return isGroup(def) ? def : undefined;
}

function requireContainer(schema: Schema, groupId: string): JsonObject {
  const found = container(schema, groupId);
  if (!found) throw new Error(`Unknown group: ${groupId}`);
  return found;
}

function paramsOf(holder: JsonObject | undefined): Param[] {
  if (!holder || !isObject(holder.properties)) return [];
  const required = new Set<string>(Array.isArray(holder.required) ? holder.required : []);
  return Object.entries(holder.properties)
    .filter(([, def]) => isObject(def))
    .map(([name, def]) => ({ name, def: def as ParamDef, required: required.has(name) }));
}

/**
 * The groups of a schema, in display order. The last entry is always the
 * `ROOT` container: ungrouped parameters, or the columns of a samplesheet.
 */
export function groupsOf(schema: Schema): Group[] {
  const root: Group = { id: ROOT, title: "", description: "", icon: "", params: paramsOf(container(schema, ROOT)) };
  if (kindOf(schema) === "samplesheet") return [root];

  const defs = schema[defsKey(schema)];
  const groups = Object.entries(isObject(defs) ? defs : {})
    .filter(([, def]) => isGroup(def))
    .map(([id, def]) => ({
      id,
      title: typeof def.title === "string" ? def.title : "",
      description: typeof def.description === "string" ? def.description : "",
      icon: typeof def.fa_icon === "string" ? def.fa_icon : "",
      params: paramsOf(def),
    }));
  return [...groups, root];
}

export function paramNames(schema: Schema): string[] {
  return groupsOf(schema).flatMap((group) => group.params.map((param) => param.name));
}

/** Turn a title into a key, e.g. "Input/output options" -> "input_output_options". */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let counter = 2;
  while (used.has(`${base}_${counter}`)) counter++;
  return `${base}_${counter}`;
}

/** Rebuild an object with one key renamed, keeping the order of its keys. */
function renameKey(object: JsonObject, from: string, to: string): JsonObject {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key === from ? to : key, value]));
}

function insert(object: JsonObject, key: string, value: unknown, position: Position): JsonObject {
  const entries = Object.entries(object).filter(([existing]) => existing !== key);
  const anchor = position === "end" ? undefined : "before" in position ? position.before : position.after;
  const found = entries.findIndex(([existing]) => existing === anchor);
  const index = found < 0 ? entries.length : found + (position !== "end" && "after" in position ? 1 : 0);
  entries.splice(index, 0, [key, value]);
  return Object.fromEntries(entries);
}

/** Don't leave an empty top-level `properties` behind once every parameter is in a group. */
function pruneRoot(schema: Schema): void {
  if (kindOf(schema) === "parameters" && isObject(schema.properties) && Object.keys(schema.properties).length === 0) {
    delete schema.properties;
  }
}

function setRequiredIn(holder: JsonObject, name: string, required: boolean): void {
  const current: string[] = Array.isArray(holder.required) ? holder.required : [];
  const next = current.filter((entry) => entry !== name);
  if (required) next.push(name);
  if (next.length) holder.required = next;
  else delete holder.required;
}

/** Keep `allOf` listing every group, in the same order as the groups themselves. */
function syncAllOf(schema: Schema): void {
  const key = defsKey(schema);
  const prefix = `#/${key}/`;
  const defs = isObject(schema[key]) ? schema[key] : {};
  const groupIds = Object.keys(defs).filter((id) => isGroup(defs[id]));
  const others = (Array.isArray(schema.allOf) ? schema.allOf : []).filter(
    (entry: unknown) => !(isObject(entry) && typeof entry.$ref === "string" && entry.$ref.startsWith(prefix)),
  );
  const allOf = [...groupIds.map((id) => ({ $ref: prefix + id })), ...others];
  if (allOf.length) schema.allOf = allOf;
  else delete schema.allOf;
}

// ---------------------------------------------------------------------------
// Schema-level edits
// ---------------------------------------------------------------------------

/** Set top-level keywords such as `title`; empty values remove the keyword. */
export function updateMeta(schema: Schema, patch: Record<string, string>): Schema {
  const next = clone(schema);
  for (const [key, value] of Object.entries(patch)) {
    if (value.trim()) next[key] = value;
    else delete next[key];
  }
  return next;
}

// ---------------------------------------------------------------------------
// Group edits (parameter schemas only)
// ---------------------------------------------------------------------------

export function addGroup(schema: Schema, title = "New group"): { schema: Schema; id: string } {
  const next = clone(schema);
  const key = defsKey(next);
  const defs: JsonObject = isObject(next[key]) ? next[key] : {};
  const id = uniqueName(slugify(title) || "group", Object.keys(defs));
  defs[id] = { title, type: "object", description: "", properties: {} };
  next[key] = defs;
  syncAllOf(next);
  return { schema: next, id };
}

/** Change a group's title, description or icon. A new title also renames the group's key. */
export function updateGroup(
  schema: Schema,
  groupId: string,
  patch: { title?: string; description?: string; fa_icon?: string },
): { schema: Schema; id: string } {
  const next = clone(schema);
  const group = requireContainer(next, groupId);
  if (patch.title !== undefined) group.title = patch.title;
  if (patch.description !== undefined) group.description = patch.description;
  if (patch.fa_icon !== undefined) {
    if (patch.fa_icon) group.fa_icon = patch.fa_icon;
    else delete group.fa_icon;
  }

  let id = groupId;
  const key = defsKey(next);
  const slug = patch.title === undefined ? "" : slugify(patch.title);
  if (slug && slug !== groupId && !(slug in next[key])) {
    next[key] = renameKey(next[key], groupId, slug);
    id = slug;
  }
  syncAllOf(next);
  return { schema: next, id };
}

/** Delete a group. Its parameters are kept, as ungrouped parameters. */
export function removeGroup(schema: Schema, groupId: string): Schema {
  const next = clone(schema);
  const group = requireContainer(next, groupId);
  for (const param of paramsOf(group)) {
    next.properties = { ...(isObject(next.properties) ? next.properties : {}), [param.name]: param.def };
    if (param.required) setRequiredIn(next, param.name, true);
  }
  delete next[defsKey(next)][groupId];
  syncAllOf(next);
  return next;
}

export function moveGroup(schema: Schema, groupId: string, position: Position): Schema {
  const next = clone(schema);
  const key = defsKey(next);
  requireContainer(next, groupId);
  const defs: JsonObject = next[key];
  const groups = Object.fromEntries(Object.entries(defs).filter(([, def]) => isGroup(def)));
  const others = Object.fromEntries(Object.entries(defs).filter(([, def]) => !isGroup(def)));
  next[key] = { ...insert(groups, groupId, defs[groupId], position), ...others };
  syncAllOf(next);
  return next;
}

// ---------------------------------------------------------------------------
// Parameter edits
// ---------------------------------------------------------------------------

export function addParam(schema: Schema, groupId: string, baseName?: string): { schema: Schema; name: string } {
  const next = clone(schema);
  const holder = requireContainer(next, groupId);
  const fallback = kindOf(next) === "samplesheet" ? "new_column" : "new_param";
  const name = uniqueName(baseName || fallback, paramNames(next));
  holder.properties = { ...(isObject(holder.properties) ? holder.properties : {}), [name]: { type: "string" } };
  return { schema: next, name };
}

export function removeParam(schema: Schema, groupId: string, name: string): Schema {
  const next = clone(schema);
  const holder = requireContainer(next, groupId);
  delete holder.properties?.[name];
  setRequiredIn(holder, name, false);
  if (groupId === ROOT) pruneRoot(next);
  return next;
}

/** Replace the definition of a parameter. */
export function updateParam(schema: Schema, groupId: string, name: string, def: ParamDef): Schema {
  const next = clone(schema);
  const holder = requireContainer(next, groupId);
  if (!isObject(holder.properties) || !(name in holder.properties)) throw new Error(`Unknown parameter: ${name}`);
  holder.properties[name] = clone(def);
  return next;
}

/** Why `name` cannot be used for a parameter, or `null` if it can. */
export function paramNameError(schema: Schema, name: string, current?: string): string | null {
  if (!name) return "A name is required";
  if (/\s/.test(name)) return "Names cannot contain spaces";
  if (name !== current && paramNames(schema).includes(name)) return `"${name}" already exists`;
  return null;
}

export function renameParam(schema: Schema, groupId: string, from: string, to: string): Schema {
  if (from === to) return schema;
  const error = paramNameError(schema, to, from);
  if (error) throw new Error(error);
  const next = clone(schema);
  const holder = requireContainer(next, groupId);
  holder.properties = renameKey(holder.properties, from, to);
  if (Array.isArray(holder.required)) {
    holder.required = holder.required.map((entry: string) => (entry === from ? to : entry));
  }
  return next;
}

export function setRequired(schema: Schema, groupId: string, name: string, required: boolean): Schema {
  const next = clone(schema);
  setRequiredIn(requireContainer(next, groupId), name, required);
  return next;
}

/** Move a parameter within its group or to another one. */
export function moveParam(
  schema: Schema,
  fromGroup: string,
  name: string,
  toGroup: string,
  position: Position,
): Schema {
  const next = clone(schema);
  const source = requireContainer(next, fromGroup);
  const target = requireContainer(next, toGroup);
  const def = source.properties?.[name];
  if (!isObject(def)) throw new Error(`Unknown parameter: ${name}`);
  const required = Array.isArray(source.required) && source.required.includes(name);

  delete source.properties[name];
  setRequiredIn(source, name, false);
  target.properties = insert(isObject(target.properties) ? target.properties : {}, name, def, position);
  if (required) setRequiredIn(target, name, true);
  if (fromGroup === ROOT) pruneRoot(next);
  return next;
}

// ---------------------------------------------------------------------------
// Parameter definitions
// ---------------------------------------------------------------------------

/**
 * Samplesheet schemas often write an optional, pattern-checked column as
 *   { "anyOf": [{ "type": "string", "pattern": "..." }, { "type": "string", "maxLength": 0 }] }
 * This returns the pattern of such a definition, or `null` if `def` is something else.
 */
export function patternOrEmpty(def: ParamDef): string | null {
  if (def.type !== undefined || !Array.isArray(def.anyOf) || def.anyOf.length !== 2) return null;
  const isEmpty = (branch: unknown) =>
    isObject(branch) && branch.type === "string" && branch.maxLength === 0 && Object.keys(branch).length === 2;
  const isPattern = (branch: unknown) =>
    isObject(branch) &&
    branch.type === "string" &&
    typeof branch.pattern === "string" &&
    Object.keys(branch).length === 2;
  const [first, second] = def.anyOf;
  if (isPattern(first) && isEmpty(second)) return first.pattern;
  if (isEmpty(first) && isPattern(second)) return second.pattern;
  return null;
}

export interface ParamView {
  /** A simple type the form can edit, or `null` for anything more complex (edit those as JSON). */
  type: ParamType | null;
  /** Short description of the type, for display. */
  typeLabel: string;
  pattern: string;
  /** Whether the value may be empty even though a pattern is set (see `patternOrEmpty`). */
  allowEmpty: boolean;
}

export function viewOf(def: ParamDef): ParamView {
  const optionalPattern = patternOrEmpty(def);
  if (optionalPattern !== null) {
    return { type: "string", typeLabel: "string", pattern: optionalPattern, allowEmpty: true };
  }
  const pattern = typeof def.pattern === "string" ? def.pattern : "";
  if ((PARAM_TYPES as readonly unknown[]).includes(def.type)) {
    return { type: def.type, typeLabel: def.type, pattern, allowEmpty: false };
  }
  const typeLabel = Array.isArray(def.type)
    ? def.type.join("|")
    : typeof def.type === "string"
      ? def.type
      : (["anyOf", "oneOf", "allOf", "$ref"].find((keyword) => keyword in def) ?? "any");
  return { type: null, typeLabel, pattern, allowEmpty: false };
}

/** Set one keyword of a definition. `undefined`, `""` and `[]` remove it. */
export function setField(def: ParamDef, key: string, value: unknown): ParamDef {
  const next = clone(def);
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
  else next[key] = value;
  return next;
}

/** Set the pattern of a string parameter, and whether empty values are accepted despite it. */
export function setPattern(def: ParamDef, pattern: string, allowEmpty: boolean): ParamDef {
  const next = clone(def);
  if (patternOrEmpty(next) !== null) delete next.anyOf;
  delete next.pattern;
  if (pattern && allowEmpty) {
    delete next.type;
    // Keep the keyword where `type` used to be, so the file changes as little as possible
    return { anyOf: [{ type: "string", pattern }, { type: "string", maxLength: 0 }], ...next };
  }
  const typed: ParamDef = { type: "string", ...next };
  if (pattern) typed.pattern = pattern;
  return typed;
}

/** Convert a value typed into a text field to the given type; `undefined` if it does not fit. */
export function coerce(value: unknown, type: ParamType): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  switch (type) {
    case "string":
      return String(value);
    case "boolean":
      if (typeof value === "boolean") return value;
      return value === "true" ? true : value === "false" ? false : undefined;
    case "integer":
    case "number": {
      const number = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isFinite(number) || typeof value === "boolean") return undefined;
      return type === "integer" && !Number.isInteger(number) ? undefined : number;
    }
  }
}

const STRING_KEYWORDS = ["pattern", "format", "mimetype", "exists", "schema", "minLength", "maxLength"];
const NUMBER_KEYWORDS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"];

/** Change the type of a parameter, dropping keywords and values that no longer apply. */
export function setType(def: ParamDef, type: ParamType): ParamDef {
  const { type: _oldType, ...rest } = clone(def);
  if (patternOrEmpty(def) !== null) delete rest.anyOf;
  const next: ParamDef = { type, ...rest };
  if (type !== "string") STRING_KEYWORDS.forEach((keyword) => delete next[keyword]);
  if (type !== "integer" && type !== "number") NUMBER_KEYWORDS.forEach((keyword) => delete next[keyword]);

  if ("default" in next) {
    const value = coerce(next.default, type);
    if (value === undefined) delete next.default;
    else next.default = value;
  }
  if (Array.isArray(next.enum)) {
    const values = type === "boolean" ? [] : next.enum.map((value) => coerce(value, type));
    if (values.length && values.every((value) => value !== undefined)) next.enum = values;
    else delete next.enum;
  }
  return next;
}

export const PATH_FORMATS = ["file-path", "directory-path", "path", "file-path-pattern"];
/** Keywords that only mean something for some formats. */
const FORMAT_KEYWORDS: Record<string, string[]> = {
  exists: PATH_FORMATS,
  mimetype: ["file-path"],
  schema: ["file-path"],
};

/** Whether a keyword such as `mimetype` applies to a string with the given format. */
export const formatAllows = (format: string, keyword: string): boolean => FORMAT_KEYWORDS[keyword]?.includes(format) ?? true;

/** Change the format of a string parameter, dropping keywords that no longer apply. */
export function setFormat(def: ParamDef, format: string): ParamDef {
  const next = setField(def, "format", format);
  for (const keyword of Object.keys(FORMAT_KEYWORDS)) if (!formatAllows(format, keyword)) delete next[keyword];
  return next;
}

/** Parse JSON text that must hold an object. */
export function parseJsonObject(text: string): JsonObject {
  const value: unknown = JSON.parse(text);
  if (!isObject(value)) throw new Error("Expected a JSON object");
  return value;
}

/** Parse a comma-separated list typed by the user into values of the given type. */
export function parseList(text: string, type: ParamType = "string"): unknown[] {
  return text
    .split(",")
    .map((item) => coerce(item.trim(), type))
    .filter((item) => item !== undefined);
}
