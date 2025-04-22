import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { initFontAwesome } from '../../icons';
import type { IconName, IconPrefix } from '@fortawesome/fontawesome-svg-core';

let iconFunction: typeof import('@fortawesome/fontawesome-svg-core').icon | null = null;
let initializationPromise: Promise<void> | null = null;

const initialize = async () => {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    await initFontAwesome();
    const { icon } = await import('@fortawesome/fontawesome-svg-core');
    iconFunction = icon;
  })();

  return initializationPromise;
};

@customElement('fa-icon')
export class FaIcon extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
      font-style: normal;
      font-variant: normal;
      line-height: 1;
      text-rendering: auto;
      -webkit-font-smoothing: antialiased;
    }

    svg {
      height: 1em;
      width: 1em;
      vertical-align: -0.125em;
    }
  `;

  @property({ type: String })
  icon = '';

  async connectedCallback() {
    super.connectedCallback();
    await initialize();
    this.requestUpdate();
  }

  private getIconDetails(): { prefix: IconPrefix; name: IconName } | null {
    if (!this.icon) return null;

    const parts = this.icon.split(' ');
    if (parts.length !== 2) {
      console.warn(`Invalid icon format: ${this.icon}. Expected format: "fas fa-name"`);
      return null;
    }

    const [prefix, name] = parts;
    const iconName = name.replace('fa-', '') as IconName;

    switch (prefix) {
      case 'fas': return { prefix: 'fas', name: iconName };
      case 'far': return { prefix: 'far', name: iconName };
      case 'fab': return { prefix: 'fab', name: iconName };
      default:
        console.warn(`Invalid icon prefix: ${prefix}. Expected: fas, far, or fab`);
        return null;
    }
  }

  render() {
    if (!iconFunction) return html``;

    const iconDetails = this.getIconDetails();
    if (!iconDetails) return html``;

    const iconDef = iconFunction({ prefix: iconDetails.prefix, iconName: iconDetails.name });

    if (!iconDef) {
      console.warn(`Icon not found: ${this.icon}`);
      return html``;
    }

    return html`${unsafeSVG(iconDef.html[0])}`;
  }
}
