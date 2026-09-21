# Handoff: take CrankMagic Online to a live game, 2026-09-20

**For:** the session that runs the live-game test. **Written by:** Claude Code (Opus 5), local
session on Personal-HP. Read `AGENTS.md` and `docs/ACTIVE.md` first, as always.

Rob's instruction for this session was: build the Play lobby, build the game board, then focus on
getting a live game up and running — testing throughout, so that the final end-to-end test is a
UAT sign-off rather than a defect hunt — and **pause before playing an actual game through**,
leaving that final test to another session. This is that handoff.

---

## 1. The one thing to understand before you start

**A live game is played in Forge, not in the browser.** This is not obvious from the Play tab and
it changes what "build the game board" means.

- `crankmagic-game.js` draws the **lobby**: seats, decks, table rules, readiness. It does not draw
  a board and never has.
- The browser's mat surface is **`game/ui/review.mjs` with `game/ui/mats.css`**, reached at
  `/play`. `game/ui/play-entry.mjs` routes that path: a remote guest gets `guest-live.mjs`, the
  host or a recorded match gets `review.mjs`.
- CrankMagic hosts the table, validates the decks against Forge's card database, seats the
  players, launches Forge, and writes the match back onto the deck (`attachMatchReport`).

So the DELTA's "table view" and "focus view" are a redesign of the **mat surface**, and the path
to a live game is the run-book, not more board work.

## 2. What is proven on this machine, today

Run from `C:\Users\robmi\CrankMagic\repo`:

```bash
node game/tools/preflight.mjs
```

It passed at the time of writing:

| Check | Result |
|---|---|
| Node runtime | v24.19.0 |
| Forge card database | **33,819 card scripts, 35,649 names** |
| Java runtime | `C:\Users\robmi\CrankMagic\runtime\jdk-17.0.20.1+1` |
| Local host | `warn` — nothing on 8768 yet; the launcher starts it |
| OpenAI credential | readable |
| Remote guest tunnel | cloudflared installed |
| Every card in all 7 decks | **OK**, including the seven awkward names (`Lim-Dûl's Vault`, `Ætherize`, `Jötun Grunt`, `Fire // Ice`, `Malakir Rebirth // Malakir Mire`, `Boseiju, Who Endures`, `Sol Ring`) |

`✓ Steps 1 to 3 all pass. This computer is ready to host.`

**Re-run it yourself before trusting it.** That is the whole point of the run-book: a fixture
cannot say whether *this* Forge checkout resolves *these* decks today.

## 3. What you are testing, in order

The run-book is `game/docs/readiness-plan-2026-09-18.md` §12. Steps 1–3 are above. The rest:

- **Step 4 — does the gate actually block?** Start the host, open Game setup, try to prepare a
  deck containing a card Forge does not have (any invented name pasted into a list). Expect a
  refusal **naming the card, before Ready Up becomes available**. This used to pass preparation
  and fail at engine load with everyone waiting.
- **Step 5 — a solo table to turn 3.** One human, three AI. This is the first step that plays.
- **Step 6 — the invitation, on a clean browser.** Two humans, Email Invite yourself, then press
  Start — the sequence that used to void the link — and open it in a browser with no history for
  the site. While the countdown runs:
  ```powershell
  (Invoke-RestMethod http://127.0.0.1:8768/api/table/readiness).launch.stage
  ```
  Expect `engine-spawning` or `engine-spawned` **before** the countdown reaches zero.
- **Steps 7–9** — the host levers (Prompt AI, force-advance) and the return edge. Read them in
  §12; they are written as commands to paste.

Starting the host:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\start-crankmagic.ps1"
```
It starts a hidden persistent host, logs to the ignored `game/.local/host/`, and preserves a
running game. Restart the app after switching branches — it reads its code from disk at startup.

## 4. What changed in the Play tab this session, and what it means for your test

**The lobby is now a table** (PR #300, `claude/v5a-lobby-table`). Four quadrants in seating order,
you bottom-right. Each quadrant is filled by the element that says what that seat is doing —
mist empty, wheat invited, ocean resolving a deck, leaves ready, fire when a check failed — and
a color-identity fan radiates from its inner corner once a commander is chosen. The rules sit at
the center with one line, *"Launches when every seat is ready · n to go"*, **in place of a Launch
button**; the host's controls moved below the table under **Host tools**.

**Every seat body, action and id is unchanged.** The handlers find them by `data-action`; nothing
moved. If a lobby action misbehaves in your test, suspect the action, not the table.

Three things about the lobby you will meet:

1. **Pressing "Seat it" with no deck chosen does nothing and says nothing.** The dialog refuses
   silently. This predates the redesign. It cost me a test run to diagnose and it will cost a
   person the same. Worth fixing before the sign-off if you have room.
2. The **10-second auto-launch countdown is not drawn**. The readiness poll is wired and the line
   is read-only, but the countdown itself is not on screen yet. Step 6 checks the engine spawns
   before the countdown ends — you will have to read that from the API, not the page.
3. **Choose mat, the commander card in the outer bottom corner, and Host tools as a menu** are not
   built.

## 5. How to drive the lobby in a browser, without a person

There is a working driver in the session scratchpad pattern; rebuild it in three lines if you want
one. What matters is the two gotchas it cost me:

- The seat dialog's deck `<select>` has a **placeholder first option with an empty value**.
  `selectOption({index: 1})` picks it and the dialog silently refuses. Pick the first option whose
  `value` is non-empty.
- The dialog's primary is `.v-button.primary` and reads **"Seat it"**.

A correct run produces: the host's quadrant goes `empty → deck` (sea `mist → ocean`), the launch
line becomes `Launches when every seat is ready · 1 to go`, and the fan draws one wedge per color
of the commander's identity. No page errors.

## 6. The defect this session found by driving rather than looking

The color-identity fan drew **nothing**. A seat carries its commander on `seat.commanders[0]`, and
the identity belongs to that card — `seat.colorIdentity` is `undefined` for every seat. An empty
table and a fully seated one rendered identically, so every screenshot of an empty lobby looked
correct.

That is the whole argument for Rob's instruction to test during development: the final test should
be a sign-off, and this would have been waiting in it.

## 7. Standing rules you inherit

- A test that was red first for every fix, named in the commit.
- `PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q`, with `UAT_PLAYWRIGHT` and
  `UAT_CHROME` exported or the browser suites pass by not running. 97 suites at the time of
  writing. The recipe is in `docs/ACTIVE.md`.
- Pins moved for every changed asset and `node tests/asset-versions.mjs --update`. The chain
  bites: changing the worker's shell list changes the worker, which moves its own pin inside
  `crankmagic-app.js`, which moves the app's pin.
- American English everywhere. The ratchet in `tests/feature-wiring.mjs` caught me **four** times
  this session: twice in prose, once in a CSS class name and once in a function name, each time
  the British spelling of "center". It caught this document too, which is why it reads as it
  does. Name things in American English the first time — a rename after the fact touches the
  markup, the stylesheet and the test together.
- Never touch `data/deck-ratings.json`, `data/simulation-summary.json`, `sim/`,
  `data/deck-guides.json`.
- Branch `claude/<topic>`, push before you stop, update `docs/ACTIVE.md` as your last act. **Check
  you are on the branch**: I committed the lobby to `main` by mistake this session because a
  command chain had left me there. Nothing reached `origin/main`, but check `git branch
  --show-current` before you commit.
- Merge under standard practice, gated on the CI result you just read, on the **head SHA you are
  merging** — a pushed documentation commit re-runs CI and the old result is not the new one.

## 8. What is open

| PR | Branch | What |
|---|---|---|
| #300 | `claude/v5a-lobby-table` | the lobby as a table |
| — | `claude/v5b-game-board` | the playmat's zone frames, and this finding written into the commit |

Both need CI read before merging.
