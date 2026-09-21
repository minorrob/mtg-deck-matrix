# Who holds the work

| | |
| --- | --- |
| **Holder** | Free — #322 to #327 merged; #328 open and green-pending |
| **Branch** | `main`; `claude/alerts-poison-and-draws` open as #328 |
| **Since** | 2026-09-21 |
| **Doing** | **Stage A is nearly finished and the board has joined the design system.** The plan is `docs/plan-board-information-layer.md`, which supersedes the stage list in `docs/plan-board-onto-the-design-system.md`. |
| **Next for whoever picks this up** | **Stage B** — the board becomes the Play surface of the one app, measured against wireframes 2e/2f, with `game/ui` held to its raw-hex ratchet. Then the **card extraction skill** (API pilot, not Forge). Rob confirmed Stage B is on the agenda *after* the engine work. |

## What Stage A turned out to be

The original Stage A listed four things. **That list was too short**, and Rob's four-player pod
showed why: a game you cannot *follow* is not one you can play. Six findings in a row were all one
finding — the board had the facts and never drew them.

| | |
|---|---|
| A.1 | The lag measurement — and the board that was never connecting at all (`review.mjs` opened Game setup unconditionally for the host) |
| A.2 | A spent prompt is not a decision. Forge never clears `prompt`, so `/^Priority:/` matched an answered string and the board said "Your action" over a dead button. `ui.inputType` is the fact to stand on |
| A.3 | `End game` and `Auto-pass turn` out of the action row; neither lost |
| A.4 | The skipped first draw explained where the player was refused (CR 103.8a, two-player only) |
| A.5 | **Answered.** The starting player *does* draw in a four-player pod — read out of Rob's own match journal, not predicted |
| A.6.1 | A notice with card art and an **OK button**, replacing a 6500ms text toast |
| A.6.3 | History carries the card and says **why** — the reason was already in the label |
| A.6.4 | Incoming damage where blocks are chosen, with double strike counted twice |
| A.6.2 | Poison and your own draw, both present in the feed and never announced |

## B.0 is done, and it is smaller than it looks

`crankmagic-design.css` had **no `:root` block at all** — all 350 rules *and* every token scoped to
`#matrix-v2`, an id the board's root does not carry. Naming `:root` as well publishes the **values**
without the **rules**: the board gets the palette and no element styling.

**The board loads it from `/app/crankmagic-design.css`**, a path the host already served, so the
palette arrives on a page reload rather than a host restart. Verified live: `--color-panel` →
`#231f1b`, radius 18px from `--radius-card`.

`game/ui` raw hex is ratcheted at **463** — today's true measurement across all five stylesheets.
The earlier figure of 402 counted four and missed `guest.css`.

## Two limits found by measuring, which the next person should not re-discover

**The adapter reports exactly nine keywords** — flying, reach, trample, first strike, double
strike, deathtouch, lifelink, infect, wither (`ForgeProbe.java:241`). Menace, protection,
indestructible, shadow and fear never leave the engine. Widening that is a Java change and a
rebuild. `incomingAt` takes the union of whatever arrives, so they pass straight through when it
happens.

**Two of Rob's alerts need card text, not events.** "Exiled with a return condition" and "a
mechanic triggered by other players" cannot be derived from the event stream. They are the first
consumer of the **card extraction skill** — the knowledge would be read by the board, not only
written by the pilot.

**Both limits are the Forge adapter's, and PR #305 answers them.** `docs/engine/PLAN.md` §3.4
specifies `CrankCardScript@1`, where keywords are `abilities[]` per card (no hand-list to fall
behind), a conditional exile is an `effects[]` primitive with an `until` duration, and an ability
that watches other players is a `triggered` ability with a `condition`. **Rob's "card extraction
skill" and §3.4's model compiler are the same mechanism** — it already calls the Claude API with
the schema as a tool definition. So the skill should emit `CrankCardScript@1` rather than a format
of its own; two card-semantics vocabularies across a 30,000-card pool is exactly the debt that plan
exists to avoid. Written that way the same artifact serves the pilot today, the board's two alerts
today, and the engine later with no migration. The full comparison is at the end of
`docs/plan-board-information-layer.md`.

## Standing facts for the next session

- The host serves `game/ui/*` **per request**, so UI changes land on reload. Anything the host
  *imports* — `serve-review.mjs`, the gateway, the launcher — needs a restart.
- Restarting mints a **new** cloudflared address unless `COMMANDER_GUEST_PUBLIC_ORIGIN` is passed.
  Both restarts this session preserved `medium-linking-replies-take` that way.
- `tools/first-draw-check.mjs` and `tools/board-latency.mjs` are read-only and can watch a live
  game. Neither invents a verdict it did not observe.
- **A.6.1, A.6.3, A.6.4 and A.6.2 have not yet run against a live game.** The visuals were verified
  against the running host's stylesheet and the rules are unit-tested, but Rob's pod closed before
  they landed. The first new game is what proves them.
