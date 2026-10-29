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
ROB-205: Rob explicitly confirmed “Cancel reversible actions; keep committed mandatory choices pending with clear
guidance (preserves the gates).” The engine candidate implements that policy with a server-created proposal marker,
normalized full-state fingerprints, zero committed events and no resolving/rule-operation prefix. A real reveal event
invalidates an unchanged-state proof; silent native mutations fail too. Old unproved pending choices are conservatively
unavailable. The additive private `CrankDecisionCancel@1` contract is in [CANCEL-CONTRACT.md](CANCEL-CONTRACT.md).

`node tests/engine-cancel-decision.mjs` and `node tests/room-cancel-decision.mjs` prove actual convoke costs, later pool
payment, target-to-numeric stages, source mutation, actor departure, optional suffix execution, mandatory committed
life-loss/discard/gain-life resolution, Easy/Normal pilots, reload, retry and stale inputs. Real room cancellation restores
the full engine state, RNG and journal/history with `passAfterCast` and either Undo configuration. It clears abandoned
auto-pass bookkeeping, which the actual initial room regression had wrongly advanced from MAIN1 to MAIN2.
`python game/tools/batch/breaks.py game/tools/batch/breaks-playtest-cancel.py`: sixteen caught mutations, `missed: []`.
Affected readers pass: controller66, decision-facts34, convoke43, targets-up-to44, precons-d140, copy-spell24,
W2-stack268, costs32, room-undo23, replay14, room-yield43, plus Salty71/provocation21. Original assertions remain intact.
W5 owns payment source stages; W4 owns saved damage operations. Shared UI implementation and issue closure remain open.

ROB-209: modes, per-mode targets and payment continuation contract/fixtures remain to implement. UI stays with its owner.
Universal/shared ROB-205 and ROB-209 are not closed by this checkpoint.
