# Who holds the work

| | |
| --- | --- |
| **Holder** | Claude Code (Opus 5), local session on Personal-HP |
| **Branch** | `claude/v5b-game-board` — open, with PR #300 (`claude/v5a-lobby-table`) also open |
| **Since** | 2026-09-20 |
| **Doing** | **Track V, the Gallery redesign, and the start of Play.** Merged: V.1c #289, V.3 #291, V.4a #292, V.4b #293, V.4c #294, V.4d #295, V.4e #296, V.4f #297, V.4g #299 — the tokens, the rail, the deck tiles, the deck page bento, the Library, the Explore entry and the Explore graph. Open: **#300** the Play lobby as a table (four quadrants, the rules at its center, the launch line replacing the Launch button), and **`claude/v5b-game-board`** the playmat's zone frames plus the architecture finding below. |
| **Next for whoever picks this up** | **Read `docs/handoff-live-game-test-2026-09-20.md` first.** Merge #300 and the board branch once their CI is green, reading the result on the head you are merging. Then the live-game run-book, `game/docs/readiness-plan-2026-09-18.md` §12, from step 4 — `node game/tools/preflight.mjs` passes steps 1 to 3 on this machine today. Rob's boundary for the previous session was: pause before playing a game through, and hand that test off. That is what this is. |

## The architecture fact that reorders the remaining work

**A live game is played in Forge, not in the browser.** `crankmagic-game.js` draws the lobby and
never drew a board. The browser's mat surface is `game/ui/review.mjs` with `game/ui/mats.css`,
reached at `/play` and routed by `game/ui/play-entry.mjs` — `guest-live.mjs` for a remote guest,
`review.mjs` for the host or a recorded match. So the DELTA's table view and focus view are a
redesign of **that** surface, and "get a live game up and running" is the run-book, not board work.

## Proven on this machine today

`node game/tools/preflight.mjs` — Forge card database 33,819 card scripts / 35,649 names; Node,
Java, the OpenAI credential and cloudflared all ok; **every card in all 7 decks resolves**,
including the seven awkward names. *Steps 1 to 3 all pass. This computer is ready to host.*
Steps 4 to 9 need a running game and a browser.

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
