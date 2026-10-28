# r4 token change: CHANGELOG

One PR against `minorrob/mtg-deck-matrix` that swaps the r3 tokens for r4's. It is a token change: the names stay, the values move, the four r3 themes become one governing skin and two color-only skins, and every screen h1 rule reads the scale instead of restating it.

## Apply it

From the repo root, on a new branch:

```
node docs/design/2026-10-25-redesign-r4/pr/apply-r4.mjs
node tests/design-tokens.mjs
```

The script edits by anchor and stops without writing if an anchor has moved. On a copy of the repo as of 2026-10-25 it changes {{FILES}} files and the token test reports: `{{TEST}}`.

Red first, as AGENTS.md asks: on that copy, setting one Bronze & Basalt value by hand fails "bronze-basalt dark is the designer's, value for value"; adding `--radius-control` to the Chalk & Coal block fails "chalk-coal is colors only"; putting `#matrix-v2 h1{font-size:36px}` back fails "every h1 rule reads --text-h1 or --text-hero". Restored, it goes green.

`diffs/` holds the review diff for each file.

## What the PR touches

| File | Change |
|---|---|
| `crankmagic-design.css` | Block A (the type comment, the Gallery tokens, the four themes, the `--v-*` block and the `--accent-fill` override) becomes Sapphire & Obsidian dark and light plus the Bronze & Basalt and Chalk & Coal skins. Block B (DEEP FIELD) becomes the `--v-*` layer, every name a `var()` of a token, and the fixed table tokens. The type is Cinzel 600 and Lato 400/700 (both latin and latin-ext subsets) with Barlow Condensed 800 for the callout; the Satoshi and Young Serif faces go. The CrankMagic wordmark (`.v-brand`) is Cinzel 600 in capitals at .08em, in the new `--color-brand` gilt, and the embedded Oxanium subset goes (Rob, 2026-10-26). `#matrix-v2 h1` reads `--text-h1`; the 520px h1 override and the overview art's 32px h1 go. |
| `crankmagic.css` | Seven h1 rules read `--text-h1` or `--text-hero`: the base h1, the page head, the deck hero (two rules), the gallery deck hero, the landing and the showcase. The heading rule splits: `h1` takes the display face (Cinzel), and `h2`, `h3`, the tile names and the big figures take the body face at `--heading-weight`. The callout word reads `--font-callout`; literal Satoshi stacks become Lato. |
| `crankmagic-stage.css`, `crankmagic-graph.js`, `privacy.html`, `terms.html` | Their literal Satoshi stacks become Lato (the legal pages self-host Lato 400 and 700); the Play headings that borrowed the wordmark's Oxanium become the body face, so nothing is Oxanium. |
| `crankmagic-sw.js` | Precaches the six Cinzel and Lato files instead of the Satoshi, Young Serif and Barlow 600/700 files. |
| `assets/crankmagic/` | Adds `cinzel-600`, `lato-400`, `lato-700` (each with `-ext`) and their OFL texts from `pr/fonts/`; removes the Satoshi, Young Serif and Barlow 600/700 files. `oxanium-OFL.txt` goes with the Oxanium subset. |
| `THIRD-PARTY-NOTICES.md` | The typeface table lists Cinzel, Lato and Barlow Condensed 800. |
| `crankmagic-app.js` | `THEMES` and `THEME_FACE` list the three skins in both registers; `THEME_LEGACY` maps the r3 choices forward; `themeChoice()` reads it. |
| `index.html` | The first paint is `data-palette="sapphire-obsidian"`. |
| `tests/design-tokens.mjs` | Reads the r4 handoff; checks both skins value for value in both registers and that skins are colors only; checks the scale floor (12px), the HUD floor (18px) and that every h1 reads a token; all ten status rungs are the designer's now. |
| `tests/a11y-app.mjs` | Probes the six skin and register pairs instead of the four r3 themes. |
| `tests/type-final.mjs` | Replaced: with no choice the page is Sapphire & Obsidian; at 1400, 1136 and 390 the deck title is Cinzel 600 and its file loads; h2 is Lato 700; body text is Lato 400 and both Lato files load; the wordmark is Cinzel in gilt capitals; no page text is Satoshi, Young Serif or Oxanium, and Barlow Condensed only sets the callout. |

## Stored preferences

Nobody loses their choice. `THEME_LEGACY` reads the r3 values and never rewrites them:

| Saved r3 choice | Lands on |
|---|---|
| `moss-iron` (the r3 default) | `sapphire-obsidian` |
| `brass-slate` | `bronze-basalt` (warm metal on stone, its nearest) |
| the pre-A1 `dark` | `sapphire-obsidian` |
| `felt-cream`, or the pre-A1 `light` | `sapphire-obsidian-light` |
| `steel-cobalt` | `sapphire-obsidian` |

## Every token, old to new

Generated from the current `crankmagic-design.css` and the patched one. A dot means the block did not set that token. {{COUNTS}}

{{TOKEN_MAP}}

## The skins' values

Each skin sets these and only these.

{{SKIN_MAP}}

## The next PR: the page-layer sweep

The tokens are right after this PR, but the page layer still undercuts them. These are mechanical and safe to do in one pass, after this lands:

| Today in `crankmagic.css` | Count | Becomes |
|---|---|---|
| `font-size:9px`, `10px`, `10.5px`, `11px`, `11.5px` | 152 | `var(--text-label)` (12px). Legal footer links may stay at 12px; nothing goes lower. |
| `font-size:12px`, `12.5px` | 213 | `var(--text-label)` when uppercase, otherwise `var(--text-small)` (13px) |
| `font-size:13px`, `13.5px` | 141 | `var(--text-small)` |
| `border-radius` 2px to 10px (literal) | about 85 | `var(--radius-control)` |
| `border-radius` 12px to 14px (literal) | 8 | `var(--radius-card)` |
| `border-radius` 16px to 24px (literal) | 7 | `var(--radius-tile)` |
| `border-radius:999px` | 17 | `var(--radius-pill)` |

Keep `50%` (discs), `0`, `inherit` and the print sheets' `pt` sizes. The token test can then add a ceiling for literal font sizes and radii the way it holds raw hex down.

## PR prompt

```
Repo minorrob/mtg-deck-matrix, branch claude/r4-tokens, follow AGENTS.md (red-first test, docs/ACTIVE.md
note, local-ci, one green Actions run, merge commit, "merge when done").

Context: design system r4, docs/design/2026-10-25-redesign-r4. Finding: four r3 themes act as four brands,
every r3 accent shares a hue with a status or with money, and the h1 size is restated in ten rules. Principles G4, G9; checklist B6, D1, F1, F4.

Change: run docs/design/2026-10-25-redesign-r4/pr/apply-r4.mjs from the repo root. It swaps the token blocks in
crankmagic-design.css, points every screen h1 rule at --text-h1 or --text-hero, maps the r3 theme choices forward in
crankmagic-app.js, sets the first paint to sapphire-obsidian in index.html, swaps the faces to Cinzel and Lato (files, @font-face,
service worker, notices), and replaces or edits the three tests.
Do not: sweep page-layer font sizes or radii (that is the next PR), build the Play drawers (their own change), or
change any component markup.

Acceptance:
- tests/design-tokens.mjs passes ({{N_CHECKS}} checks on the 2026-10-25 tree)
- tests/a11y-app.mjs passes in all six skin and register pairs
- tests/type-final.mjs passes at 1400, 1136 and 390
- Load Live at 1440 and 390: Decks, a deck page, Play lobby and the 3D board match renders/sapphire-obsidian-dark
Test: design-tokens.mjs; break one skin value first, watch it go red, restore.
Metric: F4 (contrast) count on the next walkthrough capture goes to zero for opaque pairs; kill criterion: any
primary button under 4.5:1 in any skin means the palette, not the page, is wrong.
```
