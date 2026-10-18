# The program readout: what it reads, and how a workstream updates its feed

`index.html` is the one page Rob opens to see every feature in his words, where it stands, what remains by
workstream, and his own queue. It is static: no build, no server, no account. It reads two kinds of JSON.

- `north-star.json`: the outcomes (Linear projects and milestones), the launch checklist and the workstream roster.
  Owned by Claude · Deck intelligence; the outcomes' wording is Rob's.
- `feeds/<workstream>.json`: one file per workstream, edited only by that workstream, so two sessions never touch the
  same file. `tests/readout-feeds.mjs` validates all of them and fails CI on a malformed one.

## How Rob opens it

- From a clone: double-click `docs/readout/index.html`. The page fetches `north-star.json` and the feeds from GitHub's
  raw files on `main`, so it is current wherever the file is opened. The footer says which source it read.
- Served locally: `node tools/serve-folder.mjs docs/readout 8797`, then http://localhost:8797/ ; add `#local` to the
  address to read the files beside the page (a branch's feeds before they merge) instead of `main`.
- It is never released: `docs/` is in the release's never list (`tools/release-pages.mjs`, `NEVER`).

## The feed schema (`feeds/<workstream>.json`)

```json
{
  "workstream": "claude-deck",
  "updated": "2026-10-18T06:00:00Z",
  "updated_by": "the session, in a few words",
  "branch": "claude/deck-readout",
  "now": "One sentence: what this workstream is doing right now.",
  "items": [
    {
      "id": "ROB-109",
      "outcome": "deck-creation",
      "feature": "Build me a deck from my criteria",
      "status": "in_progress",
      "remaining_hours": 24,
      "note": "Optional, one sentence.",
      "evidence": [{"label": "PR #750", "url": "https://github.com/minorrob/mtg-deck-matrix/pull/750"}]
    }
  ],
  "asks_of_rob": [
    {"id": "ROB-139", "ask": "Pick the game's name", "recommendation": "Crank Table", "needed_by": "before Play home ships", "url": "https://linear.app/robs-build/issue/ROB-139"}
  ],
  "blocked_on": [
    {"id": "ROB-116", "by": "ROB-11: a headless N-game entry point from Claude · Engine", "owner": "claude-engine"}
  ]
}
```

Rules the validator enforces:

- `workstream` is one of `claude-engine`, `claude-deck`, `codex-play`, `codex-workshop`, `grok`, and matches the
  file name.
- `updated` is an ISO-8601 timestamp; `now` is a non-empty sentence.
- Every item has an `id` matching `ROB-\d+`, an `outcome` that is a key in `north-star.json`, a `feature` in plain
  words (Rob's, not the module's), a `status` in `backlog`, `in_progress`, `review`, `blocked`, `done`, `held`, and a
  `remaining_hours` number that is `0` when `done`.
- No two items share an `id` within a feed. An item may appear in two workstreams' feeds only when the Linear issue
  names both (a Shared contract); each feed carries its own hours.
- Every ask of Rob has an `id`, an `ask` and a `recommendation`.
- The file holds no email address and no token (the same scan `tools/local-ci.sh` runs).

What the page computes from the feeds: progress per outcome (done hours over total hours of its items, and done
items over items), remaining hours per workstream and in all, days at the hours-per-day set in `north-star.json`,
Rob's queue (every `asks_of_rob` across feeds, newest first), the blocked list, and freshness (a feed older than
three days is marked stale; older than seven, red).

## The protocol (also in `docs/program/README.md` §7)

At the end of every working session and at every merge: update Linear (status, proof comment, PR link); update your
feed (`updated`, `now`, item statuses and hours, evidence, asks, blocks); run `node tests/readout-feeds.mjs`; commit
and push; one paragraph in your `docs/ACTIVE.md` section. `done` means merged, released where it ships, and the
evidence is on the Linear issue, never "the code exists."

When you label a Linear issue **Rob's call**, add the same ask to your feed's `asks_of_rob` with a one-line
recommendation; remove it when Rob answers. The queue on the page is built from the feeds, not from Linear, so an ask
that is not in a feed is invisible to Rob.

## Snapshots

`snapshots/<date>.html` is the readout as it stood on a given day, with the feeds inlined and reconciled against
Linear by the readout keeper (Claude · Deck intelligence): Linear's Done and In Progress win over a feed, blocks whose
blockers have merged are lifted, and every correction is listed in a banner at the top of the snapshot. A snapshot is
a record; the live page `index.html` keeps reading the feeds as each workstream last wrote them. The first is
`snapshots/2026-10-18.html`, taken at 12:20 UTC after the day's twenty merges.
