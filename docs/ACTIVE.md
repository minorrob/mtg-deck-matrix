# Who holds the work

| | |
| --- | --- |
| **Holder** | **Open — the cloud session of 2026-10-02 (it ran into 2026-10-03) has closed; this is its closing record.** It merged the engine stack and everything waiting behind it on the local gate (Rob allowed it on 2026-10-02), released staging after every merge, and, on Rob's go, built, walked and committed the production release, whose deploy the cloud container could not make (Questions, 0). GitHub Actions still refuses every job on billing (since 2026-10-02 09:07 UTC); the local gate stands in while it does (Questions, 1). Read `docs/plan-to-done-2026-09-30.md` first; it is the one plan, and Part 0 is the contract. |
| **Branch** | Each PR on its own `claude/<topic>` branch. **The gate is one green GitHub Actions run of the PR's head**; while Actions is out, AGENTS.md's local gate (`tools/local-ci.sh <ref> 2`, its PASS block on the PR before the merge, the merge commit saying so), which Rob allowed on 2026-10-02. **Nothing this session opened is waiting to merge.** **Staging:** `release/cloud-staging` 069d5af = main 3f202c4, built and walked by `tools/release-staging.sh` (release-acceptance 22, Play end-to-end 20). **Production:** `release/pages` 2543cef = main 3f202c4 (2026-10-03, on Rob's go: "release production when the train is done", and "include Reset All in the production release"), the `pages` profile, built and walked (release-acceptance 23 of 23; first-look 27 of 29, its two failures the r3 items of Questions, 3, which fail the same way on the live build) and pushed, **but not deployed**: from the cloud container `wrangler deploy` fails at the asset upload, 401 on every try, because the container's proxy signs every request to Cloudflare with the account token and the upload takes only its session's own. **crankmagic.com still carries `release/pages` 721e5c4** (Questions, 0). Each later production release needs Rob's go again. |
| **Since** | 2026-10-01 (this session 2026-10-02 to 2026-10-03) |
| **Doing** | **Merged by this session, on the local gate, each PASS block on its PR and each landed tree the very tree tested** (gates ran ahead, two at a time, and the merge of today's main was compared by tree hash before every merge): the engine stack, #526–#539, #541–#547 and #549–#557 (batches 40–69) and #560–#568 (batches 70–78); then **#510** (another session's scry to the bottom, a Play fix, taken over at Rob's word: `main` merged into it, its ACTIVE.md note resolved to main's), **#481** (the browser matrix), **#559** (another session's batch helpers: `game/tools/batch`, `tools/quick-check.sh`, `tools/release-staging.sh`), **#570** (Reset All, below; merge 3f202c4), and this record with **#558** (the previous closing record, which this one's branch contains). Staging was released after every merge, each walk passing release-acceptance (22) and Play end-to-end (20).<br>**Built this session, each proven with its own suite and deliberate breaks (every break caught after a green baseline), the calls made and the cards left out named in each PR:** **70** an effect's condition about a named object, its seven forms — cast from a graveyard, Addendum, "this way", the spell a trigger is about — and Auras put onto the battlefield without being cast (#560); **71** DamageDone's remaining forms (prevention with what follows, redirection), "you have hexproof", "discard two cards" as a cost (#561); **72** Branch and reflexive triggers ("when you do") (#562); **73** PeekAndReveal (looked at privately, or revealed), "shares a creature type" (#563); **74** Changeling, with the 304 creature types read from the oracle data (#564); **75** an attacking creature's controller as a player, the cost "untap N tapped creatures you control" (#565); **76** granting abilities (AddAbility, AddTrigger; ward from an Aura or Equipment) and "becomes the target" (#566); **77** prowess, toxic and devoid, and proliferate seeing poison counters (#567); **78** "whenever a player loses life", infect and annihilator, and every life loss said and counted (#568); **Reset All** (#570, Rob, 2026-10-03), the Menu's entry beside the backups that puts CrankMagic back to a first visit: the library with its settings and theme, every `cm-*` and `crankmagic*` key in this browser and the old Matrix keys, and, signed in, the cloud's library (replaced by force, so its old version is kept 30 days; a reset that cannot reach the cloud changes nothing); the sign-in stays (`tests/reset-all.mjs`, 43 checks, holds what is left to a brand-new browser's).<br>**Fixed along the way, each in its batch:** proliferate never offered a poisoned player (77); combat damage and life paid as a cost were not counted in "the life they lost this turn", and paid life raised no event (78); "loses all abilities" took keywords only (76).<br>**Coverage at the top of the stack (#568):** of the most-played 3,238 Commander cards, 980 are defined and 2,255 (69.6%) have every mechanic built (from 910 and 2,181 at #557); the card library 434 defined, 1,559 (65.9%); Rob's seven decks 357 of 477 (74.8%). The Engine Catalog artifact page shows batch 78. |
| **Since Stage 2** | **The first-look list, live 2026-09-25 (#372, walked 21/21 on crankmagic.com):** Rob's list from walking crankmagic.com, plus Grok Bot's UAT of the same build (`docs/uat/2026-09-24-cloud-workshop/`). Card names open the card again (a stray `back` had broken every click); menus are opaque and a second click closes them (the `--v-*` tokens are `:root`'s too); card-name hover shows the card at 360px in Library and in a deck's hundred; the printed cost only (`CrankCatalog.frontCost`; 32 mana values rebuilt); Satoshi headings in the app and the design guide; the Overview's By card type bar; Full guide and SWOT stays on the deck; Explore's chooser no longer waits on 21 MB, its search works, and the graph opens in Inspect; Table S/M/L 30% larger; Subscribe, the mirror, Load Live and the rail note gone, and Rob's collection files are never served. The calls are `docs/decisions-2026-09-24.md` §12. Still owed from the list: **card data that refreshes itself on Cloudflare** — the design and Rob's four decisions are **`docs/plan-data-sync.md`** — and which remaining Menu backup/share entries stay. |
| **Next for whoever picks this up** | **M4 phase 3 continues in the catalog's order** (`docs/engine/catalog.md`, *What to build next*, at the top of the stack): remembering what an effect moved and remembering an object (both wide, multi-form), MayPlay's remaining forms, ETBReplacement's remaining forms, Imprint, SetState (needs double-faced cards, a subsystem), RingTemptsYou (a subsystem), then Overload, amass, a count of cards in a library, Protection, Class, "counter added once", Convoke, discover, CantAttack, etbCounter, PresentZone. **Worth its own item:** a spell's own "when you cast this spell" trigger (Artisan of Kozilek, Kozilek, Ulamog, Nulldrifter, Flayer of Loyalties); giving plain effects the game's random stream ("shuffle your graveyard into your library", "in a random order": Vigor, Karumonix); subtypes added in layer 4 and kept when `setTypes` removes Creature (Brotherhood Regalia's Assassin; the Enduring cycle); umbra armor; landwalk; "up to N targets"; how a Phyrexian mana cost is paid when it could be paid either way (automaticPayment offers neither). **Counted as every rule but needing something the catalog does not measure** (named in their PRs): Vigor, Uncivil Unrest, Necrobloom, Guide of Souls, Caesar, Sorin, Planar Genesis, Atraxa, Selvala, Aetherworks Marvel; Nalfeshnee can be defined now that abilities can be given (76). **The definitions are not yet served to the cloud table** (M5). **The flaky check, fixed (#571):** `tests/table-board.mjs`'s "Skip to end says it is skipping" read a label that lasts only until the board's own pass, 120ms after the click, carries the room to turn 2, so a late read saw "Skip to end" again, and a wait begun that late would too; the room is now held while the label is read and waited for. The caster's "Waiting on" after Resolve, read on the wrong page's cue, is waited for as well. The Coach's ⋯ menu, shut by its own reply under load, is a task of its own. **The local gate in a cloud container:** about 35 minutes a run; two at once at most (three raised the load to about 8 and tripped the check above); Chromium reaches Scryfall only with the proxy's certificates in its NSS store (`certutil -A -t "C,,"` into `~/.pki/nssdb`); a container restart kills a running gate, whose log then ends in FAIL with every suite before it ok and no exit line, so run it again. **A production deploy cannot be made from a cloud container** (the asset upload's 401, above): build, walk and commit it there, and deploy it from Personal-HP. **Building a batch:** `game/tools/batch/README.md` (#559, merged). **In a cloud container:** one worktree per batch; the non-engine and CrankMagic Online suites take about sixteen minutes, so run them in the background. **On Personal-HP:** Bash heredocs drop one backslash — write scripts with the Write tool; check a new suite's name is free before writing it; a new worktree needs the node_modules junction; release from a detached `origin/main` checkout, as a tracked background task. **Scenarios** pay mana exactly, answer a trigger's target (and an order of triggers, `settle`) before resolving it, cannot declare blockers, and list a seat's permanents by owner (`controls` reads control). |
| **Questions for Rob** | **0. Deploy production from Personal-HP** (it cannot be deployed from a cloud container, above): `release/pages` 2543cef is the built and walked release of main 3f202c4, its tree the walked folder file for file. `git fetch origin`, then `mkdir ../crankmagic-release && git archive origin/release/pages | tar -x -C ../crankmagic-release`, then `cd ../crankmagic-release && npx --yes wrangler@4.139.0 deploy`; then walk it, from the repository: `UAT_BASE=https://crankmagic.com UAT_LIVE_NETWORK=1 node tests/uat/release-acceptance.mjs`.<br>**1. GitHub Actions** still refuses every job on billing. Restore billing (Settings → Billing & plans) to put the gate back on Actions, or keep the local gate as the standing rule while it is out.<br>**2. Play on production:** crankmagic.com carries main b630128 today, and main 3f202c4 once it is deployed, on the `pages` profile, where Play shows "Coming Soon". Should Play itself go live there?<br>**3. The first-look list vs. wireframe r3:** *Restore a backup* vs. *Import*, and the phone's action bar scrolling vs. fitting — which wins where they disagree?<br>**4. The browser matrix (#481, merged):** Firefox needs the Visual C++ runtime on the workbench (yours to install); Safari on an iPhone and Chrome on an Android phone are yours to run.<br>**5. Play fixes on staging** — #489 (targets), #493 (end of turn), #512 (indestructible), and now #510 (scry to the bottom): worth a fresh look in a game.<br>**6. Calls made and said in their PRs** (each reversible): the previous records' lists, and since: the creature types are the oracle data's, never the rules' text (#564); a granted ability is its own ability per grant, and "loses all abilities" keeps one given after it (#566); toxic is a static ability with its number, devoid holds a card to a colorless identity (#567); one life-loss trigger per player per action, and life paid is life lost (#568); Reset All resets the settings and theme with the library, empties the cloud library when someone is signed in (or the next sync would bring it back), and keeps the app's cached files and the public card data (#570). |
| **Part 7 gates** | **G-A Build: not passed.** **G-B Test end to end: not passed.** **G-C Staging: not passed.** None of the three gates' own checks was run this session. |

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
