import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { library } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';
import './fa-icon';

@customElement('fa-icon-picker')
export class FaIconPicker extends LitElement {
  @property({ type: String })
  value = '';

  @state()
  private searchTerm = '';

  @state()
  private icons: { name: string; prefix: string }[] = [];

  static styles = css`
    :host {
      display: block;
      background: var(--background-light);
      border-radius: 8px;
      padding: 1rem;
      width: fit-content;
    }

    input {
      width: 20rem;
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-size: 1rem;
      background: var(--input-bg);
      color: var(--text-color);
      margin-bottom: 1rem;
    }

    .icons-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.75rem;
      max-height: 400px;
      overflow-y: auto;
      padding-right: 0.5rem;
      width: 20rem;
    }

    .icon-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      min-width: 0;
    }

    .icon-item:hover {
      background: var(--primary-color);
      color: white;
      border-color: var(--primary-color);
    }

    .icon-item.selected {
      background: var(--primary-color);
      color: white;
      border-color: var(--primary-color);
    }

    .icon-item fa-icon {
      font-size: 1.5rem;
    }

    .icon-name {
      font-size: 0.75rem;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      width: 100%;
    }
  `;

  constructor() {
    super();
    this.initializeIcons();
  }

  private initializeIcons() {
    library.add(fas, far, fab);
    const iconsList: { name: string; prefix: string }[] = [];

    const addIcons = (icons: any, prefix: string) => {
      Object.keys(icons).forEach(name => {
        if (name.startsWith('fa')) {
          const iconName = name
            .replace('fa', '')
            .replace(/([a-z])([A-Z0-9])/g, '$1-$2')
            .toLowerCase();
          iconsList.push({ name: iconName, prefix });
        }
      });
    };

    addIcons(fas, 'fas');
    addIcons(far, 'far');
    addIcons(fab, 'fab');

    this.icons = iconsList;
  }

  private handleSearch(e: Event) {
    const input = e.target as HTMLInputElement;
    this.searchTerm = input.value.toLowerCase();
  }

  private handleIconSelect(icon: { name: string; prefix: string }) {
    const iconValue = `${icon.prefix} fa-${icon.name}`;
    this.value = iconValue;
    this.dispatchEvent(new CustomEvent('icon-select', {
      detail: { value: iconValue },
      bubbles: true,
      composed: true
    }));
  }

  private getFilteredIcons() {
    if (!this.searchTerm) return this.icons;
    return this.icons.filter(icon =>
      icon.name.includes(this.searchTerm)
    );
  }

  render() {
    const filteredIcons = this.getFilteredIcons();

    return html`
      <input
        type="text"
        placeholder="Search icons..."
        @input=${this.handleSearch}
        .value=${this.searchTerm}
      />

      <div class="icons-grid">
        ${filteredIcons.map(icon => html`
          <div
            class="icon-item ${this.value === `${icon.prefix} fa-${icon.name}` ? 'selected' : ''}"
            @click=${() => this.handleIconSelect(icon)}
          >
            <fa-icon icon="${icon.prefix} fa-${icon.name}"></fa-icon>
            <span class="icon-name">${icon.name}</span>
          </div>
        `)}
      </div>
    `;
  }
}
