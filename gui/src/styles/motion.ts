import { type ReactiveController, type ReactiveControllerHost, css } from "lit";

/**
 * Add and delete animations for list items (parameters and groups). A component includes these styles and an
 * `ItemMotion` controller, which sets the `fresh` (just added) and `removing` (being deleted) attributes.
 */
export const motion = css`
  /* A just-added item grows out of the "Add" button below it (bottom left) */
  :host([fresh]) {
    transform-origin: 0 calc(100% + 1rem);
    animation: nfsb-grow 0.36s cubic-bezier(0.2, 0.9, 0.3, 1.1) both;
  }
  @keyframes nfsb-grow {
    from {
      opacity: 0;
      transform: scale(0.85);
      clip-path: inset(calc(100% - 2rem) calc(100% - 8rem) 0 0 round var(--bs-border-radius));
    }
    60% {
      opacity: 1;
    }
    to {
      transform: none;
      clip-path: inset(-0.5rem round var(--bs-border-radius));
    }
  }

  /*
   * A deleted item switches off like a CRT: top and bottom close in on a thin line, the line shrinks to a dot and
   * fades, and the items below slide up into the gap.
   */
  :host([removing]) {
    pointer-events: none;
    transform-origin: center;
    animation: nfsb-crt-off 0.35s forwards;
  }
  @keyframes nfsb-crt-off {
    /* margin-bottom is repeated at 45% so the items below only start sliding up once the line has formed */
    0% {
      transform: none;
      margin-bottom: 0;
      animation-timing-function: cubic-bezier(0.6, 0, 0.9, 0.4);
    }
    /* Collapsed to a ~2px line (--nfsb-line is set by ItemMotion.remove) */
    45% {
      transform: scale(1, var(--nfsb-line, 0.02));
      opacity: 1;
      margin-bottom: 0;
      animation-timing-function: cubic-bezier(0.5, 0, 0.8, 0.3);
    }
    /* The line shrinks to a dot */
    80% {
      transform: scale(0.01, var(--nfsb-line, 0.02));
      opacity: 1;
    }
    100% {
      transform: scale(0, var(--nfsb-line, 0.02));
      opacity: 0;
      /* --nfsb-height and --nfsb-gap (to the next item) are set by ItemMotion.remove */
      margin-bottom: calc(-1 * var(--nfsb-height, 0px) - var(--nfsb-gap, 0px));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :host([fresh]) {
      animation: none;
    }
  }
`;

/** The key of the item just added, which plays the grow-in animation when it first renders. */
let justAdded: string | null = null;

/** Make the item with this key grow in when it first renders. Call it before committing the item's addition. */
export function markAdded(key: string): void {
  justAdded = key;
}

/** Plays the add and delete animations (see `motion`) on a list item. */
export class ItemMotion implements ReactiveController {
  private onRemoved: (() => void) | null = null;

  /** `key` identifies the item for `markAdded`. */
  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly key: () => string,
  ) {
    host.addController(this);
    host.addEventListener("animationend", this.ended);
  }

  hostUpdate(): void {
    if (justAdded !== null && justAdded === this.key()) {
      justAdded = null;
      this.host.setAttribute("fresh", "");
    }
  }

  /** Collapse the item, then call `commit` to delete it (straight away if the user prefers reduced motion). */
  remove(commit: () => void): void {
    if (this.onRemoved) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      commit();
      return;
    }
    const { host } = this;
    const height = host.offsetHeight;
    const gap = host.parentElement ? parseFloat(getComputedStyle(host.parentElement).rowGap) || 0 : 0;
    host.style.setProperty("--nfsb-height", `${height}px`);
    host.style.setProperty("--nfsb-gap", `${gap}px`);
    host.style.setProperty("--nfsb-line", `${2 / Math.max(height, 2)}`);
    this.onRemoved = commit;
    host.setAttribute("removing", "");
  }

  private readonly ended = (event: AnimationEvent): void => {
    if (event.animationName === "nfsb-grow") {
      this.host.removeAttribute("fresh");
    } else if (event.animationName === "nfsb-crt-off" && this.onRemoved) {
      const commit = this.onRemoved;
      this.onRemoved = null;
      this.host.removeAttribute("removing");
      commit();
    }
  };
}
