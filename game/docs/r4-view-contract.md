# r4 additions to CrankRoomView@1

CH-56 adds descriptions to existing decision options. It changes neither the legal answer nor the option index.
Only the answering seat receives its decision; observers continue to receive `decision: null`.

- Decision-level `sourceId`: the current source object of a target/cost question, trigger, or paused resolving effect,
  only when its named face is already in that same seat's projection. It is distinct from a target option's `cardId`.
  Resolve it through `state.players[*].zones[*].cards` or an actual face-up spell in `state.stack`; it adds no name,
  permission, or hidden identity. Face-down, unseen, absent, and last-known-only sources omit the field. Never infer a
  replacement from a title, a choice id, a new-zone descendant, or an ability's old stack card reference.
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

## Prepared spell offers (CH-55)

An inset spell is a separate Sorcery or Instant copy in public exile. Its cast option carries `preparedFrom`, the
prepared permanent's card id, so its creature's menu can include that legal option without guessing an action. The
prepared permanent projects `preparedSpell: {cardId, name, manaCost}` while the copy exists. The copy's own `cardId`
and the room's answer index remain authoritative; the creature is never cast again to cast its inset.

New table matches persist `preparedTaps: true`: a valid prepared copy can be funded from its controller's untapped
mana sources as a cast from hand can. This changes neither the printed cost nor its timing. Matches without the key
retain their previous offers and replay; manual mana payment remains available. Casting the inset unprepares the
creature, and a Sorcery inset cannot be cast in combat or resolve as a permanent.

Proof: `node tests/room-prepared.mjs` uses the real Studious First-Year // Rampant Growth definition, tests its cost,
timing, source association, resolution and replay; `python game/tools/batch/breaks.py game/tools/batch/breaks-prepared-room.py`.

## A dated result for the existing deck record (CH-59)

New room views carry `resultRecordExpected: true`, persisted through reopen and the finished view. Once the table
settles that finished match, its existing GET/view returns owner-only `gameRecord`. A finished socket view can precede
the alarm's settlement; refresh the table and retry while the expected summary is absent. Legacy rooms omit the flag.

The summary reuses `CrankMagicTableResult@1` and id `game:table:<matchId>:<seatId>`, the existing idempotent library game
command's identity. Fields are `tableId`, `matchId`, `seatId`, own `source: {deckId, deckVersion}` or null, `playedAt`
(ISO, from the settlement clock), `outcome` (`win`, `loss`, `draw`, `unfinished`), `finishReason`, `finishRank` (1 for a
win, otherwise null), `turns`, `pod`, 1-based `seat`, `bracket`, own `commanders`, and `ai`. `opponents` is a list of
`{seatId, name, commanders, ai}` holding public facts. Map `finishRank` to the existing numeric `finish` command field;
the reason belongs in notes/table metadata. No new library write protocol is introduced.

The table saves one summary per human seat and match, before releasing rematch seats. It preserves the original source
and timestamp across retries and reopen. Other players' deck sources, accounts, hands, libraries, seed and tape are
excluded. The same seat's existing downloadable record includes the same summary.

Proof: `node tests/table-game-record.mjs` and `python game/tools/batch/breaks.py game/tools/batch/breaks-result-record.py`.

## Blocking restrictions and refusal mapping (CH-60)

`decision.legalBlocks` remains its existing legal-pair array. Additive `decision.blockReasons` is a list of
`{attackerId, reasons: string[]}` for this defending player's attackers: public restrictions such as menace and flying,
and whether any legal blocker exists. It contains no drafted selection. A refusal from the existing room `check`
adds `byAttacker: [{attackerId, reasons: string[]}]`, mapping actual draft errors to their tiles. A valid check's
`{ok: true, open: true, reasons: []}` shape stays unchanged. Only an answer publishes the selected blockers.

Proof: `node tests/room-block-check.mjs` and `python game/tools/batch/breaks.py game/tools/batch/breaks-block-reasons.py`.

## Public physical facts for land grouping (CH-32)

A projected battlefield card adds `token: true` only for a token, and `attachments: [cardId, ...]` (empty when none).
Each attachment ID must still name a current battlefield object with `attachedTo` equal to this current host ID.
No name, ability or hidden-zone identity is added; face-down cards expose the public relationship and token status
without exposing their face. Stale, departed and moved-to-another-host IDs are omitted, never mapped to a new object.
These fields are absent outside the battlefield. Current derived types, power/toughness and keywords already describe
an animated land; callers must not infer additional rules from these display facts.

Proof: `node tests/engine-projection.mjs`; `python game/tools/batch/breaks.py game/tools/batch/breaks-public-attachments.py`.
