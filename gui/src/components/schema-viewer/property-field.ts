import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { SchemaProperty } from './schema-section';
import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';
import '../common/fa-icon-picker';
import '../common/regex-tester';
import '../common/markdown-viewer';

type EditableFields = keyof SchemaProperty;

@customElement('property-field')
export class PropertyField extends LitElement {
  @property({ type: String }) name = '';
  @property({ type: Object }) schemaEntry: SchemaProperty = { type: 'string', hidden: false };
  @property({ type: Boolean }) required = false;
  @property({ type: Object }) validation = {};
  @state() private editingField: string | null = null;
  @state() private showingIconPicker = false;
  @state() private pendingChanges: Partial<SchemaProperty> = {};
  @state() private pendingName: string | null = null;
  @query('input, textarea, select') private inputElement?: HTMLElement;
  @state() private processedDescription = '';
  @state() private processedHelpText = '';

  private handleGlobalEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (this.editingField || this.showingIconPicker) {
        e.preventDefault();
        this.cancelEdit();
        this.showingIconPicker = false;
      }
    }
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleGlobalEscape);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleGlobalEscape);
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
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
      cursor: pointer;
    }

    .property-name {
      font-weight: bold;
      font-size: 1.1rem;
    }

    .field-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      width: 100%;
      min-height: 32px;
      & .markdown {
        width: 100%;
      }
    }

    .cancel-button {
      padding: 0.25rem;
      border: none;
      background: none;
      cursor: pointer;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      margin-left: 0.25rem;
    }

    .cancel-button:hover {
      color: var(--text-color);
    }

    .property-type, .property-required, .hidden-badge {
      font-size: 0.9rem;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      height: 28px;
      display: inline-flex;
      align-items: center;
    }

    .property-type {
      color: #666;
      background: #f8f9fa;
      border: none;
    }

    select.property-type {
      cursor: pointer;
    }

    .property-type:hover {
      background: #e9ecef;
    }

    .hidden-badge {
      color: #666;
      background: #f8f9fa;
    }

    .field-wrapper:hover .edit-button {
      opacity: 1;
    }

    .edit-button {
      position: absolute;
      top: 0;
      right: 0;
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
      background: var(--background-light);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 0.25rem 0.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.9rem;
      color: var(--text-muted);
    }

    .edit-button:hover {
      background: var(--background-hover);
    }

    .field-editor {
      width: 100%;
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 32px;
    }

    .field-editor .actions {
      display: inline-flex;
      gap: 0.25rem;
      margin-left: 0.5rem;
    }

    .field-editor .cancel-button {
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.9rem;
      color: var(--text-muted);
    }

    .field-editor .cancel-button:hover {
      background: var(--background-hover);
    }

    .field-editor textarea {
      width: 100%;
      min-height: 100px;
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-family: inherit;
      resize: vertical;
    }

    .field-editor input,
    .field-editor select {
      height: 32px;
      box-sizing: border-box;
    }

    .field-editor input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
    }

    .field-editor select {
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
    }

    .icon-picker-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .icon-picker-container {
      position: relative;
      background: var(--background-light);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 90vw;
      max-height: 90vh;
      overflow: auto;
      padding: 1rem;
    }

    .close-picker {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.5rem;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .save-button, .cancel-button {
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
    }

    .save-button {
      background: var(--primary-color);
      color: white;
      border: none;
    }

    .toggle-label {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      cursor: pointer;
    }

    .toggle-label input[type="checkbox"] {
      margin: 0;
    }

    .code {
      font-family: monospace;
      background: var(--background-light);
    }

    .pattern-editor {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: 100%;
      font-family: monospace;
    }

    .pattern-editor input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-family: monospace;
    }

    .field-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: capitalize;
      margin-bottom: 0.25rem;
      height: 16px;
      line-height: 16px;
      display: block;
    }

    .field-group {
      display: flex;
      flex-direction: column;
      width: 100%;
      min-height: 48px;
    }

    .field-content {
      width: 100%;
      min-height: 32px;
      display: flex;
      align-items: center;
    }

    .input-invalid {
      border-color: var(--error-color) !important;
    }

    .validation-message {
      color: var(--error-color);
      font-size: 0.8rem;
      margin-top: 0.25rem;
    }
  `;

  private handlePropertyUpdate(field: EditableFields, value: any) {
    console.log(`Updating property '${this.name}.${field}' to:`, value);

    // Create a clean copy of the schema entry
    const updatedEntry = JSON.parse(JSON.stringify({
      ...this.schemaEntry,
      [field]: value
    }));

    // Send the update event to the parent
    const event = new CustomEvent('property-update', {
      detail: {
        name: this.name,
        property: updatedEntry
      },
      bubbles: true,
      composed: true
    });

    // Dispatch the event
    console.log(`Dispatching property-update event for ${this.name}:`, updatedEntry);
    this.dispatchEvent(event);

    // Update local state
    this.schemaEntry = updatedEntry;
    this.editingField = null;
    this.pendingChanges = {};

    // Force a re-render
    this.requestUpdate();
  }

  private handleNameUpdate(newName: string) {
    console.log(`Updating property name from '${this.name}' to '${newName}'`);

    if (newName === this.name) return;

    // Create a clean copy of the schema entry
    const property = JSON.parse(JSON.stringify(this.schemaEntry));

    // Send the update event to the parent
    const event = new CustomEvent('property-update', {
      detail: {
        name: newName,
        property: property
      },
      bubbles: true,
      composed: true
    });

    // Dispatch the event
    console.log(`Dispatching name-update event from ${this.name} to ${newName}`);
    this.dispatchEvent(event);

    // Update local state
    this.editingField = null;
    this.pendingName = null;

    // Schedule a name update after the event has been processed
    setTimeout(() => {
      this.name = newName;
      this.requestUpdate();
      console.log('Name updated in component to:', this.name);
    }, 50);
  }

  private handleInputChange(field: EditableFields, value: any) {
    this.pendingChanges = {
      ...this.pendingChanges,
      [field]: value
    };
  }

  private cancelEdit() {
    this.editingField = null;
    this.pendingChanges = {};
    this.pendingName = null;
  }

  private saveEdit(field: EditableFields) {
    if (field in this.pendingChanges) {
      this.handlePropertyUpdate(field, this.pendingChanges[field]);
    }
  }

  private async parseMarkdown(text: string | undefined): Promise<string> {
    if (!text) return '';
    const parsed = await marked.parse(text);
    return sanitizeHtml(parsed, {
      allowedTags: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li'],
      allowedAttributes: {}
    });
  }

  protected async updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('editingField') && this.editingField) {
      setTimeout(() => this.inputElement?.focus(), 0);
    }

    if (changedProperties.has('name')) {
      console.log(`Property name changed to: ${this.name}`);
      this.requestUpdate();
    }

    if (changedProperties.has('schemaEntry')) {
      console.log('schemaEntry updated:', this.schemaEntry);
      this.processedDescription = await this.parseMarkdown(this.schemaEntry.description);
      this.processedHelpText = await this.parseMarkdown(this.schemaEntry.help_text);

      // Force a complete re-render of the component
      this.requestUpdate();

    }
  }

  private handleKeyDown(e: KeyboardEvent, field: EditableFields) {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.target instanceof HTMLTextAreaElement) {
        return;
      }
      e.preventDefault();
      this.saveEdit(field);
    }
  }

  private validateAgainstPattern(value: string): boolean {
    if (!this.schemaEntry.pattern || !value) return true;
    try {
      const regex = new RegExp(this.schemaEntry.pattern);
      return regex.test(value);
    } catch (e) {
      return false;
    }
  }

  private renderFieldEditor(field: EditableFields) {
    const value = this.pendingChanges[field] ?? this.schemaEntry[field];
    const isNumeric = field === 'minimum' || field === 'maximum' || field === 'multipleOf';

    if (field === 'type') {
      return html`
        <select
          autofocus
          .value=${value}
          @change=${(e: Event) => this.handleInputChange(field, (e.target as HTMLSelectElement).value)}
        >
          ${['string', 'number', 'integer', 'boolean'].map(type => html`
            <option value=${type} ?selected=${type === value}>${type}</option>
          `)}
        </select>
      `;
    }

    if (field === 'description' || field === 'help_text') {
      return html`
        <textarea
          autofocus
          .value=${value || ''}
          @input=${(e: Event) => this.handleInputChange(field, (e.target as HTMLTextAreaElement).value)}
          @keydown=${(e: KeyboardEvent) => this.handleKeyDown(e, field)}
        ></textarea>
      `;
    }

    if (field === 'default' || isNumeric) {
      if (this.schemaEntry.type === 'boolean') {
        return html`
          <select
            autofocus
            .value=${value || 'false'}
            @change=${(e: Event) => this.handleInputChange(field, (e.target as HTMLSelectElement).value)}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        `;
      }

      const isDefaultField = field === 'default';
      const isInvalid = isDefaultField && this.schemaEntry.type === 'string' &&
                       !this.validateAgainstPattern(value);

      return html`
        <div>
          <input
            autofocus
            type=${this.schemaEntry.type === 'number' || this.schemaEntry.type === 'integer' || isNumeric ? 'number' : 'text'}
            class=${isInvalid ? 'input-invalid' : ''}
            .value=${value || ''}
            @input=${(e: Event) => {
              const input = e.target as HTMLInputElement;
              let newValue: string | number = input.value;
              if (isNumeric && newValue) {
                newValue = Number(newValue);
              }
              this.handleInputChange(field, newValue);
            }}
            @keydown=${(e: KeyboardEvent) => this.handleKeyDown(e, field)}
          >
          ${isInvalid ? html`
            <div class="validation-message">
              Default value does not match pattern: <code>${this.schemaEntry.pattern}</code>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (field === 'pattern') {
      return html`
        <div class="pattern-editor">
          <input
            autofocus
            type="text"
            placeholder="Regular expression pattern"
            .value=${value || ''}
            @input=${(e: Event) => this.handleInputChange(field, (e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => this.handleKeyDown(e, field)}
          >
          <regex-tester
            .pattern=${value || ''}
            .defaultValue=${this.schemaEntry.default || ''}
          ></regex-tester>
        </div>
      `;
    }

    return html`
      <input
        autofocus
        type="text"
        .value=${value || ''}
        @input=${(e: Event) => this.handleInputChange(field, (e.target as HTMLInputElement).value)}
        @keydown=${(e: KeyboardEvent) => this.handleKeyDown(e, field)}
      >
    `;
  }

  private renderField(field: string, defaultContent: any, isMarkdown = false) {
    const label = field.replace(/([A-Z])/g, ' $1').toLowerCase();
    const content = (field in this.schemaEntry && this.schemaEntry[field as keyof SchemaProperty] !== undefined)
      ? this.schemaEntry[field as keyof SchemaProperty]
      : defaultContent;

    return html`
      <div class="field-group">
        <div class="field-label">${label}</div>
        <div class="field-wrapper">
          ${this.editingField === field
            ? html`
                <div class="field-editor">
                  ${this.renderFieldEditor(field as EditableFields)}
                  <div class="actions">
                    <button
                      class="save-button"
                      @click=${() => this.saveEdit(field as EditableFields)}
                      ?disabled=${!(field in this.pendingChanges)}
                    >
                      <fa-icon icon="fas fa-check"></fa-icon>
                      Save
                    </button>
                    <button class="cancel-button" @click=${() => this.cancelEdit()}>
                      <fa-icon icon="fas fa-times"></fa-icon>
                      Cancel
                    </button>
                  </div>
                </div>
              `
            : html`
                <div class='field-content' @click=${() => (this.editingField = field)}>
                  ${isMarkdown
                    ? html`<markdown-viewer .content=${content}></markdown-viewer>`
                    : field === 'pattern'
                      ? html`<code>${content}</code>`
                      : content}
                </div>
              `}
        </div>
      </div>
    `;
  }

  private renderTypeField() {
    return html`
      <div class="field-group">
        <div class="field-label">Type</div>
        <div class="field-wrapper" @click=${() => this.editingField = 'type'}>
          ${this.editingField === 'type'
            ? html`
              <select
                class="property-type"
                .value=${this.schemaEntry.type}
                @change=${(e: Event) => {
                  this.handlePropertyUpdate('type', (e.target as HTMLSelectElement).value);
                  this.editingField = null;
                }}
              >
                ${['string', 'number', 'integer', 'boolean'].map(type => html`
                  <option value=${type} ?selected=${type === this.schemaEntry.type}>${type}</option>
                `)}
              </select>
              ${this.renderCancelButton()}
            `
            : html`<span class="property-type">${this.schemaEntry.type}</span>`
          }
        </div>
      </div>
    `;
  }

  private renderRequiredField() {
    return html`
      <div class="field-group">
        <div class="field-label">Required</div>
        <div class="field-wrapper" @click=${() => this.editingField = 'required'}>
          ${this.editingField === 'required'
            ? html`
              <select
                autofocus
                class="property-type"
                .value=${this.required ? 'true' : 'false'}
                @change=${(e: Event) => {
                  const isRequired = (e.target as HTMLSelectElement).value === 'true';
                  this.dispatchEvent(new CustomEvent('required-update', {
                    detail: { name: this.name, required: isRequired },
                    bubbles: true,
                    composed: true
                  }));
                  this.editingField = null;
                }}
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
              ${this.renderCancelButton()}
            `            : html`<span class="property-required">${this.required ? 'true' : 'false'}</span>`}
        </div>
      </div>
    `;
  }

  private renderHiddenField() {
    return html`
      <div class="field-group">
        <div class="field-label">Hidden</div>
        <div class="field-wrapper" @click=${() => this.editingField = 'hidden'}>
          ${this.editingField === 'hidden'
            ? html`
              <select
                class="property-type"
                .value=${this.schemaEntry.hidden ? 'true' : 'false'}
                @change=${(e: Event) => {
                  this.handlePropertyUpdate('hidden', (e.target as HTMLSelectElement).value === 'true');
                  this.editingField = null;
                }}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
              ${this.renderCancelButton()}
            `
            : html`<span class="hidden-badge">${this.schemaEntry.hidden ? 'true' : 'false'}</span>`}
        </div>
      </div>
    `;
  }

  private renderCancelButton() {
    return html`
      <button class="cancel-button" @click=${(e: Event) => {
        e.stopPropagation();
        this.cancelEdit();
      }}>
        <fa-icon icon="fas fa-times"></fa-icon>
      </button>
    `;
  }

  private renderIconPicker() {
    if (!this.showingIconPicker) return '';
    return html`
      <div class="icon-picker-overlay" @click=${() => this.showingIconPicker = false}>
        <div class="icon-picker-container" @click=${(e: Event) => e.stopPropagation()}>
          <button class="close-picker" @click=${() => this.showingIconPicker = false}>
            <fa-icon icon="fas fa-times"></fa-icon>
          </button>
          <fa-icon-picker
            .value=${this.schemaEntry.fa_icon || 'fas fa-question-circle'}
            @icon-select=${(e: CustomEvent) => {
              this.handlePropertyUpdate('fa_icon', e.detail.value);
              this.showingIconPicker = false;
            }}
          ></fa-icon-picker>
        </div>
      </div>
    `;
  }

  private renderNameField() {
    return html`
      <div class="field-group">
        <div class="field-label">Name</div>
        <div class="field-wrapper">
          ${this.editingField === "name"
            ? html`
                <div class="field-editor">
                  <input
                    autofocus
                    type="text"
                    .value=${this.pendingName ?? this.name}
                    @input=${(e: Event) => {
                      this.pendingName = (e.target as HTMLInputElement).value;
                    }}
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (this.pendingName) {
                          this.handleNameUpdate(this.pendingName);
                        }
                      }
                    }}
                  />
                  <div class="actions">
                    <button
                      class="save-button"
                      @click=${() => {
                        if (this.pendingName) {
                          this.handleNameUpdate(this.pendingName);
                        }
                      }}
                      ?disabled=${!this.pendingName || this.pendingName === this.name}
                    >
                      <fa-icon icon="fas fa-check"></fa-icon>
                      Save
                    </button>
                    <button
                      class="cancel-button"
                      @click=${() => {
                        this.pendingName = null;
                        this.cancelEdit();
                      }}
                    >
                      <fa-icon icon="fas fa-times"></fa-icon>
                      Cancel
                    </button>
                  </div>
                </div>
              `
            : html`<div class="field-content" @click=${() => (this.editingField = "name")}>
                ${this.name || ""}
              </div>`}
        </div>
      </div>
    `;
  }

  render() {

    const { name, schemaEntry } = this;
    const iconName = schemaEntry.fa_icon || 'fas fa-question-circle';
    const isNumeric = schemaEntry.type === 'number' || schemaEntry.type === 'integer';

    return html`
      <div class="property-container">
        <div class="property-header">
          <fa-icon class="property-icon" icon=${iconName} @click=${() => this.showingIconPicker = true}></fa-icon>
          ${this.renderNameField()}
          ${this.renderTypeField()}
          ${this.renderRequiredField()}
          ${this.renderHiddenField()}
        </div>

        ${schemaEntry.description
          ? this.renderField('description', schemaEntry.description, true)
          : this.renderField('description', 'Add description...')}

        ${schemaEntry.help_text
          ? this.renderField('help_text', schemaEntry.help_text, true)
          : this.renderField('help_text', 'Add help text...')}

        ${this.renderField('default', schemaEntry.default)}

        ${isNumeric ? html`
          ${schemaEntry.minimum !== undefined ? this.renderField('minimum', schemaEntry.minimum) : this.renderField('minimum', 'Add minimum...')}
          ${schemaEntry.maximum !== undefined ? this.renderField('maximum', schemaEntry.maximum) : this.renderField('maximum', 'Add maximum...')}
          ${schemaEntry.multipleOf !== undefined ? this.renderField('multipleOf', schemaEntry.multipleOf) : this.renderField('multipleOf', 'Add multiple of...')}
        ` : ''}

        ${schemaEntry.type === 'string' ? html`
          ${schemaEntry.pattern !== undefined ? this.renderField('pattern', schemaEntry.pattern) : this.renderField('pattern', 'Add pattern...')}
        ` : ''}

        ${this.renderIconPicker()}
      </div>
    `;
  }
}
