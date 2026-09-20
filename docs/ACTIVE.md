# Who holds the work

| | |
| --- | --- |
| **Holder** | Claude Code (Opus 5), local session on Personal-HP |
| **Branch** | `claude/v4d-explore` — PR #295, stacked on `main` at `5cbf58b` |
| **Since** | 2026-09-20 |
| **Doing** | **Track V, the Gallery redesign, working the revision 2 guide in order.** Merged: **V.1c** (#289 — the five reconciliations, Young Serif self-hosted under OFL, the literal-to-token sweep 730 → 137 raw hex), **V.3** (#291 — the header bar removed, a 216 px rail with the wordmark and Menu at its foot, `tests/uat/geometry.mjs` rewritten for the rail, 115 → 139 checks), **V.4a** (#292 — deck tiles as 3:4 posters tinted by the commander), **V.4b** (#293 — the deck page: hero with the tilted commander card, segmented tabs, the nine-card bento), **V.4c** (#294 — the Library: counts as tiles, a summary sentence, rows one line tall). Open: **V.4d** (#295 — the Explore entry: three door cards, the first listing the decks it would open on). |
| **Next for whoever picks this up** | Merge #295 once its CI is green, reading the result before merging. Then, in order: **the second Explore PR** (the commander fan and mini graph in doors two and three, the graph size in the sub-line, the "Or read by role" pills from `crankmagic-lens.js`, and then the graph page itself against `screens/Gallery Explore.dc.html`); **the second Library PR** (mana pips on every row, the Primary Purpose chip under each card name, the land mark, the colorless `{C}`, tinted group bands); then **Play (V.5) last**, per `DELTA-play-and-implementation.md`. Render every visible change at 1280 beside the matching `screens/*.dc.html` and show Rob in chat. American English only; the ratchet fails a commit that adds a UK spelling — it caught two this session. |

## Open, for the designer's gap list

- No **light** value is given for `--st-watch`, `--st-draft` or `--st-physical`; this repository chose them in the Felt and Cream register and marks them as ours in `tests/design-tokens.mjs`.
- **No `--mana-C`** for colorless, so `.cm-color.C` keeps a literal and the Library's `{C}` symbol cannot be drawn from a token. Four other self-contained systems the sweep left alone: the flame icon's gradient, the five-step rarity scale, the tabletop felt and shelf.
- The Gallery Deck Page screen puts a brass **"Open the buy list →"** in the Next card while the hero already carries a brass primary — **two accent-filled buttons**, against the guide's own "exactly one". The hero keeps the one primary; the designer should say which they meant.
- "The action row follows the tab" (README, Interactions) is not done: the deck page's row wraps to three lines because the app has two buttons the screen does not (Trace, Make the change).

## Found in the repository, for whoever is next

- The `v-` study layer in `crankmagic-design.css` (`.v-cover`, `.v-showcase`, `.v-gnode`, `.v-cardfan` and their kin) appears only under `design/` and **is never rendered by the app**. Delete it rather than restyle it.
- `crankmagic.css` still references **`--v-text` twice — a token that does not exist** (the name is `--v-ink`). An undefined custom property makes the declaration invalid at computed-value time, so those two colors silently inherit.
- `index.html` shipped a literal `?` (U+003F) where `crankmagic.html` had `⚑ ✉ ☰` and `Ⅱ`; fixed in V.3, and both shells are written from one string now so they cannot drift again.
- The `?` help button is inside **More ▾** on the deck page, which has one. Pages without a More menu keep the 34 px outlined circle until their step-4 pass.

## Two habits this session earned the hard way

- **Render every visible change.** The deck page threw `Cannot access 'heroTint' before initialization` and the Explore entry rendered the word `NaN`; 97 suites were green through the first and `node --check` passed the second. Only the picture showed them.
- **Remove a superseded CSS rule, do not out-weigh it.** The old Explore entry's rules sat later in the sheet and won on order. A grep for `.selector{` returns only its first match — count them before believing they are gone.

Update this file as your last act. Rules: `AGENTS.md`.
