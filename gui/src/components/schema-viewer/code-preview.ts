import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('code-preview')
export class CodePreview extends LitElement {
  @property({ type: Object })
  data: any;

  private handleCopy(e: Event) {
    navigator.clipboard.writeText(JSON.stringify(this.data, null, 2));
    const button = e.target as HTMLButtonElement;
    button.textContent = 'Copied!';
    button.classList.add('success');
    setTimeout(() => {
      button.textContent = 'Copy';
      button.classList.remove('success');
    }, 1000);
  }

  static styles = css`
    :host {
      display: block;
      margin: 1rem 0;
    }

    .code-preview {
      position: relative;
      background: var(--background-dark);
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
      font-family: monospace;
      white-space: pre;
    }

    .copy-button {
      background: var(--background-light);
      color: var(--text-color);
      border: none;
      position: absolute;
      right: 0;
      top: 0;
      padding: 0.5rem;
      border-radius: 0px;
      font-size: 0.875rem;
      cursor: pointer;
      transition: opacity 0.3s;
    }

    .copy-button:hover {
      opacity: 0.9;
    }

    .success {
      background: var(--success-color);
      color: white;
    }
  `;

  render() {
    return html`
      <pre class="code-preview">
        <button class="copy-button" @click=${this.handleCopy}>Copy</button>
        ${JSON.stringify(this.data, null, 2)}
      </pre>
    `;
  }
}
