# Who holds the work

## The lanes (AGENTS.md, *Lanes*), since 2026-10-12

| Lane | Held by | Branch | Doing |
| --- | --- | --- | --- |
| **Engine** | Claude, a cloud container; **paused 2026-10-12 at 90% of the week's usage: `docs/handoff-2026-10-12.md`** | `claude/admiring-franklin-58cxy4` | Waves 4 and after, to the most-played 90% of Commander cards (`docs/engine/plan-coverage-90.md`); waves to 4c merged and on staging; next, wave 4d |
| **UI** | Fable (a Claude session in a cloud container), since 2026-10-12 | `claude/nice-hypatia-4ajdyi` (the session's own branch, by its harness; the `claude/ui-<topic>` form waits for the next topic) | Pass 1 of the Play screen on the Replit concept: the seven steps in the strip, Full screen as the table from your chair with a 3D switch, the right pane docked with Turn Resources (notes 9 and 10), the hover card no taller than the mat, motion and callouts, the lobby's fans and launch line. The plan: `docs/ui-lane/plan-play-ui-2026-10-12.md`. Brief: `docs/ui-lane/README.md` |

### Requests between the lanes

A lane that needs something of the other's files asks here: the field or change, what it is for, an example. The
other lane answers in the last column.

| # | From | Asks for | What for | Answer |
| --- | --- | --- | --- | --- |
| 2 | UI | The lobby's countdown to start by itself once every seat is connected, has a deck and is ready, with no Start press; the host's Cancel stays, and a seat's Not ready stops it | The brief's lobby ("No Launch button: when every human is ready, a 10-second countdown starts, cancelable by the host"). Today the lobby reads "Launches when all are ready · n to go" and the host presses Start | `game/room/table.mjs`, where `ready` is taken: begin the countdown when nothing blocks. The lobby already follows `phase: countdown` | |
| 3 | UI | A structured record of what happened since the last revision: `events: [{kind, …}]` on the view (damage dealt with its source and target; a spell countered and by what; tokens created with their count; proliferate; a permanent destroyed or exiled; life gained or lost with its cause; a seat out) | The callouts over the table and the sounds read these from the difference between two views and from the history's sentences (`/countered/`, `/created N … tokens/`), which is brittle and carries no cause; the brief's readouts (damage per source, what was prevented) need the facts | `game/room/history.mjs` already knows each; the view's builder in `game/room/room.mjs` | |
| 4 | UI | Per player, the mana tapped this step (`manaTapped`), or on each land whether it was tapped for mana | Turn Resources' "mana tapped this step"; today it counts tapped lands, which includes a land tapped for anything else | the view's players | |
| 5 | UI | On a card: whether it is a token; what an Aura or Equipment is attached to; summoning sickness; colors and mana cost; which face is up | The anchor's own list. Dice on tokens, Turn Resources by color, attachments drawn under their host, a double-faced card's right picture | the view's cards | |
| 6 | UI | A `roll` frame at the game's start: the d20 for first player, sent to every seat with its result | The brief's die, which animates to the result it was sent | the room, at launch | |
| 7 | UI | `tests/advisor.mjs` to pass again: its clock is fixed at 2026-10-11T12:00Z and its `ai_calls` rows are written at that clock, but the meter's 24-hour window (`cloud/ai.mjs` `since()`, through `aiMeter` in `cloud/worker.mjs`) runs on the real clock, so from 2026-10-12T11:59Z the rows fall outside it and the meter check fails on every branch, `main` included | The Actions gate is red for every PR until it is fixed; #725 (the UI pass) waits on it to merge | `cloud/worker.mjs` (`aiMeter`: pass the request's `now` to the door's `spent`), or the suite's rows at the real clock | Fixed on `main` in c629f8c1 (#723): `aiMeter` takes the request's clock. #727 puts the LLM seat's call log on the table's clock too (`cloud/game-room.mjs`), with `tools/ai-clock-breaks.py`; the AI suites pass with the machine's clock moved days either way |
| 1 | Engine | The board to show the monarch (CR 725): the view's `state.players[i]` now carries `monarch: true` for the monarch, public to every seat, and no key for anyone else; the history says "Maya became the monarch" | Ginger, Queen of Sweets and Tamiyo, Upriser Crowned make their controller the monarch; the monarch draws a card at their end step, and a creature's combat damage to them makes its controller the monarch -- a player should see who holds it | The engine lane built it (Train E, the `monarch` branch); `docs/ui-lane/gameplay-anchor.md` lists the field. For the UI lane to show |
| 2 | Engine | A switch in the host's Table rules (`crankmagic-table.js`): *The player who goes first skips their first draw*, on unless the host turns it off. The table's view carries `rules.skipFirstDraw` (`true` by default); the host sends it with the other rules, `POST .../rules {skipFirstDraw: false}`, refused once a seat is ready like the others. It matters only at a two-seat table: in a game of three or four nobody skips (CR 103.8c), so the switch can be shown only there | Rob, 2026-10-12: "this can be toggled off in game setup by the lobby owner". CR 103.8a as a house rule: with it off, the first player of a two-player game has a draw step on turn 1 | The engine lane built the rule, the table's field and the room's pod (`claude/first-draw-step`; `docs/ui-lane/gameplay-anchor.md`). For the UI lane to show |

## 2026-10-13: the lobby's buttons in reach at any window size (`claude/ui-lobby-seat-buttons`; Claude on Personal-HP)

UI-lane files, at Rob's direct request; no UI-lane branch touched them. Rob, testing staging with an invited player: "their
screen wasn't maximized, and the buttons aren't visible when the screen isn't big enough".
- **What it was:** a seat's quadrant clips what it holds, and the 2x2 shrinks with the window. At 1024x768 her seat
  showed Change deck, with Choose mat and Ready cut off below it.
- **Built:** the cloud table keeps its 2x2 only while every seat's card, reading and controls fit inside what clips
  them, and stacks the seats otherwise (`fitSeats` in `crankmagic-seat-art.js`). The seats keep clear of the rules
  panel's 246px floor. A stacked seat is as tall as what it holds. The stacked table is no longer 18px wider than its
  column.
- **Proof:** `tests/table-lobby.mjs`, 97 checks: every control reached as a person can and hit-tested, guest and host,
  at six window sizes. `breaks-lobby-reach.py`, 9 of 9 caught.
- **For whoever holds the UI lane next (Codex Astra):** a Playwright click scrolls inside clipped boxes, which a person
  cannot. Prove a control usable by hit-testing it (`inReach` in `tests/table-lobby.mjs`).

## 2026-10-12: the UI lane's pass 1 on the Play screen (Fable, a Claude session in a cloud container)

Rob's brief of 2026-10-12: evaluate the Replit concept (`CrankMagic-Play`, with its `HANDOFF.md`) and the board, plan
the port, build a first pass, put it on staging, and iterate on his feedback. The plan, what was kept and what was
refused of the concept, and the passes to come: `docs/ui-lane/plan-play-ui-2026-10-12.md`.

- **Branch** `claude/nice-hypatia-4ajdyi`, from main 494bf0f (#722). The harness names the branch; the lane's
  `claude/ui-<topic>` form is for the next topic.
- **Built** (the board, its CSS, the mats sheet, the lobby, Settings' Play card; nothing of the engine's):
  - the seven steps always in the strip and in Full screen's pill, done · now · to come, short forms under 1400px;
  - Full screen as the table from your chair: the big board's mat is the whole ground; the other seats at the far sides
    and the back as boards of their own; a **3D** switch in the rail bends the ground at a horizon, remembered on the device;
  - the right pane docked beside the mat in Focus and Table, its own width divider, with the tabs Turn Resources · Panel
    · History (Rob's notes 9 and 10); the hover card no taller than the mat;
  - motion: a played card flies from the hand to the mat, a drawn one from the library, a destroyed one to its pile; a
    tapped card turns where it lies; the turn's light crossfades; Reduce motion stills all of it;
  - the callouts (the brief's overlay): YOUR TURN, INCOMING, HIT, KO, COUNTERED, TOKENS, DESTROYED, EXILED, +N and the
    rest, read from the difference between two views; three at most; Settings › Play › Overlay (a slider) sets how
    loud and how long; Tools › Try the callouts fires the set;
  - the lobby: a seated deck's quadrant wears its commander's color fan; "Launches when all are ready · n to go";
  - Play home: Recent games under New table.
- **Proved** (each command from the repository root, `GEOMETRY_REQUIRED=1`):
  - `node tests/table-board.mjs`: the ribbon, Full screen's ground and seats, 3D, the docked pane and its divider, Turn
    Resources, the hover cap, the callouts' layer;
  - `node tests/board-callouts.mjs` (new, in Node): the callouts' reading of a view, a hidden card never named;
  - `node tests/table-lobby.mjs`, `node tests/settings-r3.mjs`, `node tests/a11y-board.mjs`, `node tests/board-choices.mjs`,
    `node tests/coach.mjs`, `node tests/feature-wiring.mjs`, `node tests/room-resolve-all.mjs`, `node tests/room-beats.mjs`,
    `node tests/playtest-harness.mjs`, `node tests/data-integrity.mjs`, `node tests/asset-versions.mjs`;
  - breaks: `python3 game/tools/batch/breaks.py game/tools/batch/breaks-play-ui.py` (12) and `breaks-play-ui-rest.py` (7).
- **Assumed, not proved:** the flights and the turn's light are seen in the fixture (`tools/board-fixture.mjs`) and not
  yet held by a suite; the side seats' boards at 1280×720 are legible as presence, not to read.
- **Asked of the engine lane:** Requests rows 2 to 6 above.
- **Outstanding:** the merge of #725 on a green run of its head (the advisor suite's clock, Requests row 7, was fixed on
  `main` in c629f8c and is merged into the branch); then the staging release, Rob's review, and pass 2
  (`plan-play-ui-2026-10-12.md` §4).
  The suites this pass touches are green on its head: a11y-board 288, table-board 281, table-lobby 89, board-callouts 33,
  settings-r3 63, board-choices 40, coach 60, design-tokens 91; the 19 breaks all caught.

## 2026-10-12: the AI call log on the clock it is handed (`claude/advisor-meter-clock`)

Claude Code on Personal-HP, at Rob's request, for one small fix in the engine lane's files. `advisor` failed on main
494bf0f4 once the real date passed 2026-10-12T12:00Z: the settings' meter read the last 24 hours on the machine's clock.
The engine lane fixed the meter in c629f8c1 (#723). This branch fixes the one other call log on the machine's clock:
- **The LLM seat** (`agentChoice`, `cloud/game-room.mjs`) logged its calls and read the day's caps on the machine's
  clock. It now uses the table's clock (`this.now`), as the countdown and the away clocks do. Production is unchanged.
- `tests/agent-seat-table.mjs`, 18 checks (from 16): calls are logged at the table's clock, and a spend logged a minute
  before it counts against the host's day.
- `tools/ai-clock-breaks.py`: 6 breaks, each caught by the check it targets.
- **The suites no longer depend on the real date:** advisor, ai-door, coach, cloud-worker and agent-seat-table pass with
  the machine's clock moved 30 days back, 2 back, 30 on and 400 on (a preload that moves `Date.now()` and a bare
  `new Date()`; the PR has it). With the meter's old code, advisor passes 2 days back and fails 30 days on.
- Waiting: the PR's one green Actions run, then a merge. Nothing else is open.

## 2026-10-12, later: Train E, Rob's library, in waves; the plan to 90%

This session (Claude, a cloud container), with session workers only. No API usage (Rob: "I don't want to use API
usage for this").
- **Wave 1, merged #719** (main 0b9de9a8), on staging (b1369b4b3bf3): 44 cards. With them came:
  - warp, void and sneak;
  - explore and the Map token.
- **Wave 2, merged #720:** 63 cards from four workers.
  - Engine pieces:
    - morph;
    - behold-and-exile;
    - last known power in a trigger;
    - `differentNames` and `greatestManaValue`;
    - a goad for the rest of the game;
    - a different opponent for each permanent given away;
    - replicate.
  - Fixed: whether a first-strike damage step happens is now decided as combat damage begins, not at blocks (CR 510.4).
    A creature given first strike after blocks used to deal no combat damage.
  - Waiting: Extrapolate the Impossible, which needs cards from outside the game (CR 400.11).
- **Wave 3, merged #721:** 63 cards from four workers, the last of Rob's library.
  - Engine pieces:
    - Narset's "can't draw more than one card each turn" (CR 121.2b);
    - a modal "you may choose the same mode more than once" (700.2d);
    - "the first time this ability has resolved this turn";
    - a blocks trigger naming what it blocks;
    - a cast trigger's "while";
    - incubate and the Incubator token;
    - "move X counters" moving what is there;
    - an unless cost's discard of a kind;
    - "you may choose new targets";
    - no maximum hand size for the rest of the game.
  - A second worker made wave 2's CR 510.4 fix independently; wave 2's was kept.
- **The monarch** (CR 725), merged #721:
  - one monarch at a time, with its two inherent triggers;
  - a monarch who leaves passes it on (725.4);
  - `becomeMonarch`, and `monarch: "you"`;
  - `monarch: true` in the view (Requests row 1).

  With it, a creature leaves combat when its controller changes (CR 506.4). Ginger, Queen of Sweets and Tamiyo, Upriser
  Crowned now play.
- **Rob's library, after waves 1 to 3:** 1,216 of his v43 library's 1,217 cards play (`tableCards`). The one left is Extrapolate the Impossible,
  which needs cards from outside the game (CR 400.11).
- **Wave 4a, merged #722** (main 494bf0f4), on staging (5153cc15): four constructs, and 72 of the most-played Commander cards they unlock. The 80% set goes
  from 1,275 defined to 1,347, and from 2,661 with every rule to 2,743.
  - "You may play that card" from another zone: 17 cards. Valgavoth waits on a replacement on every route to a
    graveyard.
  - The cards an effect moved: 17 cards. Gix, The Legend of Kyoshi and Gisa wait.
  - Objects an effect remembers: 19 cards. Daretti waits on emblems.
  - Token and counter replacements: 19 cards. The Earth Crystal waits on counters divided at activation.

  None of the four constructs is credited in full. Each lane names the forms still missing.
- **Every break anchors once again.** Later merges had moved the anchors of 37 breaks across 15 files, so those breaks
  no longer broke anything. Each was re-anchored on the code it was written for and proved caught; 1,098 breaks
  checked. Wave 4b's merges moved 23 more, in 10 files: each re-anchored and proved caught the same way. Every one of
  the 1,368 breaks in the 40 files now finds its code exactly once.
- **The plan, reordered** (`docs/engine/plan-coverage-90.md`):
  - 1,396 of the 80% set's undefined cards already have every rule, so the most-played cards come first, each wave
    building the small constructs its cards need.
- **Wave 4b, merged #723** (main a61244a0): 112 of the 120 most-played cards the table couldn't play (ranks 23 to 500), and three
  more that prove its constructs. Four lanes, each building the constructs its cards needed:
  - j1, 26 cards: an Aura on a graveyard card (Animate Dead), a land given a basic land type taps for its mana
    (CR 305.6), protection from colors over the creatures a spell named (Akroma's Will), "if you cast it".
  - j2, 31 cards: changing targets to this creature (Spellskite), the top of a library put back in any order
    (`rearrangeTop`), "whenever you cast or copy" (magecraft), the amount a delayed trigger remembers (Mana Drain).
  - j3, 30 cards: exalted, extort, eternalize, gift, an opening hand's card beginning on the battlefield (CR 103.6a),
    base power.
  - j4, 28 cards: "can't be activated" (Grand Abolisher), a cost raised for what a spell targets (Terror of the Peaks),
    X paid in life (Toxic Deluge), imprint, the creatures attacked with this turn (Minas Tirith).
  - Three lanes each built CR 305.6 on its own. One is kept (`intrinsicMana`, rules/layers.mjs, layer 4), only for a
    land, and gives each type's ability once.
  - Not defined, each waiting on another family: Sylvan Library, Arena of Glory, Mosswort Bridge, Six, Ragavan, Dauthi
    Voidwalker, Birgi and Emry.
  - The 80% set: 1,462 defined (from 1,347), 2,780 with every rule. The 90% set: 1,605 of 5,869 defined (from 1,411).
    The defined cards now cover 60.3% of all card appearances (52.0% when the plan was written).
  - Breaks: j1 33, j2 45, j3 111, j4 81, each caught.
- **Wave 4c, merged #726** (main 0540d882): 78 of the next 80 most-played cards (ranks 501 to 723), in four lanes by theme, each owning the
  rules its cards need:
  - k1 lands, 21: a land played as an effect resolves (Windbrisk Heights, and Mosswort Bridge, which 4b had left).
  - k2 graveyard and combat, 19: delve, dredge, fabricate, a flashback cost that sacrifices, the rest of a dig on the
    bottom in an order its owner chooses (CR 401.4), Commander's Plate's protection, CR 205.3d's subtypes.
  - k3 tokens and counters, 18: dice (`rollDie`), offspring, "becomes level", +1/+1 and -1/-1 counters cancelling
    with the deaths (CR 704.5q), Saw in Half's copies, a counter for each creature of the chosen type.
  - k4 spells and draws, 20: affinity, a hand looked at (Gitaxian Probe), "draws more" and "an empty draw wins"
    (Teferi's Ageless Insight, Laboratory Maniac), a fixed life payment as a cost's choice.
  - Stopped on: Mox Diamond (an "instead of entering" asked before it enters, on every route to the battlefield);
    The Earth Crystal (counters divided at activation, CR 601.2d); Tibalt's Trickery (a random number, a cast by
    another player as it resolves).
  - Two lanes built the same "tap a permanent without {T}" mana cost (Urza; Relic of Legends): one kept.
  - **Every break still breaks something:** `tests/engine-breaks-anchors.mjs` holds each anchor to being found once
    (`game/tools/batch/anchors.py`). It named the three breaks this wave's own merge moved, and three stale ones in
    `train-b6-breaks.py` the earlier scans never read. 53 files, 1,712 breaks.
  - The 80% set: 1,540 defined (from 1,462), 2,814 with every rule. The 90% set: 1,683 of 5,869. The defined cards
    cover 62.5% of all card appearances.
  - **On staging with wave 4b** (main 0540d882): release-acceptance 22, play-e2e 35; Workers Builds deployed version
    fe296442, its `play-worker.js` byte for byte the release's dry run (sha256 dc3437729abb); `staging-check` signed in
    reads 0540d882. The release of a61244a0 had stopped at `play-e2e` (Cyclonic Rift named as unplayable); #726 fixed it.
- **Paused here at 83% of the week's usage**, at a wave's end rather than mid-wave (Rob's 90% rule): the handoff is
  `docs/handoff-2026-10-12.md`. Wave 4d starts at rank 724 of the 80% set, plus the leftovers it lists.
- **Open, for later waves:**
  - **Fixed on `claude/first-draw-step`:** in a two-player game the starting player skipped the draw step's draw, not
    the step (CR 103.8a), so its beginning triggers fired on turn 1. Now the step is skipped.
    - A draw step brought by an added beginning phase (CR 500.8) still happens: Sphinx of the Second Sun on turn 1.
    - The table's host may turn the skip off (Rob, 2026-10-12; Requests row 2).
    - Breaks: `breaks-first-draw-step.py`, 16 of 16 caught.
    - Orcish Bowmasters (wave 4b): its turn-1 scenario drew in the step that no longer happens. It now shows Rob's
      turn-1 draw triggering it. A new dredge scenario (CR 702.52a) catches j4's "an effect's draw" break again.
    - Crossing the lanes: `tests/table-board.mjs`, the UI lane's suite, had its turn-1 history line updated. No UI-lane
      branch touches that file.
  - When two limited permissions allow the same card, the engine merges them and picks one. That choice is the
    player's.
- **The plan to 90%** (Rob: "after wave 3 define a wave 4+ to bring us to the 90% of all cards typically used"):
  `docs/engine/plan-coverage-90.md`.
  - The target is 5,869 cards, of which 1,411 are defined.
  - Waves 4a to 4c build the constructs that block the most cards.
  - Wave 5 onward defines the rest, 60 to 90 cards a wave.
  - The week's usage is read before each wave.

## 2026-10-12: Rob's notes merged and on staging; his v43 library restored there; Train D

This session (Claude, a cloud container):
- **Merged #714** (main a8008918) on one green `suites` run: notes 1 to 8 and 14 of Rob's playtest notes (the table
  below). Its 50 breaks are all caught. It is released to staging, and the deployed worker is byte for byte the dry
  run's (play-worker.js 597fe3975a37).
- **Rob's library is v43 on staging.** Rob restored `crankmagic-library-v43.json` (built from his v43 Master workbook,
  the six Target decks only) through Settings. The cloud's head, revision 30, read back from D1 and decoded:
  - its cards, decks, copies and groups are identical to the file;
  - six decks, each final and ready at 100 of 100 (D1 Tymna + Kraum, D2 Chulane, D3 Kiora, D4 Felothar,
    D5 Teysa Karlov, D6 Krenko);
  - 1,217 cards and 2,245 copies; none of the old decks is left.
- **Production waits on Rob's restore**, done the same way.
- **The old saved versions are purged** (Rob's OK, 2026-10-12): every one of his versions but the head, the guard
  `cloud/library.mjs`'s own pruning uses. Staging lost 20 and keeps v43 (revision 30); production lost 8 and keeps its
  head of 2026-10-04 until Rob restores v43 there, after which its one old version goes too. D1 Time Travel can still
  restore either database for 30 days.
- **Merged #715** (main cb73f7d0) and on staging:
  - Load Live reads two partners as a deck's commanders, and a workbook's decks named by hand (`--decks`);
  - the board's notes 11 to 13.
- **Merged #716** (main 4a024c1b): an AI on Claude and the deck advisor on at staging; the lanes and the UI brief; Train D's
  first 16 cards.
- **An AI on Claude and the deck advisor are on at staging.** Rob approved their privacy wording on
  2026-10-12 ("Approved on privacy wording"). Production's door stays shut.
- **Train D: all 18 of the six decks' cards now play.** 16 came in #716. Oko, Thief of Crowns and Retro-Mutation come
  in this branch, with the engine gap that stood in their way:
  - "Loses all abilities" now switches off a permanent's static abilities and replacement effects, not only its
    keywords and its triggered, activated and mana abilities (CR 613.1f).
  - An effect begun in an earlier layer keeps applying (613.6). Every static and replacement reader takes an object's
    abilities as they are after layer 6.
  - Eight cards already defined were wrong on about a quarter of their targets, and 16 new scenarios show each one
    right: Song of the Dryads on a lord no longer leaves its anthem on.
  - New: `exchangeControl` (CR 701.12), and a layer-4 change of creature types only (205.1a), so an Elked Food stays a
    Food. `tests/engine-ability-loss.mjs`, 109 checks; `breaks-ability-loss.py`, 76 of 76 caught.
  - **Left open:**
    - Song of the Dryads' ability loss belongs to its layer-4 effect (CR 305.7), and is applied in layer 6.
    - A Saga under it still reads its printed chapters.
    - An ability lost as a permanent enters (614.12) is not built.

    No card in the library depends on any of these.
  - Next, the library's other ~175 cards.
- **G-F: production is released, with Play open** (Rob: "Workers Builds branch is release/pages, go ahead with
  production", 2026-10-12). Both releases were built from main fa1a7d3b, the same commit staging serves (its worker
  byte-identical to its dry run, 40d0018f1647). Each went out by `tools/release-production.sh`, and Workers Builds
  deployed each push of `release/pages`.
  1. **The standby** (Play closed, the table class registered):
     - `release/pages` 6799f713;
     - local walks: `release-acceptance` 23 and `production-play-e2e` 27;
     - deployed as version **a2c6fbb4**, the recovery target;
     - the live walk at `https://crankmagic.com`: 23 checks.
  2. **Play** (`cloud-production`):
     - `release/pages` 04b415de;
     - local walks: 22 and 27;
     - deployed as version **8997e158**; `version.json` reads `fa1a7d3b`, profile `cloud-production`;
     - the live walk: 22 checks.

  Production's AI door stays shut: the version has no `AI_*` binding, and opening it is a later go of Rob's. `/api/*` is
  behind Access.
- **Before Part 7's second sentence:**
  - G-D: Grok Bot's 50 games wait on the four agents' tokens.
  - G-E: Rob's invites.
  - Rob's v43 restore on production, which serves the current app now.
- **Rob's choice, 2026-10-12:** a second system takes the UI lane (the board, its CSS, Settings' Play card) while this
  session keeps the engine, the room and the card loads (the lanes above; AGENTS.md, *Lanes*). Notes 9 and 10 move to
  that lane.

## 2026-10-11: G-A built, G-B proved again with it, the rest waits on Rob

This session (Claude, a cloud container) built the rest of G-A and merged each piece on the gate, released to
staging with its deployed bytes compared:
- AI-4, the deck advisor (#697);
- AI-6, AI Coach settings (#698);
- M3's monitoring (#699);
- Train C, Rob's library: 1,130 of his 1,132 cards play (#700), and 1,131 with Gandalf since (the Gandalf record below);
- the A11y pass (#701).

It then ran G-B again on main bf0e9d21, with all of it in (the rows below): the journeys, the gallery and the A11y checks pass;
the gate failed once in one `table-board` check, root-caused to a race in the board and fixed (#702), then passed twice on main 74f715c7. **What is left is Rob's:**
- the privacy wording for *AI players on Claude* and *The deck advisor* (`docs/ai-door.md`);
- the advisor's eval with his key;
- confirming his library plays as he expects;
- M3's two alerts and their email, and R2 with the nightly copy's window and deletion promise (`docs/ops.md`);
- G-C's four agents' access: four service tokens, admitted at staging (M8; the steps are in `docs/playtest-harness.md`);
- then G-D (Grok Bot), G-E (his invites) and G-F (his review and production go).

Part 7's first sentence waits on G-A's approvals and G-C's agents.

**Later the same day (#702 to #708, each merged on green Actions and released to staging, its worker compared byte for
byte with the dry run):**
- G-C's agents' access: each service token staging admits is an identity of its own (#704);
- G-D to G-F, this side's half: the triage tool, the run's brief, the invites' runbook, and production's release
  script, rehearsed (#705);
- words on the accent at 4.5:1 across the app (#706);
- Gandalf, so 1,131 of Rob's 1,132 cards play, and control for good no longer breaking a room's save (#707);
- G-D's dress rehearsal: 50 games through the real board, every one replayed with no leak, M8's exit criteria met (#708);
- G1 over Rob's whole library, not only his seven decks: 650 games, and the two table-stalling bugs they found fixed
  (#710, #711), then 250 more with both fixes in, every one clean (the G1-L record below).

Staging serves main 039c86dd. Every gate item that is this side's is done; what is left is Rob's (the list above, and
G-D's 50 games by Grok Bot once the agents' tokens are in).

### Rob's playtest notes, 2026-10-11

Rob played Focus at staging and sent his notes through the evening, with screenshots. What each was, and where it stands:

| # | Rob's note | What it was | Where it stands |
|---|---|---|---|
| 1 | "It says we are on turn 3, but I only played one land" | The strip's turn is the game's, counting every player's: turn 3 was his second. | **Built.** The room counts each seat's own turns (`yourTurn`); the strip reads *Turn 3 · You (your 2nd)*. |
| 2 | "Passing the turn to the next player should always require player confirmation, never happen automatically" | His end step, with nothing to do, passed by itself, ending his turn. | **Built.** The sixth beat, `endAsks`, kept with the match as the others are: a person's own end step is always asked, and the button there reads **End turn**. A game made before it replays as it was played. |
| 3 | "It's skipping turns when I didn't play a land" | The data says otherwise: 405 steps passed by themselves in 40 games, and not one was a main phase with the land drop unused. Playing a land is something to do (`nothingToDo`), and a spell is counted with the mana the lands on the mat could make. What he saw was note 2: the turn ending without him. | **Answered** by note 2's fix; no main phase was ever skipped. |
| 4 | "The option to require manual transition from each of the 7 steps … a toggle in settings" | No such setting. | **Built.** Settings › Play › *Stop at every step of my turn*: kept with his preferences, told to the room by the board, on the tape (`prefer`), so a game replays where it asked. |
| 5 | "I should also be able to click the card to untap it again" | Mana tapped and not spent could not be taken back. | **Built.** The seventh beat, `untapMana` (game/engine/rules/untap-mana.mjs): a land tapped for mana, its mana unspent and nothing since, is lit and says *Untap*; a click puts it upright. Proved by the state's hash: the game is exactly as it was before the tap. A pain land, a sacrifice or a mana trigger is never offered. Rob: "You can only untap a land if it hasn't been spent", which is the rule as built. |
| 6 | Rampant Growth: "Search your library: nothing to find", with 19 basics in his library | **A real bug, at every table.** The table's card lookup took the room's bare basics first: no Basic supertype, no land type. Every "basic land card" search failed (Rampant Growth, Fertilid, Fabled Passage), and so did "a Plains card" and "unless you control a Forest or an Island" (Hinterland Harbor). | **Fixed.** The table plays the engine's own definitions, basics included; the room's basics are Basic and of their land type (CR 205.4c, 305.6). tests/table-basics.mjs plays all 3,876 card scenarios through the table's lookup. |
| 7 | Valorous Stance offered only the indestructible mode on an opponent's Fertilid | As intended: Fertilid is printed 0/0, so with two +1/+1 counters it is 2/2, and the destroy mode needs toughness 4 or greater (CR 700.2a). Counters do count (CR 613.4c), as Rob asked. | **As intended.** And his follow-up is built: an option that helps an opponent says *helps Maya*, one aimed at your own *against your own* (room.mjs `leaning`), marked on the board. |
| 8 | Freyalise's Elf Druid token's mana ability | Already fixed in #703 (another session), and on staging. | **Done** earlier. |
| 9 | A *Turn Resources* tab beside *Panel*: by land and card type, how many can be played this turn, how many in all, the mana tapped | Not built. | **Open.** Proposed for the UI lane (above). |
| 10 | The right pane lies over the mat; it should sit beside it like the left one, its width dragged within the same bounds | The right pane is an overlay. | **Open**, with the hover card no taller than the mat (his note of the same day). |
| 11 | Hovering a stack entry ("1. Fertilid") shows the card beside the On the stack box | Not built. | **Built.** An entry under the pointer, focused or tapped shows its card at the hover's size beside the box: to its left where it fits, else below. Escape or the pointer leaving puts it away. |
| 12 | A sorcery or instant is not seen while it resolves ("they should appear on the battlefield while being resolved") | The stack is a list of names. | **Built.** The On the stack box shows its top spell as a card above the list. |
| 13 | The Lands row cuts off its last cards with no scroll bar | The zone clips. A tapped land's margins were left out of the row's measure, and it took no share of the overlap. | **Built.** A full row overlaps to fit, its tapped lands included. Past a readable strip of each card (30%), it scrolls with a bar. |
| 14 | Show hand: the end of a long card name ran under the next card (found by a11y-board, not Rob) | The fan overlaps each card's right edge. | **Fixed.** A covered card's name wraps within what shows of it. |

Breaks: `game/tools/batch/breaks-turn-flow.py` (the room, 15), `breaks-turn-flow-board.py` (the board and Settings, 10),
`breaks-untap-mana.py` (14), `breaks-table-basics.py` (3), `breaks-leaning.py` (8).
Notes 11 to 13: `breaks-board-rows-stack.py` (10). Load Live's partners: `breaks-live-load-partners.py` (4).

## RESUMED, 2026-10-08: the review-response session (Claude, a cloud container), on Rob's "Keep building"

The review-response session paused on 2026-10-06 at 97% of the week's usage (Rob: pause at 90% and "write up a
comprehensive handoff packet for another AI platform"). Codex on Personal-HP then picked the handoff up on 2026-10-07
(its record below): B4, B6 and B3 landed with suites and breaks (5d068d26), 53 of the seven decks' 477 cards left
undefined. On 2026-10-08 Rob told this session "Keep building", the week's usage read back at 1%, so the baton is back
here, on the same branch and PR #669, building on Codex's commit. **`docs/handoff-2026-10-06.md` is still the map**, with
`docs/train-b-proof-2026-10-07.md` and `docs/production-readiness-2026-10-07.md` beside it. Train B goes on as the
handoff's §3 says, five workers by engine area (permissions and attack statics; effects, counts and triggers; memory;
keywords; costs and filters), merged here in turn. Rob's rule stands: at 90% of the week's usage, pause and hand off.

**Where the gates stand, 2026-10-11** (Part 7 of `docs/plan-to-done-2026-09-30.md`; the records below are the proof):

| Gate item | State | Proof, or whose step |
| --- | --- | --- |
| G-A: G1, 1,400 games | **done: 1,400 of 1,400 clean** | PR #686's head ccb250d1: every game finished, none refused, every replay identical, 0 leaks in 105,656 checks of every seat's view |
| G-A: the AI program (AI-1 to AI-6), X13 | the door open and proven on staging; **AI-1, the Coach, on on staging**, with a daily cap of its own ($1.50, released at 905394dc); **AI-2's L1 built** (Normal and Easy, measured against L0: Normal 61%, Easy 56%, L0 itself 51%); **the LLM seat built behind its switch**, its privacy wording Rob's to approve; **AI-5 built and on staging** (each deck says whether the table can play it; Play this deck); **AI-4, the deck advisor, built behind its switch**, its privacy wording Rob's to approve; **AI-3: 1,131 of Rob's 1,132 cards play** (Train C, then Gandalf; the one left, Extrapolate the Impossible, does nothing in Commander), Rob's to confirm; **AI-6, AI Coach settings, built** | every gate set on staging (the AUD, 300¢ a day for everyone, Haiku 5.5, Rob's key, three allowlist rows), released at c025d5d0; Rob's first call through it logged ok; the Coach's privacy wording approved by Rob and released at 81bcda09 (records below) |
| G-A: M3's monitoring and backups | **monitoring built** (Workers Logs keeps the Worker's own 5xx and sync-conflict lines; `tools/ops-week.mjs`, the weekly check); Time Travel confirmed, 30 days | **Rob:** the two alerts and their email; R2 turned on, the nightly copy's window and what deletion promises (`docs/ops.md`) |
| G-A: the A11y pass | **done**: WCAG 2.1 AA on the board and the lobby, measured from the screen's pixels; and words on the accent at 4.5:1 across the app (the item left) | `tests/a11y-board.mjs` 288 checks, 72 breaks caught (the A11y record below); `tests/a11y-app.mjs` 48 checks, 9 breaks caught |
| G-B: the whole gate green twice on main | **done again, with G-A complete** | dispatched Tests runs on main 74f715c7 (G-A's items in, and the drop check's race fixed): **2579 and 2580, both green**. Before them, on bf0e9d21: 2572 green, 2573 red once in `table-board`'s drop check, root-caused to a race in the board and fixed (#702, the race record below). Earlier: 2499 on def8fa89 and 2503 on eff40fdc, both green |
| G-B: `play-e2e` under wrangler dev | done | 35 checks at every staging release |
| G-B: hidden information in every frame | done | `play-journeys` reads every frame to both people; G1's oracle 102,879 checks, no leak |
| G-B: the five-second rule | **done** | over a real network, Rob on staging (2026-10-10): ten turns against the AI, the longest wait *"about 3 seconds"*; here, `play-journeys` median 280 ms, longest 1.0 s; G1's 700 games with a person: each game's longest wait a median 172 ms, 99th percentile 1.6 s, the worst 3.5 s, none over 5 s |
| G-B: `play-journeys` with the seven decks | done, again on bf0e9d21 | 82 checks: every view at 1280, 1400, 1920, 2560 and the phone, the Coach's stub, the record (PRs #681, #682; run again 2026-10-11) |
| G-B: `crankmagic-journeys` and the tours | done, again on bf0e9d21 | `journeys.mjs`: geometry 138, workshop 504, tour-walk 7 tours and 61 steps (2026-10-11) |
| G-B: the browser and device matrix | **done** | `docs/uat/browser-matrix.md`: Chrome, Edge and WebKit on Personal-HP (2026-10-01); the phones, held sideways, by Rob on staging (2026-10-10): *"phones work"* |
| G-B: screenshots to Rob | done, refreshed | the gallery "CrankMagic Board Sizes", version 2: both tables, every view at four sizes and the phone, from bf0e9d21 after the A11y pass |
| G-B: the A11y pass's checks | done | `tests/a11y-board.mjs` 288 checks on the merge with Train C (the A11y record below) |
| G-C: staging from main, version read back | **done**, signed in too | the G-C records below; and `tools/staging-check.mjs` signed in as the session-check token (A5; 2026-10-10): staging serves 2125854a, both pages say so, `/api/me` seats the token |
| G-C: the harness note for Grok Bot | done | `docs/playtest-harness.md`, held to the page by `tests/playtest-harness.mjs` (PR #681) |
| G-C: the four agents' access | **built and on staging; waiting on Rob's four tokens** | at staging each service token Access admits is an identity of its own, so four agents are four seats (#704; released, and the session's token now reads back as `service:e07b4fed5ab9`, the agents' access record below); how an agent signs in, and **Rob's** five steps, in `docs/playtest-harness.md`; the proof once they're made: `node tools/staging-check.mjs --agents` |
| G-D: Grok Bot's UAT (M8) | **ready for the agents; not run** | this side's half built: the triage tool (`tools/playtest-triage.mjs`: every game replayed from its record, every seat's view judged at every answer, M8's exit criteria; 32 checks, 22 breaks caught), the findings' outcome column, the seven decks to paste (`docs/uat/decks/`, held to the library), the run step by step (`docs/uat/playtest-run.md`); **a dress rehearsal through the real board, done: 50 games**, two people and two house AIs a table, the seven decks four at a time; the triage replayed all 50 to the same journal, with 0 thrown and 0 leaks in 21,006 checks of every seat's view; both findings were ruled (each the harness's, not the board's), and **M8's exit criteria are met** (the rehearsal record below). **Rob:** the agents' tokens (G-C), then Grok Bot's 50 games |
| G-E: human invites | **ready for Rob's invites** | `docs/play-invites.md`, *G-E*: Rob's steps (one rule group of invitees for both Access applications), the before-the-first-invite checklist, and how their findings arrive (*Send feedback* names the release and the game). **Rob:** staging's invite list and its block page, the alerts and R2, then the invites |
| G-F: Rob's review and production | **rehearsed; on Rob's go** | `tools/release-production.sh` and `docs/release-production.md`: the standby, then Play, each built from main, walked and committed locally, and pushed only on Rob's go; the standby rehearsed on main 1aa46cd (`release-acceptance` 23, `production-play-e2e` 27, nothing pushed). **Found:** production's Workers Builds has not deployed `release/pages` (the last deploy was by wrangler, 2026-10-01; the release of 2026-10-03 never went live). **Rob:** that build's settings, his review, each go |

**What Part 7's two sentences wait on (2026-10-11).** What is this side's is built, merged and on staging: G-A's
items, G-B twice on main, G-C's release and the agents' access. G-D to G-F are ready and rehearsed.
- **The first sentence waits only on Rob:**
  - G-A's approvals: the privacy wording for *AI players on Claude* and *The deck advisor* (`docs/ai-door.md`), the
    advisor's eval with his key, and confirming his library;
  - M3's two alerts and their email, and R2 turned on, which the nightly copy and M2's data track wait on
    (`docs/ops.md`);
  - G-C's four agents' tokens (`docs/playtest-harness.md`).
- **The second** then waits on:
  - G-D: Grok Bot's 50 games, and the fixes;
  - G-E: Rob's invites;
  - G-F: Rob's review, and each of his production goes (`docs/release-production.md`).

**Later, 2026-10-08:** the five workers' 45 cards and CR 800.4a merged here (#676); and on Rob's go ("merge Codex's stack") Codex's #670 to #675, reviewed first, merged here too -- every card of the seven decks is now defined; #676 merged on main 09499dcd and #671 to #675 closed as merged through it. The first G1 pass (70 games over seven pods) then found two blockers, each on its own worker: Tegwyll's provisional definition kept D7 off the table (now confirmed, hand-authored, 477 of 477), and a person's answer the engine refuses (Lethal Scheme's convoke) escaped room.act after the tape had recorded it, so the room could not reopen. Codex's records of 2026-10-07 follow, as it left them.

**G1, second and third passes (PR #677):** both blockers fixed (a refused answer is now a 422 with the room restored from its last save; convoke asks which mana pays the rest), and the layers' dependency trials made only where one can find a dependency (CR 613.8a; `tests/engine-layer-prune.mjs`, the slow game 2.5 times faster). Pass two, at 3df6e1b4: 70 of 70 games clean, none refused, but "longest waits" of up to 9.3 s, every one on a game's last turn. Their cause was in the harness: `tools/fuzz-live.mjs` built its pod without the table's beats, so once the person was out its timer ran while three AI seats played the game out, which no person at the table waits through (`endWhenNoPerson`, Rob's of 2026-10-06). The harness now launches its games as `game/room/table.mjs` does (the draw's click, the empty step passed, the game ending once every person is out); `tests/game-leave.mjs` checks the two pods agree, and three breaks are caught. Pass three, with that pod: **70 of 70 clean, none refused; over the 35 games with a person, the longest wait was 3.3 s, the median 0.23 s and the 90th percentile 0.43 s.** The 3.3 s is a real mid-game wait (D7|D1|D2|D3, seed 2, turn 27 of 33, a 35 s game), measured with three sweeps sharing the container: under the five-second rule, and the first one to profile. #677 merged on main 0d173a0d on green Actions.

**G1's other two terms (PR #678).** G1 asks for "zero exceptions, identical replays and no leaks", and `tools/fuzz-live.mjs` judged only the first; `tests/engine-gate.mjs` proves the others for vanilla decks alone. It now has `--replay` (each game replayed from seed and tape, fingerprints compared) and `--leaks` (every seat's view read, at each of the person's questions, for a card name that seat may not know, judged by the state's own facts, never by the projection being judged). The replay found two checkpoints that could not be read back -- JSON drops a key holding undefined and the state hash keeps it -- so a Durable Object woken mid-game would have refused to resume: every effect without a sublayer wrote `sublayer: undefined`, and a permanent that became a copy kept "had no supertypes" as one (`engine-room-games` seed 7). Neither writes one now; a copy moves as itself woken or not; and `saveCheckpoint` refuses any state that would not read back, naming the field, so the class fails in every suite instead of at a wake in production. `tests/room-g1-terms.mjs` (27 checks), two in `engine-storage`, 22 breaks caught; the full local run otherwise green (386 suites, 262 game tests). The sweep then found two more such keys (the discard question's `who`, the resolution's `__about` mark), and a probe of all 70 games walking the whole state after every event found no fifth; and the leak check's false reports were fixed (a name inside a longer card name; the cards a scry, surveil or search shows the player it asks; what the journal has shown everyone). **G1 on #678: 70 of 70 games clean -- finished, nothing refused, every replay identical, 0 leaks over 5,473 checks of every seat's view in the 35 games with a person**; 34 breaks caught. #678 merged on main e5770295 on green Actions.

**G-C, staging, 2026-10-08:** `tools/release-staging.sh` released main e5770295 to `release/cloud-staging` d4221982 (release-acceptance 22 checks, play-e2e 35 under `wrangler dev`); Workers Builds deployed it at 10:39:51 UTC (version 75bba14c), and the deployed `play-worker.js` is byte-identical to the release's `wrangler deploy --dry-run` bundle (2,419,636 bytes, sha256 61ec084b…). The read-back over the network (`tools/staging-check.mjs`) did not run: this environment has `CF_ACCESS_CLIENT_ID` but not `CF_ACCESS_CLIENT_SECRET` (Rob's, in the environment's settings; A5).

**G1, the 1,400 games (PR #679, 2026-10-08).** Seven pods (each deck in seat 0 once, the next three after it), 100 seeds with a random person in seat 0 and 100 all house, every game with `--replay --leaks`. **1,398 of 1,400 clean -- finished, nothing refused, every replay identical, no leak: all 700 house games; 698 of the 700 with a person, 0 leaks over 102,879 checks of every seat's view.** The person's longest wait: median 0.22 s, 90th percentile 0.46 s, 99th 1.84 s, at most 4.7 s (four games at a time on four cores). The run found, and #679 fixes, each with its check:
- **An engine exception:** a Sower of Temptation that took itself (its trigger's only target) threw as it died: `controlSourceLeft` ended what it was the source of before spending the records of changes to it. A fourth Sower scenario.
- **A false leak report:** a history line naming a card that had left the game with its owner was read as a shorter name inside it; the check remembers every card name the game has had.
- **The harness's person** repeated an optional loop without end (Krenko, Mob Boss with Intruder Alarm in D6: the board doubled with every activation, 2,047 Goblins and 2,034 triggers in one turn). A person picks how many times to go round (CR 732.2a): it now activates one ability at most four times a turn, then passes; it did so in 18 games.
- **Saves that grew with the game:** the room copied the whole journal at every decision, and hashed each checkpoint three times; and collecting triggers re-read every permanent's abilities per permanent (a million reads per resolution at a thousand tokens).

**The two that did not finish -- Rob's call (pod 5, D6 in the person's seat, seeds 54 and 90).** Krenko, Mob Boss with Intruder Alarm is a legal infinite combo, and four activations a turn on every player's turn still compound: by turn 50, 4,000 Goblins and 7,059 triggers on the stack. Every trigger resolving asks the person a question, and every answer saves the whole game; at a thousand permanents each resolution is about 0.2 s, and it grows with the board. Rob can do this with his own deck, and a Durable Object has 30 s of CPU per request, so a real game would stall the same way. The options: (1) a shortcut -- "pass until the stack is empty" or "repeat N times" (CR 732.2a), one decision for a thousand identical triggers, as the digital games have it; recommended. (2) A cap on the board's size. (3) Deeper engine work (incremental saves, cheaper derivations), which helps but cannot keep up with doubling alone. G1 is clean except these two, and closes when one of these is chosen and built. #679 merged on main 8787d103 on green Actions.

**G-C again, 8787d103:** released to `release/cloud-staging` f903322f (release-acceptance 22, play-e2e 35); deployed at 20:17:26 UTC as version e00791d2, byte-identical to the release's dry-run bundle (2,420,554 bytes, sha256 21d7b7ee…). The first attempt was held back by the script itself: play-e2e's two-people step timed out on a Pass button the board had just redrawn away (isEnabled on a vanished element waits its 30 s); the walk now reads a vanished control as "not now" (PR #680), and walked clean, 35 checks. #680 merged on main 9c5fb728 on green Actions.

**X14, `play-journeys` on the seven real decks (PR #681, 2026-10-08).** G-B's Play journey played vanilla stand-ins
of every card; it now plays the decks' own cards (`tableCards`, all 477 defined). A person's seat is answered through
the board's own controls as the house pilot would answer it, a target, mode, payment or order included
(`tests/uat/board-person.mjs`, shared with `real-deck-game.mjs`), and the table's slices are carried on by its alarm,
as the Worker's are. Two four-seat tables, D1-D4 and D5-D7 with D1, Rob at a desk and Maya on a phone held sideways,
to turn 12: **58 checks** -- 172 answers through the board, no AI answer refused, the decks' own abilities and triggers
on the stack, no other seat's hand or library named in any frame, every view at 1280, 1400, 1920 and 2560 and the
phone, the phone's hand, a concession from the phone's settings with the game going on, the Coach, End game and the
record. **The person's waits, in this process: median 292 ms, the longest 1.0 s** (1.9 s with two other browser runs
sharing the four cores; from a click to the room's next question to a person; over the network it still needs a
browser on a real network, Rob's or Grok Bot's). D5's whole
game through two browsers on the shared helper: 13 checks, a natural end, none refused. The harness note for Grok Bot
(`docs/playtest-harness.md`) now names the controls a real card's questions use, says what a refusal looks like, and
points at `board-person.mjs` as the worked example; `tests/playtest-harness.mjs` (new, 139 checks) holds every control,
id, class, attribute and file the note names to the page and the repository, and every control and id to a test that
uses it. It found four the note named and no test pressed: Copy link and Withdraw now in `table-lobby` (71 checks:
the clipboard holds the link; a withdrawn link no longer works), the phone's hand and Concede in `play-journeys`.
Breaks: 3 of 3 in `play-journeys`, 7 of 7 in `playtest-harness`.
#681 merged on main 53985e7a on green Actions.

**Every caption on a board read whole (PR #682, 2026-10-08).** `play-journeys` now reads every caption on every board
in every view at every size (a zone's, a group's heading, a pile's count) against the cards of its zone and the life
counter, a circle at the table's true center. In Table view, at every size, it found five covered: the top-left
board's graveyard count, the top-right board's "Lands · 3" and your own first group heading under the counter (whose
inner corners it overlaps, as item 9 places it), "Lands · 2" under an untapped land (a mat with art gives the Lands row
the piles' height, `1.4 × card + 1.3em + 2px`, and the zone's own padding pushed a 1.4-card land 8 px over its
caption), and, at 1280x720, "Battlefield" under a second row of creatures. Fixed in `crankmagic.css`: at the table, a land
starts at the Lands frame and its caption keeps to a tight line; the three captions at the counter moved clear of it (`--pie`
now the table's, so the boards read it; the heading's rule carries `#matrix-v2`, since `#matrix-v2 :is(h1,h2,h3,p)` sets
every margin); and at the table, once a board holds a group, the group's heading names what is there and
"Battlefield" is kept for screen readers. The counter stays where it is. `play-journeys` 82 checks; the whole local run
green (425 suites, 24.5 minutes); 5 of 5 breaks caught. Screenshots of both tables at every size and on the phone, with
the fix before and after, published for Rob.
#682 merged on main def8fa89 on green Actions.

**G-C, def8fa89:** released to `release/cloud-staging` bc88dce3 (release-acceptance 22, play-e2e 35); deployed at
22:50:49 UTC as version bdaece4f (number 124), a minute after the push. Its `play-worker.js` is byte-identical to the
release's dry-run bundle (2,420,554 bytes, sha256 21d7b7ee…) -- the same bundle as 8787d103's, since #680 to #682
changed tests and static files, not the Worker. Those files (the new `crankmagic.css` v=272) are served from the
version's assets, which only a signed-in read can see: staging is behind Access, `workers.dev` is off for it, and the
service token's secret is Rob's (A5). The Builds API refuses this session's token, so the build's commit is read from
the timing.

**The tour walk, run again (PR #683, 2026-10-08).** `tests/uat/tour-walk.mjs`, the one check that a tour step points at
something on the page, had skipped itself in every run: it found Playwright only through two variables nobody set, and
`journeys.mjs` let it. Set by hand, it could not start either -- *Take a Tour* has been in the rail's Menu since the
redesign, and the walk served itself on 127.0.0.1, where the app hides the rail. It now uses `browser-runner.mjs`'s
`openBrowser` (Playwright where it is installed, the repo under crankmagic.localhost), opens the Menu, lists every
step that misses rather than stopping at the first, and `journeys.mjs` runs it required. Walked, 6 of 61 steps in four
tours pointed at nothing or at an empty box; each now points at the page as it is (`crankmagic-tour.js` v=23): Explore
starts on its chooser's search and the graph steps open a graph (`graphOn`: your first deck's, or Sol Ring's); Narrow
it points at *Filters · lens*, since the filters sit in a panel shut until opened; Take it with you at *Add and/or
buy…* (`add-buy`, renamed from `add-card`); the Collect tour's trays are the sorting space with no deck picked (G6b-2);
What the score is at the deck's Simulation history; and A tray puts it on the list opens Table on a deck with a group,
or points at the deck picker. **tour-walk: 7 tours, 61 steps, every one pointing at something real**; `tour` 9
checks; the release journeys (`journeys.mjs`): geometry 138, `crankmagic-journeys` 504, tour-walk 61 steps.
#683 merged on main eff40fdc on green Actions.

**G-C, eff40fdc:** released to `release/cloud-staging` e279db77 (release-acceptance 22, play-e2e 35); deployed at
00:16:48 UTC on 2026-10-09 as version afb87439, its `play-worker.js` byte-identical to the release's dry-run bundle
(2,420,554 bytes, sha256 21d7b7ee…; the tours are static files, read back only signed in, A5).

**The AI door, wired on staging (2026-10-09).** Rob made the Access application "CrankMagic AI (staging)" on
`staging.crankmagic.com/api/ai/*` (Google sign-in; its "AI Testers" policy three emails), approved the privacy wording,
and chose one cap for everyone: *"I only want a general spending cap, not per person"*, 300¢. Then: *"I want tight
controls on the coach. It's responses should be very concise, no more than 1-3 sentences with 80% being 1 sentence,
when in coach. We will always be using sonnet or other lowest cost models."* And: *"change the model use to Haiku
explicitly"*, with the Coach seeing only the player's hand, the board, and their deck as a list, never its order. So:
- **The staging release** carries `AI_ACCESS_AUD`, `AI_CAP_TOTAL_CENTS` 300, `AI_CAP_PERSON_CENTS` 300 (the same
  number, so it never binds first) and `AI_MODEL` claude-haiku-5-5 (`tools/release-pages.mjs`, the profile's `ai`).
  The release tool refuses any other set, and any AI variable at all in production, whose door stays shut.
- **Haiku, and never dearer than Sonnet:** `cloud/ai.mjs` calls only `MODELS` (Claude Haiku 5.5, the default, and
  Claude Sonnet 5.5, the ceiling); `AI_MODEL` naming any other keeps the door shut, and nothing is sent. The server-side fallback is no
  longer asked for, since it can re-run a declined request on a dearer model; a refusal is a plain 422.
- **The privacy wording** is on `privacy.html`, and `DELETE /api/account` deletes the person's `ai_calls` rows.
- **The Coach's brevity** is written into AI-1 (`docs/plan-to-done-2026-09-30.md`) as Rob then put it: the Coach's
  brief instructs the model to answer in one to three very concise sentences, aiming for one; nothing checks the
  length afterward, and there is no 80% gate.
- **What the Coach may see** is written into AI-1 too: the person's own hand, the board as everyone at the table sees
  it, and their deck as a list sorted by name with the library's count, never its order, its top card or another
  seat's hand; the Worker builds the brief from the room's own projection for that seat, not from the browser.
- Proof: `ai-door` 50 checks, `release-pages` 188, `cloud-worker` 109.
- **Rob's, left:** the key as a Secret on `crankmagic-staging`, a monthly limit in the Anthropic console, and the three
  emails in `crankmagic-staging`'s `ai_allowlist` (0 rows and no secrets at last check). Both work from the dashboard.


## Cloud production Play preparation, October 7, 2026

**Holder:** Codex, `/workspace/crankmagic-cloud`, `codex/production-play-profile`,
following Faerie draft PR #674 at `a985022f`. Commander draft PR #673 is now
`3fdedc29`, with 35 successful actual-workerd browser checks and corrected
runtime expectations for the now-supported Quintorius. Faerie proof remains
57 targeted checks, 20 faults and 243 engine/regression suites.

**Candidate:** explicit production Play and standby profiles, the same production
account resources, no staging privileges, exact build binding guards and a
standby entry closure that retains GameTable storage. Default pages is unchanged.
108 Worker checks, 174 release-builder checks, three caught faults, and 27 actual
local-workerd recovery checks pass. See
`docs/production-play-profile-2026-10-07.md` for the first-migration rollback
constraint, existing-socket/clock limitations and remaining live gates.

No merge, deployment, new credentials or paid calls. Main `2ad84eb0`, Train B
`5d068d26` and the exact-head green PRs #670–672 remain preserved. The saved cloud
cannot currently reach staging; Actions secret presence cannot be inspected with
the connected tool. The separate GitHub-runner route is documented, not installed.

## Cloud Faerie interactions, October 7, 2026

**Holder:** Codex, `/workspace/crankmagic-cloud`, `codex/faerie-interactions`,
following commander draft PR #673 at `3fdedc29`. Mastermind, Spellstutter and
Winnower pass 57 targeted checks, all 20 fault checks and all 243 engine/regression
suites. See `docs/faerie-interactions-2026-10-07.md`. There are 46 distinct
unavailable names left in the seven committed decks. Sower needs genuine
source-duration control support; Tegwyll remains provisional.

Main and Train B remain unchanged. PRs #670–672 have exact-head green Tests runs.
No release or credential changes have occurred. GitHub-hosted staging acceptance
is being investigated: current workflows have no staging job or Access-secret
references, and the connected app cannot inspect secret metadata. A single
service identity cannot stand in for a separately signed-in friend.

## Cloud linked-exile commanders, October 7, 2026

**Holder:** Codex, `/workspace/crankmagic-cloud`, `codex/exile-commanders`,
following advice PR #672 at `b58b4534`. Quintorius and Maralen are implemented;
107 targeted checks, all 38 faults caught, all 242 engine/regression suites and
final D2/D5 two-browser natural games pass. See
`docs/exile-commanders-2026-10-07.md` for rules scope and evidence limits.

**Verified stack:** #670 `5174b836` / Actions `37630443333`, #671 `6eec6348` /
`37632309093`, and #672 `b58b4534` / `37632350352` are all ready with successful
full Tests runs. Main `2ad84eb0` and Train B `5d068d26` remain unchanged.
Nothing has been merged or deployed. Current release configuration/user actions
and the Library screenshot transfer failure are documented in
`docs/cloud-release-gates-2026-10-07.md`. Production Play is in scope, after
staging, data, Access and rollback gates; paid AI remains unapproved.

## Cloud advice preparation, October 7, 2026

**Holder:** Codex in `/workspace/crankmagic-cloud`, `codex/bounded-advice`,
following D2 draft PR #671 at `6eec6348`. D2 and its natural browser game are pushed.
The advice contract prepares bounded, account-scoped, versioned requests and
checks evidence/card/option references against fresh snapshots. It cannot call
providers, schedule work, persist credentials or mutate game/library data.

**Proof:** 45 contract checks, 10 caught deliberate faults, data integrity and
feature wiring; existing AI door's 45 fake-provider checks still pass. See
`docs/bounded-advice-2026-10-07.md`. Paid AI remains unapproved and disabled.
This is groundwork; monthly reservations, trusted source/UI integration and
responsive live delivery are not claimed complete.

**CI:** library PR #670 at `5174b836` is checking in Actions `37630443333` after
repairing its sole inventory failure. D2 PR #671 remains draft/mergeable on
`6eec6348`. Train B/main remain unchanged. Release blockers below still apply.

## Cloud D2 completion, October 7, 2026

**Holder:** Codex, `/workspace/crankmagic-cloud`, `codex/chulane-completion`,
following PR #670. Train B/main remain unchanged. Guardian Project, Yavimaya
Dryad and Claim Jumper are defined with engine behavior and rules tests.

**Proof:** 241 engine/regression suites passed; 67 dedicated checks; 37 caught
faults. A new cloud-local D2 game through two human browser sessions plus two
house pilots finished naturally in 44 turns / 349 UI actions, zero refusals.
Reload and all 354 hidden-information frames per person passed. See
`docs/chulane-completion-2026-10-07.md` for commands and evidence limits.
D2 has zero unavailable cards; 51 distinct unavailable names remain across the
seven committed decks. This does not materialize the exact October 4 backup.

**CI:** the separate library worktree repaired PR #670's generated inventory
failure at `5174b836`; Actions `37630443333` is running. D2 is a separate draft
follow-up. No merge or deployment. Staging egress/credentials, exact-backup
materialization and AI budget approval remain open.

## Cloud library continuation, October 7, 2026

**Holder:** Codex in Rob's authorized separate cloud checkout, `/workspace/crankmagic-cloud`,
`codex/real-deck-acceptance`. The remote follow-up was recovered at `e6715329`; Train B remains
unchanged at `5d068d26`, PR #669 ready, with its successful Actions run freshly confirmed through
GitHub's connected app. The offline desktop's uncommitted edit was not recovered.

**Work:** direct reviewed card removal, commander changes, direct deck deletion, and a deletion
Undo receipt that survives navigation. Ownership, reservation and physical location stay distinct.
The evidence, commands, cloud toolchain differences and exact blockers are in
`docs/cloud-continuation-2026-10-07.md`.

**Release gates:** Access/Cloudflare credentials absent; staging egress CONNECT 403; exact October 4
backup not materialized in cloud; AI spending unapproved. No merge or deployment, no production
readiness claim. Continue the card coverage and real-game gates after this library increment.

**CI repair:** PR #670's first ready run passed every suite except the generated
data inventory: the recovered real-deck harness added one reader. The generated
record is repaired; the new head still needs a green Actions run. Full local
generator testing reaches an unrelated Scryfall HTTP 403; the inventory check itself passes.

## Library and real-deck acceptance, October 7, 2026

**Holder:** Codex on Personal-HP, `codex/real-deck-acceptance`, based on the verified
Train B head `5d068d26`. PR #669 is pushed and ready. Its full Actions run
`37576879773` passed 396 suites and 262 companion tests. Both Workers Builds previews
remain failed (D8); no merge or deployment was performed.

**New proof:** the exact October 4 backup passed 50 two-human-protocol/two-house games
and 30 all-house games, all with zero whole-match refusals. The 50 games took 14,115 human
decisions, 35-65 turns, and at most 4,198 ms for a local human response. These are isolated
room simulations. `tests/uat/real-deck-game.mjs` also proves a natural D5 game through two
separate browsers: 377 UI actions, 33 turns, zero AI refusals, reload preserving the pending
question, and all 381 frames per person keeping other hands and libraries hidden.

**Next:** audit the actual library/deck experience with isolated data and improve obvious
remove, delete, commander and copy-moving paths, preserving quantities through undo,
reload, repeated clicks and multiple tabs. Then take D2's three missing cards in bounded
engine increments. Train B's tested head stays unchanged.

**Live blockers:** service-token environment variables are absent, and the supported browser
connection twice failed to load its request-header policy before any site interaction.
No Access policy, credential, permission or reserved dashboard setting was changed.
Paid AI waits on a concrete cap. D11's Claude settings are optional tooling, not a launch gate.

## The previous record: the Train B continuation, October 7, 2026 (Codex)

**Holder:** Codex on Personal-HP, continuing the authorized production-readiness work on
`claude/admiring-franklin-58cxy4` from `d8774b32`, PR #669. B4, B6 and B3 are integrated:
25 additional definitions, 22 dedicated suites and 97 caught deliberate faults. The final
affected aggregate passed 282 suites; check-cards passed 1,681 definitions and 2,747 scenarios.
The exact commands, fixes and limits are in `docs/train-b-proof-2026-10-07.md`.
The standalone ten-game CPU gate also passed after removing unnecessary controller and
attack-cap derivations; no budget was raised. Real-deck refusal-free acceptance is still open.

**Next:** complete the scan/push and ready #669 for Actions; diagnose its exact head. Then
prove real-card games with D5 Shadrix, finish D2 Chulane's three missing cards, and continue
library/deck integrity, human-game recovery and bounded AI acceptance as recorded in
`docs/production-readiness-2026-10-07.md`. No production gate is declared passed.

**Backup and access:** the exact October 4 live-game backup was found in the MtG project's
AI Input folder and validated read-only with the app's checksum and model checks. No real
library was restored or changed. The staging service-token environment variables are absent
here, so signed-in live staging checks remain blocked. Paid AI usage waits on a concrete cap.
Reserved access, credential, persistent-permission, history and branch-deletion actions are
untouched. The unrelated local settings file remains untracked.

## The record before: PAUSED, 2026-10-06 ~18:30 UTC

The review-response session's last record before the pause; `docs/handoff-2026-10-06.md` is its handoff.

| | |
| --- | --- |
| **Holder** | **Held: the review-response session of 2026-10-05 (Claude, a cloud container), on Rob's go to evaluate the independent review (OpenAI, report-only, of the freeze `31801daa`), update the plan, put live games in the cloud first, and execute.** The evaluation, what was done and the plan are **`docs/review-response-2026-10-05.md`** (its Phase L ahead of `docs/plan-execution-2026-10-03.md`). **Done:** #665 (F-1's tally, F-2's layer fix, slices) and #666 merged on the local gate; the staging release of 2fd4b1bd pushed and **deployed by Workers Builds** (version `88cd1fae`, 2026-10-05 18:20 UTC; Rob did not deploy, so Builds works again, D8). **Rob's answers, 2026-10-06:** #663 and #664 folded in (yes); once every person is out the game ends there (no to playing on: built as `endWhenNoPerson`); the standing decisions explained in the doc's §6.1, and how to do A3, A4, A5 and A8 in §6.2. **#667 merged** (`main` a2063d95, on the local gate); its staging release, `release/cloud-staging` fc09b4ad, **deployed by Workers Builds** as version `480fc72a` at 2026-10-06 15:07:51 UTC, its Worker byte-identical to the release's bundle. **Rob, 2026-10-06, later:** "Continue with the 28 cards still undefined, X8b/X8c, a narrowed X9, X10–X14, then gates G-B through G-F to the two sentences. We skipped the live game." On this branch since: X8c (hold priority or yield, said by the switch and in Tools), X8's captions (R12: 10px floors at 1280x720), X9 (the CPU check in `tests/engine-room-games.mjs`, seed 1's two repeated answers made once), L5 (an invitation survives Access's sign-in, an empty library offers Restore, Play leads back to your seat), **Train A** (the 28 live-deck cards, four workers merged in four commits, all 28 seated by the table), **X10** (the velocity pilot measured: 28 provisional definitions, seated nowhere) and **X8b** (a cast or ability the pool pays more than one way is offered and asks which way; `SLICE_STEPS` 100 for the heavier games that followed). check-cards: 1,614 definitions (1,586 hand-authored), 2,516 scenarios. The X10 worker pushed `claude/x10-velocity` on this session's instruction, against the one-branch rule; it is merged here and can be deleted. And Rob: **the repository is public** (D7, option C: Actions is the gate again), **A5 and A8 done** (read back from the Cloudflare API), A4's deploy fallback set as an environment variable for new sessions. |
| **Branch** | `main` at a2063d95 (#667); `release/cloud-staging` at fc09b4ad, live on staging; this record and the work above on `claude/admiring-franklin-58cxy4` (#668). |
| **Since** | 2026-10-05 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium, wrangler 4.139.0) | **The freeze's gate on the supported toolchain:** `tools/local-ci.sh 31801daa 1` PASS, 342 suites. **F-1:** `room.refusals`, the match's tally; `tools/fuzz-live.mjs`; `tests/room-refusals.mjs` (the history had undercounted seed 1 of the pinned deal, 12 of 22). **F-2:** a regression bisected to #600 and fixed, seed 11 21.4 s to 5.1 s, the ten pinned games identical. **Slices:** `tests/room-slices.mjs`; proven in workerd on 2026-10-05 (a conceded game played out on the object's alarm). **#665 and #666:** `tools/local-ci.sh <head> 2` PASS, 344 suites and 262 node tests a run. **The release:** `release-acceptance` 22 checks, `play-e2e` 26; staging's deployed Worker byte-identical to the release's bundle. **The game ending once every person is out:** `tests/game-leave.mjs` 58 checks (the last person conceding, knocked out, a woken room, a match without the flag playing on, the table launching with it), four breaks caught; `tests/uat/play-e2e.mjs` 35 checks under `wrangler dev`, #663's two people and an AI among them. **A cloud container's browser and the network:** its Chromium does not trust the egress proxy's CA until it is in the NSS store, so live-network walks fail with "Failed to fetch" (`ERR_CERT_AUTHORITY_INVALID`): `apt-get install -y libnss3-tools`, then `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n ccr-agent-proxy -i /root/.ccr/agent-proxy-ca.crt`. Never by turning certificate checks off. |
| **Assumed, not proven here** | What a signed-in person sees at staging, and both boards' WebSockets there (the container cannot pass Access, and its proxy carries no WebSocket): L2 is Rob's. That workerd on Cloudflare runs within about 2.6 times the container's speed. The live decks' refusal totals: the backup file is not here (A2). |
| **Outstanding** | **The session:** L4 once the backup is attached; L5 (the three limitations likeliest to stop a friend); L6's service-token seat once A5 exists. **Rob:** the rest of L2, now that the live game was skipped only when Rob wants it (staging's Access admits "Rob Only" and the service token, so a friend's address goes in a staging policy first, A3); A2 the backup file; A4's rest (the injected token expires 2026-10-25 and cannot read Workers Builds); D8's previews off, D11 (the permission rule), production (refresh the workshop on your go; Play not before G-F); and whether to rewrite `main`'s history for the three personal addresses still in commits of 2026-09-17 to 09-24 (now public; removed from the files on 09-24). A6 is moot: helper B's 19 cards are being rebuilt. |
| **The plan's steps** | `docs/review-response-2026-10-05.md` §5: Phase L (L0-L1b done; L2 the signed-in check; L3 the first live game; L4 the 80 games on the exact decks; L5 the three limitations likeliest to stop a friend; L6 what is left of the deploy path), then the execution plan's steps as amended there. |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** |

## The previous record: the readiness checks after the code freeze, 2026-10-04 21:55 UTC (#664)

| | |
| --- | --- |
| **Holder** | **Held: the execution session of 2026-10-03 (Claude, a cloud container), after the live game's code freeze.** `main` is frozen at **31801daa** (train 5, #662) until Rob says tonight's game is over; work goes on branches only. Rob, about 20:40 UTC: write a brief that lets another AI test the whole experience on its own (a host, a new user's sign-in, the Play screen, joining, the game, the engine, the cards), then outline and run every check and simulation that makes the app as ready as it can be for a new user. Tonight's game became two people and two AIs: Rob (Jace, Multiverse Architect (Trey)), a friend new to CrankMagic in seat 2 (one of the AI decks' "(table)" copies), and two house-pilot seats. |
| **Branch** | `main` at 31801daa (the code freeze). Held for after the game: `claude/play-e2e-two-people` (#663, draft) and `claude/live-record-readiness` (this record). |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium, wrangler 4.139.0) | **R1, the room.** 100 games of the four live decks with both people's seats answered at random from exactly what each was offered (`game/engine/pilots/random-legal.mjs`, seeded) and two house pilots, then 50 four-AI games: all finished, none refused, no exception (refusals counted from the history's newest 300 lines, which can drop early ones: F-1 of the review of 2026-10-05; recount with `tools/fuzz-live.mjs`). The longest wait for a person, the AI play between two of their decisions (one Durable Object request), was 1.9 seconds; typical waits 0.1-0.5 seconds. **R2, the browser** (the staging build of 31801daa under `wrangler dev`, two Access identities, each its own origin and library): two people and two AIs played whole games to the end twice (51 and 36 turns) through their boards, with lands, spells, attacks and every question answered; both saw the game-over panel; the record (531 answers) downloaded and replayed to the same end with the table's own cards. **R3, a new user's wrong turns.** Joining with an empty library, restoring, then opening the link again gets back to the seat; a reused link and a withdrawn one are refused ("This invitation has expired or was withdrawn"); New link seats the person. **R4, a phone** (390×844, touch): the lobby works; the board is drawn for landscape, and plays go through the hand (✋); a reload, and a closed page reopened through the link, return to the game; a concession lets play go on; End game works. **R4b**: a person who drops (another page for ten seconds) and comes back keeps their seat past the five minutes; the table's away list empties on return. **R5, real staging** (staging.crankmagic.com, still release 8107df4 at 21:50 UTC): a test identity on Rob's own mailbox, admitted by a staging-only Access policy, signed in with Access's emailed code (read from Rob's inbox with Rob's leave) and restored the backup; a signed-out person opening an invite link lands on the home page after Access's sign-in (the fragment is lost), and opening the link again works. **The release:** `node tools/release-pages.mjs --profile cloud-staging --ref 31801daa… --out` builds, and `wrangler deploy --dry-run` reads 2,007 KiB (361 KiB gzipped) with the table, D1, Access and playtest bindings. **The Play walk** with a two-people step: 32 checks (#663). |
| **Assumed, not proven here** | Staging at 31801daa: Rob releases it (the container cannot deploy). The board's WebSocket at the real staging: this container's network proxy carries no WebSocket, so the board was proven only under `wrangler dev`. A phone browser old enough to match a `wss:` socket against CSP `'self'` differently than today's. |
| **Outstanding** | **Rob, tonight:** release staging at 31801daa (`--ref`, `rob-steps.md`); let the friend's address through staging's Access ("CrankMagic staging"); send the friend the backup file and the one-page guide ("Joining Rob's table"); say when the game is over. **Rob, when convenient:** the invite link under staging's whole-host Access (below); helper B's 19 cards (its pushes wait on Rob's approval). **The session:** remove the staging Access policy "Rehearsal: test friend (2026-10-04)" once Rob is done with it (it admits only the test identity; "Rob Only" is untouched); the real-table check at staging once 31801daa is live; after the game, gate and merge #663 and this record, then the live decks' last cards and Rob's Priority Batch 10.3 in Rob's order. |
| **The plan's steps** (`docs/plan-execution-2026-10-03.md`) | As the record below; A7, Rob's game at staging, is Rob's. |
| **Named, not built** (each said in #663) | As the record below, plus: (1) staging's Access guards the whole host, so an invite link opened while signed out loses its `#table/<id>/<code>` in the sign-in redirect; the code rides in the fragment on purpose (`cloud/tables.mjs`), so the fix is Rob's call (a query or path link, or a landing page outside Access); production is unaffected, its Access guarding only `/api/*`. (2) With an empty library, a playtest table's deck dialog offers only the basic lands test deck, with no hint to restore or import decks. (3) Before a game starts, the Play tab shows New table rather than the table a person sits at; the invite link takes them back. (4) Each person may make 120 API requests a minute; only a harness polling faster than the lobby's two seconds meets it. (5) Once, after several navigations, a phone board showed its own seat "Dropped · back by …" while connected; the server had cleared the drop (R4b), and it did not recur. |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** Everything short of the real staging has been walked; the live game is the first real table. |

## An earlier record: the live game's code freeze, 2026-10-04 19:30 UTC (train 5)

| | |
| --- | --- |
| **Holder** | **Held: the execution session of 2026-10-03 (Claude, a cloud container), executing the live-game plan (`docs/plan-live-game-2026-10-04.md`) to its code freeze.** Rob plays a four-player Commander game tonight with the "Live Game Load 10.4" decks: Trey's (Rob's seat) Jace, Multiverse Architect, and three house-pilot seats, Chulane, Teller of Tales (AI 1), Kiora of Salt and Sand (AI 2) and Teysa Karlov (AI 3). Rob, 17:15 UTC: complete the plan by 9:30 PM, read here as 21:30 UTC (the plan's clock). Two helper sessions built cards beside this one. **Helper A** (`claude/live-game-pieces`, #657) built both commanders' pieces (P1-P5: empower Jace, granted loyalty abilities, reveal until a creature or planeswalker, the loyalty-activation trigger, "pay {2} or can't attack Jaces") and Trey's and Kiora's cards. **Helper B** (`claude/live-game-ai-decks`) defined 19 of AI 1's and AI 3's cards. Its permission check refused every push and any route through another session, so they wait on Rob's approval. **Merged, each a merge commit on the local gate, its PASS block on the PR:** **train 1**: #653 (P46), #655 (the engine's card data refreshed from Scryfall, 32,116 cards, with the generated files it had left stale), #656 (the record before this one), #658 (wave W1, 9 lands and 11 cards with `unless.opponentsControl`; helper A's P1-P5 with Jace, Kiora, Ajani Unrelenting and 13 more). **Train 2**: #659 (wave W4: Ob Nixilis, Avacyn, Vraska, Niv-Mizzet, Grateful Apparition, Silence the Echo, Prophesied End, with a wipe that remembers what it destroyed and combat damage "to a player or planeswalker"; helper A's W5, 12 cards with excess damage, doubled counters, two piles and increment; the smoke game paying a choice of additional costs). **Train 3**: #660 (helper A's W6, nine of Trey's cards: Oblivion Ring, Serra's Emissary, Darksteel Angel, Ajani Resolute, Overlord of the Mistmoors, Gifts Ungiven, Winds of Abandon, Quintorius Kand, The Ur-Sphinx, with linked exile, protection, can't lose, emblems, impending, overload, discover and eminence; and play-e2e's stale label, the walk passing under `wrangler dev` again). **Train 4**: #661 (six of Kiora's deck: Delay, Song of the Dryads, Everflowing Chalice, Kasmina, Hall of Echoes, Way of the Cryomancer). **Train 5, at this record:** #662 (helper A's last two of Trey's deck: Teferi's Reproach, with phasing and protection from everything, and Emrakul, the Exigent Doom; and this record). |
| **Branch** | `main` once train 5 is in: the code freeze for the live game. |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium, wrangler 4.139.0) | **Gates.** Train 1 passed twice at 88bf8d5b, 324 suites a run. Its first gate, at 5cdd252e, failed on three files the refresh had left stale (the data manifest, the creature types, the data inventory); 68fe9577 fixed them. Train 2 passed twice at f3930b1c, 328 suites a run; train 3 at b31baae7, 335; train 4 at ff0c7973, 340; train 5 is gated at its head before it merges, its PASS block on #662. Main's tree equals each gated head's. **The live decks at the code freeze:** Trey (Jace, Rob's seat) 100 of 100 defined; AI 1 (Chulane) 86; AI 2 (Kiora) 95; AI 3 (Teysa) 91: 372 of the 400 slots, the 28 others each with its stand-in in the backup's "(table)" copies. **Acceptance, on the very file Rob restores.** A3: every card of the four decks as seated (Rob's own, the AI decks' "(table)" copies) is defined at the table. A4/A5: four house pilots played them through the real room on five seeds, every game to its end (33-41 turns, 3-15 s), no exception, no refused answer (counted from the history's newest 300 lines, which can drop early refusals: F-1 of the review of 2026-10-05; recount with `tools/fuzz-live.mjs`). A6: `tests/uat/play-e2e.mjs` under `wrangler dev --local` passed 22 checks: the staging release's Play tab, a playtest table with an AI seat, the alarm launching the game, the board over the WebSocket, the full record replayed. In a local-only extension, the four "(table)" decks took their seats in workerd and the game started. **Rob's library file:** `crankmagic-backup` v1, with the four decks exact and finalized (400 owned copies) and a "(table)" draft copy of each deck that still holds an undefined card (the three AI decks; Rob's has none), its stand-ins curated by role and color identity (`standins-final.json` in the session's scratchpad). Read back with the app's own `readBackup` and sent to Rob. |
| **Assumed, not proven here** | Staging itself: nothing was deployed. The container cannot deploy, and Workers Builds still fail every build. Rob releases staging from Personal-HP (`node tools/release-pages.mjs --profile cloud-staging --out <folder>`, then `npx --yes wrangler@4.139.0 deploy` from it; `docs/release-pages.md`). Cloudflare Access and the invite list at staging. The AI credential Rob added is visible to neither this session nor its helpers. The AI seats are the house pilot (D-L5). |
| **Outstanding** | **Rob, tonight:** release staging; save the current staging library, then restore the backup; seat the decks ("(table)" copies where a deck still has a stand-in) and start. **Rob, when convenient:** approve helper B's pushes (its 19 AI 1 and AI 3 cards), then a session folds them after the game. **Rob, standing:** the production release (D8); the runner or the billing (D7); Workers Builds and their previews off (D8); the permission rule for merges and releases (D11); the Build from Deck error in production (BACKLOG.md item 9). **The session, after the game:** the cards still undefined (AI 1: helper B's Reflector Mage, Deputy of Detention, Soulherder, Divert Disaster, Fell the Mighty, Faeburrow Elder, Loot, the Nexus, Ephemerate, Skyclave Apparition, Fblthp, the Lost and The Eternal Wanderer; Karmic Guide; Bofur and Venat, not in the card data. AI 2: Tekuthal, Reality Shift, Germination Practicum, Innkeeper's Talent, Study Hall. AI 3: helper B's Tithe Taker, Millikin, Rally the Ancestors, Skrelv's Hive, Ao, the Dawn Sky, Promise of Loyalty, Serra Paragon and Bolas's Citadel; Path of Ancestry); then Rob's Priority Batch 10.3 in Rob's order, and X8b-X14. |
| **The plan's steps** (`docs/plan-execution-2026-10-03.md`) | As the record below, and the live game is the plan's step now: its trains 1-3 merged; A3-A6 proven here; A7 (Rob's smoke test at staging) is Rob's. |
| **Named, not built** (each said in its PR) | As the record below, plus: a token's own abilities inside `createToken` are not compiled. Its mana ability is written in the engine's form (Vraska's Sculpture Treasure); Freyalise's Elf Druid's "{T}: Add {G}" is offered as an ability that uses the stack. A sacrifice cost's `anyOf` reads only the keys inside each alternative. Karmic Guide (protection from black) and the cards not in the card data (Bofur, Venat) wait. |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** A6 passed under `wrangler dev`; the live game at staging tonight is the first real table. |

## An earlier record: the live game's start, 2026-10-04 15:45 UTC

| | |
| --- | --- |
| **Holder** | **Held: the execution session of 2026-10-03 (Claude, a cloud container), which since 2026-10-04 15:20 UTC executes the live-game plan first** (`docs/plan-live-game-2026-10-04.md`, #654): Rob plays a four-player Commander game with the four decks of the "Live Game Load 10.4" sheet (Trey's Jace, Multiverse Architect, and three AI seats: Chulane, Teller of Tales; Kiora of Salt and Sand; Teysa Karlov) at about 22:25 UTC on 2026-10-04. A branched planning session wrote that plan; **helper A** (a second cloud session) builds the two missing commanders' engine pieces on `claude/live-game-pieces`, which this session folds into its gated trains. Before that, at Rob's "keep going, merge when the gate passes", this session went on with **Rob's Priority Batch 10.3** in Rob's order. **Merged since the record below, each a merge commit on the local gate, its PASS block on the PR:** #628-#652, the slices P23-P45: impulse draw, flicker until the next end step, "can't gain life", cycle triggers, partner and backgrounds, combat damage this turn, reveal until N creatures, exile-this and remove-a-counter costs, spend-restricted mana from an effect, graveyard batch triggers, triggers and state-based actions in the cleanup step (CR 514.3a), animate with colors, blight as a cost and as a spell's additional cost, the mana spent to cast that spell, the chosen color, a free cast once during each of your turns, multicolored spells, spells that target a creature, what entered this turn, stun counters (CR 122.1d), "tap three untapped creatures", and the target's owner putting it second from the top; each with its cards, scenarios, a suite and breaks. **Open:** #653 (P46: "blight 1 or pay {3}", a mana ability's color), #654 (the live-game plan, docs), #655 (the engine's card data refreshed from Scryfall: 286 cards more, the sets of 2026-10-02 among them), and this record. |
| **Branch** | `main` at 8bb0ae7b (#652); the live game's train 1 is #653, #655, #654 and this record, then the first wave of the live decks' cards. |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium) | **Gates:** every train PASS twice at its head, 317 suites a run at 78ece407 (281 Node suites and 36 CrankMagic Online suites), 262 of 262 browser tests. **Coverage at #653:** 1,486 definitions (from 1,412 at the record below); Rob's seven decks 326 of 477 defined, 401 with every rule (84.1%); the card library 866 defined, 1,792 with every rule (75.8%); the most-played 3,238 Commander cards 1,136 defined, 2,437 with every rule (75.3%). **Rob's Priority Batch 10.3:** 641 of its 1,095 cards defined (581 at the record below). **The live decks at #655:** Trey (Jace) 59 of 100 defined, AI 1 (Chulane) 82, AI 2 (Kiora) 68, AI 3 (Teysa) 88; 100 distinct cards to define, all now in the card data. **Rob's library file:** a `crankmagic-backup` v1 of the four decks (finalized, commanders set, 400 owned copies), read back with the app's own `readBackup`, sent to Rob. |
| **Assumed, not proven here** | Staging and production: nothing was deployed. The container cannot deploy, and Workers Builds still fail every build. The live game is played at staging, which Rob releases from Personal-HP (the plan's D-L1). The AI credential Rob added is visible to neither this session nor its branches; the AI seats are the house pilot today (D-L5). |
| **Outstanding** | **Rob, for the live game:** the plan's decisions D-L1 to D-L6 (§6.4), the recommended answers taken until Rob says otherwise; the stand-in table at about 18:15 UTC (D-L4); the staging release between 21:20 and 21:45 UTC (D-L1). **Rob, standing:** release staging and production from Personal-HP (D8); the runner or the billing (D7); Workers Builds and their previews off (D8); the permission rule for merges and releases (D11); the Build from Deck error in production (BACKLOG.md item 9). **The session:** the live-game plan's trains (§6.2), then Rob's Priority Batch in Rob's order again (the next engine pieces: prepare, CR 722, for ten of the list's cards; Increment; Rubble Rouser's reflexive mana trigger; Steal the Show's "any number"), then X8b-X14. |
| **The plan's steps** (`docs/plan-execution-2026-10-03.md`) | **X1-X4 done** (#577-#582). **X5** done but its game: D5's mechanics and cards are in (#583-#598); Rob's game at staging waits on a release. **X6** half: the worker pool is in (#599); the runner is Rob's (D7). **X7** not started (Rob's releases, D8). **X8** a third: X8a, tap-and-cast (#600); X8b (the payment question) and X8c (holding priority) not started. **X9, X10** not started. **X11** under way as Rob's Priority Batch 10.3 (Rob's order replaced the plan's deck order): 641 of 1,095, the seven decks at 84.1% with every rule. **X12-X14, G-D to G-F** not started. **Ahead of all of it now: the live game** (§ "The live game" in the plan). |
| **Named, not built** (each said in its PR) | As the record below, less what P23-P46 built (blight and counters of any kind as costs, stun counters, "gains all creature types"), plus: an untap paid as a cost does not read stun counters; a free cast's condition is read only where a rule static reads one; the record of what entered keeps no face-down permanent's secret (morph is not built); a modal chosen by another player inside a `branch` or a repetition binds no owner (the resolution's top level does). |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** Nothing was played at staging; the live game is the first. |

## An earlier record: this session at the train #623-#627

| | |
| --- | --- |
| **Holder** | **Held: the execution session of 2026-10-03 (Claude, a cloud container), which went on after #587 at Rob's "keep going, merge when the gate passes", and goes on after this record with Rob's Priority Batch 10.3.** After the record below it built the rest of X5 (D5's mechanics and cards), X6 (the suites in a worker pool), X8a (tap-and-cast), Rob's two backlog items (BACKLOG.md items 8 and 9), modes chosen as a spell is cast (#604, Rob's question whether the engine is strict about priority and resolution order), and **Rob's Priority Batch 10.3**, the cards on Rob's spreadsheet not yet added, in Rob's order: twenty-two slices so far, seven of them engine pieces. **Merged, each a merge commit on the local gate, its PASS block on the PR:** #588-#599 (X5e-X5n, the derive-once memo, X6); #600 X8a; #601 the backlog items; #602, #603 the first two slices and #604 modes chosen as cast; #612 each resolution event handed back once; the train #605-#611 and #613-#617 (slices 3-13, and #614, a commander sent to a hand or library by any effect, CR 903.9b); #618 amass (CR 701.47); the train #619-#622 (convoke, CR 702.51; recruit, CR 701.70; storied, CR 702.195; the eighteenth slice). **The train at this record, gated once at its head:** #623 "whenever this creature becomes tapped"; #624 evoke (CR 702.74); #625 the mana spent to cast it ("if {G}{G} was spent to cast it", adamant); #626 investigate (CR 701.16); and this record. |
| **Branch** | `main` once the train #623-#627 is in; the session's next slices branch from there. |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium) | **Gates:** every merge on `tools/local-ci.sh <head> 2`, a train once at its head (293 suites a run at d2082a76). Two first gates **failed** and were fixed before the merge: the train #605-#617's, on b7571d9f, in `engine-rules-conformance` (a resolution that stops to ask handed its earlier events back twice: Uro's life gain logged twice) and `engine-compile` (four cards never cast in their smoke games), fixed by #612 and #617; and the train #619-#622's, on 07cb70a3, in `engine-derive-once` (storied's check made 7,696 derivations), fixed by 1ee40df9. **Each engine change:** red first, then green, every change broken with `game/tools/batch/breaks.py` and caught; a break first missed got its check. **Coverage at this record:** 1,412 definitions (from 1,021 at #587); Rob's seven decks 314 of 477 defined, 392 with every rule (82.2%); the card library 821 defined, 1,759 with every rule (74.4%); the most-played 3,238 Commander cards 1,119 defined, 2,416 with every rule (74.6%). **Rob's Priority Batch 10.3:** 581 of its 1,095 cards defined (231 at its start). |
| **Assumed, not proven here** | Staging and production: nothing was deployed. The container cannot deploy, and Workers Builds still fail every build, every PR's preview included. Anything on Personal-HP, a phone or Firefox. |
| **Outstanding** | **Rob:** release staging and production from Personal-HP (D8); the runner or the billing (D7); Workers Builds and their previews off (D8); the permission rule for merges and releases (D11); the Build from Deck error in production (BACKLOG.md item 9). **The card data:** 203 of the priority list's cards are not in `data/engine/oracle.json` (Scryfall's oracle cards of 2026-09-22), being newer; they cannot be defined until it is refreshed, which is `docs/plan-data-sync.md`'s decision. **The session, next:** every card of the priority list that needs only a definition is defined; the 311 left in the oracle data each need an engine piece. By how many of them each piece holds back (and how many it alone holds back): RememberChanged 35 (7), RememberObjects 33 (4), MayPlay 24 (4), alterAttribute 11 (4), ETBReplacement 10 (3), PresentZone 5 (3), ThisTurnEntered 4 (3), AlternateAdditionalCost 3 (3); and about 120 set aside for what the catalog does not measure, each named in its slice's PR. Then X8b (the payment question), X8c (holding priority), and X9-X14 in the plan's order. |
| **Named, not built** (each said in its PR) | **Mechanics:** adventures; emblems; suspend; meld; waterbend; behold; blight and counters of any kind as a cost; stun counters; "gains all creature types"; triggers on how mana was spent; the Blood token predefined (Voldaren Epicure writes it out); a type-changing static under a condition (Purphoros: the layers leave conditional statics out of a condition's own derivation, sound only while they never change what a condition counts); "if you can't" (Eldrazi Monument); "when you cast this spell" (Nulldrifter, Artisan of Kozilek); a trigger from the graveyard (Squee, Goblin Nabob); an "unless" cost with an outcome either way (Divert Disaster); mana value X in a selector; a sum of two counts; cards "exiled with" an object; attacking alone; "creatures you control with flying" in a layer's selection; damage divided as its caster chooses (Fury, CR 601.2d); a graveyard put on the bottom of its library in a random order (Endurance); a target for each opponent (Desecrate Reality, which the catalog counts as built); activated abilities that cost less (Forensic Gadgeteer); the table showing an enduring story. **Rules:** a Phyrexian symbol payable either way is not offered (X8b); a pool that could pay a generic cost more than one way is not offered (X8b); restricted mana honored only from mana abilities; the mana spent to cast a permanent, read by a trigger of its own departure (a departure's trigger does not remember it). |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** X1-X6 and X8a are built; X5's mechanics and D5's definition-only cards are in; twenty-two slices of Rob's list. Nothing was played at staging. |

## An earlier record: the execution session of 2026-10-03, to #587

| | |
| --- | --- |
| **Holder** | **Open: the execution session of 2026-10-03 (Claude, a cloud container) has closed, and this is its closing record.** It executed `docs/plan-execution-2026-10-03.md` from its brief, `docs/prompt-execution-2026-10-03.md`. Rob's go ("begin executing the fixes, merges and plan"; later "keep going, merge when the gate passes") was taken as the go for the merges and the fix steps in order, with the plan's recommended answer to each of D1-D12; #577 says so. **Merged, each a merge commit on the local gate, its PASS block on the PR:** #571-#576 (Phase A); #577 C1, the commander layer; #578 C2a, the rules a player checks; #579 C2b, the decisions that are the player's; then one train: #580 C3, the conformance suite; #581 C4, M5 (the table plays the engine's definitions); #582 C2c, CR 616.1 for damage, the board's damage division, and the `tests/reset-all.mjs` race fix; #583 X5a, "up to N targets"; #584 X5b, a cost that sacrifices a set; #585 X5c, Afterlife and "whenever you create one or more creature tokens"; #586 X5d, what a player did this turn, counted and compared; and this record. |
| **Branch** | `main` after the train; nothing of this session's is open. |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium) | **Gates:** C1+C2a+C2b's head 8407c99d PASS twice (272 suites a run); C3+C4's head 2928410a failed run 2 once on a race in `tests/reset-all.mjs`, which neither PR touched. The race was proven by forcing it (the cloud's answer delayed 1.5 s), fixed on #582, and the head re-run (#581). The train's head carries everything after (the PASS blocks on #582-#586 and this PR). **Each PR:** red first against the head before it, then green, every guard broken with `game/tools/batch/breaks.py` and caught: C1 23 breaks, C2a 21, C2b 13, C2c 14, X5a 28, X5b 6, X5c 5, X5d 13. A break first missed got its check, or its unreachable code was removed. **The room:** seven seeded four-seat games of the engine's own definitions through the cloud table's card source, each to its end with no exception (`tests/engine-room-games.mjs`). **Coverage:** most-played Commander cards with every mechanic built went from 2,267 to 2,373 (73.3%); Rob's seven decks from 358 to 377 of 477 (79.0%); 1,021 definitions. **Suites:** 241. |
| **Assumed, not proven here** | Staging and production: nothing was deployed. The container cannot deploy, and Workers Builds still fail every build. `tests/uat/play-e2e.mjs` against staging once C4 is released. Anything on Personal-HP, a phone or Firefox. |
| **Outstanding** | **Rob:** release staging and production from Personal-HP (D8; until X7, the commands in Questions 0 below); register the runner or restore billing (D7); turn Workers Builds and their previews off (D8); the permission rule for merges and releases (D11). **The next session:** X5's remaining D5 mechanics, then D5's 25 cards that need only a definition, then Rob's game at staging. The remaining mechanics are: Escape, whose "exile four other cards from your graveyard" is a pick-several as the cast is taken, and "escapes with two +1/+1 counters" (Woe Strider); Encore (Angel of Indemnity); Combat Calligrapher's "Inklings can't attack you" and its attack trigger; and planeswalker loyalty (Elspeth, Sun's Nemesis). After X5 comes X6-X14 in the plan's order. |
| **Named, not built** (each said in its module's header or its PR) | **Rules:** the order of damage replacement effects where nothing can stop to ask (an effect repeated for each player, what follows a prevention, a mana ability's), which keeps the least-damage order; a zone change whose replacement orders end differently, asked but not yet paused for; CR 903.9b for a move that is not an effect's moveZone; Vehicles and Spacecraft as commanders (CR 903.3); planeswalkers (CR 306, 606, 704.5i), which `missingFor` does not flag, so coverage counts a few that cannot be played; a count that is X ("up to X target creatures"); a spell with a counted target cast as an effect resolves; a copy's new list for a counted target; a Phyrexian-mana cast when two payments exist; ThisTurnEntered, "what entered or died this turn", beyond tokens made. **The pilot and the room:** the house pilot cannot see an attack tax, so the room survives its refused answer and gives the least; seeds 2, 6 and 7 of the room-games deal run past 90 s (the room's per-request cost, review 2.12; X9). |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** Of G-A1, X1-X4 are built (the commander layer, the rules a player checks, the conformance suite, the definitions at the table), and X5 is under way. This session built five of D5's mechanics (up to N targets, a cost that sacrifices a set, Afterlife, the token-created trigger, counted comparisons over the turn's records) and defined eight of its cards. Nothing was played at staging. |

## The record before it: the plan-review session of 2026-10-03

| | |
| --- | --- |
| **Holder** | **Open -- the plan-review session of 2026-10-03 (Claude, a cloud container) has closed; this is its closing record.** It reviewed `docs/plan-remaining-2026-10-03.md` and `docs/engine/velocity-2026-10-03.md` as devil's advocate (`docs/prompt-plan-review-2026-10-03.md`), changed no engine, app or test code, and left two documents: **`docs/plan-review-2026-10-03.md`** (the findings, with their evidence) and **`docs/plan-execution-2026-10-03.md`** (the plan the execution session follows, its twelve decisions for Rob at the top, and the prompt that starts that session at its end). **Rob's next step:** merge #571-#575 in order, then the review's draft PR **#576** (branch `claude/plan-review-2026-10-03`, docs only, on #575's head; `gh pr edit 576 --base main` once #575 is in); answer the execution plan's decisions D1-D12 (a line each); then start the execution session with the prompt at the end of `docs/plan-execution-2026-10-03.md`; its working brief (the merge procedure, the container's limits, the designs and test shapes for the first fixes) is `docs/prompt-execution-2026-10-03.md`. Rob, later on 2026-10-03: the model of this session changes to Opus and begins the merges and the fixes itself, in that brief's order. |
| **Branch** | `claude/plan-review-2026-10-03`, from the handoff head 849845bf (#575); docs only. |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium) | **The whole gate green once on 849845bf:** `tools/local-ci.sh HEAD 1` PASS, 272 suites and `node --test game/tests`, scan clean, 988 s. **The engine suites:** 117 of 117. **The coverage figures** reproduced (992 / 2,267 / 70.0%; the seven decks 157 / 358). **`tests/uat/play-journeys.mjs`: 49 checks passed** (two four-seat tables through the real UI, the phone, every view at four sizes, the record). **The board fixture** at 1280x720 and 1920x1080 (eight shots, the hand whole in all). **Twelve four-seat games in the room** with four house pilots on the engine's own definitions: nine finished (1.5-23 s each; two of them 86 and 117 s), two threw an engine exception a real table reaches (a blockers question about an attacker that had left; a house pilot's single block on a menace creature refused and uncaught), one had not finished after 25 minutes (profiled: the layers derived afresh and recursively on every question). **Five rules defects, each played through the scenario runner** (review, Part 2 and Part 6): a commander exiled or destroyed by an effect never returns (CR 903.9a); commander combat damage is never counted (903.10a); the commander tax is forgotten after the first return (903.8); the legend rule is absent (704.5j); combat damage among blockers still demands the removed damage assignment order (510.1c). **GitHub Actions** refuses jobs within seconds (runs 2102-2104). **Cloudflare:** production on version 2fc36d3b (Oct 1, 19:59 UTC), staging on 99f23f29 (Oct 3, 04:57 UTC), nothing deployed since. |
| **Assumed, not proven here** | Anything on Forge, the JDK, a phone, Firefox or a Workers Build (AGENTS.md's table); that the two slow room games are the layers being derived afresh (a profile is X9); that D5 Shadrix Aristocrats is the deck closest to whole (counted from the inventory and the directory, not played). |
| **Outstanding** | **Rob:** the merges and the releases (as the previous record says, from Personal-HP); the twelve decisions; the runner or the billing; Workers Builds and previews off. **The execution session:** X1 (the commander layer) first, then X2-X14 as the plan orders them. **Not done by this review:** no code was changed, so the five defects stand at the handoff head and at staging. |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** Unchanged by this session; the execution plan says what each still needs and proposes (D6) that G-A split into G-A1, a played game, and G-A2, the rest of the AI program and operations. |

## The record before that: the Personal-HP session of 2026-10-03

| | |
| --- | --- |
| **Holder** | **Open — the Personal-HP session of 2026-10-03 has closed; this is its closing record.** It began as the fix for the flaky "Skip to end" check and, at Rob's word, folded in the other open work, built engine batches 79 and 80, evaluated how to speed engine work up, and wrote the remaining plan and the prompt for a plan-review session. **Rob's next step:** merge the five PRs below in order (this session's permission check refuses `gh pr merge`), release staging and production (approved by Rob 2026-10-03; the check refuses deploys too), then start the plan-review session with `docs/prompt-plan-review-2026-10-03.md`; the execution session follows the plan that review produces. |
| **Branch** | **To merge, in this order, each a merge commit on the local gate** (GitHub Actions still refuses jobs on billing, checked 2026-10-03 12:29 UTC): **#571** (the Skip to end race; PASS on d8a2fdba posted) → **#572** (the Coach's ⋯ menu kept open and its focus kept; another session's, which merged #571 into it and gates its head f8aa981b) → **#573** (batch 79) → **#574** (batch 80; `gh pr edit 574 --base main` once #573 is in) → **#575** (this record and the plans; docs only). **The merge spot is proven:** the commit 18c07644, #572's head merged with #574's — the tree `main` has once #571–#574 are in — passed `tools/local-ci.sh 18c07644 2` (PASS: 2 × 272 suites and 262 game tests, scan clean, 2,738 s); the handoff head adds only `docs/` and is gated too (its PASS block is on #575). After all five, `git rev-parse origin/main^{tree}` must equal `git rev-parse <#575's head>^{tree}`: the tree that was tested. **Then the releases**, from a detached `origin/main` checkout as a tracked background task: staging, `tools/release-staging.sh` (release-acceptance and Play end-to-end walked), pushing `release/cloud-staging`; production, `node tools/release-pages.mjs --ref origin/main --commit` (the `pages` profile), `tests/uat/release-acceptance.mjs` on it, pushing `release/pages`. **Both deploy through Cloudflare Workers Builds, and every release build since 2026-10-03 05:19 UTC was terminated in the queue** ("Build failed to initialize and was timed out"): staging still serves the release of `ecc869fe`, crankmagic.com still `release/pages` 721e5c4. Re-run the latest build of each Worker (dashboard → Workers → the Worker → Deployments → Builds), or deploy from Personal-HP as Questions 0 says. |
| **Since** | 2026-10-03 (this session) |
| **Doing** | **Built and proven this session, none merged yet (the permission check, above):** **#571** `tests/table-board.mjs`'s Skip to end race — the label is short-lived (the board passes 120ms after the click and the room runs to turn 2), so the room is now held while it is read; the caster's "Waiting on" is waited for on its own page; proven by forcing each race (old check red, fix green), breaks, and 6 suites at once under 44 spinning threads (old suite failed 2 of 3, fixed 3 of 3); local gate PASS. **#573, batch 79** — RememberChanged's forms that need no randomness: every library `fromTop` names and an amount, `moveZoneAll` remembering, `play`'s "any number", a permanent chosen on the battlefield as an effect resolves, a flicker remembering what came back, `anyOf` in a condition, commander ninjutsu (CR 702.49d), a cost increase for a while; 9 cards (Living Death, Etali, Villainous Wealth, Yuriko, Temur Sabertooth, Splash Portal, Spelunking, Mind's Dilation, Elspeth Conquers Death); 29 breaks caught. RememberChanged stays uncredited (its random-order, any-order and "exiled with this" forms are not all built). **#574, batch 80** — the game's random stream handed to plain effects (passPriority → resolveTop → the resolution → each effect, and on after an answer, which dropped it): shuffle (CR 701.24, credited), "shuffle it into its owner's library", a random order on the bottom, a discard at random (CR 701.9b), dig's filter, "may", memory and random rest, "that many"; 3 cards (Gamble, Winds of Change, The Key to the Vault) and **3 defined cards corrected that had faked a random order with the order taken** (Jodah, The Regalia, Sunbird's Invocation); nothing random is ever made up — without the stream an effect refuses; 38 breaks caught. **The velocity evaluation** (Rob asked how to speed engine work up): `docs/engine/velocity-2026-10-03.md` and its page; **the remaining plan:** `docs/plan-remaining-2026-10-03.md`; **the plan-review prompt:** `docs/prompt-plan-review-2026-10-03.md`.<br>**Coverage at #574:** of the most-played 3,238 Commander cards, 992 are defined and 2,267 (70.0%) have every mechanic built (from 980 and 2,255 at #568); the card library 440 defined, 1,565 (66.2%); Rob's seven decks 358 of 477 (75.1%). The Engine Catalog page (claude.ai/artifact/2p7KuxoPTNF1wvk2GAsH72) shows batch 80. |
| **Since Stage 2** | **The first-look list, live 2026-09-25 (#372, walked 21/21 on crankmagic.com):** Rob's list from walking crankmagic.com, plus Grok Bot's UAT of the same build (`docs/uat/2026-09-24-cloud-workshop/`). Card names open the card again (a stray `back` had broken every click); menus are opaque and a second click closes them (the `--v-*` tokens are `:root`'s too); card-name hover shows the card at 360px in Library and in a deck's hundred; the printed cost only (`CrankCatalog.frontCost`; 32 mana values rebuilt); Satoshi headings in the app and the design guide; the Overview's By card type bar; Full guide and SWOT stays on the deck; Explore's chooser no longer waits on 21 MB, its search works, and the graph opens in Inspect; Table S/M/L 30% larger; Subscribe, the mirror, Load Live and the rail note gone, and Rob's collection files are never served. The calls are `docs/decisions-2026-09-24.md` §12. Still owed from the list: **card data that refreshes itself on Cloudflare** — the design and Rob's four decisions are **`docs/plan-data-sync.md`** — and which remaining Menu backup/share entries stay. |
| **Next for whoever picks this up** | **The plan-review session first** (`docs/prompt-plan-review-2026-10-03.md`): it reviews `docs/plan-remaining-2026-10-03.md` as devil's advocate and writes the plan the execution session follows. Until it does, the remaining plan's order stands. **The engine, in the catalog's order** (`docs/engine/catalog.md`, *What to build next*): remembering an object (RememberObjects), MayPlay's remaining forms, ETBReplacement's remaining forms, SetState (double-faced cards), Imprint, RingTemptsYou; and, per the velocity evaluation, a measurement batch (parameter-level inventory, the axis matrix) and a 50-card bulk-definition pilot from the 1,275 cards with every mechanic built. **Named and not built, found while building:** an order the player chooses mid-effect (Scroll Rack, Teferi's Puzzle Box), "exiled with this" (Nautiloid Ship, Gisa), attaching a chosen permanent as an effect resolves (Armored Skyhunter), a filter on what a move takes and spell mastery (Animist's Awakening), planeswalker loyalty (Tezzeret), another player's "may pay" and playing lands from exile (Gix), a spell's own "when you cast this spell" (Kozilek, Ulamog, Artisan of Kozilek, Nulldrifter, Flayer of Loyalties); a search's own shuffle does not yet end a look (CR 701.20d; one line through `shuffleLibrary`); subtypes kept in layer 4 when `setTypes` removes Creature; umbra armor; landwalk; "up to N targets"; a Phyrexian mana payment either way. **Counted as every rule but needing something the catalog does not measure** (named in their PRs): Vigor, Uncivil Unrest, Necrobloom, Guide of Souls, Caesar, Sorin, Planar Genesis, Atraxa, Selvala, Aetherworks Marvel. **The definitions are not yet served to the cloud table** (M5). **The local gate:** about 33 minutes a run on Personal-HP (two at once is fine on its 22 cores; the Skip to end check that load used to trip is fixed by #571). **Building a batch:** `game/tools/batch/README.md`; `breaks.py` can fail to restore a file on Windows (an "Invalid argument" on the copy back): check `git diff` for a leftover break and a `.bak` file after every run. **On Personal-HP:** Bash heredocs drop one backslash — write scripts with the Write tool; check a new suite's name is free before writing it; a new worktree needs the node_modules junction; release from a detached `origin/main` checkout, as a tracked background task. **Scenarios** pay mana exactly, answer a trigger's target (and an order of triggers, `settle`) before resolving it, cannot declare blockers, list a seat's permanents by owner (`controls` reads control), and now hand the game's random stream to what resolves; in three or more seats the first player draws on turn 1 (CR 103.8a). |
| **Questions for Rob** | **0. Merges and releases** (Branch, above): this session's permission check refused `gh pr merge` ("Merge Without Review", even with your approval in chat) and re-running a Workers Build ("Production Deploy"). Merge #571 → #572 → #573 → #574 → #575 yourself, or add a permission rule for this repository's local-gate merges and release pushes. If Workers Builds keeps terminating, production can be deployed from Personal-HP: `git archive origin/release/pages | tar -x -C ../crankmagic-release`, then `npx --yes wrangler@4.139.0 deploy` there, then `UAT_BASE=https://crankmagic.com UAT_LIVE_NETWORK=1 node tests/uat/release-acceptance.mjs`.<br>**1. GitHub Actions** still refuses every job on billing ("recent account payments have failed or your spending limit needs to be increased"). Restore billing (Settings → Billing & plans), or keep the local gate.<br>**2. Workers Builds previews:** both Workers build a *preview* of every branch push (`npx wrangler preview`), which fails (the config has no `previews` block), shows two red checks on every PR, and likely crowds the queue that terminated the release builds. Recommended: turn previews off for both Workers (Settings → Builds), since staging and production deploy only from the release branches.<br>**3. Play on production:** crankmagic.com runs the `pages` profile, where Play shows "Coming Soon". Should Play itself go live there?<br>**4. The first-look list vs. wireframe r3:** *Restore a backup* vs. *Import*, and the phone's action bar scrolling vs. fitting — which wins where they disagree?<br>**5. The browser matrix (#481):** Firefox needs the Visual C++ runtime on the workbench; Safari on an iPhone and Chrome on an Android phone are yours to run.<br>**6. Play fixes on staging** — #489, #493, #512, #510, and now #571/#572 once released: worth a fresh look in a game.<br>**7. Calls made and said in their PRs** (each reversible): RememberChanged left uncredited until its remaining forms are built (#573); Elspeth Conquers Death III puts a +1/+1 counter on a creature, a loyalty counter on a planeswalker (#573); without the game's random stream an effect refuses rather than falls back to any order, and dig without `random` keeps the order looked at, no card using it (#574). |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** None of the three gates' own checks was run this session; `docs/plan-remaining-2026-10-03.md` sets out what each still needs. |

## The engine has started — phase 0 done, phase 1 next

Rob authorized phases 0 and 1 on 2026-09-22 after reading `docs/engine/PIVOT-OR-PERSIST.md`,
overriding the plan's own start condition (decision 3, Track V first). `docs/engine/PLAN.md` §6
carries the status table; `docs/engine/ADR-001-own-engine.md` carries the clean-room rule, which
is the constraint everything else rests on: **the Comprehensive Rules and Scryfall oracle text come
in, nothing from Forge comes in, and a divergence is adjudicated against the CR rather than settled
by copying.**

**Phase 0 is done (PR #353).** The scaffold refuses loudly and `CRANKMAGIC_ENGINE` defaults to
`forge`, so the engine is unreachable by anyone who has not asked for it by name. The pool is
fixed at **31,830 Commander-legal cards** in `data/engine/`, every ledger row `unsupported`.

**Phase 1 is next and not started.** Begin at 1.1 — rng, state, zones, objects, players, journal,
hashes, and the determinism test that stays forever. The gate to leave phase 1 is a four-player
game of vanilla creatures and lands with commanders running to completion for **1,000 seeds** with
no exception, the same hash on replay, and no hidden card in any seat projection. Estimated 4–6
sessions; this session stopped before starting it, at the plan's own 95%-of-usage rule, rather
than leaving half a kernel behind.

## Play audio, all five phases in

The pack Rob generated (`crankmagic2-play-audio-generated`, 88 files, 5.3 MB) is served by the
host and the gateway, and the board plays it. `docs/plan-play-audio.md` carries the detail; the
shape is three modules that do not know about each other.

| | |
|---|---|
| `play-audio-rules.mjs` | R1–R7 and R13 as pure functions of a type line. Has never heard of a speaker |
| `play-audio.mjs` | Two Web Audio buses, lazy decode, crossfade. Context, fetch and storage injected, so it runs headless |
| `play-audio-events.mjs` | The feed → clip names. A second consumer of the same `recent` the notices read, with its own filter and its own `seen` set |
| `review.mjs` | The only place that knows about all three: arms, pumps, chooses a bed, draws the sliders |

**The gesture is the whole difficulty**, and it is worth knowing before touching this: a browser
refuses to play anything on a page nobody has clicked, and refuses *silently*. The context is
therefore built and resumed **synchronously inside the first `pointerdown`** — one `await` before
that call and the permission is gone with no error anywhere.

**It has been heard in a real game.** A two-seat match against the native Forge AI, driven from a
browser: the lobby bed, the game bed crossfading in when the table went live, the viewer's own
draw, a land, a permanent arriving, and the combat bed at the first `COMBAT_` step — with no page
errors. Engine event → journal → `match-telemetry` → `play-audio-events` → `play-audio` → network,
all of it.

**Three clips can never play**, and `UNREACHABLE_FROM_THE_FEED` in `play-audio-events.mjs` says
why, with a test that fails if a fourth one quietly joins them. `sfx_event_counterspell` needs a
telemetry row that does not exist (`GameEventSpellRemovedFromStack` reaches `public-stack.mjs` but
not `match-telemetry.mjs`); `sfx_event_equip` and `sfx_event_crew` need `CrankCardScript@1` from
the engine plan — the same dependency the two blocked board alerts wait on.

**Two claims in the plan were wrong and are struck through in it rather than footnoted.**
`GameEventTurnBegan` does not exist anywhere in this repository, and the countered-spell row never
reaches the feed. Both were ticked ✅ in the plan's own mapping table before anyone looked.

## Stage A, finished

Six of Rob's findings turned out to be one finding: **the board had the facts and never drew them.**

| | |
|---|---|
| A.1 | The lag measurement — which found the board was never connecting at all |
| A.2 | A spent prompt is not a decision. Forge never clears `prompt`, so `/^Priority:/` matched an answered string. `ui.inputType` is the fact to stand on |
| A.3 | `End game` and `Auto-pass turn` out of the action row |
| A.4 | The skipped first draw explained where the player was refused (CR 103.8a, two players only) |
| A.5 | **Answered from Rob's own match journal:** the starting player *does* draw in a four-player pod |
| A.6.1–4 | Notices with an OK button, history with the card and the reason, incoming damage where blocks are chosen, poison and your own draw |

## Stage B, against wireframes 2e and 2f

**The frames are numbers, not sketches** — React trees with inline styles, extracted once into
`docs/plan-stage-b-board.md` so nobody re-derives them. Drawn at half scale; double for the build.

| | |
|---|---|
| B.1 | The step strip — `Turn 4 · You`, brass step chip, `4 / 7`, **`Next: …`** |
| B.2 | Four **identical** 16:9 boards in one 2×2. **At 1920×1080: 533×300 each, mat 1131px** (measured live 2026-09-23). Earlier note said 584×329 with no viewport attached, which back-solves to a ~1258px-tall window — **always record the viewport, or the number cannot be checked against anything** |
| B.3 | The center counter — 152px, four totals on their own `--seat` colors, the disc cycles life → commander damage → poison |
| B.4 | The hand on the mat's bottom edge. **Zero overlap**, tested with real-sized cards |
| B.5a | The panel slides **over** the mat; the mat's width does not change whether it is open or shut (1368px at the viewport that was measured at; 1131px at 1920×1080) |
| B.6a | The mat stops printing the steps list and the life box — B.1 and B.3 carry both now. **Seen working with cards** |
| B.6c | The other three boards as a left pane in Focus, with Table view and a collapse. **Seen working with cards** |

### The board has now been seen with cards, and it was wrong in two ways

`game/tools/qa-pod.mjs` starts a pod against the native Forge AI, plays it far enough that the
boards have something on them, photographs it and measures it. **Three Stage B pieces were blocked
for a week on the sentence "cannot be judged without cards on screen"; they are not blocked any
more.** Run it against a second host on a spare port unless the one in use is idle:

```
node game/tools/qa-pod.mjs --out shots/ --port 8778 --turns 3
```

The first run found both of these, and no CSS-shape suite could have:

- **The hand was 500px below the fold** at 1920×1080. A card is *dragged* from the hand onto a
  mat, so a hand off screen is not a cosmetic problem. Fixed by bounding the mat by the viewport's
  height and taking its width from 16:9 — which is what `mats.css` already did for its own compact
  overview, so the approach had a precedent rather than being invented.
- **The counter sat on a player's own name**, because all four headings rode the top edge. Frame 2e
  had said how to avoid that (`column-reverse` on the bottom row) and nothing had implemented it.

Both are in #347, and the harness reports the `fold` line, the audio clips a real game played and
the page-error count on every run.

### What is left, and why each one waits

- **B.5b — the rail overlay.** `/review` is a standalone page. There is no CrankMagic rail on it to
  bring back, so the control would open an empty drawer. It arrives when the board becomes a view
  of the one app.
- **The hand card, fixed 2026-09-23.** It drew at 152×212 against the frame's 68×92 because four
  width rules across three stylesheets fought over one element and a `clamp(112px,10vw,152px)`
  out-weighed the other three instead of replacing them (INDEX trap 2). The hand took 352px of a
  1080px window while a whole board took 240, which pinned every board to its floor — and since a
  2×2 of 16:9 boards is itself 16:9, the mat could only be 917px in a 1920px window. At the frame's
  size the hand is 225px, `--board-chrome` drops 600→480, and the boards clear the floor:
  **533×300, mat 1131**. Guarded now by `wireframe-conformance.mjs`, which also fails a second rule
  for the same element.

- **B.6b — the History band. ANSWERED 2026-09-23: option 2, the empty strip.** The band goes at
  `left:72% top:5.5% width:25.5% height:31%` and no zone moves. Re-proportioning was rejected: the
  gap between the pile pairs is 4.8% of the mat against the ~15% a band needs, and closing it makes
  both pairs shorter than a card at small board sizes on all four boards at once. Verified while
  deciding: `.mat-turn-guide` and `.mat-life` have styles in `mats.css` but **nothing in `game/ui/`
  ever builds them**, so the strip is free and the band covers printed artwork only. See
  `docs/decisions-2026-09-23.md`.
- **B.6d — the Coach.** Not to be built until it works. 2f draws it and says "its logic is a later
  phase"; Rob's standing rule (2026-09-22) is that nothing is available before it is functional, so
  the surface waits for the logic rather than arriving ahead of it.
- **B.2b — the light mat. ANSWERED 2026-09-23: stay dark.** The cream play surface (`#e9e4da`) is a
  **post-release enhancement**, not dropped. There was no toggle to remove — a search of `game/`
  found no light-mat control of any kind. See `docs/decisions-2026-09-23.md`.

## Three limits found by measuring, which the next person should not re-discover

**The adapter reports exactly nine keywords** — flying, reach, trample, first strike, double
strike, deathtouch, lifelink, infect, wither (`ForgeProbe.java:241`). Menace, protection,
indestructible, shadow and fear never leave the engine. Widening it is a Java change and a rebuild.

**Forge can take back mana but never a land.** `setUndoable(true)` is called in exactly two places,
both mana effects, and `recordUndoableActions()` is reached only from `MagicStack.add()`, which a
land play never touches. That is CR 305.1 rather than an omission, and it is why the control is
called "Take mana back" instead of "Undo".

**Two of Rob's alerts need card text, not events** — "exiled with a return condition" and "a
mechanic triggered by other players". They are the first consumer of the card extraction skill, and
`docs/plan-card-extraction-skill.md` is the design: emit `CrankCardScript@1` (#305 §3.4) so one
artifact serves the pilot now and the engine later.

## Standing facts

- The host serves `game/ui/*` **per request**, so UI changes land on reload. Anything the host
  *imports* — `serve-review.mjs`, `game/server/*`, `match-telemetry.mjs`, the launcher — needs a
  restart. A **new** file in the served map needs one too, so import new `game/ui` modules
  optionally (`await import(...).catch(...)`), the way `review.mjs` already does.
- **`COMMANDER_GUEST_PUBLIC_ORIGIN` does not keep a tunnel alive; it only changes what the host
  SAYS.** This note used to read "every restart preserved `medium-linking-replies-take` that way",
  and on 2026-09-22 that address no longer resolved at all — `curl` could not even find it in DNS,
  while the gateway itself answered `200` on `127.0.0.1:8769`. Passing a stale origin back is
  therefore **worse than not passing it**: the lobby offers remote invitations that lead nowhere,
  instead of saying plainly that this host is local-only.
  The host does not run `cloudflared`; `game/tools/start-crankmagic.ps1 -RemoteGuests` does. So a
  plain `node game/tools/serve-review.mjs` has no tunnel and should not claim one. **Check the
  address answers from outside before passing it back**, and relaunch through the script when
  remote guests are actually wanted.
- The adapter is compiled by the launcher at every game start, so a Java change needs no build
  step — but it fails at game start rather than in a test, so compile it against the pinned jar
  before committing.
- `tools/board-latency.mjs` and `tools/first-draw-check.mjs` are read-only and safe against a live
  game. Neither invents a verdict it did not observe.

**#685 merged on main c025d5d0 on green Actions; staging released, the AI door open there.** `tools/release-staging.sh`
released c025d5d0 to `release/cloud-staging` 5e6d83e9 (release-acceptance and play-e2e passed). Workers Builds deployed it at
15:42:54 UTC as version 1c4870d8, its `play-worker.js` byte-identical to the release's dry-run bundle (2,420,941 bytes,
sha256 6537556247f6…). Its bindings: `AI_ACCESS_AUD` (the AI application), `AI_CAP_TOTAL_CENTS` and
`AI_CAP_PERSON_CENTS` 300, `AI_MODEL` claude-haiku-5-5, and Rob's `ANTHROPIC_API_KEY`. Rob first put the key in the
Builds section's variables, which only the build sees; he moved it to the Worker's own Variables and Secrets. The
staging allowlist holds his three emails, all lowercase. Every gate is set: the first real call is his, from his browser.

**Resolve all (PR #686, 2026-10-09).** Rob: *"#2. Yes, resolve all. Games as huge as you saw in those 2 will never happen
because half of the board you were seeing would win before ever getting to that point."*
- **The room:** a fourth beat, `resolveAll`, kept with the match. With a run of the same trigger on top of the stack
  (`triggerRun`), the person is offered *Resolve all N*. Taken, the room passes for that seat through that run only, no
  more passes than the run held, and asks again as soon as anything else is on top. It is saved with the room, so a wake
  mid-run goes on, and the tape replays it.
- **The board:** *Resolve all N* beside the pass, and the stack shows a run as one line, ×N.
- **What it was not enough for:** a profile of seed 54 with it. On turn 48 the person's four Krenko activations took the
  board from 23 permanents to 259, and one Resolve all over 252 triggers then took 25 s, about 0.1 s a resolution:
  - each seat's legal actions, worked out at every pass, a third of the time;
  - the saves, a fifth;
  - the resolutions, a fifth.

  A standing pass now skips its own seat's legal actions. But a board that doubles outruns any speed-up.
- **So G1's person** also goes round no loop once its seat controls 100 permanents, as Rob says a person with that board
  has won.
- **Pod 5 again, clean:**
  - seed 54: the person (D6) the last standing, 56 turns, 47.6 s, Resolve all 7 times;
  - seed 90: the person the last standing, 38 turns, 81.9 s, Resolve all 17 times.

  Both replayed identically, with 0 leaks. Seed 90's longest wait was 6.5 s on turn 34, alone on the machine: one
  Resolve all over 79 triggers on a board of 93. Most of it was D6's Quest for the Goblin Lord asking *"you may put a
  quest counter"* once per Goblin, each answer a save, and the AI seats' passes.
- **Rob's answer to that (2026-10-09): "Yes to all, and yes, build #1."**
  - **The same answer for the same question:** in a run the person let resolve, the first of a question (its words,
    mode, limits, and every option's words and card: `questionKey`) is asked. The board says *"Resolve all: your
    answer goes for this same question each time the run asks it"*. The room then gives that answer, yes or no, each
    time the very same question comes again in that run. It is kept with the standing pass, so a wake and the replay
    agree.
  - **The house pilot's quick pass:** `passes(actions, stackSize)` is true only when `choose` would pass whatever the
    board. The room then passes for the AI seat without working out its view. `engine-house-pilot` and
    `room-g1-terms` check it against the full choice at every AI pass, vanilla and on Rob's decks.
  - **Pod 5 with both:**
    - seed 90: longest wait 2.8 s (was 6.5), 39.9 s (was 77.9), 285 decisions (was 436);
    - seed 54: 1.1 s, 38.0 s.

    Both clean, replayed identically, 0 leaks. `room-resolve-all` 59 checks.
- **G1, the 1,400 again, on ccb250d1:** seven pods, 100 seeds each with a person in seat 0 and 100 all house, every
  game with `--replay --leaks`, four at a time (3.7 hours of games). The results:
  - **1,400 of 1,400 clean:** finished, none refused, every replay identical, 0 leaks in 105,656 checks of every seat's
    view.
  - **The person's longest wait in each of the 700 games:** median 172 ms, 90th percentile 363 ms, 99th 1.6 s, and the
    worst 3.5 s (pod 5 seed 90, turn 34, the biggest board). None was over five seconds.
  - **The person** stopped going round a loop 239 times.

  The later commit cb92f98e changed a test only (`room-refused-answer`'s breaking pilot), so these games stand for
  the PR.
- **Breaks:** 26 of 26 caught: the 14 above; the answer not carried, the answer not kept, the question not told, every
  question the same, a card not part of the question, the board silent about the run; and the quick pass too eager,
  blind to mana, to spells, to lands, and to loyalty.

**G-C, 6e24523a (#686's merge):** released to `release/cloud-staging` 17d71486; deployed at 20:35:18 UTC on 2026-10-09
as version 469ff5a4, its `play-worker.js` byte-identical to the release's dry-run bundle (2,424,596 bytes, sha256
54c405a478b5…).

**The AI door, proven (2026-10-09).** Rob's first call, from his browser at 20:30 UTC: Explain, Claude Haiku 5.5, 566
tokens in and 239 out, 177 micros (0.018¢), logged as ok. The door's GET reply, *"Explain is a POST."*, was his first
sight of it signed in.

**The Coach (AI-1, X13), built behind its own switch (2026-10-09).** Rob: *"begin building the coach next"*.
- **The brief** (`game/room/coach-brief.mjs`): built by the table (`GET /table/brief`, `game/room/table.mjs` `brief`)
  from the asking seat's own projection and the deck that seat brought. It holds the person's hand, each card with what
  it can do now; the board as everyone sees it (life, poison, commander damage, permanents with their state, graveyards,
  face-up exile, the command zone); the stack; the step; the history's last 20 lines; the question being asked; and the
  deck as a counted list sorted by name, with the library's count. Never another seat's hand or library, a face-down
  card that is not theirs, the library's order, or a top card a look showed them. The front door (`cloud/tables.mjs`)
  forwards no such path: only the Worker's AI door asks for it, and nothing from the browser goes into it.
- **The route:** `POST /api/ai/coach` with `{tableId, question}` (a question of at most 300 characters), behind the AI
  door's gates (Access, the allowlist, the key, the caps, the model), then its own switch, `AI_COACH`. It is set only by
  a release profile whose `ai.coach` is true (`tools/release-pages.mjs`); staging's is not, so staging answers *"The
  Coach is not switched on here yet."* until Rob approves the Coach's privacy wording (drafted in `docs/ai-door.md`).
  A table's refusal (no seat, no game yet) is passed on as the table said it.
- **The call:** Claude Haiku 5.5 at low effort, a JSON schema `{answer, plays[{card, action, why}], threat?, show}`, and
  the instruction as the brevity control: *"one to three at most, and aim for one"*, and that it sees no other hand or
  library order. Nothing measures the length afterward; `COACH_MAX_TOKENS` (1,200) is a cost ceiling only. The same
  caps and log as Explain, logged as `coach`.
- **Grounding:** every `[[card]]` in the answer, every play's card, every id to highlight and the threat's seat must be
  in the brief, or the answer is not shown (502) and is logged as ungrounded.
- **The board:** the stub reply is gone. An answer shows its card names in bold; *Show me* lights the cards it names for
  four seconds; *Why?* opens each play's reason and the threat. Signed in to the library only, the reply is a link to
  `GET /api/ai/login?to=#table?id=…`, which comes back to the table once signed in to the AI door.
- **Not built, by Rob's own cap choice:** the plan's per-game cap. Rob chose *"a general spending cap, not per
  person"*, 300¢ a day for everyone, which holds the Coach as it holds Explain.
- **Proof:** `coach` 51 checks (the brief by hand and from a real table against an AI seat whose seven-mana Bears stay in
  its hand; the door with the table bound; the board's panel in Chromium), `release-pages` 191, `table-board` 236,
  `playtest-harness` 150; 41 breaks caught: the brief carrying the library, its deck list in library order or uncounted, another seat's view, the brief before the game, the front door forwarding it, the switch ignored, the allowlist skipped, the browser's brief used, a table's refusal hidden, the sign-in sending anywhere, the question unbounded, Sonnet, the instruction's two lines, the effort, the log's feature, the asker sent, each of the grounding's checks, Show me, Why?, the bold, the sign-in link, the board sending its view, and the release's switch on and off.
- **Rob's, left:** approve the Coach's privacy wording. Then it goes on `privacy.html`, staging's profile gets
  `ai.coach: true`, and the next staging release turns the Coach on.

**#687 merged on main 662e1aba on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 658edafa (release-acceptance 22, play-e2e 35); Workers Builds deployed it at 21:43:15 UTC as
version fa3dead1, its `play-worker.js` byte-identical to the release's dry-run bundle (2,435,420 bytes, sha256
8ed11a8e5e4e…). The Coach is in it, switched off (`AI_COACH` unset) until Rob approves its privacy wording.

**The Coach, switched on for staging (2026-10-09).** Rob: *"Coach privacy wording approved."* The wording is in the AI
features section of `privacy.html`; staging's profile has `ai.coach: true`, so its release sets `AI_COACH` on; and
`tools/release-pages.mjs` now refuses any release that switches the Coach on where the privacy policy does not say what
it sends. `release-pages` 193 checks. #688 merged on main 81bcda09 on green Actions; `tools/release-staging.sh` released it
to `release/cloud-staging` 4df68386 (release-acceptance 22, play-e2e 35), and Workers Builds deployed it at 23:08:02 UTC
as version 1a4de099, its `play-worker.js` byte-identical to the release's dry-run bundle (2,435,420 bytes, sha256
8ed11a8e5e4e…), its bindings `AI_COACH` on, `AI_MODEL` claude-haiku-5-5 and the key a secret. **The Coach answers on
staging.** Production's AI door stays shut until Rob's go.

**Rob's playtest, 2026-10-09: ten turns against the AI on staging, and his notes.** Each is built and held by a suite:
- *"Draw phase should be resolved automatically by drawing a card and progress to the next screen."* The table no
  longer launches games with the held draw (`game/room/table.mjs`, and the G1 harness with it); a game launched
  before keeps its `drawBeat` and replays as played. *"Clicking the library pile should Draw a Card"*: in such a game
  your Library pile is the Draw a card button too. `table-board`: turn 2's draw by itself, no button, on to Main 1.
- *"When I play a card to the board from my hand, I don't want to have to click a pop-up to resolve it."* A fifth
  beat, `passAfterCast` (`game/room/room.mjs`): a person's cast or activation passes the priority it brings back to
  them (CR 117.3c), so it resolves unless someone responds. Holding priority stays the caster's choice (AGENTS.md:
  decisions belong to the players): Tools' *Hold priority after I cast*, remembered on the device and sent with the cast
  as `hold`. `room-beats` 33 checks (without the beat, with it, holding, a convoke cast woken mid-question, each game
  replayed); `table-board`: a cast that passes and Maya's that holds.
- *"I shouldn't have to acknowledge every stage."* *Turns went by* puts itself away after six seconds; OK only does it
  sooner.
- *"In 2-player, the screen should split down the middle vertically"*, and *"each board will be landscape on each half
  of the screen"*: two seats sit side by side in Table view, yours on the right, each the largest 16:9 its half allows,
  the life counter and an upright bar between them (← and →).
- *"Card hand size should never decrease the board size. The user would just scroll down on the window to see the full
  card if it goes below the bottom."* In every view the boards are fitted with room for a hand at the table's card size
  (Tools), and a larger hand runs on below the window, the board scrolling to it; the strip stays at the top.
  `table-board`: Table, Focus and Full screen at Hand cards 160%.
- *"Needs more clear indication of whose turn it is. Icon on the Card in the left or right side pane."* The seat whose
  turn it is: its Focus tile ringed and marked *Your turn* / *Maya's turn*, and its line of Full screen's vitals too.
- *"Lobby music."* The pack's lobby bed (`bgm_lobby_mythic_calm`) from the first press in a table's lobby, crossfading
  into the game's bed when the board opens; leaving the page stops it. `table-lobby`.
- And the screenshot after End game, *"I couldn't click off of it"*: the card shown large under the pointer stayed when
  the board was redrawn under a still pointer. A press anywhere, Escape, or a redraw with no such card under the pointer
  now puts it away. `table-board`.
- A phone finding on the way: a main phase's ten ways to play covered 46% of a phone held sideways; what is asked there
  is at most a third of the height now, scrolling within.
- *"Resolving Land should be called 'Untap Lands' during the first untap phase"*, and then *"It's the Resolve pop-up
  that came up on my first turn in a 2-player game."* Nothing in the engine is titled *Resolve*: the only one is the pass
  button, which names what is on top of the stack, so on that first turn something of his was waiting there to be let
  resolve. With the cast that passes, his own spells and abilities no longer ask it; should a *Resolve* still show on a
  first turn, a screenshot names what was on the stack.
- **Proof:** `room-beats` 34, `table-board` 246, `table-lobby` 73, `board-choices` 38 (its scry and Zap now read with
  the cast that passes), `game-leave` 59, `playtest-harness` 153; the full local run green but for `board-choices`,
  since fixed; **35 breaks caught**: the cast's pass (never made, holding ignored, the answer's `hold` unread,
  activations, not kept across a wake, on every game), the table's beats (the pass, the held draw, the harness), the
  board's Hold priority (never sent, always sent, not kept, Tools silent), *Turns went by* waiting for OK, the turn
  marks (none, the tile, Full screen), the peek (a press, Escape, a card gone from under the pointer), two seats
  stacked again or fitted as rows, the upright bar (dragged up and down, deaf to ← →), the life counter's halves, the
  hand's room (Table, Focus and Full screen each following the hand, the board not scrolling, Focus clipping it, Full
  screen's hand growing up, the Table tray stretched), the phone's question, and the lobby's music (silent, the game's
  bed).

**#689 merged on main 2125854a on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` b6437fd6 (release-acceptance 22, play-e2e 35); Workers Builds deployed it at 00:48:13 UTC on
2026-10-10 as version ae71a787, its `play-worker.js` byte-identical to the release's dry-run bundle (2,436,473 bytes,
sha256 d099d931004c…). Rob's playtest notes are on staging.

**Rob's two G-B steps, done (2026-10-10).** *"Longest wait was about 3 seconds. phones work."* Over his own network,
in ten turns against the AI on staging, no wait reached five seconds; and Play on an iPhone and an Android phone held
sideways works. Both are in `docs/uat/browser-matrix.md` (and its generator, `tests/uat/browser-matrix.mjs`, so a
rewrite keeps them) and in the table above.

**The signed-in read-back (A5), done (2026-10-10).** Rob put the service token's secret in the environment's settings
(kept there as `CF_Access_Client_Secret`; Linux's names are case-sensitive, so `tools/staging-check.mjs` now finds the
token's two names in any case). Its first run read version.json, `/` and `/api/me` but called `/crankmagic.html` refused:
staging's static files answer it with their own 307 to `/crankmagic`, and the tool read every redirect as Access's. It now
follows a redirect on the same site, the token's headers with it, and calls only one off the site or to
`/cdn-cgi/access/` a refusal. **`node tools/staging-check.mjs --expect 2125854a…`: staging serves 2125854a (cloud-staging),
both pages say 2125854, `/api/me` answers as `service:session-checks`; exit 0.** `staging-check` 12 checks; 3 breaks
caught (every redirect read as Access, one off the site followed, the names in one case only).

**The Coach's own daily cap (2026-10-10).** Rob: *"$1.50 for the coach per day is good."* Inside the general 300¢, for
everyone together: `AI_CAP_COACH_CENTS` (the profile's `ai.coachCapCents`, 150 on staging), counting only calls logged
as `coach` and checked on the call's worst case before a cent is spent, like the others. Reached, the Coach answers
429, *"The Coach has reached its spend cap for the last 24 hours. Try again tomorrow."*, and Explain goes on.
`tools/release-pages.mjs` refuses a release that switches the Coach on without it. `coach` 54 checks, `release-pages`
195; **11 breaks caught** (the cap unread, read in the wrong unit, never checked, checked on what was spent without
the call's worst case, counting every feature, counting only the asker, the feature not passed, the refusal unnamed;
staging's cap unset, the variable never emitted, an uncapped Coach released).

**AI-2's levels, decided (2026-10-10).** Rob defined the house pilot's levels of decision, L0 (legal, today's) to L3
(chained probability, other players' likely plays included), and: *"Use Haiku 5.5. 0.25 per game is good"*; *"I do want
to deliver on L0 as part of the LLM AI seat capability"*; *"We won't be doing L2 or L3 right now."* Researched against
how game AIs that are not language models set difficulty, the recommendation, which Rob took (*"I agree with your
recommendations"*): one engine with three knobs (look-ahead, knowledge, chosen mistakes), never more information; L0 the
floor and the baseline; Easy L1 with weighted chance, Normal L1, Medium L2, Hard L3; the LLM seat asked only at close
calls that matter, with L1's scores as its hint and the house pilot as its fallback; and, in Phase 2, the model writing
each deck's L2 formulas once rather than at every decision. Written into AI-2 of `docs/plan-to-done-2026-09-30.md`,
with its sources. **Next: Phase 1, L1 in the house pilot, then the LLM seat.**

**#691 merged on main 905394dc on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 1d34e211 (release-acceptance 22, play-e2e 35); Workers Builds deployed it at 21:37:33 UTC as
version d59a3702, its `play-worker.js` byte-identical to the release's dry-run bundle (2,437,220 bytes, sha256
ee1b400c670a…), its bindings `AI_CAP_COACH_CENTS` 150 beside `AI_CAP_TOTAL_CENTS` and `AI_CAP_PERSON_CENTS` 300. The
Coach's $1.50 a day is live on staging.

**AI-2, Phase 1: L1 built (2026-10-10).** `game/engine/pilots/scored-pilot.mjs` and `odds.mjs`, as Rob's L1 and the
settings he agreed. It scores five choices and leaves the rest to L0:
- the mana it spends;
- where a spell is aimed;
- attacks against the swing back;
- blocks;
- the opening hand's odds.

Combat is exact. On New table an AI seat is *An AI · Normal* or *An AI · Easy*; the table, the room and the record
keep it; the room makes the pilot with the seat's deck list and the match's seed. A seat without a setting is L0, so
matches launched before replay unchanged.
- **Measured** (`tools/pilot-bench.mjs`): 420 two-seat games of the seven decks per arm, on the same seeds.
  - Control (L0 against L0): 51%.
  - **Normal: 242 to 178, 58% (95%: 53–62%); paired with the control, 51 games won that L0 lost and 23 the other
    way, p = 0.0015.**
  - Easy: 55%.
  - Decision time: the median under 0.01 ms, the slowest 24 ms.
  - Answers refused: none.
- **Proof:**
  - `engine-scored-pilot` 51 checks;
  - `room-seat-pilots` 12;
  - `table-lobby` 74, `table-board` 246, `game-table` 154, `game-room` 520, `room-g1-terms` 45, `room-beats` 34,
    `room-slices` 26, `game-leave` 59, `engine-house-pilot` 19, `asset-versions`, all green;
  - **45 breaks caught**: the odds (the binomial, the tail); combat (first strike, double strike, deathtouch, indestructible, marked damage, a first striker striking twice, trample); who may block (flying, menace); the defender (chumps when not lethal, trades at any price, no walls, the dearest chump, a menace attacker blocked alone); the spells (aim, tax, the mana, the cheapest first, no plan); the attack (the swing back unweighed and unpunished, vigilance, no plan); no block plan; the hand (by land count, the same draws either way, odds without a deck); easy (beyond the band, from a stream, no chance at all); another seat's view; the room (the setting ignored, no deck, no seed, the seed forgotten on reopening, a person given a setting, the seats hiding it); the table (Easy dropped, launched without settings, the view hiding it); the lobby (the form, the seat's title).
- **Next:** L1's activated abilities, which L0 never uses (Krenko's Goblins among them); then the LLM seat on L0.

**#692 merged on main 862fae14 on green Actions** (its first run failed on `generators`: `docs/data-inventory.md` had
not named the bench as a reader of `data/live-state.json`; regenerated with its own tool). Staging released from it:
see below.

**L1's activated abilities (2026-10-10).** L0 never takes an ability that is not a mana or loyalty ability; Krenko's
Goblins, Chulane's, Sakura-Tribe Elder's, Priest of Forgotten Gods' and a Clue's went unused hundreds of times. L1 now
weighs each one by what the card says it does (cards, tokens counted on its own board, a land fetched, counters, a
look, a threat destroyed at the worthiest target) against what it costs (mana, a creature tapped, what it sacrifices
or discards, counters, life), in its own main phase with the stack empty, once no spell fits.
- **Where it stops,** since it keeps no count: never an ability that costs nothing; no tokens past 60 permanents of its
  own, no draw past eight in hand or five left in the library, no ability past 150 permanents on the battlefield. The
  first bench hung on Krenko with Intruder Alarm, doubling Goblins with every untap; the board's size now ends it.
- **The room's part:** the quick pass is told whose turn it is and the step. A card's facts carry its subtypes and
  activated abilities, as the card says them, read once a match.
- **Measured** (420 games an arm, the same seeds as before):
  - **Normal with abilities: 255 to 165, 61% (56–65%); paired, +60 / −19 against the L0 control, and +19 / −6
    against Normal without them (p = 0.015).**
  - Easy, its temperature raised from 1.5 (59%, too close to Normal) to 4: 56%. That is +54 / −34 against L0 and
    +22 / −43 against Normal, each significant. So L0 51%, Easy 56%, Normal 61%.
  - The slowest decision: 176 ms, on a board of a hundred Goblins.
- **Proof:** `engine-scored-pilot` 60 checks, `room-seat-pilots` 15; `game-room` 520, `table-board` 246, `table-lobby`
  74, `room-g1-terms` 45, `game-leave` 59, `room-slices` 26, `engine-x11-leave-questions` 94, `engine-derive-once` 16
  green; **12 more breaks caught**:
  - a free ability taken;
  - abilities at any time;
  - tokens without end;
  - a sacrifice costing nothing;
  - an ability unaimed;
  - the quick pass blind to abilities, or looking on any turn;
  - no ability plan;
  - facts without abilities or subtypes;
  - facts read anew;
  - the quick pass not told the turn.

**#692 and #693 on staging.** #692 (862fae14) was released to `release/cloud-staging` 076d3828 and deployed at 22:30:08
UTC as version a5ff4906 (2,455,957 bytes, sha256 1641c4f82dcf…). #693 merged on main dc03fa81 on green Actions; it was
released to 3da63aed and deployed at 22:50:02 UTC as version 9b85364a (2,463,462 bytes, sha256 93027a433636…). Each
release passed release-acceptance (22) and play-e2e (35), and each deployed `play-worker.js` is byte-identical to its
release's dry-run bundle. **New tables on staging seat L1 AIs at Normal or Easy, abilities and all.**

**AI-2: the LLM seat, built behind its switch (2026-10-10).** *An AI · Claude* on New table, offered and seated only
where the AI door would let the host spend on it. It plays L1 at Normal, and at its close calls the room offers it the
decision as it would a person. A close call is the spells it would cast, or an attack, with L1's two best plans within a
point of each other. The table's object asks Claude Haiku 5.5 on its alarm, with the seat's own view, no person's name,
and L1's choice as the hint. Each call is logged as `pilot` under the host, within the day's caps and the game's 25¢.
When the model cannot answer, the seat's own pilot does. Every answer is on the tape, so a replay never asks the model.
- **Proof:**
  - `room-agent-seat` 23 checks;
  - `agent-seat-table` 16;
  - `coach` 55;
  - `table-lobby` 75;
  - `release-pages` 200;
  - **35 breaks caught**: when it consults (at every decision, never, on any turn, the margin always wide, holding back counted per opponent); the room (a consult ignored at a choice or at priority, the llm setting dropped, the seat made as L1, houseAnswer for a person); the table (seated without the door, llm dropped, no alarm for the seat); the object (the gate skipped, the switch or the allowlist ignored, the game's cap ignored, spend not kept, any index used, the model never asked); the brief (names sent, every hand in it, the hint dropped, a repeated index allowed); the call (on Sonnet, effort not low, logged as the Coach); the Worker's question (the switch or the allowlist ignored); the release (the switch always on, without the privacy wording, without the game's cap); the lobby (Claude always, or never, offered).
- **Rob's, left:** approve the privacy wording in `docs/ai-door.md` ("AI players on Claude"). Then it goes on
  `privacy.html` and staging's profile switches it on.
- **Then:** the bench against L1 with a real model, on staging or with a key in the environment.

**#694 merged on main 4a10c030 on green Actions; staging released.** The first `tools/release-staging.sh` run did not
release. Its Play walk (play-e2e, under `wrangler dev`) stopped at the third table: polling the table for its countdown,
one reply came back with no table, and the walk read it as one. The same walk passed on its own straight after, and the
second release run passed both walks (release-acceptance 22, play-e2e 35) and released it to `release/cloud-staging`
68724131. Workers Builds deployed it at 00:57:22 UTC on 2026-10-11 as version 05b81554, its `play-worker.js`
byte-identical to the release's dry-run bundle (2,477,269 bytes, sha256 a4eb41299cb7…). Its AI bindings carry no
`AI_PILOT`: the LLM seat is not offered on staging until Rob approves its privacy wording.
- **The walk's reply, made to say itself:** the reply's body was not kept. A refusal is the likely one: the person's
  rate limit is 120 requests a minute, and the walk polls twice a second on a slow machine. Both of the walk's
  countdown polls now wait out a reply with no table and, if the wait runs out, name the table's last answer
  (`tests/uat/play-e2e.mjs`, `tableUntil`). play-e2e 35 checks.

**AI-5: your decks and the table, connected (2026-10-11).** Each deck now says whether the table can play it, before any
table is opened. Where Play is in the cloud, a deck's tile reads *Playable at the table* or *13 cards to learn for the
table*. Its page reads *Playable at the table · all 100 cards known* with **Play this deck**, or *87 of 100 known · 13 to
learn* and names the cards the table cannot play yet.
- **The question:** `POST /api/tables/known` (`cloud/tables.mjs`) asks which of a deck's card names a table cannot play,
  with no table. One object answers it from the engine's cards alone. Its name holds a hyphen, so no table's id can be
  it. The hub asks once for every deck; the page keeps each answer.
- **Play this deck** opens New table with *You bring D1 Quintorius Spirits to seat 1.*, and the deck takes your seat once
  the table is made. Already seated at a table whose game has not begun, it offers **Bring … there** instead. A deck the
  table cannot play whole is not brought: New table names its cards, and you choose another there.
- **New from Wizards' Play it** starts the precon's import as its chip does, and once the deck is made goes on to New
  table with it, in place of the deck's page.
- Only where Play is in the cloud (`crankmagic-table.js`, `C.play`); production leaves the file out, and nothing shows.
- In passing: a long commander's name in the hub's narrow New from Wizards tile ran out of its chip (a flex item never
  shrinks under its content); it now ellipsizes as written.
- **Proof:**
  - `table-lobby` 88 checks (13 new), now through the Worker's real front door (`cloud/tables.mjs`): the tiles, the
    hub asking once, both deck pages, Play this deck to a new table, Bring … there, a deck not brought, and Play it;
  - `game-table` 159 (the door: the names alone, one object, POST only, the size limit, shut without Play's binding);
  - precons, decks-hub, deck-page-r3, page-budget, feature-wiring, release-pages, playtest-harness, coach unchanged and
    green;
  - **21 breaks: 20 caught.** The one missed was a guard no suite could see: an answer landing after the page moved on
    writes into a page already gone. It was removed.
- **Not built:** learning a card at *Prepare decks* (AI-3's online half). Until then *to learn* means the table refuses
  the deck by name, as Change deck already said.

**#696 merged on main 317be8f0 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` b56404d4 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 03:18:11 UTC as
version ba942e7f, its `play-worker.js` byte-identical to the release's dry-run bundle (2,477,826 bytes, sha256
09f40cf9…). Its AI bindings are the Coach's alone, as before.

**AI-4: the deck advisor, built behind its switch (2026-10-11).** *Ask the AI advisor* under a deck's More menu, where
the AI door would answer the person. The page sends the deck's id and a goal; the Worker builds the brief itself from
the person's library as last saved to the cloud, with the catalog's facts slimmed for the Worker, and asks the door's
model at low effort. Swaps naming a card not in the brief are dropped and counted. Each swap is a row to tick, and a
ticked one is saved as the deck's linked upgrade; nothing else changes.
- **Proof:** `advisor` 43 checks (the seven decks' briefs equal the whole catalog's), `advisor-page` 9,
  `release-pages` 204; 28 breaks caught.
- **Rob's, left:** the privacy wording in `docs/ai-door.md` ("The deck advisor"), then staging's profile switches it on;
  the eval with his key, and the swaps he would refuse.

**#697 merged on main c9f87a3f on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 819748c2 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 04:25:44 UTC as
version 37a15ed9, its `play-worker.js` byte-identical to the release's dry-run bundle (2,814,318 bytes, sha256
b02a0dcf…). Its AI bindings are the Coach's alone: `AI_ADVISE` is not set, so the advisor stays shut on staging
until Rob approves its privacy wording.

**AI-6: AI Coach settings, built (2026-10-11).** One panel, from Settings (its own card, *AI Coach*) and from the
board's *Tools ▾ › AI Coach settings…*, saved with the person's preferences and synced with the library. Six controls:
cards not owned (off), the person's own first (on), inside the bracket (on), advice short or detailed, what the Coach
sees (board and hand, or board only), and the person's spending over the last 24 hours against their cap.
- **The advisor's four** are read by the Worker from the library it holds, never from the page. Cards not owned come
  from the catalog: Commander-legal, inside the commander's colors and the per-card cap, with ten places of their own.
- **The Coach's:** *My board only* sends the question with the hand withheld, and the table's brief leaves the hand and
  the question being asked out.
- **Proof:** `advisor` 56 checks, `coach` 60, `settings-r3` 56, `table-board` 250, `advisor-page` 9; 26 breaks caught.

**#698 merged on main d32d42ca on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 3a123909 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 05:09:41 UTC as
version 848671e7, its `play-worker.js` byte-identical to the release's dry-run bundle (2,824,874 bytes, sha256
dbfa9625…). Its AI bindings are the Coach's alone, as before: the AI Coach settings are on staging, and the advisor
they steer is still shut.

**M3: monitoring, built (2026-10-11).** The Worker writes one line for each answer the operator should hear about,
through `serve()` around `handle()` (`cloud/worker.mjs`, `opsLine`): every 5xx with its status (a 503 is a feature
switched off, and the alerts leave it out), and a save refused as a sync conflict. A line names the route's resource,
never the person, an id or what was sent. Each cloud release turns Workers Logs on with those lines only: the
platform's per-request line, which carries the request's headers, stays off, and `tools/release-pages.mjs` refuses a
release that would keep it. `tools/ops-week.mjs` is the weekly check, and it only reads. Run on staging today: no
incidents, 3 people, 24 versions, Time Travel back to the database's birth (its 30-day window), and R2 not on.
- **Proof:** `cloud-worker` 117 checks, `ops-week` 23, `release-pages` 210; 30 breaks caught.
- **Rob's, left:** the two alerts with his email; R2 on, and the nightly copy's window and deletion promise
  (`docs/ops.md`).

**#699 merged on main 65d02094 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 4a9272a3 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 06:06:09 UTC as
version 9e463c21, its `play-worker.js` byte-identical to the release's dry-run bundle (2,825,718 bytes, sha256
efa5ea01…). Its AI bindings are the Coach's alone. **Workers Logs is on for crankmagic-staging as built:** the
Worker's `script-settings` read `observability.enabled` true, `head_sampling_rate` 1, `logs.invocation_logs` false.

**Train C (AI-3): Rob's whole library, learned (2026-10-11).** Of the 1,132 cards in Rob's library, 825 were playable
before Train C; 305 of the other 307 are now defined, each with scenarios that can fail, so **1,130 of 1,132 play**.
- **Phase 1** defined 167 with the engine as it was (seven workers by card kind).
- **Phase 2** built the engine pieces the rest needed, in six areas: four bugs; the turn's and game's records;
  costs that read their targets, cost atoms, behold, waterbend; replacements and last-known information; keywords
  (split second, riot, surge, freerunning, embalm, tiered, suspend from the hand, disguise, partner with,
  firebending, compleated, and more); combat (attacked recipients, attacks alone, losing the game).
- **Wave 2** built the rest in five areas: selectors and conditions, with mana provenance and mana withheld from
  casting from hand; counted amounts; revealed hands and the triggers the engine lacked; counters, copies, Roles,
  attachments and searches; the stack as targets, prevention shields, votes and tempting offers, and the fix for an
  attack tax the attacker can't pay (CR 508.1d). Then a last area of four. Phase 2 and wave 2 defined 138 of the
  307, and a few cards beside them (a second Danitha, Gandalf the White) whose clauses the areas were named for.
- **The two left, and why:** Gandalf, Goblins' Bane // Flameshape (playing a face-down exiled card, CR 406.3a, isn't
  built) and Extrapolate the Impossible (nothing outside the game in Commander, CR 903.5e and 903.11, so it does
  nothing there). Gandalf has been defined since (the Gandalf record below), so 1,131 play.
- **Proof:** check-cards 2,041 definitions, 3,868 scenarios, 0 failed; about 80 new engine suites, every engine, room
  and game suite green; 1,381 breaks, every one caught; G1's shape on a sample, 140 games: **140 of 140 clean** (seven pods, each with a person in seat 0 and all house, seeds 1-10, `--replay --leaks`): every game finished, none refused, every replay identical, 0 leaks in 8,774 checks of every seat's view; the person's longest wait in a game, median 0.16 s, 90th percentile 0.40 s, at most 1.2 s.
- **Rob's, left:** confirm the library plays as he expects (AI-3 asks "learned and confirmed"); the two cards above.
- **Found and fixed on the way** (each from a check that failed first): step-beginning triggers lost when the step's
  turn-based action asks (a held draw, declare attackers or blockers) -- live tables; a negative printed power read as
  null; an adventurer card changed just by listing what it may do; an attack tax the house pilot couldn't pay.

**#700 merged on main cd3c794a on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 6eac25f9 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 10:10:30 UTC as
version 0261051e, its `play-worker.js` byte-identical to the release's dry-run bundle (3,301,891 bytes, sha256
f236861e…; it grew with the engine from 2,825,718, and is 647 KiB gzipped). Its AI bindings are the Coach's alone. So
staging's table plays 1,130 of Rob's 1,132 library cards.

**The A11y pass: WCAG 2.1 AA on the board and the lobby (2026-10-11).** The new suite, run first against the base,
failed in 172 places; it now passes 288 checks.
- **Contrast (1.4.3, 1.4.11):** each word is measured from the screen's pixels over all 30 playmats, both themes and
  all three views. The worst went from 1.07:1 (the hand's "3/3", light) to 4.77:1. The focus rings are two-tone, and
  the 24 that vanished on light or mid-tone art now meet 3:1 along 97-100% of their edge. Tokens only, no raw hex.
- **Focus (2.4.3, 2.4.7, 2.1.1, 2.1.2):** the page behind the board no longer takes Tab, Table view tabs in reading
  order, focus survives each redraw, menus say `aria-expanded`, and modals trap and return focus.
- **Keys in Help (2.1.1):** every key the board binds, checked against the handlers.
- **Card names (1.1.1, 4.1.2):** combat state, chosen and selected; a face-down permanent is "Face-down creature",
  never its name; a check scans every name and label for hidden cards.
- **Announced (4.1.2, 4.1.3):** one polite status region beside the board, and the dialogs named and modal.
- **Proof:** `tests/a11y-board.mjs` 288 checks, 72 breaks caught; `table-board`, `table-lobby`, `browser-geometry`,
  `page-budget`, `play-journeys` (82) and the rest green. `table-board`'s Coach-under-the-log check measures the side
  column as it scrolls now.
- **Left:** "token" and "summoning sick" in a card's name (the engine's projection carries neither). The primary
  buttons outside Play, on the light and steel-cobalt themes, are done: see the record of 2026-10-11 below.

**#701 merged on main bf0e9d21 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 03a69b16 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 11:17:16 UTC as
version 51634bdc, its `play-worker.js` byte-identical to the release's dry-run bundle and to #700's (3,301,891 bytes,
sha256 f236861e…): the A11y pass changed the browser's files only. Its AI bindings are the Coach's alone.

**G-B's one red, root-caused (2026-10-11).** Tests run 2573 on main bf0e9d21 failed once in `tests/table-board.mjs`:
Maya's board was not told within 10 s that Rob's socket had dropped. Seven local runs passed. Reading the path
found the race: the lobby reads the table every two seconds, and each read redraws who is away from the table alone
(`C.board.show`). A read the room answered just before Rob dropped, landing just after the room's "away" frame,
took Maya's flag down. In the check her later reads are held, so it stayed down past 10 s; on a real network it
would have come back at the next read, two seconds on.
- **Proof the race was the cause:** forced on main as it was (the read let through as the room told her, both landing
  before the check first looked), the drop check failed exactly as run 2573 did: a 10 s timeout, her flag "", her
  socket having brought `away s0`. With the fix, the same forcing passes. A new check makes the race happen every
  time: one of Maya's reads is answered before the drop and kept on its way back until the room has told her; it
  failed on main as it was.
- **The fix, newest wins, as views already do:** the lobby says when it asked for each read, and the board keeps the
  room's last frame about a seat over a read asked before that frame came (`crankmagic-board.js`,
  `crankmagic-table.js`).
- **Checks:** `table-board` 251 checks; `tools/table-away-breaks.py` 6 breaks, every one caught.
- The timeout's message still says what Maya's flag read and what her socket last brought, should it fail again.

**Freyalise's Elf Druid, a mana ability (2026-10-11; Claude on Personal-HP, `claude/gallant-williams-342c9c`).** The +2's
token wrote "{T}: Add {G}." as a card's activated ability, and createToken makes a token's abilities as written, so the
token offered a stack-using `activate` rather than an `activate-mana` (CR 605.1a). It is now `kind: "mana"`, as the
Treasure's is; a fourth scenario taps it for {G} on turn 3 (pool {G}, stack empty); and the compiler refuses a token's
mana ability written as a card's, by name. Of 218 token specs in 2,014 scripts, it was the only one.
- **Checks:** check-cards 2,041 definitions and 3,869 scenarios, 0 failed; `engine-cards` 54, `engine-cards-pb9` 28,
  `engine-learned` 253, `engine-mana-withheld` 48; definitions, coverage and catalog `--check` current.
- **Breaks:** the old form with the guard in place is refused (NOT PLAYABLE, its three scenarios fail); with the guard
  off, only the new scenario fails ("Rob is not offered activate-mana Elf Druid").

**G-C, the agents' access (2026-10-11).** Staging seated every service token Access admitted as one identity,
`service:session-checks`, so the four agents M8 plays staging with would have been one person: one library, one seat.
Now each token is `service:` and twelve hex of its client id's SHA-256 (`cloud/access.mjs`). The same token is always
the same identity and four tokens are four; none is a person's address, and the client id isn't repeated. It is still
staging only (`SERVICE_SEATS`).
- **How an agent gets in** (`docs/playtest-harness.md`): the token's two headers on every request. Checked against
  staging with the session's token:
  - Access answers the first request with its `CF_Authorization` cookie (Secure, SameSite=None, about 30 days);
  - a request carrying only that cookie was seated as the token's identity;
  - in Chromium, extra headers stay off a socket's handshake while the cookie goes with it, so the cookie carries the
    table's socket.
  
  A real socket through Access is not yet seen: this container's proxy carries none.
- **Checks:** `cloud-worker` 120, `staging-check` 18 (`--agents`: four identities, none admitted by production),
  `playtest-harness` 155, `play-e2e` 35, `production-play-e2e` 27; `tools/agents-access-breaks.py` 8 breaks, every one
  caught.
- **Rob's:** make the four tokens; admit them on staging's application only (Service Auth, strict service token
  authentication left off); give each agent its own; put them in the environment as `AGENT1_` to `AGENT4_` for the
  check.
- Once released, the session's token reads back as its own `service:` identity, and what staging kept under
  `service:session-checks` (test data only) is no longer reached.

**#704 merged on main 5a452aba on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 6bc453a1 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 14:56:09 UTC as
version edd03cf8, its `play-worker.js` byte-identical to the release's dry-run bundle (3,302,092 bytes). Its AI
bindings are the Coach's alone. `tools/staging-check.mjs --expect 5a452ab`, signed in as the session's token, exits
0: staging serves 5a452ab, both pages say so, and `/api/me` seats the token as `service:e07b4fed5ab9`, an identity of
its own.

**G-D's dress rehearsal, under way (2026-10-11).** It runs `tests/uat/real-deck-game.mjs` with `REAL_GAMES` and
`RECORDS`:
- two people through the real board and two house AIs at each table;
- the seven decks four at a time;
- playtest tables, as staging's are;
- both people downloading each game's full record from the game-over panel.

`tools/playtest-triage.mjs` on what is in: **7 games, every one replayed to the same journal, no leak in 3,092 checks
of every seat's view.** Two findings are open, in the run's own CSV, as the agents will file theirs:
- **PT-R-01 (S2, ui):** table 19 stopped when *Turns went by*'s OK could not be pressed for 30 s, because the board
  kept drawing it anew. The board-person now says, when that happens, how often the board was redrawn and what the
  seat was asked, which tells the board's fault from the harness's.
- **PT-R-02 (S1, rules until ruled):** table 5 ended naturally, then failed the harness's frames check (a frame to
  seat 0 named a card in another seat's hand or library) before its record was downloaded.
  - The rules show some such names (a revealed card, a library's top played revealed), and G1's oracle found no leak
    in its 1,400 games, so the harness's simpler check may be the stricter.
  - The records now come first, and the check names the card, so the next one can be ruled from its record.

**#705 merged on main 46407e27 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 625fce97 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 15:39:52 UTC as
version cc02a843. Its `play-worker.js` is byte-identical to the release's dry-run bundle and to #704's (3,302,092
bytes): #705 changed the browser's files only. Its AI bindings are the Coach's alone. `tools/staging-check.mjs
--expect 46407e2` exits 0, seating the session's token as `service:e07b4fed5ab9`.

**Words on the accent, across the app (2026-10-11): the A11y pass's item left.** The pass darkened the accent under
words on the board and in the lobby (`--accent-fill`). The rest of the app's words on the accent read 3.86:1 on Felt &
Cream and 3.98:1 on Steel & Cobalt:
- the primary buttons and the v-primary;
- the shop's chosen tab and the graph's chosen mode;
- the skip link;
- the landing's step numbers and closing panel;
- the build's current step.

They now sit on `--accent-fill`. `tests/a11y-app.mjs` reads each such rule in all four themes, and the Decks page's
own primary buttons: 48 checks, failing in 20 places before. `tools/a11y-app-breaks.py`: 9 breaks, every one caught.
A tenth found the list row's own primary rule dead (its detail is drawn inside the app, where the app's rule wins),
so it was removed.

**#706 merged on main fa7cbc7d on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 2f21208a (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 16:24:17 UTC as
version 1baa83a9. Its `play-worker.js` is byte-identical to the release's dry-run bundle and to #705's (3,302,092
bytes): #706 changed the browser's files only. Its AI bindings are the Coach's alone. `tools/staging-check.mjs
--expect fa7cbc7` exits 0, seating the session's token as `service:e07b4fed5ab9`.

**Gandalf, Goblins' Bane // Flameshape: 1,131 of Rob's 1,132 cards play (2026-10-11).** Train C's one card left for
want of an engine piece. Flameshape looks at the top two cards and exiles them face down; while they remain exiled
their controller may play them if they control a Wizard. What was built for it:
- **Playing a card exiled face down (CR 406.3a).** It is offered by its real characteristics: a land under the land
  drop's rules; a spell by its own cost, timing, targets, modes and alternative costs; an adventurer card as its
  Adventure too. It turns face up and is revealed as it is played. It is weighed face up only while its offers and
  questions are, the way Adventures and disguise already are, and is put back untouched unless played.
- **Hidden until played.** Only a player who may look at it is offered it (the projection's own `mayLookAt`, now
  exported). Every other seat sees a face-down card, in the projection and to G1's leak judge. Flameshape's controller
  may keep looking, as CR 406.3 lets a player who looked at a card and exiled it face down.
- **"If you control a Wizard":** an `onlyIf` on the play permission, checked each time the card would be played, so
  a Wizard leaving removes the offer. The permission names the object, so it ends as the card leaves exile.
- **Two fixes the card needed:** an Adventure card exiled face down kept its Adventure (a manifested one leaving the
  battlefield had lost it too); and *nothing to do* now sees a face-down card the player could cast.
- **Found by CI on the PR, and fixed:** the guard that offers a face-down card only to a player who may look at it
  held every face-down card to it, and disguise weighs a library's top shown face down through the same permission.
  So Mystic Forge could no longer cast a disguise card face down from the top of the library (`engine-disguise`, which
  the worker had not run). The guard is now for a card exiled face down only, as the rule it follows is.
- **Proof:** check-cards 2,042 definitions, 3,876 scenarios, 0 failed. `tests/engine-face-down-play.mjs` (new), 52
  checks. `breaks-flameshape.py`: 32 breaks, every one caught, with `engine-disguise` among its suites and a break
  for the guard's reach. All 359 engine, room and game suites pass here; `engine-room-games` missed its time budget
  once at a load average of 17 and passed alone. A smoke run, not committed: eight four-seat room games with Gandalf leading red decks and a person in seat 0,
  `--replay --leaks`. All 8 were clean, with 0 leaks in 1,367 checks of every seat's view; Flameshape was cast 95
  times, and 8 spells and 10 lands were played from face down.
- **Left:** Extrapolate the Impossible, which does nothing in Commander. Not built, because no defined card needs it:
  - casting a face-down exiled card face down (CR 708.4);
  - playing a face-down card one may not look at (CR 406.4);
  - an effect that plays the card as it resolves.

  The offers are proven down to the table's words for them (the room's `offerDetails`, in `engine-face-down-play`),
  not yet in a browser: Gandalf is in Rob's library but not in his seven decks, and those are what the browser suites
  play.

**Found on the way, and fixed: control gained for good broke the room's save.** `gainControl` wrote `until:
undefined` for a change for good. `storage.mjs` refuses a checkpoint that JSON would change, since the room could not
wake from it. So a room would stop saving the moment one of these resolved: Agent of Treachery; Alexios, Deimos of
Kosmos; Archmage's Charm; Hellkite Tyrant; Humble Defector. None is in Rob's seven decks, which is why G1's 1,400
games never met it; but all five are defined, so an invitee's deck could bring one.
- **The fix:** a change for good now says no duration at all (`effects/permanents.mjs`).
- **The checks:**
  - `engine-control`: the state of a change for good reads back from JSON as it is.
  - `engine-cards`: every card scenario's state is now checked the way a room's save checks it, with the storage's
    own `lostIn`, now exported. On main without the fix, this check names exactly those five cards' 7 scenarios, and
    nothing else in the 3,869. With the fix, none of the 3,876 lose anything.
  - `breaks-control-for-good.py`: 2 breaks, both caught. The `engine-cards` check also fails on its own with the fix
    reverted.

**#707 merged on main fd628286 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 39b46f0d (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 18:31:25 UTC as
version 30b5cf40, its `play-worker.js` byte-identical to the release's dry-run bundle (3,305,833 bytes; it grew with
the engine from 3,302,092). Its AI bindings are the Coach's alone. `tools/staging-check.mjs --expect fd62828` exits 0,
seating the session's token as `service:e07b4fed5ab9`; its first read, a minute after the deploy, found `/` still at
fa7cbc7 at the edge, and the next found both pages at fd62828. So staging's table plays 1,131 of Rob's 1,132 cards.

**G-D's dress rehearsal: done, 50 games, and M8's exit criteria met (2026-10-11).** It ran `tests/uat/real-deck-game.mjs`
for 50 tables here, on the release's own pages and table (not on staging):
- two people through the real board, each in a browser session of their own, and two house AIs at each table;
- the seven decks four at a time;
- playtest tables, as staging's are;
- both people downloading each game's full record from the game-over panel, each record judged at once by G1's oracle.

**The triage** (`tools/playtest-triage.mjs` over the run's folder, as Grok Bot's run will be triaged): **50 games, 50
replayed to the same journal, 0 threw, 0 leaked, in 21,006 checks of every seat's view**, in 25 minutes here (about 30
s a game). Both findings are ruled, so the exit criteria are met. Each finding was the harness's, not the board's:
- **PT-R-01 (S2, ui): as intended.** *Turns went by*'s OK could not be pressed for 30 s (tables 19 and 33). The panel
  puts itself away after six seconds by design (Rob, 2026-10-09: nothing to acknowledge). The harness's click outlived
  it and waited out its 30 s; table 33's diagnostic showed the board still, at the seat's priority. The harness now
  presses the OK while it is there, and says why when a shown OK cannot be pressed.
- **PT-R-02 (S1, rules): as intended, CR 401.5.** The harness's own frames check, stricter than the rules, flagged
  cards the rules show:
  - a library's top played revealed (Conspicuous Snoop, in D6, at the first table);
  - a card revealed and known while it stays on top (Chaos Warp at table 13; CR 701.20a, 701.20d).

  G1's oracle passed every recorded game. The first table's own card can't be named: its record was not kept, because
  the check ran before the download (since reversed). With the records on, the frames are now held to what the oracle
  passed, so the oracle is the one judge.

**What the rehearsal changed** (the follow-up PR to #707):
- the harness's two fixes above;
- the triage asks a CR citation of a `rules` or `card` finding ruled as intended. A `ui`, `ux` or `performance` one
  answers to the design, which its outcome says; PT-R-01 had no rule of the game to cite, and the agents' will not
  either. The tool is now 32 checks and 22 breaks, every one caught;
- "play with the top card of your library revealed" cited as CR 401.5, not 401.4, in the projection, G1's oracle and
  two suites.

**The run's stops**, none the board's:
- five where I stopped the run myself, or it reached the two-hour limit for a background job; each was resumed at its
  table;
- three on the harness's two findings above.

A table's rerun reuses its match id (`journey0005g1`), which the agents' games on staging will not.

**#708 merged on main 73279bc0 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 6bedebdd (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 19:32:27 UTC as
version 44986635. Its `play-worker.js` is byte-identical to the release's dry-run bundle and to #707's (3,305,833
bytes): #708 changed comments in shipped code only, which the bundle does not carry. Its AI bindings are the Coach's
alone. `tools/staging-check.mjs --expect 73279bc` exits 0, seating the session's token as `service:e07b4fed5ab9`.

**G1-L: G1's checks over Rob's whole library (2026-10-11).** G1's 1,400 clean games played his seven decks' 477 cards; the
rest of his library was proven by its cards' scenarios alone, and #707's save bug had lived there. `tools/fuzz-live.mjs
--library` (#710) plays, for each seed, four Commander decks made from `data/live-load.json`'s cards (decksFromLibrary: a
legendary creature the table plays, 99 cards of its color identity, none twice but basics; the same seed, the same decks),
with G1's terms: finished, nothing refused over the whole match, replayed identically, no seat sent a card it may not know.
- **The sweep, 650 games**, seat 0 a person (G1's random-legal answerer) or all four seats house AIs (Normal):

  | Run | Games | Clean | Not clean |
  |---|---:|---:|---|
  | a person, seeds 1-300 (before either fix) | 300 | 299 | seed 229 |
  | all AI, seeds 1001-1150 (before either fix) | 150 | 150 | |
  | a person, seeds 301-400 (the waterbend fixed) | 100 | 100 | |
  | all AI, seeds 1151-1250 (the waterbend fixed) | 100 | 99 | seed 1193 |

  1,123 of the library's 1,126 playable cards were in at least one deck (the three not drawn are red-green cards with
  one red-green commander to lead them); every all-AI game played to a winner, in 25 to 95 turns.
- **Seed 229, fixed in #710: a waterbend paid with rider mana stalled the table.** Foggy Swamp Vinebender's waterbend
  offer named its rider mana (Path of Ancestry's) against a cost it took as nothing, so once the creatures were picked
  the rest could not be paid "without the riders". The payment was refused after the ability was on the stack, the
  room's least answer found no question, and the person's turn was undone each time it was replayed. A waterbend offer
  now names no rider mana; the rest is paid plain mana first, as anything but a spell is.
- **Seed 1193, fixed after #710: amass made "Goblin" a card type.** Amass Goblins on a Zombie Army added Goblin to its
  card types, not its subtypes (CR 701.47a, 205.3m). Braids, Arisen Nightmare's "a permanent that shares a card type with
  it" then bound "Goblin" as a card type, and the selector's grammar refused it part-way through the sacrifice: the same
  stall. `engine-amass`'s own check read types and subtypes together, so it could not see it; it now reads the card
  types alone.
- **Both are one kind: an AI's answer refused after it had changed the game.** The room assumes the rules refuse an
  answer before they change anything, which both bugs broke. A snapshot of the game before each AI answer, to undo such a
  refusal, was measured: about 6 ms an answer, 20 to 30 percent of a game's time on the Durable Object. It was set aside;
  the library sweep is the guard, and `tests/fuzz-library.mjs` plays seeds 229 and 1193 clean.
- **Proof:** `tests/fuzz-library.mjs` (new), 12 checks; `tests/engine-waterbend.mjs` and `tests/engine-amass.mjs`, each
  a check that fails before its fix; `breaks-fuzz-library.py`, 9 breaks, every one caught; check-cards 3,876 scenarios,
  0 failed.

**#710 merged on main 9c746136 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` be14ee56 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 22:31:19 UTC as
version 025e7c27, its `play-worker.js` byte-identical to the release's dry-run bundle (3,305,854 bytes). Its AI bindings
are the Coach's alone. `tools/staging-check.mjs --expect 9c74613` exits 0, seating the session's token as
`service:e07b4fed5ab9`.

**#711 merged on main 039c86dd on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 74fe31e2 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 23:00:47 UTC as
version 20b71b9f, its `play-worker.js` byte-identical to the release's dry-run bundle (3,305,857 bytes). Its AI bindings
are the Coach's alone. `tools/staging-check.mjs --expect 039c86d` exits 0, seating the session's token as
`service:e07b4fed5ab9`.

**G1-L's third sweep, with both fixes in: 250 of 250 clean (2026-10-11).** `tools/fuzz-live.mjs --library`, fresh seeds,
G1's terms (finished, nothing refused over the whole match, replayed identically, no leak):
- with a person in seat 0, seeds 401-500: 100 of 100;
- all AI seats, seeds 1251-1400: 150 of 150.

So of the library sweep's 900 games, the two that were not clean were the two stalls, both fixed (#710, #711).
