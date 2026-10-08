# Production Play candidate, October 7, 2026

This is release preparation following PR #674 at `a985022f`. It does not
deploy, change Access, configure credentials, or approve spending. The default
`pages` profile still excludes Play.

## Explicit profiles

- `cloud-production` includes the cloud lobby, board and private rules engine.
  Its games are ordinary games: no playtest full records and no service-token
  seats. It uses the existing production origin, D1 database, Access audience
  and rate-limit namespaces.
- `cloud-production-standby` serves the library with Play closed, while keeping
  the same `GameTable` class, binding and `tables-v1` migration. The Worker
  refuses new Play HTTP requests, invitations and WebSocket upgrades after
  authentication. The account/library API remains available.
- Both production candidates write their release record to `release/pages`.
  Staging keeps its separate `release/cloud-staging` record and privileges.

Verification now compares exact database IDs, Access team/audience and rate
namespaces with the selected profile. It also rejects an unexpected table
migration, a missing entry gate, service seats, or playtest records in production.
These are build-time guards; they do not inspect the deployed dashboard.

## Recovery boundaries

Cloudflare blocks a version rollback across a Durable Object class lifecycle
change. The first production table registration therefore cannot treat the
old table-free `pages` version as its rollback target. Before activation,
validate the standby build, register the class with Play closed, and record
that exact deployed standby version as the candidate recovery target. The
first registration itself still needs a reviewed forward-recovery plan and
the production go; it is not made reversible by this code.
[Cloudflare rollback limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/#bindings).

Standby is an entry closure, not a pause of existing sockets or game clocks.
Already-connected games and normal disconnect timers can continue. It makes
no deletion or rewrite of D1 or table storage. An operational recovery must
account for people already playing and tell them what will happen.

## Validation and remaining gates

`node tests/cloud-worker.mjs` passes 108 checks. `node tests/release-pages.mjs`
passes 174, including both candidate builds and deliberately wrong database,
Access, rate namespace, service-seat, record and migration configurations.
Three deliberate Worker faults (missing closure, invitations escaping, existing
table HTTP/socket routes escaping) were caught and restored. Feature wiring and
all 119 asset hashes pass. Reproduce the faults with
`NODE=<Node22> python game/tools/batch/breaks.py tools/breaks-production-profile.py`.

`tests/uat/production-play-e2e.mjs` is the local workerd rehearsal: temporary
D1/DO storage, ephemeral fixture signing keys, an isolated valid backup and a
legal 100-card basic-land fixture with a real commander. It checks private
production records and a pending game's revision/choice across profile changes.
All 27 checks passed with Node 22.23.3, Wrangler 4.139.0, Playwright 1.56.0 and
system Chromium 151. The exact library body/history and pending game
revision/question survived standby and reopening; the normal production record
contained no seed, pod, tape or private journal. Command:
`WRANGLER=<4.139.0 bin/wrangler.js> UAT_CHROME=/usr/bin/chromium
node tests/uat/production-play-e2e.mjs`.

It is not a real-deck natural-game gate, a live Cloudflare rollback, or the
exact October 4 backup. No existing connection or disconnect deadline is promised
to pause. Captured fixture screens are local in
`/tmp/crankmagic-production-recovery-shots`; Library transfer remains blocked.

No production readiness claim follows from these local checks. Exact staged
source/version readback, real network games, friend Access, exact-backup restore,
known deployed recovery versions, CI and final release approval remain required.
