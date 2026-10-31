---
name: incident
description: Handle CrankMagic broken for players in production or staging — triage the severity, tell Rob, stop the harm (roll back or close Play), find the cause, fix it through the loop, and write the short record. Use when crankmagic.com or staging is down, games fail, accounts or data are at risk, or a release went wrong.
---

# When it is broken for players

Adapted for CrankMagic from Anthropic's `engineering:incident-response` plugin skill, in our own words. `AGENTS.md`,
`docs/release-production.md` and `docs/release-pages.md` win where they differ.

## Needs

| Tool | For | If it is missing |
| --- | --- | --- |
| The staging service token | reading staging (`tools/staging-check.mjs`) | Exit 2 means it is not in the environment: tell Rob; never ask for it in chat. |
| Cloudflare (Workers, D1) | versions, logs, rollback | Rob's dashboard and Personal-HP's wrangler; a cloud session reads what its token allows and says what it could not. |
| Linear | the incident issue | Ask Rob to connect it, or keep the record in the PR. |

## 1 · Triage (minutes, not hours)

| Severity | Meaning |
| --- | --- |
| 1 | Players cannot sign in or play, data or accounts at risk, a secret exposed |
| 2 | A main path is wrong (a game resolves wrongly, decks fail to load) |
| 3 | A screen is broken but there is a way around it |

Severity 1 or 2: **tell Rob first**, in one message: what is broken, since when (the release commit if known), who is
affected, and the one action you recommend.

## 2 · Stop the harm, on Rob's go

- Production: roll back to the recorded recovery version, or release `cloud-production-standby` to close Play (it keeps
  the library and accounts; `docs/release-production.md`, "If Play has to close"). Never a delete migration.
- Staging: release the previous `main` through `crankmagic-release`.
- A leaked secret: Rob revokes it; the session removes it from the code and history only as Rob directs.

## 3 · Fix through the loop

A Linear issue (severity in the title), then `debug-a-report`, `prove-a-change`, `review-before-ready`, and
`crankmagic-release`. The fix still merges by `AGENTS.md`'s rules; urgency shortens waits, not checks.

## 4 · The record (the same day)

On the issue: timeline (UTC and Rob's local time), what players saw, the cause, what stopped the harm, the fix and its
release, and what prevents a repeat (a test, a guard, a release check), each with an owner. No blame; the cause is a
mechanism, not a person.
