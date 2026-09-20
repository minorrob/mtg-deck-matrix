# Who holds the work

| | |
| --- | --- |
| **Holder** | Claude Code (Opus 5), local session on Personal-HP |
| **Branch** | `main` at `aed19a4` — nothing open |
| **Since** | 2026-09-20 |
| **Doing** | **Track V, the Gallery redesign.** Everything through the guide's step 4 for Decks, the deck page, the Library and the Explore *entry* is merged: **V.1c** #289 (the five reconciliations, Young Serif self-hosted under OFL, the literal-to-token sweep 730 → 137 raw hex), **V.3** #291 (the header bar removed, a 216 px rail, `tests/uat/geometry.mjs` rewritten for the rail, 115 → 139 checks), **V.4a** #292 (deck tiles as 3:4 posters tinted by the commander), **V.4b** #293 (the deck page: hero, segmented tabs, the nine-card bento), **V.4c** #294 and **V.4f** #297 (the Library: counts as tiles, a summary sentence, rows one line tall, mana on every row, the Primary Purpose as a chip, tinted group bands), **V.4d** #295 and **V.4e** #296 (the Explore entry: three door cards, the commander fan, the mini graph, the graph size, the seven role lenses with counts). |
| **Next for whoever picks this up** | **The Explore graph page** (`screens/Gallery Explore.dc.html`) — the segmented connections control, the canvas overlays (tap-mode segment, the three icon buttons, the Depth/Breadth sliders, the legend), the node and edge treatment, and the right pane's Card · List · Trace. Then **the Library's filter row** (the five dropdown buttons the screen draws in place of Filters and Columns) and the colorless `{C}`, which needs `--mana-C`. Then **the wireframed pages** (`wireframes/Wireframes.dc.html`) and the dialogs. Then **Play (V.5) last**, per `DELTA-play-and-implementation.md`. Render every visible change at 1280 beside the matching `screens/*.dc.html` and show Rob in chat. American English only; the ratchet fails a commit that adds a UK spelling — it caught two this session. |

## Open, for the designer's gap list

- No **light** value is given for `--st-watch`, `--st-draft` or `--st-physical`; this repository chose them in the Felt and Cream register and marks them as ours in `tests/design-tokens.mjs`.
- **No `--mana-C`** for colorless, so `.cm-color.C` keeps a literal and the Library's `{C}` cannot be drawn from a token.
- The Gallery Deck Page screen puts a brass **"Open the buy list →"** in the Next card while the hero already carries a brass primary — **two accent-filled buttons**, against the guide's own "exactly one". The hero keeps the one primary; the designer should say which they meant.
- The Explore Entry screen states a **join total** ("41,000 joins"); the graph payload carries no join count, so the sub-line states the card count only rather than inventing one.
- A **land icon** is still missing; rows use the placeholder "L" disc the screen itself uses.
- "The action row follows the tab" (README, Interactions) is not done: the deck page's row wraps to three lines because the app has two buttons the screen does not (Trace, Make the change).

## Found in the repository, for whoever is next

- The `v-` study layer in `crankmagic-design.css` (`.v-cover`, `.v-showcase`, `.v-gnode`, `.v-cardfan` and their kin) appears only under `design/` and **is never rendered by the app**. Delete it rather than restyle it.
- `crankmagic.css` still references **`--v-text` twice — a token that does not exist** (the name is `--v-ink`), so those two colors silently inherit.
- The `?` help button is inside **More ▾** on the deck page, which has one. Pages without a More menu keep the 34 px outlined circle until their pass.

## Four things this session learned the hard way

- **Render every visible change.** The deck page threw `Cannot access 'heroTint' before initialization`; the Explore entry rendered the word `NaN`; the role-lens row silently hid itself because `CrankFacets.values()` returns an array of `{value, count}` and was read as a map. The suites were green through the first, `node --check` passed the second, and nothing threw on the third.
- **Remove a superseded CSS rule, do not out-weigh it.** The old Explore entry's rules sat later in the sheet and won on order. `grep '.selector{'` returns only its first match — count them before believing they are gone.
- **Two things wearing the same word.** `crankmagic-collection.js` has a `purpose` column that is the *slot's* purpose (main/bracket/upgrade) and a card's *Primary Purpose* from the classifier. Chipping the first put "Main deck" under three rows in five.
- **A picture of a loading screen is not a render.** `tools/render-routes.mjs` waited on `#cm-main` for Explore, which resolves before ~20 MB of co-play links arrive; it waits for the entry or the canvas now.

Update this file as your last act. Rules: `AGENTS.md`.
