# CrankMagic release execution

Requested sequence: solo launch and complete-game browser UAT → mixed human/AI games → owned-deck telemetry → full-app QA and documentation → cloud execution design. Each implementation stage is merged only after its stated verification. Cloud deployment is not part of this request.

## Stage 1 — launch and solo play (in progress)

- Base: main `e29e7b4` (includes PRs #230 and #231). Branch: `codex/online-launch-uat`.
- Fixed public Play duplicate heading and decorative logo. App-wide brand remains.
- Local host had stopped; public handoff opened unavailable localhost directly. Added a health check and startup/retry dialog, with an explicit Continue click to avoid popup blocking. Health exposes product/protocol only; mutation routes remain same-origin and token protected.
- Added hidden persistent Windows startup helper and `start-crankmagic` skill; installed locally. Existing active hosts are retained, never killed to free a port.
- Browser combat damage assignment replaces the native `assignCombatDamage` dialog and validates amount totals and the pinned engine's assignment constraints. Isolated browser → Node → actual Forge adapter allocation UAT passed; details below.
- Initial 24 game regression tests pass. Java adapter compiles. The first complete-game UAT with Krenko against Krenko, Atraxa and Shadrix finished on turn 31: Rob won with 20 life. One native ordering recovery prevents treating this as uninterrupted browser-only acceptance.
- Cold/healthy launch, handoff, commander casting, blocked/flying combat, complete-game outcome and journal checks passed. Trample allocation passed in an explicitly synthetic bridge contract scenario. Remaining release work: final regression/PR checks, merge, then production launch verification.

### UAT progress and communication gate

- Draft PR #232; initial CI passed. Later UAT fixes are still under review, and the PR is not merged.
- Verified public deck handoff into local Play, commander drag/cast with automatic payment, manual draw, token creation, floating mana, and refresh/resume without losing the match.
- Turn 19: four Goblins blocked a 4/4 Krenko and two blocked a 2/2 Chieftain. Six tokens and both attackers died; Rob stayed at 40 life and zero commander damage. The history retained damage, deaths and the command-zone move.
- Turn 21: selecting a flying Vampire correctly offered no ground-only blockers. Nine unblocked damage reduced Rob from 40 to 31; every source appeared in History. Added explicit no-legal-blocker feedback and separate flying/ground power totals, with trample shown as overlapping power.
- Storm exposed a native ordering dialog during the first game. Recovered that choice in Forge, so that run is **not** evidence of an uninterrupted all-browser game. Added browser ordering support; the second game exercised reordered simultaneous triggers and completed entirely through the browser.
- Added `BridgeProtocolCheck`: 16 isolated checks of the real adapter for stale revision, expired choice, invalid/duplicate indices, exact ordering and object identity behind identical labels, one-time draw confirmation, idempotent retries and rejection of altered retry content, real HTTP serialization/retry and missing-token rejection. Passed.
- Added `check-bridge-parity.mjs`: reads Forge and the web API at the same stable revision and asserts that every engine field survives unchanged. It permits additive presentation metadata, never altered engine fields. Live checks passed at turn 22 / main phase 2 / revision 10359, turn 26 / pending draw / revision 12314, and turn 29 / upkeep / revision 13949. No hidden state or credentials are printed.
- Game regression suite now has 32 passing tests, including deliberate dropped/altered/reordered payload failures, stale-action/payment-origin regressions, target privacy and card-grid geometry. Preserve engine-generated card types during web enrichment, including type-changing effects.

**Release gate:** browser actions, Node transport, Forge choices and resulting projections must agree. Check action identity/exactly-once application; legal option cardinality and ordering; selected targets; costs, floating mana and tapped sources; stack/zone transitions; combat pairings, damage and deaths; counters/triggers; monotonic revisions and reconnects. Log any unsupported native prompt explicitly. A failed comparison or an unexplained missing event blocks release. Complete-game outcome, fresh-engine ordering and the damage-allocation bridge contract passed; distinguish natural gameplay, synthetic integration and unit-test coverage in release notes.

## Stage 2 — mixed players (not started)

Use one authoritative Forge match with a separate bridge/controller and filtered view for every human. Reserve expiring invitation seats, accept each guest's CSV deck, revoke readiness on edits, start 2–4 seats in any human/AI mix, reconnect to pending decisions. No guest may read another hand, deck order, credential or private journal. Test separate browser sessions through a complete game and test spoofing/replay/disconnect boundaries before merging. LAN exposure must be opt-in; public cloud execution remains the final documentation stage.

Difficulty is a competency/competitiveness control, not a deck-power adjustment or hidden-information advantage. Below average, emphasize developing the AI's own engine and attacking. Average and above progressively improve attention to public opposing boards: identify mana/card engines, token multipliers, loop enablers, likely chain starts and interaction windows; preserve useful answers; weaken or remove the relevant threats when legal. Evaluate opportunities on draws and meaningful state changes. Log the visible evidence, available interaction and selected rationale. A high setting must not imply guaranteed foresight or access to hidden hands. The current native pilot difficulty selector must not be presented as implementing this policy until tested.

### Persistent table and rematches (Stage 2 acceptance)

- Table membership survives a completed match. Each human answers **Play another game?**; accepting shows **Waiting for other players** until every remaining human, including the host, accepts. No repeat invite or lobby re-entry is required.
- After unanimous acceptance, each human chooses the same deck, an uploaded deck, an existing saved deck, or a newly built simulator deck. Deck edits invalidate readiness. Once every seat has a validated deck and every human is ready, show a synchronized 10-second countdown. Cancel the countdown on a readiness change, departure, or disconnect; start exactly one authoritative match when it expires.
- **Exit the Table** explicitly releases membership and the seat. Detect inactive/closed browsers with a server heartbeat and a bounded reconnect grace period, then release the seat; browser unload alone is not reliable. Tell remaining players why a seat became vacant. Allow a replacement invite or host reconfiguration to two or three players before the next match. An active match follows its explicit disconnect/concession policy rather than silently substituting a different player.
- Test unanimous agreement, waiting/decline/exit, refreshed pages, stale countdowns, duplicate starts, reconnects, seat release and replacement. No previous match's hand, pending action or readiness may leak into the next match.

## Stage 3 — physical-deck evidence (not started)

Audit completed journals. Capture source/target identity, casts and resolutions, deaths/zone transitions with causes, mana payments and unavailable colors, triggers/options, loops and interruptions, combat allocation/actual damage, deck version and engine/rules versions. Keep hidden information separate from public history. Report observed evidence with sample sizes and uncertainty; never recommend card replacement solely from one bad shuffle. Tie findings to owned deck/card identifiers and compare successive deck snapshots. Verify report privacy and accounting, then merge.

## Stage 4 — whole-app release (not started)

Scan navigation, card/deck workshop, setup/import/join, gameplay, history/tracker and recovery at desktop/narrow widths. Run the repository checks and browser UAT. Reconcile outdated replay-only documentation with actual capabilities; record remaining native dialog and recovery boundaries. Merge verified documentation and fixes.

## Stage 5 — cloud execution documentation (not started)

Specify persistent match workers, durable private event storage, database/account model, HTTPS invitations/login, seat authentication, secrets/API budget handling, backups, recovery, migrations, operations and cost assumptions. Include a staged deployment/rollback runbook. Do not deploy or purchase infrastructure as part of documenting it.

## Final acceptance — start-to-finish user guide

This is the last step, after every preceding implementation, correction, staged merge, telemetry/deck integration, whole-app QA, documentation update and cloud execution plan is complete. Create **Guide to start CrankMagic Online**, beginning at computer power-on. Execute the guide with three independently authenticated human browser sessions and one AI. Agent-entered UAT feedback must be labeled test feedback; it is not evidence of real friends' satisfaction. Do not mark ready for human testing until all gates pass:

1. Start the host/runtime and open the browser app and lobby successfully.
2. A second human joins the invited lobby and claims only their reserved seat; the third joins likewise with their own deck.
   - **2.5 — Start the match:** all three humans and one AI have validated decks and ready seats; the host launches Forge; every browser reaches the same match with the correct seat, private hand, public starting state and first-player/turn indicators. No seat can start or control a different player's game.
3. Progress successfully through rounds 1–3.
4. Progress successfully through rounds 4–7.
5. Progress from round 8 to the last player remaining or a draw.
6. Complete the game with authoritative results for every seat.
7. Collect each human's deck-performance and experience feedback plus clearly identified AI analysis.
8. Generate the game log and attach the correct seat's permitted log to that user's CrankMagic deck/version.
9. Show evidence-based card recommendations/upgrades when warranted, including sample-size limitations.
10. Offer a seamless new game or navigation to the Deck screen with the attached log.
11. Close out the game and shut down its Forge process cleanly, retaining logs and decks.
12. Start a new game, relaunch Forge, create the new lobby/invites and assign AI seats. Only then mark the process ready for human testing.

At each gate verify browser–Forge action/decision/state parity, private-seat isolation and journal continuity. Browser UAT may represent the human seats for repeatable testing; actual human usability testing follows this proof. Internet access requires an explicit host/network deployment choice; a loopback URL is never described as remotely joinable.

### Further UAT findings (not yet released)

- Turn 26: 34 attacking power, three blocked attackers and 28 unblocked power eliminated Krenko from 22 to −6 life. The match continued with three active seats.
- Turn 28: Shadrix cast Blight Rot targeting the human Krenko; counters, death, command-zone choice and subsequent recast were visible and retained in history.
- Client action preflight must never silently rebase a stale click onto a newer decision. Added revision rejection and in-flight checks; pending choice answers remain allowed while the engine waits.
- Optional echo payment was automatically spent during upkeep. Added authoritative Forge payment-origin metadata: automatic payment applies to the human’s spells/activations; triggered or other-player costs require explicit approval. Fresh-engine optional-payment UAT remains required.
- Renamed the native Alpha Strike control to Attack with all, while keeping review and confirmation before declaration.
- First match completed on turn 31; browser showed the authoritative win and history. Final parity passed at revision 15227. End-game controls shut down the owned Forge process while retaining its journal. Fixed polling replacement of the completion buttons.
- Cold-host recovery showed retry instructions and disabled Continue. Healthy-host testing exposed a missing loopback health endpoint in the parent page CSP; added the exact host origin. The updated public-style launch preview then opened local setup successfully. Production HTTPS verification awaits deployment of the verified stage.
- Fixed setup text fields losing the last edit when preparing immediately: input now persists without rerendering the active field. Verified the prepared opponent used the newly entered name.
- Fresh-engine UAT started with Krenko against Felothar. Opening state parity passed at revision 17, and turn 4/main phase 2 at revision 819. Creature, artifact and commander casts paid mana automatically, including a Mountain plus Arcane Signet. Zero-cost equip selected the intended creature.
- Turn 7: Krenko made three Goblins; all three simultaneous Denizen triggers appeared in the browser ordering screen. Moved one trigger, confirmed the order and resolved all three without native UI; Denizen reached the expected 5/1. Engine/browser parity passed with the pending order at revision 1780. Subsequent combat showed 8 attacking power, 5 unblocked, Piledriver blocked by Wall of Omens, and Felothar falling to 32. Fresh optional-payment and damage-allocation integration checks remain outstanding.
- The fresh game completed entirely in the browser on turn 11: 98 attacking power, Piledriver blocked, 33 unblocked damage, Felothar 21 → −12, Rob won. Final parity passed at revision 3686. The journal contains 3,579 events and the authoritative finished summary.
- Despark exposed a missing target display. Added authoritative current-stack projection with explicit target IDs and permitted names, and target details beneath the stack card. Enrichment preserves that stack rather than replacing it with journal reconstruction. Hidden target names/raw descriptions remain excluded. Compiles and targeted tests pass; new-engine browser verification remains required.
- Added independent card zoom (32–140%) under View options, a compact 6-column/3-row preset and reset. Layout measures available zone space, changes columns/rows, and only fans automatic groups when capacity is exceeded; manual groups remain intact. Browser verification on a populated replay measured 6 columns × 3 rows at minimum and 4 columns × 1 row at 80%, with correct card proportions and no zone overflow. Added regression tests for geometry and preservation of card identities.
- Restarting with an expired completed-game bridge originally prevented the host from starting. Recovery now retains logs and starts setup; verified on the separate test host. The startup helper reports an exited host immediately instead of waiting through health retries, and keeps per-port process records.
- Isolated browser contract UAT passed against the actual adapter and pinned Forge view objects: two blockers requiring 2 and 3 lethal damage, then 2 trample damage to the defender. Browser inputs showed 7/7 assigned; Forge returned exact amounts keyed to the same blocker objects and its null defender sentinel. Pending-choice parity passed at revision 1. The browser displayed explicit public targets and a masked hidden-card target. This is a synthetic contract check, separate from the complete real-game UAT.
- Current Node game suite: 32 passing checks. Optional echo payment is covered by payment-origin policy regression checks; a fresh natural-game echo occurrence has not been observed. Keep that distinction in release notes.
- Final local regression run: all 62 repository suites passed, plus all 32 companion checks. Java adapter and isolated browser scenario compile against the pinned Forge jar. Main host returned to CrankMagic Play/Game Setup after closing the synthetic test host.

## Landscape mobile follow-up — after all preceding passes

After desktop implementation and the complete final acceptance proof pass, evaluate human gameplay in landscape mobile alongside desktop players. Preserve the full board and replace the persistent hand row with a bottom-right hand icon. Opening it reveals a bottom drawer with legible cards; beginning a card drag closes the drawer while retaining the dragged card under the finger. A legal drop onto the battlefield invokes the same engine action and automatic zone placement as desktop. Invalid drops retain the card and explain the reason.

Verify touch capture across drawer dismissal, cancel/drop recovery, browser scrolling and zoom, safe areas, tap inspection/actions, targets and blockers, phase/priority controls, mana/counters, history, reconnect and a complete mixed-device game. Automated viewport checks do not establish real-device touch usability; record that boundary and include physical-device testing before claiming mobile readiness.
