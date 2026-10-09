# Who holds the work

## RESUMED, 2026-10-08: the review-response session (Claude, a cloud container), on Rob's "Keep building"

The review-response session paused on 2026-10-06 at 97% of the week's usage (Rob: pause at 90% and "write up a
comprehensive handoff packet for another AI platform"). Codex on Personal-HP then picked the handoff up on 2026-10-07
(its record below): B4, B6 and B3 landed with suites and breaks (5d068d26), 53 of the seven decks' 477 cards left
undefined. On 2026-10-08 Rob told this session "Keep building", the week's usage read back at 1%, so the baton is back
here, on the same branch and PR #669, building on Codex's commit. **`docs/handoff-2026-10-06.md` is still the map**, with
`docs/train-b-proof-2026-10-07.md` and `docs/production-readiness-2026-10-07.md` beside it. Train B goes on as the
handoff's §3 says, five workers by engine area (permissions and attack statics; effects, counts and triggers; memory;
keywords; costs and filters), merged here in turn. Rob's rule stands: at 90% of the week's usage, pause and hand off.

**Where the gates stand, 2026-10-09** (Part 7 of `docs/plan-to-done-2026-09-30.md`; the records below are the proof):

| Gate item | State | Proof, or whose step |
| --- | --- | --- |
| G-A: G1, 1,400 games | **done: 1,400 of 1,400 clean** | PR #686's head ccb250d1: every game finished, none refused, every replay identical, 0 leaks in 105,656 checks of every seat's view |
| G-A: the AI program (AI-1 to AI-6), X13 | the door open and proven on staging; AI-1, the Coach, built behind its own switch; AI-2 to AI-6 not built | every gate set on staging (the AUD, 300¢ a day for everyone, Haiku 5.5, Rob's key, three allowlist rows), released at c025d5d0; Rob's first call through it logged ok; the Coach (records below) waits on **Rob's** approval of its privacy wording |
| G-B: the whole gate green twice on main | done | dispatched Tests runs on main, every suite: 2499 on def8fa89 and 2503 on eff40fdc, both green |
| G-B: `play-e2e` under wrangler dev | done | 35 checks at every staging release |
| G-B: hidden information in every frame | done | `play-journeys` reads every frame to both people; G1's oracle 102,879 checks, no leak |
| G-B: the five-second rule | in this container only | `play-journeys` median 280 ms, longest 1.0 s; G1's 700 games with a person, four at a time: each game's longest wait a median 172 ms, 99th percentile 1.6 s, the worst 3.5 s (the biggest board, seed 90), none over 5 s. Over the network needs a browser on a real network: **Rob** or Grok Bot |
| G-B: `play-journeys` with the seven decks | done | 82 checks (PRs #681, #682): every view at 1280, 1400, 1920, 2560 and the phone, the Coach's stub, the record |
| G-B: `crankmagic-journeys` and the tours | done | `journeys.mjs`: geometry 138, workshop 504, tour-walk 61 steps (PR #683) |
| G-B: the browser and device matrix | Chromium here | `docs/uat/browser-matrix.md` (Edge and WebKit on Personal-HP, 2026-10-01); the phones: **Rob** |
| G-B: screenshots to Rob | done | the published gallery "CrankMagic Board Sizes" (the session's report) |
| G-C: staging from main, version read back | done at every merge | the G-C records below; the signed-in read-back needs the service token's secret (A5): **Rob** |
| G-C: the harness note for Grok Bot | done | `docs/playtest-harness.md`, held to the page by `tests/playtest-harness.mjs` (PR #681) |
| G-C: the four agents' access | not set | **Rob** (M8) |

So the first sentence of Part 7 is not yet true: it waits on the network measurement, the phones and the agents'
access, all Rob's; on the Coach's privacy wording, Rob's to approve; and on AI-2 to AI-6, this session's.

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
