/**
 * Font Awesome icons, rendered from the icon data shipped with the npm packages
 * so the editor works offline. Schemas name icons by their CSS classes, e.g.
 * "fas fa-terminal"; the names used by Font Awesome 5 and 6 keep working.
 */

import { fas } from "@fortawesome/free-solid-svg-icons";

interface IconData {
  iconName: string;
  /** [width, height, aliases, unicode, path data] */
  icon: [number, number, (string | number)[], string, string | string[]];
}

type IconStyle = "fas" | "far" | "fab";
type Pack = Record<string, IconData>;
type Index = Map<string, IconData>;

function indexPack(pack: Pack): Index {
  const index: Index = new Map();
  for (const data of Object.values(pack)) {
    index.set(data.iconName, data);
    for (const alias of data.icon[2]) if (typeof alias === "string" && !index.has(alias)) index.set(alias, data);
  }
  return index;
}

/** Solid icons are bundled with the app; the other styles are fetched when first needed. */
const indexes: Partial<Record<IconStyle, Index>> = { fas: indexPack(fas as unknown as Pack) };
const loading: Partial<Record<IconStyle, Promise<Index>>> = {};
const loaders: Record<IconStyle, () => Promise<Pack>> = {
  fas: async () => fas as unknown as Pack,
  far: () => import("@fortawesome/free-regular-svg-icons").then((module) => module.far as unknown as Pack),
  fab: () => import("@fortawesome/free-brands-svg-icons").then((module) => module.fab as unknown as Pack),
};

export const isLoaded = (style: IconStyle): boolean => style in indexes;

export function loadStyle(style: IconStyle): Promise<Index> {
  return (loading[style] ??= loaders[style]().then((pack) => (indexes[style] ??= indexPack(pack))));
}

const STYLE_CLASSES: Record<string, IconStyle> = {
  fas: "fas",
  fa: "fas",
  "fa-solid": "fas",
  far: "far",
  "fa-regular": "far",
  fab: "fab",
  "fa-brands": "fab",
};
/** Classes such as `fa-fw` or `fa-2x` that modify an icon rather than name one. */
const MODIFIER = /^fa-(fw|lg|xs|sm|xl|\d+x|spin|pulse|border|inverse|flip-.*|rotate-.*|pull-.*)$/;

/** Split a class string such as "fas fa-terminal" (or a bare name such as "plus") into style and name. */
export function parseIcon(value: string): { style: IconStyle; name: string } | null {
  const classes = value.trim().split(/\s+/).filter(Boolean);
  if (classes.length === 1 && !classes[0].startsWith("fa-")) return { style: "fas", name: classes[0] };
  const style = classes.map((name) => STYLE_CLASSES[name]).find(Boolean) ?? "fas";
  const name = classes.find((item) => item.startsWith("fa-") && !(item in STYLE_CLASSES) && !MODIFIER.test(item));
  return name ? { style, name: name.slice(3) } : null;
}

/** Icon data if its style has been loaded; call `loadStyle` first for styles other than solid. */
export function findIcon(style: IconStyle, name: string): IconData | undefined {
  return indexes[style]?.get(name);
}

export interface IconChoice {
  /** Class string to store in the schema, e.g. "fas fa-terminal". */
  value: string;
  name: string;
  /** Name and aliases, for searching. */
  keywords: string;
}

let choices: Promise<IconChoice[]> | null = null;

/** Every available icon, for the icon picker. */
export function allIcons(): Promise<IconChoice[]> {
  choices ??= Promise.all((["fas", "far", "fab"] as const).map(async (style) => [style, await loadStyle(style)] as const)).then(
    (styles) =>
      styles.flatMap(([style, index]) =>
        [...new Set(index.values())].map((data) => ({
          value: `${style} fa-${data.iconName}`,
          name: data.iconName,
          keywords: [data.iconName, ...data.icon[2].filter((alias) => typeof alias === "string")].join(" "),
        })),
      ),
  );
  return choices;
}
