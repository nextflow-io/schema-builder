import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import '../common/fa-icon';
import { SchemaProperty } from "./schema-section";
import '../common/markdown-viewer';

@customElement("property-viewer")
export class PropertyViewer extends LitElement {
  @property({ type: String }) name = "";
  @property({ type: Object }) schemaEntry: SchemaProperty = { type: "string" };
  @property({ type: Boolean }) required = false;

  static styles = css`
    :host {
      display: block;
      margin-bottom: 1rem;
    }

    .property-container {
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 1rem;
    }

    .property-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .property-icon {
      font-size: 1.2rem;
      width: 24px;
      text-align: center;
    }

    .property-name {
      font-weight: bold;
      font-size: 1.1rem;
    }

    .property-type {
      color: #666;
      font-size: 0.9rem;
      padding: 0.2rem 0.5rem;
      background: #f8f9fa;
      border-radius: 4px;
    }

    .property-required {
      color: #dc3545;
      font-size: 0.8rem;
    }

    .property-description {
      margin-bottom: 0.5rem;
    }

    .property-help {
      font-size: 0.9rem;
      font-style: italic;
    }

    .property-constraints {
      margin-top: 0.5rem;
      font-size: 0.9rem;
    }

    .property-default {
      margin-top: 0.5rem;
      font-size: 0.9rem;
    }

    .hidden-badge {
      background: #6c757d;
      color: white;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
  `;

  private renderConstraints() {
    const { schemaEntry } = this;
    const constraints: { content: string; tag: string }[] = [];

    if (schemaEntry.type === "string") {
      if (schemaEntry.pattern) {
        constraints.push({ content: `Pattern: ${schemaEntry.pattern}`, tag: "code" });
      }
      if (schemaEntry.format) {
        constraints.push({ content: `Format: ${schemaEntry.format}`, tag: "span" });
      }
    }

    if (schemaEntry.type === "number" || schemaEntry.type === "integer") {
      if (schemaEntry.minimum !== undefined) {
        constraints.push({ content: `Min: ${schemaEntry.minimum}`, tag: "span" });
      }
      if (schemaEntry.maximum !== undefined) {
        constraints.push({ content: `Max: ${schemaEntry.maximum}`, tag: "span" });
      }
      if (schemaEntry.multipleOf !== undefined) {
        constraints.push({ content: `Multiple of: ${schemaEntry.multipleOf}`, tag: "span" });
      }
    }

    if (schemaEntry.enum) {
      constraints.push({ content: `Allowed values: ${schemaEntry.enum.join(", ")}`, tag: "span" });
    }

    return constraints.length
      ? html`${constraints.map(
          (c) => html` <div class="property-constraints">
            <${c.tag}>${c.content}</${c.tag}>
          </div>`
        )}`
      : "";
  }

  render() {
    const { name, schemaEntry, required } = this;
    const iconName = schemaEntry.fa_icon ? schemaEntry.fa_icon : "fas question-circle";

    return html`
      <div class="property-container">
        <div class="property-header">
          <fa-icon class="property-icon" icon=${iconName}></fa-icon>
          <span class="property-name">${name}</span>
          <span class="property-type">${schemaEntry.type}</span>
          ${required ? html`<span class="property-required">required</span>` : ""}
          ${schemaEntry.hidden ? html`<span class="hidden-badge">hidden</span>` : ""}
        </div>

        ${schemaEntry.description
          ? html` <div class="property-description">
              <markdown-viewer .content=${schemaEntry.description}></markdown-viewer>
            </div> `
          : ""}
        ${schemaEntry.help_text
          ? html` <div class="property-help">
              <markdown-viewer .content=${schemaEntry.help_text}></markdown-viewer>
            </div> `
          : ""}
        ${this.renderConstraints()}
        ${schemaEntry.default !== undefined
          ? html`
              <div class="property-default">
                Default:
                ${typeof schemaEntry.default === "boolean"
                  ? schemaEntry.default
                    ? "true"
                    : "false"
                  : schemaEntry.default}
              </div>
            `
          : ""}
      </div>
    `;
  }
}
