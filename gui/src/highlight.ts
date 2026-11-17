import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import json from "shiki/langs/json.mjs";
import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";

// Fine-grained bundle: only JSON and two themes, JS regex engine (no WASM), so it works offline.
const highlighter = createHighlighterCoreSync({
  themes: [githubLight, githubDark],
  langs: [json],
  engine: createJavaScriptRegexEngine(),
});

/**
 * Highlighted JSON as HTML. Colors are CSS variables (`--shiki-light`, `--shiki-dark`) so the
 * stylesheet picks the theme; see `shikiStyles`.
 */
export function highlightJson(code: string): string {
  return highlighter.codeToHtml(code, {
    lang: "json",
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}
