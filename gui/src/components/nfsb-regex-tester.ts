import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { inputValue } from "../dom";
import { compile } from "../model/lint";
import { shared } from "../styles/shared";
import "./nfsb-icon";

/** Try example values against a regular expression. */
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
    `,
  ];

  @property() pattern = "";
  @state() private example = "";

  render() {
    // An invalid pattern is reported next to the pattern itself
    const matches = compile(this.pattern)?.test(this.example) ?? null;
    return html`
      <div class="tester">
        <input
          class="form-control font-monospace"
          placeholder="Type an example value to test the pattern"
          aria-label="Example value to test the pattern"
          .value=${this.example}
          @input=${(event: Event) => (this.example = inputValue(event))}
        />
        ${this.example && matches !== null
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
