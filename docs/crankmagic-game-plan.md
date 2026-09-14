# CrankMagic: the game

**An actual four-player Commander game, played on the table we already built, against opponents
piloted by Claude.** Rob's brief, 14 September:

> From the table background, I select an active deck out of any of my decks and I choose the
> number of AI opponents, and they are each given a deck from either Archidekt or whatever that
> site is, or against one of my existing decks, and I can set the bracket and Game Changer limits
> all decks adhere to. Then, using the Claude API and either Haiku or Sonnet, those models are
> given play style instructions, or they generate play style instructions for those decks,
> leveraging the graph and the chains and loops that we've defined and designed, or it generates
> its own deck using the simulator. Those models then play as the AI for my competition. Period.
> We're creating the game online here.

This document is the plan. It starts with the four things that are genuinely hard, because the
architecture is decided by them and not by the feature list.

---

## 1. The four hard problems, named first

### 1.1 There is no rules engine. The simulator says so itself.

`sim-engine.js` opens with the line `A Monte Carlo model of a four-player Commander game, not a
rules engine`, and publishes a `SIMPLIFICATIONS` list that includes *no stack*, *no blocking
assignment*, *tokens are modeled as extra power on the creature that makes them*, and *opponents
are nine parameterized archetype curves, not simulated decks with real cards*. It is excellent at
what it does — comparing two versions of one deck under one model — and it cannot play a game of
Magic. Nothing in this plan reuses its turn loop. It is reused for two other things: **rating a
pod before it sits down**, and **generating a deck** when Rob asks for one.

So a board has to be built. That is the single biggest item here and this plan does not pretend
otherwise.

### 1.2 A static page cannot hold an API key

CrankMagic is a zero-dependency static app on GitHub Pages with IndexedDB and no server. Any key
shipped in client JavaScript is readable by anyone who opens the page, and the Anthropic SDK
deliberately requires an explicit, alarmingly-named opt-in before it will run in a browser at all.
Three honest options:

| | How | Good for | Bad for |
|---|---|---|---|
| **A. Bring your own key** | Rob pastes his key into a settings pane; it lives in `localStorage` on his device and never leaves it except to `api.anthropic.com` | v1, one player, no infrastructure, no change to how the app is hosted | Anyone who can run script on that page can read the key; unusable the moment a second person plays |
| **B. A key-holding proxy** | A ~40-line Cloudflare Worker or Vercel function holds the key and forwards `/v1/messages` | Anyone else ever playing; rate limiting; a spend cap that is actually enforced | Breaks "static, no backend" — the first server CrankMagic has ever had |
| **C. No key at all** | The pilot plays from a playbook with zero API calls (§5.3) | Playing on a plane; the free tier of the game; every automated test | The opponents are good but not *surprising* |

**Recommendation: A for v1, C always available as the floor, B the moment it stops being just
Rob.** The code should not care which: one module (`crankmagic-claude.js`) owns the call, and its
endpoint is a setting. Swapping A for B is then a URL change, not a rewrite.

### 1.3 Thirty thousand cards cannot be hand-implemented

Commander is legal in ~30,000 cards. No plan that requires an implementation per card is a plan.
The answer is a **three-tier ladder** (§4), where the engine executes what it understands, the
existing classifier covers the common shapes, and a model adjudicates the rest against a schema
the engine validates. That ladder is what makes an arbitrary Archidekt deck playable on day one.

### 1.4 A model per decision makes the game unplayable

The naïve reading of the brief — send every decision to Claude — is roughly 400 calls per game
(4 seats × 12 turns × ~8 decisions), which is minutes of staring at a spinner and a cost that
scales with how long the game runs. The architecture below cuts that to **~35 calls a game** by
asking the model for *judgment* and leaving *bookkeeping* to code. That is not a compromise on
the brief; it is what makes the brief shippable.

---

## 2. What CrankMagic brings that nothing else has

Three things, and the plan should lean on all three rather than build a generic bot.

**The graph.** `data/graph.json`, `crankmagic-loops.js`, `crankmagic-trace.js` and
`crankmagic-strategies.js` already know, for any deck: its loops (untap → tap ability → payoff),
its chains (a card that *causes* an event another card *triggers* on), each card's **Primary
Purpose** on the fixed ladder, its role coverage, and the commander's strategies with per-edge
`serves`/`strength`. An opponent handed *"this deck has a four-card untap loop through Thornbite
Staff; here are the three pieces and the two tutors that find them"* plays differently from one
handed a list of a hundred card texts. **This is the differentiator.** The playbook is generated
from the graph, not from the decklist.

**The simulator's ratings.** Before the pod sits down, the lobby can say *your deck measures 71,
this opponent set averages 68 — a fair table*, or *this one is 12 points above the rest, expect to
be archenemy*. `rate-decks.mjs` and `simulation-summary.json` already do this.

**Bracket compliance that already works.** `compliance-model.js` validates Game Changer counts,
mass land denial, extra-turn chains and tutor density against a bracket. "All decks adhere to
bracket N" is not a feature to build; it is a function to call, with a UI in front of it.

---

## 3. The shape: a referee, a pilot, and an adjudicator

Three roles, and which one is code and which one is a model is the whole design.

```
                    ┌──────────────────────────────────────────┐
   THE REFEREE      │ crankmagic-board.js  (pure, no AI)       │
   code, always     │ zones · turn structure · mana · costs    │
                    │ combat · state-based actions · legality  │
                    └───────────────┬──────────────────────────┘
                                    │ asks "what does this card do?"
                                    │ when it does not know
                    ┌───────────────▼──────────────────────────┐
   THE ADJUDICATOR  │ crankmagic-adjudicator.js  (Haiku)       │
   model, rarely    │ card text + board → validated deltas     │
                    └──────────────────────────────────────────┘

                    ┌──────────────────────────────────────────┐
   THE PILOT        │ crankmagic-pilot.js  (code, from a       │
   code + a model   │ playbook) — plays a seat turn by turn    │
   at the forks     │ escalates to Sonnet at genuine forks     │
                    └──────────────────────────────────────────┘
```

- **The referee never guesses.** It owns every fact that can be computed: what is in each zone,
  what mana is available, whether a spell can be cast, what combat does, whether a creature dies.
  Nothing a model says is allowed to violate it.
- **The adjudicator is asked one question**: *given this card text and this board, what changes?*
  It answers in a closed schema of deltas, and the referee **validates every delta** — you cannot
  draw a card from an empty library, put a permanent on the battlefield you never had, or gain
  life the card does not mention. A refused delta is logged and the card resolves as a no-op with
  a visible note, rather than corrupting the game.
- **The pilot is where the personality lives.** It executes a playbook the model wrote before the
  game, and calls the model again only when the playbook is genuinely torn — which target, whether
  to counter now or later, who to attack when two players are close to dying.

This split is what gets the game to ~35 calls instead of ~400, and it puts the model where models
are strong (reading card text, judgment under uncertainty) and code where code is strong
(bookkeeping, legality, arithmetic).

---

## 4. The three-tier card ladder

| Tier | Who resolves it | How | Coverage |
|---|---|---|---|
| **1 — The rules** | the referee, always | zones, turn structure, priority (simplified, §8), mana and colour identity, casting cost and commander tax, summoning sickness, attacking and blocking, first/double strike, flying, menace, trample, deathtouch, lifelink, vigilance, haste, lethal damage, the legend rule, commander damage, 0 life | every card |
| **2 — The shapes** | the referee, from `card-classify.js` | the effect vocabulary the classifier already extracts — draw N, ramp N, destroy target, exile, wrath, make N tokens, counter target spell, gain N, mill N, tutor, untap, blink, copy, extra turn, damage N — executed deterministically | the large majority of cards in a typical deck |
| **3 — The rest** | the adjudicator (Haiku), validated by the referee | the card's oracle text, the board, and a delta schema; every returned delta checked against tier 1 | everything else, including cards printed after the catalog was baked |

**Why this is honest rather than a fudge.** A tier-3 resolution is exactly the moment at a kitchen
table when someone reads a card out loud and the group agrees what it does. The engine's job is to
stop the group from agreeing something impossible. Every tier-3 resolution is written into the
game log with the card text and the deltas, so a wrong one is visible and reportable rather than
silent — and a card that comes up often can be promoted to tier 2 by teaching the classifier.

---

## 5. The pieces, in order

### 5.1 The lobby — where a game is set up

Entered from the play-space table: **Play a game** beside the canvas chooser.

1. **Your deck.** Any finalized deck in the library. The hundred is what it is; substitutes on the
   Bench do not play — the *list* plays, which is the point of the list.
2. **The pod.** 1, 2 or 3 opponents (so 2, 3 or 4 players). Each seat is filled from:
   - **one of your decks** — the fastest way to test a matchup you actually own;
   - **an Archidekt link** — `deck-sources.js` already loads these by URL with full oracle data on
     arrival, no name matching and no second round trip;
   - **a Moxfield/Deckstats paste** — the same module recognises the link and asks for the export,
     because Moxfield answers a deck API request with 403 to a server and a browser alike;
   - **a generated deck** — the Lab's draft builder plus the simulator, seeded from a commander, a
     bracket and a budget. This is the "or it generates its own deck using the simulator" arm.
3. **The rules of the table.** Bracket (1–5) and the Game Changer cap, applied to *every* seat.
   `compliance-model.js` validates each deck as it is seated and says, by name, what fails —
   *"this deck carries 5 Game Changers; bracket 3 allows 3"* — with **Trim** (drop the excess
   automatically, lowest measured delta first, using `promote-tier3.mjs`'s ranking in reverse) or
   **Change the bracket** as the two ways forward.
4. **The read before you sit.** Each deck's measured score, the pod average, and one sentence:
   *a fair table*, or *you are the deck to beat*, or *you are the underdog by 9*.
5. **Seating and the first turn.** Random by default, or fixed for a replay.

Nothing in step 1–5 needs the API, the board or a single line of AI. **This is PR G0 and it ships
on its own.**

### 5.2 The deck brief — what the model is given

Assembled by code from what the repo already computes, **not** by pasting a hundred card texts:

```
COMMANDER   name · colour identity · mana cost · oracle text · its 3 strategies (crankmagic-strategies)
THE HUNDRED by Primary Purpose, with mana value and a one-line effect from the classifier
LOOPS       every cycle of ≤4 cards through the deck (crankmagic-loops), each step named,
            with the pieces that are missing and the tutors that find them
CHAINS      cause → trigger pairs and multiplier edges, strongest first (crankmagic-trace)
SHAPE       curve, land count, ramp/draw/removal/wipe counts against the Config floors
MEASURED    the simulator's score, win rate, average win turn, and its three weakest readings
```

For a 100-card deck this is roughly 12–18k tokens and it is **stable for the life of the deck** —
which is what makes the caching in §6 work.

### 5.3 The playbook — what the model writes back

One structured document per deck, generated once and then reused, cached, and **editable by Rob**
(the brief says *"given play style instructions, or they generate play style instructions"* — this
is both: generated, then his to overrule).

```json
{
  "identity": "one paragraph: what this deck is trying to do and how it wins",
  "mulligan": {"keep": ["...conditions..."], "ship": ["..."]},
  "curve_plan": ["T1: ...", "T2: ...", "T3: ..."],
  "priorities": [{"when": "...", "do": "...", "why": "..."}],
  "combo_watch": [{"pieces": ["..."], "assemble_when": "...", "hold_until": "..."}],
  "threat_assessment": {"kill_first": ["..."], "ignore": ["..."]},
  "politics": "one of: quiet | deal-maker | archenemy-baiter | vengeful",
  "interaction": {"counter": ["..."], "save": ["..."], "never_waste_on": ["..."]},
  "voice": "how this pilot talks at the table"
}
```

The pilot executes this deterministically. **With no API key, the game still plays** — the pilot
falls back to a heuristic playbook derived from the graph alone, which is a weaker opponent but a
real one. That floor matters: it means every automated test runs with no network and no spend.

### 5.4 The turn loop

```
for each seat, each turn:
  referee: untap, upkeep triggers, draw
  pilot:   land drop        ← playbook's curve_plan, deterministic
  pilot:   main phase       ← priorities, deterministic; ESCALATE if two plays are within
                              a threshold on the playbook's own ranking
  pilot:   attacks          ← threat_assessment, deterministic; ESCALATE when two players
                              are both within lethal range
  referee: blockers for each defending seat ← that seat's pilot, deterministic
  referee: combat damage, state-based actions, commander damage
  pilot:   second main, end step
  ADJUDICATE whenever a tier-3 card resolves
```

An **escalation** is one Sonnet call carrying the playbook (cached), the board state, and the two
or three candidate lines; it returns a choice and a sentence of reasoning that goes in the log. A
typical game has **5–10** escalations and **20–30** adjudications.

---

## 6. Model choice, caching and what a game costs

**The models.** Current IDs and prices (Anthropic first-party, per million tokens):

| Model | ID | Context | In | Out | Used for |
|---|---|---|---|---|---|
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | $1 | $5 | adjudication — high volume, narrow question, schema-constrained |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | $2 | $10 | playbooks and escalations — judgment, low volume |

Rob named Haiku and Sonnet and that split is the right one: adjudication is a reading task with a
closed answer, escalation is a judgment call. (Opus is available and would be better at
escalations; it is 2.5× Sonnet's price and the plan should measure before spending it.)

**Caching is what makes this affordable.** Prompt caching is a *prefix* match rendered
`tools → system → messages`, so the request is laid out stable-first:

```
system   [cache] the rules primer + the delta schema          ~4k  never changes
system   [cache] this deck's brief + its playbook             ~18k changes per deck, per game
messages         the board state, this turn only              ~2k  changes every call
```

One explicit breakpoint at the end of the deck block means every later call in the game reads
~22k tokens at **0.1× input price** instead of paying for them again. Cache writes cost 1.25× at
the 5-minute TTL, and a game's calls are minutes apart, so the entry stays warm by being used.

**A four-player game, estimated:**

| | Calls | Model | Est. cost |
|---|---|---|---|
| Playbooks (3 opponents, cold) | 3 | Sonnet 5 | ~$0.14 |
| Playbooks (cached / reused deck) | 3 | Sonnet 5 | ~$0.02 |
| Adjudications | ~25 | Haiku 4.5, warm cache | ~$0.13 |
| Escalations | ~8 | Sonnet 5, warm cache | ~$0.08 |
| **Total, first game with new decks** | **~36** | | **≈ $0.35** |
| **Total, replaying known decks** | **~33** | | **≈ $0.23** |

A cost meter in the corner shows the running total for the game and the session, because a number
you cannot see is a number you cannot control. Playbooks generated at deck-save time rather than
at the table can go through the **Batch API at 50%**, since nothing is waiting on them.

**Two API details that matter at build time**, both recent changes worth writing down so they are
not rediscovered the hard way: assistant prefill is rejected on current models, so the closed
answer comes from **structured outputs** (`output_config.format`) and `strict: true` tools, not
from prefilling a `{`; and Haiku 4.5 still takes the old `thinking: {budget_tokens: N}` shape while
Sonnet 5 takes `{type: "adaptive"}` — the wrong one is a 400.

---

## 7. The build, in order

Each of these is a PR that ships something true on its own.

| PR | What | Needs AI? | Needs the board? |
|---|---|---|---|
| **G0 — The lobby** | Pick your deck, seat 1–3 opponents from your decks / an Archidekt link / a paste / a generated deck, set the bracket and Game Changer cap, validate every seat, read the pod's measured balance. No game yet. | no | no |
| **G1 — The call** | `crankmagic-claude.js`: the key pane, one call shape, the cache layout, structured outputs, the cost meter, and a **fixture mode** that answers from recorded JSON so every later suite runs offline and free. | — | no |
| **G2 — The playbook** | `crankmagic-playbook.js`: the deck brief from the graph (§5.2), the playbook back (§5.3), cached per deck and bracket, editable, with a heuristic fallback that needs no key. | yes | no |
| **G3a — The board: zones and turns** | `crankmagic-board.js` tier 1, part one: zones, turn structure, mana and colour identity, casting and commander tax, the legend rule, state-based actions. Pure module, Node suite of scripted games. | no | — |
| **G3b — The board: combat** | Declare attackers and blockers, the combat keywords, damage, commander damage, and the loss conditions. | no | — |
| **G4 — The table** | The play space canvas becomes the game table: four seats, your hand, each battlefield, the stack, life totals, the log. **You play all four seats by hand.** This is what proves the board is real. | no | yes |
| **G5 — The pilot** | `crankmagic-pilot.js`: a seat played from its playbook with tier-2 effects, deterministically. The game is now playable against opponents with **no API calls at all**. | no | yes |
| **G6 — The adjudicator** | Tier 3: unknown card text → Haiku → deltas the referee validates. Plus escalation to Sonnet at the forks. This is the point at which the brief is delivered. | yes | yes |
| **G7 — The table, alive** | Table talk in each pilot's voice, threat assessment made visible, politics, and the post-game report — which feeds straight back into the deck page's game record, where a real game log already lives. | yes | yes |

**G3 is the long pole and this table should not be read as though the rows are the same size.**
G0, G1, G2 and G5 are each roughly one session. G3a and G3b are each several. G4 and G6 are one to
two. A first playable game against a real AI opponent is realistically **G0 → G6**, and the
midpoint deliverable worth aiming at is **G4 + G5**: a complete game, four seats, real rules, real
opponents, zero API spend.

---

## 8. What I would not build, and why

- **A rules-complete engine.** Split second, layers, replacement-effect ordering, the full priority
  window on every object — this is where every homebrew Magic engine dies. The referee runs a
  *simplified stack*: priority passes only when something is on the stack and a seat holds an
  instant, flash permanent or activated ability, which covers counterspells and removal responses
  and nothing else. Say so in the UI once, not in a tooltip.
- **Multiplayer against other humans.** It needs a server, accounts and reconnection. It belongs
  with the persistent-app plan (#258), not here.
- **Hiding information from the pilot by pretending.** A pilot sees exactly what a player at the
  table sees: every battlefield, every graveyard, every exile, its own hand, and card *counts* for
  the rest. Not your hand. Not the top of your library. Enforced by the referee assembling the
  prompt, not by asking the model to be fair.
- **A model per decision.** §1.4.
- **Scraping Moxfield.** It answers 403 and the paste path is better anyway (§5.1).
- **Shipping Rob's key in the page.** §1.2 — his key, his browser, his `localStorage`, and a proxy
  the day someone else plays.

---

## 9. Open decisions — the five I need from Rob before G1

1. **The key.** Bring-your-own in the browser for v1 (fastest, single-player), or stand up the
   Worker proxy now (slower to start, but the only thing that lets anyone else ever play)?
2. **Rules fidelity.** Kitchen table with a judge — simplified stack, adjudicated cards, a visible
   log of every ruling — or hold out for something stricter and accept a much longer build?
3. **Spend.** A hard per-game cap (stop and fall back to the no-API pilot when hit), a per-session
   cap, or just the meter?
4. **Does a game write back?** A finished game already has somewhere to go: the deck page's game
   record and history. Should an AI game count as a logged game, be marked as one, or stay out?
5. **Deck generation.** When a seat is "generated by the simulator", is it built to *match* your
   deck's measured score (a fair fight), to a *bracket* (a legal fight), or to a *budget*?

My recommendations, if you want them: **1 — bring-your-own now**, because nothing about it blocks
the proxy later. **2 — kitchen table with a judge**, because the alternative never ships and the
log makes the simplification honest. **3 — per-game cap plus the meter.** **4 — logged, and marked
as an AI game**, because the simulator wants that data and a real game record is worth more than a
clean one. **5 — matched to your score by default**, because a fair fight is the more interesting
game and the other two are a dropdown away.

---

## 10. Where this sits

This plan depends on the play space (`docs/crankmagic-playspace-plan.md`) only for its entry point
— the table background and its canvas. It depends on nothing in the persistent-app plan (#258),
and it does not block it. It reuses, without changing them: `deck-sources.js`, `compliance-model.js`,
`card-classify.js`, `crankmagic-loops.js`, `crankmagic-trace.js`, `crankmagic-strategies.js`,
`data/graph.json`, and the simulator's ratings. It adds five modules that do not exist:
`crankmagic-claude.js`, `crankmagic-playbook.js`, `crankmagic-board.js`, `crankmagic-pilot.js`
and `crankmagic-adjudicator.js`.

Nothing here starts until the play-space PRs 3–6 are done, unless Rob says otherwise.
