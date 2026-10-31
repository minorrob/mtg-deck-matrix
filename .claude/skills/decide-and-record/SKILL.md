---
name: decide-and-record
description: Make and record a CrankMagic design or technology decision — a new contract, a migration, a framework, a data shape, a trade-off between approaches — with the options, the trade-offs, who decides, and where it is written. Use before building anything that would be costly to reverse.
---

# Deciding, and writing it down

Adapted for CrankMagic from the architecture decision record in Anthropic's `engineering:architecture` plugin skill,
in our own words. `AGENTS.md` wins where they differ.

## Needs

Linear (the issue the decision belongs to). If it is missing, ask Rob once to connect it or paste the issue.

## 1 · Is it yours to decide?

`docs/program/README.md` has the rule for deciding versus surfacing. In short: inside your lane's files, keeping the
behavior Rob approved, decide. A new screen, a navigation change, a removed feature, a changed default, a framework
for the board, anything with a cost, anything touching another lane's contract: **Rob's call**. File it as a Linear
issue labeled Rob's call with a one-line recommendation, and do not build ahead of the answer.

A contract between lanes (a room view field, an API, a migration number) is a Shared contract issue, agreed before
either side builds.

## 2 · The record

On the Linear issue, or as a dated file under `docs/` when it will be cited for months (as the
`docs/decisions-2026-09-2x.md` files are):

```markdown
## Decision: <title> (<Month D, YYYY>)
Decider: <Rob | the lane holder>. Status: proposed | decided | superseded by <link>.

Context: what forces this now, with the constraint that matters most.
Options:
| | A: <name> | B: <name> |
| --- | --- | --- |
| Cost to build | | |
| Cost to reverse | | |
| Fits AGENTS.md rules | | |
| Risk | | |
Recommendation: <one line, and why>.
Consequences: what gets easier; what gets harder; what to revisit and when.
```

Always at least two real options, one of them "do less". Quote Rob's words with the date when he decides.

## 3 · After

Link the record from the PR that implements it. A decision that changes a standing rule changes `AGENTS.md` in the same
PR, quoting Rob.
