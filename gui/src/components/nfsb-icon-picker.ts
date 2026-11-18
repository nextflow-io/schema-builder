import { LitElement, css, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { inputValue, matchesQuery } from "../dom";
import { type IconChoice, allIcons } from "../icons";
import { shared } from "../styles/shared";
import "./nfsb-icon";

const MAX_RESULTS = 150;

/**
 * A dialog to choose a Font Awesome icon. It opens as soon as it is added to
 * the page, and fires `pick` (detail: the class string, or "" to remove the
 * icon) and `close`.
 */
@customElement("nfsb-icon-picker")
export class NfsbIconPicker extends LitElement {
  static styles = [
    shared,
    css`
      dialog {
        width: min(34rem, calc(100vw - 2rem));
        padding: 1rem;
        color: var(--bs-body-color);
        background: var(--nfsb-surface);
        border: 1px solid var(--bs-border-color);
        border-radius: var(--bs-border-radius-lg);
        box-shadow: var(--bs-box-shadow);
      }
      dialog:modal {
        overscroll-behavior: contain;
      }
      dialog::backdrop {
        overflow: hidden;
        overscroll-behavior: contain;
        background: rgb(0 0 0 / 40%);
      }
      header {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
        gap: 0.4rem;
        height: 20rem;
        overflow-y: auto;
        align-content: start;
      }
      .choice {
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.6rem 0.25rem;
        font-size: 0.75rem;
        font-weight: 400;
        min-width: 0;
      }
      .choice nfsb-icon {
        font-size: 1.4rem;
      }
      .choice span {
        max-width: 100%;
      }
      .choice[aria-pressed="true"] {
        color: var(--bs-primary-text-emphasis);
        background: var(--bs-primary-bg-subtle);
        border-color: var(--bs-primary);
      }
      footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 0.75rem;
      }
    `,
  ];

  /** The current icon, as a class string. */
  @property() value = "";
  @state() private search = "";
  @state() private icons: IconChoice[] = [];
  @query("dialog") private dialog!: HTMLDialogElement;

  protected firstUpdated(): void {
    this.dialog.showModal();
    void allIcons().then((icons) => (this.icons = icons));
  }

  private pick(value: string): void {
    this.dispatchEvent(new CustomEvent("pick", { detail: value }));
    this.dialog.close();
  }

  render() {
    const matches = this.icons.filter((icon) => matchesQuery(icon.keywords, this.search));
    return html`
      <dialog closedby="any" @close=${() => this.dispatchEvent(new Event("close"))} aria-label="Choose an icon">
        <header>
          <input
            class="form-control"
            type="search"
            placeholder="Search ${this.icons.length || ""} icons…"
            autofocus
            .value=${this.search}
            @input=${(event: Event) => (this.search = inputValue(event))}
          />
          <button class="btn text-body-primary btn-icon" aria-label="Close" @click=${() => this.dialog.close()}>
            <nfsb-icon name="xmark"></nfsb-icon>
          </button>
        </header>
        <div class="grid">
          ${matches.slice(0, MAX_RESULTS).map(
            (icon) => html`
              <button
                class="btn btn-outline-secondary choice"
                title=${icon.value}
                aria-pressed=${icon.value === this.value}
                @click=${() => this.pick(icon.value)}
              >
                <nfsb-icon name=${icon.value}></nfsb-icon>
                <span class="text-truncate">${icon.name}</span>
              </button>
            `,
          )}
        </div>
        <footer>
          <span class="form-text">
            ${matches.length > MAX_RESULTS
              ? `Showing ${MAX_RESULTS} of ${matches.length} icons. Search to narrow down.`
              : `${matches.length} icons`}
          </span>
          <button class="btn btn-sm btn-outline-secondary" ?disabled=${!this.value} @click=${() => this.pick("")}>
            Remove icon
          </button>
        </footer>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nfsb-icon-picker": NfsbIconPicker;
  }
}
