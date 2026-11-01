# F3 · The attacker's canvas

**Linear:** ROB-366 · **Wave 3** · **Lane:** `crankmagic-combat-attack.js` (new), its CSS block, `tests/board-r4-combat.mjs`,
`tests/board-attack-all.mjs`, `tests/board-attack-risk.mjs` (rewritten), `game/tools/batch/breaks-combat-attack.py` ·
**Waits on:** F2, F0b, F0c · **Runs beside:** F4, F6. **Never edits `crankmagic-combat.js`** (seam PR if needed).

## Goal

The attacker declares on the canvas: the gate at beginning of combat, the muster with every creature's state, drag or
tap a creature to a front, hints from the engine, All at, No attack, the dock, Confirm. The attack pop-up
(`attackDecision()` in `crankmagic-board.js`) stops being the default and remains the keyboard path; `attackRisk`'s
board-side inference retires.

## Hard rules

I1 (the muster is exactly the engine's options), I4, I5 (the gate is the only pop-up), I6 (No sends `passCombat`), I7,
I9, I11 (hints only from `hints` on the options), decision guide 14, 15.

## The specification

### The gate

Shown when **either** arrives first for this seat as the active player: beginning-of-combat priority (`view.decision.kind
=== "priority"` with `state.phase === "COMBAT_BEGIN"`), or the `declare-attackers:<turn>` decision; **only if** the
options contain at least one attack option or at least one castable (`act: "cast" | "activate"`). Otherwise no gate
(decision guide 15). The gate is a small centered pop-up (ROB-208's frame): ⚔ with the count of creatures that may
attack, **Yes** (primary) and **No**. Its words go through `write-ui-copy`. **Yes**: `CrankCombat.enter(view,
"attacker")` and the muster appears; the beginning-of-combat priority, if that is where we are, remains the player's
(Pass is in the dock). **No**: `{type: "prefer", passCombat: {turnId, combat}}` (F0c) and the gate closes; the canvas
does not open. If `view.passingCombat` is already set, no gate.

### The muster

Every creature the seat controls, from the view: in the engine's attack options → bright and raised (`lift(id,
"ready")`); not in the options → dimmed with one glyph (💤 summoning sick when `view` says so, ⟲ tapped, ⊘ otherwise;
the engine's words for "why" one press away where the option set carries them). Twins carry `combatWords`' `#n` in
their accessible names only.

### Drag and tap

- Drag (pointer events, as ROB-328's hand drag: lifted after `HAND_LIFT` px or a `HAND_HOLD` touch): a ghost follows;
  legal targets ring (`CrankCombat.ring`): the badges of defenders the engine offers for this creature, its
  planeswalkers, its battles (one option each); the wall under the pointer dims the creatures in `hints.couldBlock`'s
  complement (those that cannot block) and lights the ones that can. Release on a target: the local draft gains the
  option `index`; `CrankCombat.moveTo(id, {front, slot})` into that front's approach row; `CrankCombat.arrow({from: id,
  to: target, style: "draft"})`. Release elsewhere: nothing changes.
- Tap: tap the creature (targets ring), tap a target (same result); tap the creature again or a lane card to withdraw
  (`moveTo` back to the muster, arrow removed).
- Keyboard: the existing option list (`attackDecision()`) opens from the dock's ≡ button and stays the accessible path;
  picks made there show on the canvas and vice versa (one `picked` array).

### Hints (from `hints`, F0b)

Outline on each attacker **once it is on an approach**: safe `✓` green if no `couldBlock` entry has `kills`; trade `⇄`
amber if some entry has `kills` and `dies`; dies `☠` red if an entry has `kills` without `dies`; `tax` as a mana glyph
on the badge when attacking there costs; `evades` as a small ⤳ on the arrow. The **tally** on each badge, updated on
every draft change: Σ power of unblocked-if-no-blocks attackers assigned there (hint, from `view` power), the number of
wall creatures that can block any of them, the number of your attackers that could die there. Glyph plus number, no
sentences.

### All at, No attack, the dock

⚔ all on a badge: picks, for every creature with an option at that defender, that option, keeping other picks
(`board-attack-all`'s existing semantics). The dock (`CrankCombat.dock`): `⚔ 3 ⤳ Maya · 1 ⤳ Sam  ✓` with Confirm
(disabled while `picked.length < d.min || > d.max` or `sending`), ⊘ No attack (sends `indices: []` after the same
room check path as today, i.e. the declare-attackers answer with nothing), ≡ (the list), and Pass where the step has
priority. Confirm sends the engine's own `indices` with the revision guards exactly as `board-confirm` does today.

### After Confirm

The canvas stays (public picture from F2). The dock shows Pass and the stack when the seat has priority; instants are
lit in the hand (the existing `✦`/`why` logic). Nothing else changes.

## Build steps

1. `write-ui-copy` for the gate, the dock and the glyphs' accessible names. The pop-up frame is ROB-208's.
2. Rewrite `tests/board-r4-combat.mjs` (drag with real pointer events and `document.elementFromPoint` hit-tests at 1024×768,
   1280×720, 1400×900; tap path; keyboard path; All at; None; taxes; twins; planeswalker and battle targets; a Doran
   board's hints; revision guards; a table that moved on mid-draft clears it; no gate without options; `passingCombat`
   suppresses the gate), `tests/board-attack-all.mjs` and `tests/board-attack-risk.mjs` (now asserting hints come from
   `hints`, not computed). Watch them fail.
3. `crankmagic-combat-attack.js` registering `attack` with `CrankCombat.register`.
4. Retire `attackRisk` and make `attackDecision()` the list behind ≡.
5. `breaks-combat-attack.py`: a hint drawn without the engine's field; a draft sent without Confirm; a target offered
   that the engine did not; the gate shown with no options; No answering locally instead of `passCombat`. All caught.
6. Run `a11y-board`, `board-flat-views`, the no-leak harness, the journey; pins by tool; `visual-acceptance` in Table,
   Focus and 3D.

## Proof

`GEOMETRY_REQUIRED=1 node tests/board-r4-combat.mjs`; `node tests/board-attack-all.mjs`; `node tests/board-attack-risk.mjs`;
`node tests/a11y-board.mjs`; the breaks runner.

## Done when

- [ ] A full declaration by drag, by tap and by keyboard produces the same `indices` as the old pop-up would.
- [ ] No hint is drawn from anything but `hints`; `attackRisk` is gone.
- [ ] The gate appears only with something to do; No is carried by the room.
- [ ] `ROB-319`'s `LAYERED-CHOICES.md` carries the superseding note for attackers.

## Risks and what to watch

- **The beginning-of-combat priority.** When the gate fires there, the engine has not asked for attackers yet; the
  muster shows the creatures that *could* attack from the view (untapped, controlled since the turn began, as the
  engine's own `summoningSick` would say) **only as a preview** with no picks allowed until the declare-attackers
  decision arrives; then it becomes the options. Do not infer legality for the preview beyond what the view states;
  if you cannot, show the muster bright only once the decision arrives.
- **Taxes with a payment choice.** The engine may follow Confirm with a mana question (Propaganda, two sources): the
  pop-up handles it over the canvas (I5).
- **Forced attacks** ("attacks each combat if able"): the engine's `min` and required options; the dock's Confirm
  stays disabled until satisfied, and the required creature's outline says so (⚠ with the room's words).

## Choices you will face

- *Open the canvas at Main 1 so sorcery-speed enablers can be cast "in" combat?* No. The rules put them in Main 1; the
  player prepares there as at a real table (ROB-357 section 2.1).
- *A creature with options at some defenders but not others?* Only the offered badges ring; the others stay plain.
- *The player drags to a wall creature?* Not a target; ring nothing, drop does nothing. Attacks go to players,
  planeswalkers and battles.
- *Show the tally for the whole table or per front?* Per front (cumulative as drafted) by default; hover a front with a
  creature in hand to preview "if only this one".
