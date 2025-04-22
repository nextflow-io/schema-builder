import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

@customElement('markdown-viewer')
export class MarkdownViewer extends LitElement {
  @property({ type: String }) content = '';
  @property({ type: Boolean }) inline = false;
  @state() private parsedContent = '';

  static styles = css`
    :host {
      display: block;
      width: 100%;
      background: var(--background-light, #ffffff);
    }

    .markdown {
      width: 100%;
      color: var(--text-color, #333333);
      line-height: 1.5;
      font-size: 1rem;
    }

    .markdown.inline {
      display: inline;
    }

    .markdown p {
      margin: 0.75em 0;
    }

    .markdown p:first-child {
      margin-top: 0;
    }

    .markdown p:last-child {
      margin-bottom: 0;
    }

    .markdown a {
      color: #0066cc;
      text-decoration: none;
    }

    .markdown a:hover {
      text-decoration: underline;
    }

    .markdown code {
      background: var(--background-light, #f5f5f5);
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 0.9em;
      font-family: var(--font-monospace, monospace);
    }

    .markdown pre {
      background: var(--background-dark, #f0f0f0);
      padding: 1em;
      border-radius: 4px;
      overflow-x: auto;
    }

    .markdown pre code {
      background: none;
      padding: 0;
      border-radius: 0;
    }

    .markdown ul, .markdown ol {
      margin: 0.75em 0;
      padding-left: 2em;
    }

    .markdown li {
      margin: 0.25em 0;
    }

    .markdown blockquote {
      margin: 0.75em 0;
      padding-left: 1em;
      border-left: 4px solid var(--border-color, #e0e0e0);
      color: var(--text-muted, #666666);
    }

    .markdown img {
      max-width: 100%;
      height: auto;
    }

    .markdown table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.75em 0;
    }

    .markdown th, .markdown td {
      border: 1px solid var(--border-color, #e0e0e0);
      padding: 0.5em;
      text-align: left;
    }

    .markdown th {
      background: var(--background-light, #f5f5f5);
    }
  `;

  private async parseMarkdown(text: string): Promise<string> {
    if (!text) return '';
    const parsed = await marked.parse(text);
    return sanitizeHtml(parsed, {
      allowedTags: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
      allowedAttributes: {
        'a': ['href', 'title'],
        'img': ['src', 'alt', 'title'],
        'table': ['class'],
        'thead': ['class'],
        'tbody': ['class'],
        'tr': ['class'],
        'th': ['class'],
        'td': ['class']
      }
    });
  }

  async connectedCallback() {
    super.connectedCallback();
    if (this.content) {
      this.parsedContent = await this.parseMarkdown(this.content);
    }
  }

  protected async updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('content')) {
      this.parsedContent = await this.parseMarkdown(this.content);
    }
  }

  render() {
    return html`
      <div class="markdown ${this.inline ? 'inline' : ''}">
        ${unsafeHTML(this.parsedContent)}
      </div>
    `;
  }
}
