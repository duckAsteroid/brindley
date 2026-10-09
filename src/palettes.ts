import { readFileSync } from "node:fs";
import { BrindleyError } from "./repo.js";

/** Three steps of one hue — not started, in progress, complete — for each mode. */
export interface Palette {
  light: [string, string, string];
  dark: [string, string, string];
}

/**
 * Built-in palettes. On a light surface the steps run light to dark, on a dark surface dark to
 * light, so complete work always stands out most; each set passes ordinal checks for contrast
 * against the surface and separation between steps. sea is a reference blue; the others are
 * Radix Colors (MIT) steps.
 */
export const PALETTES: Readonly<Record<string, Palette>> = {
  sea: { light: ["#86b6ef", "#3987e5", "#1c5cab"], dark: ["#184f95", "#3987e5", "#9ec5f4"] },
  plum: { light: ["#cf91d8", "#ab4aba", "#53195d"], dark: ["#734079", "#ab4aba", "#e796f3"] },
  forest: { light: ["#65ba74", "#46a758", "#2a7e3b"], dark: ["#366740", "#46a758", "#71d083"] },
  fire: { light: ["#ec8e7b", "#e54d2e", "#d13415"], dark: ["#853a2d", "#e54d2e", "#ff977d"] },
  teal: { light: ["#53b9ab", "#12a594", "#008573"], dark: ["#1c6961", "#12a594", "#0bd8b6"] },
  slate: { light: ["#8b8d98", "#60646c", "#1c2024"], dark: ["#5a6169", "#777b84", "#b0b4ba"] },
};

const KEYS = ["not_started", "in_progress", "complete"] as const;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const vars = (steps: readonly string[]) => KEYS.map((k, i) => `--${k.replace("_", "-")}:${steps[i]}`).join(";");

/** CSS for a palette: its light steps on `:root`, its dark steps in a dark-scheme block. */
function paletteBlock(p: Palette): string {
  return `:root{${vars(p.light)}}\n@media (prefers-color-scheme:dark){:root{${vars(p.dark)}}}`;
}

/**
 * The CSS for `--palette`: a built-in name, a JSON file
 * `{ "light": { "not_started", "in_progress", "complete" }, "dark": { … } }` (dark optional), or a
 * CSS file copied in after the default palette, so it can set any of the page's custom properties.
 * Relative paths resolve against `cwd`.
 */
export function paletteCss(arg: string | undefined, resolvePath: (p: string) => string = (p) => p): string {
  const name = arg ?? "sea";
  const builtIn = PALETTES[name];
  if (builtIn) return paletteBlock(builtIn);
  if (!/\.(json|css)$/i.test(name))
    throw new BrindleyError(`Unknown palette "${name}": use one of ${Object.keys(PALETTES).join(", ")}, or a .json or .css file.`);
  let text: string;
  try {
    text = readFileSync(resolvePath(name), "utf8");
  } catch {
    throw new BrindleyError(`Can't read the palette file ${name}.`);
  }
  if (/\.css$/i.test(name)) return `${paletteBlock(PALETTES["sea"]!)}\n${text.replace(/<\/style/gi, "<\\/style")}`;
  let json: Record<string, Record<string, unknown> | undefined>;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new BrindleyError(`${name} is not valid JSON: ${(e as Error).message}`);
  }
  const steps = (mode: "light" | "dark"): [string, string, string] | null => {
    const m = json[mode];
    if (m === undefined) return null;
    return KEYS.map((k) => {
      const v = m?.[k];
      if (typeof v !== "string" || !HEX.test(v)) throw new BrindleyError(`${name}: ${mode}.${k} must be a hex colour like "#1c5cab" (got ${JSON.stringify(v)}).`);
      return v;
    }) as [string, string, string];
  };
  const light = steps("light");
  if (!light) throw new BrindleyError(`${name}: needs a "light" set of colours (not_started, in_progress, complete).`);
  return paletteBlock({ light, dark: steps("dark") ?? light });
}

/**
 * Make a stylesheet's dark-scheme rules follow the page's Auto / Light / Dark switch: each
 * `@media (prefers-color-scheme: dark) { :root { … } }` block applies when Dark is chosen, or when
 * Auto is and the viewer's setting is dark.
 */
export function darkAware(css: string): string {
  const re = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/g;
  let out = "";
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < css.length && depth; i++) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
    const inner = css.slice(m.index + m[0].length, i - 1);
    const as = (sel: string) => inner.replace(/:root(?::not\(\[data-theme=["']?light["']?\]\))?/g, sel);
    out += css.slice(at, m.index) + `@media (prefers-color-scheme:dark){${as(":root:has(#mode-auto:checked)")}}\n${as(":root:has(#mode-dark:checked)")}`;
    at = re.lastIndex = i;
  }
  return out + css.slice(at);
}
