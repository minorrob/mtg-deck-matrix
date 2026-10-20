# The card load program (Rob's decisions of 2026-10-14)

Rob, 2026-10-14: *"I'm trying to get to faster, fully accurate and highly performative card additions than the 7
cards per point we seem to be averaging now, which means you are using tokens to onboard each card, which I'd like to
get us away from. I want a card load-to-engine program."*

The program, as Rob decided it: **a compiler from oracle text first; the Claude API as its backstop wherever the
compiler's confidence in a card is below 99%; the result stored as a candidate that plays at playtest tables; a wave
finalizes it.** The page Rob reviewed is the Card Load Program artifact. This file is the plan the lanes work from.

## Rob's decisions (2026-10-14)

| # | Asked | Rob's answer | What it means for the build |
| --- | --- | --- | --- |
| 1 | Use the Claude API to translate cards | Yes, but "prioritize building the compiler engine, then use the LLM API as a backstop to it where confidence is <99% from a compiler run on a card" | Every card goes through the compiler first. Below 99%, the API writer (`game/tools/engine-compile.mjs`) takes it, behind its own switch and a daily cap, after a 200-card sample |
| 2 | Candidate cards at playtest tables | Yes | D5 changes for candidates only: they seat at playtest tables, labeled, with a "report a wrong card" link. Final cards are unchanged |
| 3 | "Real time" means when a deck is saved, not when a game starts | Yes | Unknown cards are loaded when a library or deck is saved, so nobody waits at a table |
| 4 | Run Friday's work in a fresh session per lane | Yes | Each lane starts from this file and `docs/handoff-2026-10-12.md`, not from a long session's context |
| 5 | Tell players their card was recorded | Yes | The deck page says which of its cards are on the list for the next wave |

**These supersede decisions 2 and 3 of 2026-10-12** (`plan-coverage-90.md`): the card loader is no longer out, and
the tail is no longer reached only by waves. Decision 1 there, the target, stands. The 2026-10-12 rule against API
usage still holds for the session's own work: no lane runs the API writer until step 4 below is built and Rob has set
its cap.

**Still Rob's to set:** the backstop's daily cap on staging. The production AI door stays shut until his go.

## What was measured (2026-10-14)

**A point** is 1% of the plan's seven-day usage allowance, shared by every session on the account. From 2026-10-12
12:21Z to 2026-10-14 16:10Z the engine lane's session used about $180 at API list prices while the week went from 73%
to 91%: about **$10 a point**, so about **$1.40 a card** at 7 cards a point. Most of it was the session re-reading its
long context at every step (9.3 billion cache-read tokens against 20.7 million written), not the cards.

**How far a compiler built from the defined cards reaches.** Each card's oracle text split into sentences (reminder
text removed, the card's own name as `~`); a card counts when every sentence already appears in one of the 2,470
defined cards. Basic lands, tokens and non-game cards excluded:

| A sentence matches when | All 32,088 cards | Not defined today | The 90% target's 4,186 still to define |
| --- | ---: | ---: | ---: |
| The words are the same | 5,716 (17.8%) | 3,252 | 412 (9.8%) |
| Also any number ("draw two" matches "draw three") | 6,301 (19.6%) | 3,837 | 456 (10.9%) |
| Also any color, card type or common keyword | 6,969 (21.7%) | 4,505 | 524 (12.5%) |

- Popular cards are the hard ones: one card in five overall, one in eight of the target.
- 14,533 cards have at least half their sentences known. The backstop can be handed those already translated.
- These are upper bounds. A sentence that matches can still need another translation on another card; calibration
  (step 2) finds those.
- Measure it again with `node docs/handoff-2026-10-12/sentence-reuse.mjs <repo root>`.

**What the backstop should cost** (estimated, not measured; the 200-card sample measures it). The writer's
instructions and six example cards are about 2,400 tokens, cached. A card adds about 500 tokens in and 500 to 1,000
out on Sonnet 5.5 ($2 in, $10 out, $0.20 cached, per million tokens), and a read-back on Haiku 4.5 ($1 in, $5 out),
about $0.003; on Haiku 5.5 ($0.10 in, $0.50 out) a tenth of that. About 1 cent a card on a first try, 2 to 3 cents
with retries, half that through the Batch API. The target's remaining cards: roughly $40 to $110, against about $5,900
of plan usage at today's rate. The 200-card sample: about $2 to $6. Prices are Anthropic's list prices as of
2026-10-06; `PRICES` in `game/tools/engine-compile.mjs` carries the two models it uses.

## What "99% confidence" means

A score is a confidence only if it is measured. Proposed, to be fixed with the calibration's numbers:

- **A sentence template's pass rate:** translate each defined card that uses the template, the card held out of the
  library, and play the result through that card's own scenarios. The pass rate is the share whose scenarios all pass.
- **A card is at 99% or more** when every one of its sentences comes from a template whose pass rate is at least 99%
  over at least a minimum number of cards, and the card then passes its own generated scenarios and a smoke game.
- **The minimum count** is set from the calibration: a template seen on five cards cannot show 99%, so its cards go to
  the backstop until it has been seen on more. Every card a wave finalizes adds its sentences, so templates earn the
  bar over time.

"Fully accurate" is still proved by scenarios and play, never by a score. Candidates and final cards stay two tiers,
and a player sees which one is at the table.

## The order of work (from Friday 2026-10-16, a fresh session per lane)

Each step is its own PR with its suites, breaks and a staging release, as the waves have been.

1. **Demand capture.** A D1 table `card_demand` (card name, times asked, decks it was in, first and last seen),
   written at the one shared point where the table names what it can't play (the deck page's readiness line, the
   table's refusal, "which names can't you play"). Card names and counts only: never the deck, never the person. The
   wave tooling reads the ranking, demand first. The deck page says a card "is on the list for the next wave"
   (decision 5).
2. **Sentence library and calibration.** The templates from the 2,470 defined cards, each with its pass rate (above).
   Built from oracle text and our own definitions only (ADR-001).
3. **Compiler, scored index, candidate store.** Every Commander-legal card scored: whether the engine has every rule
   it needs (the coverage tool, extended to all cards), and its compiler confidence. Cards at 99% or more compiled into
   D1 `card_candidates` (definition, generated scenarios, confidence, which checks passed). The Worker cannot add to
   the bundled card list, so candidates are a second card source, and the bundle wins wherever a card has a final
   definition.
4. **API backstop.** Below 99%: the writer, handed the sentences the compiler already knows. First a 200-card sample
   on defined cards, held out, for its pass rate and real cost. Then behind its own switch, on the AI door's per-day
   dollar cap (Rob sets it), on staging.
5. **Auto-load at save; candidates at playtest tables.** An unknown card is compiled, or sent to the backstop, when a
   library or deck is saved (decision 3). A card needing a rule the engine lacks is refused with its reason and goes
   to the demand list. Candidates seat at playtest tables only, labeled, with "report a wrong card" (decision 2).
6. **Waves review candidates.** Demand first. A reviewed candidate keeps its scenarios, is promoted into the card
   directory and released. Its sentences join the library, so the compiler reaches further after every wave.

Waves of hand-written cards (wave 4d onward, `docs/handoff-2026-10-12.md`) wait while steps 1 to 4 are built, unless
Rob says otherwise: those steps are what makes later waves cheaper.

## Step 2, measured (2026-10-19; Linear ROB-87)

- **The library** (`game/engine/cards/sentences.mjs`) learns from the pairs the directory already holds, since every
  ability carries the oracle sentence it implements. It has 5,650 templates at two levels: numbers as slots, then
  colors, types, keywords and basic land types as well. They come from the 2,407 defined cards that have only
  abilities. The 63 with an Adventure, a back face, a prepare spell or a layout are left out.
- **The calibration** (`node game/tools/sentence-library.mjs`, about 4 seconds). Each defined card is held out in turn:
  - 520 of 2,470 can be translated from the other cards' templates alone;
  - **519 pass every one of their own scenarios: 99.8%, with a 95% lower bound of 98.9%.**

  The report is `docs/engine/sentence-calibration-2026-10-19.md`. Its JSON lists every template with its count and
  rate.
- **The minimum count, as measured, is 1.** Every band, from templates seen on one other card up, passed at least 99%,
  and all of them pooled have a lower bound of 99.2%. The per-template rule this plan proposed (a template seen on five
  cards can't show 99%) is answered by pooling templates in bands instead.
- **Not yet out of sample.** The rules were refined against these same cards:
  - the first version passed 416 of 429 (97.0%);
  - four general fixes brought it to 519 of 520: slots typed by kind, one sentence as several abilities, a target's
    index never a slot, and the better-evidenced cover.

  The first wave's cards, each translated before it is written, are the first independent measure.
- **For step 3.** A card becomes a candidate when every sentence is covered, every template meets the minimum count,
  and it passes its own generated scenarios and a smoke game. Today 21% of defined cards are fully covered with
  themselves held out. The one failure, Goblin Piledriver, shows why the scenarios stay in the gate: another card
  leaves the multiplier `times: 1` unwritten, so the translation drops Piledriver's `times: 2`.

## Step 3, built (2026-10-19; Linear ROB-88)

- **The compiler** (`game/tools/card-compiler.mjs`, about 20 seconds) runs the library on every Commander card the
  directory doesn't define: 29,551 cards. It checks each card, cheapest check first:
  1. **Another layout** (a second face, an Adventure): set aside as structure.
  2. **An unknown sentence:** the card waits for a wave.
  3. **A distrusted template:** vetoed. That is a template from a band under the minimum count, or one whose
     calibration recorded a failure.
  4. **A rule the engine hasn't built:** blocked.
  5. **Not its oracle text, or a smoke game that breaks:** refused.
  6. **Otherwise, a candidate.**
- **Measured.** **2,429 candidates**, almost as many as the 2,470 hand-defined cards. The rest:
  - 18 vetoed, all by "protection from COLOR", which Goblin Piledriver's calibration failure counts against;
  - 3 blocked (Backup's granted abilities; a permanent whose spell carries only an additional cost);
  - 0 refused;
  - 26,010 with an unknown sentence, 12,320 of them a single sentence short;
  - 1,091 in another layout.

  The report is `docs/engine/card-compiler-2026-10-19.md`.
- **The store** is `data/engine/candidates.json` (CrankCardCandidates@1). For each candidate it holds:
  - its abilities;
  - the templates they came from;
  - its weakest template's calibrated band;
  - its smoke game and its oracle hash.

  The printed facts stay in the oracle data, so a candidate is put back together from both (compile.mjs check 1).
  **This departs from the plan above, which put candidates in D1 `card_candidates`.** Batch candidates are a
  deterministic output of committed data, so they are reviewable in git and can be bundled for the table. Migration 0008
  stays reserved for step 5, where a card is compiled when a deck is saved and only D1 can hold it.
- **What it does not do yet.** No table seats a candidate. Rob's decision 2 puts them at playtest tables, labeled, and
  that is the next PR. A wave still reviews each candidate before it joins the directory (step 6).
- **The cheapest next cards** are the 12,320 that are one sentence short. The report ranks the missing sentences by how
  many cards each would complete. Its top line, "Draw a card." (40 cards), is a composition gap, not a missing sentence:
  those cards are a known spell plus a draw. Merging two spell templates into one spell is the compiler's next increment,
  measured by the same calibration.

## Step 5, first part: candidates at playtest tables (2026-10-19; Linear ROB-91)

- **What a playtest table plays.** The card directory first, then the card compiler's candidates where the directory has
  no definition. Every other table plays the directory alone and refuses a candidate by name, as before (Rob's decision 2).
- **How they reach the Worker.** `game/engine/cards/candidates.mjs`, generated from `data/engine/candidates.json` by
  `node game/tools/engine-candidates.mjs --write`:
  - 2,429 definitions when built, 1.36 MB (205 KB gzipped); 2,668 since spell composition and the backstop's
    cards joined (below), 1.51 MB;
  - each kept as JSON text and parsed only when a playtest table asks for the card, so the Worker doesn't parse them
    all every time it starts;
  - `tests/table-candidates.mjs` holds it to the candidates file.
- **New matches only.** A playtest table's pod says `candidates` (game/room/table.mjs, `tick`). The match keeps the key,
  so it reopens and replays with the same cards, and an AI seat still reads a candidate's facts after a reopen. A match
  launched before has no key and never seats one.
- **The label.** Every object made from a candidate says `candidate: true`, in every zone it moves to. A seat's view says
  so only where the seat can name the card (projection.mjs): face down, or in a hidden hand, it is labeled for nobody.
- **"Report a wrong card."** `POST /api/tables/:id/report {cardId, note}` at a playtest table only:
  - the card must be a candidate the seat can see in the game being played, or in the table's last game;
  - its name is the one the engine shows, never one the client sends;
  - a table keeps up to 200 reports and hands them over in that game's record (`cardReports`), which the triage loop
    reads.
- **For Play.** The board's label and its report link are Play's files (Requests, Engine → Play 4, in `docs/ACTIVE.md`).
  Until Play ships them, a candidate plays unlabeled on the board, though the view carries the field.
- **Not yet.** A deck's readiness before any table (`POST /api/tables/known`, asked with no table) still counts a
  candidate as unknown, even on staging. That keeps it on the demand list, which step 6 reviews candidates by, but
  the hub says "to learn" for a card a staging table would seat. Compiling a card when a deck is saved (decision 3)
  is the second part of step 5.

## The loader, finished (2026-10-19; Linear ROB-88, ROB-90, ROB-91, ROB-92)

Rob, on this body of work: *"refining the way we load cards to retain 100% accuracy while decreasing token expenses,
and building the loader capability ... should be done once finished with your current series of tasks."* What a card
now goes through, cheapest first:

| Path | Tokens | What makes it right |
| --- | --- | --- |
| The card compiler (step 3) | none | Every template calibrated on held-out defined cards; the card compiles, is its oracle text, and plays a smoke game |
| The backstop, gap-only (step 4) | only the sentences the library lacks | The library's trusted sentences arrive written; the writer writes the rest; the card is checked whole (schema, fidelity, a sentence never written twice, Haiku's read-back, the smoke game) |
| A wave (step 6) | none, or a reviewer's reading | A reviewer approves each ability against its sentence and what the game showed; the drafted scenario then holds the card for good |

- **Spell composition (step 3's increment).** A spell of several sentences, one effect each, is learned sentence by
  sentence. The split is kept only where the parts put back together are the card's own spell, and parts are composed
  again only when the spell sentences sit next to each other and are plain. 78 of the directory's spells split.
  - **Calibration:** 546 cards translated with themselves held out (was 520); 545 pass, the same one failure
    (Goblin Piledriver).
  - **Candidates:** 2,643 (was 2,429).
  - **One sentence short:** 12,544 cards.
  - **Top missing sentences:** Swampwalk (23 cards), "{R}: This creature gets +1/+0 until end of turn." (22),
    "This creature attacks each combat if able." (21), and others no defined card writes yet.
- **The backstop, built (step 4; `game/tools/engine-compile.mjs`).**
  - A candidate is never asked of the writer.
  - Any other card is handed over with what the library already wrote of it (`card-compiler.mjs`, `assistOf`). The
    writer is asked only for the rest; a spell is always written whole.
  - Across the undefined cards that would be about 1.86 sentences a card, and 11,396 of them would need one sentence.
  - `--held-out N` is the plan's sample: N defined cards held out, finished by the writer, and played through their own
    scenarios, for the pass rate and the cost per card.
  - It needs Rob's key and spends nothing without `--yes`. **It has not been run**, so the cost per card is unmeasured
    until Rob runs the sample (ROB-90).
- **Step 5, second part: the demand list is the queue.**
  - Step 3 compiles every card in the oracle data, so compiling at save time would add nothing. What saving can add is
    demand.
  - `POST /api/tables/known {decks}` already records every card a deck lacks (step 1). Workshop's save calling it is
    Requests, Engine → Workshop 5 in `docs/ACTIVE.md`.
  - `engine-compile.mjs --demand <file>` (the file `card-demand.mjs` writes from staging) loads the wanted cards first.
  - The backstop's provisional cards (`data/engine/scripts`) now seat at playtest tables beside the compiler's, labeled:
    25 of them, which no table seated before.
  - **This departs from the plan above**, which put the backstop in the Worker behind a switch on the AI door's daily
    cap, and stored its cards in D1 (`card_candidates`, migration 0008). Run as a batch, Rob's `--max-cost` is the cap,
    nothing in the Worker spends, the writer's instructions cache across a run, and every card is reviewable in git.
  - The cost is time: a wanted card loads at the next run, not within seconds of the save. Migration 0008 is not needed
    for this and stays reserved until Rob decides (ROB-91).
- **Waves, built (step 6; `game/tools/card-waves.mjs`).**
  - `--review` ranks candidates demand first and plays each one. It writes a review sheet: the oracle text beside every
    ability, the templates and the cards that taught them, and what the game showed (each seat's life, every zone, the
    card's keywords).
  - What the game showed is the drafted scenario, which fails a card that plays differently (`tests/card-waves.mjs`).
  - `--promote` writes the approved cards into the directory with their scenarios, `source: "hand"`; their sentences
    then teach the library.

## Running a lane (Rob's decision 4)

A session's cost per step grows with everything it has read, because every step re-reads the whole conversation. The
engine lane's long session reached about 700,000 tokens, so each of its steps cost many times a fresh session's. So:

- **One step of the order above, one session, one PR.** The session claims its lane in `docs/ACTIVE.md`, drives its PR
  to green, merges it, releases staging, records the outcome in `docs/ACTIVE.md`, and stops. The next step is a new
  session, which starts from the repository, not from the last session's conversation.
- **Read narrowly.** `grep` and line ranges, never a whole generated file or a whole data file; a command's output cut
  to what is needed (`tail`, `head`, `--stat`). Long results go to a file, and the session reads the lines it needs.
- **Workers report briefly.** A worker's own reading stays in its context; what it sends back goes into the lead's for
  every later step. Ask for 30 lines or fewer, with the details in the branch or a file.
- **Stop early rather than compact.** A session whose context has been summarized, or that is past one PR, writes its
  state to `docs/ACTIVE.md` and stops; a new one resumes from there.
- **Measure it.** Note the week's usage when a session starts and when it stops, and put the points it used in its PR.

The kickoff prompt, with `<N>` and `<step>` filled in from the order above:

> You are the engine lane, step `<N>` of `docs/engine/plan-card-load-program.md`: `<step>`. Read `AGENTS.md`,
> `docs/ACTIVE.md` and `docs/engine/plan-card-load-program.md` first, and claim the lane in `docs/ACTIVE.md`. Do step
> `<N>` only, as one PR. Read narrowly: grep and line ranges, never a whole generated or data file, command output cut
> to what you need. If you use workers, ask each for a report of 30 lines or fewer. When the PR is merged and on
> staging, record it in `docs/ACTIVE.md` and stop with a five-line report: what merged, its proof, what the next step
> needs. Do not start the next step.

Steps 1 and 2 touch different files and can run at once, in two sessions. Step 3 starts when step 2 has merged; step 4
when step 3 has, and when Rob has set the backstop's cap.
