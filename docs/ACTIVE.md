# Who holds the work

| | |
| --- | --- |
| **Holder** | Free — #321 to #337 all merged; nothing open |
| **Branch** | `main`; nothing open |
| **Since** | 2026-09-22 |
| **Doing** | **Stage A is complete and Stage B is six of eight pieces in.** The board is on the design tokens, laid out as the wireframe's 2×2, and no longer prints what the app carries. Plans: `docs/plan-stage-b-board.md` (the frames, measured), `docs/plan-board-information-layer.md` (Stage A.6 and the extraction skill), `docs/plan-card-extraction-skill.md`, `docs/plan-play-audio.md`. |
| **Next for whoever picks this up** | **Play a game first.** Everything in Stage B has been measured and none of it has been seen with cards on the boards. Then B.6b, B.6c and B.2b — all three want a live surface to judge against. |

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
| B.2 | Four **identical** 16:9 boards in one 2×2. Measured 584×329 each at three widths |
| B.3 | The center counter — 152px, four totals on their own `--seat` colors, the disc cycles life → commander damage → poison |
| B.4 | The hand on the mat's bottom edge. **Zero overlap**, tested with real-sized cards |
| B.5a | The panel slides **over** the mat; the mat stays 1368px whether it is open or shut |
| B.6a | The mat stops printing the steps list and the life box — B.1 and B.3 carry both now |

### What is left, and why each one waits

- **B.5b — the rail overlay.** `/review` is a standalone page. There is no CrankMagic rail on it to
  bring back, so the control would open an empty drawer. It arrives when the board becomes a view
  of the one app.
- **B.6b — the History band.** Not "add a band": 2f wants a real row between the zone pairs, and
  the mat's absolute layout has no gap there. It re-proportions every board's zones, which cannot
  be judged without cards on screen.
- **B.6c — the left pane of the other three boards.** Focus is a modal dialog today; this is the
  structural piece.
- **B.6d — the Coach surface.** 2f says plainly "its logic is a later phase".
- **B.2b — the light mat.** The frame draws the play surface cream (`#e9e4da`) under dark chrome.
  **Rob's call, deliberately untouched** — it changes the whole feel and carries a raw-hex cost.

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
- Restarting mints a **new** cloudflared address unless `COMMANDER_GUEST_PUBLIC_ORIGIN` is passed
  back. Every restart this session preserved `medium-linking-replies-take` that way.
- The adapter is compiled by the launcher at every game start, so a Java change needs no build
  step — but it fails at game start rather than in a test, so compile it against the pinned jar
  before committing.
- `tools/board-latency.mjs` and `tools/first-draw-check.mjs` are read-only and safe against a live
  game. Neither invents a verdict it did not observe.
