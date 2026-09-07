# What the simulation still gets wrong

*And what each gap would cost to close. Written 2026-09-07.*

The engine plays a hundred-card list 20,000 times per seed across six seeds and scores it
0–100. Everything on screen comes from that. This is the list of places where the model and
Magic disagree, in the order of how much each one distorts a score.

---

## 1 · No creature's printed body has ever reached the engine — **measured, not fixed**

**The gap.** `data/cards.json` carried no `power` or `toughness` field at all — 0 of 1,972
rows — and `data/card-facts.json` had them for 60 of its 326 creatures. So for almost every
creature ever simulated, `sim-engine.js` fell through to its estimate:

```js
power     = max(1, round(cmc * 0.9))    // +1 for trample / double strike / menace
toughness = max(1, round(cmc * 0.9))    // +2 for defender
```

A one-mana 2/1 was played as a 1/1. A seven-mana 4/4 as a 6/6. Every Wall at whatever its
mana value implied rather than at the four toughness that makes it a wall. In an engine
whose entire business is creatures, mana and combat, that is a larger distortion than the
storm count the caveats already name — and it was written down nowhere in this repository.

**The data exists and always did.** Scryfall's oracle bulk file, already cached at
`graph/.cache/` because the commander registry is built from it, has a body for **880 of
880** creatures in `data/cards.json` and 322 of 326 in `data/card-facts.json`. The four
misses are cards whose every face is bodiless. `tools/add-power-toughness.mjs` extracts them
with no network; it writes nothing without `--write`.

**What it costs, measured.** The six shipped decks, re-measured on the full protocol with
printed bodies against the same decks with estimated ones:

| Deck | Estimated | Printed | Change |
|---|---:|---:|---:|
| D1 Quintorius | 84.03 | 78.30 | **−5.73** |
| D2 Chulane | 72.97 | 58.15 | **−14.82** |
| D3 Atraxa | 84.60 | 82.50 | **−2.10** |
| D4 Felothar | 70.83 | 65.70 | **−5.13** |
| D5 Shadrix | 85.87 | 79.57 | **−6.30** |
| D6 Krenko | 71.37 | 65.05 | **−6.32** |

Every deck falls, which is the expected direction: `round(cmc * 0.9)` on both sides of the
slash flatters a creature. A three-mana 2/3 was being played as a 3/3, and most of the
utility creatures in these decks are smaller than their mana value implies. **The ranking
moves too** — Chulane drops from fourth to sixth, and the size of its fall (a deck built out
of small enters-the-battlefield bodies: Whitemane Lion, Dream Stalker, Mistmeadow Witch) is
the clearest evidence that the estimate was the thing being measured.

**Why it is not fixed in this commit.** Reading these fields re-bases every published number
in the repository: `data/deck-ratings.json`, the fifty variants' pinned scores in
`data/rung-lists.json` and `data/simulation-summary.json`, every figure quoted in
`data/deck-guides.json`, and the Compare page's whole ordering. That is a deliberate re-bake
with a decision behind it, not a side effect of a data patch.

**What the re-bake involves**, when it is wanted:

1. `node tools/add-power-toughness.mjs --write` — patches both card files.
2. Pass the fields through `deck-measure.js`'s `hydrate()` and the tools' card builders (one
   line each; the engine already prefers a printed body over its estimate).
3. `node tools/sim/rate-decks.mjs --write` — the six, about a minute.
4. Re-run the fifty-variant, four-rung sweep and re-pin `rung-lists.json` and
   `simulation-summary.json`. This is the long pole.
5. Re-read `data/deck-guides.json`: six hand-written guides quote figures that the re-bake
   changes.

`tests/deck-measure.mjs` is the guard the whole way through — it requires every published
score to reproduce exactly from the browser's own path, so a half-applied re-bake fails
loudly rather than drifting.

---

## 2 · Storm count, ritual chains and one-card wins — **named in the app, not modelled**

The engine plays creatures, mana and combat. It has no concept of a spell count within a
turn, so a ritual into a big X spell is simulated as an expensive spell that resolved, and a
deck that wins by casting fifteen spells in one turn is simulated as a deck that cast
fifteen spells slowly.

Measured: a real mono-red Thor list — 19 instants, 18 artifacts, 14 creatures, with Mana
Geyser, Seething Song, Reiterate and Jeska's Will among them — scores **34.55** against the
six shipped decks' 71 to 86, on a 0.8% win rate. That is not a verdict on the deck. It is
the engine saying it cannot see how the deck wins, and it will say that about every
spellslinger list it is shown.

The app says so where the number is, which is the minimum honest treatment, and the readout
repeats it under every score. It is not a fix.

**What a fix looks like.** Three things, in order of how much each buys:

- **A storm count.** Track spells cast this turn; let a card that reads "for each spell cast
  this turn" scale with it. Cheap to add, and it turns a whole archetype from unmeasurable
  into measurable.
- **Mana from rituals.** The engine models lands and rocks. A ritual is a spell that makes
  mana and then is gone, which the current mana model has no way to express.
- **A win from one card.** Some decks assemble two or three cards and win on the spot. The
  engine has no notion of "these cards together end the game"; it plays them and keeps
  going. This is the hardest of the three and the one that needs a real design rather than a
  patch.

---

## 3 · Combat is a scalar, and it should be a board — **designed, not built**

**What the engine does today.** There is no combat. There is an arithmetic estimate of it:
total attacking power, multiplied by a per-creature connect rate (0.85 for flying or menace,
0.78 for trample, 0.70 otherwise), reduced by a toughness-weighted estimate of what the
defenders soak, plus a flat deterrence of 2 for deathtouch and 1 for first strike. No
attacker is ever assigned to a blocker. Nothing ever dies in combat. Nobody ever decides
anything.

That estimate was a reasonable place to start and it is now the ceiling on everything else.
A deck's whole plan can be "make many small bodies and go wide", or "one huge trampler", or
"hold three untapped blockers and win late", and the current model scores all three as a
number times 0.7.

### What a real combat step needs

Six pieces, and the fourth is the one that turns a rules engine into a model of a *game*.

**1 · A board, not a total.** Each seat holds creatures with printed power and toughness
(now available — §1), damage marked this turn, tapped or untapped, and the keywords that
change combat: flying, reach, menace, trample, deathtouch, first strike, double strike,
vigilance, lifelink, indestructible, protection.

**2 · Modifiers over time.** Power and toughness are a starting point, not a constant.
`+1/+1` counters accumulate; `-1/-1` counters cancel against them; proliferate adds one of
whatever is already there; anthems apply while their source is on the battlefield; poison
counters are a second life total with its own loss condition at ten. A creature's body at
the moment of combat is printed plus every modifier standing at that moment, and the whole
point of a counters deck is that this number is not the printed one by turn six.

**3 · Declaration, on both sides.** The attacker chooses who attacks and whom they attack.
The defender chooses, per attacker, which creatures block it — an assignment problem, not a
flag. Multiple attackers meeting multiple blockers is the normal case in a four-player game
and it is where every interesting decision lives.

**4 · The block-or-take decision, with a real threshold.** This is the piece that makes the
model a model. From the specification:

> "A player with only 1 creature on the board with 3 toughness, but attacked for 3, and the
> game just started so the player has 40 health, will likely take the 3 damage vs. losing
> the creature, dropping the player to 37 health and the creature survives."

Exactly right, and it generalises. Blocking spends a creature to save life; taking spends
life to keep a creature. Which is correct depends on what each is worth *at that moment*:

| Input | Why it moves the answer |
|---|---|
| Life remaining | 3 of 40 is nothing; 3 of 4 is the game. Life is worth more the less of it there is, and not linearly. |
| The blocker's board value | A creature that taps for mana, draws a card each turn, or is the commander is worth far more than its toughness. |
| Whether the block is profitable | Blocking a 2/2 with a 3/3 kills the attacker and keeps the blocker. That is not a cost at all, it is a gain, and it happens constantly. |
| Deathtouch, first strike, trample | Deathtouch makes every block a trade. First strike makes an even-looking block one-sided. Trample means blocking saves less life than it looks like it will. |
| Who else is at the table | In a four-player game the seat that blocks is the seat that is short a creature next turn, against two other people. |

So the decision is a value comparison, not a rule: **block when the life saved is worth more
than the creature spent, priced at this life total and this board.** That function is where
Playstyle enters (`docs/prd.md` §11) — a competitive pilot values its life total lower early
and its board higher, a casual one blocks to keep bodies alive because losing creatures is
what feels bad.

**5 · Damage assignment.** An attacker blocked by two creatures assigns its power across
them in an order the attacker chooses; deathtouch makes one point lethal, so a 1/1 deathtouch
blocker eats any attacker; trample carries the excess to the player, which is why blocking a
trampler saves less than blocking anything else. First strike is a separate damage step
before the normal one, and double strike is both.

**6 · Instants, and the fact that a turn is not a turn.** A defender holding two untapped
lands and a combat trick is a different defender. The current engine has no concept of
holding mana up for something, so a pump spell, a removal spell at instant speed and a fog
are all just cards that were cast at some point. Modelling this needs, at minimum: mana held
open, a hand the pilot is willing to spend from at instant speed, and the same block-or-take
value function extended to "or change the outcome for two mana".

### What it costs

The engine runs about 28,700 games a second today. Real combat — a board, an assignment
search per attack, two damage steps — will not. A five- to ten-fold slowdown is the honest
expectation, which turns a 120,000-game measurement from four seconds into thirty or forty.

That is a product decision, not only an engineering one, and there are three ways out:

- **Accept it.** The published measurement is a tool run, not something a reader waits on;
  only the browser's "Measure it properly" would feel it.
- **Two combat models.** A fast estimate for the optimizer's inner loop, which runs tens of
  thousands of times, and the real one for the published measurement. The risk is the one
  this repository already has a test for: two paths that are supposed to agree and slowly
  do not.
- **Fewer games.** The protocol is six seeds of 20,000 because that is where the seed-to-seed
  spread stopped shrinking with the *current* engine. A more detailed engine may converge
  faster, or slower; that has to be re-measured rather than assumed.

### The order to build it

1. **The board.** Creatures as objects with bodies and keywords, replacing the scalar. No
   decisions yet — attack with everything, block with nothing — and check that the score
   moves in ways that make sense on decks whose plan is known.
2. **Blocking and damage assignment**, with a fixed, obvious policy: block when it is a
   clean profit, otherwise take it.
3. **The value function** — life priced against board, with the Playstyle parameter.
4. **Counters and modifiers over time.**
5. **Instants held up.**

Each step is measurable against the last, which is the only way a change this size stays
honest: every one of them re-bases the numbers, and every one of them has to say by how much
and why.

---

## 3a · The pilot was a constant, and now it is a parameter — **built**

*Landed 2026-09-07 as `pilot-policy.js`. This section records what it found, including two
things it found about the model rather than about any deck.*

**The asymmetry.** Count the parameters in `sim-engine.js`. The three opponents are nine
archetype curves across three power tiers and six playstyles, sampled per seat and jittered
per game — a table that can be a kitchen-table pod on one run and a bracket-3 night on the
next. Our side of it had one mulligan rule, one cast-priority table, one attack target. Every
score in this repository is a deck and a pilot multiplied together, and with one pilot it
could not be factored.

`pilot-policy.js` makes five decisions into data — which sevens you keep, what you cast
first, who you attack, whether you tap out, and what you hold back — and names three answers
to them. `BALANCED` is the pilot that was already there, and `tests/pilot-policy.mjs` requires
every metric of a no-policy run and a `BALANCED` run to be identical across six decks and
three seeds, so every published number stays exactly what it is.

### What each decision is worth

Six shipped decks, three seeds of 8,000 games, mean delta against a shared baseline.
Reproduce with `node tools/sim/pilot-ablation.mjs --seeds 3 --games 8000`.

| decision | mean | win rate |
|---|---:|---|
| hold the cheapest answer up from turn four | **+11.54** | 28.8% → 37.1% |
| attack whoever is closest to winning | **+10.93** | 28.8% → 47.0% |
| hold it up from turn two instead | +6.32 | 28.8% → 34.8% |
| spread the damage | +2.19 | |
| attack the biggest board | +1.70 | |
| creature-first cast order | +0.48 | |
| develop-and-tutor cast order | +0.00 | |
| jam the commander | −0.10 | |
| mulligan to five for a working hand | −0.51 | |
| develop before deploying the commander | −1.49 | |
| keep one blocker home | −10.42 | 28.8% → 14.4% |
| keep two blockers home | −13.35 | 28.8% → 10.3% |

**Attacking the leader is not attacking the biggest board, and the gap between them is the
finding.** The shipped combo profile wins on turn 9 with a threat output of 2; the tokens
profile wins on turn 11 with an output of 12. Hit the biggest board and you hit tokens, for
+1.70. Hit whoever is closest to winning and you hit combo, for +10.93. That is the single
largest legitimate pilot decision in the model, it is real Commander advice, and it varies
by deck — worth +11.10 to Krenko and +0.96 to Atraxa.

### Two things this found about the model, not about any deck

**Blocker retention cannot be priced, because there are no blocks.** Keeping one creature
home costs 10.42 points and two-thirds of the win rate. That is not bad play; it is
`blockReduction = min(0.55, totalToughness × 0.025)`, which on the shipped decks' average
toughness of 3.2 is pinned at its cap from a board of seven creatures onward. Past that point
a held-back body buys nothing while its lost attack is paid in full. **This is the concrete
case for section 3.** The parameter ships implemented, tested, and set to zero; when combat
is real, −10.42 is the number it has to beat.

**One instant in hand was an infinite supply of answers.** `heldAnswers` is recounted from
hand at the top of every turn, and a held answer pushes back a seat's win turn — but the card
was never removed from hand. So a single Swords to Plowshares delayed every combo on the
table, every turn, all game, and was never cast. It made deliberately holding mana up measure
**+15.66**, five points more than any real decision. Both lens policies now spend the card;
the published pilot does not, because every published number was produced under the old
counting, and changing it would re-base all two hundred rungs for a second time in one week.
`tests/pilot-policy.mjs` pins both halves.

**And the interaction metric is a counterfactual.** The published protocol counts an answer
as available when you *could* have held it up with everything untapped, whether or not you
did — so a pilot who taps out every turn is credited for interaction it never had. Measured,
that generosity is worth **12.41 points** to the average deck. Both lens policies use the
honest rule instead, which is why the two lens scores sit below the header score and belong
read against each other rather than against it. The app says so on the panel.

### What it produces

Four runs of the same hundred — casual, competitive, and the competitive line again with one
decision handed back per ablation — and the sentence the app could not previously write. On
the shipped six, that sentence is not the same sentence:

| deck | casual | competitive | gap | leading decision |
|---|---:|---:|---:|---|
| D1 Quintorius | 59.20 | 76.83 | +17.63 | who you attack |
| D2 Chulane | 47.17 | 64.10 | +16.93 | who you attack (+8.27) |
| D3 Atraxa | 66.47 | 80.33 | +13.86 | whether you tap out (+6.63) |
| D4 Felothar | 54.20 | 70.37 | +16.17 | who you attack (+8.34) |
| D5 Shadrix | 64.73 | 80.27 | +15.54 | whether you tap out (+6.17) |
| D6 Krenko | 59.73 | 76.47 | +16.74 | who you attack (+11.10) |

Krenko's headroom is nearly all in who it attacks; Atraxa's is nearly all in holding an
answer up. That difference is why the attribution is measured per deck rather than asserted
from this table.

One result the competitive policy keeps despite the model disliking it: **developing before
deploying the commander costs points on every one of the six** (−0.93 to −4.10). A policy is
a way of playing, not a pile of the moves that scored best, so it stays — and the advice
reports it as a cost rather than hiding it.

### What is still not modelled

The pilot decides; it does not yet decide *well*. There is no lookahead, no reading of the
board, no holding a wipe for the turn it is worth most. `castPriority` is a table with
policy offsets, not a plan. And two of the five decisions — blocking and, with it, the whole
question of what a creature is for — wait on section 3.

---

## 4 · Smaller distortions, recorded so they are not rediscovered

- **The opponents are profiles, not decks.** `sim/opponents.json` describes nine playstyles
  statistically rather than playing real hundreds. A deck that beats "tuned" beats a
  distribution, not a list somebody brought.
- **No stack, no priority, no responses.** Counterspells are modelled as interaction
  availability rather than as answers to specific spells.
- **No mulligan skill.** The keep rule is a heuristic on land count; a real player's keep
  depends on the matchup and the seat. It is now a *parameter* — see section 3a — but a
  parameterised heuristic is still a heuristic.
- **Colour screw is approximate.** The mana model tracks sources and pips but not the order
  lands enter, so a hand that is one turn short of its second colour is scored as if it were
  not.

None of these is hidden. All of them push in the same direction: the engine measures how a
deck *functions*, which is most of what a deck-building tool needs, and it is worse than a
human at measuring how a deck *wins* when the win is not combat.
