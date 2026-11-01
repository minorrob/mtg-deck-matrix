# F4 · The defender's canvas

**Linear:** ROB-367 · **Wave 3** · **Lane:** `crankmagic-combat-block.js` (new), its CSS block, `tests/board-direct-blocking.mjs`,
`tests/board-block-none-all.mjs` (rewritten), `game/tools/batch/breaks-combat-block.py` · **Waits on:** F2, F0c · **Runs
beside:** F3, F6. **Never edits `crankmagic-combat.js`** (seam PR if needed).

Rob, 2026-11-01: the defender's gate is **⛨ Enter combat / ⤓ Take it** (decided).

## Goal

The defender responds and blocks on the canvas: the alert with the two choices; the incoming line; drag or tap a
creature under an attacker; the room's check drawn on each pair; the tally; Send and No blocks. The blocker desk
(`blockDraft()`) retires; the accessible option list stays, hidden by default.

## Hard rules

I1, I4 (pairs dashed and private until Send), I5, I6 (Take it sends `passCombat`), I9, I11 (`kills`/`dies` from the
block options' `hints`), ROB-26's check rules (one check in flight, keyed by match, revision, decision, legal pairs and
exact indices; a late result discarded; reconnect needs a fresh check), ROB-333 (one press for no blocks on all).

## The specification

### The gate

On the `attack` event that includes an attack at this seat (or its planeswalker or battle), while the seat is not the
attacker: a small centered alert, INCOMING with the attackers' thumbnails (public), **⛨ Enter combat** (primary) and
**⤓ Take it**. Enter → `CrankCombat.enter(view, "defender")`. Take it → `{type: "prefer", passCombat: …}` (F0c); the
canvas still shows the public picture (F2) because the morph is the table's, but no blocking controls. The gate is
skipped when `view.passingCombat` is set, when the seat has no untapped creature and nothing castable (then the room
passes as today), or when the switch "Stay on my board during others' combat" is on and the seat is not attacked.

### The incoming line and the muster

In F2's layout for a defender viewer: the attackers aimed at this seat across the top band (the incoming line), each
with its arrow back to its owner's shadowed mat and its P/T; this seat's creatures at the bottom (the muster): those
in the `declare-blockers` options bright, the rest dimmed with a glyph. Attackers aimed at other seats are in their
own fronts, read-only.

### Pairs

- Drag a muster creature up under an attacker (or tap creature, then tap attacker): if `legalBlocks` has the pair, the
  option's `index` joins `picked`; the creature moves (`moveTo`) to the approach slot under that attacker; the arrow
  `{from: blocker, to: attacker, style: "draft"}` appears; a second blocker fans beside the first. Drag off (or tap
  the blocker, then tap empty ground) clears that blocker's pairs. Illegal pairs do not ring and cannot be dropped.
- The room's check runs as `checkBlocks()` does today after every change; the result is drawn on the pairs: pulsing
  outline while checking, solid (seat color) when `ok && open`, red with ⚠ when refused; the ⚠ opens the reasons (the
  room's own words, per attacker from `byAttacker`, global reasons in the dock as "Draft check"). Check again in the
  dock when `!open`.
- The tally on this seat's badge: life this seat would lose as drafted (Σ power of attackers at this seat with no
  blocker in the draft, plus trample's excess over the blockers' toughness where the attacker has trample: a hint,
  from view fields and `hints`), and for each pair ✓/⇄/☠ from the block option's `hints`.
- The dock: `⛨ 2 · ⊘ 1  ✓ Send  ⊘ No blocks  ≡`. Send is enabled only on a current accepted check (ROB-26's rules);
  No blocks is ROB-333's one press (the empty-draft check, then send). The per-attacker Confirm/Don't block of the desk
  is replaced by the state glyph on each incoming attacker (✓ blocked, ⊘ unblocked, ⚠ refused).
- After Send: pairs turn solid for everyone (they are in `state.combat` now; F2 draws them). The seat's instants stay
  lit for the declare-blockers priority; Pass in the dock.

### Multiple defenders

Each defender's canvas shows only its own draft; the others' blocks appear as they are confirmed (F2). Nothing of
another seat's draft is ever in the view (the room guarantees it; the board never asks).

## Build steps

1. `write-ui-copy` for the gate, the dock, the state glyphs, the reasons' presentation.
2. Rewrite `tests/board-direct-blocking.mjs` (Full 1024×768, 1280×720, 1400×900; Table and Focus 1280×720; every check
   state; a stale result discarded; reconnect requires a fresh check; menace and multiple reasons; nine attackers; twins;
   a blocker that left mid-draft; the tall-line cases; the gate's three skip conditions) and `tests/board-block-none-all.mjs`.
   Watch them fail.
3. `crankmagic-combat-block.js` registering `block`.
4. Retire `blockDraft()`; keep the option list behind ≡.
5. `breaks-combat-block.py`: a draft shown to another seat; Send enabled on a stale check; a reason not drawn; a pair
   accepted that `legalBlocks` lacks; Take it answering locally. All caught.
6. `room-block-check` unchanged and green; `a11y-board`; the no-leak harness; the journey; pins; `visual-acceptance`.

## Proof

`GEOMETRY_REQUIRED=1 node tests/board-direct-blocking.mjs`; `node tests/board-block-none-all.mjs`;
`node tests/room-block-check.mjs`; `node tests/a11y-board.mjs`; the breaks runner.

## Done when

- [ ] A full set of blocks by drag, by tap and by keyboard produces the same `indices` as the desk would.
- [ ] Every check state is visible and tested; no draft reaches another seat.
- [ ] Take it is carried by the room; the three skip conditions hold.
- [ ] `ROB-26-DIRECT-BLOCKING.md` and `R4-B-COMBAT.md` carry the superseding note.

## Risks and what to watch

- **The check's serialization** is subtle and already proven (ROB-26); port its state machine as it is (`blockPending`,
  `blockResult`, `blockKey`), do not redesign it.
- **Instants before blocks.** The `declare-blockers` decision may not have arrived yet when the gate fires (the seat has
  priority in the declare-attackers step first); the canvas shows the incoming line and the hand lit, with the muster
  dimmed until the block decision arrives. Do not let the player draft pairs before `legalBlocks` exists.
- **Required blocks** (ROB-149, future): an empty answer may become illegal; No blocks then shows the room's refusal
  and the required pair outlined ⚠.

## Choices you will face

- *Show a blocker's own hints before pairing?* Yes, on hover over an attacker: the block option's ✓/⇄/☠ for that pair.
- *Allow drafting pairs while a check is in flight?* Yes (ROB-26 queues the latest form); Send waits for the current result.
- *The attacker's trample and my tally disagree with the engine's eventual division?* The tally is a hint; the engine
  decides the division (F5). Say "as drafted" in the accessible name, never a promise.
