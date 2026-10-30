# The second check on a card's ways (2026-10-30; Rob's request, Linear ROB-200)

Rob, 2026-10-30: *"I am finding cards that have multi-options, multi-way of paying for, multi-descriptive effects, we are
running into a bunch of issues with those. The checks on the extraction to the engine input needs to expand to second-check
validate these are captured. Examine the logged bugs in Linear from yesterday to identify common patterns and expand our
extraction and testing process to better catch these going forward as practice."*

## What yesterday's bugs have in common

| Issue | The card's extra way | Where the way was lost | Why the suite stayed green |
| --- | --- | --- | --- |
| ROB-326 Tezzeret's Gambit | pay 2 life for `{U/P}` | the cast is not offered from untapped lands at all (not even with an Island) | its scenario taps three Wastes by hand, then casts |
| ROB-317 Ash Barrens | Basic landcycling `{1}` from hand | the activation is not offered with an empty pool and an untapped source | the cycling test floats mana first |
| ROB-331 Hall of Echoes | a second ability, `{5}`: become a copy | the same: offered once five lands are tapped by hand, not before | no scenario asks what is *offered* |
| ROB-330 Food token | `{2}, {T}`, sacrifice: gain 3 | the same, for a cost of mana, tap and sacrifice | `tests/engine-roblists-food.mjs` pre-taps |
| ROB-323 Winter | "sacrifice a creature or planeswalker" | the prompt reads "a permanent"; the selector is an `anyOf` the noun helper cannot say | scenarios assert the options, not the question |
| ROB-329 Oko's Elk | "becomes a 3/3 Elk" | the view carries the name, not what the permanent looks like | the engine state is right; no check reads the view for appearance |
| ROB-300 (23 held-back candidates) | a type, a number, a condition | the compiler's template filled one slot from another | `checkFidelity` reads the translation's words against the text, not its structure |

Six patterns, in the order they cost the most:

1. **The offer is computed from the floated pool, not from what the player can pay.** `castOffers` has an `autoTap` branch
   (`rules/actions.mjs`, "Not from the pool, but by tapping for it"); `abilityOffers` prices an activation against the pool only,
   and the cast `autoTap` branch yields no offer for Phyrexian, `{2/W}` and `{X}` costs, convoke, affinity or an additional
   cost (59 spells, measured; why each is skipped is not yet read). One cause behind four reports.
2. **The scenarios prove the way by hand-driving the state in which it survives.** 7,632 of the 8,705 scenarios that cast or
   activate (87.7%) tap lands by hand before the `cast` or `activate` step. They assert the end state, never the offer.
3. **Every check reads the layer below it.** The compiler's checks read the compiler's own output; a scenario reads the
   definition it was written beside. Nothing reads the Oracle text a second time, nor the table's offer a player sees.
4. **A union is written one way and flattened another.** `types: [A, B]` is *and* (`filter.mjs`: `types.every`); a union is
   `anyOf`. The sentence library's `TYPE` slot was bound once and reused (Prison Realm compiled as Enchantment or Planeswalker).
5. **Two registries disagree and no check compares them.** `data/engine/support.json` says all 32,116 cards are `unsupported`;
   the directory plays 6,430. Only the frozen local-host runtime and `tests/catalog-rule.mjs` read it, so it did not cause the
   reports above, but it sent the reading of two of them down the wrong road. It is stale documentation until it is
   regenerated or retired (Rob's call: it is a Day-0 ledger, and Forge's retirement, M9, removes its last reader).
6. **"Not offered" has no reason.** A refusal that says nothing is read as a bug (ROB-330, ROB-331 both ask whether the
   permanent was elked). The standing rule applies: refuse with what is wrong and what to do instead.

## The second check: `game/tools/interaction-census.mjs`

It reads the Oracle text with rules of its own (it imports nothing from the sentence library), and asks the engine the
question a player asks.

| Layer | Question | Catches | How it knows |
| --- | --- | --- | --- |
| **A, extraction** (text against definition) | does the definition keep every way the text offers? | modes, spree, way keywords (flashback, kicker, evoke...), cycling, "cost: effect" abilities and the *parts* of each cost, loyalty abilities, additional costs, unions of targets | the text alone |
| **B, funding state** (behavioral, metamorphic) | does a player see this way without floating mana first? | patterns 1 and 2, for every spell and every costed ability | the same state with the lands **untapped** and with them **tapped by hand**: every offer the second has, the first must have. It knows no right answer, so it holds for a card nobody has read |
| **B, way parity** | does a cost payable two ways offer both? | Phyrexian `{U/P}`, hybrid, `{2/W}` | each way's exact lands, nothing more |

```bash
node game/tools/interaction-census.mjs                      # both layers over the directory (about 25 s)
node game/tools/interaction-census.mjs --card "Hall of Echoes"   # one card, every finding in full
node game/tools/interaction-census.mjs --candidates         # the compiler's live candidates (about 45 s)
node game/tools/interaction-census.mjs --check              # the ratchet; --write-baseline lowers it
node tests/engine-interaction-census.mjs                    # the suite: detectors red on mutated real cards, then the ratchet
```

**The compiler is gated by Layer A.** `compileCard` refuses a candidate whose translation lost a way
(`census: <CODE>: <detail>`), after `checkFidelity` and before the smoke game. It can only refuse. The first run refused five
candidates the compiler had passed, each a real mistranslation: Prison Realm and Citizen's Arrest (creature or planeswalker →
Enchantment or Planeswalker), Thopter Arrest (artifact or creature → Enchantment or Creature), Isolation Zone (Enchantment or
Enchantment), Vault Guardsman (Creature or Creature). Candidates 116 → 111. The committed `data/engine/candidates.json` (100
cards, 2026-10-25) holds none of the five; regenerate it only through `card-compiler.mjs --write`.

### What it found on 2026-10-30, on `main`

| Class | Cards | What it means |
| --- | ---: | --- |
| `ACTIVATION_ONLY_WHEN_FLOATED` | 893 (882 defined, 11 candidates) | a costed ability is not offered from untapped lands with an empty pool |
| `CAST_ONLY_WHEN_FLOATED` | 59 | a spell is not offered from untapped lands: 47 with `{X}`, 18 with `{2/W}`, 6 Phyrexian, plus convoke, affinity and an additional cost |
| Layer A (extraction) | 0 | in the 6,430 definitions and the 100 committed candidates: 142 way-keyword lines, 170 cycling lines, 1,781 "cost: effect" lines (2,453 cost parts), 78 loyalty lines, 178 unions of targets and 100 modal cards examined, all kept |

Both Layer B classes are one engine cause (pattern 1). They are in the baseline
(`docs/engine/interaction-census-baseline.json`, 1,009 findings), a ratchet like the UK-spelling count: a finding the baseline
does not list fails the suite, a listed one that is gone fails it too (so a fix is locked in), and the two ceilings in the
suite only come down. **Never add a finding to the baseline to make the suite green.**

### What it does not see (so do not read "clean" as "proven")

- 439 of the 6,889 spells and abilities were offered in no state: the probe supplies no sacrifice fodder, no discard, no
  summoning-sick-free creature and only creature, artifact and player targets. Their funding is unchecked.
- Multi-faced cards are skipped by the "cost: effect" cost-part check (77 of 6,430).
- Layer A reads *structure against text*; a wrong number or a dropped condition inside a sentence is still the fidelity check's
  and the scenario's job (ROB-300's other classes).
- It does not yet read the question the player is asked (ROB-323's "a permanent") or the view (ROB-329's appearance). Those
  are Layer C, below.
- Clean means *offered*, not *resolved correctly*: each way still needs its own scenario that takes it.

## The practice: what "captured" means for a card

A card with more than one way is not loaded, and a candidate is not promoted, until all of these hold. `--card "<name>"` is
the first step of any "option X is not offered" report, before reading code.

1. **List the ways from the text, not from the definition**: modes, ways to pay (Phyrexian, hybrid, `{2/W}`, alternative and
   additional costs, kicker and its kin, convoke, delve), each ability and each *part* of its cost, each union of targets.
2. **Layer A is clean** (the compiler enforces it for candidates; the suite for the directory).
3. **Layer B is clean**, or the finding is the one engine cause already in the baseline. A new card with a new finding is a
   bug in the card or the engine, never a baseline entry.
4. **Each way has a scenario that takes it**, and at least one scenario per card asserts the *offer* from untapped sources and
   an empty pool (`{tap}` steps are for tests of mana, not the way into a card).
5. **One scenario per way is mutation-proved** (AGENTS.md: break the thing, watch it go red). For a payment way, that means
   the scenario fails when the engine stops offering that way.
6. **A refusal says why.** If the way is correctly unavailable (no creature to copy; too little mana; an elked Food), the
   board says what is wrong and what to do instead.

## What is next (none of it done here)

| Item | Owner | Why it waits |
| --- | --- | --- |
| Offer an activation from untapped sources (an `autoTap` for abilities, as casts have), and extend the cast `autoTap` to Phyrexian, `{2/W}` and `{X}` | Engine, after W5's cost-version ABI (ROB-315) | it edits the payment code W5 holds in a frozen proof; a design call on how Cancel and the funding question work for abilities |
| Layer C: the question and the view. For every `anyOf` target, the title and options name each type (Winter); for every "becomes", the view carries an appearance (Oko's Elk) | Engine + Play (Shared contract) | needs the view field of ROB-329 |
| Layer D: take each way and resolve it, from the offer, for every mode and payment way, with a mutation proof | Engine, wave 0's exercise gate | this is the "exercised" gate wave 0 already requires; the census gives it the list of ways |
| Retire or regenerate `support.json` | Rob's call | its last reader is the local host M9 retires |
| Lint scenarios: a `cast`/`activate` step preceded by `tap` must be paired with an offer assertion | Engine | 7,632 scenarios would need a pairing or an allow-list |
