# Who holds the work

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

## The previous record: this session at the train #623-#627

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
