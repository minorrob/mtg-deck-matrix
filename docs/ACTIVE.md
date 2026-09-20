# Who holds the work

| | |
| --- | --- |
| **Holder** | Claude Code (Opus 5), local session on Personal-HP |
| **Branch** | `claude/v4b-deck-page` — PR #293, stacked on `main` at `de99b4a` |
| **Since** | 2026-09-20 |
| **Doing** | **Track V, the Gallery redesign, working the revision 2 guide in order.** Merged: **V.1c** (#289, the five reconciliations, Young Serif self-hosted under OFL, the literal-to-token sweep 730 → 137 raw hex), **V.3** (#291, the header bar removed and a 216 px rail with the wordmark and Menu at its foot, `tests/uat/geometry.mjs` rewritten for the rail, 115 → 139 checks), **V.4a** (#292, the deck tiles as 3:4 posters tinted by the commander). Open: **V.4b** (#293, the deck page — hero with the tilted commander card, segmented tabs, the nine-card six-column bento). |
| **Next for whoever picks this up** | Merge #293 once its CI is green, reading the result before merging. Then the guide's step 4 continues: **Library** (`screens/Gallery Library.dc.html` — counts as tiles, segmented tabs, the filter row, the 56 px table rows that never wrap, sortable headers everywhere) and then **Explore** (`Gallery Explore Entry.dc.html` and `Gallery Explore.dc.html`), one PR each. **Play (V.5) last**, per `DELTA-play-and-implementation.md`. Render every visible change at 1280 beside the matching `screens/*.dc.html` and show Rob in chat. American English only; the ratchet fails a commit that adds a UK spelling — it has caught two this session. |

## Open, for the designer's gap list

- The guide gives no **light** value for `--st-watch`, `--st-draft` or `--st-physical`; this repository chose them in the Felt and Cream register and they are marked as ours in `tests/design-tokens.mjs`.
- **No `--mana-C`** exists for colorless, so `.cm-color.C` keeps a literal. Four other self-contained systems the sweep left alone: the flame icon's gradient, the five-step rarity scale, the tabletop felt and shelf.
- The Gallery Deck Page screen puts a brass **"Open the buy list →"** in the Next card while the hero already carries a brass primary — **two accent-filled buttons**, against the guide's own "exactly one". The hero keeps the one primary; the designer should say which they meant.
- The `v-` study layer in `crankmagic-design.css` (`.v-cover`, `.v-showcase`, `.v-gnode`, `.v-cardfan` and their kin) appears only under `design/` and **is never rendered by the app**. V.2 should delete it rather than restyle it.
- The `?` help button is inside **More ▾** on the deck page, which has one. Pages without a More menu keep the 34 px outlined circle until step 4 reaches them.
- "The action row follows the tab" (README, Interactions) is not done: the deck page's row wraps to three lines because the app has two buttons the screen does not.

## Found on `main`, fixed in V.3

`index.html` shipped a literal `?` (U+003F) where `crankmagic.html` had `⚑ ✉ ☰` and `Ⅱ`. The Share arrow survived only because it is an HTML entity. Both shells are written from one string now so they cannot drift again.

Update this file as your last act. Rules: `AGENTS.md`.
