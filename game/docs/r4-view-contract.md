# r4 additions to CrankRoomView@1

CH-56 adds descriptions to existing decision options. It changes neither the legal answer nor the option index.
Only the answering seat receives its decision; observers continue to receive `decision: null`.

- `controllerId`: numeric engine seat id, including zero. For a player target it is that player. For an object it is
  its current controller (or its stored controller outside the battlefield).
- `effect`: a display verb taken from the engine script, such as `Destroy`, `Exile`, `Tap`, or `Deal damage to`.
  An unknown effect omits the verb; callers must retain the original question rather than guess.
- `affected`: the object id the question acts on. Player targets never carry a card id here.
- `targetGroups`: each chosen target instance as `{index, effect?, targets}`. A counted instance keeps its selected
  targets in one group. Each target retains `{kind, id}` and the descriptive fields above. Unchosen placeholders have
  an empty target list. Three effects with five cards in one instance therefore remain three groups, not seven.
- `optional: true`: the existing effect choice can legally be declined. It appears on the decision and its options.
  An existing empty modal alternative also carries `decline: true`; no new alternative is manufactured.

A single target promotes its `effect`, `controllerId`, and `affected` to the option for the one-target desk. In a
multi-target choice the renderer reads `targetGroups`; the option's `cardId` still names its original acting card.
Names are never added to these descriptors. Face-down targets remain ids, with visibility enforced by the existing
projection. The browser must never treat these display fields as permission to act or to skip a mandatory choice.

Proof: `node tests/engine-decision-facts.mjs`; deliberate breaks:
`python game/tools/batch/breaks.py game/tools/batch/breaks-decision-facts.py`.
