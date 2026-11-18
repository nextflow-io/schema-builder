import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { dropEdge, endDrag, listenForDrops, startDrag } from "../dnd";
import { matchesQuery } from "../dom";
import {
  type Group,
  ROOT,
  addParam,
  moveGroup,
  moveParam,
  removeGroup,
  updateGroup,
} from "../model/schema";
import { LiveFields } from "../live";
import { StoreController, store } from "../store";
import { ItemMotion, markAdded, motion } from "../styles/motion";
import { shared } from "../styles/shared";
import "./nfsb-icon";
import "./nfsb-icon-picker";
import type { NfsbParam } from "./nfsb-param";
import "./nfsb-param";

/**
 * A card with the parameters of one group. The `ROOT` group holds the
 * parameters outside any group, or the columns of a samplesheet schema.
 */
@customElement("nfsb-group")
export class NfsbGroup extends LitElement {
  static styles = [
    shared,
    motion,
    css`
      :host {
        display: block;
        position: relative;
        scroll-margin-top: 1rem;
        --nfsb-drop-offset: -0.7rem;
      }
      :host([drop="into"]) .card {
        border-color: var(--bs-primary);
        box-shadow: 0 0 0 0.2rem rgba(var(--bs-primary-rgb), 0.25);
      }
      .card.loose {
        border-style: dashed;
        background: transparent;
        box-shadow: none;
      }

      header {
        display: flex;
        align-items: flex-start;
        gap: 0.25rem;
        padding: 0.6rem 0.75rem 0.6rem 0.5rem;
        margin-bottom: 0.75rem;
        background: var(--bs-tertiary-bg);
        border-bottom: 1px solid var(--bs-border-color);
              }
      .card.loose header {
        background: transparent;
        border-bottom: 0;
        margin-bottom: 0;
      }
      .collapsed header {
        margin-bottom: 0;
        border-bottom: 0;
              }
      .grip {
        padding: 0.55rem 0.25rem;
      }
      .icon {
        margin-top: 0.1rem;
        font-size: 1.1rem;
        color: var(--bs-primary-text);
      }
      .titles {
        flex: 1;
        min-width: 0;
      }
      .titles .form-control {
        padding: 0.2rem 0.4rem;
        border-color: transparent;
        background: transparent;
      }
      .titles .form-control:hover {
        border-color: var(--bs-border-color);
      }
      .title,
      h2 {
        font-family: var(--nfsb-font-heading);
        font-size: 1.3rem;
        font-weight: 600;
      }
      .description {
        color: var(--bs-secondary-color);
      }
      h2 {
        margin: 0;
        padding: 0.2rem 0.4rem;
      }
      p.hint {
        margin: 0;
        padding: 0 0.4rem;
        color: var(--bs-secondary-color);
      }
      .tools {
        display: flex;
        align-items: center;
        gap: 0.15rem;
      }

      .body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0 0.75rem 0.75rem;
      }
      .empty {
        padding: 1rem;
        text-align: center;
        color: var(--bs-secondary-color);
        border: 1px dashed var(--bs-border-color);
              }
      .add {
        align-self: flex-start;
      }
    `,
  ];

  @property({ attribute: false }) group!: Group;
  /** Where a dragged group ("before"/"after") or parameter ("into") would be dropped. */
  @property({ reflect: true }) drop: "before" | "after" | "into" | null = null;
  @state() private picking = false;

  private readonly itemMotion = new ItemMotion(this, () => `group:${this.group.id}`);
  private readonly live = new LiveFields(this, () => `group:${store.keyOf(this.group.id)}`);

  constructor() {
    super();
    new StoreController(this);
    listenForDrops(this, {
      over: (event, item) => {
        if (item.type === "group" && (this.isRoot || item.groupId === this.group.id)) return false;
        this.drop = item.type === "param" ? "into" : dropEdge(event, this);
        return true;
      },
      leave: () => (this.drop = null),
      drop: (event, item) => {
        if (item.type === "param") {
          // Dropped on the card rather than on a parameter: add to the end
          store.commit(moveParam(store.schema, item.groupId, item.name, this.group.id, "end"));
        } else {
          const position = dropEdge(event, this) === "before" ? { before: this.group.id } : { after: this.group.id };
          store.commit(moveGroup(store.schema, item.groupId, position));
        }
      },
    });
  }

  private get isRoot(): boolean {
    return this.group.id === ROOT;
  }

  /**
   * Unfold the group and scroll to it, or to one of its parameters with its editor open. Returns that parameter's
   * element.
   */
  async reveal(name?: string): Promise<NfsbParam | undefined> {
    store.view(() => {
      store.collapsedGroups.delete(this.group.id);
      if (name) store.expanded.add(name);
    });
    await this.updateComplete;
    const target = name
      ? [...this.renderRoot.querySelectorAll("nfsb-param")].find((element) => element.param.name === name)
      : null;
    (target ?? this).scrollIntoView({ behavior: "smooth", block: name ? "center" : "start" });
    return target ?? undefined;
  }

  /** `edit`: the field being typed into, see `LiveFields`. */
  private update_(patch: { title?: string; description?: string; fa_icon?: string }, edit?: string): void {
    const { schema, id } = updateGroup(store.schema, this.group.id, patch);
    // The group's key follows its title
    store.commit(schema, id === this.group.id ? undefined : { from: this.group.id, to: id }, edit);
  }

  private delete_(): void {
    this.itemMotion.remove(() => store.commit(removeGroup(store.schema, this.group.id)));
  }

  private add(): void {
    const { schema, name } = addParam(store.schema, this.group.id);
    store.filter = "";
    // Only the new parameter's editor stays open. The others' edits are already committed: clicking "Add" blurred
    // any focused field, which fires its change event.
    store.expanded.clear();
    markAdded(`param:${name}`);
    store.commit(schema);
    void this.reveal(name).then((param) => param?.focusName());
  }

  // -- rendering -------------------------------------------------------------

  private renderHeader(collapsed: boolean) {
    const { group } = this;
    const isSamplesheet = store.kind === "samplesheet";
    const groupIds = store.groupIds;
    const index = groupIds.indexOf(group.id);
    const toggle = html`<button
      class="btn text-body-secondary btn-icon"
      aria-expanded=${!collapsed}
      aria-label=${collapsed ? "Expand" : "Collapse"}
      title=${collapsed ? "Expand" : "Collapse"}
      @click=${() =>
        store.view(() => (collapsed ? store.collapsedGroups.delete(group.id) : store.collapsedGroups.add(group.id)))}
    >
      <nfsb-icon name=${collapsed ? "chevron-down" : "chevron-up"}></nfsb-icon>
    </button>`;

    if (this.isRoot) {
      return html`<header>
        <div class="titles">
          <h2>${isSamplesheet ? "Columns" : "Parameters without a group"}</h2>
          <p class="hint">
            ${isSamplesheet
              ? "The columns of the samplesheet. Drag to change their order."
              : "Drag these into a group, or use “Move to group” in a parameter's editor."}
          </p>
        </div>
        <div class="tools"><span class="badge">${group.params.length}</span> ${toggle}</div>
      </header>`;
    }

    const title = this.live.on("title", (text, edit) => this.update_({ title: text.trim() }, edit));
    const description = this.live.on("description", (text, edit) =>
      this.update_({ description: text.trim() }, edit),
    );
    return html`<header>
      <span
        class="grip"
        draggable="true"
        title="Drag to reorder groups"
        @dragstart=${(event: DragEvent) =>
          startDrag(event, { type: "group", groupId: group.id }, this.renderRoot.querySelector(".card"))}
        @dragend=${endDrag}
      >
        <nfsb-icon name="grip-vertical"></nfsb-icon>
      </span>
      <button
        class="btn text-body-secondary btn-icon icon"
        title="Change the group's icon"
        aria-label="Change the group's icon"
        @click=${() => (this.picking = true)}
      >
        <nfsb-icon name=${group.icon || "far fa-folder"}></nfsb-icon>
      </button>
      <div class="titles">
        <input
          class="form-control title"
          aria-label="Group title"
          placeholder="Group title"
          .value=${this.live.value("title", group.title)}
          @input=${title.input}
          @change=${title.change}
        />
        <input
          class="form-control description"
          aria-label="Group description"
          placeholder="Describe this group of parameters"
          .value=${this.live.value("description", group.description)}
          @input=${description.input}
          @change=${description.change}
        />
      </div>
      <div class="tools">
        <span class="badge">${group.params.length}</span>
        <button
          class="btn text-body-secondary btn-icon"
          title="Move group up"
          aria-label="Move group up"
          ?disabled=${index === 0}
          @click=${() => store.commit(moveGroup(store.schema, group.id, { before: groupIds[index - 1] }))}
        >
          <nfsb-icon name="arrow-up"></nfsb-icon>
        </button>
        <button
          class="btn text-body-secondary btn-icon"
          title="Move group down"
          aria-label="Move group down"
          ?disabled=${index === groupIds.length - 1}
          @click=${() => store.commit(moveGroup(store.schema, group.id, { after: groupIds[index + 1] }))}
        >
          <nfsb-icon name="arrow-down"></nfsb-icon>
        </button>
        <button
          class="btn text-body-secondary btn-icon"
          title="Delete this group. Its parameters are kept, without a group."
          aria-label="Delete group"
          @click=${this.delete_}
        >
          <nfsb-icon name="trash"></nfsb-icon>
        </button>
        ${toggle}
      </div>
    </header>`;
  }

  render() {
    const { group } = this;
    const collapsed = store.collapsedGroups.has(group.id);
    const filter = store.filter.trim();
    const params = filter
      ? group.params.filter((param) => matchesQuery(`${param.name} ${param.def.description ?? ""}`.toLowerCase(), filter))
      : group.params;
    const noun = store.noun;
    const isLoose = this.isRoot && store.kind === "parameters";

    return html`
      <section
        class="card ${isLoose ? "loose" : ""} ${collapsed ? "collapsed" : ""}"
      >
        ${this.renderHeader(collapsed)}
        ${collapsed
          ? nothing
          : html`<div class="body">
              ${repeat(
                params,
                (param) => store.keyOf(param.name),
                (param) => html`<nfsb-param .groupId=${group.id} .param=${param}></nfsb-param>`,
              )}
              ${params.length === 0
                ? html`<div class="empty">
                    ${filter && group.params.length
                      ? `No ${noun}s match “${filter}”`
                      : isLoose
                        ? "Every parameter is in a group."
                        : `No ${noun}s yet. Add one, or drag one here.`}
                  </div>`
                : nothing}
              <button class="btn btn-sm btn-outline-secondary add" @click=${this.add}>
                <nfsb-icon name="plus"></nfsb-icon> Add ${noun}
              </button>
            </div>`}
      </section>
      ${this.picking
        ? html`<nfsb-icon-picker
            .value=${group.icon}
            @pick=${(event: CustomEvent<string>) => this.update_({ fa_icon: event.detail })}
            @close=${() => (this.picking = false)}
          ></nfsb-icon-picker>`
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nfsb-group": NfsbGroup;
  }
}
