# Who holds the work

| | |
| --- | --- |
| **Holder** | **Free — the executing session of 2026-09-30 (Personal-HP, `docs/plan-to-done-2026-09-30.md`) closed at its end.** It built the plan's board series in order: B1–B8 all merged on the local gate and released to staging, then W1 (Rob's prints), AI-4's first half, the accessibility pass, a fix to the e2e harness, three engine PRs on M4's critical path, and Play's journeys suite (G-B's UX proof). Next is Part 4's AI track and Part 5's tracks (see *Next*). Read `docs/plan-to-done-2026-09-30.md` first; it is the one plan, and Part 0 is the contract. |
| **Branch** | Each PR on its own `claude/<topic>` branch from `main`, merged on a green `tools/local-ci.sh HEAD 2` (Actions out on billing). **Staging:** `release/cloud-staging` = main `4f10ac7` (through #466): release `f336472`, Worker version `85fa7d43`, deployed 2026-10-01 04:03 UTC; #467 and this note change no shipped file. **Production:** unchanged, `release/pages` f72671e = main 9e20bfb (M8b); Play says Coming Soon. A production release needs Rob's go. |
| **Since** | 2026-09-30 |
| **Doing** | **Done 2026-09-30 into 10-01, in this order, each merged on the gate with its PASS block on the PR, and staging released after each (#463, a test harness, went with #464; #467 ships no file):**<br>• **#448 the 9.30 workbook through the sync** (the loader's first batch): all seven decks, and the `Dn-Buy` upgrade pairings read from the Master sheet.<br>• **#449 B1:** the bugs Rob saw on staging, and the hand whole in every view.<br>• **#450 L1:** the landing page's account chip, and his art lifted off its checkerboard.<br>• **#452 L1b:** the art animated, on a screen blend.<br>• **#453 N1:** a precon's commander on hover on Decks.<br>• **#451 B2:** the game survives the pages; *Game on* in the rail.<br>• **#454 B3:** *Use this mat* beside the ✕; the host's table rules (starting life and bracket limit, not once a seat is ready); the engine's starting life.<br>• **#455 B4:** the Table view's shape: a still background; the row bar and the tray bar; three card sizes; piles on their frames; the reminder under Lands; the life counter at the center; ♥ and ☠ in Table vitals.<br>• **#456 B5:** the turn's words (*Next step*, *Resolve …*, *Pass*; the strip's *Maya's upkeep · you may respond*); empty steps pass by themselves and say so; the draw as its own beat (*Draw a card*), both asked for by the pod so older games replay.<br>• **#457 B6:** the hand tray's count and counts by type (castable / in hand).<br>• **#458 B7:** the Focus pane's divider and miniatures; the Panel's divider and Full screen's; Rob's card backs (tan universal, a seat's in its color); another seat's hand as backs when rotated.<br>• **#459 B8:** Rob's audio pack in the cloud board (gesture-armed, moments from views, Tools › Sound; Play only).<br>• **#460 W1:** one row per card, its prints within it: the sync reads both print groups; Rob's placement rules (the dearest print in the deck; a one-print row covers every copy; no print info stays blank); the Library row priced at the dearest print and opening to list each.<br>• **#461 AI-4a:** the deck advisor's brief, built by code from the library (the list and box readings, candidates, constraints, the grounding gate), and its eval (`tests/ai-advise-eval/`: 122 sound swaps from Rob's own intent; the runner spends only with `--yes` and a key).<br>• **#462 the accessibility pass** (Part 6): every word on a mat and over a lobby sea at 4.5:1 over plain white; every card's label saying its state; Tab through the strip, the boards, the hand; the pop-up announced; the keys in Help (☰ › *Keys and help*, and the ? on Play); Escape closing Tools.<br>• **#463 the e2e harness's date:** play-e2e and cloud-e2e failed after midnight UTC, because the test tree was dated today and the installed wrangler's runtime is a week older. They now cap the test tree's compatibility date at the runtime's own; releases are untouched.<br>• **#464 engine 2.3, the timing family:** Flash; Haste; summoning sickness reaching a creature's {T} abilities (a rules bug: a mana creature tapped the turn it arrived), read against the controller's own turn.<br>• **#465 engine:** `destroyAll` (decided at once) and `mill`.<br>• **#466 engine:** statics that change a rule rather than a characteristic (`rules/statics.mjs`, a closed list the schema enforces), the first combat damage by toughness (Doran, Assault Formation, Huatli). The seven decks' engine coverage went from 330 to 356 of 477 cards (69.2% → 74.6%).<br>• **#467 Play journeys** (`tests/uat/play-journeys.mjs`, Part 7's G-B UX proof): two four-seat tables through the real UI, Rob at a desk and Maya on a phone held sideways with two AIs: New table, the invite link, decks from the library by name (all seven of Rob's decks seated), the countdown, the game played through the board's buttons to turn 6, the hidden information read from every frame, every view at four sizes and on the phone, the Coach, End game and the record. 49 checks; runs when asked. The cards are vanilla stand-ins until M4 and G1.<br>`tests/table-board.mjs` went from 121 to 221 checks. Every new check was proved able to fail by breaking the code it guards; each PR lists its breaks. |
| **Since Stage 2** | **The first-look list, live 2026-09-25 (#372, walked 21/21 on crankmagic.com):** Rob's list from walking crankmagic.com, plus Grok Bot's UAT of the same build (`docs/uat/2026-09-24-cloud-workshop/`). Card names open the card again (a stray `back` had broken every click); menus are opaque and a second click closes them (the `--v-*` tokens are `:root`'s too); card-name hover shows the card at 360px in Library and in a deck's hundred; the printed cost only (`CrankCatalog.frontCost`; 32 mana values rebuilt); Satoshi headings in the app and the design guide; the Overview's By card type bar; Full guide and SWOT stays on the deck; Explore's chooser no longer waits on 21 MB, its search works, and the graph opens in Inspect; Table S/M/L 30% larger; Subscribe, the mirror, Load Live and the rail note gone, and Rob's collection files are never served. The calls are `docs/decisions-2026-09-24.md` §12. Still owed from the list: **card data that refreshes itself on Cloudflare** — the design and Rob's four decisions are **`docs/plan-data-sync.md`** — and which remaining Menu backup/share entries stay. |
| **Next for whoever picks this up** | Part 4 and Part 5, in the plan's order: **AI-4's second half**: the Worker route `POST /api/ai/advise` behind the door. It needs three things: the Worker to open the person's cloud library, which it stores opaque today (`cloud/library.mjs`: gunzip the head's body and read the backup, as Restore does); the brief as a module the Worker can import (`advise-brief.js` is UMD, and release-pages only lets the Worker import `.mjs`); and the card facts the brief reads, as a compact index built at release time (roles, identity, price, rank, Game Changer, and co-play with commanders only), because `data/cards.json` (4.8 MB) and `data/graph.json` (16.6 MB) are too large to parse per request. The answer lands in *Make the change* as proposed swaps. The eval (#461) waits on Rob's afternoon of refusals and his key.; **AI-3's first batch** (his whole library, 1,132 cards, on M4's script format); then AI-1, AI-2, AI-5, AI-6 once the door is open (`docs/ai-door.md` 1–5 are Rob's). **M4, the engine (the critical path to a real game):** phase 2.4 next. Casting does not yet choose targets (CR 601.2c) or run a card's script at resolution, and non-mana activated abilities are not offered. That glue, `cards/index.mjs` and the scenario runner, is what lets the primitives play in a game; then Equip (8 cards), Flashback (5), and `etbCounter` once X, multikicker and escape exist (`docs/engine/coverage.md` lists the blockers). G-B's UX suite exists now (#467); the matrix runs it per browser. Alongside: the browser and device matrix (Chromium and Edge are on Personal-HP; Firefox and WebKit need a download, which is Rob's yes), M3's monitoring and backups, M2 when R2 is on. The harness note for Grok Bot is `docs/playtest-harness.md`. **On Personal-HP:** `tools/bump-pins.mjs` now and then fails a write with `UNKNOWN` (errno -4094) in the session's own worktree. Rerun it, and check every pin moved: `node tests/asset-versions.mjs` catches a half-done bump. The e2e harnesses run at the local runtime's date (#463). Release from a checkout of `main`, never a branch's (the release rules come from the checkout that runs them). |
| **Questions for Rob** | **1. W1** was answered during the build (the dearest print is the deck's; one print group covers every copy; no print info stays blank) and is built as #460.<br>**2. The sync:** six orders cleared without being owned (Chocobo Knights, Forgotten Ancient, Krosan Verge, Radiant Grove, Rampart Architect, Wall of Reverence): received but not counted, or canceled?<br>**3.** D7 Peppersmoke has no substitute (Bile-Vial Boggart's `D7-Buy` is empty).<br>**4. Production:** staging holds everything above; production waits on your go.<br>**5. The browser matrix:** may the workbench download Playwright's Firefox and WebKit (Safari's engine)? Chromium and Edge are already on Personal-HP; Safari on an iPhone and Chrome on an Android phone are yours to run.<br>**6. The AI door** (`docs/ai-door.md`, steps 1–5) gates AI-1, AI-2 and AI-4's route; AI-4's eval (#461) also needs your afternoon of refusals for the rubric, and your key to run it. |

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
