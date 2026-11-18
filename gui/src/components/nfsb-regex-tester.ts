import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { inputValue } from "../dom";
import { compile } from "../model/lint";
import { shared } from "../styles/shared";
import "./nfsb-icon";

/** Try example values against a regular expression, highlighting the part that matches. */
@customElement("nfsb-regex-tester")
export class NfsbRegexTester extends LitElement {
  static styles = [
    shared,
    css`
      :host {
        display: block;
        margin-top: 0.4rem;
      }
      .tester {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .result {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.8125rem;
        white-space: nowrap;
      }
      .match {
        color: var(--bs-primary-text-emphasis);
      }

      /*
       * The matched part is highlighted on a backdrop behind the (transparent) input: it repeats the input's text
       * in invisible ink, with the same font, padding and border, so the highlight lines up with the characters.
       */
      .field {
        position: relative;
        flex: 1;
        min-width: 0;
        background: var(--nfsb-surface);
        border-radius: var(--bs-border-radius);
      }
      .field .form-control {
        position: relative;
        background: transparent;
      }
      .backdrop {
        position: absolute;
        inset: 0;
        padding: 0.375rem 0.625rem;
        border: 1px solid transparent;
        line-height: 1.5;
        white-space: pre;
        overflow: hidden;
        color: transparent;
        pointer-events: none;
      }
      mark {
        padding: 0;
        color: transparent;
        background: rgba(var(--bs-primary-rgb), 0.3);
        border-radius: 0.15rem;
      }
    `,
  ];

  @property() pattern = "";
  @state() private example = "";
  @query(".backdrop") private backdrop?: HTMLElement;

  /** Keep the backdrop scrolled along with the input when the example is longer than the field. */
  private syncScroll(event: Event): void {
    if (this.backdrop) this.backdrop.scrollLeft = (event.target as HTMLInputElement).scrollLeft;
  }

  render() {
    const { example } = this;
    // No pattern: nothing to test yet. An invalid pattern is reported next to the pattern itself.
    const regex = this.pattern ? compile(this.pattern) : null;
    const match = regex?.exec(example) ?? null;
    const matches = regex ? match !== null : null;
    const highlighted = match
      ? html`${example.slice(0, match.index)}<mark>${match[0]}</mark>${example.slice(match.index + match[0].length)}`
      : example;
    return html`
      <div class="tester">
        <div class="field">
          <div class="backdrop font-monospace" aria-hidden="true">${highlighted}</div>
          <input
            class="form-control font-monospace"
            placeholder="Example value to test the pattern"
            aria-label="Example value to test the pattern"
            .value=${example}
            @input=${(event: Event) => {
              this.example = inputValue(event);
              this.syncScroll(event);
            }}
            @scroll=${this.syncScroll}
          />
        </div>
        ${example && matches !== null
          ? html`<span class="result ${matches ? "match" : "text-danger"}" role="status">
              <nfsb-icon name=${matches ? "check" : "xmark"}></nfsb-icon>
              ${matches ? "Matches" : "No match"}
            </span>`
          : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nfsb-regex-tester": NfsbRegexTester;
  }
}
