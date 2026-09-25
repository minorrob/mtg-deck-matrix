# Stage 2 — Account Cloud

**Your library in the cloud, optional.** Signed out, CrankMagic is exactly what it was: a library in this
browser. Signed in, the library also saves itself to the cloud a few seconds after each change and comes back
on any device the person signs in on. Part of the program in `docs/plan-program-2026-09-24.md`.

## Rob's calls (2026-09-24)

| | |
|---|---|
| Who gets an account | **Invite-only** — only emails Rob adds |
| Sign-in | **Google for everyone**; an emailed code only as a fallback for library sync, **never for AI** — *"This will be using my AI API in there so I want to ensure it's secure."* |
| The AI door (Stage 3) | its own Access rule (Google, plus Cloudflare's passkey MFA if the plan includes it), a separate AI allowlist in the app, the key only as an encrypted Worker secret Rob enters, spending caps, a log of every call |
| Rollout | **staging first** — staging.crankmagic.com, Rob only, its own database; crankmagic.com switches when Rob approves |
| Two devices both changed | **ask which to keep**; the other stays in the cloud for 30 days |

## How it works

```
browser (crankmagic-account.js + cloud-sync.js)
   │  the app's own backup (checksummed), gzipped, base64 — the Worker never opens it
   ▼
Cloudflare Access  ── invite-only; Google or emailed code; signs a token for the Worker
   ▼
Worker (cloud/worker.mjs, /api/* only) ── verifies the token again (cloud/access.mjs)
   ▼
D1 (cloud/library.mjs, cloud/migrations) ── users · snapshots · heads
```

- **What travels is a backup.** The same checksummed file Menu → Save a backup writes, verified on the way back
  exactly as Restore verifies a file (`CrankExchange.readBackup`). A corrupt or foreign version is refused in
  the browser before it touches the library.
- **The head moves only from where a device left it.** A save names the version the device started from; the
  head moves only if it still points there (compare-and-swap in one D1 transaction). Otherwise the device is
  told the current head and `cloud-sync.js` decides: bring it in (only the cloud moved), or ask (both moved).
- **Nothing is lost by a choice.** "Keep this device's" is a forced save that marks the version it replaces
  `displaced`; "Use the cloud's" first files this device's version as `kept`. Both are held 30 days; the newest
  twenty everyday versions and the head are always held.
- **The Worker never touches the bytes.** D1 would hand a BLOB back as a JavaScript array of numbers, and a free
  Worker has 10 ms of CPU, so the body is stored and returned as base64 text.
- **Two tabs, one decision.** The decision and every write read the stored library, never a page's copy of it.

## Security

- Access admits only invited people and signs a token; the Worker **verifies it again** — signature against
  the team's published keys, audience, issuer, expiry, a named person — so a misconfigured rule fails closed.
- Writes must carry the app's own header, be JSON, and come from this origin (no cross-site forgery with the
  Access cookie). Every lookup includes the person's id: nothing crosses between people.
- `ACCESS_JWKS` (keys given directly) exists only for the local end-to-end run; the release builder refuses a
  configuration that sets it.
- Production (`pages` profile) carries no account code and no Worker script until Rob approves.

## Proven, and how

| Claim | Command | Result |
|---|---|---|
| The Worker | `node tests/cloud-worker.mjs` | 44 checks — nine kinds of bad token, key rotation, writes from the app only, the compare-and-swap, forced and kept versions, retention, isolation between people; six mutations (audience, signature, CAS, ownership, forgery guard, redirect) each turn it red |
| What a device does next | `node tests/cloud-sync.mjs` | 18 checks — every combination of who moved; a 1 MB library round-trips gzipped |
| The builds | `node tests/release-pages.mjs` | 86 checks — production has no accounts; staging has its own Worker, database and `/api/*`-only script |
| Two devices, one library | `node tests/uat/cloud-e2e.mjs` (local, `wrangler dev` + local D1) | 10 checks — a restored library saves itself; a new device brings it in; a deck made on one appears on the other; both changed → asked, with the decks only one side has named; the side not chosen is kept, displaced |

## Infrastructure

| | Staging | Production |
|---|---|---|
| Worker | `crankmagic-staging` on staging.crankmagic.com | `crankmagic` on crankmagic.com — pages as files, the API for `/api/*` |
| D1 | `crankmagic-staging` (`b7f806ec-…`, created 2026-09-24) | `crankmagic` (`131b2c74-…`, created and migrated 2026-09-24) |
| Access | "CrankMagic staging": the whole host, Rob only — **Rob's setup** | "CrankMagic accounts": crankmagic.com/api/*, the invite list — **Rob adds an invitee by adding their email to its Invited policy** |

Rob's setup (these steps involve Google's client secret, which only he enters): Zero Trust team; Google as a
login method (a Google Cloud OAuth client whose redirect URI is `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`);
One-time PIN; the staging Access application. Its team domain and Audience tag go in
`PROFILES["cloud-staging"].cloud.access` in `tools/release-pages.mjs`; until then the staging build names them
as pending and refuses to be written out.

## Deleting an account (R3.3b)

**The person does it:** Settings › Data › Delete account…. They type the address they are signed in as, and
`DELETE /api/account` removes their head, every saved version of every kind and their user row, in one D1 batch.
The Worker checks the address again and deletes nothing without it; the page stops syncing first and signs out
after, so the library is not uploaded straight back. Their device's own library stays theirs.

**Rob's step, only when asked** (the dialog and the privacy page tell people to e-mail admin@crankmagic.com):
remove their address from the **Invited** policy of the "CrankMagic accounts" Access application, and revoke
their session under Zero Trust → My Team → Users. Until then they can still sign in, and signing in again
starts an empty account. When the request comes by e-mail instead, do the same, and ask them to use Delete
account in Settings first; if they cannot, delete their rows by e-mail address in the D1 console.

## Next

1. Rob's Access values → deploy staging (`wrangler d1 migrations apply crankmagic-staging --remote`, then
   `wrangler deploy` from the tested folder) → Rob signs in on two devices.
2. ~~Rob approves → production.~~ Done 2026-09-24: Rob approved staging ("Everything looks good!"), created the production Access application, and the `pages` profile gained accounts.
