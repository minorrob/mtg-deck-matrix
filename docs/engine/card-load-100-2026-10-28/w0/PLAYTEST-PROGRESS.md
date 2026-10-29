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

ROB-204: root verified external main merge `0aee1474`, exact-head CI canceled rather than green; no full-gate credit.
The merged room optional-count regression passes21 checks. ROB-210 is now In Progress: native actual-card audit113
checks covers Brago combat provenance, zero/one/several blink targets, Thassa up-to-one, Cloudshift/Ephemerate return
control, Flickerwisp saved delayed return and real Claim Jumper searches after reentry. Claim Jumper itself has no blink
target. [BLINK-AUDIT.md](BLINK-AUDIT.md) records the exact patterns and completed quiet browser verification.
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

ROB-210 browser checkpoint: required `board-optional-count-targets` passes 50 checks; new `board-playtest-blink` passes
148 checks across ten Focus/Full actual-room contexts through production GameRoom socket/check dispatch. The initial
default-cache prelaunch failure receives no credit. The initial native-backed fixture retained ordinary stack priority;
root approved matching the canonical `passStack: true` policy, retaining all original assertions. Awaited browser/server
teardown completed before root released native work. Fixture preparation/repeated 60-card decks/storage copies are not
G-3/G-5 Commander acceptance. Original `board-choices` still times out on full-index board startup; its failed baseline
and unrun mutations remain an open gate. No production UI change or full-union credit is claimed.

ROB-209 now has the additive private engine [MODAL-CONTRACT.md](MODAL-CONTRACT.md). Native `engine-cast-stages` passes
52 checks, actual `room-cast-stages` 46. Selecting an old physical-source offer with `staged: true` begins fresh modes,
then per-selected-mode targets, then payment. Stable route/printed-mode/instance/group identities, live native target
constraints, zero/repeated/shared targets, actual Getaway Glamer spree costs and Lorehold Command target offsets are
proved. Saved private proposals and later native funding replay exactly. Back/Cancel leave full engine/RNG/journal
state intact before Pay; actual native funding taps four Plains and casts once. Accepted Pay retry never repays.
Actual actor/source departure withdraws only the private proposal. Native funding retains stage metadata and forbids
Back, including an otherwise valid selected index. Cancel at priority cannot silently cast a supplied option index.

`python game/tools/batch/breaks.py game/tools/batch/breaks-playtest-cast-stages.py`: all 19 mutations caught,
`missed: []`, with both original suite baselines green. Source files are restored after every probe. No funding rule
module or production UI edits are included. Activated/effect-paid/other modal routes and UI consumption remain to audit;
this is a bounded engine contract, not universal modal completion.

Focused affected readers pass unchanged on the assembled dependencies: controller66, decision-facts34, precons-d140,
copy-spell24, W2-stack268, convoke43, targets-up-to44, costs32, room-undo23, replay14, room-yield43,
room-optional-count21, game-table186, Cancel63/room53, Salty71/provocation21, blink113, feature-wiring131 and integrity.
No full suite is duplicated locally. The suite registry now contains the three new suites (687 actual Node suites).

Universal/shared ROB-205 and ROB-209 are not closed by this checkpoint.

## ROB-209 activated / route / cost follow-up

Read-only audit of published `5239d3f6` found concrete unsupported activated/trigger/effect routes, a funded Scepter to
Getaway Glamer additional-cost refusal, Kess/flashback entry-ID collision and missing nonmana escalate Pay facts.
[MODAL-ROUTE-AUDIT.md](MODAL-ROUTE-AUDIT.md) records actual saved-card cases, copied/repeated modes, departed Ao,
observer privacy and the separately approved later committed-question design. W5 owns actual effect-paid/free casting
and received the funded Scepter case. No committed-question implementation is included here.

The approved bounded follow-up adds `CrankActionEntry@1` / `CrankActionStage@1` activation metadata, preserving cast
client schemas. Actual Cankerbloom chooses modes/targets before spending mana or sacrificing itself. Effective ability
reads also handle actual Conspicuous Snoop with Goblin Cratermaker on top. A versioned route isolates selected ability,
face and casting method/permission; actual Kess plus Past in Flames can no longer silently switch between normal and
flashback routes. Old unversioned private drafts withdraw conservatively with engine facts unchanged. Actual Collective
Effort exposes the native count of its nonmana escalate tappers at Pay, and still asks/pays through the native handler.

`engine-action-stages` passes 44 checks; `room-action-stages` passes 42. The latter uses actual Cankerbloom/Sol Ring
and native land taps, with real G/U pool funding options. Native activations require funded pool mana at this boundary;
the test does not claim automatic source tapping. It keeps ordinary stack priority (`passStack: false`) so the actual
ability remains observable after Pay. Private stages and both private/native reversible Cancel preserve full engine,
RNG, journal and history; reload/partial/funding/final replay, stale input, Back, accepted retry, exact one mana plus one
source sacrifice, source departure and legacy private-route withdrawal pass. Spectator/opponent views, using a fixed
event cursor, remain deeply unchanged except revision. This is bounded fixture evidence, not a Commander-load gate.

`breaks-playtest-action-stages.py`: all 13 new mutations caught, `missed: []`. Original cast tests retain their 52/46
assertions; all original 19 semantic mutation probes are caught with `missed: []`, after helper/dispatch reanchors.
No actions, asking, funding, house-pilot, Battle, verifier or production UI module is edited. Shared UI completion and
the remaining committed/effect-paid routes remain open.

Follow-up affected readers pass unchanged: controller66, decision-facts34, top-card-abilities8, flashback36,
alternative-cost19, tiered20, escalate23, modal-triggers18, ability-target23, trigger-targets28, copy-spell24,
targets-up-to44, costs32, Cancel63/room53, Undo23, replay14, yield43, optional21, table186, wiring131 and integrity.
The two new suites bring this checkpoint's actual registry count to 690. No browser or full-suite run is duplicated.

## Committed refinement working checkpoint, unpublished

After published `8e363d95`, root approved a separate private refinement over still-live native mandatory questions.
Local history preserves intermediate source and REDs in `b01dbaf6`, `3287eefb`, `3bde4caa`, `89bcf5aa` and `d2274cfa`;
the approved integration `0130f853` entered by merge `01289298`. These local commits are not a published acceptance
checkpoint. [COMMITTED-MODAL-CONTRACT.md](COMMITTED-MODAL-CONTRACT.md) states the additive schema and exact boundaries.

Current native/controller positives: refinement-controller35 and committed-native60. Actual Ao is refined after death
using saved script/LKI; Shadrix retains zero-or-two modes, distinct players and native optional decline; Scepter/Boros
uses the existing effect handler; real copied spell/ability modes stay locked. A native Magus random roll cannot be
replaced by private mode selection or crossed by Back. An actual unrelated seat departure can leave Ao's visible
question unchanged while its private facts signature correctly expires.

Before adding the preserved generation RED, committed-room158 passed: actual Ao/Shadrix/Scepter and Magus rooms,
original main pending/answered byte-identical, full engine/RNG/journal/history unchanged during child steps, observer
privacy at a fixed event cursor, detached returned data, Back/Cancel boundaries, native optional decline, reload,
partial/final replay and original native confirmation once. Accepted private receipts retain actor/full-payload
ownership beyond the room's 256-entry cache. Old accepted retries cannot reopen a child or answer a later question.

The next actual played three-seat Scepter regression is RED: Maya's selected Cankerbloom departs on concession while
Rob and Trey survive, but the original native cached play question keeps its old ID. A separate valid donated-Shalai
saved-room fixture also demonstrates missing newly legal Cankerbloom targets. Child-only expiry cannot close this
route. W5 owns the isolated native derive/refresh API and optional state epoch; this lane owns current room/table
starts, authoritative drive/reload refresh, private expiry, exact-current-ID house answers and conservative standing
answer binding. No native cached-index substitution or old-question restoration is authorized.

The captured pre-version `sourceChoices: true` fixture has 17 actual native inputs, native choice `play:0:5`, 94 events,
state hash `7e55d96710ee133e` and journal hash `a7eb986f187bfda2`. Historical replay already reproduces those exact
values. New live starts force `effectPlayVersion: 1`; unsupported saved epochs are refused. The new current-state
assertion remains RED until W5's optional state field/API dependency is integrated. Historical absence remains absent,
not a zero field. Migration of old live matches and current operational/card-load acceptance remain open.

The separate restore cursor fix `f7090a12` is reviewable independently: restore resumes at journal sequence plus one,
matching normal writes. Cursor31 and its one causal mutation pass, preserving actual retained events/floors and exact
next-event delivery; original stream32, projection93 and replay14 pass. No journal reset, dropped history or masked
event is involved. [ROOM-RESTORE-CURSOR.md](ROOM-RESTORE-CURSOR.md) records the original RED and stream evidence.

Earlier 37 committed-refinement probes were caught before the latest facts/epoch changes. The final-source spec now
has 44 unique anchors and ten readers, retaining the entire original eight-reader baseline. It is not credited until
the generation REDs are fixed and that full baseline and all probes run. Focused current readers pass: cast52,
activated44, controller66, Cancel63/room53, table188, replay14, stream32, projection93, yield43 and feature-wiring131.
`room-resolve-all` was inadvertently included in a focused command and prelaunch-skipped on the missing default
browser cache; no browser ran and no credit is claimed. No rerun was attempted during the other workers' native work.

Shared ROB-205/209, UI consumption, full Actions, wave 0 and every card-load gate remain open. No cards are added or
promoted. The new fixtures are bounded regressions, not G-3/G-5 Commander-load acceptance.
