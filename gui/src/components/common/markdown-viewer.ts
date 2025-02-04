import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

@customElement('markdown-viewer')
export class MarkdownViewer extends LitElement {
  @property({ type: String }) content = '';
  @property({ type: Boolean }) inline = false;

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .markdown {
      width: 100%;
    }

    .markdown.inline {
      display: inline;
    }

    .markdown p:first-child {
      margin-top: 0;
    }

    .markdown p:last-child {
      margin-bottom: 0;
    }
  `;

  private async parseMarkdown(text: string): Promise<string> {
    if (!text) return '';
    const parsed = await marked.parse(text);
    return sanitizeHtml(parsed, {
      allowedTags: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li'],
      allowedAttributes: {}
    });
  }

  protected async updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('content')) {
      const parsedContent = await this.parseMarkdown(this.content);
      const container = this.shadowRoot?.querySelector('.markdown');
      if (container) {
        container.innerHTML = parsedContent;
      }
    }
  }

  render() {
    return html`
      <div class="markdown ${this.inline ? 'inline' : ''}"></div>
    `;
  }
}
