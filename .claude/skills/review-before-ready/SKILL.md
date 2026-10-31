---
name: review-before-ready
description: Review a CrankMagic branch before its PR is marked ready — correctness, then security where the change reaches accounts, access or anything a stranger can send, then simplification — and fix or answer every finding. Use on every PR that changes code, before it leaves draft.
---

# Review before ready

The checklist behind Claude Code's built-in `code-review`, `security-review` and `simplify` skills and Anthropic's
`engineering:code-review` plugin skill, in our own words, for any harness. In Claude Code, run `/code-review` at low
or medium effort (`max` only when Rob asks), `/security-review` when step 2 applies, and `/simplify` if the review found
clutter; elsewhere do the same checks by hand. `AGENTS.md` wins where they differ.

## Needs

The diff against `main` (`git diff origin/main...HEAD`). Nothing paid.

## 1 · Correctness

For each changed function: what inputs reach it (including empty, null, a long name, four players, zero cards), what it
returns or throws, and who calls it. Look for:

- an offered choice resolved in code instead of asked (`AGENTS.md`, "Decisions inside the game belong to the players");
- a refusal without its instruction, or a warning that can be clicked past;
- state changed in two places, an `await` missing, an error swallowed, a race between a socket message and a render;
- a formatter without `'en-US'`, a currency other than USD, a raw ISO date shown to a player;
- a test that cannot fail.

## 2 · Security (when the change touches `cloud/`, access, accounts, sharing, invitations, mail, secrets, or input from another player)

- Every route checks who is asking (Access, the seat) before what they ask for.
- Input from a player or a URL is validated and bounded; nothing builds SQL, HTML or a shell command from it unescaped.
- No secret, token or personal address in code, logs, fixtures or the PR (`tools/local-ci.sh <ref> 0` scans; it is
  the last line, not the method).
- A table's hidden information (a hand, a library order) never reaches a client that should not see it.

## 3 · Simplify

Duplicate logic that already exists elsewhere in the repository, dead branches, a helper used once, comments that
restate code. Fix only what is in the diff; anything older is a new Linear issue.

## 4 · Findings

Each finding: file and line, the failure it causes (concrete input → wrong result), severity (blocks / should fix /
optional). Blocking and should-fix findings are fixed before ready; an optional one is fixed only if it rides along.
A finding you decide not to fix is answered in the PR with why.
