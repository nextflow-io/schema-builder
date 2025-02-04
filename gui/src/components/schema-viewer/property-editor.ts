import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import sanitizeHtml from 'sanitize-html';
import { SchemaProperty } from './schema-section';
import '../common/fa-icon-picker';

interface ValidationState {
  default?: boolean;
  enum?: boolean;
  minimum?: boolean;
  maximum?: boolean;
  multipleOf?: boolean;
}

@customElement('property-editor')
export class PropertyEditor extends LitElement {
  @property({ type: String }) name = '';
  @property({ type: Object }) schemaEntry: SchemaProperty = { type: 'string' };
  @property({ type: Boolean }) required = false;
  @property({ type: Object }) validation: ValidationState = {};

  static schemaTypes = ['string', 'number', 'integer', 'boolean'];
  static stringFormats = ['date-time', 'time', 'date', 'duration', 'email'];

  static styles = css`
    :host {
      display: block;
    }

    .description-textarea,
    .help_text-textarea {
      height: 5rem;
    }

    .form-control:focus {
      width: auto;
    }

    .fit-content {
      width: fit-content;
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
    }

    .close-picker {
      position: absolute;
      top: 0;
      right: 0;
      background: none;
      border: none;
      color: var(--text-color);
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .close-picker:hover {
      background: rgba(0, 0, 0, 0.1);
    }
  `;

  private checkPattern(key: string) {
    if (this.schemaEntry.pattern) {
      if (key === 'default' && this.schemaEntry.default) {
        if (!this.schemaEntry.default.match(this.schemaEntry.pattern)) {
          this.validation = { ...this.validation, default: false };
        } else {
          this.validation = { ...this.validation, default: true };
        }
      } else if (key === 'enum' && this.schemaEntry.enum) {
        for (let i = 0; i < this.schemaEntry.enum.length; i++) {
          if (!this.schemaEntry.enum[i].match(this.schemaEntry.pattern)) {
            this.validation = { ...this.validation, enum: false };
            return;
          }
        }
        this.validation = { ...this.validation, enum: true };
      }
    }
  }

  private checkMultipleOf() {
    if (this.schemaEntry.multipleOf) {
      if (this.schemaEntry.default) {
        this.validation = {
          ...this.validation,
          default: this.schemaEntry.default % this.schemaEntry.multipleOf === 0
        };
      }
      if (this.schemaEntry.minimum) {
        this.validation = {
          ...this.validation,
          minimum: this.schemaEntry.minimum % this.schemaEntry.multipleOf === 0
        };
      }
      if (this.schemaEntry.maximum) {
        this.validation = {
          ...this.validation,
          maximum: this.schemaEntry.maximum % this.schemaEntry.multipleOf === 0
        };
      }
    }
  }

  private dispatchUpdate(propName: string, value: any) {
    // Update the schema entry
    this.schemaEntry = {
      ...this.schemaEntry,
      [propName]: value
    };

    // Run validations
    if (this.schemaEntry.pattern && (propName === 'default' || propName === 'enum')) {
      this.checkPattern(propName);
    }
    if (
      this.schemaEntry.multipleOf &&
      (propName === 'default' || propName === 'minimum' || propName === 'maximum' || propName === 'multipleOf')
    ) {
      this.checkMultipleOf();
    }

    // Dispatch the event
    const event = new CustomEvent('property-update', {
      detail: { propName, value },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  private renderStringOptions() {
    const { schemaEntry } = this;
    return html`
      <div class="col-auto">
        <div class="form-floating">
          <div class="input-group">
            <span class="input-group-text">
              <fa-icon icon="${schemaEntry.fa_icon || 'fas fa-question-circle'}"></fa-icon>
            </span>
            <div class="form-floating">
              <input type="text" class="form-control" placeholder="icon"
                     value="${schemaEntry.fa_icon || 'fas fa-question-circle'}"
                     readonly
                     @click=${this.showIconPicker} />
              <label>icon</label>
            </div>
          </div>
        </div>
      </div>

      <div class="col-auto">
        <div class="form-floating">
          <input type="text"
                 class="form-control"
                 value="${schemaEntry.pattern || ''}"
                 @change=${(e: Event) => this.dispatchUpdate('pattern', (e.target as HTMLInputElement).value)} />
          <label>pattern</label>
        </div>
        <small class="form-text">
          Regular expression, used to validate the input string
          <a href="https://json-schema.org/understanding-json-schema/reference/string.html#regular-expressions"
             target="_blank"
             title="See help about JSON schema regular expressions">
            <i class="fas fa-question-circle"></i>
          </a>
        </small>
      </div>

      <div class="col-auto">
        <div class="form-floating">
          <select @change=${(e: Event) => this.dispatchUpdate('format', (e.target as HTMLSelectElement).value)}>
            <option value="">none</option>
            ${PropertyEditor.stringFormats.map(format => html`
              <option value="${format}" ?selected=${format === schemaEntry.format}>
                ${format}
              </option>
            `)}
          </select>
          <label>format</label>
        </div>
      </div>

      ${this.showingIconPicker ? html`
        <div class="icon-picker-overlay" @click=${this.hideIconPicker}>
          <div class="icon-picker-container" @click=${(e: Event) => e.stopPropagation()}>
            <fa-icon-picker
              .value=${schemaEntry.fa_icon || 'fas fa-question-circle'}
              @icon-select=${this.handleIconSelect}
            ></fa-icon-picker>
            <button class="close-picker" @click=${this.hideIconPicker}>
              <fa-icon icon="fas fa-times"></fa-icon>
            </button>
          </div>
        </div>
      ` : ''}
    `;
  }

  @state()
  private showingIconPicker = false;

  private showIconPicker() {
    this.showingIconPicker = true;
  }

  private hideIconPicker() {
    this.showingIconPicker = false;
  }

  private handleIconSelect(e: CustomEvent) {
    this.dispatchUpdate('fa_icon', e.detail.value);
    this.hideIconPicker();
  }

  private renderNumberOptions() {
    const { schemaEntry, validation } = this;
    return html`
      <div class="col-auto">
        <div class="form-floating">
          <input type="number"
                 class="form-control ${validation.minimum === false ? 'is-invalid' : ''}
                                   ${validation.minimum === true ? 'is-valid' : ''}"
                 value="${schemaEntry.minimum || ''}"
                 step="${schemaEntry.type === 'integer' ? '1' : schemaEntry.multipleOf || '0.1'}"
                 @change=${(e: Event) => this.dispatchUpdate('minimum', (e.target as HTMLInputElement).valueAsNumber)} />
          <label>minimum</label>
        </div>
      </div>

      <div class="col-auto">
        <div class="form-floating">
          <input type="number"
                 class="form-control ${validation.maximum === false ? 'is-invalid' : ''}
                                   ${validation.maximum === true ? 'is-valid' : ''}"
                 value="${schemaEntry.maximum || ''}"
                 min="${schemaEntry.minimum || ''}"
                 step="${schemaEntry.type === 'integer' ? '1' : schemaEntry.multipleOf || '0.1'}"
                 @change=${(e: Event) => this.dispatchUpdate('maximum', (e.target as HTMLInputElement).valueAsNumber)} />
          <label>maximum</label>
        </div>
      </div>

      <div class="col-auto">
        <div class="form-floating">
          <input type="number"
                 class="form-control ${validation.multipleOf === false ? 'is-invalid' : ''}
                                   ${validation.multipleOf === true ? 'is-valid' : ''}"
                 value="${schemaEntry.multipleOf || ''}"
                 min="${schemaEntry.type === 'integer' ? '1' : ''}"
                 @change=${(e: Event) => this.dispatchUpdate('multipleOf', (e.target as HTMLInputElement).valueAsNumber)} />
          <label>multipleOf</label>
        </div>
      </div>
    `;
  }

  render() {
    const { name, schemaEntry, required, validation } = this;
    return html`
      <div class="row border">
        <div class="row">
          <div data-dnd-handle class="col-auto border-end">
            <i class="fas fa-grip-vertical"></i>
          </div>

          <div class="input-group col">
            <span class="input-group-text">
              <i class="${schemaEntry.fa_icon || 'fas fa-question-circle'}"></i>
            </span>
            <div class="form-floating">
              <input type="text" class="form-control" placeholder="icon"
                     value="${schemaEntry.fa_icon || 'fas fa-question-circle'}"
                     readonly
                     @click=${this.showIconPicker} />
              <label>icon</label>
            </div>
          </div>

          <div class="col">
            <div class="form-floating">
              <input type="text" class="form-control" value="${name}"
                     readonly />
              <label>name</label>
            </div>
          </div>

          <div class="col">
            <div class="form-floating">
              <select class="form-select"
                      @change=${(e: Event) => this.dispatchUpdate('type', (e.target as HTMLSelectElement).value)}>
                ${PropertyEditor.schemaTypes.map(type => html`
                  <option value="${type}" ?selected=${type === schemaEntry.type}>
                    ${type}
                  </option>
                `)}
              </select>
              <label>type</label>
            </div>
          </div>

          <div class="col-auto d-flex flex-column">
            <label>
              <input type="checkbox" class="form-check-input"
                     ?checked=${required}
                     @change=${(e: Event) => this.dispatchUpdate('required', (e.target as HTMLInputElement).checked)} />
              required
            </label>
            <label>
              <input type="checkbox" class="form-check-input"
                     ?checked=${schemaEntry.hidden}
                     @change=${(e: Event) => this.dispatchUpdate('hidden', (e.target as HTMLInputElement).checked)} />
              hidden
            </label>
          </div>
        </div>

        <div class="row">
          <div class="col">
            <div class="form-floating">
              <textarea class="description-textarea"
                        placeholder="description"
                        @change=${(e: Event) => this.dispatchUpdate('description', (e.target as HTMLTextAreaElement).value)}>
                ${sanitizeHtml(schemaEntry.description || '')}
              </textarea>
              <label>description</label>
            </div>
          </div>
        </div>

        <div class="row">
          <div class="col">
            <div class="form-floating">
              <textarea class="help_text-textarea"
                        placeholder="help text"
                        @change=${(e: Event) => this.dispatchUpdate('help_text', (e.target as HTMLTextAreaElement).value)}>
                ${sanitizeHtml(schemaEntry.help_text || '')}
              </textarea>
              <label>help text</label>
            </div>
          </div>
        </div>

        <div class="row">
          <div class="col">
            <div class="form-floating">
              ${schemaEntry.type === 'boolean' ? html`
                <input type="checkbox"
                       class="form-check-input ${validation.default === false ? 'is-invalid' : ''}
                                              ${validation.default === true ? 'is-valid' : ''}"
                       .checked=${schemaEntry.default}
                       @change=${(e: Event) => this.dispatchUpdate('default', (e.target as HTMLInputElement).checked)} />
                <label>default</label>
              ` : html`
                <input type="${schemaEntry.type === 'integer' || schemaEntry.type === 'number' ? 'number' : 'text'}"
                       class="form-control w-auto ${validation.default === false ? 'is-invalid' : ''}
                                                ${validation.default === true ? 'is-valid' : ''}"
                       value="${schemaEntry.default || ''}"
                       @input=${(e: Event) => this.dispatchUpdate('default', (e.target as HTMLInputElement).value)} />
                <label>default</label>
              `}
            </div>
          </div>

          <div class="col-auto">
            <div class="form-floating">
              <input type="text"
                     class="form-control fit-content ${validation.enum === false ? 'is-invalid' : ''}
                                                   ${validation.enum === true ? 'is-valid' : ''}"
                     value="${schemaEntry.enum ? schemaEntry.enum.join(', ') : ''}"
                     placeholder="value1, value2, value3"
                     @change=${(e: Event) => {
                       const value = (e.target as HTMLInputElement).value;
                       this.dispatchUpdate('enum', value ? value.split(',').map(s => s.trim()) : undefined);
                     }} />
              <label>enum</label>
            </div>
          </div>

          ${schemaEntry.type === 'string' ? this.renderStringOptions() : ''}
          ${(schemaEntry.type === 'number' || schemaEntry.type === 'integer') ? this.renderNumberOptions() : ''}
        </div>

        <slot name="delete"></slot>
      </div>
    `;
  }
}
