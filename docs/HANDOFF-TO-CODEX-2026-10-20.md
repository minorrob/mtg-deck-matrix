# Handoff to Codex Astra, October 20, 2026: Play, reconciled since you last worked it

*From the Claude session on Personal-HP that evaluated Play for Rob's 1-person, 3-AI play test (Oct 19–20). Rob, Oct 20:
"create a handoff for OpenAI to pick back up its work reconciled with any work since it last handed off, specifically
on the Play capability." Your last Play commit was `8d01fbcb` on `codex/play-land-spacing`, Oct 18 at 12:20 UTC. This
file covers everything since then, in the four parts `AGENTS.md` asks of a handoff. It is newer than
`docs/HANDOFF-TO-CODEX-2026-10-18.md`, and where they differ, this one wins.*

## 1. The branch and commit

- **`main`** is 7e32df0a when this was written, plus the PR that carries this file. Build from `main`, as before.
- **Staging** serves main **a9bec38f**: `release/cloud-staging` 027c3e67, deployed Oct 20 at 06:13 UTC.
  - Read back signed in: `node tools/staging-check.mjs --expect a9bec38f`.
  - Rob is play-testing there: one person against three AIs, with his six decks.
- **Production** serves main **5f6ea9cc**, released Oct 18 on Rob's go. It has your #754 and #765 and the lobby fix #730.
  Rob holds production until his play test is done.
- **Your open drafts:**

| PR | Branch | Against main today | What it waits on |
| --- | --- | --- | --- |
| #770 | `codex/play-land-spacing` | merges clean; docs only so far | **the fix itself.** Rob approved the 48px spacing in the Codex chat on Oct 18 (the PR's `ROB-98-LAND-SPACING.md`); apply it |
| #766 | `codex/play-phone-focus` | merges clean; docs and screenshots | **the build.** Rob approved the upright Focused phone layout on Oct 18 (same record); ROB-18 is next after ROB-98 |
| #767 | `codex/play-babylon-surface` | **conflicts:** `README.md`, `crankmagic-app.js`, `crankmagic-stage.js`, `crankmagic-sw.js`, `crankmagic.html`, `docs/ACTIVE.md`, `index.html`, `tests/fixtures/asset-versions.json` | main merged in (a merge commit), the pins regenerated, and ROB-144, the engine lane's release verifier for the Babylon renderer |
| #735 | `codex/ui-playtest-plan-oct15` | the quarry, never a merge | — |
| #738 | `codex/handoff-opus-oct17` | docs, superseded by the Oct 18 and Oct 20 handoffs | close it or leave it; your call |

## 2. What changed in your files since Oct 18, 12:20 UTC

Every change below was made by a Claude session at Rob's word. It merged on a green `suites` run of its exact head
and is on staging. Only #730 is also in production.

| PR | Main | Your files it touched | What a player sees | Linear |
| --- | --- | --- | --- | --- |
| #730 | 5f6ea9cc (Oct 18, 12:16 UTC) | `crankmagic-seat-art.js` | the lobby's seat buttons in reach at any window size | ROB-146 |
| #777 | 71155f15 (Oct 18) | `crankmagic-tabletop.js` (12 lines) | the Workshop's card status (Use, Ownership, Play, Upgrade) where the tabletop shows a card's status | ROB-150 |
| #741 | 1eabba2d (Oct 19) | none: breaks files only | the Play UI's four mutation anchors re-anchored | ROB-16 |
| #743 | 337f4235 (Oct 19) | `crankmagic-stage.css`, `tests/table-tabletop.mjs` | the drawn mats (felt, forge, cavern, sea, night) keep their patterns in Full; new `breaks-play-tabletop.py` | ROB-162 Done, ROB-156 |
| #751 | 303e31b3 (Oct 19) | `crankmagic-stage.css`, `crankmagic-stage.js` | Rob's art mats drawn in HTML in Full, cropped to each seat, never stretched, no wash; the canvas paints only the table | ROB-161 Done; ROB-160 waits on Rob's wider images |
| #793 | a9bec38f (Oct 20) | `crankmagic-stage.css`, `tools/play-tabletop-preview.mjs`, `tests/table-tabletop.mjs` | in Full, a long choice (a tutor, Gifts Ungiven) keeps its title, count and Confirm on screen and scrolls its options; `.cm-board-ask` no longer covers the table under a short choice | ROB-163 Done; **ROB-165** follows |

The asset pins on `main` now: board 54, stage CSS 21, stage JS 7, table 29, tabletop 31, service worker 495, app 512.
Merge `main` into any branch of yours before you bump on top. On Windows: `asset-version` bumps by `sed`, then
`node tests/asset-versions.mjs --update` once, at the end.

**`tools/play-tabletop-preview.mjs`** now also takes `PREVIEW_FRAME` and `PREVIEW_OPTIONS`, an explicit synthetic
fixture for a long decision, like `PREVIEW_HAND_SIZE`. The default preview is unchanged.

**New for you:** `tests/uat/solo-vs-ai.mjs`, added with this file. It plays one browser person against three Normal AIs,
choosing Rob's Shared decks in the lobby, to the end through the board. It checks a mid-game reload, no leaked
cards and no refused AI answers. Like `real-deck-game.mjs`, it sits outside the regular suite inventory. It's yours
from here.

## 3. The engine contracts you can now build on

Each of these merged and is on staging. Your feed still says "blocked" for several of them.

| Contract | Engine issue | The board's issue, now unblocked |
| --- | --- | --- |
| `events.v1`: public events with stable ids, `{type: "view", after}` on reconnect | ROB-77 (#747) | ROB-50 |
| `state.round`, `turnInRound`, `turnId`, `extraTurn` | ROB-76 (#748) | ROB-53 |
| Combat projection: legal attacker and blocker pairs, `legalBlocks` on Declare blockers, block-draft validation | ROB-75 (#778) | ROB-26 (the board doesn't read `legalBlocks` yet) |
| Auto-pass with no meaningful response; **Yield turn**: `mayYield` / `yielding` on the view, `{type: "yield"}` | ROB-13 | ROB-28, ROB-23 |
| The normal draw waits for one acknowledgment (`drawBeat`; new tables launch without it until ROB-102) | ROB-73 | ROB-24 |
| Casting with floating mana and several sources; `commanderTax` projected | ROB-12 | ROB-29 |
| The AI seats take the picks an "up to" or a search is for (`pilotPicks`, a new match's pod key) | ROB-164 (#792) | nothing to build; a table started before a release plays the old AI |
| Candidates at playtest tables: `candidate: true` on a card, `POST /api/tables/:id/report {cardId, note}` | ROB-91 (#790) | Requests, Engine → Play 4 |
| `POST /api/tables/known` answers `{unknown, listed}`; the hub may ask `{decks}` | ROB-86 (#784) | ROB-159 (Requests, Engine → Play 3) |
| `rules.skipFirstDraw` at two-seat tables | ROB-147 | ROB-148 (Requests, Engine 2) |
| `monarch: true` on a player | CR 725 | Requests, Engine 1 |

Still blocked on the engine: ROB-25 waits on ROB-74 (payment drafts; ROB-74 now also notes that an X spell is
offered only once its mana floats), ROB-49 waits on ROB-78, and ROB-54 waits on the chat contract.

## 4. Proven, assumed, and the command for each

**Proven, Oct 19–20 (the Play readiness evaluation):**

- **Your setup works end to end.** One person against three Normal AIs, Rob's six decks chosen from Shared decks,
  played to the end through the board: `node tests/uat/solo-vs-ai.mjs`. On main 0cb93288 it ran three tables, of 38,
  34 and 41 turns. The mid-game reload returned the same question, 172–226 frames per table leaked nothing, and no AI
  answer was refused.
- **Every decision the engine asks has a path on the board.** The engine asks in six modes: `one`, `many`, `order`,
  `boolean`, `ack` and `damage`, plus `draw`. The generic `decision()` (`crankmagic-board.js` ~945-990) answers all six.
  Targets, modes, X and costs reach the person as separate priority offers. This was read in code;
  `tests/uat/real-deck-game.mjs` passed 13 checks on a 36-turn natural end on main 0cb93288.
- **Every card of the six decks is defined** and their 904 scenarios pass. The engine side is in ROB-94's comment.
- **Staging:** release-acceptance 22 and play-e2e 42 passed before the push, and the read-back above passed after it.

**Assumed, not proved:**

- A physical phone, hardware WebGL, and touch.
- A game with Rob at the table. That's his play test, under way now.
- The deployed bytes on staging against the dry run.

## 5. Outstanding, in order

**First, what Rob will feel in his 1-vs-3 play test** (he asked for functional, not refinements):

1. **ROB-28, Yield wired to the room.** The board never sends `{type: "yield"}`, and its own Yield cancels at the first
   stack item. With `passStack` off (ROB-102), a person is asked on every AI spell and trigger. This is the most-felt
   friction with three AIs.
2. **ROB-166, the loss banner.** A person's loss at a table of AIs reads "The game was ended early: every person had
   left" and is filed as unfinished (`crankmagic-board.js:1273`, `:334`). The room's half, a reason that says who lost
   and why, is the engine lane's; ask in the Requests table.
3. **ROB-165.** A pick in a long choice scrolls the list back to its top. #793 left Confirm in reach, but a four-card
   pick means scrolling four times.
4. **ROB-26, combat.** The display first, then direct blocking from `legalBlocks`. Meanwhile ROB-168 (engine) numbers
   same-named attackers in the list ("blocks Goblin #2"), for a Krenko swarm.
5. **ROB-23** (one priority prompt, inspectable stack), **ROB-24** (Draw card), **ROB-29** (castable commander, tax
   badge). Then ROB-102 turns `passStack` and `drawBeat` on for new tables.
6. **ROB-169.** "Look at a player's hand" (`handLook`, mode `ack`) draws only OK: render its options as cards.
7. **ROB-167, rematch.** The table contract has `rematch-vote`. The Worker route is the engine's half; Play again in the
   banner and the lobby is yours.

**Then the requests waiting on you** (`docs/ACTIVE.md`, Requests): Engine → Play 4 (the candidate label and "report a
wrong card"), Engine → Play 3 (ROB-159), Engine 2 (ROB-148), Engine 1 (the monarch), and ROB-53 and ROB-50 (round and
turn, events).

**Then your queue as it stood**, with Rob's two decisions already made:

- **ROB-98:** apply the approved 48px spacing (#770).
- **ROB-18:** build the approved upright Focused phone view (#766).
- **ROB-99** slices 2 and 3 (ROB-20, ROB-22).
- **ROB-52 and ROB-100's renderer** (#767, after main and ROB-144).
- **ROB-156:** the one missing break, the table material.
- **ROB-154:** keyboard focus when Settings opens from the profile menu.
- M4 to M6 as in `docs/program/workstreams/codex-play.md` §4.

**Still Rob's:**

- ROB-59: the Runway and Higgsfield loops;
- ROB-139: the game's name;
- ROB-160: the wider art images, which he makes;
- ROB-170: whether a solo game should wait for an away person (engine).

## 6. Your feed (`docs/readout/feeds/codex-play.json`) against today

It was last written Oct 18 at 08:04. Correct it at your first merge (`node tests/readout-feeds.mjs`):

- **Done:** ROB-19 (in production, closed on your Oct 18 conditions), ROB-97, ROB-161, ROB-162, ROB-163.
- **No longer blocked:** ROB-26, ROB-50, ROB-53.
- **Rob's asks:** ROB-98 and ROB-18 were answered (approved, Oct 18). Keep ROB-59 and ROB-139.
- **New:** ROB-165, ROB-166, ROB-169, and ROB-167's Play half; ROB-159 and ROB-148 from the Requests.

## 7. Pitfalls met since you left

- **A Playwright click proves no reach.** It scrolls inside `overflow:hidden`. ROB-163 passed every suite and still
  couldn't be finished by a mouse. Hit-test with `document.elementFromPoint` at real window sizes (1024×768, 1280×720,
  1400×900), after the wheel, never after `scrollIntoView`. `.cm-stage-region` clips: anything floated in Full needs
  its own scroll.
- **A new table gets the new AI.** `pilotPicks` is per match, so check AI behavior on a table started after the release.
- **Merge when green** means the `suites` run of the exact head with `main` unmoved. Workers Builds fail on every PR
  (ROB-152). The engine lane releases staging, and you ask in ROB-11.
- **A session can read staging from Personal-HP now.** Rob's second Access token, `crankmagic-staging-checks-hp`, is in
  the Windows user environment. How a session reads it is in `tools/staging-check.mjs`'s header (PR #795).

## 8. Ownership

The **Codex · Play** lane is yours again as of this file, with your files as in `docs/program/README.md` §3. No Claude
session has anything in flight in your files. `docs/ACTIVE.md`'s lanes table names this handoff, and ROB-11 records it.
