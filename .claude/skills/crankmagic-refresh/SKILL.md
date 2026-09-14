---
name: crankmagic-refresh
description: Refresh CrankMagic's committed card data — the Commander universe, flavour names, the graph corpus, EDHREC ranks, the Card records with prices, commander strategies, the manifest — in the order the specification requires, bump the ?v= a browser needs, prove it with the suites, and open the pull request. Use when a set is released, prices are stale, or the user asks to refresh the data.
---

# Refreshing CrankMagic's data

You are running the data refresh for `minorrob/mtg-deck-matrix`. The app is a static site
that works on a phone with no signal, so every card fact it shows lives in a committed
data file, and those files go stale unless somebody refreshes them. The specification is
`docs/crankmagic-refresh.md`; read its "What a refresh must never do" before anything else.

Nothing here needs a model, an API key or a paid call. Scryfall and EDHREC are public; the
only cost is politeness, which the tools already pay (100 ms between requests, `curl`).

## The runner owns the order

`tools/refresh.mjs` runs the generators the data registry (`schema/index.mjs`) already
names, in the order the specification requires, then the version cascade, then the proof.
Do not run the generators by hand in a different order, and do not edit a data file by
hand: every row in every generated file traces to a Scryfall or EDHREC response.

```
node tools/refresh.mjs --plan      # read the steps first
node tools/refresh.mjs             # the refresh, the bumps, the proof (30–60 minutes; the graph step is the long one)
node tools/refresh.mjs --check     # no writes: every producer's --check and the proof
```

`--only ranks,manifest` runs a subset in the plan's order; `--skip graph` leaves the corpus
rebuild out when only prices or ranks are wanted; `--no-tests` skips `runtests.sh` at the
end and is only for a dry run you will follow with a full one.

## Steps

### 1. Preconditions

- A clean working tree on a branch that is not `main` (the runner refuses a dirty tree, so
  the refresh is one reviewable diff). Node 22 and `curl` on the path; network to
  `api.scryfall.com` and `json.edhrec.com`.
- `graph/.cache/` is gitignored and holds the rules text the graph step reuses. Without it
  the graph step refetches the corpus (an hour); with it, minutes. Keep it between runs.
- Note the counts before you start: `node tools/refresh.mjs --plan` lists the files; their
  envelopes carry `count`. The runner compares them for you, but you should know what a
  normal set adds (roughly 250–400 cards to the universe).

### 2. Run it

`node tools/refresh.mjs`. Read the whole log, not only the last line. The runner:

- runs each step and stops at the first failure, leaving that step's output in the tree for
  you to inspect (`git status`, `git diff --stat`) or discard (`git checkout -- <file>`);
- refuses a shrink: the universe, the flavour names, the graph and the record set grow by a
  set's worth and never shrink. A smaller count means a query changed meaning. Discard the
  run and look at the tool before running again — never commit a shrink;
- bumps `?v=` only for the served data files that actually changed, moves the cascade
  (`crankmagic-assets.js`, the worker's registration line in `crankmagic-app.js`, the pages)
  and records the hashes with `tests/asset-versions.mjs --update`;
- refuses a run that changed anything outside the files a refresh may touch — in
  particular `data/live-load.json`, `data/live-state.json`, `data/deck-ratings.json`,
  `data/simulation-summary.json`, `data/deck-guides.json` and `sim/`;
- proves the result: every producer's `--check`, `tests/asset-versions.mjs`, the README's
  suite count against the directory, and `bash runtests.sh -q`.

Exit 0 means every check passed. Anything else means stop and read.

### 3. When a check fails

| What the log says | What it means | What you do |
|---|---|---|
| a step exited non-zero | Scryfall or EDHREC refused or timed out, or the tool found the file inconsistent | re-run that step alone with `--only <id>` once; if it fails again, report the tool's own message and stop |
| `shrank from N to M` | the query changed meaning or the source was partial | `git checkout -- <file>`; do not commit; report the counts |
| `--check` fails after a run | the generator and its checker disagree, which is a bug in the tool | stop; report which tool; do not hand-edit the file to make the check pass |
| `tests/asset-versions.mjs` fails | a served file changed without a new `?v=` | the runner should have bumped it; run `node tests/asset-versions.mjs --update` and look at why the bump was missed |
| the README count differs from the directory | a suite was added or removed without the README | fix the README line `There are N Node suites:` and its list |
| `runtests.sh` fails | a suite reads the refreshed data and its expectation moved | read the suite's message; a count that grew is usually a fixture to update, a card that vanished is a shrink in disguise |

Never skip, disable or quarantine a suite to get a refresh through.

### 4. Commit and open the pull request

One commit, on the branch, with the counts in the message:

```
Data refresh <YYYY-MM-DD>: universe 31,830 → 32,190, flavour names 513 → 520, graph 31,830 → 32,190, ranks 1,000, records 2,131, strategies 2,746 → 2,790

- tools/refresh.mjs, every step; the graph step reused graph/.cache
- ?v= bumped: commander-universe 3 → 4, flavor-names 3 → 4, graph 17 → 18, graph-played 2 → 3, cards 7 → 8, card-facts 4 → 5, commander-strategies 1 → 2; the cascade
- proof: every producer's --check, asset-versions, README count, 55 suites
```

Open a draft pull request against `main` with the same table and the log's last block,
and say what you could not reach (the runner lists cards whose lookup failed and kept
their old values). Do not merge it yourself unless the user has said to.

## What you never do

- Never invent a card or a price. If a fetch fails the tool keeps the previous value and
  says so; leave it that way.
- Never touch the reader's library (`data/live-load.json`, `data/live-state.json`), the
  measured scores (`data/deck-ratings.json`, `data/simulation-summary.json`, `sim/`) or the
  hand-written guides. A catalog refresh is not a state change and not a measurement.
- Never bump a version without changing the file, or change a file without bumping. The
  runner does this for you; do not do it by hand.
- Never run the Neo4j ingest (`graph/ingest/`) from here. When the corpus itself must grow
  to a new set's cards, say so: that is a separate, documented job with its own README.
