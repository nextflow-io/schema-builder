import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("regex-tester")
export class RegexTester extends LitElement {
  @property({ type: String }) pattern = "";
  @state() private examples: { text: string; isValid?: boolean }[] = [{ text: "" }];

  static styles = css`
    :host {
      display: block;
      margin-top: 0.5rem;
    }

    .regex-tester {
      background: var(--background-light);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 1rem;
    }

    .examples {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .example-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .example-input {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-family: monospace;
    }

    .example-input.valid {
      border: 3px solid var(--success-color, #28a745);
    }

    .example-input.invalid {
      border: 3px solid var(--error-color, #dc3545);
    }

    .status-icon {
      width: 24px;
      color: var(--text-muted);
      text-align: center;
    }

    .status-icon.valid {
      color: var(--success-color, #28a745);
    }

    .status-icon.invalid {
      color: var(--error-color, #dc3545);
    }

    .add-example {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: none;
      border: 1px dashed var(--border-color);
      border-radius: 4px;
      color: var(--text-muted);
      cursor: pointer;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .add-example:hover {
      background: var(--background-hover);
    }

    .remove-example {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 0.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .remove-example:hover {
      color: var(--error-color, #dc3545);
    }
  `;

  private validateExample(example: string): boolean {
    if (!this.pattern) return true;
    try {
      const regex = new RegExp(this.pattern);
      return regex.test(example);
    } catch (e) {
      return false;
    }
  }

  private handleExampleChange(index: number, value: string) {
    this.examples = this.examples.map((example, i) =>
      i === index ? { text: value, isValid: this.validateExample(value) } : example
    );
  }

  private addExample() {
    this.examples = [...this.examples, { text: "" }];
  }

  private removeExample(index: number) {
    this.examples = this.examples.filter((_, i) => i !== index);
  }

  protected updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("pattern")) {
      // Revalidate all examples when pattern changes
      this.examples = this.examples.map((example) => ({
        ...example,
        isValid: this.validateExample(example.text),
      }));
    }
  }

  render() {
    return html`
      <div class="regex-tester">
        <div class="examples">
          ${this.examples.map(
            (example, index) => html`
              <div class="example-row">
                <div class="status-icon ${example.text ? (example.isValid ? "valid" : "invalid") : ""}">
                  ${example.text
                    ? example.isValid
                      ? html`<fa-icon icon="fas fa-check"></fa-icon>`
                      : html`<fa-icon icon="fas fa-times"></fa-icon>`
                    : ""}
                </div>
                <input
                  class="example-input ${example.text ? (example.isValid ? "valid" : "invalid") : ""}"
                  type="text"
                  .value=${example.text}
                  placeholder="Test example..."
                  @input=${(e: Event) => this.handleExampleChange(index, (e.target as HTMLInputElement).value)}
                />

                ${this.examples.length > 1
                  ? html`
                      <button class="remove-example" @click=${() => this.removeExample(index)}>
                        <fa-icon icon="fas fa-trash"></fa-icon>
                      </button>
                    `
                  : ""}
              </div>
            `
          )}
        </div>
        <button class="add-example" @click=${this.addExample}>
          <fa-icon icon="fas fa-plus"></fa-icon>
          Add example
        </button>
      </div>
    `;
  }
}
