# CrankMagic release execution

Requested sequence: solo launch and complete-game browser UAT → mixed human/AI games → owned-deck telemetry → full-app QA and documentation → cloud execution design. Each implementation stage is merged only after its stated verification. Cloud deployment is not part of this request.

## Stage 1 — launch and solo play (in progress)

- Base: main `e29e7b4` (includes PRs #230 and #231). Branch: `codex/online-launch-uat`.
- Fixed public Play duplicate heading and decorative logo. App-wide brand remains.
- Local host had stopped; public handoff opened unavailable localhost directly. Added a health check and startup/retry dialog, with an explicit Continue click to avoid popup blocking. Health exposes product/protocol only; mutation routes remain same-origin and token protected.
- Added hidden persistent Windows startup helper and `start-crankmagic` skill; installed locally. Existing active hosts are retained, never killed to free a port.
- Browser combat damage assignment now replaces the native `assignCombatDamage` dialog and validates amount totals and the pinned engine's assignment constraints. Integration UAT is pending.
- Initial 24 game regression tests pass. Java adapter compiles. Full-game browser UAT started with the saved Krenko list against Krenko, Atraxa and Shadrix; completion not yet established.
- Still required: cold/healthy launch browser verification, stale handoff recovery, exact commander casting, blocked/trample combat, game outcome and final journal, regression and PR checks, merge.

## Stage 2 — mixed players (not started)

Use one authoritative Forge match with a separate bridge/controller and filtered view for every human. Reserve expiring invitation seats, accept each guest's CSV deck, revoke readiness on edits, start 2–4 seats in any human/AI mix, reconnect to pending decisions. No guest may read another hand, deck order, credential or private journal. Test separate browser sessions through a complete game and test spoofing/replay/disconnect boundaries before merging. LAN exposure must be opt-in; public cloud execution remains the final documentation stage.

## Stage 3 — physical-deck evidence (not started)

Audit completed journals. Capture source/target identity, casts and resolutions, deaths/zone transitions with causes, mana payments and unavailable colors, triggers/options, loops and interruptions, combat allocation/actual damage, deck version and engine/rules versions. Keep hidden information separate from public history. Report observed evidence with sample sizes and uncertainty; never recommend card replacement solely from one bad shuffle. Tie findings to owned deck/card identifiers and compare successive deck snapshots. Verify report privacy and accounting, then merge.

## Stage 4 — whole-app release (not started)

Scan navigation, card/deck workshop, setup/import/join, gameplay, history/tracker and recovery at desktop/narrow widths. Run the repository checks and browser UAT. Reconcile outdated replay-only documentation with actual capabilities; record remaining native dialog and recovery boundaries. Merge verified documentation and fixes.

## Stage 5 — cloud execution documentation (not started)

Specify persistent match workers, durable private event storage, database/account model, HTTPS invitations/login, seat authentication, secrets/API budget handling, backups, recovery, migrations, operations and cost assumptions. Include a staged deployment/rollback runbook. Do not deploy or purchase infrastructure as part of documenting it.
