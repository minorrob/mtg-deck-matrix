# Eight saved witnesses with explicit physical basic sources

This bounded repair adds exactly 30 literal `source` fields to eight existing scenarios in five files. No original
fixture, step, choice, expectation or other field changes. Removing only those additions reproduces every original
file structurally, and all 17 original scenarios remain present. No card definition, rule, helper, classifier,
ledger or gate changes. The larger 1,241-candidate inventory remains outside this repair.

The approved authoring policy names physical basic lands in setup order, separately for each name: index 0, 1, ... .
Only initial contiguous taps at default turn 1 MAIN1 qualify; battlefield setup contains only supported basic lands,
with no command-zone setup or basic-land fixture override. This is a literal saved decision, with no runtime fallback
or first-legal-source selection. Source identity is resolved before legality by the unchanged strict runner.

## Controls and preservation

The original fixed ten-candidate scratch pilot remains archived in full. It verifies all 43 actual taps against the
initial physical objects, actor/priority, empty commitments, unique native T-only one-mana actions, native source-bound
tap/mana events and exact pool/object results. Eight full scenarios pass all original assertions. Akroma's later
ambiguous opponent Island and Aerial Extortionist's original `settle`/target question remain ineligible and untouched.
The repeated-index negative control is refused with `action-offer`; it never switches to another untapped Wastes.

The narrow candidate pool supplied no existing-explicit-prefix original. An additive diagnostic clone therefore
adds a literal first reference before invoking the same repair planner. Its original literal survives byte-exact,
and all five original assertions pass through the unchanged strict runner. An inconsistent index and a differing
literal descriptor each exclude the entire candidate and leave the input untouched. This is explicitly an additional
control, not a claim that a different saved original was selected. The original ten results and both failures remain.

The five edited files are A.I.M. Scientists (three scenarios), Aang (one), Aether Channeler (two), Aether Helix (one),
and Agadeem's Awakening (one). Every edited full saved scenario passes: eight scenarios, 21 original assertions.

## Clean before and after measurements

| Measurement | Before `644d844b` | After `102f55f5` |
| --- | ---: | ---: |
| Selected definitions | 5 | 5 |
| All original selected scenarios | 17 | 17 |
| Failed scenarios | 14 | 7 |
| Abilities reached | 0/14 | 4/14 |
| Runtime-only removal proofs | 0 | 0 |
| Checker exit | 1 | 1 |

One edited Aang scenario already passed before the repair, so eight edits remove seven failures. The four reached
abilities are A.I.M. Scientists' connive trigger and landcycling activation, Aether Channeler's trigger, and Aether
Helix's uniquely inferred printed spell. These are the unchanged ledger's actual event observations; no family
credit or invented runtime-removal proof is added. Agadeem's passing edited outcome does not supply the missing
ability proof, and all ten unproved abilities remain recorded.

Both ledgers were captured on their exact clean commits, with source tree and definition/scenario input hashes.
The scripts hash is unchanged. Complete raw ledgers are compressed with verified roundtrips, alongside the full
checker logs, pilot, native refusal, preservation controls and exact field-diff record. All archived raw data and
reproduction scripts pass the same eight credential/personal-address scan categories as `local-ci.sh`.
`evidence/v8-basic-source-repair.json` binds their hashes and complete summaries. Nothing is relabeled as proof on
a later documentation or integration commit.

The independent canonical verifier exits 1 on the after snapshot: selected inventory cannot pass the canonical
gate, checks still fail, and the full directory/input inventory is absent. No card completion, promotion, game,
review, staging or release acceptance is claimed. Scope stays at 8,514 names covering 95.0013% of appearances,
with 2,715 final and 5,799 undefined. The separate generic layer-2 static-controller debt remains deferred; ordinary
saved Conscripts control effects and return worked in the earlier native effect-level comparison.

## Reproduction

Use Node 22 first on PATH. The selected checker command, run on the matching clean source, is:

```text
node --stack-size=4000 game/tools/batch/check-cards.mjs --cards "A.I.M. Scientists|Aang, Swift Savior // Aang and La, Ocean's Fury|Aether Channeler|Agadeem's Awakening // Agadeem, the Undercrypt|Aether Helix" --ability-ledger <output.json>
```

The exact scratch source is archived as `V8-BASIC-SOURCE-PILOT.mjs.txt`, `V8-BASIC-SOURCE-REPAIR.py.txt`,
`V8-BASIC-SOURCE-PRESERVATION.mjs.txt` and `V8-BASIC-SOURCE-EDITED-FULL.mjs.txt`. Copying them back to the local
`load100/scratch` paths shown in the scripts reproduces those bounded diagnostics on the recorded source. Prefix
slices omit terminal expectations only for source validation; saved scenarios and full acceptance runs retain all
original steps and assertions. The repair planner refuses a different source head or an absent clean before ledger.
