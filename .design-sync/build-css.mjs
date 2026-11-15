// Compiles Tailwind v4 for the design-sync bundle: node .design-sync/build-css.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "tailwind.src.css");
const out = join(here, ".cache", "ds.css");
const r = await postcss([tailwind({ base: join(here, "..") })]).process(readFileSync(from, "utf8"), { from, to: out });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, r.css);
console.log(`wrote ${out} (${r.css.length} bytes)`);
