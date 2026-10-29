# Strict card-check defaults and gate wiring

Root owns this verifier-only slice. No saved cards or rules are edited. The default `check-cards` command always
creates an ability ledger and runs the authorized runtime-only removal supplement. An explicit output path and the
historical `--counterfactual` spelling still work; neither is required to enable coverage. An unreached ability fails
even when every original scenario passes. Unknown/duplicate flags, empty card directories, missing saved scenarios
and malformed scenario arrays fail. Loading failures overwrite an old output with an incomplete marker.

Selections and custom directories remain labeled diagnostics. They cannot pass the independent canonical gate.
`verify-card-ledger.mjs` checks completion, exact raw card/ability inventory, matching script/scenario hashes, current
clean source revision/tree, zero fidelity/smoke/scenario failures and recomputed behavior reachability. It rejects
forged totals, omitted abilities and legacy source-choice exemptions. Canonical identity is portable across checkout
paths when the source and input contents are identical. A canonical measurement requires committed source; keep its
output outside the working tree. A changed source during a run cannot certify the original snapshot.

Actions now executes the strict canonical checker and verifier after Node setup, before the expensive remaining
suites. The full local fallback uses the same fatal gate. The pre-push `HEAD 0` scan remains scan-only. No Actions
run has been requested for this unfinished integration, and no G-3 pass is claimed from wiring or small fixtures.

`tests/card-check-cli.mjs`: 56 checks use actual temporary card/scenario files and actual child checker/verifier
processes. The static boost receives a real passing-baseline runtime-removal behavior proof; presence alone stays
unproved. Artifact/source/inventory rejection tests do not count as card ability evidence. The original 44-check
ability-proof suite remains green. `breaks-load100-v8-cli.py` proves missing-ledger, disabled-removal, ignored-option,
partial/stale/incomplete/failed evidence, raw-unreached, missing-scenario and nonfatal-CI failures. Original mutation
results and subsequent verifier-executable/legacy-policy supplements are retained in the run's scratch logs. The final
12-mutation run passes its unbroken baseline and catches all 12, `missed: []` (`root-strict-cli-final-mutations.log`).
Data integrity, feature-wiring 131 and readout-feeds 1,121 pass. The whole directory still must reach zero unproved abilities.

Canonical fuzz pods opt into current source-ID choices and pilot-provocation policy. Historical replay compatibility
is separate; old live-match migration, repairs to strict optional/settle scenarios, all-card independent review and required
finished replay/leak/exercise runs remain open. No unfinished game or previous unversioned replay closes those gates.

## Explicit decisions in behavior evidence

The canonical checker and both sides of runtime omission now request `explicitChoices`. The compiler's smoke pilot
remains diagnostic. A saved scenario cannot opt out. Unavailable optional moves, `targets: "any"`, multiple matching
actions, ambiguous option labels and unnamed multiplayer defenders fail as choice-policy errors. `settle` may resolve
a stack, but cannot answer a question. Navigation cannot answer effect questions, choose required attacks/blocks,
order multiple triggers or keep a legend. Passing/navigation declares no optional attackers or blockers; forced single
trigger placement needs no ordering choice. Authors must preserve the original final outcome assertions while adding
the actual missing decisions. This change writes no saved cards or rules.

`scenario-explicit-choices` passes 110 native checks. Actual Lightning Bolt, two Soul Wardens, Elesh Norn and Glorious
Anthem exercise explicit outcomes and omission controls. A removal that introduces an unanswered question receives no
proof. Legacy cached baselines are rerun under the current policy; the independent validator requires its measurement
stamp. Same-name physical attackers, blockers and counted targets require indexed answers rather than a first match.
`to: {turn, phase, ask: "<kind>"}` stops at the named question; `targets: [{ask: true}]` defers only a real counted
target question to the next explicit answer. It cannot stand in for a scalar target. CLI now passes 57 checks, with
the original 44 ability checks and 167 block-policy checks retained. All 25 new mutations are caught against the
original four-suite baseline. The first navigation-priority probe was missed; a real assertion that ordinary priority
cannot satisfy a requested question now catches it. A transient Windows write error stopped the final run before
changing source (backup/source hashes matched); the remaining eight probes were restored/re-run and caught. Four
inherited anchors, including fuzz's current pod flags, moved and are independently re-proved. The 12 strict CLI
mutations also pass on the explicit-choice source (`root-strict-cli-explicit-mutations.log`, `missed: []`).
The new strict whole-directory failure inventory still needs measurement; this is not a claim that those saved
scenarios have already been repaired or that G-3 passes.
