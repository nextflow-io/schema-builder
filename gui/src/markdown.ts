import DOMPurify from "dompurify";
import { marked } from "marked";

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const rendered = new Map<string, string>();

/** Render Markdown written by a schema author to HTML that is safe to insert. */
export function renderMarkdown(text: string): string {
  let html = rendered.get(text);
  if (html === undefined) {
    html = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }), { USE_PROFILES: { html: true } });
    rendered.set(text, html);
  }
  return html;
}
