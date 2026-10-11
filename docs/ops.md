# Operations: monitoring and backups (M3)

What the cloud releases (`crankmagic`, `crankmagic-staging`) tell their operator, how to read a week of it, and how
the account database comes back after a mistake. The plan's M3, `docs/plan-to-done-2026-09-30.md`; the gate it
serves is G-E, before human invites.

## What is logged

**Workers Logs keeps the Worker's own lines, and nothing else** (`tools/release-pages.mjs`, `OBSERVABILITY`):
logs on, every line kept (`head_sampling_rate: 1`), and the platform's per-request line off
(`invocation_logs: false`). That line carries the request's headers, and among them is Access's signed assertion
of who is asking. `tools/release-pages.mjs` refuses a release that would keep it, or whose logs are off or sampled.

**One line per answer the operator should hear about** (`cloud/worker.mjs`, `opsLine`):

| `ops` | When | Level |
|---|---|---|
| `5xx` | Any answer of 500 or more. **500** is an error the Worker did not expect. **502/504** is the AI provider or a model's answer failing. **503** is a feature switched off. | error |
| `sync-conflict` | `PUT /api/library` refused with 409, because the library moved on another device | log |

Each line has `ops`, `status`, `method` and `route`. The route is the resource only: `/api/tables`, never a table's id
or an invitation's code. An unexpected error adds its `error` name and `at`, the first three stack frames. The
error's message is never logged, because it can carry what was sent. No line names the person. `tests/cloud-worker.mjs`
proves each of these through the Worker's whole path.

Workers Logs keeps lines for 3 days on Workers Free, and 7 on Workers Paid.

## The alerts (Rob's to create)

Creating an alert writes to the account, and its email is Rob's. Under *Workers & Pages › Observability › Alerts*,
make a Workers Observability alert for each Worker (`crankmagic`, `crankmagic-staging`):

1. **CrankMagic: errors.** Filter `ops` equals `5xx` and `status` not equal to `503`. Count over 5 minutes, above 0.
   Email Rob.
2. **CrankMagic: sync conflicts.** Filter `ops` equals `sync-conflict`. Count over 1 hour, above 5: one device stuck
   in a conflict, or two fighting. Email Rob.

A 503 is left out because it's a feature switched off on purpose. The weekly check still counts it.

## The weekly check

```
node tools/ops-week.mjs --profile cloud-staging        # or cloud-production; --days 7 by default
```

It needs `CLOUDFLARE_API_TOKEN`, plus `CLOUDFLARE_ACCOUNT_ID` unless the token sees one account. In a Claude cloud
session the proxy adds the token: run it with `NODE_USE_ENV_PROXY=1`. It reads and changes nothing
(`tests/ops-week.mjs`), and prints:

- **the monitoring lines** by kind and status (Workers Logs);
- **what is held:** people, libraries, versions and their size;
- **the AI calls** by feature and outcome, in cents (counts only, never an address);
- **how far back Time Travel reaches;**
- **whether R2 is on** for the nightly copy.

It exits 1 when the week holds an incident: a 5xx other than a 503.

## Backups

**Today: D1 Time Travel.** Each database can be restored to any minute of the last 30 days on Workers Paid (7 on
Free). The weekly check reports the reach. On 2026-10-11, staging answered a bookmark from just after it was made
(2026-09-24), inside its 30-day window. A restore replaces the whole database and is Rob's call, staging first:

```
wrangler d1 time-travel info <database>                                # the bookmark now, to come back to
wrangler d1 time-travel restore <database> --timestamp=<ISO time>      # back to that minute
```

Time Travel lives with the database, so it can't bring back a database that was deleted, or anything older than
its window. That is what the nightly copy is for.

**Next: a nightly copy to R2.** It waits on R2. Cloudflare's API answers *"Please enable R2 through the Cloudflare
Dashboard"* for this account. These choices are Rob's before it's built:

1. **Turn R2 on** for the account, and name the bucket (for example `crankmagic-backups`; one for each of staging and
   production).
2. **How long a copy is kept** (for example 30 nights).
3. **What account deletion promises.** A copy holds a deleted account until the copy ages out. So the privacy page
   must say so (*"and from the nightly backups within 30 days"*), or deletion must remove the account from every copy.

Then the Worker gets a nightly scheduled handler, which writes each table to the bucket and removes copies past
the window, behind a release check that binds the bucket wherever the cron runs.

## Rob's, in one list

- [ ] Create the two alerts for each Worker, with his email.
- [ ] Turn R2 on, and name the bucket(s).
- [ ] Choose how long a nightly copy is kept, and what deletion promises.
