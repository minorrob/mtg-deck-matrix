# The combat canvas: build instructions for every harness

**Linear: ROB-357** (the plan of record, v3, with Rob's words and decisions) and its sub-issues ROB-361 to ROB-372.
This folder is *how to build it*, one file per feature, written so that any model in any harness (Claude, Codex,
Cursor, Grok, or another) produces the same result at each milestone. Linear holds the status and the lock; this
folder holds the instructions; `AGENTS.md` holds the engineering law and wins wherever the two disagree.

Rob, 2026-11-01: *"I want you to set the instructions for each phase so that, regardless of the model or the harness,
we will end up with the same result at each milestone."* And: *"Ensure that we have defined lanes, which should equate
to features within a milestone where sessions could run in parallel and where sessions are known to have
dependencies ... Include the instructions, the risks, and things to look out for ... what to consider when faced with
certain choices that are not clear until the choice presents itself."*

## What is being built, in one paragraph

Combat leaves the header strip, the attack pop-up and the blocker desk. From the attacker's **Yes** at beginning of
combat (or a defender's **Enter combat**) to end of combat, the whole play area but the drawers, the hand and the top
bar becomes the **combat canvas**: the mats fade to shadows; the attacker's creatures gather in a **muster**; each
other seat becomes a **front** (badge, planeswalkers, battles, and the **wall** of its untapped creatures); attackers
slide into **approach** rows; **arrows** run from attacker to target and from blocker to attacker; a small **dock**
carries Confirm, Send, No blocks, No attack. Every change moves the same element along an eased path (the **eye
test**), and every result plays on a **timeline** fed by the room's events, so nothing jumps. Hints (outlines, dimmed
walls, tallies) come from the engine and never decide anything. In 3D the camera lowers into the fight and
**hologram standees** rise from the cards. Sound follows the timeline. Phones come last.

## How a session uses this folder

1. Read `AGENTS.md` whole, then this README, then your feature's file, then the files it names in the code.
2. Follow `.claude/skills/one-loop/SKILL.md` for the Linear and GitHub steps (claim, branch, draft PR, watch, close).
   A harness without the Claude connectors does the same steps by hand and says so in its PR.
3. Build only inside your feature's **lane** (the files it owns; the table below). A change you need in another lane's
   file is a **seam PR**: small, named for what it exposes, merged first; then build against `main`.
4. Prove it the way your feature file says, with a test that fails first (`AGENTS.md`, "A test that cannot fail is a
   comment") and a mutation runner under `game/tools/batch/`.
5. Before marking ready: `.claude/skills/visual-acceptance/SKILL.md` for anything visible,
   `.claude/skills/review-before-ready/SKILL.md` for any code, `.claude/skills/write-ui-copy/SKILL.md` for any word a
   player reads, `.claude/skills/design-reference-and-critique/SKILL.md` where the file says so.
6. The PR body is the handoff, in the shape at the end of this README. Close the loop on Linear in the same turn.

## The invariants (every feature, no exceptions)

| # | Invariant | Where it comes from |
| --- | --- | --- |
| I1 | **The engine decides legality.** The canvas lists exactly the options the engine offered: never a creature it did not offer, never hiding one it did. The board infers no rule (flying, menace, defender, taxes, goad: none). | `AGENTS.md`, "Decisions inside the game belong to the players"; ROB-357 section 2.9; ROB-360 |
| I2 | **Events are the truth of motion.** Anything that animates a result (damage, life, death, a block arriving) animates from `events.v1` in order, through the timeline player (F1), never from a guess or a diff alone. Nothing is shown that the History does not say. | ROB-357 R1, R17 |
| I3 | **The eye test.** *Keep your eye on one card on the mat; through the morph it never jumps.* The same element moves on an eased path; no remount, no absent frame, no teleport. Reduced motion is the one allowed cut, and then it is a cut, never a half animation. | Rob, 2026-11-01; ROB-357 R3 |
| I4 | **Drafts are private.** An unsent attack or block is drawn from local state only and never from `state.combat`; a confirmed one only from `state.combat`. No other seat ever sees a draft. The no-leak harness reads every view. | ROB-26; ROB-357 R10 |
| I5 | **Two gates, one pop-up rule.** The only combat pop-ups are the gates (attacker: Yes / No; defender: Enter combat / Take it). Declarations and damage division live on the canvas. Every cast, ability, target, mode and payment keeps the layered pop-up (ROB-319) over the canvas; the canvas itself never asks a target. | Rob's decision, ROB-357 R7 |
| I6 | **The player's one answer, carried by the room.** No / Take it is the player's (or the AI pilot's) answer; the room carries it for this combat (F0c). The board never answers a question for anyone. | Rob, 2026-11-01; ROB-363 |
| I7 | **Symbols first, words last.** A glyph with an accessible name before a word; the dock is the only place words live; source → action → target always legible; every card one press from being read. | `AGENTS.md`, "Symbols first, words last" |
| I8 | **The game never scrolls.** The canvas fits the window at every size `tests/board-flat-views.mjs` proves; what does not fit shrinks or folds. | `AGENTS.md`, "The game fits the window" |
| I9 | **Accessible by tap and keyboard.** Every drag has a tap path (select, targets ring, select one) and a keyboard path (the accessible option list, hidden by default). Arrows, rows and badges carry names. `tests/a11y-board.mjs` stays green. | ROB-357 R8 |
| I10 | **Hidden information stays hidden.** A face-down card is a back everywhere: muster, wall, arrow label, standee texture, sound. Names come from the view, never from a private zone. | `AGENTS.md`; ROB-26 |
| I11 | **Hints never lie.** A hint is drawn only from a field the engine computed (F0b). Where the engine lacks the rule there is no hint. A hint is an outline plus a glyph, never a block or an answer. | Rob's decision, ROB-357 R9 |
| I12 | **US English, `en-US` formatting, USD only.** | `AGENTS.md`, "The United States, always" |
| I13 | **Know what you cannot prove.** A cloud container proves suites and fixtures. 3D (Babylon), particles, a physical phone and sound are a local session's acceptance; say "unproven until a local session proves it" in those words. | `AGENTS.md`, "Know what you cannot prove" |
| I14 | **Sizes are sliders, never steps.** Any size a player picks (pacing, effects intensity) is a range input. | `AGENTS.md`, "Sizes are sliders, never steps" |

## The module map and the seams

The app has no build step and loads classic scripts that expose a global (`crankmagic-audio.js` → `CrankAudio`,
`crankmagic-stage.js` → `CrankStage`). The canvas follows that pattern so features can be built in parallel without
all of them editing `crankmagic-board.js` (5,300 lines, one file: the collision point of this epic).

| File | Global | Owner | What it is |
| --- | --- | --- | --- |
| `crankmagic-timeline.js` (new) | `CrankTimeline` | F1 | `plan(before, after, options)` turns a view's new events into a paced schedule (pure, Node-testable); `play(schedule, hooks)` runs it; `cut()` jumps to the end; `holding()` says whether a view must wait. |
| `crankmagic-combat.js` (new) | `CrankCombat` | F2 | The canvas core: enters and leaves combat mode, owns the persistent `#cm-combat` layer, the keyed reconcile of fighting cards by `cardId`, the morph (FLIP on the same elements), fronts, muster, approaches, arrows (one SVG layer), the dock's frame, the summary card. Exposes `CrankCombat.register(role, module)` for F3, F4, F5 and `CrankCombat.anchors()` (screen boxes of every card, badge, planeswalker, battle) for arrows, standees and sound. |
| `crankmagic-combat-attack.js` (new) | registers `attack` | F3 | The attacker's gate, muster states, drag and tap to a front, hints, All at, No attack, Confirm. |
| `crankmagic-combat-block.js` (new) | registers `block` | F4, then F5 | The defender's gate, incoming line, pairs, the check's states, tally, Send, No blocks; F5 adds damage division to it. |
| `crankmagic-stage.js` | `CrankStage` | F2 adds the `combat` layout mode; F6 adds the camera preset | The combat layout in table-plane coordinates, projected by every view (`geometry` for 3D, `flatGeometry` for Table and Focus). |
| `crankmagic-holo.js` (new) | `CrankHolo` | F6, then F7 | Babylon layer: standees (H0), particles, the figure library (H1). Loaded only when the 3D view is on. |
| `crankmagic-audio.js` | `CrankAudio` | F9 | Combat sounds on the timeline's hooks. |
| `crankmagic-board.js` | the board | seams only | F1: `adopt()` defers to `CrankTimeline.holding()`; event hooks call the drawing. F2: combat mode on and off, the strip retired, `draw()` does not rebuild `#cm-combat`. F3, F4, F5: none (they register with `CrankCombat`). |
| `crankmagic-stage.css`, `crankmagic-mats.css` | | each feature its own block, marked `/* combat canvas · Fn */` | |
| `index.html`, `crankmagic.html`, `crankmagic-sw.js` | | whoever adds a served file | A new script is added to both pages and the service worker list, and the pins are bumped by tool: `node tools/bump-pins.mjs` then `node tests/asset-versions.mjs --update`. Never by hand. |

**The seams F2 must define** (so F3, F4 and F5 never edit `crankmagic-combat.js`):
`CrankCombat.register(role, {mount(host, ctx), update(view, ctx), unmount()})`, `CrankCombat.anchors()`,
`CrankCombat.arrow({from, to, style, label, id})` and `CrankCombat.removeArrow(id)`, `CrankCombat.dock(html)`,
`CrankCombat.ring(targets[])` and `CrankCombat.unring()`, `CrankCombat.lift(cardId, state)` (raised, dimmed, outline),
`CrankCombat.moveTo(cardId, slot)` (an animated slot change that keeps the eye test). If a later feature needs a seam
F2 did not define, it files a seam PR against `crankmagic-combat.js` first, with the one function it needs.

## Lanes and waves: who can build at the same time

A lane is a set of files. Two sessions never hold lanes that share a file. "Runs beside" lists the lanes a feature may
be built next to at the same time; "Waits on" is what must be **merged to `main`** before it is marked ready (it may
start earlier against the written contract, with a fixture).

| Wave | Feature (Linear) | Lane: files it owns | Waits on (merged) | Runs beside | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | **F0a** step markers (ROB-361) | `game/room/events.mjs`, its section of `docs/ui-lane/gameplay-anchor.md`, `tests/room-events.mjs` | nothing | F0b, F0c, F1 | Contract written in the anchor doc first |
| 1 | **F0b** attack hints (ROB-362) | `game/engine/rules/combat.mjs` (the option builder), `game/room/decision.mjs`, its anchor section, a new `tests/room-attack-hints.mjs` | nothing | F0a, F0c, F1 | Reads `statics.mjs`; does not edit it (ROB-360 may, in its own lane) |
| 1 | **F0c** passCombat (ROB-363) | `game/room/room.mjs` (`prefer`, the pass logic, the view field), its anchor section, a new `tests/room-pass-combat.mjs` | nothing | F0a, F0b, F1 | The only wave-1 lane in `room.mjs` |
| 1 | **F1** timeline player (ROB-364) | `crankmagic-timeline.js`, the `adopt()` seam and event hooks in `crankmagic-board.js`, `crankmagic-stage.css` (its block), `tests/timeline-plan.mjs`, `tests/board-timeline.mjs`, `tests/fixtures/timeline/**`, `game/tools/batch/breaks-timeline.py` | F0a (for the step markers; builds first against the written contract and a fixture) | F0a, F0b, F0c | The only wave-1 lane in `crankmagic-board.js` |
| 2 | **F2** canvas and morph (ROB-365) | `crankmagic-combat.js`, the `combat` mode in `crankmagic-stage.js`, the combat-mode seam in `crankmagic-board.js`, `crankmagic-stage.css`, `crankmagic-mats.css`, `tests/board-combat-display.mjs` (rewritten), a new `tests/board-combat-morph.mjs` (the eye test), `tests/board-flat-views.mjs` (its combat cases), `game/tools/batch/breaks-combat-canvas.py` | F1 | ROB-360 (engine, card load), F9 (sound, against F1's hooks), the F6 shader prototype under `ui-prototypes/holo/` | Alone in the board and stage files; defines the seams |
| 3 | **F3** attacker's canvas (ROB-366) | `crankmagic-combat-attack.js`, its CSS block, `tests/board-r4-combat.mjs`, `tests/board-attack-all.mjs`, `tests/board-attack-risk.mjs` (rewritten), `breaks-combat-attack.py` | F2, F0b, F0c | F4, F6 | Never edits `crankmagic-combat.js`; seam PR if needed |
| 3 | **F4** defender's canvas (ROB-367) | `crankmagic-combat-block.js`, its CSS block, `tests/board-direct-blocking.mjs`, `tests/board-block-none-all.mjs` (rewritten), `breaks-combat-block.py` | F2, F0c | F3, F6 | Same rule |
| 3 | **F6** 3D camera, standees, effects (ROB-369) | `crankmagic-holo.js`, the camera preset in `crankmagic-stage.js`, `assets/particles/**`, the Effects switch in `crankmagic-settings-play.js`, `tests/board-3d-camera.mjs`, `tests/board-babylon.mjs` (extended) | F2 | F3, F4 | 3D acceptance is a local session's |
| 4 | **F5** damage division (ROB-368) | `crankmagic-combat-block.js` (extends F4), a new `tests/board-damage-division.mjs`, `breaks-damage-division.py` | F4 | F7, F8 | |
| 4 | **F8** phone (ROB-371) | phone blocks of `crankmagic-combat*.js` and CSS, the phone cases of the board suites | F3, F4 | F5, F7 | A physical phone is a local session's |
| 4 | **F7** H1 figure library (ROB-370) | `crankmagic-holo.js` (figures), `assets/holo/**`, `data/holo-figures.json`, `assets/holo/LICENSES.md` | F6, and Rob's call on look, source and cost | F5, F8 | CC0 assets only unless Rob decides otherwise |
| 2+ | **F9** sound (ROB-372) | `crankmagic-audio.js`, `assets/audio/**`, `docs/play-overhaul/sound-index-additions.json`, `tests/audio*.mjs` | F1 | F2 onward | Keyed to `CrankTimeline` hooks, never to a view |

Rules of the table:

- **Merge order inside a wave does not matter**; merge order between waves does. A feature marks ready only after it
  merges `main` (a merge commit, never a rebase of a shared branch) and its suites are green on the merged tree.
- **`docs/ui-lane/gameplay-anchor.md` is shared by the three contracts.** Each adds its own `###` section under a
  heading that names its issue; nobody edits another's section. Conflicts resolve by keeping both sections.
- **A seam PR** (one function in `crankmagic-combat.js` or one hook in `crankmagic-board.js`) is opened by the feature
  that needs it, reviewed by reading, merged first; it carries no feature code.
- **The lock is the Linear status.** Claim your feature (In Progress with the `Held by` comment) before touching its
  files; if a feature you need is In Progress by someone else, build against its written contract and a fixture, and
  wait for its merge before marking ready.

## The constants every harness uses (so the result is the same)

| Name | Value | Where it applies |
| --- | --- | --- |
| `EASE` | `cubic-bezier(.2,.8,.2,1)` (the board's existing) | every motion |
| `MORPH_MS` | 400 | the morph in and out, per element |
| `MORPH_STAGGER_MS` | 12 per element, total stagger capped at 200 | muster first, then fronts, then approaches |
| `COMBAT_BUDGET_MS` | 2500 at Overlay 60 (the default); scaled by `clamp(overlay / 60, 0, 1.5)`; Overlay 0 means every duration is 0 | the whole combat's timeline from the attack event to end of combat |
| `EVENT_MS` | attack 240 · block 200 · step 120 · damage 220 · life 160 · move 240 (the existing graveyard flight) · tap 160 · lunge 150 · dissolve 240 | per event before budget scaling; the floor after scaling is 60 unless the budget is 0 |
| `RING_MS` | 180 | targets ringing on tap or drag |
| `ARROW` | stroke 2 px; draft dashed `6 4`; confirmed solid; bundle past 6 arrows to one front into one arrow with `×n` | the SVG layer |
| `SHADOW_OPACITY` | .5 | the mats in combat mode |
| `OUTLINE` | safe `--combat-safe` (green, `#3fb970`), trade `--combat-trade` (amber, `#d9a441`), dies `--combat-dies` (red, `#d9534f`), checking `--combat-checking` (pulse of the seat color), refused `--combat-dies` | hints and check states; always with the glyph |
| `EYE_TEST` | sample every frame; fail if any frame lacks the element, has opacity ≤ .05 while it should show, or its center deviates more than 8 px from the eased path between its start and end boxes | the morph suite (F2) and every later motion of a fighting card |
| `BENCH` | 40 creatures: 60 fps desktop (frame ≤ 16.7 ms, 95th percentile), 30 fps phone | F2, F6, F7 |
| `BUNDLE_WALL` | a wall of more than 12 creatures folds same-named ones into a stack with `×n` | fronts and muster |

## The glyph vocabulary (one meaning each; accessible names in `write-ui-copy`)

| Glyph | Meaning | Where |
| --- | --- | --- |
| ⚔ | attack, attackers | gate, dock, badge (All at) |
| ⛨ | block, blockers, Enter combat | gate, dock |
| ⤓ | Take it (let the attack through) | the defender's gate |
| ✓ | confirm, send, kills and survives (with green) | dock, outlines |
| ⇄ | a trade (both die; with amber) | outlines |
| ☠ | dies (with red) | outlines |
| ⊘ | none, no block, no attack, cannot | dock, dimmed cards |
| ⚠ | refused by the room's check, reason one press away | pairs |
| ⤳ | toward (a target) | arrow labels, dock |
| ⌫ | left the battlefield | arrow endings |
| 💤 ⟲ | summoning sick · tapped | dimmed muster cards |
| ✦ | castable now | the hand |
| color pips | the commander's color identity (the existing mana symbols) | badges |

## The decision guide: choices you will face, and how to decide

1. **The spec and the engine disagree.** The engine and its written contract win. File a Shared contract issue for the
   gap; do not paper over it in the board.
2. **A hint would need a rule the engine does not know.** Show no hint. Never approximate (I11).
3. **An animation would lie or lag behind the truth.** Show the end state. Truth over spectacle (I2).
4. **The frame budget breaks.** Degrade in this order: more stagger → bundle arrows → fold stacks → cap flights →
   instant. Never drop below the eye test by teleporting a visible card.
5. **A word seems needed.** Try a glyph with an accessible name. If a word is still needed, it goes through
   `write-ui-copy`, in US English, as short as the refusal rule allows.
6. **It needs Rob.** A new screen, a removed feature, a changed default, a cost, a departure from an approved design,
   anything about assets' licenses or look: file a **Rob's call** issue with a one-line recommendation, build the
   fallback, do not build ahead of the answer.
7. **You need a change in another lane's file.** A seam PR first (one function, merged first), never an edit in your
   feature branch.
8. **Reduced motion is on.** Everything is instant: the morph, the timeline, the standees, the particles. Never a
   shorter animation; a cut.
9. **A view arrives mid-animation.** Hold it (F1's `holding()`), unless it carries a decision for this seat, changes
   `matchId` or `seat`, or says `eventsReset`: then cut to the end state and paint it at once. Input from the player
   also cuts.
10. **A card is face down or in a hidden zone.** A back, no name, no art, no sound keyed to its identity (I10).
11. **Two creatures share a name.** Arrows end on the exact object; accessible names use the room's `combatWords`
    (its `#n`); never number things yourself.
12. **A suite is flaky.** Fix the cause. Never retry to green, weaken an assertion, widen a tolerance or quarantine a
    test. Document a timing failure and its evidence if you cannot fix it in scope.
13. **The container cannot render 3D or a phone.** Build, prove what you can with fixtures, and write "unproven until a
    local session proves it" in the PR (I13). Do not claim visual acceptance for what you did not see.
14. **Pop-up or canvas?** A declaration (attackers, blockers) or a division: canvas. Anything that chooses a target, a
    mode, a payment, or answers a "may": the layered pop-up, over the canvas (I5).
15. **The engine offered nothing to attack with and nothing to cast.** No gate; combat passes as today. A gate with no
    real choice is forbidden (`AGENTS.md`: a decision only where the rules leave one).
16. **A player turned the bystander morph off.** They still see the public arrows over their shadowed mats; the public
    picture is never hidden, only the morph.
17. **A document or test still describes the strip or the desk** (ROB-26, ROB-208's wording, `R4-B-COMBAT.md`).
    Add a dated "superseded by ROB-357" note in the same PR that retires the behavior; do not delete history.
18. **An approved wireframe shows something else** (`docs/design/**`). Rob's decision on ROB-357 governs combat; for
    anything outside combat, the approved design governs. Surface the contradiction in the PR rather than choosing.
19. **Order of first-strike and regular damage, or of pairs, is unclear from events.** Use the `step` markers (F0a);
    within a step, event order is the engine's order. Never reorder for effect.
20. **The AI pilot's turn arrives as one view.** The timeline plays it inside the budget; a yielding seat is never
    stalled. If the budget is too short to show everything, bundle (several damage numbers in one burst per step)
    rather than drop events.

## The universal done-when (in addition to your feature's own)

- [ ] The feature's suites exist, were watched failing first, and are green; the mutation runner catches each named
      regression (`missed: []`).
- [ ] `tests/a11y-board.mjs`, `tests/board-flat-views.mjs`, the no-leak harness and `tests/feature-wiring.mjs` are green.
- [ ] `tools/local-ci.sh <ref> 0` passes (the secret and personal-address scan, the merge with `main`).
- [ ] Served files added are in both pages and the service worker, and the pins were bumped by tool.
- [ ] Visual acceptance done and recorded per `visual-acceptance` (screenshots inspected, states and sizes listed),
      or reported blocked in those words.
- [ ] Words a player reads passed `write-ui-copy`; US English everywhere (`tests/feature-wiring.mjs` counts).
- [ ] Documents that described the old behavior carry the superseding note.
- [ ] The PR body is the handoff (below); the Linear issue has the PR link and the three lines.

## The handoff (the PR body, kept current)

```
ROB-36x: <what changes>

Branch <name> at <sha>. Wave <n>, lane: <files>.
Proven: <claim>: `<command>`; <claim>: `<command>`; ...
Assumed / unproven: <what, and why: cloud container, no 3D, no phone …>
Outstanding: <what, and why>
Seams used / filed: <CrankCombat.* used; seam PRs opened>
Superseded documents noted: <paths>
```
