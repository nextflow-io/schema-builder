import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import './property-editor';
import './property-viewer';

export interface SchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
  default?: any;
  enum?: any[];
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  fa_icon?: string;
  help_text?: string;
  hidden?: boolean;
}

export interface SchemaSection {
  title?: string;
  description?: string;
  properties?: Record<string, any>;
  required?: string[];
}

export interface ValidationState {
  default?: boolean;
  enum?: boolean;
  minimum?: boolean;
  maximum?: boolean;
  multipleOf?: boolean;
}

@customElement('schema-section')
export class SchemaSectionElement extends LitElement {
  @property({ type: String })
  name = '';

  @property({ type: Object })
  section: SchemaSection = {};

  @property({ type: Object })
  validation: Record<string, ValidationState> = {};

  static styles = css`
    :host {
      display: block;
    }

    .section {
      background: var(--background-light);
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      padding: 1.5rem;
    }

    .section-header {
      margin-bottom: 2rem;
    }

    .section-title {
      font-size: 1.25rem;
      color: var(--primary-color);
      margin: 0 0 0.5rem 0;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #333;
    }

    input, textarea {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-family: inherit;
      font-size: 1rem;
    }

    textarea {
      min-height: 100px;
      resize: vertical;
    }

    .parameters {
      margin-top: 2rem;
    }

    .parameters-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .add-parameter {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--primary-color);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
    }

    .add-parameter:hover {
      opacity: 0.9;
    }

    .parameter-list {
      display: grid;
      gap: 1rem;
    }
  `;

  private handleTitleChange(e: Event) {
    const input = e.target as HTMLInputElement;
    this.dispatchUpdate({
      ...this.section,
      title: input.value
    });
  }

  private handleDescriptionChange(e: Event) {
    const input = e.target as HTMLTextAreaElement;
    this.dispatchUpdate({
      ...this.section,
      description: input.value
    });
  }

  private dispatchUpdate(section: SchemaSection) {
    const event = new CustomEvent('section-update', {
      detail: {
        name: this.name,
        section
      },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  private addParameter() {
    const properties = this.section.properties || {};
    const newParam = {
      type: 'string',
      description: ''
    };

    // Generate a unique parameter name
    let paramName = 'new_parameter';
    let counter = 1;
    while (properties[paramName]) {
      paramName = `new_parameter_${counter}`;
      counter++;
    }

    this.dispatchUpdate({
      ...this.section,
      properties: {
        ...properties,
        [paramName]: newParam
      }
    });
  }

  render() {
    if (this.name === 'general') {
      return html`
        <div class="section">
          <div class="section-header">
            <h2 class="section-title">General Settings</h2>
          </div>

          <div class="form-group">
            <label for="title">Schema Title</label>
            <input
              type="text"
              id="title"
              .value=${this.section.title || ''}
              @input=${this.handleTitleChange}
              placeholder="Enter schema title"
            >
          </div>

          <div class="form-group">
            <label for="description">Schema Description</label>
            <textarea
              id="description"
              .value=${this.section.description || ''}
              @input=${this.handleDescriptionChange}
              placeholder="Enter schema description"
            ></textarea>
          </div>
        </div>
      `;
    }

    return html`
      <div class="section">
        <div class="section-header">
          <h2 class="section-title">${this.name} Parameters</h2>
        </div>

        <div class="parameters">
          <div class="parameters-header">
            <h3>Parameters</h3>
            <button class="add-parameter" @click=${this.addParameter}>
              <fa-icon icon="fas fa-plus"></fa-icon> Add Parameter
            </button>
          </div>

          <div class="parameter-list">
            ${Object.entries(this.section.properties || {}).map(([name, property]) => html`
              <property-viewer
                .name=${name}
                .schemaEntry=${property}
              ></property-viewer>
              <property-editor
                .name=${name}
                .schemaEntry=${property}
                .validation=${this.validation[`${this.name}.${name}`] || {}}
                @property-update=${(e: CustomEvent) => {
                  const properties = {
                    ...this.section.properties,
                    [name]: e.detail.property
                  };
                  this.dispatchUpdate({
                    ...this.section,
                    properties
                  });
                }}
                @property-delete=${() => {
                  const { [name]: _, ...rest } = this.section.properties || {};
                  this.dispatchUpdate({
                    ...this.section,
                    properties: rest
                  });
                }}
              ></property-editor>
            `)}
          </div>
        </div>
      </div>
    `;
  }
}
