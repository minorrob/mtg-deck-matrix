# Dedicated engine playtest lane

Branch: `codex/engine-load100-w0-playtest`. Base: `fad5f009`.
No cards added or promoted, no UI edits, no gate changes. Root owns integration and full Actions.

## ROB-211 candidate

Native RED: three consecutive four-seat combats dealt six damage each to the weakest seat, despite no provocation
and a different seat's untapped 12/12 trampler. Normal Salty now compares nonlethal pressure on a common life scale,
reduces pressure already applied, and weighs actual recent damage received. Existing threat, loss, lethal and reserve
terms still decide tactics. Other personas keep their prior damage scale.

The room observes committed `GameEventPlayerDamaged` facts and stores a compact public controller/recipient/amount/turn
matrix. Damage decays by half over three table rounds, is bounded at forty per pair, and journal event identities prevent
duplicate accumulation. The matrix survives pilot recreation and room reload. Self damage, prevented damage and life
payments do not create opponent grudges. No card identity, name or hidden-zone facts enter memory. Fresh matches start empty.

An additional actual RED proved layer-two stolen-source damage was attributed to its raw controller (3), although
`controllerOf` was 1. W4 supplied independent `dfe3f377`, cherry-picked as `c4cded49`, to read live derived controller
in existing combat/noncombat damage events. A source leaving after the committed event retains that event's attribution.
Damage from an already-departed source still needs W4's saved-operation/LKI work; this lane does not claim that debt closed.

Proof on Node 22.23.3:

- `node tests/engine-salty-pilot.mjs`: 58 checks. Three real combats, actual retaliation, controller versus owner, layered
  stolen source, duplicate IDs, JSON memory, decay, prevention, self damage/life loss, multiple threats, available lethal,
  and a following real 12/12 trample attack blocked by the reserved 4/4, leaving Sable at one life.
- `node tests/room-pilot-provocation.mjs`: 16 checks. Actual cast/stack/resolution damage, reload, recreated pilot,
  accepted retry, refusal, cast undo preserving prior damage, fresh match reset and deterministic room/journal replay.
- `python game/tools/batch/breaks.py game/tools/batch/breaks-playtest-salty.py`: thirteen caught mutations, `missed: []`
  (eleven together, then the additional lethal and layered-source mutations as a targeted run).
- Affected readers: `engine-scored-pilot` 60, `engine-hard-pilot` 49, `room-seat-pilots` 15, `room-undo-play` 23,
  `game-replay` 14, `pilot-roles` 31, `pilot-policy` 25, `engine-house-pilot` 19. The existing bounded games/replays pass.

The follow-up versions untaped pilot policy with saved pod/room `pilotProvocation: true`. New canonical table/fuzz
launches must set it; an unflagged historical pod keeps the former scoring and receives no new damage memory. Direct
pilot construction uses the current policy. The native suite now has 71 checks, including the historical three-turn
target sequence `[1,1,1]`; the room suite has 21 checks, including actual damage/reopen/replay without the flag. All
seventeen mutations are caught in one run with `missed: []`. This proves this policy boundary, not migration of old
live games or compatibility of every historical engine rule/event change. W5 owns canonical table flags; root owns
canonical fuzz flags. The room also copies W5's `sourceChoices` field into the state creation arguments.

Linear ROB-211 is In Progress. Review/integration and exact-head Actions remain with root; it is not marked Done.

## Remaining intake

ROB-204: root verifies PR932 exact head and CI. ROB-210 remains blocked until that prerequisite is verified.
ROB-205: next implementation is an explicit server-created reversible proposal marker and an additive cancel contract,
with full normalized state fingerprints and no journal effects proving the precommit boundary. Mandatory committed
resolution/operation prompts cannot be silently skipped. W5 owns payment stages; W4 owns saved damage operations.
ROB-209: modes, per-mode targets and payment continuation contract/fixtures remain to implement. UI stays with its owner.
Universal/shared ROB-205 and ROB-209 are not closed by this checkpoint.
