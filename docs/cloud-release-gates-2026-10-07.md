# Cloud release gates, October 7, 2026

The repository remains isolated at `/workspace/crankmagic-cloud`. Main is
`2ad84eb0`, Train B is `5d068d26`, library PR #670 is `5174b836`, D2 PR #671 is
`6eec6348`, and advice PR #672 is `b58b4534`. The branches form that order;
PR #670's repaired Actions run `37630443333` is successful. PR #671's run
`37632309093` and PR #672's run `37632350352` also completed successfully on
the heads above, including all suites and commander companions. All three are
ready and mergeable. Nothing has been merged or deployed.

## Independently verified cloud blockers

1. A request to `https://staging.crankmagic.com/version.json` fails with
   `curl: (56) CONNECT tunnel failed, response 403`, from the environment's Envoy
   proxy. TLS and Cloudflare Access are never reached. Adding an Access secret
   cannot fix this. The environment administrator needs to allow HTTPS egress
   to `staging.crankmagic.com` in **this saved environment's** network policy.
   Networked game acceptance also requires its `wss://staging.crankmagic.com`
   connection to be permitted; that capability has not been established here.
2. Presence-only checks find neither `CF_ACCESS_CLIENT_ID` nor
   `CF_ACCESS_CLIENT_SECRET` in this environment. The later October 6 repository
   record says the existing token is `crankmagic-staging-checks`, admitted by
   staging's `Session checks` Service Auth policy. Reuse those existing values
   through this saved environment's secret/settings fields and start a fresh
   session; never paste them into chat. Current dashboard policy and expiry
   cannot be freshly verified from this environment. Do not create a replacement
   token or change the Access policy based on this record alone.
3. `CLOUDFLARE_API_TOKEN` is also absent. This affects the documented direct
   deploy fallback separately from Access authentication. Historical token
   expiry/Builds-read claims remain historical; no credential was created,
   broadened or persisted here.
4. The exact October 4 backup has not reached cloud. Committed live-state
   fixtures and the new D2 game are not replacements for that backup.

After the first two conditions are satisfied, the read-only check is
`node tools/staging-check.mjs --expect <staged-source-commit>`. It verifies
`version.json`, both page version tags and `/api/me` as `service:session-checks`.
It does not prove a WebSocket game or a human friend's Access sign-in.

A real friend's access remains Rob's policy decision. The recorded destination
is **Zero Trust → Access → Applications → CrankMagic staging → Policies**, an
Allow policy scoped to the friend's actual email. Current policy contents and
that person's successful sign-in must be checked; local fixture identities are
not evidence of either. Do not widen production or staging policies to bypass it.

## Release path checked in source

`tools/release-staging.sh` releases only `origin/main`: it checks out that exact
source in a dedicated release checkout, builds the `cloud-staging` profile,
requires release acceptance and Play end-to-end walks, then commits/pushes
`release/cloud-staging`. It requires Wrangler and deliberately unsets the
system-browser override. This cloud's blocked pinned Chromium download is thus
another gate for that existing script, even though system Chromium proves local
browser journeys. No check or browser requirement was weakened.

`tools/release-pages.mjs` currently defines production `pages` with Play excluded;
`cloud-staging` includes cloud Play, playtest tables and `SERVICE_SEATS`. Production
release is therefore not just a deployment of the existing profile: a separately
verified profile change is required to make Play usable there. Staging's service
identity must stay disabled in production. The current `cloud/access.mjs` already
supports service seats for staging, superseding older documentation that called
that code work unfinished.

Before release: exact-head CI in integration order, isolated backup/recovery and
real staging journeys, reviewed production profile, known previous deployment
and a tested rollback/read-back. D8 Workers Builds preview configuration, history
rewrites and reserved branch deletion remain Rob's decisions. AI stays off until
its budget, privacy and execution gates are complete.

## Screenshot transfer

Eight captured fixture screenshots remain intact. The supported Library batch
helper was fetched fresh and invoked once. It stopped before preparing any upload:
`hosted apps tools/list request failed: network`. No upload was finalized and no
Library file ID exists. This is an artifact-transfer connectivity blocker, not a
missing screenshot or permission to publish it. No direct-upload fallback bypassed
the required prepared-upload workflow.
