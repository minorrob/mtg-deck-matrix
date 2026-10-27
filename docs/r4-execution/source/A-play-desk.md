# Session A · Play desk and decisions

Repo minorrob/mtg-deck-matrix. Branch `claude/r4-a-desk` from `integration/r4` after D1 has merged. PR against `integration/r4`; do not merge. If E's PR is not yet merged, build against the field contract in E's packet (CH-56) with a fixture, and rebase when it lands.

Read first: `00-task-list.md`, `01-unified-change-set.md` §0–§2 (X1, X10 especially) and §3.2, §1 (RQ-12), `AGENTS.md`, `docs/ACTIVE.md`, Design System READMEs `Drawer`, `DecisionSlot`, `Button`, `FormControls`, the reference image. Frames: walkthrough W01, W02, W03, W04, W14 (left), W15 (all r2) and their element indexes. Source today: `crankmagic-board.js` `decision()`, `deskCard()`, `commitReview()`, `selectionSummary()`, `sameStacks()`, `grouped()`, the card menu rows; `game/engine/script/bind.mjs` `countedChoice` for the question title.

## Scope

CH-10 … CH-17. Files: `crankmagic-board.js` decision/desk functions only (`decision`, `deskCard`, `commitReview`, `selectionSummary`, `grouped`/`stackOpt`, the "ways" branch, card-menu rows), their CSS in `crankmagic-stage.css`. Not: combat (B), card/table interactions (C), drawers/slot chrome (D1), Coach (D2).

## Change

1. **CH-10 Decision block.** Render every decision in the DS order: `cm-pick` spell (art thumb, name, type line, controller chip "You"), the `h2` task sentence, `cm-steps` only when the decision has more than one step (the current step inverted to ink), the pick, `cm-consequence` ("If it resolves: …" from the engine's effect words), `cm-decide-actions` (one primary, one way back, Cancel as a quiet third when Back exists).
2. **CH-11 One target (W01 r2).** Compact row: source thumb (¼–⅓ of the desk card, `desk-target-1-M01`) → verb (`T02`, 12px, nearly on the arrow) with the target's controller under the arrow (`T03`, no arrow of its own) → target thumb (`M02`); both thumbs pop the large card on hover. Large affected card (`M03`, RQ-08.1). Question `T04` in the h2 style: "[Verb] [Player]'s [Card]?", "your" for own, "this" when source = target, 's after s, "face-down creature". No "[Card]: choose one target" title on this screen. Buttons: verb primary (`C02`, the binding press, disabled while sending or when `draftRevision !== view.revision`; the sr-only "Selected: …" live region stays), Change target (`C03`), Cancel (`C04`) which reads "Don't [verb]" for an `optional` effect and declines it. No Confirm / Clear step after this (`commitReview` folds into the verb button).
3. **CH-12 Many targets (W02–W04).** Summary question ("Destroy 3 artifacts of 2 players?"); a quadrant container where a quadrant exists only when filled; source top-left for 1–2 effect groups, centered with the groups around it at 3 (D2); past 3 groups a pager, not scroll (D3); targets with the same effect share a quadrant as a stack with a ×N badge, four visible layers, any count behind (D4); click or Enter/Space cycles the top card under with a 250ms slide (crossfade under reduced motion) and a "1 of 5" helper; every target shows its controller; no hidden card drawn.
4. **CH-13 Targets grouped (W15 r2).** Options grouped under a header per controller, You last, the folded Lands group (#885) nested in each; grouping replaces the "(Keith's)" suffix (the sr label keeps it); hover pops the card; same grouping for bounce, tap, gain control; Next and Cancel as compact text-style buttons apart from the option tiles.
5. **CH-14 Single action (W14 left).** A card with one legal action: no option row; the primary is "⤓ Play Card" / "✦ Cast Spell" / "⚡ Activate" per type; the "Select an option to review it…" sentence goes everywhere (the DS block says what happens instead).
6. **CH-15 RQ-12.** Ways/modes/may: Cancel. Targets and costs (sacrifice, X, divide, pool, waterbend): Back + Cancel. Question screen: Change target + Cancel / Don't [verb]. Escape = the way back. Nothing is sent before the binding press, so Cancel is board-side.
7. **CH-16 Copy.** Sentence case; verbs with counts ("Destroy 3"); one word per thing; no instructional paragraphs.
8. **CH-17 Buttons and inspect.** Options at `control` 14/700 40px; chosen inverts to ink (`aria-pressed`); the inspector opens from the 🔍 row or right-click, never the primary click (D5 lives in C; here only ensure the desk never steals the single click).

## Acceptance

- Fixture: Reclamation Sage with three legal targets across two players → W15 grouping (Keith, Maya, You), Next → W01 with the large affected card, the question "Destroy Keith's Smuggler's Copter?", buttons Destroy / Change target / Cancel; one press sends; no second Confirm appears.
- Fixture: a "may" effect → Cancel reads "Don't destroy" and declines; the spell still resolves.
- Fixture (E's three-effect decision): W03 layout with the source centered and three captioned arrows; five targets in one group → W04 stack cycles on click and on Enter/Space with a `cm-stack-cycle` class (crossfade under `prefers-reduced-motion`).
- Fixture: Seachrome Coast → one primary "Play Card", no option row.
- Every desk screen in the flow has a visible way back (snapshot of `cm-decide-actions` per screen); Escape triggers it.
- Element IDs from W01/W02/W15 used as `data-wf` attributes in the fixtures so M's UAT can find them.
- Full, Table, Focus and phone (the drawer as a bottom sheet) at 1440/390 in three themes.

Test: `tests/table-board.mjs` desk cases + `tests/board-choice-stacks.mjs` (extend) + breaks scripts; `tools/local-ci.sh`; one green Actions run. PR title `r4 A: decision block, one/many targets, grouped targets, single-action primary, way back everywhere`. Stop.
