# Branch audit — 2026-09-24

Rob asked for `main` to be brought completely up to date: merge the open PRs, check every other branch for
work `main` does not have, bring over what should come, and list what may be deleted. On the list he ruled:
*"Forge-era work and any card data capture should be kept as a branch, though not in use. The rest can be
deleted."*

**Merged:** #358 (`fdc85d5`), #359 (`a97ad03`), #360 (`29af00f`). **Brought over:** #290's four on-screen
strings, in #360 with the rest of the app's American English (#290 closed as superseded). Nothing else needed
bringing over.

**How each branch was judged** — by content, not ancestry, since most were squash-merged and look unmerged to
`git branch --no-merged`: the PR that carried it (state, and whether its head is the branch's tip), `git cherry`
against `main`, and `git merge-tree --write-tree origin/main <branch>` (would merging it change `main` at all).
Then Rob's rule, by the files each branch changed: Forge era = the game host, the Forge adapter, the online
lobby and play pages; card data capture = the card, collection and engine data, the source workbooks, and the
tools that build them.

## Kept — 16 branches, not in use

| Why | Branches |
|---|---|
| **Forge era** (9) | `codex/phase-b-online` (#235), `codex/play-hero-alignment` (#236), `cursor/phase-0-alignment-play-fix-49bc` (#246), `claude/uat-r0-r1b` (#352), `claude/engine-hosting` (#359 — the Forge-hosted board), `codex/phase-c-qa` (Forge stalled-step recovery, one commit past its PRs), `cursor/fix-guest-live-play-6778` (#263), `claude/sleepy-carson-saeway` (#268, online readiness), `cursor/personal-hp-online-2026-09-17` (a parking commit of the online work: `.bak` copies, screenshots, tarballs) |
| **Card data capture** (7) | `claude/engine-scaffolding` (#353 — the engine's 31,830-card pool), `claude/actual-costs` (#40 — prices paid), `claude/app-assignment-handoff` (#43 — `data/cards.json`), `cursor/emit-tobuy-planned-entries-ef34` (#257 — the live-load builder), `claude/live-load-v15` (the v15 Master workbook), `astra/simulation-fidelity-plan` (#80 — commander ranks and glossary, and the tool that captures the ranks), `claude/reshell-obuun-quintorius` (#44 — the library state files) |

And `release/pages`, which is production (`docs/release-pages.md`).

## Deleted — 31 branches, backed up first

Every one either merged into `main` or superseded by work that did; none was Forge era or card data.

`claude/slot-ladder-redesign` `claude/carry-rung-to-deck` `claude/keep-slot-pane-open`
`claude/rung-ticks-owned-boxes` `claude/deck-readiness` `claude/gallery-and-collapse`
`claude/slot-detail-collapse` `claude/shop-status-scoped-to-deck` `cursor/explore-scope-chooser-003a`
`cursor/measure-lab-fidelity-copy-f002` `cursor/explore-progressive-disclosure-b35c` `cursor/design-c-wanted-82eb`
`cursor/phase1-pr1-chrome-labels-a3df` `cursor/explore-c-scoped-graph-246d` `cursor/drop-build-from-top-nav-b851`
`cursor/unify-new-deck-wizard-1acc` `cursor/deck-hub-tabs-e4dd` `cursor/sample-deck-empty-states-7b20`
`cursor/hotfix-boot-version-skew-db47` `claude/main-green` `claude/engine-vocabulary` `claude/engine-effects`
`claude/engine-resolution` `claude/engine-keywords` `claude/engine-blockers` `claude/serene-curie-w23aan`
`claude/baton-post-audit` `claude/fervent-hawking-f9565f` `uat` `live-ui-fix-wip` `claude/american-english-on-screen`

**The backup:** `C:\Users\robmi\CrankMagic\archive\deleted-branches-2026-09-24.bundle` (103 MB, all 31 heads,
`git bundle verify` okay). To bring one back, from `repo`:

```bash
git fetch C:/Users/robmi/CrankMagic/archive/deleted-branches-2026-09-24.bundle refs/remotes/origin/uat:refs/heads/uat
```

## Not decided here

- **About 80 more branches on GitHub are ancestors of `main`** — fully merged by history, so the audit did not
  list them. Some are Forge era. Deleting any is Rob's call under the same rule.
- **`.claude/worktrees/friendly-lamarr-fd669a`** (0 commits ahead of `main`) and
  **`CrankMagic\archive\mtg-deck-matrix-astra-review`**: folders, and AGENTS.md says no agent removes a folder
  it did not create. Rob's.
