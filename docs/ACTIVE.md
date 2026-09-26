# Who holds the work

| | |
| --- | --- |
| **Holder** | **Claude, cloud session** (session_01Jt1VXNfdMTFuJazv4Qqya2). Rob approved the order for M1–M10 and the recommended decisions on 2026-09-25: **`docs/decisions-2026-09-25.md`** is the record |
| **Branch** | `claude/magical-davinci-spajci`, restarted from `main` after each merge (M11 was #375). Production: `release/pages` e52760c (main 8577a27) = the Worker `crankmagic`, version `0ad25bb1`, its API for `/api/*` on D1 `crankmagic`. Staging: `release/cloud-staging` 9199352 (main 8577a27) = `crankmagic-staging` version `f27c3aab` on staging.crankmagic.com (Rob only), D1 `crankmagic-staging` |
| **Since** | 2026-09-25 |
| **Doing** | **The approved order, one proven PR at a time.** Merged on 2026-09-25: R3.0/R3.1 type (#376), M2's first step (#377), M4 4.1b storage (#378), M4 4.2 house pilot (#379), M3 rate limits (#380), **R3.2 the shell** (#381: account chip, three themes, toasts with Undo/Retry, help slide-over), and **Rob's library from Trey's MtG Master v25** (#382; `data/live-state.json` is the backup Rob restores while signed in on crankmagic.com to put it in his account). Then R3.3a Settings (#383), R3.3b Delete account (#384), US only everywhere (#385, #386), R3.4 the Decks hub (#387), R3.5a the Deck page (#388) and R3.5b the Measure report (#389). R3.6 the Library (#390, with Rob's two asks: the count cards filter the table, and rows show the name before the mana). R3.7a Explore (#391: the graph page's head and the Add and/or buy dialog). The card-state taxonomy's definition (#392, `docs/card-states.md`, approved 2026-09-26). Step 2a, the Library (#393); 2b, the deck page, the inspector, the ladder and Explore (#394); 2c, the Table view, Ready to add and the exports (#395). Step 3a, the four roles (#396: Upgrade and Reserved outside a box; playable when nothing is Reserved); 3b, the rebuilt v25 backup (#397: 111 substitutes record their seats; the Upgrade Path and the 101 duplicate To Buy entries are gone; To buy 111, Watching 13; Bought on a To Buy list entry fixed). **Rob restores the rebuilt `data/live-state.json`.** R3.8, the landing page (#398: `/` for a signed-out first visit only; invite-only copy; Step one takes a commander, a pasted list or a CSV; four doors; Decks with no decks says "No decks yet"). R3.9, 5:7 cards (#399: one `--card-ratio` token; every card surface sized by its width). R3.9b, sizes are sliders, never steps (#400: Rob, 2026-09-26; AGENTS.md; one card-size scale per device, the stage's picture a slider, both ends proved). R3.10a, a deck by its Archidekt link (#401: the Worker's `/api/import/archidekt`, no sign-in, nothing stored; Rob adds an Access Bypass for `/api/import/*` at release). R3.10b, Start from a precon (#402: `data/precons.json`, 197 Commander precons from MTGJSON, `tools/build-precons.mjs`, a step in the data refresh; one picker from the landing page and the New deck wizard). R3.11, Build a deck (#403: Commander → Strategy → Budget → Review, `crankmagic-build.js`; the strategy chips read off the commander by `CrankStrategies.optionsFor`; Review ends in Create draft or Draft the 99 in the Lab; Create and the Lab are one wizard, per Rob 2026-09-24). R3.12, mobile (#404: at 390 Decks' tiles stack as landscape posters; the Library's actions are one row at the foot, Add cards first; the deck's card follows the card-size slider). **M1's R3 plan is built.** **Now: M6, the AI door, built shut** (`cloud/ai.mjs`, `POST /api/ai/explain`; `docs/ai-door.md` is Rob's five steps and the privacy draft; every one of his four decisions is a gate closed while unset). Then M5, M8, M7, M9, M10. Then R3.8 onward and on through R3.12, then M6, M5, M8, M7, M9, M10. Card size waits for R3.9. EUR is dropped: US only, always (AGENTS.md). R2 waits on Rob turning it on and entering its token. Nothing deployed since 2026-09-24: production is still main 8577a27. **M11 shipped 2026-09-25 (#375):** `docs/architecture/index.html` draws the final state in four views from engram's two graphs (`docs/architecture/.kg`, the code today; `.kg/final`, the plan forward-modeled), with a current-state toggle; `docs/architecture/README.md` says how to re-run it (`docs/architecture/map.sh`, cloud sessions only) and what the map found. Nothing deployed. **Stage 2 shipped 2026-09-24.** Signing in is optional; signed in, the library saves itself to the cloud and follows the person to any device, and when two devices both changed the person is asked which to keep (the other held 30 days). Access: team `crankmagic.cloudflareaccess.com`; "CrankMagic accounts" guards `crankmagic.com/api/*` with the **Invited** policy — **Rob invites someone by adding their email there**; Google sign-in, with an emailed code as a fallback for library sync only. The design and its proofs: **`docs/plan-account-cloud.md`**; how a release is built, walked and deployed: **`docs/release-pages.md`**. Also shipped: `/privacy`, `/terms`, and admin@crankmagic.com as the only public address (Cloudflare Email Routing to Rob); the builder refuses a release naming any other. |
| **Since Stage 2** | **The first-look list, live 2026-09-25 (#372, walked 21/21 on crankmagic.com):** Rob's list from walking crankmagic.com, plus Grok Bot's UAT of the same build (`docs/uat/2026-09-24-cloud-workshop/`). Card names open the card again (a stray `back` had broken every click); menus are opaque and a second click closes them (the `--v-*` tokens are `:root`'s too); card-name hover shows the card at 360px in Library and in a deck's hundred; the printed cost only (`CrankCatalog.frontCost`; 32 mana values rebuilt); Satoshi headings in the app and the design guide; the Overview's By card type bar; Full guide and SWOT stays on the deck; Explore's chooser no longer waits on 21 MB, its search works, and the graph opens in Inspect; Table S/M/L 30% larger; Subscribe, the mirror, Load Live and the rail note gone, and Rob's collection files are never served. The calls are `docs/decisions-2026-09-24.md` §12. Still owed from the list: **card data that refreshes itself on Cloudflare** — the design and Rob's four decisions are **`docs/plan-data-sync.md`** — and which remaining Menu backup/share entries stay. |
| **Next for whoever picks this up** | **M11 is done (#375); the architecture page is `docs/architecture/index.html`, and its README lists what the map found. Rob approved the order and the decisions on 2026-09-25 (`docs/decisions-2026-09-25.md`); continue it from the Doing line.** **Start with `docs/handoff-2026-09-25.md`**: the lossless hand-off, meaning where it stands, what waits on Rob, the rules that stand, every procedure, and what used to be local. Nothing outside this repository is needed. github.io is down and the repository is private (2026-09-25, Rob). **The whole road to 100% is `docs/plan-to-100.md`**, milestones M1–M10, everything in the cloud, with Rob's decisions gathered at its foot. **First, M1: the r3 design refresh.** It arrived 2026-09-25 (`docs/design/2026-09-25-redesign-r3/`), with a landing page, Settings, an account chip, Play in three views and 76 wireframes. Its evaluation and the R3.0–R3.12 plan are that folder's `INTAKE.md`, and **Rob approves the plan before any of it is built.** In parallel: M2, card data refreshing on R2 (`docs/plan-data-sync.md`, waiting on Rob's R2 and token), and M4, the engine to Rob's seven decks. Play in the cloud is M5. Grok Bot's four-agent playtests are M8. Known limit: `tests/uat/crankmagic-journeys.mjs` predates V.4b. |

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
