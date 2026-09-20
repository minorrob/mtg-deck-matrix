/* THE DESIGN TOKENS, HELD TO THE HANDOFF, AND RAW HEX HELD DOWN.
 *
 * Track V (docs/design-intake-2026-09-20.md) rests on one discipline: the page layer draws its
 * colors from the token block, and the token block is the designer's, not a copy that drifts.
 * Two checks make that a suite rather than a wish:
 *
 *   1. Every token the handoff's design-system/tokens/colors.css defines -- --color-*, --mana-*,
 *      --st-* -- is defined in crankmagic-design.css with the same value, in the dark block and in
 *      the light one. A designer's change to the handoff that is not brought across fails here,
 *      by name and value.
 *   2. Raw hex colors in the page stylesheets never go up. The counts written below are the
 *      measurement on the day the tokens landed (crankmagic.css 1050, game/ui 475). Each V.1
 *      page conversion lowers the number and lowers the ceiling here, in the diff, so the layer
 *      cannot drift back. Raising a ceiling is a decision made in this file, not by accident.
 */
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");

const HANDOFF = "docs/design/2026-09-20-deck-page/design_handoff_crankmagic_gallery/design-system/tokens/";
const design = read("crankmagic-design.css");

/* Parse `--name:value;` pairs out of one CSS block whose selector matches. */
function tokensIn(css, selectorRe) {
  const out = new Map();
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");   /* comments carry no tokens and would ride into the selector */
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorRe.test(m[1].trim())) continue;
    for (const d of m[2].matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) out.set(d[1], d[2].trim());
  }
  return out;
}

/* 1. The color tokens, dark and light, value for value. */
{
  const handoff = read(HANDOFF + "colors.css");
  const hDark = tokensIn(handoff, /^:root$/), hLight = tokensIn(handoff, /^\[data-theme="light"\]$/);
  const aDark = tokensIn(design, /^#matrix-v2$/), aLight = tokensIn(design, /^#matrix-v2\[data-theme="light"\]$/);
  const named = [...hDark.keys()].filter((k) => /^--(color|mana|st)-/.test(k));
  ok(named.length >= 21, `the handoff defines the color tokens (${named.length})`);
  const missingDark = named.filter((k) => aDark.get(k) !== hDark.get(k)).map((k) => `${k}: app ${aDark.get(k) || "(absent)"}, handoff ${hDark.get(k)}`);
  eq(missingDark, [], "every dark token in the app is the handoff's, value for value:\n  " + missingDark.join("\n  "));
  const missingLight = named.filter((k) => aLight.get(k) !== hLight.get(k)).map((k) => `${k}: app ${aLight.get(k) || "(absent)"}, handoff ${hLight.get(k)}`);
  eq(missingLight, [], "and every light token too:\n  " + missingLight.join("\n  "));
  for (const alias of ["--surface-page", "--surface-card", "--surface-control", "--border-default", "--text-body", "--text-muted", "--action-primary", "--action-primary-text"]) {
    ok(aDark.get(alias) === hDark.get(alias), `the semantic alias ${alias} is the handoff's (${hDark.get(alias)})`);
  }
  ok(/#matrix-v2\[data-theme="light"\]\{[^}]*color-scheme:light/.test(design), "the light theme flips color-scheme so light-dark() follows it");
}

/* The shape and type tokens, by name. */
{
  const shape = tokensIn(read(HANDOFF + "shape.css"), /^:root$/), type = tokensIn(read(HANDOFF + "typography.css"), /^:root$/);
  const app = tokensIn(design, /^#matrix-v2$/);
  /* The handoff names both the body color alias and the body size --text-body; the app keeps
     the size as --text-body-size (INTAKE.md, gap 10). */
  const rename = {"--text-body": "--text-body-size"};
  for (const [k, v] of [...shape, ...type]) { const name = rename[k] || k; ok(app.get(name) === v, `${name} is ${v} in the app (found ${app.get(name) || "nothing"})`); }
}

/* 2. Raw hex never goes up. Lower a ceiling when a page is converted; never raise one here without saying why in the diff. */
{
  const hex = (css) => (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  const CEILING = {"crankmagic.css": 730, "game/ui": 475};
  const page = hex(read("crankmagic.css"));
  ok(page <= CEILING["crankmagic.css"], `crankmagic.css carries ${page} raw hex colors; the ceiling is ${CEILING["crankmagic.css"]} and only goes down`);
  const ui = readdirSync(path.join(ROOT, "game/ui")).filter((f) => f.endsWith(".css")).reduce((n, f) => n + hex(read("game/ui/" + f)), 0);
  ok(ui <= CEILING["game/ui"], `game/ui stylesheets carry ${ui} raw hex colors; the ceiling is ${CEILING["game/ui"]} and only goes down`);
  /* the design stylesheet's hex live in the two token blocks and the legacy --v- block, nowhere else */
  const outside = design.replace(/#matrix-v2(\[data-theme="light"\])?\{[^}]*\}/g, "");
  const stray = hex(outside);
  ok(stray <= 52, `crankmagic-design.css has ${stray} raw hex colors outside its token blocks (ceiling 52, only goes down)`);
}

console.log(`design-tokens: ${checks} checks passed — the Gallery tokens match the handoff in both themes, and raw hex only goes down.`);
