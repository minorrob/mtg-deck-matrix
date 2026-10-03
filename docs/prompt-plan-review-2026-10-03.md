# The prompt for the plan-review session (devil's advocate), 2026-10-03

Rob, 2026-10-03: *"a prompt and context to hand to another session that will re-evaluate your plan from a devil's
advocate perspective. It will answer what could go wrong? How could it make the engine act in ways that would not seem
correct to an experienced player? Then it will devise alternatives. It will also make greenfield recommendations, e.g.
based on the work done so far and the work remaining to do, it will consider best alternatives to speeding up work
also. It'll then bring a plan for execution out."* A new session then executes the plan this review produces.

Paste everything between the two rules below, unchanged, as the first message of a new Claude Code session (Opus) in
`C:\Users\robmi\CrankMagic\repo`.

---

You are the **plan-review session** for CrankMagic. You do not build features and you do not merge or deploy anything.
You read, you test what you need to test, you argue against the current plan as hard as the evidence allows, and you
leave behind one plan that a separate execution session will follow. Rob reads your result before that session starts.

**Read first, in this order:** `AGENTS.md`; `docs/ACTIVE.md` (the closing record of 2026-10-03); `docs/plan-to-done-2026-09-30.md`
(the governing plan — Part 0 is the contract, Part 7 the gates); **`docs/plan-remaining-2026-10-03.md`** (the plan you
are reviewing); `docs/engine/velocity-2026-10-03.md` (the evaluation of how to speed up engine work); `docs/engine/PLAN.md`,
`docs/engine/ADR-001-own-engine.md` (the clean-room rule: the Comprehensive Rules and Oracle text come in, nothing from
Forge does), `docs/engine/catalog.md` and `docs/engine/coverage.md`; `game/tools/batch/README.md` (how a card batch is
built and proven); `docs/plan-card-extraction-skill.md` and `docs/ai-door.md` (the AI program's guardrails).

**Where things stand (verify; do not trust this summary):** the engine defines 992 of the 3,238 most-played Commander
cards and has every mechanic for 2,267 (70.0%). PRs #571–#574 were proven on the local gate and wait for Rob to merge,
in that order; the handoff PR after them. GitHub Actions refuses jobs on billing; the local gate
(`tools/local-ci.sh <ref> 2`) stands in. Cloudflare Workers Builds deploy staging (`release/cloud-staging`) and
production (`release/pages`); every build since 2026-10-03 05:19 UTC was terminated in the queue, so crankmagic.com
still serves `release/pages` 721e5c4 and staging an older release than its branch. The permission layer of these
sessions refuses `gh pr merge` and re-running deploy builds: those are Rob's.

**The target.** Part 7's two sentences, which the executor says verbatim only when every claim in them is true:

> The plan is complete, the app has been tested end to end both technically and from a user experience perspective on
> their journeys. It has been merged to staging.crankmagic.com. It is ready for Grok Bot to run an agent workforce
> across the app for UAT testing, including full game play end-to-end. I'll await Grok Bot's response, make any
> changes, merge to staging.crankmagic.com for you to then test a set of human invites, then for you to perform your
> final review, then remedy any findings you have and then merge into production.

> The app is ready for you and your invites to use!

**Your four questions, each answered with evidence (file and line, a command you ran and its output, or a game you
played through the scenario runner or the room):**

1. **What could go wrong?** With the plan as written — sequencing, estimates, dependencies, the gates' proofs, the
   release path, the AI program's cost and privacy, the data track, the board's UX, the permission and billing
   blockers, and the speed-up proposal itself (bulk definitions drafted from Oracle text; axes built once). Rank each
   risk by likelihood and by what it would cost Rob.
2. **How could the engine act in ways that would not seem correct to an experienced Commander player?** Go looking
   for them; do not stop at the obvious. At least: decisions the rules leave to a player that code makes for them
   (AGENTS.md, "Decisions inside the game belong to the players") — the order of simultaneous triggers and
   replacement effects, which mana pays, orders in a library, "any order"; simultaneity done one object at a time
   (Living Death's returns, a board wipe, damage, "each player"); APNAP order; last-known information; layers and
   dependencies; copy effects; state-based actions and the legend rule; the commander rules (the command-zone
   replacement, tax, commander damage, the partner and background rules); priority automation (steps that pass by
   themselves, Skip to end) and whether it ever skips a moment a player would have acted; hidden information in any
   frame; the house pilot's play; the 70.0% "every mechanic built" figure and what it does not measure (the blind
   spots `docs/engine/velocity-2026-10-03.md` names). For each, play the situation if you can (`game/engine/cards/scenario.mjs`,
   `tests/engine-*.mjs` patterns, `game/room/room.mjs`), say what an experienced player expects (cite the CR rule
   number, never its text), and say what the engine does.
3. **What are the alternatives?** For each significant risk or wrong behavior: at least one alternative approach,
   with its cost, its risk, and what it would prove. Include **greenfield recommendations**: from the work done and the
   work left, the best ways to speed the work up — evaluate the velocity proposal against others (e.g. a different
   unit of work, generated scenarios, property-based or differential testing against the Comprehensive Rules, a
   different order of the gates, what to stop doing). Keep the clean-room rule, US English, and Rob's standing rules
   (AGENTS.md); say plainly where an alternative would need Rob to change one of his rules.
4. **The plan for execution.** One ordered plan the execution session can follow without reopening decisions: each
   step a PR-sized unit with its scope, its proof (suites, scenarios, breaks, the gate), its estimate, and the decisions
   it needs from Rob (asked once, up front, with a recommended answer). It ends at Part 7's gates and the two sentences.

**How you work.** Read-only on the product: you may run suites, scenarios, the room and scratch scripts in your own
scratch space or a worktree of your own, but do not change engine, app or test code, do not merge, do not release.
US English only. Write your result as **`docs/plan-review-2026-10-03.md`** (findings: questions 1–3, each with its
evidence) and **`docs/plan-execution-<date>.md`** (question 4 — the plan the next session executes, with the prompt
that starts that session at its end, in the shape of `docs/plan-to-done-2026-09-30.md` Part 8). Commit both on a
`claude/plan-review-<date>` branch, open a **draft PR**, update `docs/ACTIVE.md` (holder, branch, what is proven versus
assumed, what is outstanding), push, and give Rob a short summary with the PR link. If a finding is urgent — a wrong
rule that changes games today, a leak of hidden information — say so at the top of your summary.

---

## Context the prompt points to (for Rob)

- The plan under review: `docs/plan-remaining-2026-10-03.md`.
- The speed-up evaluation: `docs/engine/velocity-2026-10-03.md` (and the page, claude.ai/artifact/AJwY6vA1CkeYrokbSZC85b).
- The engine's standing: the Engine Catalog page, claude.ai/artifact/2p7KuxoPTNF1wvk2GAsH72, and `docs/engine/catalog.md`.
- The session's closing record: `docs/ACTIVE.md`.
