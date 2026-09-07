# Claude in this app

*What it could do, what it would cost, and what would make it worth trusting.*

Written 2026-09-07 against the shipped data. Every number below comes from one of two
scripts in `tools/`, and both re-run in a second:

```
node tools/claude-api-cost.mjs        # what each call costs, on real prompts
node tools/claude-api-grounding.mjs   # whether an invented card can reach the screen
```

---

## The short version

Rob asked about three things: **what cards do a specific job**, **which commander to
choose**, and **how to play a deck**. All three are a good fit for the API and all three
are cheap — the most expensive single call priced here is **4.5 cents**, and generating a
how-to-play guide for all fifty variants at once costs **$1.13**.

Cost is not the interesting constraint. Two other things are:

1. **There is nowhere in this app to keep an API key.** It is a static site: HTML, CSS and
   plain JavaScript served as files, no server, no build step, no secrets. That is a
   feature — it is why it loads from a phone at a card shop — and it is the single fact
   that decides how any of this gets built.
2. **A language model will confidently name a card that does not exist.** I did it myself
   writing this document; the check in `tools/claude-api-grounding.mjs` caught me. The good
   news is the app already owns the fix.

**Recommendation: build "how to play this deck" first, generated offline into a committed
JSON file, exactly the way the six guides already ship.** No key in the browser, no
runtime cost, no new way for the app to fail. It fills a hole that is visible today — open
a variant with no guide and the panel is simply absent — and it costs about a dollar to
fill it fifty times over.

---

## 1 · Where the key lives

This is the design decision; everything else follows from it. Three ways, and the app can
use more than one.

### (a) Generate it offline, commit the JSON — free, no risk

The pattern this repo already uses. `data/deck-guides.json` was written once and committed;
the browser fetches a file. A `tools/` script holding a key in the shell environment does
the same for anything else — a guide per variant, a shortlist per commander, a rationale
per swap — and the output is reviewed in a diff before anyone sees it.

- **Cost:** the token cost once, then nothing. Fifty guides on Opus 5, batched: **$1.13**.
- **Key exposure:** none. The key never leaves the machine running the script.
- **What it cannot do:** answer a question about a deck that did not exist when the script
  ran. That is the whole limitation, and it only bites on imported and custom decks.
- **Reviewability:** total. Wrong output is a diff you decline to commit.

### (b) A small proxy — needed only for decks the app has never seen

A Cloudflare Worker or a single serverless function, roughly thirty lines: accept a request
from the page, add the `x-api-key` header, forward to `api.anthropic.com`, return the
answer. The key sits in the platform's secret store. Free tiers cover this volume many
times over.

- **Cost:** the tokens, plus $0 of hosting at this scale.
- **What it buys:** live answers about a deck someone just pasted in.
- **What it costs beyond money:** the app stops being purely static. Something has to be
  deployed, monitored and rate-limited, or one bad afternoon spends the key's whole budget.
  Put a per-IP cap and a daily ceiling on it from day one.

### (c) A key the user pastes in, kept in `localStorage` — do not make this the default

Technically the smallest change: a field in the Admin menu, the key stored locally, calls
made straight from the page. Anthropic's SDKs gate browser-side calls behind an explicitly
named "dangerous" flag, and that name is earned — the key is readable by anything running
on the page and travels with the browser profile.

If it ships at all it ships as an opt-in for someone who wants to spend their own money,
and the key must be added to the eighteen enumerated keys in `user-state.js` so that
**Clear session** actually clears it. A credential that survives a reset is a bug.

**The call:** (a) now. (b) when imported decks need live answers and not before. (c) never
as the default.

---

## 2 · What it would cost

`node tools/claude-api-cost.mjs` builds each prompt from the shipped files — the pinned
hundred from `data/rung-lists.json`, the shape and output schema from `data/deck-guides.json`,
the shortlist from `data/commander-universe.json` — so these are the sizes a real call
sends. Token counts are estimated at 3.4 characters per token; treat every figure as ±25%.
An exact count is free from `POST /v1/messages/count_tokens` the moment a key exists, and
is worth taking before anyone budgets against these.

| Call | Input | Output | Haiku 4.5 | Sonnet 5 | Opus 5 |
|---|---|---|---|---|---|
| Cards that do a specific thing | ~886 tok | ~353 tok | $0.0027 | $0.0053 | **$0.013** |
| Which commander (open) | ~140 tok | ~368 tok | $0.0020 | $0.0040 | **$0.0099** |
| Which commander (shortlist sent) | ~411 tok | ~368 tok | $0.0023 | $0.0045 | **$0.011** |
| How to play this deck | ~806 tok | ~1,651 tok | $0.0091 | $0.018 | **$0.045** |

Three things worth saying plainly about that table:

**Prompt caching does not apply here.** It is the first lever anyone reaches for, and at
these sizes it is dead weight. The minimum cacheable prefix is 512 tokens on Opus 5, 1,024
on Sonnet 5 and 4,096 on Haiku 4.5; the largest system prompt above is **153 tokens**.
Nothing caches, and nothing needs to — the prompts are small because the app already did
the retrieval.

**Batch halves everything**, cache reads and writes included, in exchange for waiting.
Every offline generation run is unattended by definition, so every offline run should be
batched. The fifty-guide corpus is $2.27 standard, $1.13 batched.

**Haiku is not the cheap answer it looks like.** On Anthropic's own measurements Haiku 4.5
answers knowledge questions at about a tenth of Opus 5's cost per question — at 63%
accuracy against Opus 5's 92%. Every use case here *is* a knowledge question about Magic
cards. Saving three cents on a deck guide by getting a third of it wrong is not a saving;
it is the thing Rob explicitly asked not to build. **Opus 5**, and the whole corpus still
costs about a dollar.

---

## 3 · What would make it trustworthy

Rob's constraint was "minimal tokens, very small cost, but highly reliable/trustworthy."
The first two are settled above. The third is the real work, and it is architecture rather
than prompting.

### The gate: a card the model invented cannot reach the screen

`data/commander-universe.json` is already in the browser — 31,830 cards filtered to
`legalities.commander === "legal"`, 3,411 of them flagged as legal commanders. The card-name
resolver built for the import screen already loads it. That file is a complete answer to
hallucination: **any name the model returns is checked against the registry before anything
renders, and anything that fails is dropped.**

`node tools/claude-api-grounding.mjs` runs that gate over a deliberately nasty sample —
real cards, real cards that are *banned*, a real name with an invented title, a real card
with one extra letter, and pure inventions that sound exactly like Magic cards. The
expectations are asserted, so it fails loudly if the gate ever moves:

```
  name                        verdict  why
  Heroic Intervention         blocked  already in the deck
  Teferi's Protection         shown    legal
  Clever Concealment          shown    legal
  Selfless Spirit             shown    legal
  Avacyn, Angel of Hope       shown    legal, can be a commander
  Cyclonic Rift               blocked  outside the deck's colors (needs U)
  Demonic Tutor               blocked  outside the deck's colors (needs B)
  Black Lotus                 blocked  not a Commander-legal card
  Mox Sapphire                blocked  not a Commander-legal card
  Contract from Below         blocked  not a Commander-legal card
  Golos, Tireless Pilgrim     blocked  not a Commander-legal card
  Lutri, the Spellchaser      blocked  outside the deck's colors (needs RU)
  Splinter, Vengeful Sensei   blocked  not a Commander-legal card
  Ancestral Visions           blocked  not a Commander-legal card
  Verdant Sanctuary           blocked  not a Commander-legal card
  Sunblade Paladin            blocked  not a Commander-legal card

  16 names in, 4 reach the screen, 12 are stopped.
```

Note what it catches beyond invention. **Black Lotus is a real card and it is banned in
Commander** — the gate blocks it for legality, not for existing. So are Mox Sapphire,
Contract from Below and Golos. A model recommending "the best artifact ramp" will reach for
those, and the registry is what stops the app from printing an illegal deck.

And one entry in that list is there because it happened. Writing this document I listed
*Ancestral Visions* as a plausible fake card name and *Ancestral Vision* as the real one —
backwards; the real card is singular. The registry corrected me inside a minute. That is
the argument for the gate in one line: the model writing the feature got a card name wrong
while writing about card names, and the check caught it without anyone noticing.

### Structured outputs, so an answer is data rather than prose

`output_config: {format: {...}}` constrains the response to a JSON schema. It matters here
for a specific reason: the how-to-play guide has a schema *already* — the sixteen fields of
a `data/deck-guides.json` record, which `viewer.js:guideFor()` renders. Ask for exactly
those fields and the answer drops into the existing renderer with no parsing and no
"sometimes it wrote a paragraph instead of a list."

Two related notes for whoever writes the client: prefill is rejected on current models, and
`thinking: {type: "adaptive"}` replaces the old `budget_tokens` shape, which now returns a
400 on Opus 5.

### Never let it re-derive something the app measures

This app's numbers come from `sim-engine.js` playing each hundred 20,000 times per seed
across six seeds. A model asked "how good is this deck" will produce a confident number
that is not connected to anything. The division has to be absolute:

- **The simulator measures.** Scores, win rates, curve, mana, role counts, compliance.
- **Claude explains and suggests.** What the deck is trying to do, how a turn should go,
  what to look for, which cards might serve a stated need.

Every measured figure in a generated guide should be *interpolated by the script*, not
asked for. `data/deck-guides.json` already does this — its `shape` block is computed by
`tools/build_guide_shapes.py`, and the prose sits beside it.

---

## 4 · The three use cases

### 4.1 · How to play this deck — **build this first**

**The gap today.** Six decks have a guide. Everything else — the other forty-four variants,
every imported deck, every custom build — has none, and `guideFor()` returns null so the
panel silently is not there. This is the largest visible hole of the three.

**The call.** Commander, color identity, the computed shape, the hundred by name. Out: the
sixteen-field guide record. ~806 tokens in, ~1,651 out, **$0.045 on Opus 5**.

**What grounds it.** Every card named must be in the list that was sent — a stricter gate
than the registry, and checkable with a set difference. Every count ("eleven cards discard
on purpose") is verified against the list before the record is written; a guide that
miscounts gets rejected and re-asked, which is cheaper than a guide that lies.

**Why first.** The output schema exists, the renderer exists, the input is a file already on
disk, and the whole thing runs offline in `tools/`. It needs no key in the browser, no
proxy and no new runtime failure mode. Forty-four missing guides for about a dollar.

### 4.2 · Cards that do a specific thing — **second, and it needs (b)**

**The gap today.** The slot suggester (`Slot.slotFit`) already names up to three cards *you
already own* that fit a slot, scored on type, role and cost, pinned against the simulator's
own role tests. What it cannot do is answer a question in English — *"I need something that
stops a board wipe"*, *"more payoffs for going wide"* — because that is a question about
what cards mean, and the registry holds names, colors, types and mana values but no rules
text.

**The call.** Commander, identity, archetype, the hundred, the stated need, a budget
ceiling. Out: up to eight names with one sentence each. ~886 tokens in, ~353 out,
**$0.013**.

**What grounds it.** Four checks, all local, all in `tools/claude-api-grounding.mjs`: the
name is in the registry; it is inside the deck's color identity; it is not already in the
deck; and its price is under the stated ceiling once hydrated from Scryfall. Whatever
survives is real, legal, castable and affordable. Then the app shows it the way it shows
any other card, with a price and a picture.

**Why second.** This one genuinely wants live answers, so it is the feature that pulls in
the proxy. Worth doing — it is the question a player actually asks out loud — but it is the
one with infrastructure attached.

### 4.3 · Which commander to choose — **third, and cheapest to trial**

**The gap today.** The Compare library holds fifty researched variants and the graph
registers 3,411 legal commanders, but there is no path from *"I want to play green-white
creatures on a $250 budget"* to a shortlist.

**Two shapes, and the difference matters.**

- **Open** — send the wants, let the model name five commanders, validate every name against
  the registry's `commander` flag. ~140 tokens in, **$0.0099**. Draws on everything the model
  knows about the format; anything it invents is dropped.
- **Shortlisted** — pre-filter the registry (colors, `commander: 1`, popularity rank inside
  the top 3,000) and send the candidates. For green-white that is **25 names, 411 tokens**;
  the model physically cannot name anything else. **$0.011**.

The second is more trustworthy and less interesting: it can only re-rank a list the app
already computed. The first is where the value is, and the registry makes it safe. **Run
both against the same twenty questions and compare** — that is a $0.40 experiment and it
answers the "how much do we trust it" question with evidence instead of opinion.

---

## 5 · What not to use it for

- **Scoring a deck.** The simulator measures; a model would guess, and the guess would look
  identical to a measurement on screen.
- **Prices.** Scryfall and TCGplayer have them and they change daily.
- **Rules adjudication.** "Does this combo work" is a judge question, and a wrong answer
  loses a game.
- **Replacing the slot suggester.** It is pinned against the simulator across 1,761 cards.
  A model would be less accurate and less explicable at greater cost.
- **Anything on the critical path of a page load.** Every feature here must degrade to
  exactly what the app does today when the call fails, is slow, or was never made.

---

## 6 · The smallest first step

1. Write `tools/build-deck-guides.mjs` — reads `data/rung-lists.json`, builds the shape
   deterministically, calls Opus 5 once per variant with a structured-output schema, checks
   every named card against the sent list, writes `data/deck-guides.json`. Batched.
2. Run it for the forty-four variants with no guide. **About $1.**
3. Read the diff. Commit what is right, re-run what is not.
4. `guideFor()` already renders them. Nothing else changes.

Zero runtime cost, zero keys in the browser, zero new failure modes, and a panel that is
currently missing on forty-four decks stops being missing.

---

## Appendix · Reproducing the numbers

| Fact | Where it comes from |
|---|---|
| Prompt sizes | `tools/claude-api-cost.mjs`, assembled from `data/rung-lists.json`, `data/deck-guides.json`, `data/commander-universe.json` |
| Token counts | characters ÷ 3.4, ±25%. Exact counts are free from `POST /v1/messages/count_tokens` |
| Prices per MTok | Haiku 4.5 $1/$5 · Sonnet 5 $2/$10 · Opus 5 $5/$25. Batch is 50% off everything |
| Cache minimums | 512 tokens (Opus 5), 1,024 (Sonnet 5), 4,096 (Haiku 4.5) |
| Haiku vs Opus accuracy | Anthropic's published knowledge-question measurement: 63% vs 92% |
| The grounding gate | `tools/claude-api-grounding.mjs`, asserted against 16 named cards |

No API call was made to produce this document — there is no key in this repo, and the
session's own credentials are not the app's to spend. Everything here is measured from the
data on disk or quoted from the model catalog. The first thing to do with a real key is run
`count_tokens` against the four prompts and replace the estimates.
