import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import '../../pages/SchemaPage.ts';

@customElement('app-root')
export class AppRoot extends LitElement {
  @state()
  private currentPath = window.location.hash.slice(1) || '/';

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', () => {
      this.currentPath = window.location.hash.slice(1) || '/';
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', () => {
      this.currentPath = window.location.hash.slice(1) || '/';
    });
  }

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
    }

    nav {
      background: #333;
      padding: 1rem;
    }

    nav a {
      color: white;
      text-decoration: none;
      margin-right: 1rem;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      transition: background-color 0.3s;
    }

    nav a:hover {
      background-color: #555;
    }

    nav a.active {
      background-color: #4CAF50;
    }
  `;

  render() {
    return html`
      <nav>
        <a href="#/" class="${this.currentPath === '/' ? 'active' : ''}">Home</a>
        <a href="#/schema" class="${this.currentPath === '/schema' ? 'active' : ''}">Schema Builder</a>
      </nav>
      ${this.currentPath === '/'
        ? html`<json-schema-viewer></json-schema-viewer>`
        : html`<schema-page></schema-page>`}
    `;
  }
}
