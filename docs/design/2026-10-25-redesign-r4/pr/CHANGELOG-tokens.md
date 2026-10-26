# r4 token change: CHANGELOG

One PR against `minorrob/mtg-deck-matrix` that swaps the r3 tokens for r4's. It is a token change: the names stay, the values move, the four r3 themes become one governing skin and two color-only skins, and every screen h1 rule reads the scale instead of restating it.

## Apply it

From the repo root, on a new branch:

```
node docs/design/2026-10-25-redesign-r4/pr/apply-r4.mjs
node tests/design-tokens.mjs
```

The script edits by anchor and stops without writing if an anchor has moved. On a copy of the repo as of 2026-10-25 it changes thirteen files and the token test reports: `design-tokens: 196 checks passed. The r4 tokens match the handoff in every skin and register, skins are colors only, and raw hex only goes down.`.

Red first, as AGENTS.md asks: on that copy, setting one Bronze & Basalt value by hand fails "bronze-basalt dark is the designer's, value for value"; adding `--radius-control` to the Chalk & Coal block fails "chalk-coal is colors only"; putting `#matrix-v2 h1{font-size:36px}` back fails "every h1 rule reads --text-h1 or --text-hero". Restored, it goes green.

`diffs/` holds the review diff for each file.

## What the PR touches

| File | Change |
|---|---|
| `crankmagic-design.css` | Block A (the type comment, the Gallery tokens, the four themes, the `--v-*` block and the `--accent-fill` override) becomes Sapphire & Obsidian dark and light plus the Bronze & Basalt and Chalk & Coal skins. Block B (DEEP FIELD) becomes the `--v-*` layer, every name a `var()` of a token, and the fixed table tokens. The type is Cinzel 600 and Lato 400/700 (both latin and latin-ext subsets) with Barlow Condensed 800 for the callout; the Satoshi and Young Serif faces go. The embedded Oxanium subset stays: `.v-brand`, the CrankMagic wordmark, is unchanged. `#matrix-v2 h1` reads `--text-h1`; the 520px h1 override and the overview art's 32px h1 go. |
| `crankmagic.css` | Seven h1 rules read `--text-h1` or `--text-hero`: the base h1, the page head, the deck hero (two rules), the gallery deck hero, the landing and the showcase. The heading rule splits: `h1` takes the display face (Cinzel), and `h2`, `h3`, the tile names and the big figures take the body face at `--heading-weight`. The callout word reads `--font-callout`; literal Satoshi stacks become Lato. |
| `crankmagic-stage.css`, `crankmagic-graph.js`, `privacy.html`, `terms.html` | Their literal Satoshi stacks become Lato (the legal pages self-host Lato 400 and 700); the Play headings that borrowed the wordmark's Oxanium become the body face, so Oxanium sets only the app name. |
| `crankmagic-sw.js` | Precaches the six Cinzel and Lato files instead of the Satoshi, Young Serif and Barlow 600/700 files. |
| `assets/crankmagic/` | Adds `cinzel-600`, `lato-400`, `lato-700` (each with `-ext`) and their OFL texts from `pr/fonts/`; removes the Satoshi, Young Serif and Barlow 600/700 files. `oxanium-OFL.txt` stays with the wordmark. |
| `THIRD-PARTY-NOTICES.md` | The typeface table lists Oxanium (the wordmark), Cinzel, Lato and Barlow Condensed 800. |
| `crankmagic-app.js` | `THEMES` and `THEME_FACE` list the three skins in both registers; `THEME_LEGACY` maps the r3 choices forward; `themeChoice()` reads it. |
| `index.html` | The first paint is `data-palette="sapphire-obsidian"`. |
| `tests/design-tokens.mjs` | Reads the r4 handoff; checks both skins value for value in both registers and that skins are colors only; checks the scale floor (12px), the HUD floor (18px) and that every h1 reads a token; all ten status rungs are the designer's now. |
| `tests/a11y-app.mjs` | Probes the six skin and register pairs instead of the four r3 themes. |
| `tests/type-final.mjs` | Replaced: with no choice the page is Sapphire & Obsidian; at 1400, 1136 and 390 the deck title is Cinzel 600 and its file loads; h2 is Lato 700; body text is Lato 400 and both Lato files load; the wordmark is still the CrankMagic Oxanium mark; no page text is Satoshi or Young Serif, Barlow Condensed only sets the callout and Oxanium only the wordmark. |

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

Generated from the current `crankmagic-design.css` and the patched one. A dot means the block did not set that token. 48 changed, 42 new, 81 same, 0 gone.

| Token | r3 dark (Brass & Slate) | r3 light (Felt & Cream) | r3 Moss & Iron | r3 Steel & Cobalt | r4 dark (Sapphire & Obsidian) | r4 light | Note |
|---|---|---|---|---|---|---|---|
| `--color-accent` | `#d9a441` | `#2f8f5b` | `#5fae5c` | `#2f7ee8` | `#3066d1` | `#1043a8` | changed. Sapphire replaces brass. Carries its own on-accent ink at 5.32:1 dark, 8.79:1 light, so --accent-fill no longer darkens it. |
| `--color-accent-hover` | · | · | · | · | `#2157c0` | `#013397` | new. New in r4. |
| `--color-accent-soft` | · | · | · | · | `#1b273e` | `#e6e8e9` | new. New in r4. |
| `--color-aether` | `#7cc4ff` | `#4aa6d8` | `#6fb7d9` | `#5fe0ff` | `#69d6ef` | `#006c97` | changed. Light register now 4.97:1 on ground (was 2.39:1). |
| `--color-bg` | `#1a1815` | `#f5f0e6` | `#121511` | `#0f1217` | `#090c12` | `#f2ece1` | changed |
| `--color-decision-bg` | · | · | · | · | `#2a200d` | `#fff3dd` | new. New in r4. |
| `--color-decision-field` | · | · | · | · | `#372c15` | `#fceed1` | new. New in r4. |
| `--color-decision-ink` | · | · | · | · | `#f8e6c3` | `#4c2e00` | new. New in r4. |
| `--color-decision-line` | · | · | · | · | `#806429` | `#c19f66` | new. New in r4. |
| `--color-faint` | · | · | · | · | `#82868f` | `#858076` | new. New in r4. |
| `--color-field-line` | · | · | · | · | `#7c8089` | `#858076` | new. New in r4. |
| `--color-hover` | · | · | · | · | `#23262d` | `#f0ece1` | new. New in r4. |
| `--color-ink` | `#f5f0e8` | `#1f1c18` | `#eef1e8` | `#eef3f8` | `#f3f0e9` | `#11161f` | changed |
| `--color-line` | `#3a342c` | `#d9d0bf` | `#2f382c` | `#2b3540` | `#373b42` | `#cfcabf` | changed. 1.74:1 on ground dark, 1.39:1 light (was 1.44:1 and 1.35:1). |
| `--color-line-strong` | · | · | · | · | `#4e535a` | `#b3ada3` | new. New in r4. |
| `--color-money` | `#f0b35a` | `#d0603c` | `#c9a24a` | `#e6a23c` | `#f2bb3b` | `#905c00` | changed. Same gold family; light register now 4.81:1 on ground (was 3.41:1). |
| `--color-muted` | `#a99e90` | `#6e665a` | `#97a391` | `#8f9db0` | `#b1b6bf` | `#5f5a51` | changed |
| `--color-on-accent` | `#1a1815` | `#f7fbf6` | `#0d120c` | `#ffffff` | `#ffffff` | `#ffffff` | changed. White on the accent in both registers (dark ink on the Chalk & Coal dark accent). |
| `--color-on-required` | · | · | · | · | `#090b0f` | `#ffffff` | new. New. Words on the danger fill: 5.20:1 dark, 9.99:1 light. The dark crimson is bright enough to be text on the ground, so its fill takes dark words. |
| `--color-panel` | `#231f1b` | `#fffdf8` | `#181d17` | `#151a21` | `#15181f` | `#fffaee` | changed |
| `--color-raised` | `#2d2823` | `#ece5d7` | `#22291f` | `#1e252e` | `#2b2f36` | `#ffffff` | changed. Dark: 1.32:1 on panel (was 1.12:1). Light: white; its 3.93:1 field line carries the plane. |
| `--color-required` | · | · | · | · | `#ed4546` | `#8b000b` | new. New in r4. |
| `--mana-B` | `#a897bf` | `#6f5c8e` | `#8c8aa0` | `#8b86a6` | `#a897bf` | `#6f5c8e` | same |
| `--mana-G` | `#77c58f` | `#2f8f5b` | `#5fae5c` | `#4fb27a` | `#77c58f` | `#2f8f5b` | same |
| `--mana-R` | `#f0805f` | `#d0603c` | `#d66a4a` | `#e8664a` | `#f0805f` | `#d0603c` | same |
| `--mana-U` | `#74b5f7` | `#2b7fd8` | `#5f9fd6` | `#4f9cf5` | `#74b5f7` | `#2b7fd8` | same |
| `--mana-W` | `#e9d79a` | `#c9a52e` | `#d9c98c` | `#e3d597` | `#e9d79a` | `#c9a52e` | same |
| `--st-buy` | `#f0b35a` | `#d0893a` | `#c9a24a` | `#e6a23c` | `#f2bb3b` | `#905c00` | changed |
| `--st-draft` | `light-dark(#69738a,#7f8ba0)` | · | `#7f8b86` | `#7f8ba0` | `#82868f` | `#858076` | changed. Same. |
| `--st-inbox` | `#5cc98a` | `#2f8f5b` | `#5fae5c` | `#4fb27a` | `#4ed275` | `#007f38` | changed |
| `--st-ordered` | `#3b7dd8` | `#2f6fcc` | `#4f86c9` | `#4f9cf5` | `#00a4b1` | `#0698a4` | changed. Blue to aether teal, so ordered can never be read as the sapphire button. |
| `--st-physical` | `light-dark(#237a4a,#3fae7a)` | · | `#4a9a4a` | `#3f9a68` | `#4ed275` | `#007f38` | changed. Same; now the owned family's base. |
| `--st-pull` | `#4fc2c0` | `#1f9e9c` | `#3fa9a4` | `#3fbdc4` | `#a8eeba` | `#409f61` | changed |
| `--st-remove` | `#ef6b60` | `#c0392f` | `#e0655a` | `#ef6b60` | `#ed4546` | `#8b000b` | changed |
| `--st-reserved` | `light-dark(#3f6fd0,#8fb3ff)` | · | `#7fa6dd` | `#7fb0ff` | `#a8eeba` | `#409f61` | changed. Same; now the owned family's light step. |
| `--st-standin` | `#c39bff` | `#8a5be0` | `#a486d6` | `#b18cf0` | `#f7e0a0` | `#b5820c` | changed |
| `--st-watch` | `light-dark(#5f6b80,#8f9bb3)` | · | `#8a95a3` | `#8f9db0` | `#b1b6bf` | `#5f5a51` | changed. Moved from a light-dark() literal into each skin's color block. |
| `--accent-fill` | `var(--color-accent)` | · | · | `color-mix(in oklab,var(--color-accent) 80%,black)` | `var(--color-accent)` | · | same. The darkening override for Felt & Cream and Steel & Cobalt is gone; every r4 accent carries its own ink. |
| `--action-primary` | `var(--color-accent)` | `var(--color-accent)` | · | · | `var(--color-accent)` | `var(--color-accent)` | same |
| `--action-primary-text` | `var(--color-on-accent)` | `var(--color-on-accent)` | · | · | `var(--color-on-accent)` | `var(--color-on-accent)` | same |
| `--border-default` | `var(--color-line)` | `var(--color-line)` | · | · | `var(--color-line)` | `var(--color-line)` | same |
| `--callout-answer` | `#5fd3ff` | · | · | · | `#5fd3ff` | · | same |
| `--callout-fade` | `#c99bff` | · | · | · | `#c99bff` | · | same |
| `--callout-growth` | `#6ff06a` | · | · | · | `#6ff06a` | · | same |
| `--callout-harm` | `#ff5c4d` | · | · | · | `#ff5c4d` | · | same |
| `--callout-value` | `#ffd34d` | · | · | · | `#ffd34d` | · | same |
| `--card-back` | `#3a2f22` | · | · | · | `#3a2f22` | · | same |
| `--card-back-edge` | `#2c231a` | · | · | · | `#2c231a` | · | same |
| `--card-face` | `#ece5d6` | · | · | · | `#ece5d6` | · | same |
| `--card-face-edge` | `#cfc5b0` | · | · | · | `#cfc5b0` | · | same |
| `--card-ratio` | `5/7` | · | · | · | `5/7` | · | same |
| `--check-size` | · | · | · | · | `20px` | · | new. New in r4. |
| `--control-height` | · | · | · | · | `40px` | · | new. New in r4. |
| `--control-height-compact` | · | · | · | · | `32px` | · | new. New in r4. |
| `--control-height-lg` | · | · | · | · | `44px` | · | new. New in r4. |
| `--display-case` | `none` | · | `uppercase` | `none` | `none` | · | same. Moss & Iron's uppercase override is gone; Cinzel makes its own capitals. |
| `--display-tracking` | `-.035em` | · | `.01em` | `-.035em` | `.04em` | · | changed. .04em: roman capitals want air. |
| `--display-weight` | `900` | · | `800` | `900` | `600` | · | changed. 600: Cinzel's weight in the reference. |
| `--field-height` | · | · | · | · | `42px` | · | new. New in r4. |
| `--focus-halo` | `var(--table-ink)` | · | · | · | `var(--table-ink)` | · | same |
| `--focus-offset` | · | · | · | · | `2px` | · | new. New in r4. |
| `--focus-ring` | `color-mix(in srgb,var(--color-aether) 45%,white)` | · | · | · | `color-mix(in srgb,var(--color-aether) 45%,white)` | · | same |
| `--focus-width` | · | · | · | · | `2px` | · | new. New in r4. |
| `--font-body` | `Satoshi,system-ui,sans-serif` | · | · | · | `Lato,system-ui,sans-serif` | · | changed. Lato 400 and 700, from Rob's reference, for everything read. |
| `--font-callout` | · | · | · | · | `'Barlow Condensed',Lato,system-ui,sans-serif` | · | new. New in r4. |
| `--font-display` | `Satoshi,system-ui,sans-serif` | · | `'Barlow Condensed',Satoshi,system-ui,sans-serif` | `Satoshi,system-ui,sans-serif` | `Cinzel,'Trajan Pro',Georgia,serif` | · | changed. Cinzel 600, from Rob's reference: page titles and the deck title (the wordmark keeps its own mark). Moss & Iron's Barlow override is gone. |
| `--font-hero` | `'Young Serif',Georgia,serif` | · | `'Barlow Condensed',Satoshi,system-ui,sans-serif` | `'Young Serif',Georgia,serif` | `var(--font-display)` | · | changed. The display face at hero size (var(--font-display)); Young Serif is retired. |
| `--heading-tracking` | · | · | · | · | `-.005em` | · | new. New in r4. |
| `--heading-weight` | · | · | · | · | `700` | · | new. New in r4. |
| `--hero-case` | `none` | · | `uppercase` | `none` | `none` | · | same |
| `--hero-weight` | `400` | · | `800` | `400` | `600` | · | changed |
| `--hud-scale` | · | · | · | · | `1` | · | new. New in r4. |
| `--label-tracking` | `.08em` | · | · | · | `.12em` | · | changed |
| `--leading-body` | `1.5` | · | · | · | `1.5` | · | same |
| `--leading-reading` | · | · | · | · | `1.6` | · | new. New in r4. |
| `--leading-tight` | `1.05` | · | · | · | `1.05` | · | same |
| `--line-width` | · | · | · | · | `1px` | · | new. New in r4. |
| `--mat-cavern` | `#30363c` | · | · | · | `#30363c` | · | same |
| `--mat-cavern-edge` | `#0f1215` | · | · | · | `#0f1215` | · | same |
| `--mat-felt` | `#2b3a2c` | · | · | · | `#2b3a2c` | · | same |
| `--mat-felt-edge` | `#141812` | · | · | · | `#141812` | · | same |
| `--mat-forge` | `#3b2113` | · | · | · | `#3b2113` | · | same |
| `--mat-forge-edge` | `#120a06` | · | · | · | `#120a06` | · | same |
| `--mat-forge-glow` | `#d9772f` | · | · | · | `#d9772f` | · | same |
| `--mat-ink` | `#f3efe6` | · | · | · | `#f3efe6` | · | same |
| `--mat-night` | `#1d1b3d` | · | · | · | `#1d1b3d` | · | same |
| `--mat-night-edge` | `#07071a` | · | · | · | `#07071a` | · | same |
| `--mat-scrim` | `rgb(0 0 0 / .8)` | · | · | · | `rgb(0 0 0 / .8)` | · | same |
| `--mat-sea` | `#0f3d48` | · | · | · | `#0f3d48` | · | same |
| `--mat-sea-edge` | `#06161b` | · | · | · | `#06161b` | · | same |
| `--mat-sea-foam` | `#9fd8e0` | · | · | · | `#9fd8e0` | · | same |
| `--motion-ease` | `ease` | · | `ease` | `linear` | `cubic-bezier(.2,.8,.2,1)` | · | changed |
| `--motion-fast` | `250ms` | · | `150ms` | `120ms` | `160ms` | · | changed. One motion for every skin. |
| `--motion-slow` | · | · | · | · | `280ms` | · | new. New in r4. |
| `--on-accent` | `#1a1611` | · | · | · | `#1a1611` | · | same |
| `--poster-ground` | `#100e0c` | · | · | · | `#0c0c10` | · | changed. Warm black to obsidian black, to sit on the new ground. |
| `--poster-ink` | `#f5f0e8` | · | · | · | `#f3f1ee` | · | changed |
| `--radius-card` | `calc(12px * 1.5)` | · | `9px` | `6px` | `12px` | · | changed |
| `--radius-control` | `12px` | · | `6px` | `4px` | `8px` | · | changed. One radius set for every skin; skins no longer override. |
| `--radius-pill` | `999px` | · | · | · | `999px` | · | same |
| `--radius-tile` | `calc(12px * 1.8)` | · | `11px` | `8px` | `16px` | · | changed |
| `--shadow-card` | `0 1px 0 rgba(255,255,255,.04) inset` | · | `inset 0 1px 0 rgba(255,255,255,.05), inset 0 0 0 1px var(--color-line)` | `0 0 0 1px var(--color-line), 0 1px 2px rgba(0,0,0,.6)` | `0 1px 2px rgb(0 0 0 / .10), 0 8px 24px -16px rgb(0 0 0 / .30)` | · | changed. Neutral; skins no longer override. |
| `--shadow-pop` | · | · | · | · | `0 0 0 1px var(--color-line), 0 18px 48px -20px rgb(0 0 0 / .55)` | · | new. New in r4. |
| `--space-1` | `4px` | · | · | · | `4px` | · | same |
| `--space-10` | · | · | · | · | `40px` | · | new. New in r4. |
| `--space-12` | · | · | · | · | `48px` | · | new. New in r4. |
| `--space-2` | `8px` | · | · | · | `8px` | · | same |
| `--space-3` | `12px` | · | · | · | `12px` | · | same |
| `--space-4` | `16px` | · | · | · | `16px` | · | same |
| `--space-5` | `20px` | · | · | · | `20px` | · | same |
| `--space-6` | `24px` | · | · | · | `24px` | · | same |
| `--space-8` | `32px` | · | · | · | `32px` | · | same |
| `--surface-card` | `var(--color-panel)` | `var(--color-panel)` | · | · | `var(--color-panel)` | `var(--color-panel)` | same |
| `--surface-control` | `var(--color-raised)` | `var(--color-raised)` | · | · | `var(--color-raised)` | `var(--color-raised)` | same |
| `--surface-page` | `var(--color-bg)` | `var(--color-bg)` | · | · | `var(--color-bg)` | `var(--color-bg)` | same |
| `--table-brass` | · | · | · | · | `#b8925a` | · | new. New in r4. |
| `--table-felt` | · | · | · | · | `#292724` | · | new. New in r4. |
| `--table-felt-nap` | · | · | · | · | `url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27240%27 height=%27240%27%3E%3Cfilter id=%27n%27 x=%270%27 y=%270%27 width=%27100%25%27 height=%27100%25%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.85%27 numOctaves=%272%27 seed=%273%27 stitchTiles=%27stitch%27/%3E%3CfeColorMatrix values=%270 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .08 0%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")` | · | new. New in r4. |
| `--table-grain` | · | · | · | · | `url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%271600%27 height=%271000%27%3E%3Cfilter id=%27g%27 x=%270%27 y=%270%27 width=%27100%25%27 height=%27100%25%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.0016 .026%27 numOctaves=%274%27 seed=%2711%27 stitchTiles=%27stitch%27/%3E%3CfeColorMatrix values=%270 0 0 0 .06  0 0 0 0 .03  0 0 0 0 .012  1.5 0 0 0 -.5%27/%3E%3C/filter%3E%3Cfilter id=%27h%27 x=%270%27 y=%270%27 width=%27100%25%27 height=%27100%25%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.003 .09%27 numOctaves=%273%27 seed=%274%27 stitchTiles=%27stitch%27/%3E%3CfeColorMatrix values=%270 0 0 0 .55  0 0 0 0 .36  0 0 0 0 .21  0 .9 0 0 -.45%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 fill=%27%234a2d19%27/%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23g)%27/%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23h)%27/%3E%3C/svg%3E")` | · | new. New in r4. |
| `--table-ink` | `#1f1c18` | · | · | · | `#1f1c18` | · | same |
| `--table-light` | · | · | · | · | `rgb(255 184 108 / .20)` | · | new. New in r4. |
| `--table-panel` | `#fbfaf7` | · | · | · | `#fbfaf7` | · | same |
| `--table-shade` | · | · | · | · | `rgb(12 6 2 / .88)` | · | new. New in r4. |
| `--table-wood` | · | · | · | · | `#3a2414` | · | new. New in r4. |
| `--text-body` | `var(--color-ink)` | `var(--color-ink)` | · | · | `var(--color-ink)` | `var(--color-ink)` | same |
| `--text-body-size` | `14px` | · | · | · | `14px` | · | same |
| `--text-figure` | · | · | · | · | `32px` | · | new. New in r4. |
| `--text-h1` | `56px` | · | · | · | `clamp(30px, 22px + 1.25vw, 40px)` | · | changed. One token holds the clamp; every screen h1 reads it (apply-r4.mjs edits the five rules). |
| `--text-h2` | `22px` | · | · | · | `24px` | · | changed |
| `--text-h3` | `16px` | · | · | · | `18px` | · | changed |
| `--text-hero` | · | · | · | · | `clamp(36px, 24px + 3vw, 56px)` | · | new. New in r4. |
| `--text-hud` | · | · | · | · | `18px` | · | new. New in r4. |
| `--text-hud-caption` | · | · | · | · | `15px` | · | new. New in r4. |
| `--text-hud-vital` | · | · | · | · | `28px` | · | new. New in r4. |
| `--text-label` | `11px` | · | · | · | `12px` | · | changed. 11 to 12. |
| `--text-muted` | `var(--color-muted)` | `var(--color-muted)` | · | · | `var(--color-muted)` | `var(--color-muted)` | same |
| `--text-reading` | · | · | · | · | `16px` | · | new. New in r4. |
| `--text-small` | `12px` | · | · | · | `13px` | · | changed. 12 to 13: nothing under 12 in the scale. |
| `--tray` | `color-mix(in srgb,var(--table-ink) 84%,transparent)` | · | · | · | `color-mix(in srgb,var(--table-ink) 84%,transparent)` | · | same |
| `--vital-danger` | `#b3261e` | · | · | · | `#b3261e` | · | same |
| `--v-accent` | `var(--color-accent)` | · | · | · | `var(--color-accent)` | · | same |
| `--v-aether` | `var(--color-aether)` | · | · | · | `var(--color-aether)` | · | same |
| `--v-aether-core` | `color-mix(in oklab,var(--v-aether) 55%,white)` | · | · | · | `color-mix(in oklab,var(--v-aether) 55%,white)` | · | same |
| `--v-aether-thread` | `var(--v-aether)` | · | · | · | `var(--v-aether)` | · | same |
| `--v-bg` | `var(--color-bg)` | · | · | · | `var(--color-bg)` | · | same |
| `--v-body` | `var(--font-body)` | · | · | · | `var(--font-body)` | · | same |
| `--v-brand-blue` | `light-dark(color-mix(in oklab,var(--v-aether) 70%,var(--v-ink)),var(--v-aether))` | · | · | · | `light-dark(color-mix(in oklab,var(--v-aether) 70%,var(--v-ink)),var(--v-aether))` | · | same |
| `--v-brand-shine` | `light-dark(var(--v-aether),color-mix(in oklab,var(--v-aether) 55%,white))` | · | · | · | `light-dark(var(--v-aether),color-mix(in oklab,var(--v-aether) 55%,white))` | · | same |
| `--v-brass` | `var(--color-accent)` | · | · | · | `var(--color-accent)` | · | same |
| `--v-decision` | `var(--color-money)` | · | · | · | `var(--color-money)` | · | same |
| `--v-decision-bg` | `light-dark(#fdf4e4,#2a2519)` | · | · | · | `var(--color-decision-bg)` | · | changed. Literal to --color-decision-bg |
| `--v-decision-field` | `light-dark(#fbeeda,#332c1d)` | · | · | · | `var(--color-decision-field)` | · | changed. Literal to --color-decision-field |
| `--v-decision-ink` | `light-dark(#4a3208,#f6e3c6)` | · | · | · | `var(--color-decision-ink)` | · | changed. Literal to --color-decision-ink |
| `--v-decision-line` | `light-dark(#d8b57e,#6d5c3d)` | · | · | · | `var(--color-decision-line)` | · | changed. Literal to --color-decision-line |
| `--v-display` | `var(--font-display)` | · | · | · | `var(--font-display)` | · | same |
| `--v-field` | `var(--color-raised)` | · | · | · | `var(--color-raised)` | · | same |
| `--v-field-line` | `light-dark(#c9c0b0,#4a433a)` | · | · | · | `var(--color-field-line)` | · | changed. Was a light-dark() literal shared by every theme; now each skin's own --color-field-line (4.49:1 dark, 3.77:1 light on panel). |
| `--v-ink` | `var(--color-ink)` | · | · | · | `var(--color-ink)` | · | same |
| `--v-line` | `var(--color-line)` | · | · | · | `var(--color-line)` | · | same |
| `--v-line-strong` | `light-dark(#bfb4a0,#514a40)` | · | · | · | `var(--color-line-strong)` | · | changed. Was a light-dark() literal; now --color-line-strong. |
| `--v-money` | `var(--color-money)` | · | · | · | `var(--color-money)` | · | same |
| `--v-muted` | `var(--color-muted)` | · | · | · | `var(--color-muted)` | · | same |
| `--v-on` | `var(--color-on-accent)` | · | · | · | `var(--color-on-accent)` | · | same |
| `--v-panel` | `var(--color-panel)` | · | · | · | `var(--color-panel)` | · | same |
| `--v-radius` | `var(--radius-control)` | · | · | · | `var(--radius-control)` | · | same |
| `--v-radius-card` | `var(--radius-card)` | · | · | · | `var(--radius-card)` | · | same |
| `--v-radius-tile` | `var(--radius-tile)` | · | · | · | `var(--radius-tile)` | · | same |
| `--v-raised` | `var(--color-raised)` | · | · | · | `var(--color-raised)` | · | same |
| `--v-required` | `var(--st-remove)` | · | · | · | `var(--color-required)` | · | changed. Now --color-required (was --st-remove). |
| `--v-soft` | `color-mix(in oklab,var(--color-accent) 18%,var(--color-panel))` | · | · | · | `var(--color-accent-soft)` | · | changed. color-mix() to the precomputed --color-accent-soft. |
| `--v-warm` | `var(--color-money)` | · | · | · | `var(--color-money)` | · | same |


## The skins' values

Each skin sets these and only these.

| Token | Bronze & Basalt dark | light | Chalk & Coal dark | light |
|---|---|---|---|---|
| `--color-bg` | `#100b08` | `#f3e8d8` | `#050608` | `#eff0f3` |
| `--color-panel` | `#1c1714` | `#fff6eb` | `#151619` | `#ffffff` |
| `--color-raised` | `#332e2a` | `#ffffff` | `#2c2e31` | `#ffffff` |
| `--color-line` | `#4e3c28` | `#dbc3a8` | `#4b4d50` | `#858689` |
| `--color-line-strong` | `#675440` | `#baa38a` | `#707275` | `#545557` |
| `--color-field-line` | `#96826c` | `#8c765d` | `#9c9ea2` | `#46484a` |
| `--color-ink` | `#f4f0e6` | `#1d140d` | `#ffffff` | `#050606` |
| `--color-muted` | `#bdb6b1` | `#62584b` | `#d2d4d8` | `#323335` |
| `--color-faint` | `#8b8581` | `#897e71` | `#afb1b5` | `#545557` |
| `--color-hover` | `#2a2522` | `#f1e8dd` | `#242528` | `#efefef` |
| `--color-accent` | `#3066d1` | `#1043a8` | `#5a9cfe` | `#093da1` |
| `--color-accent-hover` | `#2157c0` | `#013397` | `#76aeff` | `#002f8d` |
| `--color-accent-soft` | `#222736` | `#e6e4e6` | `#232e40` | `#e5ebf7` |
| `--color-on-accent` | `#ffffff` | `#ffffff` | `#050608` | `#ffffff` |
| `--color-aether` | `#69d6ef` | `#006c97` | `#8de8f8` | `#005476` |
| `--color-money` | `#f2bb3b` | `#905c00` | `#ffe1a5` | `#6e4600` |
| `--color-required` | `#ed4546` | `#8b000b` | `#ff7b74` | `#5d0004` |
| `--color-on-required` | `#090b0f` | `#ffffff` | `#090b0f` | `#ffffff` |
| `--color-decision-bg` | `#2a200d` | `#fff3dd` | `#221908` | `#fff6e4` |
| `--color-decision-line` | `#806429` | `#c19f66` | `#b39454` | `#735017` |
| `--color-decision-ink` | `#f8e6c3` | `#4c2e00` | `#fff4df` | `#2f1a00` |
| `--color-decision-field` | `#372c15` | `#fceed1` | `#2f2511` | `#fcf1da` |
| `--mana-W` | `#e9d79a` | `#c9a52e` | `#e9d79a` | `#c9a52e` |
| `--mana-U` | `#74b5f7` | `#2b7fd8` | `#74b5f7` | `#2b7fd8` |
| `--mana-B` | `#a897bf` | `#6f5c8e` | `#a897bf` | `#6f5c8e` |
| `--mana-R` | `#f0805f` | `#d0603c` | `#f0805f` | `#d0603c` |
| `--mana-G` | `#77c58f` | `#2f8f5b` | `#77c58f` | `#2f8f5b` |
| `--st-inbox` | `#4ed275` | `#007f38` | `#72f495` | `#006129` |
| `--st-physical` | `#4ed275` | `#007f38` | `#72f495` | `#006129` |
| `--st-pull` | `#a8eeba` | `#409f61` | `#b5fcc7` | `#1e8347` |
| `--st-reserved` | `#a8eeba` | `#409f61` | `#b5fcc7` | `#1e8347` |
| `--st-ordered` | `#00a4b1` | `#0698a4` | `#54d8e6` | `#007a85` |
| `--st-buy` | `#f2bb3b` | `#905c00` | `#ffe1a5` | `#6e4600` |
| `--st-standin` | `#f7e0a0` | `#b5820c` | `#fee6a6` | `#946900` |
| `--st-remove` | `#ed4546` | `#8b000b` | `#ff7b74` | `#5d0004` |
| `--st-watch` | `#bdb6b1` | `#62584b` | `#d2d4d8` | `#323335` |
| `--st-draft` | `#8b8581` | `#897e71` | `#afb1b5` | `#545557` |


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
- tests/design-tokens.mjs passes (196 checks on the 2026-10-25 tree)
- tests/a11y-app.mjs passes in all six skin and register pairs
- tests/type-final.mjs passes at 1400, 1136 and 390
- Load Live at 1440 and 390: Decks, a deck page, Play lobby and the 3D board match renders/sapphire-obsidian-dark
Test: design-tokens.mjs; break one skin value first, watch it go red, restore.
Metric: F4 (contrast) count on the next walkthrough capture goes to zero for opaque pairs; kill criterion: any
primary button under 4.5:1 in any skin means the palette, not the page, is wrong.
```
