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
import {readFileSync, readdirSync, existsSync} from "node:fs";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");

/* Revision 4 (docs/design/2026-10-25-redesign-r4, Rob 2026-10-25) supersedes r3's colors, shape and scale. Its token
   files are generated from build/spec.py in that folder; the project root's project/tokens/*.css is the governing skin
   (Sapphire & Obsidian), and project/design-systems/<skin>/tokens/colors.css are the two color-only skins. r3 is kept for
   the record and is not read here. The faces are r4's too, from Rob's reference (Concept B, Table Companion): Cinzel 600 for
   names, Lato 400 and 700 for everything read. */
const HANDOFF = "docs/design/2026-10-25-redesign-r4/project/tokens/";
const SKINS_DIR = "docs/design/2026-10-25-redesign-r4/project/design-systems/";
const SKINS = ["bronze-basalt", "chalk-coal"];
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

/* THE SKINS ARE SKINS (r4). Each skin is the designer's colors.css in its own folder, dark and light, and the app
   carries it value for value under data-palette (and data-theme="light"). A skin defines every color token the governing
   skin names, so it never shows Sapphire & Obsidian through a gap, and it defines nothing else: no radius, shadow, motion,
   face, case or size. That is what lets one component set serve every skin. */
{
  const handoff = tokensIn(read(HANDOFF + "colors.css"), /^:root$/);
  const named = [...handoff.keys()].filter((k) => /^--(color|mana|st)-/.test(k));
  for (const skin of SKINS) {
    const file = read(SKINS_DIR + skin + "/tokens/colors.css");
    const hDark = tokensIn(file, /^:root$/), hLight = tokensIn(file, /^\[data-theme="light"\]$/);
    const aDark = tokensIn(design, new RegExp(`(?:^|,)\\s*#matrix-v2\\[data-palette="${skin}"\\]\\s*$`));
    const aLight = tokensIn(design, new RegExp(`(?:^|,)\\s*#matrix-v2\\[data-palette="${skin}"\\]\\[data-theme="light"\\]\\s*$`));
    eq(named.filter((k) => !hDark.has(k) || !hLight.has(k)), [], `${skin}'s colors.css defines every color token, in both registers`);
    eq(named.filter((k) => aDark.get(k) !== hDark.get(k)), [], `${skin} dark is the designer's, value for value`);
    eq(named.filter((k) => aLight.get(k) !== hLight.get(k)), [], `${skin} light is the designer's, value for value`);
    const extra = [...aDark.keys(), ...aLight.keys()].filter((k) => !/^--(color|mana|st)-/.test(k));
    eq(extra, [], `${skin} is colors only: it sets no radius, shadow, motion, face or size (${extra.join(", ")})`);
  }
  /* No r3 theme survives in the stylesheet. */
  ok(!/data-palette="(moss-iron|brass-slate|steel-cobalt|felt-cream)"/.test(design), "the r3 themes are gone from crankmagic-design.css");
  /* Barlow Condensed is the callout word's face and nothing else's: 800 only, self-hosted, reached through --font-callout. */
  const bare = design.replace(/\/\*[\s\S]*?\*\//g, "");
  const barlowFaces = [...bare.matchAll(/@font-face\{font-family:'Barlow Condensed';font-weight:(\d+);/g)].map((m) => m[1]);
  ok(barlowFaces.length > 0 && barlowFaces.every((w) => w === "800"), `Barlow Condensed is declared at 800 only (${barlowFaces.join(", ")})`);
  ok(!/Barlow Condensed/.test(bare.replace(/@font-face\{[^}]*\}/g, "").replace(/--font-callout:[^;]+;/, "")), "and no rule names it except --font-callout");
  ok(!/Barlow Condensed/.test(pageCss.replace(/\/\*[\s\S]*?\*\//g, "")), "crankmagic.css reaches Barlow Condensed only through var(--font-callout)");
  ok(!/fonts\.googleapis|fonts\.gstatic/.test(design + pageCss + read("index.html")), "and nothing asks Google Fonts for any face");
}

/* The shape and type tokens, by name. */
{
  const shape = tokensIn(read(HANDOFF + "shape.css"), /^:root$/), type = tokensIn(read(HANDOFF + "typography.css"), /^:root$/);
  const app = tokensIn(design, /(?:^|,)\s*#matrix-v2\s*$/);
  /* r4 names the body size --text-body-size in the handoff too, so --text-body is only the body color alias (r3's gap 10). */
  for (const [k, v] of [...shape, ...type]) ok(app.get(k) === v, `${k} is ${v} in the app (found ${app.get(k) || "nothing"})`);
  ok(!type.has("--text-body"), "the handoff's type no longer reuses --text-body, the color alias, for a size");
  /* One scale: nothing under 12px, h1 one token, the HUD at 18px and up for vitals. */
  const px = (v) => Number((/^(\d+(?:\.\d+)?)px$/.exec(v) || [])[1]);
  ok(px(type.get("--text-label")) >= 12 && px(type.get("--text-small")) >= 12, "the smallest sizes are 12px or more");
  ok(px(type.get("--text-body-size")) >= 14 && px(type.get("--text-reading")) >= 16, "body is 14px and reading surfaces 16px");
  ok(px(type.get("--text-hud-vital")) >= 18 && px(type.get("--text-hud")) >= 18, "Play HUD vitals and text are 18px or more at 100%");
  /* One shape: four radii, stated once. */
  eq(["--radius-control", "--radius-card", "--radius-tile", "--radius-pill"].map((k) => shape.has(k)), [true, true, true, true], "the four radii are the designer's");
  const table = tokensIn(read(HANDOFF + "table.css"), /^:root$/);
  for (const [k, v] of table) ok(app.get(k) === v, `the table token ${k} is ${v} in the app (found ${app.get(k) || "nothing"})`);
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

  /* All ten status rungs are the designer's since r4 (the gap list closed): check 1 holds them value for value in both
     registers, so here they only have to exist, and the --v-* layer may not shadow one with a literal. */
  const handoff = tokensIn(read(HANDOFF + "colors.css"), /^:root$/);
  const rungs = ["--st-inbox", "--st-pull", "--st-ordered", "--st-buy", "--st-standin", "--st-remove", "--st-watch", "--st-draft", "--st-reserved", "--st-physical"];
  eq(rungs.filter((k) => !handoff.has(k)), [], "the designer's colors.css defines all ten status rungs");
  const shadowed = rungs.filter((k) => app.get(k) !== handoff.get(k));
  eq(shadowed, [], `no later block shadows a rung with another value: ${shadowed.join(", ")}`);
  /* and every --v-* name resolves to a token, never a literal */
  const literal = extended.filter((k) => !/^var\(--/.test(app.get(k) || ""));
  eq(literal, [], `every --v-* name is a var() of a token: ${literal.join(", ")}`);
}

/* 4. NAMES ARE CINZEL, THE WORK IS LATO, AND EVERY FACE IS SELF-HOSTED.
 *
 * r4 (Rob, 2026-10-25): "Take the font from this image that's used for the app name ... I actually like all of the
 * fonts in this image." Page titles and the deck title are Cinzel 600 at .04em; h2, h3, figures and every word read are
 * Lato 400 and 700. Satoshi and Young Serif are retired. The app is still CrankMagic (Rob, 2026-10-26): its wordmark keeps
 * the embedded Oxanium subset, and Oxanium sets nothing else. Four weights in all,
 * each SIL OFL 1.1 and self-hosted: no shipped page may reach out to a font CDN at render time.
 * tests/type-final.mjs holds the same rule in a rendered page.
 */
{
  const app = tokensIn(design, /(?:^|,)\s*#matrix-v2\s*$/);
  ok(/^Cinzel\b/.test(app.get("--font-display") || ""), `--font-display is Cinzel (found ${app.get("--font-display")})`);
  eq(app.get("--display-weight"), "600", "at Cinzel's 600, the reference's weight");
  eq(app.get("--display-tracking"), ".04em", "tracked at .04em: roman capitals want air");
  eq(app.get("--font-hero"), "var(--font-display)", "the hero is the display face at hero size, by reference");
  ok(/^Lato\b/.test(app.get("--font-body") || ""), `--font-body is Lato (found ${app.get("--font-body")})`);
  eq(app.get("--heading-weight"), "700", "h2, h3 and figures are the body face at 700");
  for (const [fam, w, stem] of [["Cinzel", "600", "cinzel-600"], ["Lato", "400", "lato-400"], ["Lato", "700", "lato-700"]]) {
    for (const sub of ["", "-ext"]) {
      ok(new RegExp(`@font-face\\{font-family:${fam};font-weight:${w};[^}]*assets/crankmagic/${stem}${sub}\\.woff2`).test(design), `${fam} ${w}${sub} is declared @font-face against the self-hosted woff2`);
      ok(existsSync(path.join(ROOT, `assets/crankmagic/${stem}${sub}.woff2`)), `and assets/crankmagic/${stem}${sub}.woff2 exists`);
    }
  }
  for (const f of ["cinzel-OFL.txt", "lato-OFL.txt", "barlowcondensed-OFL.txt", "oxanium-OFL.txt"]) ok(existsSync(path.join(ROOT, "assets/crankmagic", f)), `assets/crankmagic/${f} is committed`);
  ok(app.get("--v-display") === "var(--font-display)" && app.get("--v-body") === "var(--font-body)", "--v-display and --v-body are the same faces, by reference, not second declarations");
  /* The retired faces are gone from every sheet, script and page that names a face. */
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const f of ["crankmagic-design.css", "crankmagic.css", "crankmagic-stage.css", "crankmagic-app.js", "crankmagic-graph.js", "privacy.html", "terms.html", "crankmagic-sw.js"]) {
    ok(!/Satoshi|Young Serif|youngserif-|satoshi-/.test(code(read(f))), `${f} names no retired face (Satoshi, Young Serif)`);
  }
  for (const f of ["satoshi-400.woff2", "satoshi-900.woff2", "youngserif-400.woff2", "barlowcondensed-600.woff2", "barlowcondensed-700.woff2"]) ok(!existsSync(path.join(ROOT, "assets/crankmagic", f)), `assets/crankmagic/${f} is removed`);
  /* The name stays CrankMagic: the wordmark keeps its own Oxanium subset, and Oxanium appears nowhere else. */
  ok(/@font-face\{font-family:CrankOxanium;src:url\(data:font\/ttf;base64,/.test(design), "the CrankMagic wordmark's Oxanium subset is still embedded");
  const brandRule = [...design.matchAll(/#matrix-v2 \.v-brand\{([^}]*)\}/g)].map((m) => m[1]).find((b) => /font-family/.test(b)) || "";
  ok(/font-family:CrankOxanium,Lato,sans-serif/.test(brandRule) && /background-clip:text/.test(brandRule), `the wordmark (.v-brand) is unchanged but for its fallback (${brandRule.slice(0, 60)})`);
  const oxanium = [...(code(design) + code(pageCss) + code(read("crankmagic-stage.css"))).matchAll(/([^{}]*)\{[^{}]*CrankOxanium[^{}]*\}/g)].map((m) => m[1].trim()).filter((s) => !/^@font-face$/.test(s) && !/\.v-brand$/.test(s));
  eq(oxanium, [], `Oxanium sets only the wordmark: ${oxanium.join(" | ")}`);
  /* Barlow Condensed is the callout word's face and nothing else's: 800 only, self-hosted, reached through --font-callout. */
  const bare = design.replace(/\/\*[\s\S]*?\*\//g, "");
  const sw = read("crankmagic-sw.js");
  for (const f of ["cinzel-600.woff2", "cinzel-600-ext.woff2", "lato-400.woff2", "lato-400-ext.woff2", "lato-700.woff2", "lato-700-ext.woff2", "barlowcondensed-800.woff2"]) ok(sw.includes(`assets/crankmagic/${f}`), `the service worker keeps ${f} for offline use`);
  const notices = read("THIRD-PARTY-NOTICES.md");
  ok(/\*\*Cinzel\*\*/.test(notices) && /\*\*Lato\*\*/.test(notices) && /\*\*Oxanium\*\*/.test(notices) && !/\*\*Satoshi\*\*|\*\*Young Serif\*\*/.test(notices), "THIRD-PARTY-NOTICES lists Oxanium, Cinzel and Lato and no retired face");
  ok(!/@font-face\{font-family:'Barlow Condensed';font-weight:(600|700)/.test(bare), "and Barlow Condensed 600 and 700 are not declared");
  for (const f of ["index.html", "crankmagic.html", "privacy.html", "terms.html", "crankmagic-design.css", "crankmagic.css", "crankmagic-sw.js"]) {
    ok(!/fonts\.(googleapis|gstatic)\.com|api\.fontshare\.com|cdn\.fontshare\.com/.test(read(f)), `${f} does not fetch a font from a CDN; every face is self-hosted`);
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

/* 6. NAMES IN THE DISPLAY FACE, THE REST IN THE BODY FACE AT 700 (r4). h1 is Cinzel; h2, h3, deck tile names and the big
   figures are Lato 700, so the work stays plain and the names carry the voice. */
{
  ok(/#matrix-v2 h1\{font-family:var\(--v-display\);font-weight:var\(--display-weight\)/.test(pageCss), "crankmagic.css sets every h1 in --v-display at --display-weight");
  const rule = pageCss.match(/#matrix-v2\s*:is\(([^)]*)\)\{font-family:var\(--v-body\);font-weight:var\(--heading-weight\)[^}]*\}/);
  ok(rule, "and puts --v-body at --heading-weight on headings and big figures in one rule");
  if (rule) {
    const wanted = ["h2", "h3", ".cm-deck-tile h3", ".cm-stats strong", ".cm-summary-figures strong", ".cm-budget-figures strong", ".cm-kpi strong"];
    const missing = wanted.filter((s) => !rule[1].includes(s));
    eq(missing, [], `and it names every selector the guide lists; missing: ${missing.join(", ")}`);
  }
  /* r4: ONE h1 SCALE. Every screen h1 reads --text-h1 (a page title) or --text-hero (the deck title, the landing, the
     showcase); the token holds the responsive clamp, so no rule restates 36px, 44px or clamp(34px,4.4vw,56px) again.
     Print sheets are paper and keep their pt sizes. */
  const sheets = (design + pageCss).replace(/\/\*[\s\S]*?\*\//g, "");
  const literalH1 = [...sheets.matchAll(/([^{}]*\bh1\b[^{}]*)\{([^{}]*)\}/g)].filter((m) => /font-size:\s*(?!var\()(?![\d.]+pt)/.test(m[2])).map((m) => m[1].trim().slice(-60));
  eq(literalH1, [], `every h1 rule reads --text-h1 or --text-hero: ${literalH1.join(" | ")}`);
}

/* 2. Raw hex never goes up. Lower a ceiling when a page is converted; never raise one here without saying why in the diff. */
{
  const hex = (css) => (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  /* V.1c lowered crankmagic.css from 730 to 137 by the guide's literal-to-token sweep. What is
     left is what the guide's acceptance allows: pure black and white at an alpha (shadows, scrims
     and highlights over art), the four bare grays, and four small self-contained systems the
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
  /* the design stylesheet's hex live in the token blocks -- the two faces of Brass & Slate and, since A1, one block per
     other theme (#matrix-v2[data-palette="…"]) -- and the legacy --v- block, nowhere else */
  const outside = design.replace(/#matrix-v2(\[data-(?:theme="light"|palette="[a-z-]+")\])*\{[^}]*\}/g, "");
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

console.log(`design-tokens: ${checks} checks passed. The r4 tokens match the handoff in every skin and register, skins are colors only, and raw hex only goes down.`);
