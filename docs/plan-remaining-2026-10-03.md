# The remaining plan to the final stage (2026-10-03)

The governing plan is still `docs/plan-to-done-2026-09-30.md`: its Part 0 is the contract and its Part 7 the road. This
file says what of it is left, in what order, with what proof, and what only Rob can do — as of `main` eb149397 plus
the five pull requests waiting to merge (#571–#575). A plan-review session reads it next as devil's advocate
(`docs/prompt-plan-review-2026-10-03.md`) and writes the plan the execution session follows; until then this order
stands. Status was compiled from the plan, `docs/ACTIVE.md`, the merged pull requests #371–#570 and the open #571–#574.

## The target

The executor says these two sentences verbatim, once each, only when every claim in them is true, with the proof
beneath (plan, Part 7):

> The plan is complete, the app has been tested end to end both technically and from a user experience perspective on
> their journeys. It has been merged to staging.crankmagic.com. It is ready for Grok Bot to run an agent workforce
> across the app for UAT testing, including full game play end-to-end. I'll await Grok Bot's response, make any
> changes, merge to staging.crankmagic.com for you to then test a set of human invites, then for you to perform your
> final review, then remedy any findings you have and then merge into production.

— after gates **G-A Build**, **G-B Test end to end** and **G-C Staging**; and, after **G-D Grok Bot's UAT**, **G-E Human
invites** and **G-F Rob's final review**:

> The app is ready for you and your invites to use!

## Where it stands

| Gate | Status | Met | Not met |
| --- | --- | --- | --- |
| G-A Build | not passed | B1–B8 (#449–#459), L1/L1b/N1, W1 (#460), the A11y pass (#462), the harness note (#468) | the AI door and AI-1 to AI-6; M4's keyword families for the seven decks and G1; M3; M2 |
| G-B Test end to end | not passed | `play-e2e` at each staging release (20 checks); the A11y checks; screenshot tooling | the whole gate twice on `main`; G1; `play-journeys` and `crankmagic-journeys` on the seven real decks with the real Coach; the five-second rule over the network (no test exists); the browser matrix (Firefox, phones) |
| G-C Staging | not passed | the release mechanics (release-acceptance 22, Play end-to-end 20) | G-A and G-B first; Workers Builds green (terminated since 2026-10-03 05:19 UTC); the harness note handed to Grok Bot; the four agents' access |
| G-D, G-E, G-F | not started | — | all of it; G-F's production release only on Rob's go |

**The engine** (`docs/engine/coverage.md`, at #574): most-played 3,238 cards — 992 defined, 2,267 (70.0%) with every
mechanic built; **Rob's seven decks, 477 cards — 157 defined, 358 with every mechanic built**: 201 need only a
definition, 119 still need a mechanic. The seven decks' biggest blockers at #568 were RememberChanged (24, fewer after
#573/#574), "up to N targets" (TargetMin/TargetMax, 22), RememberObjects (18) and MayPlay (14). **The cloud table plays
no card definitions yet** (M5), and `CRANKMAGIC_ENGINE` still defaults to `forge` (M9).

## The critical path

The seven decks played by the engine, at the table, without an exception, are what G-B's real-deck journeys, G-D's
games and G1 all stand on. So the engine track leads, seven decks first, and everything else is scheduled around it.

## Track 0 — what only Rob can do (first, and whenever it comes up)

1. **Merge** #571 → #572 → #573 → #574 (`gh pr edit 574 --base main` once #573 is in) → #575, each a merge commit; each
   has a local-gate PASS block. Then `origin/main`'s tree must equal #575's head's tree.
2. **Release** staging and production from that `main` (approved 2026-10-03): `tools/release-staging.sh`, and
   `node tools/release-pages.mjs --ref origin/main --commit` with `tests/uat/release-acceptance.mjs`; then re-run the
   terminated Workers Builds, or deploy production from Personal-HP (`docs/ACTIVE.md`, Questions 0).
3. **Unblock the gates:** restore GitHub billing (Actions), or add a permission rule letting sessions merge on the
   local gate and push release branches; turn off Workers Builds *previews* for both Workers.
4. **Open the AI door** (`docs/ai-door.md`, the five steps: the Access app, the allowlist, the key, the caps, the
   privacy wording) — every AI item waits on it; **fill the advisor eval's refusal lists** (AI-4's rubric, one
   afternoon); **run AI-3's 200-card sample** with your key.
5. **Set up** R2 (token, schedule) for M2 and M3's backups; the alert email (M3); the four Grok Bot agents' access;
   Workers Paid once CPU passes 10 ms.
6. **Decide:** Play on production; the first-look list vs. wireframe r3; the browser matrix's Firefox runtime and
   phone runs.

## Track E — the engine (the critical path), seven decks first

Each step is one or more pull requests, each proven as the batches have been (scenarios per card, a suite, breaks
after a green baseline, the gate). Estimates are sessions, not measured.

| Step | What | Proof | Estimate |
| --- | --- | --- | --- |
| E1 | **Measure axes** (`docs/engine/velocity-2026-10-03.md`): the inventory records every effect's parameters (names and counts only, ADR-001); each maps to an axis; the catalog ranks axes by cards unlocked, for the seven decks and the most-played | `tests/engine-catalog.mjs`, the inventory's own checks; the blind spots named there become measured | 1 |
| E2 | **Bulk-definition pilot, 50 of the seven decks' 201 definition-only cards**, drafted from Oracle text, through schema, fidelity, a smoke game, templated scenarios and a second derivation; stored provisional (`game/tools/engine-ingest.mjs`) | the pass rate and error kinds, reported; every failure named with its reason | 1 |
| E3 | **The rest of the seven decks' definitions** at the pilot's measured rate | check-cards, engine-cards | 2–4 |
| E4 | **The seven decks' missing mechanics**, axes first, in E1's ranking: "up to N targets", RememberObjects and "exiled with this", MayPlay's forms, an order a player chooses mid-effect, ETBReplacement's forms, Overload, Echo, etbCounter, Class, the alternate additional cost, planeswalker loyalty | per-axis suites and breaks; the 1,463+ scenarios | 8–14 |
| E5 | **G1:** a harness that plays 1,400 four-seat games of the seven decks (house pilots), zero engine exceptions, the same hash on replay, no hidden card in any frame | the harness's own report; fixes found by it, each a PR | 2–5 |
| E6 | **M5:** definitions served to the cloud table from a store (the table seats a deck once it is wholly defined); the five-second rule over the network; live MP-07–09 | play-e2e and play-journeys on real decks | 2–3 |
| E7 | **M9 cutover:** the engine the default, the Forge host retired (Rob's deletions) | the gate; G1 still green | 1 |
| — | The most-played cards beyond the seven decks continue alongside, in E1's ranking, by bulk definitions and axis batches | as above | ongoing |

## Track AI — behind the door (Rob's step 4)

AI-4 (the route; the eval run on Haiku 4.5 and Sonnet 5.5 after Rob's refusals) → AI-3 (the offline library learn Rob
runs; the online loader and a `card_scripts` store) → AI-1 (the Coach wired: route, brief, streaming, eval, privacy
wording) → AI-2 (the LLM pilot, judged over G1's harness) → AI-5 (Decks ↔ Play) → AI-6 (settings); and the shared door
code first — the price table and per-feature models in `cloud/ai.mjs` (it still defaults to `claude-opus-5`). About
9–10 sessions, all after the door opens. AI-3's loader can supply engine definitions too, which overlaps E2–E3.

## Track O — operations and the rest

M3 monitoring and backups (1 session, after the alert email and R2); M2's data track (a few pull requests, after R2);
M11 housekeeping (1 session; Rob's DNS and account items); the browser matrix completed (Rob's Firefox runtime and
phones); the groups' leftovers (A2–A4, "Upgrades in the import") confirmed or closed; Workers Builds previews off.

## Gates G-B and G-C, once Tracks E and AI are through

1. **G-B:** the whole gate green twice on `main`; G1's report; `play-journeys` (a four-seat game of the seven decks
   through the real board, every view, a phone) and `crankmagic-journeys` run on the real decks with the real Coach;
   the hidden-information inspection of every frame; the five-second rule measured over the network; the browser
   matrix complete. 2–3 sessions, plus whatever they find.
2. **G-C:** the release built from `main`, release-acceptance green, pushed to `release/cloud-staging`, Workers Builds
   green, the version read back from `wrangler deployments list`; the harness note handed to Grok Bot; the agents'
   access set. Then the first sentence.

## Gates G-D to G-F

G-D: Grok Bot's four agents play full games (two seats as humans through the real board, two as AI — the house pilot,
and the LLM pilot once AI-2 is through the door); every finding in the template; the triage loop to its exit (50 games,
zero engine exceptions, zero leaks). G-E: Rob's invitees on staging, findings fixed and released. G-F: Rob's review,
every finding remedied, the production release on Rob's go, walked live, the version read back. Then the second
sentence. Between gates, every finding is a pull request, merged on the gate and released to staging.

## Size

Roughly 25–40 sessions of engine work to G1 and M5 at today's pace; fewer if the bulk-definition pilot holds up
(the velocity evaluation estimates 50–100 definitions a batch against about 9 today). About 9–10 sessions of AI work
after the door opens, and 3–5 for G-B and G-C. G-D to G-F are paced by Grok Bot's findings and Rob. These are estimates;
the plan-review session should test them.
