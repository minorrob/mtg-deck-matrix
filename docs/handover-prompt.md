# Handing this project to a fresh session

Everything below is meant to be copied. The repository is **public**, so a Claude session on
any account and any computer can read it with no credentials, no invite and no export from
this machine.

- **Repository:** https://github.com/minorrob/mtg-deck-matrix
- **The map:** [`docs/handover-index.md`](./handover-index.md) — every file, data set, tool,
  test and external reference, and what each one is for.
- **This file:** `docs/handover-prompt.md`

---

## The prompt

Paste this as the first message of a new session. It assumes nothing except a terminal and
network access.

```
Clone and read https://github.com/minorrob/mtg-deck-matrix (public, no credentials needed),
then read docs/handover-index.md end to end before doing anything else. It is the map of
this project: every source module and what it owns, every data file and what generates it,
the simulation and its protocol, the test suites and how to run them, the tools, the
external services the code touches, and the decisions behind all of it.

The short version so you know what you are looking at: it is a zero-dependency static web
app for building and measuring Magic: the Gathering Commander decks. No package.json, no
build step, no server, no framework. Three pages — index.html (My Decks), matrix.html (Deck
Matrix), graph.html (Card Graph) — sharing UMD modules that also load under Node, which is
how the tests reach them. Every deck is scored by a simulation engine in sim-engine.js that
plays each hundred-card list 20,000 times per seed across six seeds; the numbers on screen
come from that engine and from nowhere else.

Two conventions matter more than they look:

1. Every asset URL carries a ?v= number and tests/asset-versions.mjs enforces one version
   per file across all three pages, and that a changed file gets a changed number. Change a
   file, bump its ?v= everywhere it is named, then run `node tests/asset-versions.mjs
   --update`.

2. The reasoning lives in the code. Module header comments explain why a thing is the way
   it is, usually by naming the bug that made it that way. Commit messages do the same at
   a larger scale. Read them; `git log` is the design history, not a changelog.

Verify before you build: `bash runtests.sh -q` runs every Node suite. The browser journeys
are `python3 -m http.server 8790` in the repo root, then `node tests/uat/journeys.mjs` with
Playwright available (set UAT_PLAYWRIGHT to its index.js if it is not resolvable by name).

When you have read the index, tell me what you understand the app to be, what you think the
weakest part of it is, and what you would want to change first — then wait for me.
```

---

## If you want the other session to work on the code rather than only understand it

Add this to the end of the prompt:

```
Work on a branch, never on main. Run `bash runtests.sh -q` and the browser journeys before
you push anything, and open a draft pull request rather than merging.
```

## What this does not carry

Nothing in the repository is a credential, and there are no API keys in it — see
`docs/claude-api-evaluation.md` for the consequences of that, which are the reason any
Claude-powered feature here has to be generated offline or put behind a small proxy. If you
want a second session to run something that needs a key, you have to give it the key
yourself; it is not in the clone.
