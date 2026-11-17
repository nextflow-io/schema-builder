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
      @media (prefers-color-scheme: dark) {
        .shiki span {
          color: var(--shiki-dark);
        }
      }
    `,
  ];

  @property({ attribute: false }) data: unknown;
  @state() private copied = false;

  private async copy(): Promise<void> {
    await navigator.clipboard.writeText(JSON.stringify(this.data, null, 4));
    this.copied = true;
    setTimeout(() => (this.copied = false), 1500);
  }

  render() {
    return html`
      <header>
        JSON
        <button class=${"btn btn-sm btn-outline-secondary"} @click=${this.copy}>
          <nfsb-icon name=${this.copied ? "check" : "copy"}></nfsb-icon> ${this.copied ? "Copied" : "Copy"}
        </button>
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
