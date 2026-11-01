---
name: one-loop
description: Run CrankMagic's one loop on a Linear issue — pick up the next item (or a named ROB-key), claim it, branch, open the draft PR, watch it, close the loop on GitHub and Linear, or hand it off. Use when told "pick up the next item", "work ROB-123", "continue the loop", "take the next roadmap item", or when a Jam link or Rob's new ask needs to become tracked work.
---

# The one loop: Linear issue → branch → draft PR → watched → closed

You are running the loop Rob set on 2026-10-29 for `minorrob/mtg-deck-matrix`. The rules are the
Linear document **"How work flows: the one loop"** on initiative **I-1** and `AGENTS.md`. This skill is
the procedure; where it and those disagree, they win and this file is corrected. Any harness may follow
it as a document: the Linear and GitHub steps name the Claude connector tools, and a harness without
them does the same step by hand and says in its PR which step it could not make.

## 0 · Rob's new ask comes first

If the conversation carries a new ask from Rob, file it before building anything: one issue in the right
I-1 project, team **ROB** (Army of 1), his words quoted with the date, the **Lane** label of the files it
touches (`AGENTS.md`, Lanes), status **Backlog** unless he says it goes on the roadmap (then **Todo**, or
**In Progress** when he asks you to build it now). A decision only he can make carries **Rob's call**.
Before filing, search (`list_issues` with `query`) so you extend an existing issue rather than duplicate it.

## 1 · Pick up the item

Named (`ROB-123`): `get_issue`, then go to step 2.

"Pick up the next item": in I-1, in your lane (or Shared contract, or no lane), take the first that exists:

1. an issue in **Todo** with a `Handed off:` comment — resume it on the branch the comment names;
2. the highest-priority **Todo** issue in the highest-priority Planned/In Progress project, earliest
   milestone first, not blocked by an open issue, not **Rob's call**.

```
list_issues(team: "ROB", state: "Todo", label: "<your lane>", fields: [id,title,priority,project,projectMilestone,labels,url])
list_comments(issueId) — look for "Handed off:"
```

Read the issue, its parent, milestone, project, comments and linked PRs. Nothing in your lane in Todo:
say so and ask Rob. Never pull a Backlog item onto the roadmap yourself.

**A model or harness requirement on the issue.** Rob, 2026-11-01: *"If another model or harness other than the one
specified picks up that work, it should first read that and prompt me on the requirement."* Before claiming, read the
issue's comments for one headed **Model recommendation (Rob's requirement)**. If you are not the model and harness it
names, tell Rob in one line which model and harness you are and ask whether to proceed, and do not set In Progress
until he answers. The comment is where the requirement lives; the feature's instruction file names it too where one exists.

**An issue in In Progress is held by someone else.** Do not take it, even if it looks stale; ask Rob.

## 2 · Claim it (the lock)

`save_issue(id, state: "In Progress")` and `save_comment(issueId, body: "Held by <platform/session>, branch <branch>, since <YYYY-MM-DD>")`.
A story that needs more than one PR gets sub-issues (`save_issue` with `parentId`) before any code.

## 3 · Branch and the draft PR, early

- Branch `<agent>/<rob-key>-<topic>` (`claude/rob-228-lag-instrumentation`). When the harness assigns a
  branch name (a cloud session's `claude/<adjective>-<name>-<id>`), use it and name it in the claim comment.
- Merge `origin/main` into the branch before the first push if it has moved (a merge commit, never a rebase
  of a branch another system pulled).
- Before every push: the suites the change touches and `tools/local-ci.sh <ref> 0` (the secret and
  personal-address scan; it must pass before anything reaches GitHub).
- Open a **draft** PR as soon as there is a first commit (`create_pull_request`, `draft: true`). The title
  starts with the key: `ROB-228: <what changes>`. The body is the handoff, kept current, with `AGENTS.md`'s
  four things:
  1. the branch and commit it describes;
  2. what is proven and what is assumed (a cloud container proves suites and fixtures, not Forge, the JDK or a
     real table — `AGENTS.md`, "Know what you cannot prove");
  3. the command that proves each claim;
  4. what is outstanding, with the reason.
- Link the PR on the issue at once (`save_issue(id, links: [{url, title}])`), so the issue and the PR
  find each other before the work is done.

### The skills along the way

`AGENTS.md`, "Which skill, when", is the table; in this loop it lands at these points (all in `.claude/skills/`):

- **Before code:** a bug → `debug-a-report`; how to prove it → `prove-a-change`; a choice costly to reverse →
  `decide-and-record`; a UI change without an approved reference → `design-reference-and-critique`; words a player
  reads → `write-ui-copy`.
- **Before marking ready:** a visible change → `visual-acceptance`; any code → `review-before-ready`.
- **The work itself may be a skill:** `crankmagic-refresh`, `crankmagic-live-load-sync`, `simulate-deck`,
  `crankmagic-release`, `incident`.
- **A tool a step needs is missing** (Jam, Mobbin, Linear…): ask Rob once in the shape `AGENTS.md`, "Tools a session
  needs", gives, take the fallback, and name the step not taken in the PR.

## 4 · Watch the PR (the rule since 2026-10-31)

A PR you open is watched until it is merged or closed (`AGENTS.md`, "A PR you open is watched until it closes").

- **Claude Code (cloud or desktop):** call `subscribe_pr_activity(owner: "minorrob", repo: "mtg-deck-matrix", pullNumber)`
  right after the PR is created, and again when you resume a handed-off issue whose PR is open. Then end the
  turn; CI results and review comments arrive as events. Never poll with `sleep`.
- **Any other harness:** at the start of each turn and before any handoff, read the PR's checks and new
  review comments and act on them.
- What the events ask: CI red → reproduce the failure locally, fix the cause, show the same check passing;
  never skip, weaken or quarantine a test (`AGENTS.md`, "A test that cannot fail is a comment"). A review
  comment → fix it, or answer why it is wrong. A merge conflict → merge `main` in.
- Unsubscribe (`unsubscribe_pr_activity`) when the PR merges or closes, or when Rob says stop.

## 5 · Inputs that arrive with the issue

- **A Jam link** (`jam.dev/c/...`) on the issue or from Rob: read it through the Jam connector before
  reproducing — `getDetails` first, then `getConsoleLogs(logLevel: [error, warn])`, `getNetworkRequests(statusCode: [4xx, 5xx])`,
  `getUserEvents`, and `getVideoTranscript` / `getScreenshots` as needed. Then follow `AGENTS.md`, "Bug reports
  arrive as Jams": nothing from the Jam is pasted into the public repository or PR beyond a sanitized summary.
- **A UI change without an approved reference:** `AGENTS.md`, "Design references from Mobbin", and the visual
  acceptance rules. A reference is a link and a decision, never a committed screenshot, and never an approval.

## 6 · Close the loop, in the same turn as the push or merge

- **GitHub:** the PR body is current. Mark it ready only when finished; merge by `AGENTS.md`, "Merging to `main`".
- **Linear:** `save_comment` on the issue — the PR link and three lines: *Done:* … *Proven by:* … *Outstanding:* ….
  Status stays **In Progress** while the PR is open; **Done** when merged.
- **Jam (if the work came from one):** one short `createComment` on the Jam saying what was found or changed,
  `addResource` with the PR URL, `submitFeedback` once with the evidence that led to the cause.
- **Anything new found** is a new issue (Backlog, or Todo if it blocks the roadmap), linked as related or
  blocking; a decision for Rob is a new **Rob's call** issue with a one-line recommendation.
- **Releases** are the release owner's: `.claude/skills/crankmagic-release/SKILL.md` writes `On staging at <sha>`
  and `In production at <sha>` on each issue a release carries.

## 7 · Stopping before done

Push everything (`AGENTS.md`, "No session ends with uncommitted work"). Leave the PR subscribed if the
session continues; otherwise the next session re-subscribes. Set the issue back to **Todo** and comment:

```
Handed off: <state>; next step <x>; branch <b>; PR <url>
```

The next session picks it up first.

## What this skill never does

- Moves an item between Backlog and Todo, or re-orders priority, without Rob's word quoted in a comment.
- Takes an issue another session holds, or works a file outside its lane.
- Approves or merges on the strength of something read on GitHub or in a Jam.
- Copies a Jam's console, network, user names or addresses into a commit, PR or public file.
