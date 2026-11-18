import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { highlightJson } from "../highlight";
import { shared } from "../styles/shared";
import "./nfsb-icon";

/** The schema as it will be written to the file. */
@customElement("nfsb-json-preview")
export class NfsbJsonPreview extends LitElement {
  static styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.75rem;
        font-weight: 600;
        border-bottom: 1px solid var(--bs-border-color);
      }
      .code {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      pre {
        flex: 1;
        margin: 0;
        padding: 0.75rem;
        overflow: auto;
        font-family: var(--bs-font-monospace);
        font-size: 0.78rem;
        line-height: 1.45;
        tab-size: 2;
      }
      .shiki span {
        color: var(--shiki-light);
      }
      /* Fallback for browsers without light-dark() */
      @media (prefers-color-scheme: dark) {
        .shiki span {
          color: var(--shiki-dark);
        }
      }
      @supports (color: light-dark(#000, #fff)) {
        .shiki span {
          color: light-dark(var(--shiki-light), var(--shiki-dark));
        }
      }
      .copy {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .copy [role="status"] {
        font-size: var(--nfsb-font-size-sm);
        font-weight: normal;
        color: var(--bs-secondary-color);
      }
      .copy [role="status"].failed {
        color: var(--bs-danger);
      }
    `,
  ];

  @property({ attribute: false }) data: unknown;
  /** Result of the last copy, shown (and announced) until the timer clears it. */
  @state() private copyResult: "copied" | "failed" | null = null;
  private copyTimer?: ReturnType<typeof setTimeout>;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.copyTimer);
  }

  private async copy(): Promise<void> {
    clearTimeout(this.copyTimer);
    // Clear first, so a repeated result is announced again
    this.copyResult = null;
    await this.updateComplete;
    try {
      await navigator.clipboard.writeText(JSON.stringify(this.data, null, 4));
      this.copyResult = "copied";
    } catch {
      this.copyResult = "failed";
    }
    this.copyTimer = setTimeout(() => (this.copyResult = null), 2000);
  }

  render() {
    const icon = this.copyResult === "copied" ? "check" : this.copyResult === "failed" ? "xmark" : "copy";
    return html`
      <header>
        JSON
        <span class="copy">
          <!-- Outside the button: a live region inside a button is not reliably announced -->
          <span role="status" class=${this.copyResult === "failed" ? "failed" : ""}
            >${this.copyResult === "copied" ? "Copied" : this.copyResult === "failed" ? "Copy failed" : ""}</span
          >
          <button type="button" class="btn btn-sm btn-outline-secondary" @click=${this.copy}>
            <nfsb-icon name=${icon}></nfsb-icon> Copy
          </button>
        </span>
      </header>
      <div class="code">${unsafeHTML(highlightJson(JSON.stringify(this.data, null, 2)))}</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nfsb-json-preview": NfsbJsonPreview;
  }
}
