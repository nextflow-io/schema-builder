import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { errorMessage, inputValue, isTextField } from "../dom";
import type { Issue } from "../model/lint";
import { ROOT, addGroup, parseJsonObject, updateMeta } from "../model/schema";
import { parametersTemplate, samplesheetTemplate } from "../model/templates";
import { StoreController, store } from "../store";
import { shared } from "../styles/shared";
import "./nfsb-group";
import "./nfsb-icon";
import "./nfsb-json-preview";


/** The application shell: toolbar, navigation, and the list of groups. */
@customElement("nfsb-app")
export class NfsbApp extends LitElement {
  static styles = [
    shared,
    css`
      :host {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100vh;
      }

      .navbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 0.75rem;
        padding: 0.5rem 1rem;
        color: var(--nfsb-navbar-color);
        background: var(--nfsb-navbar-bg);
        border-bottom: 3px solid var(--bs-primary);
      }
      .navbar .btn-ghost,
      .navbar .btn-outline-secondary {
        color: var(--nfsb-navbar-color);
        background: transparent;
        border-color: rgb(255 255 255 / 25%);
      }
      .navbar .btn-ghost {
        border-color: transparent;
      }
      .navbar .btn-ghost:hover:not(:disabled),
      .navbar .btn-outline-secondary:hover:not(:disabled),
      .navbar .btn-outline-secondary.active {
        background: rgb(255 255 255 / 15%);
      }
      .divider {
        width: 1px;
        align-self: stretch;
        background: rgb(255 255 255 / 25%);
      }
      .navbar .status {
        max-width: 22rem;
        font-size: 0.8125rem;
        color: rgb(255 255 255 / 70%);
      }
      .navbar .status.text-danger {
        color: #ff8f8a;
      }
      .navbar code {
        color: rgb(255 255 255 / 75%);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        min-width: 0;
        margin-right: auto;
      }
      .brand strong {
        font-family: var(--nfsb-font-heading);
        font-size: 1.3rem;
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      .brand strong span {
        color: var(--bs-primary);
      }

      .layout {
        display: grid;
        grid-template-columns: 17rem minmax(0, 1fr);
        min-height: 0;
      }
      .layout.with-json {
        grid-template-columns: 17rem minmax(0, 1fr) minmax(18rem, 30%);
      }
      .sidebar,
      .json {
        min-height: 0;
        overflow-y: auto;
        background: var(--bs-tertiary-bg);
      }
      .sidebar {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem 0.75rem;
        border-right: 1px solid var(--bs-border-color);
      }
      .json {
        display: flex;
        border-left: 1px solid var(--bs-border-color);
      }
      nfsb-json-preview {
        flex: 1;
      }
      main {
        min-height: 0;
        overflow-y: auto;
        padding: 1.25rem;
      }
      .content {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        max-width: 62rem;
        margin: 0 auto;
      }
      @media (max-width: 800px) {
        .layout,
        .layout.with-json {
          grid-template-columns: minmax(0, 1fr);
        }
        .sidebar,
        .json {
          display: none;
        }
      }

      h2 {
        margin: 0 0 0.4rem;
        padding: 0 0.5rem;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--bs-secondary-color);
      }
      .nav {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .nav .btn {
        width: 100%;
        justify-content: flex-start;
        gap: 0.5rem;
        padding: 0.3rem 0.5rem;
        font-weight: 400;
        text-align: left;
      }
      .nav .label {
        flex: 1;
        min-width: 0;
      }
      .nav .issue {
        align-items: flex-start;
        white-space: normal;
        font-size: 0.8125rem;
      }
      .nav .issue nfsb-icon {
        margin-top: 0.2rem;
      }

      .details {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
        gap: 0.75rem 1rem;
        padding: 1rem;
      }
      .details .wide {
        grid-column: 1 / -1;
      }

      .center {
        grid-row: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        padding: 2rem;
        text-align: center;
      }
      .center h1 {
        margin: 0;
        font-family: var(--nfsb-font-heading);
        font-size: 2rem;
      }
      .center p {
        max-width: 34rem;
        margin: 0;
        color: var(--bs-secondary-color);
      }
      .center .big {
        font-size: 2.5rem;
        color: var(--bs-primary);
      }
      .choices {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.5rem;
      }
    `,
  ];

  @state() private showJson = false;
  @state() private openError: string | null = null;

  constructor() {
    super();
    new StoreController(this);
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("beforeunload", this.onBeforeUnload);
    void store.load();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
  }

  private readonly onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (store.status === "editing" && store.dirty) event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (store.status !== "editing" || !(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    const focused = event.composedPath()[0];
    if (key === "s") {
      event.preventDefault();
      this.save();
    } else if (key === "z" && !isTextField(focused)) {
      // Inside a text field, leave undo to the browser
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
    }
  };

  /** Fields commit on `change`; make sure the one being typed in is included. */
  private commitFocusedField(): void {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    if (isTextField(active)) active.blur();
  }

  private save(): void {
    this.commitFocusedField();
    void store.save();
  }

  private finish(): void {
    this.commitFocusedField();
    void store.finish();
  }

  private async reveal(groupId: string, param?: string): Promise<void> {
    if (param && store.filter) store.view(() => (store.filter = ""));
    await this.updateComplete;
    const groups = [...this.renderRoot.querySelectorAll("nfsb-group")];
    await groups.find((element) => element.group.id === groupId)?.reveal(param);
  }

  private addGroup(): void {
    const { schema, id } = addGroup(store.schema);
    store.commit(schema);
    void this.reveal(id);
  }

  private async openFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const schema = parseJsonObject(await file.text());
      this.openError = null;
      store.open(schema, file.name);
    } catch (error) {
      this.openError = `Could not open ${file.name}: ${errorMessage(error)}`;
    }
  }

  // -- rendering -------------------------------------------------------------

  render() {
    switch (store.status) {
      case "loading":
        return html`<div class="center"><p>Loading the schema…</p></div>`;
      case "welcome":
        return this.renderWelcome();
      case "finished":
        return html`<div class="center">
          <nfsb-icon class="big" name="circle-check"></nfsb-icon>
          <h1>All done</h1>
          <p>
            ${store.name ? html`<code>${store.name}</code> has been saved.` : "Your schema has been saved."} You can
            close this tab and go back to your terminal.
          </p>
        </div>`;
      default:
        return html`${this.renderNavbar()}
          <div class="layout ${this.showJson ? "with-json" : ""}">
            ${this.renderSidebar()}
            <main>
              <div class="content">
                ${this.renderDetails()}
                ${repeat(
                  store.groups,
                  (group) => group.id,
                  (group) => html`<nfsb-group .group=${group}></nfsb-group>`,
                )}
                ${store.kind === "parameters"
                  ? html`<div>
                      <button class="btn btn-outline-primary" @click=${this.addGroup}>
                        <nfsb-icon name="plus"></nfsb-icon> Add group
                      </button>
                    </div>`
                  : nothing}
              </div>
            </main>
            ${this.showJson
              ? html`<aside class="json"><nfsb-json-preview .data=${store.schema}></nfsb-json-preview></aside>`
              : nothing}
          </div>`;
    }
  }

  private renderWelcome() {
    return html`<div class="center">
      <nfsb-icon class="big" name="sliders"></nfsb-icon>
      <h1>nf-schema-builder</h1>
      <p>
        Edit the JSON schema of a Nextflow pipeline: its parameters (<code>nextflow_schema.json</code>) or a
        samplesheet (such as <code>assets/schema_input.json</code>). Nothing leaves your computer.
      </p>
      <div class="choices">
        <label class="btn btn-primary">
          <nfsb-icon name="folder-open"></nfsb-icon> Open a schema file
          <input class="visually-hidden" type="file" accept=".json,application/json" @change=${this.openFile} />
        </label>
        <button class="btn btn-outline-secondary" @click=${() => store.open(parametersTemplate(), "nextflow_schema.json")}>
          New parameter schema
        </button>
        <button class="btn btn-outline-secondary" @click=${() => store.open(samplesheetTemplate(), "schema_input.json")}>
          New samplesheet schema
        </button>
      </div>
      ${this.openError ? html`<div class="alert alert-danger" role="alert">${this.openError}</div>` : nothing}
      <p class="form-text">
        Tip: run <code>nf-schema-builder edit nextflow_schema.json</code> to edit a file in place.
      </p>
    </div>`;
  }

  private renderStatus() {
    if (store.saving) return html`<span class="status">Saving…</span>`;
    if (store.saveError) {
      return html`<span class="status text-danger text-truncate" role="alert" title=${store.saveError}>
        Not saved: ${store.saveError}
      </span>`;
    }
    if (store.dirty) return html`<span class="status">Unsaved changes</span>`;
    if (store.savedAt) {
      const time = store.savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return html`<span class="status">Saved at ${time}</span>`;
    }
    return nothing;
  }

  private renderNavbar() {
    const isMac = navigator.platform.startsWith("Mac");
    const shortcut = isMac ? "⌘" : "Ctrl+";
    return html`<header class="navbar">
      <div class="brand">
<strong><span>nf-</span>schema-builder</strong>
        ${store.name ? html`<code class="text-truncate">${store.name}</code>` : nothing}
        <span class="badge badge-primary">${store.kind === "samplesheet" ? "Samplesheet" : "Pipeline parameters"}</span>
      </div>
      ${this.renderStatus()}
      <button
        class="btn btn-ghost btn-icon"
        title="Undo (${shortcut}Z)"
        aria-label="Undo"
        ?disabled=${!store.canUndo}
        @click=${() => store.undo()}
      >
        <nfsb-icon name="rotate-left"></nfsb-icon>
      </button>
      <button
        class="btn btn-ghost btn-icon"
        title="Redo (${isMac ? "⇧⌘Z" : "Ctrl+Shift+Z"})"
        aria-label="Redo"
        ?disabled=${!store.canRedo}
        @click=${() => store.redo()}
      >
        <nfsb-icon name="rotate-right"></nfsb-icon>
      </button>
      <button
        class="btn btn-outline-secondary ${this.showJson ? "active" : ""}"
        aria-pressed=${this.showJson}
        @click=${() => (this.showJson = !this.showJson)}
      >
        <nfsb-icon name="code"></nfsb-icon> JSON
      </button>
      <span class="divider"></span>
      ${store.connected
        ? html`<button
              class="btn btn-outline-secondary"
              title="Save (${shortcut}S)"
              ?disabled=${store.saving || !store.dirty}
              @click=${this.save}
            >
              <nfsb-icon name="floppy-disk"></nfsb-icon> Save
            </button>
            <button
              class="btn btn-primary"
              title="Save and return to the terminal"
              ?disabled=${store.saving}
              @click=${this.finish}
            >
              <nfsb-icon name="check"></nfsb-icon> Finish
            </button>`
        : html`<button class="btn btn-primary" title="Download (${shortcut}S)" @click=${this.save}>
            <nfsb-icon name="download"></nfsb-icon> Download
          </button>`}
    </header>`;
  }

  private renderIssue(issue: Issue) {
    const label = issue.param ?? store.groups.find((group) => group.id === issue.groupId)?.title ?? "";
    return html`<li>
      <button
        class="btn btn-ghost issue"
        ?disabled=${!issue.groupId}
        @click=${() => issue.groupId && this.reveal(issue.groupId, issue.param)}
      >
        <nfsb-icon
          class=${issue.level === "error" ? "text-danger" : "text-warning"}
          name=${issue.level === "error" ? "circle-exclamation" : "triangle-exclamation"}
        ></nfsb-icon>
        <span class="label">
          ${label ? html`<strong class="font-monospace">${label}</strong><br />` : nothing}${issue.message}
        </span>
      </button>
    </li>`;
  }

  private renderSidebar() {
    const isParams = store.kind === "parameters";
    const total = store.groups.reduce((count, group) => count + group.params.length, 0);
    return html`<aside class="sidebar">
      <input
        class="form-control"
        type="search"
        placeholder="Filter ${total} ${store.noun}s…"
        aria-label="Filter by name or description"
        .value=${store.filter}
        @input=${(event: Event) => store.view(() => (store.filter = inputValue(event)))}
      />
      ${isParams
        ? html`<nav aria-label="Groups">
            <h2>Groups</h2>
            <ul class="nav">
              ${store.groups.map(
                (group) =>
                  html`<li>
                    <button class="btn btn-ghost" @click=${() => this.reveal(group.id)}>
                      <nfsb-icon name=${group.id === ROOT ? "inbox" : group.icon || "far fa-folder"}></nfsb-icon>
                      <span class="label text-truncate">
                        ${group.id === ROOT ? "Without a group" : group.title || group.id}
                      </span>
                      <span class="badge">${group.params.length}</span>
                    </button>
                  </li>`,
              )}
              <li>
                <button class="btn btn-ghost" @click=${this.addGroup}>
                  <nfsb-icon name="plus"></nfsb-icon> <span class="label">Add group</span>
                </button>
              </li>
            </ul>
          </nav>`
        : nothing}
      ${store.issues.length
        ? html`<section aria-label="Problems">
            <h2>Problems (${store.issues.length})</h2>
            <ul class="nav">
              ${store.issues.map((issue) => this.renderIssue(issue))}
            </ul>
          </section>`
        : nothing}
    </aside>`;
  }

  private renderDetails() {
    const field = (label: string, key: string, placeholder: string, mono = false) =>
      html`<label class=${key === "description" ? "wide" : ""}>
        <span class="form-label">${label}</span>
        <input
          class="form-control ${mono ? "font-monospace" : ""}"
          placeholder=${placeholder}
          .value=${String(store.schema[key] ?? "")}
          @change=${(event: Event) => store.commit(updateMeta(store.schema, { [key]: inputValue(event).trim() }))}
        />
      </label>`;
    return html`<section class="card details" aria-label="Schema details">
      ${field("Title", "title", store.kind === "parameters" ? "e.g. nf-core/rnaseq pipeline parameters" : "Title")}
      ${field("$id", "$id", "URL where this schema will be published", true)}
      ${field("Description", "description", "What this schema describes")}
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nfsb-app": NfsbApp;
  }
}
