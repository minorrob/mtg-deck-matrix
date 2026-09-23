# The eight open calls, answered — 2026-09-23

Rob answered all eight on 2026-09-23. They were gathered from `docs/ACTIVE.md`,
`docs/plan-stage-b-board.md`, `docs/uat/2026-09-22-remediation.md` and `docs/engine/PLAN.md` §9,
presented with options and costs, and settled in one pass. **This file is the record. The places
each decision came from now point here rather than restating it.**

**A name was settled at the same time: CME.** "CrankMagic Engine" is what we call the Forge
replacement — the work in `game/engine/` and `docs/engine/PLAN.md`. Where a document says "building
the Forge replacement", CME means the same thing.

---

## B.6b — the History band: **option 2, the empty strip**

The band goes at `left:72% top:5.5% width:25.5% height:31%`. No zone moves. Its right edge lands at
97.5%, flush with Exile and Graveyard.

**Why this was safe to choose.** The plan said the mat's right column "carries nothing in the DOM
between 5% and 38%". That was verified rather than taken: `mats.css` does define `.mat-turn-guide`
(left 72%, top 6%, height 26%) and `.mat-life` (left 86%, top 6%, height 17%) in exactly that
region, but **nothing in `game/ui/` ever constructs either element** — they are orphaned styles. So
the band covers printed playmat artwork, not a live element.

**What it costs:** the artwork's steps list and Life box are covered on the right-hand side.

**What was rejected:** re-proportioning (option 1) would shorten the upper pile pair to ~22% and
push the lower to ~74%, making both pairs shorter than a card at small board sizes, on all four
boards at once. The gap available today is 4.8% of the mat — about 25px — against the ~15% a band
needs.

### The row, specified 2026-09-23

Rob, after seeing the first mockup: *"history rows should be smaller height (2 rows not 3) and don't
need to show card image at the surface but should show it on hover. History should include: user,
card, action, target(s) and effects."*

**Two lines per row, no thumbnail, card image on hover.**

| line | content |
|---|---|
| 1 | `T6 · Rob · Cast` — turn, **user**, **action** |
| 2 | `Swords to Plowshares → Odric, Blood-Cursed · exiled, +4 life` — **card**, **target(s)**, **effects** |

Measured in the band: a row is 32px against the feed's 154px, so **four and a half rows fit** and
the rest scrolls. The three-line version with thumbnails held three and a third.

### This is a telemetry change, not only a redraw

Checked rather than assumed. Every row `match-telemetry.mjs` emits carries
`{turn, phase, kind, cardId, name, playerId, label}`.

- **user** (`playerId`) and **card** (`name`, `cardId`) are real fields. Nothing to do.
- **action**, **target(s)** and **effects** are all flattened into the single `label` string —
  casts append `· targeting X, Y` (line 70), player damage reads `3 combat damage to Krenko`
  (line 56), a death carries `· earlier this turn: 3 damage from Odric` (line 54).

So telemetry must emit `action`, `targets[]` and `effects[]` as fields and **derive `label` from
them**, so the side panel and everything else reading `label` keeps working unchanged.

**Effects needs the most work.** A resolution event says only `Resolved` or `Resolved without
effect`; what actually changed arrives as the zone-change, damage and counter events that follow.
Telemetry already correlates a cast to its resolution through `castEventId` chains, so the hook
exists — collecting what followed the resolution onto that chain is the new part. Everything else is
rendering.

---

## B.2b — the light mat: **stay dark; light is a post-release enhancement**

The board stays dark. The cream play surface (`#e9e4da`) is not dropped, it is deferred past
release.

**There is no toggle to remove.** A search of `game/` for a light-mat control found none — no
`lightMat`, no `mat-theme`, no setting. The cream exists only as the frame's intent. Nothing to
comment out, so nothing was.

---

## B.7 — the "Onboarding your cards" header: **option 1, leave it — and finish the capability**

The header stays as written. It names the finished feature, and the feature is now a priority
rather than a someday.

**Rob, 2026-09-23:** the AI card-onboarding capability is a priority for **both** the local host and
CME. It stops being a disclosure about what is missing and becomes the thing that makes a deck
playable.

This is the same decision as §9.6 below — see there for what it has to do.

---

## U-09 — the ten-second self-start: **option 3**

The countdown holds until every **human** seat is occupied, then runs. An all-AI pod starts exactly
as it does today. A table with a person in it waits for the person.

---

## U-07 — `Deck workshop ↗` and `Game setup` on the live board: **split, after investigating**

Rob asked what the two links actually were. They are not the same kind of thing, and the earlier
recommendation ("hide both during a live match") was wrong for one of them.

| | |
|---|---|
| **`Deck workshop ↗`** | `review.html:2` — a plain `<a href="/app/#decks" target="_blank">`. Pure navigation away from the board. No gameplay function. |
| **`Game setup`** | `review.html:2`, wired at `review.mjs:921`. Opens the `game-setup` dialog; in guest mode it relabels itself `Table lobby` and goes to `/`. |

**`Game setup` is a gameplay control.** During a live match its dialog carries `End current game`
(`setup.mjs:139`, behind a two-click `End game · keep journal` confirm) and `Return to game`
(`setup.mjs:70`). `End current game` lives there because Rob moved it there on 2026-09-21: *"End
game shouldn't be a permanent fixture in the top right action box. (Don't want accidental clicks of
it)"*. Hiding `Game setup` during a match would delete the only way to end a game and undo that
decision.

**So:** `Deck workshop ↗` hides during a live match. `Game setup` stays, always.

**Constraint:** `game/tests/host-routing.test.mjs:38` asserts the page markup contains `Game setup`,
so it remains in the HTML whatever the runtime visibility.

---

## R1–R5 — what the cloud lobby is for: **option 3, a pointer**

The cloud lobby says "open the local host to play" and does nothing else. **U-02, U-03 and U-04 are
retired outright** — they described behavior the lobby will no longer claim. R3, R4 and R5 are not
built.

---

## §9.6 — what may sit at a table: **the threshold is replaced by a capability**

This was framed as "what share of cards must be `verified` before the default flag flips at G4".
Rob's answer removes the threshold rather than setting it.

**Rob, 2026-09-23:** *"I want, immediately, any 100 cards someone brings to the game to be playable,
starting with my 7 decks, but once B7 is in place we wouldn't need to pass through the playability %
of a deck, it will always be 100% after the card load from b7 fills any gaps between what is
initially marked as playable and the remaining cards to get to the 100."*

**What this means, stated plainly:**

1. The target is **any Commander-legal hundred, playable on arrival** — not a percentage of a pool.
2. His seven decks (477 distinct cards) are the starting point, not the finish line.
3. **B.7's onboarding is the mechanism.** At deck load, whatever is not already playable is
   compiled, and the deck reaches 100% before the game starts. The percentage stops being a gate
   because nothing is ever seated below it.

**What this requires, and none of it is free:**

- **Compilation moves to deck load.** `PLAN.md` §3.4 has the compiler as a batch pre-pass over the
  pool. It now also has to run just-in-time, on the gap between a deck's hundred and what is already
  defined — typically tens of cards, not thousands.
- **A cache is mandatory, not an optimization.** A card is compiled once and reused forever, or the
  same hundred costs money every time it is loaded.
- **B.7's panel is that step's UI.** The onboarding view — real ratio, live card names — is already
  the right surface for "filling the gaps in this deck". The two work items are one.
- **A failure path.** A card the compiler cannot produce a definition for still has to do something
  other than hang the load. Principle 6 says unsupported is loud: the deck load reports which card
  and stops, the way `engine-runtime.mjs` already refuses a pod by name.

**Unchanged from the original decision:** measured play requires `verified`; casual play seats
`compiled` cards behind a visible per-card label; `unsupported` always blocks.

---

## §9 — pooled commander damage: **dropped; the rules govern**

**Rob, 2026-09-23:** *"Commander damage should be done in line with the game rules."*

CR 903.10a is per commander. The pooled house option from the 2026-09-15 plan is not built, and
`commander.mjs` carries no rules option for it. This closes the "still open, small" item in
`PLAN.md` §9.
