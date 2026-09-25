# Applying the Gallery redesign to the CrankMagic codebase — implementation guide

Read this before touching `crankmagic.css`. The first attempt recolored the primary button and the readiness bar and left everything else navy: that is what happens when the tokens are edited but the ~300 hard-coded hex literals in `crankmagic.css` / `crankmagic-design.css` are not. The stylesheet does not consume its own tokens for most surfaces. **The job is a migration of the stylesheet onto the token set, then a restructure of three components (shell, deck tile, deck page) to the Gallery layout** — not a palette swap.

Work in this order. Do not skip to step 4.

## 0. Accept before you start
- Both stylesheets are hand-tuned with hundreds of literals (`#12161f`, `#1a2030`, `#202638`, `#243d61`, `#72baff`, `#79bdff`, `#b0c3de`, `#a9bdd7`, `#39465f`, `#2e3850`, …). A find-and-replace of literals to tokens is required and is the bulk of the work.
- `crankmagic-design.css` loads first and `crankmagic.css` overrides it; the "Deep Field" block near the top of `crankmagic.css` is the one palette that actually renders. Replace that block's values with the Gallery tokens **and** stop other rules from bypassing it.
- Run `bash runtests.sh -q` and `node tests/browser-geometry.mjs` / `tests/page-budget.mjs` after each step. Page budget holds the word/control count before the first table — the Gallery adds no chrome above the fold, so it should hold; if it fails, you added copy, not the design.

## 1. Tokens (one edit, then a sweep)
Replace the Deep Field custom-property block in `crankmagic.css` (`#matrix-v2{…--v-bg:#12161f;…}`) and the mirror in `crankmagic-design.css` with:

```css
#matrix-v2{
  /* Brass & Slate — dark (default) */
  --v-bg:#1a1815; --v-panel:#231f1b; --v-raised:#2d2823; --v-field:#2d2823; --v-field-line:#4a433a;
  --v-line:#3a342c; --v-line-strong:#514a40;
  --v-ink:#f5f0e8; --v-muted:#a99e90;
  --v-accent:#d9a441; --v-on:#1a1815; --v-soft:#3a3020;
  --v-aether:#7cc4ff; --v-money:#f0b35a;
  --v-decision:#e0b273; --v-decision-bg:#2a2519; --v-decision-line:#6d5c3d; --v-decision-ink:#f6e3c6; --v-decision-field:#332c1d;
  --v-required:#ef6b60;
  --st-inbox:#5cc98a; --st-pull:#4fc2c0; --st-ordered:#3b7dd8; --st-buy:#f0b35a; --st-standin:#c39bff; --st-watch:#8f9bb3; --st-draft:#7f8ba0; --st-remove:#ef6b60; --st-reserved:#8fb3ff; --st-physical:#3fae7a;
  --mana-W:#e9d79a; --mana-U:#74b5f7; --mana-B:#a897bf; --mana-R:#f0805f; --mana-G:#77c58f;
  --v-radius:12px; --v-radius-card:18px; --v-radius-tile:22px;
  --v-display:'Young Serif',Georgia,serif; --v-body:Satoshi,system-ui,sans-serif;
}
#matrix-v2[data-theme="light"]{
  /* Felt & Cream */
  --v-bg:#f5f0e6; --v-panel:#fffdf8; --v-raised:#ece5d7; --v-field:#ece5d7; --v-field-line:#c9c0b0;
  --v-line:#d9d0bf; --v-line-strong:#bfb4a0;
  --v-ink:#1f1c18; --v-muted:#6e665a;
  --v-accent:#2f8f5b; --v-on:#f7fbf6; --v-soft:#dcebe0;
  --v-aether:#4aa6d8; --v-money:#d0603c;
  --st-inbox:#2f8f5b; --st-pull:#1f9e9c; --st-ordered:#2f6fcc; --st-buy:#d0893a; --st-standin:#8a5be0; --st-remove:#c0392f; --st-reserved:#3f6fd0;
  --mana-W:#c9a52e; --mana-U:#2b7fd8; --mana-B:#6f5c8e; --mana-R:#d0603c; --mana-G:#2f8f5b;
  color-scheme:light;
}
```
Also change `:root{background:#12161f}`, `body{background:#12161f;color:#eef4fd}` and `<meta name="theme-color">` to use the ground/ink (`#1a1815` / `#f5f0e8`), and add `<link href="https://fonts.googleapis.com/css2?family=Young+Serif&display=swap">` to `index.html` (CSP: add `https://fonts.googleapis.com` to `style-src` and `https://fonts.gstatic.com` to `font-src`).

**Then the sweep.** In both stylesheets, replace every literal below with the token. Do it mechanically (sed / a script), then grep for `#[0-9a-f]{6}` and review what is left — anything remaining that is a blue/navy/slate tint gets mapped too.

| Literal(s) found in the CSS | Replace with |
|---|---|
| `#12161f` `#10121b` `#111218` `#0f1521*` `#101725*` `#050b14*` | `var(--v-bg)` (gradients over art: `color-mix(in oklab, var(--v-bg) 90%, transparent)` etc.) |
| `#1a2030` `#171b27` `#171d2a` `#191b24` `#1a2333` `#1d293d` `#151b28` `#1e2c43` `#182437` | `var(--v-panel)` |
| `#202638` `#232c40` `#243248` `#253048` `#1e2a3f` `#2b3d5c` `#2a3448` `#293a54` `#202737` `#1d2a3f` `#1d2b41` `#1b2739` | `var(--v-raised)` |
| `#243d61` `#1f2d45` `#233d5c` `#314565` `#2b4a70` `#0e3358` | `var(--v-raised)` (selected/hover states); the active rail item is `var(--v-raised)` + weight 700, no inset blue bar |
| `#2d3543` `#5a677c` (fields) | `var(--v-field)` / `var(--v-field-line)` |
| `#2e3850` `#39465f` `#343847` `#344258` `#38465e` `#3a4a64` `#36445e` `#3b4960` `#3b465d` `#43536f` `#4b5975` `#455a76` `#526887` `#587290` `#6b9ad0` `#4a6a95` `#6a91ba` `#6b9ccc` | `var(--v-line)` (use `--v-line-strong` where a border must read on hover) |
| `#eef4fd` `#f0f1f7` `#ecf2fc` `#eef6ff` `#f3f8ff` `#f1f6ff` `#e6f0ff` `#edf4ff` `#dfeeff` `#e7f2ff` | `var(--v-ink)` |
| `#93a6c2` `#aeb4c6` `#b0c3de` `#b0c3dc` `#a9bdd7` `#a5b7ce` `#b4c3d9` `#b5c9e5` `#bdd6f2` `#9fc3e8` `#8fa6c4` `#8fb0d4` `#a3b8d3` `#9db8d8` `#b8cee8` `#c3d7ed` `#c5d6ea` `#c9d4e6` `#d3eaff` `#bddeff` `#dbe7f7` `#c5dcf4` `#aec7e5` `#d8e7fa` `#cfe3f7` | `var(--v-muted)` (labels) or `var(--v-ink)` (body text) — decide by role: headers/labels muted, content ink |
| `#72baff` `#79bdff` `#78baff` `#8cc9ff` `#8ecbff` `#85c5ff` `#9addff` `#a4b3ff` `#73bcff` `#9fd0ff` `#689edc` `#3852bd` `#0869cd` | `var(--v-accent)` for actions/links/selected underline; `var(--v-aether)` **only** for the focus ring and the graph focus |
| `#ffd166` `#ffe9b3` `#e2b85a` (gold "is-on" states) | `var(--v-accent)` / `color-mix(in oklab, var(--v-accent) 18%, var(--v-panel))` |
| `#5cc98a #4fc2c0 #3b7dd8 #f0b35a #c39bff #ef6b60` where written as literals | the matching `--st-*` |
| `#fff0b4 #53acff #696076 #ee735f #66b889` (PIP map in JS + `.cm-color.*`) | `--mana-*` (in `crankmagic-decks.js` `PIP`, read them from `getComputedStyle`) |
| `#081320` `#06131f` `#0c1120` (text on accent) | `var(--v-on)` |

Also: every `border-radius` of 5–9px on controls → `var(--v-radius)`; panels 10–13px → `var(--v-radius-card)`; `.cm-deck-tile` 15px → `var(--v-radius-tile)`. Every `box-shadow` with `#000…` glow on a *blue* stays as a shadow but drop the blue tints (`#0065c338`, `#279ef93a`, `#008eff20`, etc. in the Lab orbs → `color-mix(in oklab, var(--v-accent) 25%, transparent)`).

**Type.** Add to the top of `crankmagic.css`: `#matrix-v2 :is(h1,h2,h3,.cm-deck-tile h3,.cm-stats strong,.cm-summary-figures strong,.cm-budget-figures strong,.cm-kpi strong){font-family:var(--v-display);font-weight:400;letter-spacing:-.015em}`. Body stays Satoshi. h1 44–56px / line-height 1.0–1.05.

**Acceptance for step 1:** `grep -cE '#[0-9a-f]{6}' crankmagic.css` drops to the handful of true constants (pure black shadows, `#fff` on art). Screenshot: no navy anywhere, no blue button, no blue selected rail item, no blue links.

## 2. Shell (index.html + crankmagic.css)
- Remove `<header class="v-top">`. Move logo + wordmark into the top of `.cm-sidebar` (36px logo, 19px/700 wordmark), and keep the aether canvases there: re-anchor `crankmagic-brand.js` to the new block (`.v-brand-block` moves inside the rail; its ResizeObserver already measures the block — set `--v-aether-thread`/`--v-aether-core` to `var(--v-aether)` tints).
- Rail 216px (`.cm-layout{grid-template-columns:216px minmax(0,1fr)}`), padding 22px 18px, links 10px radius, current = `var(--v-raised)` + 700 with **no** `box-shadow:inset 3px 0 …`. Sub-nav under the current page: 12px indent, 2px `--v-line` rule, 13px rows; deck rows get an 8px dot in `--mana-<first color>`; the open deck's sub-pages (Ready to add, Make the change) listed under it (`C.SUBNAV.decks`).
- Take a Tour · Share · Send Feedback · User Functions → a **Menu ▾** button at the rail foot (reuse the existing popovers; same actions).
- `#cm-main{padding:28px 36px 48px}`. Footer legal text stays, muted.
- Page head: `.cm-page-head h1` display face; the `?` help button becomes a 34px outlined circle **inside More ▾** (keep `data-action="page-help"`); the one primary button uses `--v-accent`/`--v-on`; all others outlined `--v-line` with `--v-raised` on hover. Buttons 42px, radius `--v-radius`, weight 700 primary / 600 secondary.

## 3. Deck tiles (`views.decks` in crankmagic-decks.js + `.cm-deck-tile*`)
Replace the tile CSS wholesale (see `screens/Gallery Decks.dc.html` for exact values):
- `.cm-deck-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}`; tile `aspect-ratio:3/4; border-radius:var(--v-radius-tile); border:0; background:var(--v-panel); overflow:hidden; transition:transform .25s ease, box-shadow .25s ease`; hover `translateY(-6px) rotate(-.4deg)` + `box-shadow:0 24px 50px -20px var(--tint)`. **Drop the stage-colored borders** (`.cm-stage-*`) — the stage is the pill.
- Set `style="--tint:var(--mana-<first color>)"` on each tile in JS.
- Art: `object-fit:cover; object-position:50% 22%; transform:scale(1.85); transform-origin:50% 26%; opacity:1`. Gradient `:after`: `linear-gradient(180deg,transparent 30%,color-mix(in oklab,var(--tint) 30%,#100e0c) 72%,#100e0c 100%)`.
- Top-left: stage pill (blurred `rgba(16,14,12,.55)`, 12px/600, 7px dot in the stage's `--st-*`). Top-right: mana pips 20px. **Compare tick** stays but only on hover/focus (`opacity:0` → `1`).
- Foot (padding 18px 20px 20px): deck number eyebrow 12px uppercase in `color-mix(in oklab,var(--tint) 70%,#fff)`; commander name 24px display; mechanics 13px at 80% white; readiness bar 6px; caption 12px + `B3` right. Remove the `<footer>` row (⋯ menu moves to the tile's hover top-left next to the tick).
- Last grid cell: dashed "+ New deck" tile.
- Page head summary line replaces the toolbar: "Seven decks, all playable. **123 substitutes** still standing in, **$215** to finish them all." — computed from readiness; "How a deck comes together" and "Show archived" become footer links under the grid.

## 4. Deck page, Library, Explore
Follow `screens/Gallery Deck Page.dc.html`, `Gallery Library.dc.html`, `Gallery Explore Entry.dc.html`, `Gallery Explore.dc.html` — the README's "Screens" section lists every measurement. Key structural changes: hero with the tilted card (`rotate(-3deg)`) beside the copy; tabs as a segmented control; the Progress/Cost card becomes the bento (Next · Progress ring · Cost · Curve · Type · Purpose · How it plays · Upgrade path · Record); Library counts as tiles; Explore entry as three cards.

## 5. Theme switch
`data-theme="light"` on `#matrix-v2`, stored in `preferences.theme`, toggled from Menu ▾ ("Appearance · Dark / Light / System"). `color-scheme` follows. Nothing else changes — all color comes from the tokens after step 1.

## Definition of done (per page)
1. No hex literal from the old palette renders (inspect with DevTools: computed background/border of rail, tiles, buttons, tabs, table headers, chips).
2. Exactly one accent-filled button on the page.
3. Blue appears only in: the logo, the aether mist, the focus ring, the Explore graph focus.
4. Headings and big figures in Young Serif; everything else Satoshi.
5. Radii 12 / 18 / 22 only.
6. Screenshot side-by-side with the matching `screens/*.dc.html` at 1280px: same structure, same spacing within ±4px.
