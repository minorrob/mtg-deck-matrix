# The plan for execution, 2026-10-03

What the execution session does, in order, after the plan review of 2026-10-03 (`docs/plan-review-2026-10-03.md`). The
governing plan is still `docs/plan-to-done-2026-09-30.md` (Part 0 the contract, Part 7 the gates and the two sentences);
this file replaces `docs/plan-remaining-2026-10-03.md`'s order where the two differ, and says why in one line each. Every
step is a pull request-sized unit with its scope, its proof, its estimate (sessions, as the plans count them) and what it
needs from Rob. The decisions are asked once, here, at the top, each with the recommended answer; the executor takes the
recommended answer wherever Rob has not said otherwise and says so in the PR.

## Status, 2026-10-04 15:45 UTC, and the priority now

**The live game comes first** (`docs/plan-live-game-2026-10-04.md`): Rob plays the four decks of the "Live Game Load 10.4"
sheet, one human seat and three AI seats, at about 22:25 UTC on 2026-10-04, at staging. Its trains (that plan's §6.2) go
ahead of every step below; the steps resume in their order after the game.

| Step | Status |
| --- | --- |
| X1-X4 | done (#577-#582) |
| X5 | built (#583-#598); Rob's game with D5 at staging waits on a release |
| X6 | the worker pool done (#599); the runner is Rob's (D7) |
| X7 | not started (D8, Rob's) |
| X8 | X8a done (#600); X8b, X8c not started |
| X9, X10 | not started |
| X11 | under way as Rob's Priority Batch 10.3, in Rob's order: 641 of its 1,095 cards defined; the seven decks 84.1% with every rule |
| X12-X14, G-D to G-F | not started |

## The decisions, asked once

| # | Decision | Recommended | Why | If Rob says no |
| --- | --- | --- | --- | --- |
| D1 | Fix the commander layer (review, Part 2.1) before any new card batch | **Yes** | every legendary definition since batch 1 was proven against a tax and a tally that forget the commander; one PR | the batches continue and X1 lands later, before X4 |
| D2 | Serve the engine's definitions to the cloud table (M5) now, before the bulk-definition pilot | **Yes** | until then no card plays at staging; every batch is proven by scenarios alone | M5 stays at E6; Rob plays nothing until the seven decks are done |
| D3 | One deck whole at a time, in the order D5, D7, D6, D4, D3, D2, D1 (fewest missing mechanics first), each played at staging before the next | **Yes** | a real deck plays within a few sessions instead of at the end of Track E | Track E's horizontal order stands |
| D4 | G1 gains a rules-conformance suite ("zero engine exceptions **and the conformance suite green**") | **Yes** | the gates measure crashes, replay and leaks, never correctness (review, Part 2) | the five defects of Part 2 are fixed by scenarios in their own suites, and nothing holds the next one |
| D5 | A provisional definition (the loader's or a session's) seats only at a playtest table until a played game or Rob confirms it | **Yes** (narrows decision 6) | the engine executes the script; the extraction design's own bar for that is G1-G4 | provisional definitions seat anywhere behind the label, as decision 6 says |
| D6 | Part 7's G-A splits: **G-A1** (X1-X12, AI-1 the Coach if the door is open) is what the first sentence rests on; **G-A2** (AI-2 to AI-6, M3, M2's data track, W1) lands between G-D and G-F | **Yes** (changes Part 7's list, not its sentences) | every G-A2 item waits on a step of Rob's and none changes whether a game plays | the first sentence waits for the whole AI program and the door |
| D7 | CI: Personal-HP registered as a self-hosted GitHub Actions runner (free minutes, Chromium already there), the Tests workflow on it; the local gate's "run twice" becomes once there | **Yes** | the green check returns on every PR without billing or pasted PASS blocks | restore Actions billing (about 22 minutes a run); the local gate stays the fallback |
| D8 | Releases: `tools/deploy.sh <profile>` from Personal-HP (the documented `wrangler deploy` of the walked folder); Workers Builds and their previews off for both Workers | **Yes** | Workers Builds has terminated every release build since 05:19 UTC on October 3; the cloud container cannot deploy | re-run the terminated builds by hand each time |
| D9 | Combat damage among blockers divided as the attacker's controller chooses (CR 510.1c as it reads today) | **Yes** | it is the rule; it changes the damage dialog, the validator and the house pilot | the engine keeps the 2023 damage assignment order and is wrong for every multi-block |
| D10 | The two first-look disagreements with wireframe r3: the empty Decks page says **Restore a backup** (not Import) and the phone's deck action bar **fits** (does not scroll) | **The first-look list wins** (it is Rob's own walk and the 2026-09-24 pack's "empty CTA honesty" rule) | ends "27 of 29" on every acceptance walk | r3's drawing wins; `tests/uat/first-look.mjs` changes to match |
| D11 | A permission rule letting sessions merge on the gate and push release branches (ACTIVE.md, Questions 0) | **Yes** | every merge and release otherwise waits a day on Rob | the merge train stays the pattern: one gated tree per train, merged by Rob |
| D12 | The AI door's five steps (`docs/ai-door.md`) | **When Rob wants the Coach**, not before X4 | AI-1 is the one AI item in G-A1 and the door gates it; nothing else in G-A1 needs it | AI-1 moves to G-A2 and the first sentence's Coach is the shell, said so |

## Track 0 -- Rob, now and whenever it comes up

1. Merge #571 → #572 → #573 → #574 (`gh pr edit 574 --base main` once #573 is in) → #575, then the review's PR, each a merge
   commit on the local gate; `origin/main`'s tree must equal the review PR's head tree.
2. Release staging and production from that `main` from Personal-HP (D8's script once X7 lands; until then ACTIVE.md's
   Questions 0 commands), and walk crankmagic.com live.
3. Answer D1-D12 (a line each is enough); register the runner (D7) or restore billing; turn Workers Builds and previews
   off (D8).
4. Later, as the steps need them: the AI door (D12), R2 and the alert email (G-A2), the Firefox runtime and the two phones
   (G-B), the four Grok Bot agents' access (G-C).

## The steps, in order

Each step is one PR unless it says more; each merges on the gate (the runner once X6 lands) and is released to staging
afterward. Estimates are sessions; the measured pace of the batches (0 to 1,011 definitions in three days) is the
reason definitions are short and mechanics are long.

| Step | Scope | Proof | Est. | Needs |
| --- | --- | --- | --- | --- |
| **X1 The commander layer** | A commander identity that survives zone changes (owner and card, CR 903.3), the tax (903.8) and the damage tally (903.10a) keyed by it, the tally written from `combatDamage.deal`; 903.9a asked of the owner after the card reaches a graveyard or exile from every path, as a state-based action (deaths seen first); 903.9b as a replacement for a hand or a library; partner and background checked at `readDeck` with a refusal that instructs (702.124, 702.153) | the review's probes P1-P5 as scenarios in `tests/engine-commander.mjs` and `tests/engine-sba.mjs`; a break per guard; the board's bars toward 21 move in `tests/table-board.mjs`; the gate | 1 | D1 |
| **X2 The rules a player checks** | The legend rule (704.5j) as a choice for the controller; +1/+1 and -1/-1 annihilation (704.5q); combat damage divided as the controller chooses (510.1c) in the validator, the house pilot and the board's damage dialog, trample unchanged (702.19b); "each player sacrifices / discards" chosen in APNAP order then done at once (101.4); the order of several damage replacement effects asked of the affected player when the result differs (616.1); an "unless" payment or attack tax asks which mana when more than one payment is legal, pays automatically when one is | a scenario per rule in `tests/engine-rules-conformance.mjs` (X3's file, started here), red first; breaks; `tests/table-board.mjs` for the damage dialog | 1-2 | D9 |
| **X3 The conformance suite and the invariants** | `tests/engine-rules-conformance.mjs`: forty situations an experienced player would check, each naming its rule (the review, Part 4, A4 lists them), written from the Comprehensive Rules only; invariants over the harness's games (life moves only through logged events, one zone per object, no token off the battlefield, the commander tally equals its combat damage); G1's wording gains "and the conformance suite green" | each case red before its rule was right and green after; the suite in `runtests.sh`; `tests/data-integrity.mjs` for the new suite | 1-2 | D4 |
| **X4 M5: the definitions at the table** | `cloud/game-room.mjs` handed the card directory (bundled as one generated module through `workerModules`, or KV with the bundle as the fallback); Change deck shows "87 of 100 known · 13 to learn" per deck and seats a whole deck; the basic lands test deck stays; the two exceptions the review's twelve room games found fixed first (no blockers question about an attacker that left combat, CR 506.4; a pilot's refused answer caught by the room and answered with a legal block, and menace honored by the house pilot), then the room's harness (the review, probe R) as `tests/engine-room-games.mjs` with zero exceptions | `tests/uat/play-e2e.mjs` with a wholly defined deck at a playtest table; `tests/table-lobby.mjs` for the readiness line; `tests/release-pages.mjs` for the bundle | 1-2 | D2 |
| **X5 D5 Shadrix Aristocrats, whole** | "Up to N targets" (TargetMin/TargetMax; 24 cards across the seven decks, 126 of the most-played) first, then Escape, Encore, CantAttack, ThisTurnEntered and the CheckSVar/SVarCompare forms D5 uses; D5's 25 definitions; the deck played at staging by Rob against three house pilots | the batch process (`game/tools/batch/README.md`): scenarios, a suite per axis, breaks, the gate; `tests/uat/play-journeys.mjs` with D5 real; Rob's game | 2-3 | D3 |
| **X6 CI on the runner** | `runs-on: self-hosted` with a `ubuntu-latest` fallback when the label is absent; `runtests.sh` runs suites in a worker pool (browser suites serialized), the count unchanged; the gate's time measured and written in AGENTS.md | a green run of a PR on the runner; `tools/local-ci.sh` still passing; the time | 0.5 | D7, Rob's registration |
| **X7 Releases by script** | `tools/deploy.sh <profile>`: build, walk, commit the release branch, `wrangler deploy` from the walked folder, the live walk, the version read back; staging after every merge; `docs/release-pages.md` updated | a staging release made with it, the version id in the PR | 0.5 | D8 |
| **X8 The board: casting, captions, yield** | One click casts when `automaticPayment` finds the one legal payment (the room taps and casts in one action; "castable now" counts untapped sources); the board asks which payment when two are legal; the pile captions legible at 1280x720 in Table view; "Hold priority this turn" in Tools (the r3 Tools wireframe's "Hold priority / Yield") | `tests/table-board.mjs` (never a check removed): the one-click cast, the ask, the captions at 1280, the yield; the fixture at four sizes; screenshots to Rob | 1 | -- |
| **X9 The room's budget** | `tests/engine-perf.mjs` (skips unless `ENGINE_PERF_REQUIRED=1`) asserting PLAN §5's budgets over the harness's games; a profile of the slow seeds; a per-action cache for `characteristicsOf` if that is the cause | the suite; the slow seeds' times before and after | 1 | -- |
| **X10 Velocity, measured** | The drafter over the 1,275 "definition only" cards as a dry run; the failures grouped by construct become the catalog's next list; a 50-card pilot stored provisional and seated at playtest tables only; the velocity document's estimate replaced by the measured rate | the pass rate and the error kinds, reported; `game/tools/engine-ingest.mjs`'s checks; `tests/engine-catalog.mjs` | 1-2 | D5 |
| **X11 The other six decks, in turn** | D7, D6, D4, D3, D2, D1: each deck's missing mechanics as axis batches (RememberChanged, RememberObjects, MayPlay, ETBReplacement, Overload, Echo, Class, Imprint, planeswalkers for D5's Elspeth...), its definitions at X10's measured rate, and a played game at staging before the next deck | as X5, per deck | 8-14 | -- |
| **X12 G1 and the cutover** | The harness at 1,400 games (zero exceptions, identical replays, no leaks) with the conformance suite green; `CRANKMAGIC_ENGINE` defaults to the engine; Forge's tools and the LICENSE §4(a) removal (M9); Rob deletes the folders | the harness's report; the gate | 2-3 | Rob's deletions |
| **X13 The Coach (AI-1)** | After the door's five steps: the route, the brief, streaming, the eval, the privacy wording; `cloud/ai.mjs`'s price table and per-feature models updated first | `tests/ai-door.mjs`, `tests/table-board.mjs` | 2 | D12, the door |
| **X14 G-B then G-C: the first sentence** | The whole gate green twice on `main` (once on the runner); `play-e2e` under wrangler dev; the hidden-information inspection of every frame; the five-second rule measured over the network (a new check in `play-journeys`); `crankmagic-journeys` and `play-journeys` on the seven real decks with the Coach; the browser matrix with Rob's phones; the A11y checks; the staging release, version read back; the harness note to Grok Bot; the agents' access | the suites' counts; the matrix; the screenshots; the release commit and version | 3-5 | the phones, the agents' access |
| **G-D to G-F** | Grok Bot's four agents; every finding a PR, merged on the gate, released to staging; **G-A2 between the findings:** AI-4 (eval first), AI-3 (Rob's library learned, confirmed by play), AI-2, AI-5, AI-6, M3 monitoring and backups (before G-E), M2 after R2, W1; then Rob's invitees, Rob's review, the production release on his go: the second sentence | as Part 7 says | paced by findings | D6, R2, the alert email |

**Size.** X1-X10 are about 10-14 sessions and end with a real deck of Rob's played at staging; X11 is the long pole,
8-14 sessions, each deck a played milestone; X12-X14, 7-10. About 25-38 sessions to the first sentence, the same size as
the plan under review, with played games from the fourth or fifth session on instead of the thirtieth.

**What this order drops from `docs/plan-remaining-2026-10-03.md`:** E1's Forge-name inventory as the first step (X10
measures by the smoke test instead); E2 before M5 (X4 before X10); AI-2 to AI-6, M3 and M2 before the first sentence (D6).
Nothing else.

## Part 8 -- The prompt that starts the executing session

The session's working brief, with the merge procedure, the container's limits and the designs and test shapes for the
first fixes, is **`docs/prompt-execution-2026-10-03.md`**; it is read right after this prompt. Paste this, unchanged, as
the first message of the new session (Opus), or hand it to the session that continues this one:

> Read `AGENTS.md`, then `docs/ACTIVE.md`, then `docs/plan-execution-2026-10-03.md` in full, then
> `docs/prompt-execution-2026-10-03.md` (your working brief): the plan is what you execute,
> in its order, and its decisions table is settled (take the recommended answer wherever Rob has not written another beside
> it, and say so in the PR). `docs/plan-to-done-2026-09-30.md` is still the contract (Part 0) and the road (Part 7's
> gates and the two sentences); `docs/plan-review-2026-10-03.md` is why the order is what it is, and its Part 6 holds the
> probes you turn into scenarios in X1 and X2. Do not reopen a decision.
>
> How you work: one proven PR at a time, each on its own `claude/<topic>` branch from `main`, each merged only on a green
> run of its head (the runner once X6 lands; until then `tools/local-ci.sh HEAD 2` with its PASS block on the PR), each
> released to staging afterward by X7's script; production never without Rob's go. Every rule you build cites its
> Comprehensive Rules number and never its text; nothing from Forge comes in (ADR-001). Every change starts with a test
> that was red, and a break per guard. Extend `tests/table-board.mjs`; never delete a check. Move the pins of every served
> file you change. Keep the ratchets where they are. US English only.
>
> Do not break Play: one playmat component, sizes measured by `fit()`, the room's contracts unchanged unless a step
> changes them, hidden information never in a frame. Decisions inside the game belong to the players: where you find the
> engine deciding for one, ask instead, and cite the rule where it leaves no choice.
>
> Start with X1, the commander layer, and do not open a card batch before it is merged. At the end of every session update
> `docs/ACTIVE.md` and push. Report each gate of Part 7 with its proof, and say Part 7's two sentences only when every claim
> in them is true.
