# Approved physical-source witness batch

This batch adds exactly 3,430 literal `source` fields to 1,072 existing scenarios in 700 files. Root approved that exact
set after independently checking all 6,430 scenario-file hashes, all 1,233 structural plans and all 161 rejections.
Root also reran the 11 fixed evenly spaced eligible samples and their 23 original assertions on source `62619241`.
Those root checks are recorded as root-reported review facts, distinct from this worker's runs.

Only the reviewed initial contiguous basic-land taps are changed. The default start is turn 1 MAIN1, all battlefield
setup is supported basic lands, and command-zone setup/basic fixture overrides are excluded. The source indices are
fixed authored choices in setup order for each name. Existing literals are preserved; inconsistent ones exclude the
whole candidate. No first-legal source selection, implicit answer, dynamic renumbering or helper fallback is added.

Every original fixture, step, choice, expectation and other field is preserved. Removing only the approved additions
reconstructs each original file structurally. Every other scenario file is byte-exact, and all 161 rejected cases
remain unchanged. W1 reported no raw scenario claims. W5's held Etali Conqueror/Sickness scenario file is outside the
approved set, so no owner edits were combined by this worker. No definition, rule, helper, classifier or gate changes.

## Fixed inventory and actual edited scenarios

The frozen inventory on clean `544d8512d226790498ae5da29087471ab6ba9a29` accounts for all 11,044 original scenarios:
9,221 outside the narrow scope, 582 with no qualifying prefix, eight already explicit, and 1,233 remaining candidates.
The complete original/proposed records, structural dispositions, native receipts and exact rejection reasons are
retained. The unchanged reviewed native assertion block validates all 3,896 tap receipts. Of the fixed candidates,
1,072 pass 3,020 original assertions; 161 retain strict choice-policy failures. No case was substituted or tuned.

The 11 eligible sample ordinals remain `1, 127, 249, 369, 496, 625, 743, 860, 980, 1107, 1232`, selected as evenly spaced
positions across the entire eligible list, including its first and last entries. Existing-literal preservation and
whole-candidate exclusion controls from the earlier pilot remain recorded. All 30 previously existing source fields
in the eight already-repaired scenarios stay exact. The larger mixed-board and command-zone pools are excluded.

After writing the actual saved files, this worker reran every edited full scenario through the unchanged strict
runner: 1,072 passed, zero failed, with all 3,020 original assertions. The code-only source was then committed as
`ad2d8bcd452717fd936e92bbd0675368a1c4a9a8` before measuring the after ledger.

## Clean selected before and after

Both measurements contain the same 700 complete card identities, every original scenario in all 700 files, and the
complete unchanged 1,388-ability inventory. Neither measurement uses a custom card root or removes failing cases.
Both source records are clean and include exact revision, tree and definition/scenario input hashes.

| Measurement | Before `544d8512` | After `ad2d8bcd` |
| --- | ---: | ---: |
| Selected definitions | 700 | 700 |
| All original selected scenarios | 1,962 | 1,962 |
| Failed scenarios | 1,171 | 444 |
| Abilities reached | 347/1,388 | 762/1,388 |
| Runtime-only removal proofs | 55 | 86 |
| Abilities still unproved | 1,041 | 626 |
| Definition/fidelity/smoke problems | 0 | 0 |
| Over-budget probe diagnostics | 0 | 0 |
| Checker exit | 1 | 1 |

The actual reduction is 727 failed scenarios, with zero previously passing scenarios lost. Of the edited scenarios,
345 already passed before, so there is no claim of a 1,072-failure improvement. The unchanged ledger records 415 more
abilities reached and 31 more runtime-removal proofs. These are actual per-ability results, with no family credit.
All 444 exact remaining scenario failures and all 626 unproved abilities remain in the complete after ledger/backlog.
The independent canonical verifier exits 1 on selected scope; the canonical inventory and full gates remain required.

Two initial launches stopped before measurement when Windows-default text decoding corrupted an accented card name.
Their incomplete ledgers and logs remain archived and earn zero credit. Correct transport reads the exact approved
700-name UTF-8 manifest in an external wrapper and invokes the unchanged public checker `main` with its supported
argv and exit handling. The successful ledger's full selected identities match that manifest exactly. The wrapper
also asserts all full strings, count and approved manifest hash before subsequent launches. Names are never renamed
or normalized. The canonical full-name-list SHA-256 is
`191ef2957ed3aea5925e4d8a7a21894691f9670ef2ef6f0fa3dd1722ab04c97a`.

## Evidence and limits

`evidence/v8-basic-source-batch.json` binds the complete before/after ledgers, logs, unproved backlogs, fixed inventory,
all native receipts/results, exact field diff, original rejection list, deterministic samples and root review facts.
Large raw artifacts are compressed with verified roundtrips. Raw privacy scans use the same eight credential and
personal-address categories as `local-ci.sh`; an unchanged earlier artifact reuses its scan only after its exact raw
hash matches the original scan manifest. Stored text hashes use repository LF bytes. Historical measurements are
not relabeled as proof on a later documentation or integration commit.

The reproduction scripts are archived as `V8-BASIC-SOURCE-SELECTED700-CHECK.mjs.txt`, `V8-BASIC-SOURCE-APPLY1072.py.txt`,
`V8-BASIC-SOURCE-BATCH-FULL.mjs.txt` and the inventory worker/runner sources. On the matching clean source, with Node 22
first on PATH, the exact selected measurement is:

```text
node --stack-size=4000 ../scratch/v8-basic-source-selected700-check.mjs <output-ledger.json>
```

The wrapper reads the archived approved identity manifest and runs the same strict checker, including its runtime-only
omission probes. No checker mode or proof classifier is changed. The actual edited full-scenario check is:

```text
node --stack-size=4000 ../scratch/v8-basic-source-batch-edited-full.mjs
```

No new card definition, final-card promotion, canonical acceptance, full-game completion, review, staging or release
credit is claimed. The frozen target remains 8,514 names covering 95.0013% of deck appearances. The separate static
controller issue remains a deferred primitive/DSL-level debt; this batch makes no production architecture change.
