import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { icon } from '@fortawesome/fontawesome-svg-core';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import type { IconName, IconPrefix } from '@fortawesome/fontawesome-svg-core';

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
    const iconDetails = this.getIconDetails();
    if (!iconDetails) return html``;

    const iconDef = icon({ prefix: iconDetails.prefix, iconName: iconDetails.name });

    if (!iconDef) {
      console.warn(`Icon not found: ${this.icon}`);
      return html``;
    }

    return html`${unsafeSVG(iconDef.html[0])}`;
  }
}
