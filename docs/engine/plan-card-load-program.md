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
