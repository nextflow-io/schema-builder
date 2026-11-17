import { LitElement, css, nothing, svg } from "lit";
import { customElement, property } from "lit/decorators.js";
import { findIcon, isLoaded, loadStyle, parseIcon } from "../icons";

/**
 * A Font Awesome icon.
 *
 *   <nfsb-icon name="plus"></nfsb-icon>
 *   <nfsb-icon name="fab fa-github"></nfsb-icon>
 */
@customElement("nfsb-icon")
export class NfsbIcon extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      width: 1.25em;
      height: 1em;
      align-items: center;
      justify-content: center;
      flex: none;
    }
    svg {
      height: 1em;
      max-width: 1.25em;
      fill: currentColor;
    }
  `;

  /** Class string from a schema ("fas fa-terminal") or the bare name of a solid icon ("plus"). */
  @property() name = "";

  render() {
    const parsed = parseIcon(this.name);
    if (!parsed) return nothing;
    const data = findIcon(parsed.style, parsed.name);
    if (!data) {
      // Styles other than solid are loaded on demand; a name missing from a loaded style stays blank
      if (!isLoaded(parsed.style)) void loadStyle(parsed.style).then(() => this.requestUpdate());
      return nothing;
    }
    const [width, height, , , path] = data.icon;
    return svg`<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <path d=${Array.isArray(path) ? path.join(" ") : path}></path>
    </svg>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nfsb-icon": NfsbIcon;
  }
}
