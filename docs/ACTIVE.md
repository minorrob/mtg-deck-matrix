# Who holds the work

| | |
| --- | --- |
| **Holder** | **Open — the executing session of 2026-10-01/02 (Personal-HP, `docs/plan-to-done-2026-09-30.md`) has closed; this is its closing record.** The engine stack waits on Rob (Questions, 0): since 2026-10-02 09:07 UTC GitHub Actions refuses every job on billing ("recent account payments have failed or your spending limit needs to be increased"; main's own run 36987990506 as well), and this session's permission check refused merging on the local gate (`tools/local-ci.sh HEAD 2`) although AGENTS.md names it the fallback. Read `docs/plan-to-done-2026-09-30.md` first; it is the one plan, and Part 0 is the contract. |
| **Branch** | Each PR on its own `claude/<topic>` branch. **The gate is one green GitHub Actions run of the PR's head**; while Actions is out, AGENTS.md's local gate (`tools/local-ci.sh HEAD 2`, its PASS block on the PR) — if the merging session may use it. **The engine stack, in merge order** (each based on the one before; to merge one: merge `origin/main` into it, run `data-integrity` + `feature-wiring` + the touched suites + the scan, push, `gh pr edit N --base main`, `gh pr ready N`, wait for its one run, merge with `--match-head-commit <full sha>`, then release staging): **#526** batch 40 (base main, marked ready; its Actions run refused; **local gate PASS on a1fcb92c**, not merged) → #527 41 → #528 42 → #529 43 → #530 44 → #531 45 → #532 46 → #533 47 → #534 48 → #535 49 → #536 50 → #537 51 → #538 52 → #539 53 → #541 54 → #542 55 → #543 56 → #544 57 → #545 58 → #546 59 → #547 60 → #549 61 → #550 62 → #551 63 → #552 64 → #553 65 → #554 66 → #555 67 → #556 68 → #557 69 → #481 the browser matrix (base main). Each later branch already contains the ones below it. **#510** (another session's scry-to-the-bottom, a Play fix) waits for Rob. **Staging:** `release/cloud-staging` carries main through #525 (25dd605), built from a detached `origin/main` checkout by `tools/release-pages.mjs --profile cloud-staging`. **Production:** `release/pages` 721e5c4 = main b630128 (2026-10-01, on Rob's go), the `pages` profile; each later production release needs Rob's go again. |
| **Since** | 2026-10-01 |
| **Doing** | **Merged 2026-10-01/02 by this session, each on its gate, staging released after each served change:** #477–#480, #482–#494, #498, #506, #522, #540 and #548 (the interim records), #495–#497, #499–#505, #507–#509, #511–#521, #523–#525 (batches 4–39, the catalog, the 80% list, Play fixes #489/#493/#512).<br>**Open, in the stack above, each proven with its own suite and deliberate breaks (every break caught after a green baseline):** 40–60 as the fourth interim record listed them; **61** casting a spell as an effect resolves; **62** revealing until a card fits, smoke games that end; **63** "can't cast", whenever you attack; **64** poison counters; **65** earthbend, changing a spell's single target; **66** attack taxes (Propaganda; CR 508.1g-h) and "doesn't untap"; **67** tokens that enter tapped and attacking — "that player", or the defending player its controller chooses, a creature at a time (CR 508.4, 802.2) — with ninjutsu on the same path, and ActivationLimit credited (built already); **68** "you win the game" (CR 104.2b), "that much life", "if you have 40 or more life", and the Enduring cycle's return as an enchantment only; **69** goad (CR 701.15; the declare-attackers choice keeps its shape — the goader is not offered where it can be avoided for free, and a goaded creature left out attacks anyway) and CantBlockBy credited (built already).<br>**Coverage at the top of the stack (#557):** of the most-played 3,238 Commander cards, 910 are defined and 2,181 (67.4%) have every mechanic built; Rob's seven decks 348 of 477 (73.0%). The Engine Catalog artifact page shows batch 69. |
| **Since Stage 2** | **The first-look list, live 2026-09-25 (#372, walked 21/21 on crankmagic.com):** Rob's list from walking crankmagic.com, plus Grok Bot's UAT of the same build (`docs/uat/2026-09-24-cloud-workshop/`). Card names open the card again (a stray `back` had broken every click); menus are opaque and a second click closes them (the `--v-*` tokens are `:root`'s too); card-name hover shows the card at 360px in Library and in a deck's hundred; the printed cost only (`CrankCatalog.frontCost`; 32 mana values rebuilt); Satoshi headings in the app and the design guide; the Overview's By card type bar; Full guide and SWOT stays on the deck; Explore's chooser no longer waits on 21 MB, its search works, and the graph opens in Inspect; Table S/M/L 30% larger; Subscribe, the mirror, Load Live and the rail note gone, and Rob's collection files are never served. The calls are `docs/decisions-2026-09-24.md` §12. Still owed from the list: **card data that refreshes itself on Cloudflare** — the design and Rob's four decisions are **`docs/plan-data-sync.md`** — and which remaining Menu backup/share entries stay. |
| **Next for whoever picks this up** | **Merge the stack** (above), PR by PR, staging after each — once Actions runs again, or once Rob allows merging on the local gate. **Then M4 phase 3 continues in the catalog's order** (`docs/engine/catalog.md`, *What to build next*, at the top of the stack): remembering what an effect moved and remembering an object (both wide, multi-form), MayPlay's remaining forms, an effect's condition about a named object (seven forms: cast from a graveyard, Addendum, "this way", ...), SetState, the DamageDone replacement's remaining forms, RingTemptsYou (a subsystem), ETBReplacement's remaining forms, Branch, PeekAndReveal, Changeling (needs a list of creature types the engine can read). **Worth its own item:** granting abilities ("creatures you control have '{T}: Add one mana'", ward from Equipment — the catalog does not measure Forge's AddAbility); a player reference to an attacking creature's controller (Vengeful Ancestor); the cost "untap a tapped creature you control" (Halo Fountain); creature subtypes kept when `setTypes` removes Creature (the Enduring cycle). **Named and deferred along the way** (each PR lists its own; the fourth interim record has the earlier ones). **The definitions are not yet served to the cloud table** (M5). **On Personal-HP:** Bash heredocs drop one backslash — write scripts with the Write tool; check a new suite's name is free before writing it; a new worktree needs the node_modules junction; release from a detached `origin/main` checkout, as a tracked background task; scenarios pay mana exactly, answer a trigger's target (and an order of triggers) before resolving it, cannot declare blockers, and a seat's permanents are listed by owner (`controls` reads control). |
| **Questions for Rob** | **0. The merge gate:** GitHub Actions refuses every job on billing since 2026-10-02 09:07 UTC. Restore billing (Settings → Billing & plans), or say that a session may merge on the local gate as AGENTS.md describes — this session's permission check refused that merge (#526, PASS on a1fcb92c), so 31 stacked PRs wait.<br>**1. #510 (scry to the bottom):** the session that built it asked that it be slotted into the merge train; this session's permission check would not let it work on another session's branch. Say the word here (or merge it yourself).<br>**2. Play on production:** crankmagic.com carries main b630128 on the `pages` profile (Play shows "Coming Soon"). Should Play itself go live there?<br>**3. The first-look list vs. wireframe r3:** *Restore a backup* vs. *Import*, and the phone's action bar scrolling vs. fitting — which wins where they disagree?<br>**4. The browser matrix (#481):** Firefox needs the Visual C++ runtime on the workbench (yours to install); Safari on an iPhone and Chrome on an Android phone are yours to run.<br>**5. Play fixes on staging** — #489 (targets), #493 (end of turn), #512 (indestructible): worth a fresh look in a game.<br>**6. Calls made and said in their PRs** (each reversible): the fourth interim record's list, and since: a token entering attacking asked a creature at a time (#555); a win ends the game without anyone losing it first (#556); a goaded creature left out attacks the first free player after its controller, rather than the declaration being refused (#557). |

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
