# Who holds the work

| | |
| --- | --- |
| **Holder** | Free — everything of the 2026-09-21 session is merged |
| **Branch** | `main`; nothing open |
| **Since** | 2026-09-21 |
| **Doing** | **Track V is merged through the Play lobby, and the live-game gate is cleared.** #306 took the lobby to wireframe 2b and measured the Explore graph for the first time. The color-identity fan now draws — it never had, because every quadrant's wedge swept 90° outside its own quadrant and was clipped away. `tests/wireframe-conformance.mjs` is new: the handoff README grades `screens/*.dc.html` as hi-fi ("Recreate pixel-close") and the wireframes as lo-fi ("follow their structure and content order"), so screens are measured in pixels by `tools/compare-to-screen.mjs` and wireframes are held to structure and content there. |
| **Next for whoever picks this up** | **Read `docs/live-game-readiness-2026-09-21.md`.** Rob is running run-book steps 5–9 himself. The work after that, in order: the mat surface (`game/ui/review.mjs`, `game/ui/mats.css`) against wireframes 2e and 2f — also the last raw-hex blind spot, ceiling 475 and nothing watching it; then the nine wireframe pages and four dialog groups, extending `tests/wireframe-conformance.mjs`; then Gallery Explore's two recorded pixel differences. |

## The live-game gate is cleared

This file used to name #259, #260, #262 and #263 as PRs that had to be triaged before any
live-game test. **All four were already merged** — every commit of that chain is an ancestor of
`main` — and all four are now closed with their evidence. #263's one remaining commit would have
*regressed* things: it deletes `C.views.game` from `crankmagic-online.js`, which `main` already
fixed better by wrapping that view rather than overwriting it. **Nothing blocks the test.**

## The architecture fact that reorders the remaining work

**A live game is played in Forge, not in the browser.** `crankmagic-game.js` draws the lobby and
never drew a board. The browser's mat surface is `game/ui/review.mjs` with `game/ui/mats.css`,
reached at `/play` and routed by `game/ui/play-entry.mjs` — `guest-live.mjs` for a remote guest,
`review.mjs` for the host or a recorded match. So the DELTA's table view and focus view are a
redesign of **that** surface, and "get a live game up and running" is the run-book, not board work.

## Proven on this machine today, 2026-09-21

Run-book steps **1, 2, 3 and 4** all pass here — see
`docs/live-game-readiness-2026-09-21.md` for each command and its output. The suite is 98
green with browser suites driving Chrome; the doctor says *Ready to host a game*; every card
in all 7 decks resolves to a Forge card script; and the import gate refuses an invented card
by name before preparation. **Steps 5 to 9 need a game and are Rob's.**
## Open, for the designer's gap list

- No **light** value for `--st-watch`, `--st-draft` or `--st-physical`; ours are in the Felt and Cream register and marked as ours in `tests/design-tokens.mjs`.
- **No `--mana-C`** for colorless, so `.cm-color.C` keeps a literal and the Library's `{C}` cannot come from a token. A **land icon** is still missing; rows use the screen's own placeholder "L" disc.
- The Gallery Deck Page screen puts a brass "Open the buy list →" in the Next card while the hero already carries a brass primary — **two accent-filled buttons**, against the guide's own "exactly one".
- The Explore Entry screen states a **join total**; the graph payload carries none, so the sub-line states the card count only rather than inventing one.
- The graph's legend sits **top right**, not bottom right: with the 340px card pane beside it the stage is ~630px and the reach sliders already fill the bottom edge.

## Not done, by surface

- **Explore graph**: the head is still the old toolbar rather than h1 36px + 44px search + segmented connections + Filters with a count badge; node radii and the pane's layout untouched.
- **Library**: the five-dropdown filter row the screen draws in place of Filters and Columns.
- **Deck page**: "the action row follows the tab" — the row wraps to three lines because the app has two buttons the screen does not.
- **Lobby**: the commander card in the outer bottom corner and its detail column, Choose mat, Host tools as a menu, and the 10-second auto-launch countdown (the poll is wired; the countdown is not drawn).
- **Playmat**: the DELTA omits the printed turn-steps list and life box "because the app shows both" — the app does not yet, so the guide stays until the turn-step ribbon exists.
- **Wireframed pages and dialogs**, and the Game Host announcer voice (V.5b backlog).

## Found in the repository

- The `v-` study layer in `crankmagic-design.css` (`.v-cover`, `.v-showcase`, `.v-gnode`, `.v-cardfan`) appears only under `design/` and **is never rendered**. Delete it rather than restyle it.
- `crankmagic.css` references **`--v-text` twice — a token that does not exist** (it is `--v-ink`), so those two colors silently inherit.
- **"Seat it" with no deck chosen does nothing and says nothing.** The dialog refuses silently. Predates the redesign.

## Five things this session learned the hard way

- **Render every visible change, and drive it.** The deck page threw `Cannot access 'heroTint' before initialization`; the Explore entry rendered the word `NaN`; the role-lens row hid itself because `CrankFacets.values()` returns an array of `{value,count}` read as a map; the lobby's color fan drew nothing because a seat's identity is on `seat.commanders[0]`. Suites were green through the first, `node --check` passed the second, nothing threw on the third, and the fourth made an empty table and a seated one identical.
- **Remove a superseded CSS rule, do not out-weigh it.** `grep '.selector{'` returns only its first match — count them.
- **Two things wearing the same word.** `crankmagic-collection.js` has a `purpose` column that is the *slot's* purpose and a card's *Primary Purpose* from the classifier.
- **A ceiling that reads only `.css` cannot see a canvas.** `crankmagic-graph.js` held 38 navy literals through a sweep that took the stylesheet 730 → 137. Its ceiling is zero now.
- **Check the branch before committing.** The lobby went to `main` by mistake; nothing reached `origin/main`, but `git branch --show-current` costs nothing.

Update this file as your last act. Rules: `AGENTS.md`.
