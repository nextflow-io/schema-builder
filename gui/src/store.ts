/** Application state: the schema being edited, its undo history and the save status. */

import type { ReactiveController, ReactiveControllerHost } from "lit";
import { fetchSchema, finishEditing, saveSchema } from "./api";
import { errorMessage } from "./dom";
import { type Issue, lint } from "./model/lint";
import { type Group, ROOT, type Schema, type SchemaKind, groupsOf, kindOf } from "./model/schema";

export type Status = "loading" | "welcome" | "editing" | "finished";

const HISTORY_LIMIT = 200;

class Store extends EventTarget {
  status: Status = "loading";
  schema: Schema = {};
  /** File name of the schema, if known. */
  name: string | null = null;
  /** Whether a backend is saving for us. Without one, schemas are opened from and saved to local files. */
  connected = false;

  saving = false;
  saveError: string | null = null;
  savedAt: Date | null = null;

  /** Text typed in the search box. */
  filter = "";
  /** Names of the parameters whose editor is open (names are unique across groups). */
  readonly expanded = new Set<string>();
  /** Ids of the groups that are folded away. */
  readonly collapsedGroups = new Set<string>();
  /** Render keys of parameters and groups, by name or id (see `keyOf`). */
  private readonly keys = new Map<string, number>();
  private nextKey = 0;

  private past: Schema[] = [];
  /** The field being typed into (see `LiveFields`): its commits replace each other in the undo history. */
  private editing: string | null = null;
  private future: Schema[] = [];
  private savedSchema: Schema = {};
  private derivedFrom: Schema | null = null;
  private derived: { kind: SchemaKind; groups: Group[]; issues: Map<string, Issue[]>; allIssues: Issue[] } | null = null;

  private changed(): void {
    this.dispatchEvent(new Event("change"));
  }

  /** Call after the schema changed: forget view state of things that no longer exist, then re-render. */
  private schemaChanged(): void {
    const names = new Set(this.groups.flatMap((group) => group.params.map((param) => param.name)));
    const ids = new Set(this.groups.map((group) => group.id));
    for (const name of this.expanded) if (!names.has(name)) this.expanded.delete(name);
    for (const id of this.collapsedGroups) if (!ids.has(id)) this.collapsedGroups.delete(id);
    for (const key of this.keys.keys()) if (!names.has(key) && !ids.has(key)) this.keys.delete(key);
    this.changed();
  }

  private derive() {
    if (this.derivedFrom !== this.schema || !this.derived) {
      const allIssues = lint(this.schema);
      const issues = new Map<string, Issue[]>();
      for (const issue of allIssues) {
        if (!issue.param) continue;
        const list = issues.get(issue.param) ?? [];
        list.push(issue);
        issues.set(issue.param, list);
      }
      this.derivedFrom = this.schema;
      this.derived = { kind: kindOf(this.schema), groups: groupsOf(this.schema), issues, allIssues };
    }
    return this.derived;
  }

  get kind(): SchemaKind {
    return this.derive().kind;
  }
  get groups(): Group[] {
    return this.derive().groups;
  }
  get issues(): Issue[] {
    return this.derive().allIssues;
  }
  /** The problems found with one parameter. */
  issuesOf(param: string): Issue[] {
    return this.derive().issues.get(param) ?? [];
  }
  /**
   * A key for rendering the parameter or group with this name or id in a list. It survives renames, so renaming
   * keeps the element (and the focus inside it) instead of replacing it.
   */
  keyOf(name: string): number {
    let key = this.keys.get(name);
    if (key === undefined) this.keys.set(name, (key = this.nextKey++));
    return key;
  }
  /** What one entry of this kind of schema is called. */
  get noun(): "parameter" | "column" {
    return this.kind === "samplesheet" ? "column" : "parameter";
  }
  /** The ids of the real groups, in order (without the container for ungrouped parameters). */
  get groupIds(): string[] {
    return this.groups.map((group) => group.id).filter((id) => id !== ROOT);
  }
  get dirty(): boolean {
    return this.schema !== this.savedSchema;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Replace the schema with an edited version, remembering the old one for undo.
   * Pass `renamed` when the edit renamed a parameter or a group, so that it
   * stays open or collapsed under its new name. Commits with the same `edit`
   * key (a field being typed into) are one undo step, until `endEdit`.
   */
  commit(next: Schema, renamed?: { from: string; to: string }, edit?: string): void {
    if (next === this.schema) return;
    if (renamed) {
      for (const set of [this.expanded, this.collapsedGroups]) if (set.delete(renamed.from)) set.add(renamed.to);
      const key = this.keys.get(renamed.from);
      this.keys.delete(renamed.from);
      if (key !== undefined) this.keys.set(renamed.to, key);
    }
    if (!edit || edit !== this.editing) {
      this.past.push(this.schema);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.editing = edit ?? null;
    this.future = [];
    this.schema = next;
    this.schemaChanged();
  }

  /** Finish the undo step of the field being typed into: the next commit is a new step. */
  endEdit(): void {
    this.editing = null;
  }

  undo(): void {
    this.editing = null;
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.schema);
    this.schema = previous;
    this.schemaChanged();
  }

  redo(): void {
    this.editing = null;
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.schema);
    this.schema = next;
    this.schemaChanged();
  }

  /** Change view state (search, open editors, ...) and re-render. */
  view(change: () => void): void {
    change();
    this.changed();
  }

  /** Start editing a schema. */
  open(schema: Schema, name: string | null): void {
    this.schema = this.savedSchema = schema;
    this.name = name;
    this.past = [];
    this.future = [];
    this.editing = null;
    this.expanded.clear();
    this.collapsedGroups.clear();
    this.filter = "";
    this.saveError = null;
    this.savedAt = null;
    this.status = "editing";
    this.changed();
  }

  /** Load the schema from the backend; without a backend, show the welcome screen. */
  async load(): Promise<void> {
    try {
      const { schema, name } = await fetchSchema();
      this.connected = true;
      this.open(schema, name);
    } catch {
      this.status = "welcome";
      this.changed();
    }
  }

  private async send(request: (schema: Schema) => Promise<unknown>): Promise<boolean> {
    if (this.saving) return false;
    const schema = this.schema;
    this.saving = true;
    this.saveError = null;
    this.changed();
    try {
      await request(schema);
      this.savedSchema = schema;
      this.savedAt = new Date();
      return true;
    } catch (error) {
      this.saveError = errorMessage(error);
      return false;
    } finally {
      this.saving = false;
      this.changed();
    }
  }

  /** Save to the backend, or download the schema as a file when there is none. */
  async save(): Promise<boolean> {
    if (!this.connected) return this.send(async (schema) => download(schema, this.name));
    return !this.dirty || this.send(saveSchema);
  }

  /** Save what has changed and tell the backend that editing is done. */
  async finish(): Promise<void> {
    const dirty = this.dirty;
    if (await this.send((schema) => finishEditing(dirty ? schema : undefined))) {
      this.status = "finished";
      this.changed();
    }
  }
}

function download(schema: Schema, name: string | null): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(schema, null, 4) + "\n"], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name ?? "nextflow_schema.json" });
  link.click();
  URL.revokeObjectURL(url);
}

export const store = new Store();

/** Re-render a component whenever the store changes. */
export class StoreController implements ReactiveController {
  private readonly update = () => this.host.requestUpdate();

  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }
  hostConnected(): void {
    store.addEventListener("change", this.update);
  }
  hostDisconnected(): void {
    store.removeEventListener("change", this.update);
  }
}
