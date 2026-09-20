# Handoff: make `main` green — 18 September 2026

**For a Claude session in a cloud container**, from the local session on Personal-HP. Scope is one
branch, `claude/main-green`, off `origin/main` @ `9ee74e7`, opened as a draft PR to `main`. Read
`AGENTS.md` and `docs/ACTIVE.md` on `claude/process-docs` (PR #270) before starting.

## The state

`main`'s Tests workflow is **red** on its last two commits (`9ee74e7`, `71cfe26`), and GitHub Pages
**deployed both anyway**. Three suites fail — verified in CI run 35173322468 and reproduced locally:

| Suite | Failure | Where the fix goes |
| --- | --- | --- |
| `tests/data-integrity.mjs` | `README.md` does not name three suites that exist: `crankmagic-graph-scoped`, `explore-progressive-disclosure`, `explore-scope` | README's suite list |
| `tests/generators.mjs` | `docs/data-inventory.md` is stale: one more consumer of `data/graph.json` (`+2→+3`, `+8→+9`) | `node tools/data-inventory.mjs` and commit the result |
| `tests/page-budget.mjs` | *Discover at 1400px has no `#cm-graph` to measure up to* (and at 390px) | The Discover page. `crankmagic-discover.js` still references `#cm-graph` 32 times, so the element is created by script and is absent when the budget test measures — the Explore A/B/C work most likely changed when or whether it renders |

The third one is the reason this goes to you: it only shows with Chromium. The previous cloud
session reported 92 suites green because `page-budget` and `browser-geometry` **skip themselves
without a browser**. CI does not let them: it sets `PAGE_BUDGET_REQUIRED=1` and `GEOMETRY_REQUIRED=1`.
Windows skips them too. So nobody had run that suite for real until CI did.

## Do this

1. `npm install --no-save --no-package-lock playwright@1.56.0 && npx playwright install --with-deps chromium`
   — the same two lines `.github/workflows/tests.yml` runs. Then
   `PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q` and confirm you see the **same
   three** failures before changing anything. If you cannot get Chromium running, stop and say so;
   a fix for the third suite that was never watched go red→green is not a fix.
2. Fix the three. For the Discover one, find why `#cm-graph` is not in the DOM at load on the
   `#discover` route at 1400px and 390px, and restore it or update the boundary in
   `tests/page-budget.mjs:56` **only if** the page genuinely no longer has that element by design —
   say which in the commit message.
3. Prove it: the same command, 92 suites, exit 0, with both `_REQUIRED` variables set.
4. Push, open a draft PR to `main` titled so that the three fixes are the whole diff. CI on the PR
   is the proof that matters; paste its run URL in the PR body.
5. Do not merge. Do not touch `claude/sleepy-carson-saeway` (#268), #269 or #270 — they inherit
   these failures and go green once `main` does.

## What you cannot prove there

Anything touching Forge, the JDK or a real table. None of this task does. `preflight.mjs` will not
run for you (no Forge); `runtests.sh` is the right gate for this work.

## Hand back

Update `docs/ACTIVE.md` on your branch is not possible (it only exists on #270); instead put the four
things in the PR body: the commit you describe, what is proven vs assumed, the command that proves
each claim, and what is outstanding. The local session picks it up from there.
