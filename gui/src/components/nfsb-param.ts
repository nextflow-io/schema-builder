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
import { LiveFields } from "../live";
import { StoreController, store } from "../store";
import { ItemMotion, motion } from "../styles/motion";
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
    motion,
    css`
      :host {
        display: block;
        position: relative;
      }
      .param {
        border: 1px solid var(--bs-border-color);
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
        /* The trimmed text below is shorter than its line box; keep the row height it had */
        min-height: 2.75rem;
        padding: 0.5rem 0.75rem 0.5rem 0.25rem;
        font-weight: 400;
        text-align: left;
      }
      .summary .icon {
        color: var(--bs-secondary-color);
      }
      /* Trim the font's leading so the text centres on its letters, not its line box, next to the icons */
      .name,
      .description {
        text-box: trim-both cap alphabetic;
      }
      .name {
        /* on narrow screens the name gives way (ellipsis) before the badges are pushed out of the row */
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 0.25em 0.4rem;
        font-family: var(--bs-font-monospace);
        /* the ellipsis takes this colour, so keep it muted like the type it usually cuts off */
        color: var(--bs-secondary-color);
      }
      .name > span {
        color: var(--bs-primary);
      }
      .type {
        font-family: var(--bs-font-monospace);
        color: var(--bs-secondary-color);
      }
      .description {
        flex: 1;
        min-width: 0;
        /* Room for descenders, which the truncation would otherwise clip */
        padding-block: 0.25em;
      }
      .description > p {
        display: inline;
        margin: 0;
      }
      /* With an icon (parameter schemas), the icon button sits in front of the name input and the label and error
         line up with the input; without one (samplesheets), the field is a plain stack */
      .name-field:has(> .icon-button) {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        column-gap: 0.5rem;
      }
      .name-field:has(> .icon-button) > * {
        grid-column: 2;
      }
      .name-field > .icon-label,
      .name-field > .icon-button {
        grid-column: 1;
      }
      .name-field > .icon-button {
        grid-row: 2;
        justify-self: center;
        font-size: 1.1rem;
      }
      .chevron {
        font-size: 0.75em;
        color: var(--bs-secondary-color);
      }

      .editor {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding: 1rem;
        border-top: 1px solid var(--bs-border-color);
      }
      /* The form is split into sections (basics, documentation, validation, ...), each a grid of fields */
      .section-title {
        margin: 0 0 0.75rem;
        padding-bottom: 0.35rem;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--bs-secondary-color);
        border-bottom: 1px solid var(--bs-border-color);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
        gap: 0.9rem 1rem;
      }
      /* Help text and its rendered preview, side by side when there is room */
      .help {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
        gap: 0.9rem 1rem;
      }
      .help textarea {
        height: calc(100% - 1.5rem);
        min-height: 6rem;
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
        min-height: 6rem;
        padding: 0.375rem 0.625rem;
        font-size: 0.875rem;
        background: var(--bs-tertiary-bg);
        border-radius: var(--bs-border-radius);
      }
      .preview .empty {
        margin: 0;
        color: var(--bs-secondary-color);
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
      /* The empty-value option and the example tester belong to the pattern above them */
      .pattern-extras {
        margin: 0.5rem 0 0 1rem;
        padding-left: 0.75rem;
        border-left: 2px solid var(--bs-border-color);
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

  private readonly itemMotion = new ItemMotion(this, () => `param:${this.param.name}`);
  private readonly live = new LiveFields(this, () => `param:${store.keyOf(this.param.name)}`);

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

  /** `edit`: the field being typed into, see `LiveFields`. */
  private commit(def: ParamDef, edit?: string): void {
    store.commit(updateParam(store.schema, this.groupId, this.param.name, def), undefined, edit);
  }

  private set(key: string, value: unknown, edit?: string): void {
    this.commit(setField(this.param.def, key, value), edit);
  }

  /** Rename as the name is typed, whenever it is valid. Leaving the field with an invalid name puts the old one back. */
  private rename(text: string, edit: string, done: boolean): void {
    const from = this.param.name;
    const to = text.trim();
    this.nameError = paramNameError(store.schema, to, from);
    if (this.nameError && done) this.nameError = null;
    if (this.nameError || to === from) return;
    store.commit(renameParam(store.schema, this.groupId, from, to), { from, to }, edit);
  }

  /** A live text field (see `LiveFields`) for a keyword of the definition; `parse` turns the text into its value. */
  private liveField(key: string, committed: string, parse: (text: string) => unknown) {
    const on = this.live.on(key, (text, edit) => this.set(key, parse(text), edit));
    return { value: this.live.value(key, committed), input: on.input, change: on.change };
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

  /** Focus the name field in the (open) editor and select it, so typing replaces the name. */
  async focusName(): Promise<void> {
    await this.updateComplete;
    const input = this.renderRoot.querySelector<HTMLInputElement>(".name-input");
    input?.focus({ preventScroll: true });
    input?.select();
  }

  private delete_(): void {
    this.itemMotion.remove(() => store.commit(removeParam(store.schema, this.groupId, this.param.name)));
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
            <code class="name"><span class="align-items-center">${name}</span><small class="type">:${view.typeLabel}</small></code>
            <span class="description text-truncate">${def.description ? unsafeHTML(renderMarkdown(String(def.description))) : ""}</span>
            ${required ? html`<span class="badge badge-warning">required</span>` : nothing}
            ${def.hidden ? html`<span class="badge">hidden</span>` : nothing}
            ${Array.isArray(def.meta) ? html`<span class="badge badge-info">meta</span>` : nothing}

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
    const field = this.liveField(key, String(this.param.def[key] ?? ""), (text) => text.trim());
    return html`<label>
      <span class="form-label">${label}</span>
      <input
        class="form-control ${options.mono ? "font-monospace" : ""}"
        placeholder=${options.placeholder ?? ""}
        .value=${field.value}
        @input=${field.input}
        @change=${field.change}
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
    const rename = this.live.on("name", (text, edit, done) => this.rename(text, edit, done));
    const helpText = this.liveField("help_text", String(def.help_text ?? ""), (text) => text.trim());
    return html`
      ${this.section(
        null,
        html`<div class="name-field">
            ${isParams ? html`<span class="form-label icon-label">Icon</span>` : nothing}
            <label class="form-label" for="name">Name</label>
            ${isParams
              ? html`<button
                  class="btn text-body-secondary btn-icon icon-button"
                  title="Change the ${noun}'s icon"
                  aria-label="Change the ${noun}'s icon"
                  @click=${() => (this.picking = true)}
                >
                  <nfsb-icon name=${def.fa_icon || "far fa-circle"}></nfsb-icon>
                </button>`
              : nothing}
            <input
              id="name"
              class="form-control font-monospace name-input ${this.nameError ? "is-invalid" : ""}"
              .value=${this.live.value("name", name)}
              @input=${rename.input}
              @change=${rename.change}
            />
            ${this.nameError ? html`<div class="invalid-feedback">${this.nameError}</div>` : nothing}
          </div>
          <label>
            <span class="form-label">Type</span>
            <select
              class="form-select"
              @change=${(event: Event) => this.commit(setType(def, inputValue(event) as ParamType))}
            >
              ${view.type === null ? html`<option selected disabled>${view.typeLabel}</option>` : nothing}
              ${PARAM_TYPES.map(
                (type) => html`<option value=${type} ?selected=${type === view.type}>${type}</option>`,
              )}
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
          </div>`,
      )}
      ${this.section(
        "Documentation",
        html`<div class="wide">
            ${this.text("Description", "description", { placeholder: `A short description of this ${noun}` })}
          </div>
          ${isParams
            ? html`<div class="help wide">
                <label>
                  <span class="form-label">Help text</span>
                  <textarea
                    class="form-control"
                    placeholder="Longer help, shown on request. Markdown is supported."
                    .value=${helpText.value}
                    @input=${helpText.input}
                    @change=${helpText.change}
                  ></textarea>
                </label>
                <div>
                  <span class="form-label">Preview</span>
                  <div class="preview">
                    ${def.help_text
                      ? unsafeHTML(renderMarkdown(String(def.help_text)))
                      : html`<p class="empty">The help text, as it will be shown</p>`}
                  </div>
                </div>
              </div>`
            : nothing}`,
      )}
      ${this.section(
        "Validation",
        html`${view.type === null
            ? html`<div class="alert alert-info wide">
                This ${noun} has a type the form cannot edit (<code>${view.typeLabel}</code>). Use “Edit as JSON”
                below to change its constraints, or pick a simple type above to replace them.
              </div>`
            : this.renderConstraints(view.type, view)}
          <div class="wide">
            ${this.text("Error message", "errorMessage", { placeholder: "Shown when a value is not valid" })}
          </div>`,
      )}
      ${isParams ? nothing : this.section("Samplesheet", this.renderSamplesheetFields())}
    `;
  }

  /** A titled section of the form, laid out as a grid of fields. */
  private section(title: string | null, fields: unknown): TemplateResult {
    return html`<section>
      ${title ? html`<h3 class="section-title">${title}</h3>` : nothing}
      <div class="grid">${fields}</div>
    </section>`;
  }

  private renderConstraints(type: ParamType, view: ParamView): TemplateResult {
    const { def } = this.param;
    const isNumber = type === "integer" || type === "number";
    const options: unknown[] | null = type === "boolean" ? [true, false] : Array.isArray(def.enum) ? def.enum : null;
    const toValue = (text: string) => coerce(text, type);
    const number = (label: string, key: string) => {
      const field = this.liveField(key, String(def[key] ?? ""), toValue);
      return html`<label>
        <span class="form-label">${label}</span>
        <input
          class="form-control ${this.hasIssue(key) ? "is-invalid" : ""}"
          type="number"
          step=${type === "integer" ? "1" : "any"}
          .value=${field.value}
          @input=${field.input}
          @change=${field.change}
        />
      </label>`;
    };
    const defaultField = this.liveField("default", String(def.default ?? ""), toValue);
    const enumField = this.liveField("enum", Array.isArray(def.enum) ? def.enum.join(", ") : "", (text) =>
      parseList(text, type),
    );

    return html`
      <label>
        <span class="form-label">Default</span>
        ${options
          ? html`<select
              class="form-select ${this.hasIssue("default") ? "is-invalid" : ""}"
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
              class="form-control ${this.hasIssue("default") ? "is-invalid" : ""}"
              type=${isNumber ? "number" : "text"}
              step=${type === "integer" ? "1" : "any"}
              placeholder="No default"
              .value=${defaultField.value}
              @input=${defaultField.input}
              @change=${defaultField.change}
            />`}
      </label>
      ${type === "boolean"
        ? nothing
        : html`<label>
            <span class="form-label">Allowed values</span>
            <input
              class="form-control ${this.hasIssue("enum") ? "is-invalid" : ""}"
              placeholder="Any value (separate with commas)"
              .value=${enumField.value}
              @input=${enumField.input}
              @change=${enumField.change}
            />
          </label>`}
      ${isNumber ? html`${number("Minimum", "minimum")} ${number("Maximum", "maximum")}` : nothing}
      ${type === "string" ? this.renderStringFields(view) : nothing}
    `;
  }

  /** Whether the linter found a problem with this keyword of the definition (see `Issue.fields`). */
  private hasIssue(field: string): boolean {
    return store.issuesOf(this.param.name).some((issue) => issue.fields?.includes(field));
  }

  private renderStringFields(view: ParamView): TemplateResult {
    const { def } = this.param;
    const format = typeof def.format === "string" ? def.format : "";
    const pattern = this.live.on("pattern", (text, edit) =>
      this.commit(setPattern(this.param.def, text.trim(), viewOf(this.param.def).allowEmpty), edit),
    );
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
            placeholder="Regular expression, e.g. ^\\S+\\.csv$"
            .value=${this.live.value("pattern", view.pattern)}
            @input=${pattern.input}
            @change=${pattern.change}
          />
        </label>
        <div class="pattern-extras">
          ${view.pattern
            ? this.check(
                "Also accept an empty value",
                view.allowEmpty,
                (checked) => this.commit(setPattern(def, view.pattern, checked)),
                "For optional values: written as anyOf [pattern, empty string] in the schema",
              )
            : nothing}
          <!-- Always there, so the example survives clearing the pattern (and can be typed first) -->
          <nfsb-regex-tester .pattern=${view.pattern}></nfsb-regex-tester>
        </div>
      </div>
    `;
  }

  private renderSamplesheetFields(): TemplateResult {
    const { def } = this.param;
    const uniqueWith: string[] = Array.isArray(def.unique) ? def.unique : [];
    const meta = this.liveField("meta", Array.isArray(def.meta) ? def.meta.join(", ") : "", (text) => parseList(text));
    const unique = this.liveField("unique", uniqueWith.join(", "), (text) => {
      const columns = parseList(text);
      return columns.length ? columns : true;
    });
    return html`
      <label>
        <span class="form-label">Meta map keys</span>
        <input
          class="form-control font-monospace"
          placeholder="Not added to the meta map"
          .value=${meta.value}
          @input=${meta.input}
          @change=${meta.change}
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
                .value=${unique.value}
                @input=${unique.input}
                @change=${unique.change}
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
        @click=${this.delete_}
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
