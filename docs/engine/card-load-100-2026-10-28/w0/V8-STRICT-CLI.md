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
is separate; old live-match migration, strict optional/settle behavior, all-card independent review and required
finished replay/leak/exercise runs remain open. No unfinished game or previous unversioned replay closes those gates.
