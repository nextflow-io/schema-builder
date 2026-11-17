/** Checks for problems the editor can spot while you type. */

import { type ParamDef, type ParamType, type Schema, ROOT, groupsOf, kindOf, viewOf } from "./schema";

export interface Issue {
  level: "error" | "warning";
  message: string;
  /** Where the problem is; absent for problems with the schema as a whole. */
  groupId?: string;
  param?: string;
}

function hasType(value: unknown, type: ParamType): boolean {
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

/** Compile a pattern the way a schema validator would; `null` if it is not valid. */
export function compile(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "u");
  } catch {
    return null;
  }
}

/** Problems with a single parameter definition. */
export function lintParam(def: ParamDef): Pick<Issue, "level" | "message">[] {
  const issues: Pick<Issue, "level" | "message">[] = [];
  const { type, pattern } = viewOf(def);
  const regex = pattern ? compile(pattern) : null;

  if (pattern && !regex) issues.push({ level: "error", message: "The pattern is not a valid regular expression" });

  if (def.default !== undefined && type) {
    if (!hasType(def.default, type)) {
      issues.push({ level: "error", message: `The default is not of type ${type}` });
    } else if (Array.isArray(def.enum) && !def.enum.includes(def.default)) {
      issues.push({ level: "error", message: "The default is not one of the allowed values" });
    } else if (regex && typeof def.default === "string" && def.default && !regex.test(def.default)) {
      issues.push({ level: "error", message: "The default does not match the pattern" });
    }
  }

  if (typeof def.minimum === "number" && typeof def.maximum === "number" && def.minimum > def.maximum) {
    issues.push({ level: "error", message: "The minimum is larger than the maximum" });
  }
  if (typeof def.default === "number") {
    if (typeof def.minimum === "number" && def.default < def.minimum) {
      issues.push({ level: "error", message: "The default is below the minimum" });
    }
    if (typeof def.maximum === "number" && def.default > def.maximum) {
      issues.push({ level: "error", message: "The default is above the maximum" });
    }
  }
  if (regex && Array.isArray(def.enum) && def.enum.some((value) => typeof value === "string" && !regex.test(value))) {
    issues.push({ level: "warning", message: "Some allowed values do not match the pattern" });
  }
  return issues;
}

export function lint(schema: Schema): Issue[] {
  const issues: Issue[] = [];
  const kind = kindOf(schema);
  const groups = groupsOf(schema);

  if (kind === "parameters") {
    for (const keyword of ["title", "description"]) {
      if (!schema[keyword]) issues.push({ level: "warning", message: `The schema has no ${keyword}` });
    }
    const seen = new Map<string, string>();
    for (const group of groups) {
      if (group.id !== ROOT && !group.title) {
        issues.push({ level: "warning", message: "The group has no title", groupId: group.id });
      }
      for (const { name } of group.params) {
        if (seen.has(name)) {
          issues.push({
            level: "error",
            message: "Defined more than once; parameter names must be unique across groups",
            groupId: group.id,
            param: name,
          });
        }
        seen.set(name, group.id);
      }
    }
  }

  for (const group of groups) {
    for (const { name, def } of group.params) {
      for (const issue of lintParam(def)) issues.push({ ...issue, groupId: group.id, param: name });
    }
  }
  return issues;
}
