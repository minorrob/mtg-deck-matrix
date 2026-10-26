#!/usr/bin/env node
/* Applies the r4 design tokens to the app as one change. Run from the repo root:
 *   node docs/design/2026-10-25-redesign-r4/pr/apply-r4.mjs
 * Every edit is anchored on text that exists today; if an anchor is missing the script stops and changes nothing.
 * What it does, in order (CHANGELOG-tokens.md has the why):
 *   1. crankmagic-design.css: block A (type comment, Gallery tokens, the four themes, the --v-* block, the accent-fill
 *      override) becomes r4's governing block plus two color-only skins; block B (DEEP FIELD) becomes r4's --v-* layer
 *      and the fixed table tokens; Barlow Condensed keeps only its 800 face, for the callout word; h1 reads --text-h1.
 *   2. crankmagic.css: every screen h1 reads --text-h1 (page titles) or --text-hero (deck title, landing, showcase);
 *      print sheets keep their pt sizes; the callout word reads --font-callout.
 *   3. crankmagic-app.js: the theme table offers the three skins in both registers and maps every old choice forward.
 *   4. index.html: a page with no choice yet is Sapphire & Obsidian.
 *   5. tests: design-tokens.mjs and type-final.mjs are replaced; a11y-app.mjs takes the new theme names.
 *   6. type: Cinzel 600 and Lato 400/700 (Rob's reference, Concept B) replace Satoshi and Young Serif. The CrankMagic wordmark
 *      (.v-brand, the embedded Oxanium subset) is the app's name and does not change;
 *      the font files, the service worker, the legal pages, the play sheet, the graph and the notices follow.
 * File copies and deletions happen last, after every anchor has been found.
 */
import {readFileSync, writeFileSync, existsSync, copyFileSync, rmSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
const edits = new Map();
const get = (f) => edits.has(f) ? edits.get(f) : read(f);
const set = (f, t) => edits.set(f, t);
function cut(text, startAnchor, endAnchor, replacement, label) {
  const a = text.indexOf(startAnchor);
  if (a < 0) throw new Error(`${label}: start anchor not found: ${startAnchor.slice(0, 60)}`);
  const b = text.indexOf(endAnchor, a);
  if (b < 0) throw new Error(`${label}: end anchor not found: ${endAnchor.slice(0, 60)}`);
  return text.slice(0, a) + replacement + text.slice(b + endAnchor.length);
}
function swap(text, from, to, label, {all = false, optional = false} = {}) {
  if (!text.includes(from)) { if (optional) return text; throw new Error(`${label}: anchor not found: ${from.slice(0, 70)}`); }
  return all ? text.split(from).join(to) : text.replace(from, to);
}

const blockA = readFileSync(path.join(HERE, "block-a.css"), "utf8");
const blockB = readFileSync(path.join(HERE, "block-b.css"), "utf8");

/* 1. crankmagic-design.css */
{
  const f = "crankmagic-design.css";
  let t = get(f);
  t = cut(t, "/* THE TYPE IS r3's", "--accent-fill:color-mix(in oklab,var(--color-accent) 80%,black)}", blockA.trimEnd(), "design block A");
  t = cut(t, "/* ================================== DEEP FIELD", "--mat-night-edge:#07071a;}", blockB.trimEnd(), "design block B");
  /* Barlow Condensed: only the 800 face stays, for the callout word. */
  t = t.replace(/@font-face\{font-family:'Barlow Condensed';font-weight:(600|700);[^}]*\}\n?/g, "");
  t = swap(t, "/* Barlow Condensed (SIL OFL 1.1, assets/crankmagic/barlowcondensed-OFL.txt), self-hosted like Satoshi: Moss & Iron's\n   display face (A1, decision A2 of docs/plan-appearance.md), so no page asks Google Fonts for anything. */",
    "/* Barlow Condensed (SIL OFL 1.1, assets/crankmagic/barlowcondensed-OFL.txt), self-hosted: since r4 only its 800 face, and only\n   for the table's neon callout word, through --font-callout. It is never page type. */", "barlow comment");
  t = swap(t, "#matrix-v2 h1{font-size:36px;line-height:1.12;letter-spacing:-1.35px;font-weight:700}",
    "#matrix-v2 h1{font-size:var(--text-h1);line-height:var(--leading-tight);letter-spacing:var(--display-tracking);font-weight:var(--display-weight)}", "h1 rule");
  t = swap(t, "#matrix-v2 h1{font-size:29px;letter-spacing:-1px}", "", "narrow h1 rule");
  t = swap(t, "#matrix-v2 .v-overview-art h1{font-size:32px", "#matrix-v2 .v-overview-art h1{font-size:var(--text-h1)", "overview art h1");
  set(f, t);
}

/* 2. crankmagic.css */
{
  const f = "crankmagic.css";
  let t = get(f);
  t = swap(t, ".cm-deck-hero-copy h1{font-size:clamp(34px,4.4vw,56px)", ".cm-deck-hero-copy h1{font-size:var(--text-hero)", "deck hero h1", {all: true});
  t = swap(t, ".cm-page-head h1{font-size:44px", ".cm-page-head h1{font-size:var(--text-h1)", "page head h1");
  t = swap(t, ".cm-showcase h1{font-size:clamp(34px,4.2vw,54px)", ".cm-showcase h1{font-size:var(--text-hero)", "showcase h1");
  t = swap(t, "}h1{font-size:clamp(28px,3.6vw,47px)", "}h1{font-size:var(--text-h1)", "base h1");
  t = swap(t, ".cm-deck-hero h1{margin:6px 0 8px;font-size:clamp(30px,3.6vw,46px)", ".cm-deck-hero h1{margin:6px 0 8px;font-size:var(--text-hero)", "deck hero h1 (gallery)");
  t = swap(t, "text-transform:var(--hero-case);font-size:clamp(40px,5.4vw,68px)", "text-transform:var(--hero-case);font-size:var(--text-hero)", "landing h1");
  t = swap(t, "font-family:'Barlow Condensed',var(--font-display),sans-serif", "font-family:var(--font-callout)", "callout word face");
  set(f, t);
}

/* 3. crankmagic-app.js: three skins, two registers; every old choice maps forward. */
{
  const f = "crankmagic-app.js";
  let t = get(f);
  t = cut(t, "const THEMES=[['moss-iron'", "'steel-cobalt':['steel-cobalt','dark']};",
    "const THEMES=[['sapphire-obsidian','Sapphire & Obsidian','Obsidian black, a sapphire button · default'],['sapphire-obsidian-light','Sapphire & Obsidian, light','Parchment by day'],['bronze-basalt','Bronze & Basalt','Warm basalt, bronze edges'],['bronze-basalt-light','Bronze & Basalt, light','Vellum by day'],['chalk-coal','Chalk & Coal','High contrast: for a TV across the room'],['chalk-coal-light','Chalk & Coal, light','High contrast by day']];\n"
    + "const THEME_FACE={'sapphire-obsidian':['sapphire-obsidian','dark'],'sapphire-obsidian-light':['sapphire-obsidian','light'],'bronze-basalt':['bronze-basalt','dark'],'bronze-basalt-light':['bronze-basalt','light'],'chalk-coal':['chalk-coal','dark'],'chalk-coal-light':['chalk-coal','light']};\n"
    + "/* r4: the four r3 themes are read, never rewritten, and land on the nearest skin. */\nconst THEME_LEGACY={'moss-iron':'sapphire-obsidian','brass-slate':'bronze-basalt','felt-cream':'sapphire-obsidian-light','steel-cobalt':'sapphire-obsidian'};",
    "theme table");
  t = swap(t, "function themeChoice(){const t=state.preferences&&state.preferences.theme;return THEME_FACE[t]?t:t==='dark'?'brass-slate':t==='light'?'felt-cream':'moss-iron';}",
    "function themeChoice(){const t=state.preferences&&state.preferences.theme;return THEME_FACE[t]?t:THEME_LEGACY[t]?THEME_LEGACY[t]:t==='light'?'sapphire-obsidian-light':'sapphire-obsidian';}", "themeChoice");
  set(f, t);
}

/* 4. index.html: the first paint, before any script */
{
  const f = "index.html";
  let t = get(f);
  t = swap(t, 'data-palette="moss-iron"', 'data-palette="sapphire-obsidian"', "index default palette", {all: true});
  set(f, t);
}

/* 5. tests */
{
  set("tests/design-tokens.mjs", readFileSync(path.join(HERE, "tests", "design-tokens.mjs"), "utf8"));
  let a = get("tests/a11y-app.mjs");
  a = swap(a, 'const THEMES = ["moss-iron", "brass-slate", "felt-cream", "steel-cobalt"];',
    'const THEMES = ["sapphire-obsidian", "sapphire-obsidian-light", "bronze-basalt", "bronze-basalt-light", "chalk-coal", "chalk-coal-light"];', "a11y themes");
  a = swap(a, "at 4.5:1 in all four themes.", "at 4.5:1 in every skin and register.", "a11y message", {optional: true});
  set("tests/a11y-app.mjs", a);
  set("tests/type-final.mjs", readFileSync(path.join(HERE, "tests", "type-final.mjs"), "utf8"));
}


/* 6. Type: Cinzel and Lato */
const copies = [], removals = [];
{
  const FACES = [["Cinzel", 600, "cinzel-600"], ["Lato", 400, "lato-400"], ["Lato", 700, "lato-700"]];
  const UR_LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD", UR_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
  const faces = FACES.flatMap(([fam, w, stem]) => [["", UR_LATIN], ["-ext", UR_EXT]].map(([sub, ur]) =>
    `@font-face{font-family:${fam};font-weight:${w};font-style:normal;font-display:swap;src:url("assets/crankmagic/${stem}${sub}.woff2?v=1") format("woff2");unicode-range:${ur}}`)).join("\n");
  /* the literal stacks: only in code, never in comments, so the record in the comments keeps its meaning */
  const inCode = (text, fn) => text.split(/(\/\*[\s\S]*?\*\/)/).map((part, i) => (i % 2 ? part : fn(part))).join("");
  const lato = (s) => s.replace(/CrankOxanium,Satoshi,sans-serif/g, "var(--font-body)").replace(/'Satoshi'|Satoshi(?=[,\s])/g, "Lato");

  let d = get("crankmagic-design.css");
  const first = d.indexOf("@font-face{font-family:Satoshi;");
  if (first < 0) throw new Error("type: the Satoshi @font-face anchor is missing");
  d = d.replace(/@font-face\{font-family:(Satoshi|'Young Serif');[^}]*\}\n?/g, "");
  d = d.slice(0, first) + "/* Cinzel and Lato (SIL OFL 1.1, assets/crankmagic/cinzel-OFL.txt and lato-OFL.txt), self-hosted: the faces of Rob's reference,\n   Concept B (docs/design/2026-10-25-redesign-r4/project/reference/). Cinzel names things; Lato does the work. */\n" + faces + "\n" + d.slice(first);
  /* The wordmark is the app's name: it keeps its Oxanium subset, and only its Satoshi fallback becomes Lato. */
  d = d.split("#matrix-v2 .v-brand{font-family:CrankOxanium,Satoshi,sans-serif").join("#matrix-v2 .v-brand{font-family:CrankOxanium,Lato,sans-serif");
  d = inCode(d, lato);
  set("crankmagic-design.css", d);

  let c = get("crankmagic.css");
  c = swap(c, "#matrix-v2 :is(h1,h2,h3,.cm-deck-tile h3,.cm-stats strong,.cm-summary-figures strong,.cm-budget-figures strong,.cm-kpi strong){font-family:var(--v-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking);text-transform:var(--display-case)}",
    "#matrix-v2 h1{font-family:var(--v-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking);text-transform:var(--display-case)}#matrix-v2 :is(h2,h3,.cm-deck-tile h3,.cm-stats strong,.cm-summary-figures strong,.cm-budget-figures strong,.cm-kpi strong){font-family:var(--v-body);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);text-transform:none}", "heading rule");
  c = swap(c, "/* Headings and big figures in the display face; everything else stays Satoshi (guide, step 1). */", "/* r4: page titles in the display face (Cinzel); h2, h3 and big figures in the body face (Lato) at --heading-weight. */", "heading comment", {optional: true});
  c = swap(c, "below that it stays the Satoshi 900 heading every other page title is. */", "since r4 the hero and the page title are both Cinzel, so the face no longer changes with the width. */", "hero comment", {optional: true});
  c = swap(c, "#matrix-v2 .v-brand{font-family:CrankOxanium,Satoshi,sans-serif}", "#matrix-v2 .v-brand{font-family:CrankOxanium,Lato,sans-serif}", "page wordmark fallback");
  c = inCode(c, lato);
  set("crankmagic.css", c);

  for (const f of ["crankmagic-stage.css", "crankmagic-graph.js", "crankmagic-app.js"]) set(f, inCode(get(f), lato));
  for (const f of ["privacy.html", "terms.html"]) {
    let h = get(f);
    h = h.replace(/@font-face\{font-family:Satoshi;font-weight:(400|700);font-display:swap;src:url\("assets\/crankmagic\/satoshi-(400|700)\.woff2\?v=1"\)/g,
      (m, w) => `@font-face{font-family:Lato;font-weight:${w};font-display:swap;src:url("assets/crankmagic/lato-${w}.woff2?v=1")`);
    set(f, lato(h));
  }

  let sw = get("crankmagic-sw.js");
  const fontsNow = "'assets/crankmagic/barlowcondensed-800.woff2?v=1'";
  if (!sw.includes(fontsNow)) throw new Error("type: service worker anchor missing");
  sw = sw.replace(/'assets\/crankmagic\/(satoshi-\d+|youngserif-400(-ext)?|barlowcondensed-(600|700)(-ext)?)\.woff2\?v=1',\s*/g, "");
  sw = sw.replace(fontsNow, ["cinzel-600", "cinzel-600-ext", "lato-400", "lato-400-ext", "lato-700", "lato-700-ext"].map((s) => `'assets/crankmagic/${s}.woff2?v=1'`).join(", ") + ", " + fontsNow);
  set("crankmagic-sw.js", sw);

  let n = get("THIRD-PARTY-NOTICES.md");
  n = cut(n, "| **Satoshi** |", "self-hosted from the `@fontsource/barlow-condensed` 5.3.0 files, unmodified. |",
    "| **Cinzel** | `assets/crankmagic/cinzel-600.woff2`, `cinzel-600-ext.woff2` | SIL Open Font License 1.1, full text in `assets/crankmagic/cinzel-OFL.txt`; Copyright 2020 The Cinzel Project Authors. The display face since r4 (2026-10-25): the wordmark, page titles and the deck title. Self-hosted from the `@fontsource/cinzel` 5.3.0 files, unmodified. |\n"
    + "| **Lato** | `assets/crankmagic/lato-{400,700}.woff2` and `-ext` | SIL Open Font License 1.1, full text in `assets/crankmagic/lato-OFL.txt`; Copyright (c) 2010-2011 by tyPoland Lukasz Dziedzic, Reserved Font Name \"Lato\". The body face since r4. Self-hosted from the `@fontsource/lato` 5.3.0 files, unmodified. |\n"
    + "| **Barlow Condensed** | `assets/crankmagic/barlowcondensed-800.woff2` and `-ext` | SIL Open Font License 1.1, full text in `assets/crankmagic/barlowcondensed-OFL.txt`; Copyright 2017 The Barlow Project Authors. Since r4 only the 800 face, for the table's neon callout word. Self-hosted from the `@fontsource/barlow-condensed` 5.3.0 files, unmodified. |", "notices");
  set("THIRD-PARTY-NOTICES.md", n);
  let a = get("assets/crankmagic/README.md");
  a = swap(a, "Satoshi is the interface font; the embedded Oxanium subset in\n`crankmagic-design.css` is the wordmark. The included `oxanium-OFL.txt` accompanies\nthat subset.",
    "Since r4 (2026-10-25) the faces are Cinzel 600 for page titles and the deck title, and Lato 400 and\n700 for everything else; Barlow Condensed 800 is the callout word only. The embedded Oxanium subset in\n`crankmagic-design.css` is still the wordmark, the app's name, and `oxanium-OFL.txt` accompanies it.\nEach face ships with its OFL text beside it (`cinzel-OFL.txt`, `lato-OFL.txt`, `barlowcondensed-OFL.txt`).", "assets readme");
  set("assets/crankmagic/README.md", a);

  for (const f of ["cinzel-600.woff2", "cinzel-600-ext.woff2", "lato-400.woff2", "lato-400-ext.woff2", "lato-700.woff2", "lato-700-ext.woff2", "cinzel-OFL.txt", "lato-OFL.txt"]) copies.push([path.join(HERE, "fonts", f), path.join(ROOT, "assets/crankmagic", f)]);
  for (const f of ["satoshi-400.woff2", "satoshi-500.woff2", "satoshi-700.woff2", "satoshi-900.woff2", "youngserif-400.woff2", "youngserif-400-ext.woff2", "youngserif-OFL.txt",
                   "barlowcondensed-600.woff2", "barlowcondensed-600-ext.woff2", "barlowcondensed-700.woff2", "barlowcondensed-700-ext.woff2"]) removals.push(path.join(ROOT, "assets/crankmagic", f));
}

for (const [f, t] of edits) writeFileSync(path.join(ROOT, f), t);
for (const [from, to] of copies) copyFileSync(from, to);
for (const f of removals) if (existsSync(f)) rmSync(f);
console.log(`apply-r4: ${edits.size} files changed: ${[...edits.keys()].join(", ")}; ${copies.length} font files added, ${removals.filter((f) => !existsSync(f)).length} retired files removed`);
