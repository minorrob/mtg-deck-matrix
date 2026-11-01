# The second check on a card's ways (2026-10-30; Rob's request, Linear ROB-200)

Rob, 2026-10-30: *"I am finding cards that have multi-options, multi-way of paying for, multi-descriptive effects, we are
running into a bunch of issues with those. The checks on the extraction to the engine input needs to expand to second-check
validate these are captured. Examine the logged bugs in Linear from yesterday to identify common patterns and expand our
extraction and testing process to better catch these going forward as practice."*

**Corrected 2026-10-31 (ROB-354).** The first version of this document, and ROB-339's census, said four reports shared one cause. They did not
(below), and the census asked the engine in the scenario runner's defaults, not the table's configuration, which inflated its cast
findings from 4 cards to 59. This version says what was measured with the table's flags, and what is not known.

## What yesterday's bugs turned out to be

| Issue | The card's extra way | What it was | Why nothing caught it earlier |
| --- | --- | --- | --- |
| ROB-326 Tezzeret's Gambit | pay 2 life for `{U/P}` | the cast that taps for itself did not plan Phyrexian symbols, so the spell was not offered from untapped lands. Fixed by #972 under `phyrexianTaps` (new matches) | its scenario taps three Wastes by hand, then casts |
| ROB-317 Ash Barrens | Basic landcycling `{1}` from hand | Rob's card was on the battlefield, where no cycling is correct. Separately, an activation from hand is offered only once mana is floated (engine level; no player report) | the cycling test floats mana first |
| ROB-331 Hall of Echoes | a second ability, `{5}`: become a copy | Oko had turned it into an Elk, so it had lost its abilities: the game was right and said nothing. #981 says why. #981 found that the Hall's own `{C}` counts toward the `{5}` | no check reads the explanation a player gets |
| ROB-330 Food token | `{2}, {T}`, sacrifice: gain 3 | the same: an Elked Food. #981 | the same |
| ROB-323 Winter | "sacrifice a creature or planeswalker" | the prompt reads "a permanent"; the selector is an `anyOf` the noun helper cannot say | scenarios assert the options, not the question |
| ROB-329 Oko's Elk | "becomes a 3/3 Elk" | the view carries the name, not what the permanent looks like | the engine state is right; no check reads the view for appearance |
| ROB-300 (23 held-back candidates) | a type, a number, a condition | the compiler's template filled one slot from another | `checkFidelity` reads the translation's words against the text, not its structure |

| Issue | The card's extra way | Where the way was lost | Why the suite stayed green |
| --- | --- | --- | --- |
| ROB-326 Tezzeret's Gambit | pay 2 life for `{U/P}` | the cast is not offered from untapped lands at all (not even with an Island) | its scenario taps three Wastes by hand, then casts |
| ROB-317 Ash Barrens | Basic landcycling `{1}` from hand | the activation is not offered with an empty pool and an untapped source | the cycling test floats mana first |
| ROB-331 Hall of Echoes | a second ability, `{5}`: become a copy | the same: offered once five lands are tapped by hand, not before | no scenario asks what is *offered* |
| ROB-330 Food token | `{2}, {T}`, sacrifice: gain 3 | the same, for a cost of mana, tap and sacrifice | `tests/engine-roblists-food.mjs` pre-taps |
| ROB-323 Winter | "sacrifice a creature or planeswalker" | the prompt reads "a permanent"; the selector is an `anyOf` the noun helper cannot say | scenarios assert the options, not the question |
| ROB-329 Oko's Elk | "becomes a 3/3 Elk" | the view carries the name, not what the permanent looks like | the engine state is right; no check reads the view for appearance |
| ROB-300 (23 held-back candidates) | a type, a number, a condition | the compiler's template filled one slot from another | `checkFidelity` reads the translation's words against the text, not its structure |

Seven patterns:

1. **An offer can depend on the floated pool, and on a flag.** `castOffers` has an `autoTap` branch (`rules/actions.mjs`, "Not
   from the pool, but by tapping for it"), and the table turns on `pooledTaps`, `xTaps` and `phyrexianTaps` for a new match, which
   widened it to {X} and Phyrexian costs. `abilityOffers` prices an activation against the pool only. With the table's flags, 4
   spells are still offered only once the mana is floated (Burn at the Stake; Reigning Victor, Spectral Procession and Temur
   Tawnyback, which carry three `{2/X}` symbols), and 882 defined cards (893 with the compiler's candidates) have a costed ability
   offered only once the mana is floated. The first is a defect class (ROB-326 was one). The second is an engine fact that no player
   report has confirmed matters, so the census counts it and does not enforce it.
2. **The scenarios prove the way by hand-driving the state in which it survives.** 7,632 of the 8,705 scenarios that cast or
   activate (87.7%) tap lands by hand before the `cast` or `activate` step. They assert the end state, never the offer.
3. **Every check reads the layer below it.** The compiler's checks read the compiler's own output; a scenario reads the
   definition it was written beside. Nothing reads the Oracle text a second time, nor the table's offer a player sees.
4. **A union is written one way and flattened another.** `types: [A, B]` is *and* (`filter.mjs`: `types.every`); a union is
   `anyOf`. The sentence library's `TYPE` slot was bound once and reused (Prison Realm compiled as Enchantment or Planeswalker).
5. **Two registries disagree and no check compares them.** `data/engine/support.json` said all 32,116 cards were `unsupported`
   while the directory played 6,430, and it misled the first reading of two reports. #981 now generates it from the directory
   (`game/tools/engine-definitions.mjs --write/--check`): 6,430 `verified`, 25,686 `unsupported`.
6. **A correct refusal that says nothing is read as a bug.** ROB-330 and ROB-331 were an Elked Food and an Elked Hall: the game
   was right and silent. The standing rule applies: refuse with what is wrong and what to do instead (#981 does).
7. **A check can measure an engine nobody plays on.** The scenario runner starts with the table's flags off. A census built on its
   defaults reported 59 spells not offered from untapped lands where the table's configuration leaves 4. Every probe now takes the
   table's flags, and the suite fails if `game/room/table.mjs` sets a `*Taps` flag the census does not know.

## The second check: `game/tools/interaction-census.mjs`

It reads the Oracle text with rules of its own (it imports nothing from the sentence library), and asks the engine the
question a player asks.

| Layer | Question | Catches | How it knows |
| --- | --- | --- | --- |
| **A, extraction** (text against definition) | does the definition keep every way the text offers? | modes, spree, way keywords (flashback, kicker, evoke...), cycling, "cost: effect" abilities and the *parts* of each cost, loyalty abilities, additional costs, unions of targets | the text alone |
| **B, funding state** (behavioral, metamorphic) | does a player see this way without floating mana first? | patterns 1 and 2, for every spell and every costed ability | the same state, built with the table's flags, with the lands **untapped** and with them **tapped by hand**: every offer the second has, the first must have. It knows no right answer, so it holds for a card nobody has read. Casts are a **hard** class; activations are **advisory** |
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

### What it found on 2026-10-31, on `main`, with the table's flags

| Class | Policy | Cards | What it means |
| --- | --- | ---: | --- |
| `CAST_ONLY_WHEN_FLOATED` | hard, baselined | 4 | a spell is not offered from untapped lands: Burn at the Stake (taps creatures as an additional cost) and Reigning Victor, Spectral Procession, Temur Tawnyback (three `{2/X}` symbols) |
| `ACTIVATION_ONLY_WHEN_FLOATED` | advisory, counted | 893 (882 defined, 11 candidates) | a costed ability is offered only once the mana is floated; no player report confirms it matters |
| Layer A (extraction) | hard | 0 | in the 6,430 definitions and the 100 committed candidates: 142 way-keyword lines, 170 cycling lines, 1,781 "cost: effect" lines (2,453 cost parts), 78 loyalty lines, 178 unions of targets and 100 modal cards examined, all kept |

The hard classes are in the baseline (`docs/engine/interaction-census-baseline.json`, 19 findings on 4 cards), a ratchet like the
UK-spelling count: a finding the baseline does not list fails the suite, a listed one that is gone fails it too (so a fix is locked
in), and the ceiling in the suite only comes down. **Never add a finding to the baseline to make the suite green.** An advisory class
is never baselined: it would otherwise fail every new card with a costed ability for a behavior no player has been shown to meet.
Promote it to hard (`CLASS_POLICY` in the tool) when a report confirms it or Rob decides the engine should offer it, then baseline
what is left. Tezzeret's Gambit, found in the first run, is clean here: ROB-326 fixed it under `phyrexianTaps`.

### What it does not see (so do not read "clean" as "proven")

- 439 of the 6,889 spells and abilities were offered in no state: the probe supplies no sacrifice fodder, no discard, no
  summoning-sick-free creature and only creature, artifact and player targets. Their funding is unchecked.
- The probe supplies the table's `pooledTaps`, `xTaps` and `phyrexianTaps`. The table's `preparedTaps` is not one the scenario
  runner takes, so the "prepare" cards are not probed in that configuration.
- Multi-faced cards are skipped by the "cost: effect" cost-part check (77 of 6,430).
- Layer A reads *structure against text*; a wrong number or a dropped condition inside a sentence is still the fidelity check's
  and the scenario's job (ROB-300's other classes).
- It does not yet read the question the player is asked (ROB-323's "a permanent") or the view (ROB-329's appearance). Those
  are Layer C, below.
- Clean means *offered*, not *resolved correctly*: each way still needs its own scenario that takes it.

## The practice: what "captured" means for a card

A card with more than one way is not loaded, and a candidate is not promoted, until all of these hold. `--card "<name>"` is
the first step of any "option X is not offered" report, before reading code.

0. **Read the report's whole thread**, and again before commenting. Rob often answers it (ROB-330 and ROB-331: Oko had Elked them).
1. **List the ways from the text, not from the definition**: modes, ways to pay (Phyrexian, hybrid, `{2/W}`, alternative and
   additional costs, kicker and its kin, convoke, delve), each ability and each *part* of its cost, each union of targets.
2. **Layer A is clean** (the compiler enforces it for candidates; the suite for the directory).
3. **Layer B's hard class is clean**, or the finding is already in the baseline. A new card with a new hard finding is a bug in
   the card or the engine, never a baseline entry. The advisory class is information, not a gate.
4. **Each way has a scenario that takes it**, and at least one scenario per card asserts the *offer* from untapped sources and
   an empty pool (`{tap}` steps are for tests of mana, not the way into a card).
5. **One scenario per way is mutation-proved** (AGENTS.md: break the thing, watch it go red). For a payment way, that means
   the scenario fails when the engine stops offering that way.
6. **A refusal says why.** If the way is correctly unavailable (no creature to copy; too little mana; an elked Food), the
   board says what is wrong and what to do instead.

## What is next (none of it done here)

| Item | Owner | Why it waits |
| --- | --- | --- |
| Offer an activation from untapped sources (an `autoTap` for abilities, as casts have), if players meet the gap | Engine, after W5's cost-version ABI (ROB-315) | not confirmed by any report; it edits the payment code W5 holds in a frozen proof; a design call on how Cancel and the funding question work for abilities. Then promote the advisory class |
| The 4 casts left: three `{2/X}` symbols in one cost, and an additional cost that taps creatures | Engine | measured, cause not read |
| Layer C: the question and the view. For every `anyOf` target, the title and options name each type (Winter); for every "becomes", the view carries an appearance (Oko's Elk) | Engine + Play (Shared contract) | needs the view field of ROB-329 |
| Layer D: take each way and resolve it, from the offer, for every mode and payment way, with a mutation proof | Engine, wave 0's exercise gate | this is the "exercised" gate wave 0 already requires; the census gives it the list of ways |
| ~~Retire or regenerate `support.json`~~ | done | #981 generates it from the directory; ROB-347 is moot |
| Lint scenarios: a `cast`/`activate` step preceded by `tap` must be paired with an offer assertion | Engine | 7,632 scenarios would need a pairing or an allow-list |
