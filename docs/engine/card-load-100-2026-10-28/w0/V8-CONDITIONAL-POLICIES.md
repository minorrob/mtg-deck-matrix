# Bound native scenario policies

The strict scenario runner now supports two explicit author policies for observing real outcomes when one runtime
ability is omitted. They preserve the existing classifier: lost offers, question presence, policy validation failures,
generic exceptions and timeouts still do not prove ability execution. No ledger/classifier/gate or card definition
is changed. This implements only the seams root approved after `V8-CONDITIONAL-POLICY-PROPOSAL.md`.

`actIfLegal` names one cast, activation or immediate mana activation with an explicit actor and physical source.
It validates the actual object before legality, requires own MAIN1/MAIN2 priority and no stack/question/operation,
and refuses ambiguity. The initial scope is targetless, fully specified native actions. Nonmana actions expressly
request one selected resolution. Actual native cast/ability events bind the old physical source, actor and exact
stack frame. Only that frame resolves; a successful native receipt is required. Mana actions produce a source-bound
native mana event. No rule choice, payment source, target or mode is selected automatically. Additional-cost, funding,
entering and trigger questions outside this bounded route fail explicitly and earn zero proof credit.

The unavailable branch performs no action and changes no native state. The applied branch executes exactly the
selected native action; there are no arbitrary then/else steps, fabricated effects or snapshot rollback. Unsupported
continuations discovered after commitment fail the constructed scenario; they are not undone or silently skipped.
Existing required actions and the legacy `optional` behavior remain unchanged.

`chooseEnteringIfAsked` can answer only the expected creature-type choice from the immediately preceding actual
spell resolution. Its private context retains minimal frame facts/native events/question signature, not a native
question checkpoint. A fixed label is validated against that exact current source/card/actor/entering operation.
Absence is allowed only after the same native spell successfully resolves and the exact source really enters the
battlefield, with no pending operation/question. Any intervening instruction expires the context; reuse, a different
prompt, stale facts or a forged descriptor fails. The context cannot be supplied through scenario data.

Two small pure internal validators in `scenario.mjs` are used unconditionally by the actual production path and by
tests that clone real native event/question facts and forge one field. `index.mjs` and the public engine API stay
unchanged. There is no test flag, alternate runtime path, fake event emission or rule instrumentation.

## Validation before saved scenarios

The first production parser/guard audit passed226 checks, including all four real runtime-omission effect pairs.
After the approved pure question validator, second-actor and exact-source controls, the final native reader passes319.
It tests actual entrants, mana, Krenko tokens and Banner stats; malformed/ambiguous/stale/forged source/event/question
inputs; private one-use context; actual unsupported funding/entry/trigger commitments; a real unrelated Firebrand
activation; and offer-only/unresolved-activation controls. These failures retain `policy-precheck` tagging and cannot
become runtime-removal evidence.

All four old scenario/source/block-policy reader unions are retained via their original specs: the new reader plus
the unique inherited readers form a six-suite unbroken baseline. Every original saved scenario/fixture/assertion is
preserved. Exactly two scenarios are added to Snoop and two to Banner, using saved real card definitions.

The first full38-probe run had36 caught and two missed witness gaps. Its source restored exactly. The original wrong
source test referenced a card absent from that zone; physical-source validation masked the equality guard. Coldsteel
Heart's earlier native prompt/identity validation masked the final creature-type discriminator. Both original tests
remain. A different card physically present in the same Library and actual Outpost Siege's Khans/Dragons
`entering-choose` family reach the intended guards. No production code/probe/classifier was relaxed to repair them.

The complete unchanged38-probe/six-reader matrix then passes, with `missed: []`. Direct supplemental assertions catch
the two exact reversions: “same-zone native source mismatch must be refused before any action” and “actual
Khans/Dragons entering choice must remain outside the creature-type policy.” Both fail as missing expected exceptions,
not generic errors/timeouts/fidelity/schema failures. Original runner bytes restore exactly to SHA-256
`1f768c89f2432685703e3d3e292d653404ed9b63e1dc67c1c3b185b8603a2224`, with no source backup remaining.

## Scope of the result

The clean selected checker on `1da49b1b422f36dcdb5b1a5fef8976896302f847` runs all13 scenarios for Valakut Exploration,
Patchwork Banner and Conspicuous Snoop and exits0:8/8 abilities reached,6 by actual runtime-only omission behavior proofs. Four newly reached proofs
observe the paid/resolved top Goblin, actual copied Krenko tokens, actual Banner red mana and the actual type-choice
bonus. This is selected diagnostic scope only. `evidence/v8-conditional-selected.json` binds its exact clean source,
tree and script/scenario input hashes; the full32,426-byte ledger is archived as3,002-byte gzip with a verified
roundtrip and raw credential/personal-address scan. The independent canonical verifier correctly exits1 on this
selected inventory. The preliminary dirty run is not relabeled or used as clean acceptance.

The complete six-reader baseline and all38 caught controls are archived in `evidence/v8-conditional-proof.json` and
the initial/final mutation logs. Full legacy engine-cards55 passes all6,430 definitions/current11,044 saved scenarios;
this reader does not establish strict G-3. Integrity/feature-wiring131 pass, README is the actual710 suites, inventory
regeneration has no diff (60 artifacts/80.9MB), and frozen scope remains8,514 names/2,715 final/5,799 undefined.
Static audit256 files/4,713 breaks retains33 inherited UI failures and zero engine targets; G-7 stays open.

The canonical full-directory ledger, independent canonical verifier, full games, per-card review, staging and every
other wave0 gate remain required. No new definitions, final-card promotions or production release are included.
