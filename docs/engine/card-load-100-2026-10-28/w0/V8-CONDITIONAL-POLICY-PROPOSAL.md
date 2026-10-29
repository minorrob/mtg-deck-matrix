# Conditional native scenario policy proposal

Status: proposal and scratch demonstrations only, on published source `55f133f5`. No production runner, saved
scenario, definition, rule, ledger or proof gate is edited. The current selected diagnostic remains4/8 abilities
proved and4 unproved. Nothing here grants new ability, card, whole-game or canonical acceptance credit.

## Bounded action grammar

Examples of the proposed author-declared grammar:

```json
{"actIfLegal":{"cast":"Raging Goblin","seat":0,"source":{"zone":"library","index":0},"targets":[]},"resolveSelected":true}
{"actIfLegal":{"activate":"Conspicuous Snoop","seat":0,"source":{"zone":"battlefield","index":0},"targets":[]},"resolveSelected":true}
{"actIfLegal":{"tap":"Patchwork Banner","seat":0,"source":{"zone":"battlefield","index":0},"mana":{"R":1}}}
```

The initial scope is deliberately small: one cast, nonmana activation or immediate mana activation; fixed physical
source; own MAIN1/MAIN2 priority; no pending question, rule operation, resolving effect or existing stack. Casts and
nonmana activations must expressly request one selected resolution and must be targetless. Any alternative choices
must be fully determined by a unique native offer. More than one match is an ambiguity failure, so Banner needs an
explicit mana vector. The final production grammar should require an explicit actor as shown; the scratch examples
fix actor0 and never derive another actor from the available offers.

This is one native action, not a generic if-offer/then/else language. It cannot branch to unrelated damage, draws,
actions, arbitrary steps, copied game state or fabricated events. All input fields and values are checked. Existing
required actions, `optional` handling and explicit-answer rules stay unchanged.

The actor/source is validated before legality filtering, so a missing/wrong physical card is an error, not an
unavailable branch. Zero exact matches produces a recorded unavailable/no-op branch. A unique match executes that
exact native action. No source, cost, payment, permission or target is invented. Its native result must complete
without asking an unsupported mandatory question. Mana actions must have an actual source-bound native mana event.

For a cast or ordinary activation, the selected frame is bound through the actual emitted
`GameEventSpellAbilityCast`: original physical card ID, actual actor, spell/ability kind, selected ability ID and
native stack ID. A cast changes object identity, so comparing the new stack object's ID directly with the old library
card would be wrong. Only that bound frame may resolve. Extra/intervening frames or any question cause a policy
validation failure; no unrelated top object is resolved by default. The result requires the exact successful native
resolution receipt and completion of that frame. Offers or paid activation costs alone do not meet this contract.

This first slice leaves more complicated timing, target, additional-cost, entering-choice and triggered-frame routes
unsupported. Failure is explicit and gives no proof credit. There is no implicit answer or generic snapshot rollback.
If an unsupported question/frame is discovered after the native action committed, the constructed scenario fails;
the helper does not undo the action or continue to manufacture an outcome. This is a test harness policy, not a new
room/game action.

## Bound replacement answer

The proposed narrow companion is a fixed-label answer to an expected entering choice from the immediately preceding
explicit native spell resolution. It is not a generic “choose if anything is being asked.” An illustrative spelling:

```json
{"chooseEnteringIfAsked":{"card":"Patchwork Banner","seat":0,"question":"entering-choose","choose":["Goblin"]}}
```

The runner privately retains only the previous resolution's stack ID, card ID, name, actor and kind, its native
events and a signature of any resulting question. It does not checkpoint/copy/restore the native pending question.
This context is minted internally; scenario data cannot supply or overwrite it.

If a question is present, require the unchanged native signature, actor, exact `entering-choose:<captured-card-id>`,
single-answer cardinality, source ID on every option and the actual native entering frame whose current ask is
`creature type`. Resolve only the uniquely matching fixed label through `resolveAwaiting` with the exact choice ID.
Any other mandatory question, stale signature, wrong source/actor, missing label, ambiguity or reused context fails.

Absence is allowed only when that same captured frame has fully completed: no pending question/rule operation/
resolving effect, the exact native spell successfully resolved and its exact old source moved to a new battlefield
object controlled by the original actor. A merely cleared question, countered spell, different entrant or unrelated
finished frame cannot pass. Consume the context once. Both positive and omission branches survive a JSON reload of
the native state in the scratch demonstration.

The subsequent ordinary stats assertion supplies behavior evidence. The policy does not count prompt presence or
absence itself. The old mandatory Banner scenario and its full type-option assertion must remain unchanged; a new
policy scenario would be additive after approval.

## Actual native demonstrations

All definitions are the saved real cards. Omission clones one runtime ability only; no altered definition is saved
or fidelity-checked. On the exact same fixed policies:

| Ability omitted in the second run | Actual baseline outcome | Actual omission outcome |
| --- | --- | --- |
| Snoop library casting permission a1 | Raging Goblin casts, paysR and enters | Card stays in Library, R remains |
| Snoop top-card grant a2 | Its actual copied Krenko activation resolves, creating2 Goblins | No activation, no new Goblins |
| Banner mana a2 | Selected real activation taps Banner and addsR1 | No activation, R0 |
| Banner entry choice a0 | Exact native Goblin choice completes entry; Firebrand2/2 | Same spell resolves/enters without choice; Firebrand1/1 |

These are four genuine remaining-ability outcome pairs, not a claim that the registered checker now proves8/8.
The current runner cannot execute this grammar. Its existing offer/question-presence exclusions remain unchanged.

The scratch audit passes156 checks. It rejects malformed/missing/wrong sources and actors, wrong phase/priority,
pending commitments, multiple actions, arbitrary branch fields, missing resolution, ambiguous or malformed colors,
forged event source/actor/stack identity, a real intervening Firebrand activation, stale changed question, wrong
question/label/context, reuse and false question absence. The wrong-input prechecks preserve native state; a real
intervening activation is left committed and neither stack frame is resolved. Separate offer-only and
activation-without-resolution controls produce no entrant/tokens. `scenarioBehaviorFailure` rejects every policy
failure as uncredited.

Five independent scratch-code reversions are caught, with no misses: skip the selected native action, ignore an
intervening frame, ignore the emitted action actor, ignore changed question identity and ignore the explicit answer
actor. Their failures reach the specific behavior/guard assertions; no timeout/fidelity/schema failure is credited.
The original scratch bytes are unchanged. No original mutation file or suite union is edited.

## Reproduction and implementation seams

The archived source text is `V8-CONDITIONAL-POLICY-DEMO.mjs.txt`; the control driver is
`V8-CONDITIONAL-POLICY-CONTROLS.py.txt`; results/hashes are in `evidence/v8-conditional-policy-proposal.json`.
For this local diagnostic, copy the two text artifacts back to `load100/scratch` using their names below. Imports
deliberately point to the clean `load100/w0-v8-policies` worktree, which is based on55f133f5.

```text
Node22 first on PATH
node ../scratch/v8-policies-guard-demo.mjs
python ../scratch/v8-policies-guard-controls.py
```

The exact proposed production seams, subject to root review:

1. `game/engine/cards/scenario.mjs`: a new guarded branch before ordinary action/resolve dispatch; a small new
   conditional-action helper next to physical source resolution; capture minimal native frame facts when an explicit
   resolve is immediately followed by the new bound answer. Preserve legacy `act`, `choose`, `optional`, target and
   settle behavior, including all explicit-choice failures.
2. New native runner tests for concrete effects, both branches, JSON state, malformed/stale/forged/ambiguous inputs,
   unsupported commitments and unrelated frames; add caught semantic mutation controls while retaining the complete
   existing scenario/physical-source/block-policy reader unions.
3. Only after those proofs pass, add independent saved Snoop/Banner scenarios. Do not convert/remove old scenarios
   or assertions, auto-generate first answers, modify rule/card definitions, accept loss of an offer as proof, or
   change the ledger/proof classifier. Re-run the selected diagnostic and preserve any still-unproved abilities.

The source-bound full canonical ledger, all-card exercise/review, full-game requirements and every other wave0 gate
remain required. This proposal does not authorize or perform production implementation.
