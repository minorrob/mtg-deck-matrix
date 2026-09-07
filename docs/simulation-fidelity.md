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

## 3 · Smaller distortions, recorded so they are not rediscovered

- **The opponents are profiles, not decks.** `sim/opponents.json` describes nine playstyles
  statistically rather than playing real hundreds. A deck that beats "tuned" beats a
  distribution, not a list somebody brought.
- **No stack, no priority, no responses.** Counterspells are modelled as interaction
  availability rather than as answers to specific spells.
- **No mulligan skill.** The keep rule is a heuristic on land count; a real player's keep
  depends on the matchup and the seat.
- **Colour screw is approximate.** The mana model tracks sources and pips but not the order
  lands enter, so a hand that is one turn short of its second colour is scored as if it were
  not.

None of these is hidden. All of them push in the same direction: the engine measures how a
deck *functions*, which is most of what a deck-building tool needs, and it is worse than a
human at measuring how a deck *wins* when the win is not combat.
