# Who holds the work

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

## The previous record: the plan-review session of 2026-10-03

| | |
| --- | --- |
| **Holder** | **Open -- the plan-review session of 2026-10-03 (Claude, a cloud container) has closed; this is its closing record.** It reviewed `docs/plan-remaining-2026-10-03.md` and `docs/engine/velocity-2026-10-03.md` as devil's advocate (`docs/prompt-plan-review-2026-10-03.md`), changed no engine, app or test code, and left two documents: **`docs/plan-review-2026-10-03.md`** (the findings, with their evidence) and **`docs/plan-execution-2026-10-03.md`** (the plan the execution session follows, its twelve decisions for Rob at the top, and the prompt that starts that session at its end). **Rob's next step:** merge #571-#575 in order, then the review's draft PR **#576** (branch `claude/plan-review-2026-10-03`, docs only, on #575's head; `gh pr edit 576 --base main` once #575 is in); answer the execution plan's decisions D1-D12 (a line each); then start the execution session with the prompt at the end of `docs/plan-execution-2026-10-03.md`; its working brief (the merge procedure, the container's limits, the designs and test shapes for the first fixes) is `docs/prompt-execution-2026-10-03.md`. Rob, later on 2026-10-03: the model of this session changes to Opus and begins the merges and the fixes itself, in that brief's order. |
| **Branch** | `claude/plan-review-2026-10-03`, from the handoff head 849845bf (#575); docs only. |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium) | **The whole gate green once on 849845bf:** `tools/local-ci.sh HEAD 1` PASS, 272 suites and `node --test game/tests`, scan clean, 988 s. **The engine suites:** 117 of 117. **The coverage figures** reproduced (992 / 2,267 / 70.0%; the seven decks 157 / 358). **`tests/uat/play-journeys.mjs`: 49 checks passed** (two four-seat tables through the real UI, the phone, every view at four sizes, the record). **The board fixture** at 1280x720 and 1920x1080 (eight shots, the hand whole in all). **Twelve four-seat games in the room** with four house pilots on the engine's own definitions: nine finished (1.5-23 s each; two of them 86 and 117 s), two threw an engine exception a real table reaches (a blockers question about an attacker that had left; a house pilot's single block on a menace creature refused and uncaught), one had not finished after 25 minutes (profiled: the layers derived afresh and recursively on every question). **Five rules defects, each played through the scenario runner** (review, Part 2 and Part 6): a commander exiled or destroyed by an effect never returns (CR 903.9a); commander combat damage is never counted (903.10a); the commander tax is forgotten after the first return (903.8); the legend rule is absent (704.5j); combat damage among blockers still demands the removed damage assignment order (510.1c). **GitHub Actions** refuses jobs within seconds (runs 2102-2104). **Cloudflare:** production on version 2fc36d3b (Oct 1, 19:59 UTC), staging on 99f23f29 (Oct 3, 04:57 UTC), nothing deployed since. |
| **Assumed, not proven here** | Anything on Forge, the JDK, a phone, Firefox or a Workers Build (AGENTS.md's table); that the two slow room games are the layers being derived afresh (a profile is X9); that D5 Shadrix Aristocrats is the deck closest to whole (counted from the inventory and the directory, not played). |
| **Outstanding** | **Rob:** the merges and the releases (as the previous record says, from Personal-HP); the twelve decisions; the runner or the billing; Workers Builds and previews off. **The execution session:** X1 (the commander layer) first, then X2-X14 as the plan orders them. **Not done by this review:** no code was changed, so the five defects stand at the handoff head and at staging. |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** Unchanged by this session; the execution plan says what each still needs and proposes (D6) that G-A split into G-A1, a played game, and G-A2, the rest of the AI program and operations. |

## The record before it: the Personal-HP session of 2026-10-03

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
