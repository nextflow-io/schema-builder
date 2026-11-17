/**
 * Drag and drop with the browser's native API. It works across shadow roots,
 * which libraries that listen on `window` and compare `event.target` do not.
 */

export type DragItem = { type: "param"; groupId: string; name: string } | { type: "group"; groupId: string };

/** `dataTransfer` cannot be read while dragging over a target, so the item is kept here. */
let current: DragItem | null = null;

export function startDrag(event: DragEvent, item: DragItem, preview?: Element | null): void {
  current = item;
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  // Firefox only starts a drag if some data is set
  event.dataTransfer.setData("text/plain", item.type === "param" ? item.name : item.groupId);
  if (preview) event.dataTransfer.setDragImage(preview, 16, 16);
}

export function endDrag(): void {
  current = null;
}

/** Whether the pointer is over the top or the bottom half of the element. */
export function dropEdge(event: DragEvent, element: Element): "before" | "after" {
  const box = element.getBoundingClientRect();
  return event.clientY < box.top + box.height / 2 ? "before" : "after";
}

/** True when a `dragleave` really left `element`, rather than moving onto one of its children. */
function leftElement(event: DragEvent, element: Element): boolean {
  const to = event.relatedTarget;
  return !(to instanceof Node && element.contains(to));
}

/**
 * Make `host` a drop target. `over` says whether the dragged item may be
 * dropped here and may update the host's drop indicator; `leave` clears it.
 */
export function listenForDrops(
  host: HTMLElement,
  handlers: { over: (event: DragEvent, item: DragItem) => boolean; drop: (event: DragEvent, item: DragItem) => void; leave: () => void },
): void {
  const accept = (event: DragEvent): DragItem | null => {
    const item = current;
    if (!item || !handlers.over(event, item)) return null;
    event.preventDefault();
    event.stopPropagation();
    return item;
  };
  host.addEventListener("dragover", accept);
  host.addEventListener("dragleave", (event) => leftElement(event, host) && handlers.leave());
  host.addEventListener("drop", (event) => {
    const item = accept(event);
    if (!item) return;
    handlers.leave();
    handlers.drop(event, item);
    endDrag();
  });
}
