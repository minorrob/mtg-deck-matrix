---
name: debug-a-report
description: Debug a CrankMagic bug report — a Jam, a Send feedback row, a playtest finding, a stack trace or "it broke" — by reproducing, isolating, finding the cause and fixing it with a test that fails first. Use for any defect before writing a fix.
---

# Debugging a report

Adapted for CrankMagic from the practice in Anthropic's `engineering:debug` plugin skill (reproduce, isolate,
diagnose, fix), in our own words, with this repository's rules applied. `AGENTS.md` wins where they differ.

## Needs

| Tool | For | If it is missing |
| --- | --- | --- |
| Linear | the issue the report becomes | Ask Rob once: *"Linear isn't connected in this session. Connect it, or paste the issue text and I'll name the updates I couldn't make in the PR."* |
| Jam (paid) | a report that is a `jam.dev` link | Ask Rob once: *"This report is a Jam, but Jam isn't connected here. Connect the Jam connector (claude.ai Settings → Connectors, or this harness's MCP settings), or paste the Jam's description and console errors."* |
| A browser | a screen bug | A cloud container can render pages with Playwright but cannot prove a real table; say what was not proven. |

Never ask Rob to paste a token, a password or a header value into the chat.

## 1 · Read the report before touching code

- **A Jam:** its details first, then console errors and warnings, failed network requests (4xx, 5xx), the user's
  events, and the transcript or frames when the description is thin. Note the route, the build version the page
  showed, and the last action before the failure.
- **A Send feedback row:** its route, console excerpt and the files it names (`docs/feedback-loop/CrankFeedback.md`).
- **A card that does not offer an option:** `node game/tools/interaction-census.mjs --card "<name>"` first (`AGENTS.md`,
  "A card's ways are checked from the state a player is in").
- Write down **expected** versus **actual** in one line each. If you cannot state both, ask Rob before going further.

## 2 · Reproduce

Smallest path to the failure, as a command where possible: a suite, a scenario, a fixture, or a page walk. Note
whether it reproduces on `main`, on staging (`tools/staging-check.mjs` says what staging serves) and on the branch.
A bug that does not reproduce is reported as such, with what was tried; it is not "fixed".

## 3 · Isolate

- What changed: `git log --since=<date> -- <files the console names>`; the release that first carried it (the
  `On staging at` comments on Linear issues).
- Which lane owns the file (`AGENTS.md`, Lanes). A cause in another lane's files is a Linear issue for that lane,
  linked, not an edit.

## 4 · Find the cause

Form a hypothesis, predict what it implies, check the prediction. Stop at the cause, not the symptom: a guard that
hides an exception is not a fix. "Flaky" is not a cause.

## 5 · Fix, proving it

1. Write the test that reproduces the bug and **watch it fail** (`AGENTS.md`, "A test that cannot fail is a comment").
2. Make the smallest fix at the cause.
3. Watch the test pass; run the suites that read the changed files.
4. If players saw it, run `visual-acceptance` on the affected screen.

## 6 · Report and close

In the PR body and on the Linear issue: expected, actual, the reproduction command, the cause, the fix, the test that
now guards it. On a Jam: one short comment saying what was found or changed (mention its creator when it is not Rob),
the PR attached, and the connector's feedback with the evidence that led to the cause.

**Privacy:** the repository is public. Nothing from a Jam or a feedback row (names, addresses, headers, screenshots)
goes into a commit, a PR, a fixture or a public document beyond a sanitized summary in our own words.
