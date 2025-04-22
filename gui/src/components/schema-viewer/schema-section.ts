import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '../common/fa-icon';
import '../common/markdown-viewer';

// Lazy load components
const PropertyField = () => import('./property-field');

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
  fa_icon?: string;
}

export interface ValidationState {
  default?: boolean;
  enum?: boolean;
  minimum?: boolean;
  maximum?: boolean;
  multipleOf?: boolean;
}

@customElement("schema-section")
export class SchemaSectionElement extends LitElement {
  @property({ type: String })
  name = "";

  @property({ type: String })
  description = "";

  @property({ type: String })
  icon = "";

  @property({ type: Object })
  section: SchemaSection = {};

  @property({ type: Object })
  validation: Record<string, ValidationState> = {};

  private subComponentsLoaded = false;

  async connectedCallback() {
    super.connectedCallback();
    if (!this.subComponentsLoaded) {
      await Promise.all([PropertyField()]);
      this.subComponentsLoaded = true;
      this.requestUpdate();
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    .section {
      background: var(--background-light);
      border-radius: 8px;
      padding: 1.5rem;
      &.border {
        border: 2px solid var(--border-color);
        box-shadow: none;
      }
    }

    .parameters {
      margin-top: 1.5rem;
      padding: 1rem;
      background: var(--background-dark);
      border-radius: 6px;
      border: 1px solid var(--border-color-dark);
    }

    .parameters-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-color);
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
      transition: opacity 0.2s ease-in-out;
    }

    .add-parameter:hover {
      opacity: 0.9;
    }

    .parameter-list {
      display: grid;
      gap: 1rem;
    }

    /* Style nested property-fields differently than the section header */
    .parameter-list ::slotted(property-field) {
      background: var(--background-light);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 0.75rem;
    }
  `;

  private dispatchUpdate(section: SchemaSection) {
    console.log(`Dispatching section update for ${this.name}:`, JSON.stringify(section));

    // Ensure we're sending a clean copy without any circular references or reactive properties
    const cleanSection = JSON.parse(JSON.stringify(section));

    const event = new CustomEvent("section-update", {
      detail: {
        name: this.name,
        section: cleanSection,
      },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private addParameter() {
    const properties = this.section.properties || {};
    const newParam = {
      type: "string",
      description: "",
    };

    // Generate a unique parameter name
    let paramName = "new_parameter";
    let counter = 1;
    while (properties[paramName]) {
      paramName = `new_parameter_${counter}`;
      counter++;
    }

    this.dispatchUpdate({
      ...this.section,
      properties: {
        ...properties,
        [paramName]: newParam,
      },
    });
  }

  private handleNameUpdate(oldName: string, newName: string) {
    console.log(`Updating property name from '${oldName}' to '${newName}'`);
    if (oldName === newName) return;

    // Create new properties object maintaining order
    const properties: Record<string, SchemaProperty> = {};
    const entries = Object.entries(this.section.properties || {});

    for (const [key, value] of entries) {
      if (key === oldName) {
        properties[newName] = value;
      } else {
        properties[key] = value;
      }
    }

    // Update required array if the property was required
    const required = [...(this.section.required || [])];
    const requiredIndex = required.indexOf(oldName);
    if (requiredIndex !== -1) {
      required[requiredIndex] = newName;
    }

    // Create an updated section
    const updatedSection = {
      ...this.section,
      properties,
      required,
    };

    // Dispatch the update
    console.log("Dispatching section update with renamed property:", updatedSection);
    this.dispatchUpdate(updatedSection);
  }

  private handleSectionHeaderUpdate(e: CustomEvent) {
    const { name, property } = e.detail;

    // Update the section with the new header information
    this.dispatchUpdate({
      ...this.section,
      title: name,
      description: property.description || "",  // Ensure we always send a value
      fa_icon: property.fa_icon,
      properties: this.section.properties || {},  // Preserve existing properties
      required: this.section.required || []  // Preserve existing required fields
    });

    // Update local state to reflect changes immediately
    this.name = name;
    this.description = property.description || "";
    this.icon = property.fa_icon || "";
  }

  protected updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("section")) {
      console.log(`Section ${this.name} updated:`, this.section);
      this.requestUpdate();
    }
  }

  render() {
    // Create a SchemaProperty-like object for the section header
    const sectionHeaderProperty: SchemaProperty = {
      type: "string",
      description: this.description,
      fa_icon: this.icon,
    };

    return html`
      <div class="section border">
        <property-field
          .name=${this.name}
          .schemaEntry=${sectionHeaderProperty}
          .required=${false}
          .isSection=${true}
          @property-update=${this.handleSectionHeaderUpdate}
        ></property-field>

        <div class="parameters">
          <div class="parameters-header">
            <button class="add-parameter" @click=${this.addParameter}>
              <fa-icon icon="fas fa-plus"></fa-icon> Add Parameter
            </button>
          </div>

          <div class="parameter-list">
            ${Object.entries(this.section.properties || {}).map(
              ([name, property]) => html`
                <property-field
                  .name=${name}
                  .schemaEntry=${property}
                  .required=${(this.section.required || []).includes(name)}
                  .validation=${this.validation[`${this.name}.${name}`] || {}}
                  .isSection=${false}
                  key=${name}
                  @property-update=${(e: CustomEvent) => {
                    if (e.detail.name !== name) {
                      // Handle name change
                      this.handleNameUpdate(name, e.detail.name);
                    } else {
                      // Handle other property updates
                      const properties = {
                        ...this.section.properties,
                        [name]: e.detail.property,
                      };
                      this.dispatchUpdate({
                        ...this.section,
                        properties,
                      });
                    }
                  }}
                ></property-field>
              `
            )}
          </div>
        </div>
      </div>
    `;
  }
}
