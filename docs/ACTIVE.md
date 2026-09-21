# Who holds the work

| | |
| --- | --- |
| **Holder** | Free — the 2026-09-20 session closed with everything merged |
| **Branch** | `main` at `f4c8401`; nothing of that session is open |
| **Since** | 2026-09-21 |
| **Doing** | **Track V is merged through the Explore graph, and Play has begun.** #289 the tokens and the sweep · #291 the 216 px rail · #292 the deck tiles · #293 the deck page bento · #294 and #297 the Library · #295 and #296 the Explore entry · #299 the Explore graph canvas reading tokens · #300 the Play lobby as a table · #301 the playmat frames and the live-game handoff · #302 the screen-comparison pairs · #303 the standards audit. |
| **Next for whoever picks this up** | **Read `docs/handoff-live-game-test-2026-09-20.md`, then `docs/audit-standards-2026-09-20.md`.** The audit ends with five things in order. **Before any live-game test, triage the four open PRs below** — they are fixes to the exact path that test walks. |

## Four open PRs that predate that session and bear on the live game

| PR | Opened | What |
|---|---|---|
| #259 | 2026-09-17 | mulligan hang: seat-scope decisions, green ack, diagnostics |
| #260 | 2026-09-18 | P0 live hang: double mulligan, untap freeze, View hand / Auto-pass / End game / AI stall |
| #262 | 2026-09-17 | host root redirects to live Game setup (the recorded-game freeze) |
| #263 | 2026-09-17 | guest stuck on the recorded-game loader after entering a live table |

These were not reviewed by the 2026-09-20 session and their CI was not read there. They describe
hangs in the mulligan, the untap step and guest entry — which is steps 5 and 6 of the run-book,
the first steps that play a game. **Deciding what to do with them is the first thing the
live-game session should do**, before running a test they may already fix or may conflict with.
#290, the UK spellings a reader actually sees, is also open and came from a task that session
spawned.
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
