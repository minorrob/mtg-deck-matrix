# CrankMagic's skills, for every harness

Rob, 2026-10-31: *"While they can't be given the plug-in authorization to connectors you can put the skills files in
the [repo] so that they are accessible to all harnesses to interpret into their own formats. Then you can include the
instructions in the requirements to use the paid tools, such as [Jam and Mobbin] and others, they can prompt me to
ensure they're connected."*

Each folder here is one skill: a `SKILL.md` with a `name` and a `description` (when to use it) in its front matter,
then the procedure. The format is the open Agent Skills layout, plain Markdown, so any harness can read it.
**`AGENTS.md`, "Which skill, when", says which skill a moment calls for; "Tools a session needs" says what to check
and how to ask Rob when a tool is not connected.** Where a skill and `AGENTS.md` disagree, `AGENTS.md` wins and the
skill is corrected.

## How each harness uses them

| Harness | How |
| --- | --- |
| Claude Code (desktop, cloud) | Loads this folder by itself: each skill is invoked by its name. Claude's own built-in and plugin skills (`code-review`, `run`, `engineering:debug`…) are the engines some of these name. |
| Codex | Reads `AGENTS.md` natively; at the moment it names, open the skill here and follow it. A Codex setup that loads skills from its own folder may copy or link these; this folder stays the source. |
| Cursor | Reads `AGENTS.md`; a project rule may point at the skill a moment needs (`@.claude/skills/<name>/SKILL.md`). |
| Grok Bot | Its work package under `docs/grok/` names the skills a task uses; the worker reads them as documents. |

A harness turns a skill into its own format by copying or linking, never by rewriting the procedure. A change to a
procedure is made here, in a PR, so every harness gets it.

## The skills

| Skill | When | Paid tool it can need |
| --- | --- | --- |
| [`one-loop`](one-loop/SKILL.md) | Rob's new ask, "pick up the next item", a ROB-key, a handoff | — (Linear, GitHub) |
| [`debug-a-report`](debug-a-report/SKILL.md) | A bug: a Jam, a feedback row, a stack trace | Jam |
| [`prove-a-change`](prove-a-change/SKILL.md) | Deciding what proves a change; a new suite | — |
| [`decide-and-record`](decide-and-record/SKILL.md) | A choice that is costly to reverse; a contract or migration | — |
| [`design-reference-and-critique`](design-reference-and-critique/SKILL.md) | A UI change with no approved reference; reviewing a design | Mobbin |
| [`write-ui-copy`](write-ui-copy/SKILL.md) | Any words a player reads | — |
| [`visual-acceptance`](visual-acceptance/SKILL.md) | Any visible change, before ready | — |
| [`review-before-ready`](review-before-ready/SKILL.md) | Any code change, before ready | — |
| [`crankmagic-release`](crankmagic-release/SKILL.md) | A release; "deploy" | — (Cloudflare token, wrangler) |
| [`incident`](incident/SKILL.md) | Broken for players | — |
| [`crankmagic-refresh`](crankmagic-refresh/SKILL.md) | A set release, stale prices | — |
| [`crankmagic-live-load-sync`](crankmagic-live-load-sync/SKILL.md) | A new Master workbook | — |
| [`simulate-deck`](simulate-deck/SKILL.md) | Simulating or optimizing a deck | — |

The practices in `debug-a-report`, `prove-a-change`, `decide-and-record`, `design-reference-and-critique`,
`write-ui-copy`, `visual-acceptance`, `review-before-ready` and `incident` are adapted from Anthropic's Claude plugin
and built-in skills, rewritten in our own words for this repository; no plugin text is copied here.
