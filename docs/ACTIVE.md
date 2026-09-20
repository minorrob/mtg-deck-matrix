# Who holds the work

| | |
| --- | --- |
| **Holder** | Claude Code (Opus 5), local session on Personal-HP |
| **Branch** | `claude/v3-shell-rail`, off `main` at `b56f65c` — PR #291 |
| **Since** | 2026-09-20 |
| **Doing** | **Track V, the Gallery redesign, working the revision 2 guide in order.** V.1c is merged (#289): the five `INTAKE.md` reconciliations, Young Serif self-hosted under OFL, the literal-to-token sweep (crankmagic.css 730 → 137 raw hex, ceiling lowered with it), the pip map read from `--mana-*`. V.3 is open (#291): the header bar removed, a 216 px rail carrying the wordmark and its mist, Menu at the rail foot, `tests/uat/geometry.mjs` rewritten for the rail rather than deleted (115 → 139 checks). |
| **Next for whoever picks this up** | Merge #291 once its CI is green and read the result before merging. Then the guide's **step 3, the deck tiles** (V.4a): tile CSS replaced wholesale per `screens/Gallery Decks.dc.html`, `--tint` per tile from the commander's first color, stage-colored borders dropped (the stage is the pill), the summary line replacing the toolbar. Then step 4 — deck page, Library, Explore, one PR each — and Play (V.5) last. Render every visible change at 1280 beside the matching `screens/*.dc.html` and show Rob in chat. American English only; the ratchet fails a commit that adds a UK spelling. |

## Open, for the designer's gap list

- The guide gives no **light** value for `--st-watch`, `--st-draft` or `--st-physical`; this repository chose them in the Felt and Cream register and they are marked as ours in `tests/design-tokens.mjs`.
- Four self-contained systems the sweep deliberately left alone: the flame icon's three gradient stops, the five-step rarity scale, the tabletop felt and shelf, and the colorless mana disc — **the token set has no `--mana-C`**, which the designer should supply.
- The `v-` study layer in `crankmagic-design.css` (`.v-cover`, `.v-showcase`, `.v-gnode`, `.v-cardfan` and their kin) appears only under `design/` and **is never rendered by the app**. V.2 should delete it rather than restyle it.
- The `?` help button has not moved under a per-page **More ▾** yet; it does so with each page in step 4.

Update this file as your last act. Rules: `AGENTS.md`.
