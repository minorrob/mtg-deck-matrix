# Session S0 · Land r4: tokens, type, skins

Repo minorrob/mtg-deck-matrix. Branch `claude/r4-s0-tokens` from `main` (f2e00ba4 or later). This is the gate: nothing else in the program starts until this PR is merged to `main` and `integration/r4` exists.

Read first: `00-task-list.md`, `01-unified-change-set.md` §0, `AGENTS.md`, `docs/ACTIVE.md`. The r4 package lives on Rob's PC at `C:\Users\robmi\CrankMagic\repo\docs\design\2026-10-25-redesign-r4\` with `pr/apply-r4.mjs`; it is not on `main` or any remote branch yet. Rob commits it (or attaches it) at the start of this session.

## Scope

CH-01, CH-02, CH-03, CH-04. Files: `crankmagic-design.css`, `assets/crankmagic/` (fonts), `crankmagic-sw.js`, `tests/design-tokens.mjs`, `tests/type-final.mjs`, `pr/apply-r4.mjs`, `docs/design/2026-10-25-redesign-r4/**`, the theme switch in the account menu, `index.html` head (font preloads, notices). Nothing else.

## Change

1. **CH-01 Apply r4.** Commit `docs/design/2026-10-25-redesign-r4/` and run `pr/apply-r4.mjs`. Result in `crankmagic-design.css`: the Sapphire & Obsidian tokens for six themes (`dark`, `light`, `bronze-dark`, `bronze-light`, `chalk-dark`, `chalk-light`) from `project/tokens.json` (78 color tokens incl. `mana-*`, `st-*`, `poster-*`, `mat-*`, `table-*`, `callout-*`; type groups Display/Text/Play HUD; spacing, radius, shadow, size), the aliases for the app's older names (`surface-page`, `surface-card`, `surface-control`, `border-default`, `action-primary`, `action-primary-text`), and the removal of Brass & Slate, Felt & Cream, Moss & Iron and Steel & Cobalt and of every `data-palette` value they used. Satoshi and Young Serif `@font-face` rules go; Cinzel 600, Lato 400/700, Barlow Condensed 800 and the Oxanium wordmark subset are self-hosted under `assets/crankmagic/` with `font-display: swap` and listed in the service worker's precache (`crankmagic-sw.js`, version bump).
2. **CH-02 Theme switch.** The account menu's Skin group lists the three skins with a dot on the chosen one and a Dark / Light / System segmented control (chosen segment inverts to ink); it writes `data-theme` with the six values. A device that stored an old palette name falls back to `dark` silently.
3. **CH-03 Wordmark.** `.cm-wordmark` keeps the Oxanium subset in `color-aether` with its sheen beside the gear logo; no Cinzel on the string "CrankMagic" anywhere (`tests/type-final.mjs` asserts it).
4. **CH-04 Integration branch.** After merge, create `integration/r4` from `main` and push it; add a line to `docs/ACTIVE.md`: "r4 program: builders branch from and PR against `integration/r4`; M merges to main."

Do not: restyle any component (that is the builders' work), touch `crankmagic-board.js`, change copy.

## Acceptance

- `tests/design-tokens.mjs`: 194 checks pass on the merged tree; add checks that no `--palette-*` or Satoshi/Young Serif reference remains and that every text pair in every theme meets 4.5:1 (7:1 in Chalk), edges 3:1, `color-line` ≥1.3:1.
- `tests/type-final.mjs` runs in the repo's browser runner: `h1` and the deck title compute to Cinzel 600; body/h2/h3 to Lato; the wordmark element to the Oxanium family; no element under 12px computed font-size on the Decks hub, a deck page and the board.
- Six themes render the Decks hub, a deck page and the board with no unstyled flash; Load Live at 1440 and 390.
- Lighthouse or the local check: fonts preloaded, no layout shift from font swap above the fold.

Test: extend `tests/design-tokens.mjs`, run `tests/type-final.mjs`, `tools/local-ci.sh`, one green Actions run. Merge this PR to `main` (the one exception to the "do not merge" rule), then create `integration/r4`. Report the merge commit and the branch name.
