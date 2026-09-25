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

/* Revision 2 of the handoff wins where it disagrees with the first (docs/design/2026-09-20-deck-page-r2/
   INTAKE.md). The four token files are byte-identical across the two revisions today, so this repoint
   changes nothing that renders -- it means a later r2-only change to the designer's tokens is actually
   held here rather than silently compared against the superseded copy. */
const HANDOFF = "docs/design/2026-09-20-deck-page-r2/design_handoff_crankmagic_gallery/design-system/tokens/";
const design = read("crankmagic-design.css");
const pageCss = read("crankmagic.css");

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
  const aDark = tokensIn(design, /(?:^|,)\s*#matrix-v2\s*$/), aLight = tokensIn(design, /(?:^|,)\s*#matrix-v2\[data-theme="light"\]\s*$/);
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
  const app = tokensIn(design, /(?:^|,)\s*#matrix-v2\s*$/);
  /* The handoff names both the body color alias and the body size --text-body; the app keeps
     the size as --text-body-size (INTAKE.md, gap 10). */
  const rename = {"--text-body": "--text-body-size"};
  for (const [k, v] of [...shape, ...type]) { const name = rename[k] || k; ok(app.get(name) === v, `${name} is ${v} in the app (found ${app.get(name) || "nothing"})`); }
}

/* 3. THE GUIDE'S EXTENDED --v-* AND --st-* NAMES (revision 2 INTAKE, item 1).
 *
 * The designer's token files carry --color-*, --mana-* and six --st-* rungs; the implementation
 * guide's own #matrix-v2 block names more than that, and the stylesheets read --v-*. So both sets
 * live here: --color-* mirrors the designer, --v-* is what the page layer reads, and every --v-*
 * resolves to a --color-* or a color-mix of one rather than carrying a literal of its own.
 */
{
  const app = tokensIn(design, /(?:^|,)\s*#matrix-v2\s*$/);
  const extended = [
    "--v-bg", "--v-panel", "--v-raised", "--v-field", "--v-field-line", "--v-line", "--v-line-strong",
    "--v-ink", "--v-muted", "--v-accent", "--v-on", "--v-soft", "--v-aether", "--v-money",
    "--v-decision", "--v-decision-bg", "--v-decision-line", "--v-decision-ink", "--v-decision-field",
    "--v-required", "--v-radius", "--v-radius-card", "--v-radius-tile", "--v-display", "--v-body",
  ];
  const absent = extended.filter((k) => !app.has(k));
  eq(absent, [], `the guide's --v-* names are all defined in crankmagic-design.css; missing: ${absent.join(", ")}`);

  /* The three radii the definition of done allows, and nothing else, behind the names the guide uses. */
  eq([app.get("--v-radius"), app.get("--v-radius-card"), app.get("--v-radius-tile")],
    ["var(--radius-control)", "var(--radius-card)", "var(--radius-tile)"],
    "the guide's radius names are aliases of the designer's shape tokens, not a second set of numbers");

  /* The four status rungs the guide adds beyond the designer's six. Dark is the guide's; the guide
     gives no light value for watch, draft or physical, so the light values below are this
     repository's, chosen in the Felt and Cream register, and are on the gap list for the designer. */
  const rungs = {"--st-watch": "#8f9bb3", "--st-draft": "#7f8ba0", "--st-reserved": "#8fb3ff", "--st-physical": "#3fae7a"};
  const wrongDark = Object.entries(rungs).filter(([k, v]) => !(app.get(k) || "").includes(v)).map(([k, v]) => `${k}: want ${v}, found ${app.get(k) || "(absent)"}`);
  eq(wrongDark, [], "the guide's four extra status rungs carry its dark values:\n  " + wrongDark.join("\n  "));
  const noLight = Object.keys(rungs).filter((k) => !/light-dark\(/.test(app.get(k) || ""));
  eq(noLight, [], `and each states a light value too, so a rung does not stay dark on cream: ${noLight.join(", ")}`);
}

/* 4. THE DISPLAY FACE IS SATOSHI, AND IT IS SELF-HOSTED.
 *
 * Rob, 2026-09-24: "use the Satoshi header font (H1, H2, H3, etc.) instead of the current header
 * fonts in our design guide." Headings and big figures were Young Serif (self-hosted from
 * 2026-09-20 rather than fetched from Google, revision 2 INTAKE item 2); they are Satoshi 700 now,
 * the body's own face at its bold weight, and the guide's typography.css says the same -- the
 * type tokens above are held to it. Young Serif is retired rather than left declared: a face
 * nothing draws with is a download waiting for a stray rule. No shipped page may reach out to a
 * font CDN at render time either; one that does has reintroduced the third-party request the
 * self-hosting decision removed.
 */
{
  const app = tokensIn(design, /(?:^|,)\s*#matrix-v2\s*$/);
  ok(/^Satoshi\b/.test(app.get("--font-display") || ""), `--font-display is Satoshi (found ${app.get("--font-display")})`);
  eq(app.get("--display-weight"), "700", "at its bold weight, which is the one Satoshi file headings need");
  ok(/@font-face\{[^}]*font-family:\s*Satoshi[^}]*font-weight:\s*700[^}]*assets\/crankmagic\/satoshi-700\.woff2/.test(design),
    "and Satoshi 700 is declared @font-face against the self-hosted woff2");
  ok(app.get("--v-display") === "var(--font-display)", "--v-display is the same face, by reference, not a second declaration");
  for (const f of ["index.html", "crankmagic.html", "privacy.html", "terms.html", "crankmagic-design.css", "crankmagic.css", "crankmagic-sw.js"]) {
    ok(!/Young Serif|youngserif-/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, "")), `${f} no longer declares, draws with or caches the retired Young Serif`);
    ok(!/fonts\.(googleapis|gstatic)\.com/.test(read(f)), `${f} does not fetch a font from a CDN; the face is self-hosted`);
  }
}

/* 5. THE DEEP FIELD DUPLICATE IS GONE (revision 2 INTAKE, item 3).
 *
 * crankmagic.css loads after crankmagic-design.css and redefined the same --v-* names, so that
 * block -- not the token block -- was the palette that rendered. Two of its values were still navy
 * (--v-on #06131f, --v-soft #0e3358), which is why V.1b changed the buttons but not their text.
 * One definition, in the design sheet. The page sheet reads tokens and declares none.
 */
{
  const stray = [...pageCss.matchAll(/(--(?:v|st|color|mana)-[a-zA-Z-]+)\s*:/g)].map((m) => m[1]);
  const allowed = /^--(v-aether-(thread|core)|v-sub|tint|ci-[ab]|st)$/;   /* per-element locals, not palette */
  const declared = [...new Set(stray)].filter((k) => !allowed.test(k)).sort();
  eq(declared, [], `crankmagic.css declares palette tokens instead of reading them: ${declared.join(", ")}`);
}

/* 6. THE DISPLAY FACE IS ON HEADINGS AND BIG FIGURES (guide, step 1, "Type"). */
{
  const rule = pageCss.match(/#matrix-v2\s*:is\(([^)]*)\)\{[^}]*font-family:var\(--v-display\)[^}]*\}/);
  ok(rule, "crankmagic.css puts --v-display on headings and big figures in one rule");
  if (rule) {
    const wanted = ["h1", "h2", "h3", ".cm-deck-tile h3", ".cm-stats strong", ".cm-summary-figures strong", ".cm-budget-figures strong", ".cm-kpi strong"];
    const missing = wanted.filter((s) => !rule[1].includes(s));
    eq(missing, [], `and it names every selector the guide lists; missing: ${missing.join(", ")}`);
  }
}

/* 2. Raw hex never goes up. Lower a ceiling when a page is converted; never raise one here without saying why in the diff. */
{
  const hex = (css) => (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  /* V.1c lowered crankmagic.css from 730 to 137 by the guide's literal-to-token sweep. What is
     left is what the guide's acceptance allows: pure black and white at an alpha (shadows, scrims
     and highlights over art), the four bare greys, and four small self-contained systems the
     sweep deliberately did not touch -- the flame icon's three gradient stops, the five-step
     rarity scale, the tabletop felt and shelf, and the colorless mana disc, for which the token
     set has no --mana-C. Those are named in the sweep's KEEP list and on the designer's gap list. */
  const CEILING = {"crankmagic.css": 137, "game/ui": 458};
  /* THE CANVAS IS A STYLESHEET TOO (Track V.4g). crankmagic-graph.js painted the Explore graph
     from 38 literals of the pre-Gallery navy, and no ceiling in this file could see them, because
     every ceiling here reads a .css file. That is how one page stayed entirely blue through a
     sweep that took the stylesheet from 730 raw hex to 137. It reads the tokens now, through a
     probe inside #matrix-v2, and carries none of its own. Zero is the ceiling: a color on that
     canvas belongs to the token set or it is not a color the app has agreed to. */
  const canvas = hex(read("crankmagic-graph.js"));
  ok(canvas === 0, `crankmagic-graph.js carries ${canvas} raw hex colors; the canvas reads the tokens and the ceiling is 0`);

  const page = hex(read("crankmagic.css"));
  ok(page <= CEILING["crankmagic.css"], `crankmagic.css carries ${page} raw hex colors; the ceiling is ${CEILING["crankmagic.css"]} and only goes down`);
  const ui = readdirSync(path.join(ROOT, "game/ui")).filter((f) => f.endsWith(".css")).reduce((n, f) => n + hex(read("game/ui/" + f)), 0);
  ok(ui <= CEILING["game/ui"], `game/ui stylesheets carry ${ui} raw hex colors; the ceiling is ${CEILING["game/ui"]} and only goes down`);
  /* the design stylesheet's hex live in the two token blocks and the legacy --v- block, nowhere else */
  const outside = design.replace(/#matrix-v2(\[data-theme="light"\])?\{[^}]*\}/g, "");
  const stray = hex(outside);
  ok(stray <= 31, `crankmagic-design.css has ${stray} raw hex colors outside its token blocks (ceiling 31, only goes down)`);
}

/* 3. THE PLAY BOARD CAN READ THE PALETTE (Stage B.0).
 *
 * Rob, 2026-09-21: "The game screen is still not the new design." It was not drift. Every one of
 * this sheet's rules is scoped to #matrix-v2 -- and so were the tokens -- while the board's root
 * carries no such id, so the board could not read a single value. It had 463 raw hex and zero
 * tokens because it had no other option.
 *
 * Naming :root as well publishes the VALUES without publishing the RULES: the board inherits the
 * palette and inherits no element styling. These two checks are what stop that being undone.
 */
{
  const design2 = read("crankmagic-design.css");
  ok(/:root\s*,\s*#matrix-v2\s*\{/.test(design2),
    "crankmagic-design.css must publish its tokens at :root as well as #matrix-v2, or the play board cannot read one of them");
  ok(/:root\[data-theme="light"\]\s*,/.test(design2),
    "the light theme's tokens are published at :root too, or the board's light mode has no palette");
  const board = read("game/ui/review.html");
  ok(board.includes("crankmagic-design.css"),
    "game/ui/review.html must load crankmagic-design.css, or :root carries the tokens and the board still never sees them");
}

console.log(`design-tokens: ${checks} checks passed — the Gallery tokens match the handoff in both themes, and raw hex only goes down.`);
