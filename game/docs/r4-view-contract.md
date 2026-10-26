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

## The undo house rule (CH-57 and CH-58)

New tables launch with `houseRules.undoLastPlay: true`, kept in the match pod. Older matches without it retain their
original choices and replays. The room offers a priority option `{act: "undo-play", cardId, index}` only while a private
snapshot is still valid. The answering seat's view then has `canUndo: true` and
`undoablePlay: {cardId, name, kind}`; its played card or stack entry has `undoable: true`. Other seats receive neither
the snapshot nor the permission. Submit the existing answer envelope with that option's index and current revision.

A land's undo restores the land drop; a cast's undo restores the spell and its automatic mana payment. If manual mana
taps immediately preceded the cast, their validated reversible run is restored together as a unit. A new action, a pass
of priority, a step change, a trigger, information exposure, or randomness closes the window. While the window is offered,
the room holds the caster instead of automatically passing for them; their Pass closes it. A saved snapshot is verified
against both its before hash and the current after hash. Each seat's public history says the play was `undone`.

Untapping unspent mana (CH-58) continues to use the existing `{act: "undo-mana", cardId, index}` option and its checks.
There is no second untap command and no browser-side permission to reverse a spent source.

Proof: `node tests/room-undo-play.mjs`, `node tests/room-untap-mana.mjs`; deliberate breaks:
`python game/tools/batch/breaks.py game/tools/batch/breaks-undo-play.py`.
