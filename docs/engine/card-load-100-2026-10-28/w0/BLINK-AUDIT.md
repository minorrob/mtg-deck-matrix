# ROB-210 native blink and search audit

Prerequisite: Confirm PR #932 merged externally into main at `0aee1474`. Root verified that its exact-head Actions run
was **canceled**, not green; the author merged on touched suites. It receives no full acceptance-gate credit here.
The merged native `room-optional-count-targets` suite passes 21 checks. The coordinated browser audit now passes
the required Confirm regression (50 checks) and native-backed blink/search audit (148 checks).

The saved card definition for **Claim Jumper** has an enters-the-battlefield catch-up Plains search and no blink target.
Its two may-search decisions are independent, the second happens only if an opponent still controls more lands, and
the effect shuffles once if either search happened. A Plains card need not be basic. The reported optional blink and
Claim Jumper's own library search therefore need separate checks; no card definition was changed to match the report.

`node tests/engine-playtest-blink.mjs` passes **113 checks** using the actual saved card definitions and native four-seat
combat, priority, target, reentry, search and shuffle paths. State/RNG continuations are restored from JSON between choices.

| Pattern | Actual cards and proof |
| --- | --- |
| Required single target | Cast Cloudshift and Ephemerate on a creature controlled by the caster but owned by another seat. New objects return under your control or the owner's control respectively. |
| Up to one | Thassa, Deep-Dwelling's actual end-step trigger accepts none or Claim Jumper, then reaches its actual reentry search. |
| Any number | Brago's actual combat hit opens zero-to-three own nonland targets. None, one and all three complete; own lands and opposing permanents are excluded; invalid choices leave state unchanged. |
| Combat provenance | Another creature's actual combat hit and Brago's actual noncombat damage do not trigger Brago's combat blink. |
| Blink then search | Brago blinks Claim Jumper. Real reentry forgets old counters/damage, then offers the saved conditional searches. Basic Plains and nonbasic Savannah are found tapped; Forest is excluded. |
| Zero-card search | Choosing to search but finding nothing still shuffles once. Declining both searches never shuffles. Catching land parity after the first search suppresses the repeated search. |
| Delayed return | Actually cast Flickerwisp, exile Claim Jumper, restore the saved exiled-card continuation, advance the native game clock to the end step, return it, then finish both actual Plains searches and one shuffle. |

`python game/tools/batch/breaks.py game/tools/batch/breaks-playtest-blink.py`: **15 caught mutations, `missed: []`**. It exercises errors in counted
target bounds, immediate/deferred return, new-object tracking, return control, search quality/cardinality/tapped state,
searched provenance, land parity and combat provenance. No saved cards, rules modules or gate assertions are changed by
this audit checkpoint; mutation files are restored after each probe. No cards are added or promoted.

The quiet browser window ran sequentially with Node 22, `GEOMETRY_REQUIRED=1`, `UAT_BROWSER=chromium` and the existing
`C:\Users\robmi\CrankMagic\workbench\playwright-browsers` cache. `tests/board-optional-count-targets.mjs` passes 50 checks.
`tests/board-playtest-blink.mjs` passes 148 checks across Focus/Full and ten actual room contexts: Brago zero/one/two
targets, Thassa zero/one, and Claim Jumper's actual search/find-none/decline continuations. Browser packets reach the
actual `GameRoom.prototype.webSocketMessage`, including production request stripping, `room.act`, `room.check` and
checked/refused envelopes. Assertions cover final zones/new objects, accepted packets, search/shuffle journal facts
and absence of page errors. Context, browser and server teardown is awaited.

The first default-cache attempt failed before browser launch and earns no credit. The first native-backed run used a
fixture without `passStack: true`: Brago correctly retained a one-item stack, with no pending engine choice, while
waiting for ordinary priority. Root approved one fixture correction to the canonical table/fuzz stack-shortcut policy;
the same original stack/awaiting/zone/journal assertions then passed. The initial failure is not a stuck decision.
Repeated 60-card fixture decks, bounded native preparation and storage copies are fixture setup, not G-3/G-5 Commander
load acceptance. Production UI is unchanged.

The original `board-choices` full-index baseline still fails waiting 60 seconds at line 330 for `#cm-board .cm-stage-top`
after eleven room-detail checks. No payment mutation ran or receives credit from that failed baseline. These focused
browser proofs do not close that full-union gate. ROB-210 remains In Progress pending publication, integration/main
review and required acceptance; root owns those gates. ROB-209 modal/spree staging is separate follow-up.
