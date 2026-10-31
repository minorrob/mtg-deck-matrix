---
name: prove-a-change
description: Decide how a CrankMagic change is proven — which suites run, what new test is written, how to watch it fail first, and what a container cannot prove. Use before writing code for a story, when adding a suite, or when asked "how should we test this".
---

# Proving a change

Adapted for CrankMagic from the practice in Anthropic's `engineering:testing-strategy` plugin skill, in our own words.
`AGENTS.md` wins where they differ.

## Needs

Node 22 and the repository. Browser suites need Playwright's Chromium (preinstalled in a cloud container). Forge or
the JDK exist only on Personal-HP: a claim that needs them is assigned to a local session and written as unproven.

## 1 · Name the claim before the test

One sentence per claim the change makes ("a tapped land is not offered as a mana source"). Each claim gets exactly
one command that proves it. A claim with no command is listed as assumed in the PR body.

## 2 · Pick the cheapest level that can fail for the right reason

| What changed | Prove it with |
| --- | --- |
| A rule, a card definition, the engine | a scenario or a `game/tests/*.test.mjs` case; a card's ways from untapped sources (`AGENTS.md`, card ways) |
| A model, data or a generator | a Node suite in `tests/` over a fixture; `tests/data-integrity.mjs` when a suite is added |
| The room, the Worker, an API | a contract test of the request and the answer, including the refusal |
| A screen or an interaction | a browser suite in `tests/`, plus `visual-acceptance` (a passing suite is not visual acceptance) |
| A served file moved or renamed | `tests/asset-versions.mjs` |
| Wording | `tests/feature-wiring.mjs` (US English, `'en-US'` formatters, symbols) |

Skip tests of trivial plumbing; never skip error paths, refusals, money, accounts or anything a player decides.

## 3 · Watch it fail

Break the thing under test, watch the test go red, restore it. Record the red line in the PR. An assertion that
cannot fail (a regex that matches everything, a check of a value the test itself set) is deleted, not kept.

## 4 · Run only what the change touches

Before a push: the suites that read the changed files, and `tools/local-ci.sh <ref> 0`. The full run belongs to
GitHub Actions on the ready PR (`AGENTS.md`, "No run twice what another run already proved"). A ratchet (the census
baseline, the UK-spelling count, page budgets) only moves in the good direction.

## 5 · Write it down

The PR body lists each claim, its command, and whether it is proven here or needs Personal-HP.
