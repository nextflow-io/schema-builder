import { LitElement, html, css } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import "../common/fa-icon";
import "../common/markdown-viewer";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";

// Lazy load components
const PropertyField = () => import("./property-field");

export interface SchemaProperty {
  type: "string" | "number" | "integer" | "boolean";
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

  @state() private isDragging = false;
  @state() private isDragOver = false;
  @query(".section") private sectionElement?: HTMLElement;
  @query(".section-drag-handle") private dragHandleElement?: HTMLElement;

  private subComponentsLoaded = false;
  private cleanupDragAndDrop?: () => void;

  async connectedCallback() {
    super.connectedCallback();
    if (!this.subComponentsLoaded) {
      await Promise.all([PropertyField()]);
      this.subComponentsLoaded = true;
      this.requestUpdate();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupDragAndDrop?.();
  }

  private setupDragAndDrop() {
    if (!this.sectionElement || !this.dragHandleElement) {
      console.log("Section drag setup skipped", {
        hasSection: !!this.sectionElement,
        hasHandle: !!this.dragHandleElement,
      });
      return;
    }

    console.log("Setting up section drag and drop for:", this.name);

    this.cleanupDragAndDrop = combine(
      draggable({
        element: this.sectionElement,
        dragHandle: this.dragHandleElement,
        getInitialData: () => {
          console.log("Getting section drag data for:", this.name);
          return { name: this.name, type: "schema-section" };
        },
        onDragStart: () => {
          console.log("Section drag started:", this.name);
          this.isDragging = true;
        },
        onDrop: () => {
          console.log("Section drag ended:", this.name);
          this.isDragging = false;
        },
      }),
      dropTargetForElements({
        element: this.sectionElement,
        canDrop: ({ source }) => {
          return (
            (source.data.type === "schema-section" &&
              source.data.name !== this.name) ||
            source.data.type === "property-field"
          );
        },
        onDragEnter: () => {
          console.log("Drag enter section:", this.name);
          this.isDragOver = true;
        },
        onDragLeave: () => {
          console.log("Drag leave section:", this.name);
          this.isDragOver = false;
        },
        onDrop: ({ source }) => {
          this.isDragOver = false;
          const draggedName = source.data.name as string;

          if (
            source.data.type === "schema-section" &&
            draggedName !== this.name
          ) {
            this.dispatchEvent(
              new CustomEvent("section-reorder", {
                detail: { draggedName, targetName: this.name },
                bubbles: true,
                composed: true,
              }),
            );
          } else if (source.data.type === "property-field") {
            // Handle property dropped onto section (add to end)
            this.dispatchEvent(
              new CustomEvent("property-move-to-section", {
                detail: { propertyName: draggedName, targetSection: this.name },
                bubbles: true,
                composed: true,
              }),
            );
          }
        },
      }),
    );
  }

  static styles = css`
    :host {
      display: block;
    }

    .section {
      background: var(--background-light);
      border-radius: 8px;
      padding: 1.5rem;
      transition:
        opacity 0.2s,
        border-color 0.2s,
        box-shadow 0.2s;
      &.border {
        border: 2px solid var(--border-color);
        box-shadow: none;
      }
    }

    .section.is-dragging {
      opacity: 0.5;
    }

    .section.is-drag-over {
      border-color: var(--primary-color) !important;
      box-shadow: 0 0 0 3px rgba(26, 150, 85, 0.25) !important;
      position: relative;
    }

    .section.is-drag-over::after {
      content: "Drop property here";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--primary-color);
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      font-weight: 700;
      font-size: 1.1rem;
      pointer-events: none;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .section-drag-handle {
      cursor: grab;
      color: var(--text-muted);
      padding: 0.5rem;
      margin: -0.5rem 0.5rem -0.5rem -0.5rem;
      display: inline-flex;
      align-items: center;
      font-size: 1.2rem;
      opacity: 0.4;
      transition: opacity 0.2s;
    }

    .section-drag-handle:hover {
      opacity: 0.8;
    }

    .section-drag-handle:active {
      cursor: grabbing;
    }

    .section-drag-handle * {
      pointer-events: none;
      user-select: none;
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
    console.log(
      `Dispatching section update for ${this.name}:`,
      JSON.stringify(section),
    );

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
    console.log(
      "Dispatching section update with renamed property:",
      updatedSection,
    );
    this.dispatchUpdate(updatedSection);
  }

  private handleSectionHeaderUpdate(e: CustomEvent) {
    const { name, property } = e.detail;

    // Update the section with the new header information
    this.dispatchUpdate({
      ...this.section,
      title: name,
      description: property.description || "", // Ensure we always send a value
      fa_icon: property.fa_icon,
      properties: this.section.properties || {}, // Preserve existing properties
      required: this.section.required || [], // Preserve existing required fields
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

    // Set up drag and drop after first render
    if (
      this.sectionElement &&
      this.dragHandleElement &&
      !this.cleanupDragAndDrop
    ) {
      this.setupDragAndDrop();
    }
  }

  private handlePropertyReorder(e: CustomEvent) {
    e.stopPropagation();
    const { draggedName, targetName } = e.detail;
    console.log(`Reordering: ${draggedName} -> ${targetName}`);

    const properties = this.section.properties || {};
    const propertyKeys = Object.keys(properties);
    const draggedIndex = propertyKeys.indexOf(draggedName);
    const targetIndex = propertyKeys.indexOf(targetName);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Create new ordered properties object
    const newPropertyKeys = [...propertyKeys];
    newPropertyKeys.splice(draggedIndex, 1);
    newPropertyKeys.splice(targetIndex, 0, draggedName);

    const reorderedProperties: Record<string, SchemaProperty> = {};
    for (const key of newPropertyKeys) {
      reorderedProperties[key] = properties[key];
    }

    // Dispatch the update with reordered properties
    this.dispatchUpdate({
      ...this.section,
      properties: reorderedProperties,
    });
  }

  render() {
    // Create a SchemaProperty-like object for the section header
    const sectionHeaderProperty: SchemaProperty = {
      type: "string",
      description: this.description,
      fa_icon: this.icon,
    };

    return html`
      <div
        class="section border ${this.isDragging ? "is-dragging" : ""} ${this
          .isDragOver
          ? "is-drag-over"
          : ""}"
      >
        <fa-icon
          class="section-drag-handle"
          icon="fas fa-grip-vertical"
        ></fa-icon>
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
                  .sectionName=${this.name}
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
                  @property-reorder=${this.handlePropertyReorder}
                  @property-move-between-sections=${(e: CustomEvent) => {
                    // Bubble up to parent to handle cross-section moves
                    e.stopPropagation();
                    this.dispatchEvent(
                      new CustomEvent("property-move-between-sections", {
                        detail: e.detail,
                        bubbles: true,
                        composed: true,
                      }),
                    );
                  }}
                ></property-field>
              `,
            )}
          </div>
        </div>
      </div>
    `;
  }
}
