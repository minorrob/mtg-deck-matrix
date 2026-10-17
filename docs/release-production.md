# The production release, on Rob's go (Part 7's G-F)

G-F asks: Rob reviews staging; every finding is remedied; the production release is built from `main` with
`release-acceptance.mjs` green on it, pushed to `release/pages` on **Rob's go**, deployed by Workers Builds,
walked live, and its version read back. The proof is the release commit, the version id and the live walk's
count.

Nothing here pushes to production by itself. Each push below is Rob's go, every time.

## Where production is (read 2026-10-11, read-only)

- **crankmagic.com serves the `pages` profile** of main `b630128` (2026-10-01): the workshop, with Play saying
  Coming Soon. That is version `2fc36d3b`, deployed by `wrangler` on 2026-10-01 19:59 UTC, as were the three
  before it.
- **`release/pages` holds a release that never deployed:** `2543cef4`, main `3f202c4` of 2026-10-03. Nothing shows
  Workers Builds deploying production from `release/pages`.
- **So Rob checks first:** Workers & Pages → `crankmagic` → Settings → Build. The branch should be `release/pages`
  and the deploy command `npx wrangler deploy`, as `crankmagic-staging`'s are for `release/cloud-staging`. The
  session's token can't read Workers Builds, so this is Rob's to see.
- **Production has never registered the table class.** Cloudflare can't roll back across a Durable Object class
  change, so Play goes out in two releases (`docs/production-play-profile-2026-10-07.md`):
  1. the **standby** (Play closed, the class registered), whose version becomes the recovery target;
  2. then **Play**.

## Before the go

- **G-A to G-E done:** the gates in `docs/ACTIVE.md`.
- **Rob's review of staging:** the workshop (Decks, the Library, Explore), a game against the AI and one with a
  person, the Coach, Settings and AI Coach settings, *Send feedback*, account deletion.
- **Every finding remedied:** `node tools/playtest-triage.mjs` meets its exit criteria on G-D's run, and G-E's run
  has no finding open but those Rob rules can wait.
- **The AI door:** open in `cloud-production` since Rob's go of 2026-10-14, to everyone signed in (`docs/ai-door.md`,
  *Open to everyone signed in*). The `pages` release and the standby keep it shut, and `tools/release-pages.mjs`
  refuses a release whose AI settings are not its profile's.

## The two releases

The release checkout is a worktree with `node_modules`; `WRANGLER` is the pinned 4.139.0 `bin/wrangler.js`.

1. **The standby.** Run:

       WRANGLER=<wrangler.js> bash tools/release-production.sh cloud-production-standby <release checkout>

   - **It builds** main, walks the build (`release-acceptance`), and runs `production-play-e2e` (both production
     profiles under wrangler dev).
   - **It commits the result** to the local `release/pages`, and stops there.
   - **On Rob's go:** `git -C <release checkout> push origin release/pages`.
   - **Read back:**
     - Workers Builds deploys it;
     - `curl -s https://crankmagic.com/version.json` says this commit and profile `cloud-production-standby`;
     - the live walk passes: `UAT_BASE=https://crankmagic.com UAT_LIVE_NETWORK=1 node tests/uat/release-acceptance.mjs`.
       `UAT_LIVE_NETWORK=1` lets Scryfall answer, as it does for a person on the site and in the release scripts' own
       walks. Without it the walk answers from the shipped catalog only, and on 2026-10-14 it stopped at *Measure*:
       the draft held 44 cards that only Scryfall knows.
   - **Record the deployed version id** (`wrangler deployments list`, or the API's `/deployments`). That version is
     the recovery target.
   - **Rehearsed 2026-10-11** on main `1aa46cd`: built, `release-acceptance` 23 checks, `production-play-e2e` 27,
     committed locally, nothing pushed, and the local candidate deleted afterward.
2. **Play.** Do the same with `cloud-production`, on its own go: the build, Rob's push, the deploy, the read-back
   (profile `cloud-production`), and the live walk.

## If Play has to close

Release `cloud-production-standby` again, or roll back to the standby version recorded above. That rollback is
allowed, since the table class is the same. Standby closes the way in:
- new tables, invitations and sockets are refused;
- the library and accounts go on;
- games already connected can play on, and their drop clocks run.

So tell the people at a table what happens next. Nothing in D1 or a table's storage is deleted or rewritten.

## Afterward

Record the G-F proof in `docs/ACTIVE.md`:
- the release commit;
- the version id;
- the live walk's count.

Then Part 7's second sentence is said only if it is true.
