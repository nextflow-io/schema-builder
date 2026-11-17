import { LitElement, type TemplateResult, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { dropEdge, endDrag, listenForDrops, startDrag } from "../dnd";
import { errorMessage, inputValue } from "../dom";
import { renderMarkdown } from "../markdown";
import {
  PARAM_TYPES,
  type Param,
  type ParamDef,
  type ParamType,
  type ParamView,
  PATH_FORMATS,
  type Position,
  ROOT,
  coerce,
  formatAllows,
  moveParam,
  paramNameError,
  parseJsonObject,
  parseList,
  removeParam,
  renameParam,
  setField,
  setFormat,
  setPattern,
  setRequired,
  setType,
  updateParam,
  viewOf,
} from "../model/schema";
import { StoreController, store } from "../store";
import { shared } from "../styles/shared";
import "./nfsb-icon";
import "./nfsb-icon-picker";
import "./nfsb-regex-tester";

const FORMATS = [...PATH_FORMATS, "email", "uri", "date", "date-time"];

/** One parameter (or samplesheet column): a summary row that opens into an editor. */
@customElement("nfsb-param")
export class NfsbParam extends LitElement {
  static styles = [
    shared,
    css`
      :host {
        display: block;
        position: relative;
      }
      .param {
        border: 1px solid var(--bs-border-color);
        border-radius: var(--bs-border-radius);
        background: var(--nfsb-surface);
      }
      .param.open {
        border-color: var(--bs-primary);
        box-shadow: 0 0 0 0.15rem rgba(var(--bs-primary-rgb), 0.15);
      }
      .row {
        display: flex;
        align-items: stretch;
      }
      .grip {
        display: flex;
        align-items: center;
        padding: 0 0.35rem 0 0.5rem;
      }
      .summary {
        flex: 1;
        min-width: 0;
        justify-content: flex-start;
        gap: 0.6rem;
        padding: 0.5rem 0.75rem 0.5rem 0.25rem;
        font-weight: 400;
        text-align: left;
      }
      .summary .icon {
        color: var(--bs-secondary-color);
      }
      .name {
        padding: 0.1rem 0.4rem;
        font-family: var(--bs-font-monospace);
        font-size: 0.875em;
        color: var(--bs-body-color);
        background: var(--bs-tertiary-bg);
        border: 1px solid var(--bs-border-color);
        border-radius: var(--bs-border-radius);
      }
      .type {
        font-family: var(--bs-font-monospace);
        font-size: 0.8125em;
        color: var(--bs-secondary-color);
      }
      .description {
        flex: 1;
        min-width: 0;
      }
      .chevron {
        font-size: 0.75em;
        color: var(--bs-secondary-color);
      }

      .editor {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
        gap: 0.9rem 1rem;
        padding: 1rem;
        border-top: 1px solid var(--bs-border-color);
      }
      .wide {
        grid-column: 1 / -1;
      }
      .checks {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 1.25rem;
        padding-top: 1.45rem;
      }
      .issues {
        list-style: none;
      }
      .issues .warning {
        color: var(--bs-warning-text-emphasis);
      }
      .preview {
        margin-top: 0.4rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        border-left: 3px solid var(--bs-border-color);
        background: var(--bs-tertiary-bg);
      }
      .preview > :first-child {
        margin-top: 0;
      }
      .preview > :last-child {
        margin-bottom: 0;
      }
      .preview a {
        color: var(--bs-primary-text-emphasis);
      }
      .preview code {
        font-family: var(--bs-font-monospace);
        font-size: 0.9em;
      }
      textarea.json {
        min-height: 14rem;
        font-family: var(--bs-font-monospace);
        font-size: 0.8125rem;
        white-space: pre;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--bs-border-color);
      }
      .actions .form-select {
        width: auto;
        padding-top: 0.2rem;
        padding-bottom: 0.2rem;
        font-size: 0.875em;
      }
      .spacer {
        flex: 1;
      }
    `,
  ];

  @property() groupId = ROOT;
  @property({ attribute: false }) param!: Param;
  /** Where a dragged parameter would be dropped, shown as a line. */
  @property({ reflect: true }) drop: "before" | "after" | null = null;

  @state() private jsonMode = false;
  @state() private jsonError: string | null = null;
  @state() private nameError: string | null = null;
  @state() private picking = false;

  constructor() {
    super();
    new StoreController(this);
    listenForDrops(this, {
      over: (event, item) => {
        if (item.type !== "param" || item.name === this.param.name) return false;
        this.drop = dropEdge(event, this);
        return true;
      },
      leave: () => (this.drop = null),
      drop: (event, item) => {
        if (item.type !== "param") return;
        const position = dropEdge(event, this) === "before" ? { before: this.param.name } : { after: this.param.name };
        store.commit(moveParam(store.schema, item.groupId, item.name, this.groupId, position));
      },
    });
  }

  // -- editing ---------------------------------------------------------------

  private commit(def: ParamDef): void {
    store.commit(updateParam(store.schema, this.groupId, this.param.name, def));
  }

  private set(key: string, value: unknown): void {
    this.commit(setField(this.param.def, key, value));
  }

  private rename(event: Event): void {
    const from = this.param.name;
    const to = inputValue(event).trim();
    this.nameError = paramNameError(store.schema, to, from);
    if (this.nameError || to === from) return;
    store.commit(renameParam(store.schema, this.groupId, from, to), { from, to });
  }

  private applyJson(event: Event): void {
    try {
      const def = parseJsonObject(inputValue(event));
      this.jsonError = null;
      this.commit(def);
    } catch (error) {
      this.jsonError = errorMessage(error);
    }
  }

  private move(toGroup: string, position: Position): void {
    store.commit(moveParam(store.schema, this.groupId, this.param.name, toGroup, position));
  }

  // -- rendering -------------------------------------------------------------

  render() {
    const { name, def, required } = this.param;
    const view = viewOf(def);
    const open = store.expanded.has(name);
    const issues = store.issuesOf(name);
    const hasError = issues.some((issue) => issue.level === "error");

    return html`
      <div class="param ${open ? "open" : ""}">
        <div class="row">
          <span
            class="grip"
            draggable="true"
            title="Drag to reorder${store.kind === "parameters" ? " or move to another group" : ""}"
            @dragstart=${(event: DragEvent) =>
              startDrag(event, { type: "param", groupId: this.groupId, name }, this.renderRoot.querySelector(".param"))}
            @dragend=${endDrag}
          >
            <nfsb-icon name="grip-vertical"></nfsb-icon>
          </span>
          <button
            class="btn summary"
            aria-expanded=${open}
            @click=${() => store.view(() => (open ? store.expanded.delete(name) : store.expanded.add(name)))}
          >
            ${store.kind === "parameters"
              ? html`<nfsb-icon class="icon" name=${def.fa_icon || "far fa-circle"}></nfsb-icon>`
              : nothing}
            <code class="name">${store.kind === "parameters" ? "--" : ""}${name}</code>
            <span class="description text-truncate">${def.description ?? ""}</span>
            ${required ? html`<span class="badge badge-warning">required</span>` : nothing}
            ${def.hidden ? html`<span class="badge">hidden</span>` : nothing}
            ${Array.isArray(def.meta) ? html`<span class="badge badge-info">meta</span>` : nothing}
            <span class="type">${view.typeLabel}</span>
            ${issues.length
              ? html`<nfsb-icon
                  class=${hasError ? "text-danger" : "text-warning"}
                  name="triangle-exclamation"
                  title=${issues.map((issue) => issue.message).join("\n")}
                ></nfsb-icon>`
              : nothing}
            <nfsb-icon class="chevron" name=${open ? "chevron-up" : "chevron-down"}></nfsb-icon>
          </button>
        </div>
        ${open
          ? html`<div class="editor">
              ${issues.length
                ? html`<ul class="alert alert-danger issues wide">
                    ${issues.map((issue) => html`<li class=${issue.level}>${issue.message}</li>`)}
                  </ul>`
                : nothing}
              ${this.jsonMode ? this.renderJson() : this.renderForm(view)} ${this.renderActions()}
            </div>`
          : nothing}
      </div>
      ${this.picking
        ? html`<nfsb-icon-picker
            .value=${def.fa_icon ?? ""}
            @pick=${(event: CustomEvent<string>) => this.set("fa_icon", event.detail)}
            @close=${() => (this.picking = false)}
          ></nfsb-icon-picker>`
        : nothing}
    `;
  }

  private text(label: string, key: string, options: { placeholder?: string; hint?: string; mono?: boolean } = {}) {
    return html`<label>
      <span class="form-label">${label}</span>
      <input
        class="form-control ${options.mono ? "font-monospace" : ""}"
        placeholder=${options.placeholder ?? ""}
        .value=${String(this.param.def[key] ?? "")}
        @change=${(event: Event) => this.set(key, inputValue(event).trim())}
      />
      ${options.hint ? html`<div class="form-text">${options.hint}</div>` : nothing}
    </label>`;
  }

  private check(label: string, checked: boolean, onChange: (checked: boolean) => void, title = "") {
    return html`<label class="form-check" title=${title}>
      <input
        class="form-check-input"
        type="checkbox"
        .checked=${checked}
        @change=${(event: Event) => onChange((event.target as HTMLInputElement).checked)}
      />
      ${label}
    </label>`;
  }

  private renderForm(view: ParamView): TemplateResult {
    const { name, def, required } = this.param;
    const noun = store.noun;
    const isParams = store.kind === "parameters";
    return html`
      <label>
        <span class="form-label">Name</span>
        <input
          class="form-control font-monospace ${this.nameError ? "is-invalid" : ""}"
          .value=${name}
          @change=${this.rename}
        />
        ${this.nameError ? html`<div class="invalid-feedback">${this.nameError}</div>` : nothing}
      </label>
      <label>
        <span class="form-label">Type</span>
        <select
          class="form-select"
          @change=${(event: Event) => this.commit(setType(def, inputValue(event) as ParamType))}
        >
          ${view.type === null ? html`<option selected disabled>${view.typeLabel}</option>` : nothing}
          ${PARAM_TYPES.map((type) => html`<option value=${type} ?selected=${type === view.type}>${type}</option>`)}
        </select>
      </label>
      <div class="checks">
        ${this.check("Required", required, (checked) =>
          store.commit(setRequired(store.schema, this.groupId, name, checked)),
        )}
        ${isParams
          ? this.check(
              "Hidden",
              def.hidden === true,
              (checked) => this.set("hidden", checked || undefined),
              "Hidden parameters are left out of the help text and documentation unless asked for",
            )
          : nothing}
        ${isParams
          ? html`<button class="btn btn-sm btn-outline-secondary" @click=${() => (this.picking = true)}>
              ${def.fa_icon ? html`<nfsb-icon name=${def.fa_icon}></nfsb-icon>` : nothing}
              ${def.fa_icon ? "Change icon" : "Choose icon"}
            </button>`
          : nothing}
      </div>

      <div class="wide">
        ${this.text("Description", "description", { placeholder: `A short description of this ${noun}` })}
      </div>
      ${isParams
        ? html`<label class="wide">
            <span class="form-label">Help text</span>
            <textarea
              class="form-control"
              placeholder="Longer help, shown on request. Markdown is supported."
              .value=${def.help_text ?? ""}
              @change=${(event: Event) => this.set("help_text", inputValue(event).trim())}
            ></textarea>
            ${def.help_text
              ? html`<div class="preview">${unsafeHTML(renderMarkdown(String(def.help_text)))}</div>`
              : nothing}
          </label>`
        : nothing}
      ${view.type === null
        ? html`<div class="alert alert-info wide">
            This ${noun} has a type the form cannot edit (<code>${view.typeLabel}</code>). Use “Edit as JSON” below to
            change its constraints, or pick a simple type above to replace them.
          </div>`
        : this.renderConstraints(view.type, view)}
      <div class="wide">
        ${this.text("Error message", "errorMessage", { placeholder: "Shown when a value is not valid" })}
      </div>
      ${isParams ? nothing : this.renderSamplesheetFields()}
    `;
  }

  private renderConstraints(type: ParamType, view: ParamView): TemplateResult {
    const { def } = this.param;
    const isNumber = type === "integer" || type === "number";
    const options: unknown[] | null = type === "boolean" ? [true, false] : Array.isArray(def.enum) ? def.enum : null;
    const number = (label: string, key: string) =>
      html`<label>
        <span class="form-label">${label}</span>
        <input
          class="form-control"
          type="number"
          step=${type === "integer" ? "1" : "any"}
          .value=${String(def[key] ?? "")}
          @change=${(event: Event) => this.set(key, coerce(inputValue(event), type))}
        />
      </label>`;

    return html`
      <label>
        <span class="form-label">Default</span>
        ${options
          ? html`<select
              class="form-select"
              @change=${(event: Event) =>
                this.set(
                  "default",
                  options.find((option) => String(option) === inputValue(event)),
                )}
            >
              <option value="">No default</option>
              ${options.map(
                (option) => html`<option ?selected=${option === def.default}>${String(option)}</option>`,
              )}
            </select>`
          : html`<input
              class="form-control"
              type=${isNumber ? "number" : "text"}
              step=${type === "integer" ? "1" : "any"}
              placeholder="No default"
              .value=${String(def.default ?? "")}
              @change=${(event: Event) => this.set("default", coerce(inputValue(event), type))}
            />`}
      </label>
      ${type === "boolean"
        ? nothing
        : html`<label>
            <span class="form-label">Allowed values</span>
            <input
              class="form-control"
              placeholder="Any value"
              .value=${Array.isArray(def.enum) ? def.enum.join(", ") : ""}
              @change=${(event: Event) => this.set("enum", parseList(inputValue(event), type))}
            />
            <div class="form-text">Separate values with commas</div>
          </label>`}
      ${isNumber ? html`${number("Minimum", "minimum")} ${number("Maximum", "maximum")}` : nothing}
      ${type === "string" ? this.renderStringFields(view) : nothing}
    `;
  }

  private renderStringFields(view: ParamView): TemplateResult {
    const { def } = this.param;
    const format = typeof def.format === "string" ? def.format : "";
    return html`
      <label>
        <span class="form-label">Format</span>
        <select class="form-select" @change=${(event: Event) => this.commit(setFormat(def, inputValue(event)))}>
          <option value="">Plain text</option>
          ${[...new Set([...FORMATS, ...(format ? [format] : [])])].map(
            (option) => html`<option ?selected=${option === format}>${option}</option>`,
          )}
        </select>
      </label>
      ${format && formatAllows(format, "exists")
        ? html`<div class="checks">
            ${this.check(
              "Must exist",
              def.exists === true,
              (checked) => this.set("exists", checked || undefined),
              "Fail validation if the path does not exist",
            )}
          </div>`
        : nothing}
      ${format && formatAllows(format, "mimetype")
        ? html`${this.text("MIME type", "mimetype", { placeholder: "e.g. text/csv" })}
          ${this.text("Samplesheet schema", "schema", {
            placeholder: "e.g. assets/schema_input.json",
            hint: "Validate the contents of the file with this schema",
            mono: true,
          })}`
        : nothing}
      <div class="wide">
        <label>
          <span class="form-label">Pattern</span>
          <input
            class="form-control font-monospace"
            placeholder="Regular expression the value must match, e.g. ^\\S+\\.csv$"
            .value=${view.pattern}
            @change=${(event: Event) => this.commit(setPattern(def, inputValue(event).trim(), view.allowEmpty))}
          />
        </label>
        ${view.pattern
          ? html`<nfsb-regex-tester .pattern=${view.pattern}></nfsb-regex-tester>
              <div class="form-text">
                ${this.check(
                  "Also accept an empty value",
                  view.allowEmpty,
                  (checked) => this.commit(setPattern(def, view.pattern, checked)),
                  "For optional values: written as anyOf [pattern, empty string] in the schema",
                )}
              </div>`
          : nothing}
      </div>
    `;
  }

  private renderSamplesheetFields(): TemplateResult {
    const { def } = this.param;
    const uniqueWith: string[] = Array.isArray(def.unique) ? def.unique : [];
    return html`
      <label>
        <span class="form-label">Meta map keys</span>
        <input
          class="form-control font-monospace"
          placeholder="Not added to the meta map"
          .value=${Array.isArray(def.meta) ? def.meta.join(", ") : ""}
          @change=${(event: Event) => this.set("meta", parseList(inputValue(event)))}
        />
        <div class="form-text">Store this column in the sample's meta map under these keys</div>
      </label>
      <div>
        <div class="checks">
          ${this.check("Values must be unique", Boolean(def.unique), (checked) =>
            this.set("unique", checked || undefined),
          )}
        </div>
        ${def.unique
          ? html`<input
                class="form-control font-monospace"
                aria-label="Columns this column must be unique in combination with"
                placeholder="On its own"
                .value=${uniqueWith.join(", ")}
                @change=${(event: Event) => {
                  const columns = parseList(inputValue(event));
                  this.set("unique", columns.length ? columns : true);
                }}
              />
              <div class="form-text">…or only in combination with these columns</div>`
          : nothing}
      </div>
    `;
  }

  private renderJson(): TemplateResult {
    return html`<label class="wide">
      <span class="form-label">Definition of <code>${this.param.name}</code> as JSON</span>
      <textarea
        class="form-control json ${this.jsonError ? "is-invalid" : ""}"
        spellcheck="false"
        .value=${JSON.stringify(this.param.def, null, 2)}
        @change=${this.applyJson}
      ></textarea>
      ${this.jsonError
        ? html`<div class="invalid-feedback">Not applied: ${this.jsonError}</div>`
        : html`<div class="form-text">Changes are applied when you leave the field.</div>`}
    </label>`;
  }

  private renderActions(): TemplateResult {
    const { name } = this.param;
    const siblings = store.groups.find((group) => group.id === this.groupId)?.params.map((param) => param.name) ?? [];
    const index = siblings.indexOf(name);
    const otherGroups = store.groups.filter((group) => group.id !== this.groupId);
    return html`<div class="actions wide">
      <button
        class="btn btn-sm btn-outline-secondary"
        ?disabled=${index <= 0}
        @click=${() => this.move(this.groupId, { before: siblings[index - 1] })}
      >
        <nfsb-icon name="arrow-up"></nfsb-icon> Move up
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        ?disabled=${index === siblings.length - 1}
        @click=${() => this.move(this.groupId, { after: siblings[index + 1] })}
      >
        <nfsb-icon name="arrow-down"></nfsb-icon> Move down
      </button>
      ${store.kind === "parameters" && otherGroups.length
        ? html`<select
            class="form-select"
            aria-label="Move to another group"
            @change=${(event: Event) => this.move(inputValue(event), "end")}
          >
            <option selected disabled>Move to group…</option>
            ${otherGroups.map(
              (group) => html`<option value=${group.id}>${group.id === ROOT ? "No group" : group.title || group.id}</option>`,
            )}
          </select>`
        : nothing}
      <span class="spacer"></span>
      <button
        class="btn btn-sm btn-outline-secondary ${this.jsonMode ? "active" : ""}"
        aria-pressed=${this.jsonMode}
        @click=${() => {
          this.jsonMode = !this.jsonMode;
          this.jsonError = null;
        }}
      >
        <nfsb-icon name="code"></nfsb-icon> ${this.jsonMode ? "Back to form" : "Edit as JSON"}
      </button>
      <button
        class="btn btn-sm btn-outline-danger"
        @click=${() => store.commit(removeParam(store.schema, this.groupId, name))}
      >
        <nfsb-icon name="trash"></nfsb-icon> Delete ${store.noun}
      </button>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nfsb-param": NfsbParam;
  }
}
