# Inherited mutation repairs, October 29

Base: `11e4fe864a9c3b26d3e1eec57fb04cc0c16e7b3a`. This branch changes mutation definitions and adds assertions to two existing suites. Production files are restored exactly after every probe; no production UI or access behavior is changed.

The static audit on this branch remains red: 217 files, 4,159 breaks, 32 unresolved anchors, down from 49. Seventeen repaired anchors have actual caught proofs. Nothing is ignored, deleted from the mutation lists, or counted from a failing/skipped baseline. The remaining 32 must be repaired before G-7 closes. Repeat these moved-anchor proofs after final writer integration.

Use Node 22 first on PATH. Browser proofs used installed Chrome through the existing `UAT_CHROME` hook, with `GEOMETRY_REQUIRED=1`; they use local fixtures. The first default table-board run skipped unavailable bundled Chromium and its missed result earned no proof. Required Chrome subsequently passes the unchanged 326-check baseline and catches the polling race.

| Mutation file | Repaired contracts | Accepted proof |
| --- | --- | --- |
| `tools/table-away-breaks.py` | Timestamp before a delayed table read; retain the watch query | Original table-board baseline passes; the exact timestamp-order mutation is caught; `missed: []` |
| `breaks-play-shared-focus.py` | Restore Camera focus from the view-switch action, excluding the separate drawer-close focus call | Both original suites pass baseline; table-shared-shell catches the view-switch mutation; `missed: []` |
| `tools/ai-everyone-breaks.py` | Six group/identity/owner-propagation probes under Rob's later October 26 policy | Initial original-union run catches 12/13 total probes; the advisor probe exposed a missing owner assertion. Two owner-availability assertions are added without changing existing denial tests. Original-union baseline then passes and catches the advisor mutation; `missed: []` |
| `breaks-combat-display.py` | Face-down identity, departed blockers still mean blocked, planeswalker object endpoint, drafts labeled as private | Original suite baseline passes. Three first probes caught; the departed-blocker probe is corrected to inspect surviving objects rather than retained blocker IDs and is caught on its own passing baseline; `missed: []` |
| `breaks-direct-blocking.py` | All refusal reasons, multiple assignments, match identity, changed legal pairs, final confirmation after declining a block | Three original-suite probes caught first. The rematch probe exposes an untested empty-draft case; five assertions are added without removing existing ones. The no-block probe now targets the same user action in its current per-attacker handler. Both remaining probes are caught on a passing original-suite baseline; `missed: []` |

Rob's October 26 rule supersedes the former universal-spending behavior: the switch widens accepted sign-in audiences, while paid features remain owner/insider only. The updated probes preserve owner access without an insider roster row and refuse service identities. Existing General Access denials remain intact. Every provider in the unit suites is an injected local stand-in; no provider process variable, model endpoint or release deployment is used.

Reproduce with the original suite unions, not substitute suites:

```powershell
python game/tools/batch/breaks.py tools/table-away-breaks.py "the read is timed when it lands"
python game/tools/batch/breaks.py game/tools/batch/breaks-play-shared-focus.py "switching views loses Camera focus"
python game/tools/batch/breaks.py tools/ai-everyone-breaks.py
python game/tools/batch/breaks.py game/tools/batch/breaks-combat-display.py "face-down identity is exposed" "missing blockers make an attacker unblocked" "planeswalker endpoint becomes its controller" "private picks appear as confirmed assignments"
python game/tools/batch/breaks.py game/tools/batch/breaks-direct-blocking.py "only first room reason displayed" "multiple attackers silently reduced to one" "new match leaves old validation valid" "changed legal pairs retain old draft" "No blocks sends without confirmation"
```

The empty-draft rematch retains match revision, decision ID, legal pairs and an empty selection. A new match must request fresh validation, keep Send disabled, and require each attacker to be settled again. Clearing a nonempty selection in a separate generic redraw guard cannot satisfy this case. The existing final answer still sends exactly one empty assignment only after explicit Send.

Post-integration repeat on source/generated `2c89a5c3`: six moved access probes, polling timestamp, Camera, four combat-display probes and four blocking probes caught on passing original-suite baselines. The changed-legal-pairs probe was missed and received no acceptance. Its old nonempty draft lost the removed option independently, so that case did not isolate cached validation. Four additional assertions now hold an empty, previously accepted draft while its legal pairs change at the same revision/decision/match. The new view must request fresh validation, disable Send and require explicit attacker choices again. Every original assertion is retained. The original suite then passes baseline and catches this probe, `missed: []`; the supplemental result replaces its earlier missed result. The original miss remains in scratch evidence and is not relabeled green.

`evidence/empty-pairs-assertion.json` separately confirms the mutated suite fails `empty draft cannot keep validation after legal pairs change`, with `AssertionError` and no timeout, then restores the production file byte for byte. `evidence/post-integration-anchor-proof.json` accounts for all 17 probes and the supplement.

The final writer merge also exposed two shifted engine anchors: the command-zone emblem whitelist and Cascade's vocabulary line. Both keep the same mutation and full original suite union; each passes baseline and is caught, `missed: []`. The old activated-emblem assertion is updated to require the compiler's exact expanded supported-list message; activated emblems remain rejected, and removing the whitelist makes that same assertion fail. No production source changes. Final audit: 226 files, 4,256 breaks, 32 unresolved anchors, zero engine targets.
