# Where things live — the index to check before building

**Why this exists.** Rob asked for a "Choose mat" picker. I assumed the six animated sea elements
were the mats and built a picker from them. They are not: they are the animated fills behind the
lobby seats. The real mats are nine playmats Rob uploaded, already in the repo with images, a
catalog and a persistence layer. One grep would have found them; instead he caught it in UAT, and
the picker he was shown offered a choice that would have changed nothing in game.

His rule, 2026-09-21: **make no assumptions, always scan and check, keep indexes of commonly used
material, and anchor every decision on referenced material.** This is that index.

**How to use it:** before building anything that names a concept the product already has — mats,
statuses, brackets, purposes, elements, facets — find it here, read it, and extend it. Cite the
file and line in the commit so the next reader can check rather than trust.

---

## Catalogs — lists the product already owns

| Concept | Source of truth | Notes |
|---|---|---|
| **Playmats** (9) | `game/ui/playmats.mjs` — `PLAYMATS` | Images in `game/ui/assets/playmats/*.png` plus `game/ui/assets/rob-playmat.png`. Store: `saveMatPreference` / `readMatPreferences`, localStorage `crankmagic-playmats-v1`. `resolvePlaymat` handles `'random'`. **This is what the table draws** — write anywhere else and the choice never reaches the game. |
| **Animated elements** (6) | `crankmagic-sea.js` — `ELEMENTS` | mist · ocean · leaves · fire · wheat · bog. These are the **fills behind lobby seats**, mapped from seat state by `FOR_STATE`. Not mats. |
| **Brackets** (1–5) | `crankmagic-lobby.js` — `BRACKETS`, `capOf` | Only the Game Changer cap varies by bracket in code; the other bracket rules are named for the reader, not enforced. |
| **Card status ladder** | `C.statusLadder` (crankmagic-app.js) | Watched · Ordered · Owned/Bench · Reserved · Physical deck · Substitute. |
| **Primary Purpose** | `MtgCardClassify.purposeOf` (`card-classify.js`) | One label per card. Distinct from a deck slot's `purpose` (main/bracket/upgrade) in `crankmagic-collection.js`. |
| **Graph facets** (23) | `crankmagic-facets.js` — `FACETS` | `CrankFacets.values()` returns **an array of `{value, count}`**, not a map. |
| **Deck cost cap** | `CrankRules.RULES.deckCap` (default 225) | Read in `crankmagic-game.js` as `BUDGET`. |
| **AI models** | `game/tools/windows-credential.mjs` | `gpt-5-mini` / `gpt-5`, asserted by `game/tests/windows-credential.test.mjs`. |

## Design sources, and what each one settles

Anchor: `docs/design/2026-09-20-deck-page-r2/design_handoff_crankmagic_gallery/README.md`.

| Source | Authority | Measured by |
|---|---|---|
| `screens/*.dc.html` (5) | **Pixels.** "High-fidelity. Colors, type, spacing, radii and copy are final. Recreate pixel-close." | `tools/compare-to-screen.mjs`, ±4px at 1280 |
| `wireframes/Wireframes.dc.html` | **Structure and content order only.** "They are low-fidelity." Drawn at ~half scale — a 640×440 card with a 108px rail standing in for 1280 with 216 — so their type is *not* authoritative. | `tests/wireframe-conformance.mjs` |
| README prose §"Play lobby (table-first, wireframe 2b)" | The lobby's behavior rules, including what the host gets on someone else's seat. | `tests/wireframe-conformance.mjs` |
| `DELTA-play-and-implementation.md` | Changes to Play since the first revision. **B.4's "a seat that is not yours shows no controls" means PLAYER controls** — the README keeps the host's. | — |

The five screens: Gallery Decks · Gallery Deck Page · Gallery Library · Gallery Explore Entry ·
Gallery Explore. The wireframe pages: 1a–1i, turn-2 Play (2a–2f), turn-3 mat elements, turn-4
dialogs 4a–4h.

## Routes and what draws them

| Route | Drawn by |
|---|---|
| `#decks`, `#decks?deck=` | `crankmagic-decks.js` |
| `#cards` and its tabs | `crankmagic-collection.js` |
| `#discover` | `crankmagic-discover.js` (entry + graph); canvas in `crankmagic-graph.js` |
| `#game` | `crankmagic-game.js` (the **lobby only**) — wrapped by `crankmagic-online.js`, which adds the host-offline banner and must never overwrite it |
| `/play` on the host | `game/ui/play-entry.mjs` → `guest-live.mjs` (remote guest) or `review.mjs` (host/recorded) |
| `#online` | `crankmagic-online.js` legacy iframe view |

**A live game plays in Forge, not the browser.** The browser's mat surface is
`game/ui/review.mjs` + `game/ui/mats.css`.

## The host's file map

`game/tools/serve-review.mjs` decides what the local host serves. Worth reading before assuming a
module is reachable:

- line 29 — `/playmats.mjs`
- line 35 — `/playmats/<name>.png`
- line 39 — `/connection.mjs`
- line 51 — `/app/<path>` for every git-tracked `*.js|css|html` and `assets/`, `data/` file
- line 54 — the `game/ui/*` modules served at the root

The lobby loads host modules with a dynamic `import("/name.mjs")` inside a try/catch, because on
GitHub Pages they are not there. See `pollLiveReadiness` for the pattern.

## Ratchets — numbers that may only go down

| Guard | File | Ceiling |
|---|---|---|
| raw hex, `crankmagic.css` | `tests/design-tokens.mjs` | 136 |
| raw hex, `crankmagic-graph.js` | " | **0** |
| raw hex, `game/ui` | " | 475 — *nothing reads these files; the graph's 38 literals hid in exactly this shape of gap* |
| raw hex, design sheet | " | 31 |
| UK spellings | `tests/feature-wiring.mjs` | 563 |
| suites named in README | `tests/data-integrity.mjs` | must equal `tests/*.mjs` |

## Traps that have cost time more than once

1. **An id beats any number of classes.** `crankmagic-design.css` carries ~7 rules like
   `#matrix-v2 h1{font-size:36px}`. Gallery rules written as classes lose silently. Carry the id;
   never `!important`.
2. **Remove superseded rules, do not out-weigh them.** A later copy of a selector wins on order.
   `grep '.selector{'` returns only the first match.
3. **Specificity decides per property, not per rule.** A rule that out-specifies another still
   loses on any property it does not declare.
4. **A height cap on a fixed-`aspect-ratio` box caps its width too.**
5. **The pin chain**: change an asset → bump `?v=` in `index.html`, `crankmagic.html` *and* the
   worker shell list in `crankmagic-sw.js`; the worker's own pin then moves in `crankmagic-app.js`,
   and the app's pin moves in all three; then `node tests/asset-versions.mjs --update`.
6. **Canvas palettes cannot use `var()`** — resolve tokens through a hidden probe inside
   `#matrix-v2`, cached against `dataset.theme`.
7. **Classic scripts, no build step.** An ES module port must be wrapped in an IIFE exposing a
   global.
8. **Run the suite on what you push**, and check `git branch --show-current` before committing.

10. **The local game host keeps the code it started with.** `game/tools/serve-review.mjs` imports
    `local-game-launcher.mjs` and the rest of `game/` once, at startup. Static files under `/app/`
    are read per request, so page changes appear on reload — anything the host *imports* does not.
    **Restart it after every merge that touches `game/`** (Rob's rule, 2026-09-21), or a merged fix
    will look like it failed. `/api/table/readiness` returning 409 means no table is open, so a
    restart costs nothing.

11. **`path.resolve()` treats a foreign-platform path as relative.** On Linux,
    `resolve('C:/x/forge', 'leaf')` returns `<cwd>/C:/x/forge/leaf`, not the path you wrote. This
    bit twice in one session: a suite that resolved its own root with a hand-rolled
    `pathname.replace(/^\//, "")` scanned `<repo>/home/runner/...` on CI, and a command-line
    matcher built its needle with `resolve()` and stopped matching. **Use `fileURLToPath` for
    locations, and plain string joins when you are matching text rather than touching the disk.**
    The suites run on Windows here and Ubuntu in CI, so either alone proves nothing.
