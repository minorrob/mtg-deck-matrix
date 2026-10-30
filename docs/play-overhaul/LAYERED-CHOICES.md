# Conditional choices in Play

October 29, 2026. Request: replace the Cartesian product of modes, targets and payments with one conditional decision at a time, using one pop-up for the entire action sequence. Optional opportunities remain in the drawer. Required answers, including whether to take a pending “may,” belong in the pop-up.

## Assessment

The approach is valid as a reusable presentation function over engine-authorized alternatives. It is not safe as a function that parses concatenated labels or generates independent target/payment combinations. The engine's existing indices remain the only submission contract.

`crankmagic-choice-flow.js` is the reusable artifact. It knows nothing about Magic, card names, mana, the DOM, or network requests. Each alternative supplies a path of typed nodes with stable values and display labels. The runner filters the original alternatives by the selected prefix, offers the next branches, passes through single branches automatically, and returns one original index only after explicit confirmation. Variable depth, missing stages, repeated stages and shared continuations use the same algorithm. Different alternatives with identical descriptions remain distinct; they are never silently merged.

```js
const context = {match, revision, seat, choice};
let draft = CrankChoiceFlow.create(legalOptions.map(option => ({
  index: option.index,
  label: option.label,
  path: option.decisionPath
})), context);

const screen = CrankChoiceFlow.step(draft);
// Render only screen.choices; singleton branches are in screen.trail.
draft = CrankChoiceFlow.select(draft, selectedBranch.id);
draft = CrankChoiceFlow.back(draft); // Removes dependent selections too.
const answer = CrankChoiceFlow.answer(draft, currentContext);
// Send only on Confirm and only when answer is non-null.
```

## Variation represented

| Representative | Variation |
| --- | --- |
| Vigorbloom Charm | One mode; zero, one, or two targets; different mana sources and outputs |
| Boros Charm | Targeted versus untargeted modes |
| Austere Command | Multiple modes with no targets |
| Shadrix Silverquill | Optional modal trigger; two modes must target different players |
| Aetheric Amplifier | Modal activated ability |
| Brago, King Eternal | Any number of targets, including none |
| Plumb the Forbidden | Optional variable number of sacrificed creatures |
| Force of Will | Alternate payment and card exile |
| Village Rites | Sacrifice as an additional cost |
| Swords to Plowshares | A single target |
| Reclamation Sage | A triggered target and optional effect |
| Bala Ged Recovery // Bala Ged Sanctuary | A spell or the land face |
| Dig Through Time | Delve and subsequent card selection |
| Gather Courage | Convoke |
| Martial Coup; Purphoros's Intervention | X, including interactions with modes and targets |
| Eldrazi Confluence | Repeated modes |
| Moment of Reckoning; Collective Effort | Optional number of modes and escalate |
| Monstrous Onslaught; Ponder | Damage allocation and ordering |
| Attackers and blockers | Creature-to-defender assignments and attacker-to-blocker assignments |

## Boundaries and ownership

`game/room/decision-path.mjs` adapts structured engine facts into presentation paths. Card mode wording comes from the compiled card, not rewritten UI prose. Targets retain their identities and controllers. Costs retain their actual cards. Mana retains both source identity and the source's output; spending from the pool remains a separate engine choice when applicable. The change in `actions.mjs` only exposes each already offered tap plan as structured facts; it does not change the plan search or payment rules.

`crankmagic-board.js` owns local drafts and display routing. Selecting an optional action transfers it to the pop-up. While any action draft or required engine question is active, the Actions module is absent from the drawer. Receiving another required question keeps the interaction in the pop-up. Receiving priority after completion returns to optional opportunities. A canceled unsubmitted priority action sends nothing. Cancel on an already pending engine question clears the local draft and leaves Resume in the pop-up; it cannot invent a legal decline or undo costs already paid.

Single-answer decisions use the runner. Counted picks, ordering, and number allocation retain their specialized controls inside the same pop-up. Attack selection uses one creature row and a conditional defender choice; blocking retains the room's whole-assignment validation. Selecting none is never removed merely because only one positive option exists. Match, revision, seat, and choice identity guard confirmation. A new view invalidates an obsolete local draft.

## Visual contract

Mode buttons retain the card's actual wording. Targets and mana sources use card thumbnails plus their names; target ownership disambiguates players. Mana uses the application's image/SVG symbols, including multi-mana outputs, while life payments remain readable text. Confirmation shows each mana source beside its output once; additional spending from the pool or life appears separately, and surplus output retains the selected spending, following Rob’s screenshot feedback. Back, Cancel, and Confirm are explicit controls with 44-pixel minimum touch targets. The pop-up scrolls internally; the game stays within the viewport.

## Validation and limits

`node tests/choice-flow.mjs` checks exact leaf equivalence, conditional visibility, Back, sparse indices, duplicate descriptions, single-option selection and stale context, plus 200 reproducible randomly generated trees.

`node tests/choice-cards.mjs` runs the existing engine simulations for 21 representative cards and 32 cards sampled without replacement using seed 20261029. It inspects intermediate engine decisions and walks every final answer. The expanded pass covered 117 simulations, 830 single-answer decision states and 3,204 leaves with 2,681 assertions. This proves equivalence to the engine's offered actions in those states, not correctness of every card in Magic or exhaustive coverage of the catalog.

`GEOMETRY_REQUIRED=1 node tests/board-choice-flow.mjs` exercises the actual application with real engine decisions in Table, 3D and phone-sized Focus views. It submits the selected Vigorbloom indices back to the engine, verifies payment acceptance, checks the drawer/pop-up exclusion, and captures screenshots when `UAT_SHOTS` is set. `UAT_ART_DIR` optionally supplies cached real card artwork for visual inspection; ordinary CI remains offline.

The engine's existing search limits (including the maximum offered tap plans) remain in effect. The presentation runner preserves every offered alternative and introduces none; expanding the engine's legal-action search is a separate concern. An unknown legacy decision without structured paths remains answerable using its original option text instead of guessing its semantics.
