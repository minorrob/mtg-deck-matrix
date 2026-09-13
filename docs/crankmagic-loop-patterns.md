# Loop patterns CrankMagic should recognise

The catalogue behind the Discover / loop plan (`docs/crankmagic-discover-loop-plan.md`). Each
pattern is written three ways: what it looks like at the table, the **general characteristic**
(the shape that makes it a loop rather than a pile of good cards), and the **signature** in the
classifier's own vocabulary — the fields `card-classify.js` already writes on every card in
`data/graph.json` (`roles`, `causes`, `triggers`, `produces`, `requires`, `multiplies`, `grants`,
`extends`, `mechanics`) plus the terms it does **not** have yet, marked ✗. The missing terms are
PR B's work; the detection rule at the end is PR C's.

Rob's request that started this read "identify frequent combo and infinite loops and stacking
and looping and blinking patterns, document them, and based on the general characteristic…" and
was cut off there. This document is the "identify and document" half. The "based on the general
characteristic" half is taken to mean *detect and show them in Discover*, and that is planned
(PR B and C), not built.

## The one shape under all of them

A loop is a **directed cycle** in which every step's cost is paid by an earlier step's product,
plus at least one **payoff** hanging off the cycle that turns each pass into damage, cards,
mana or bodies. In the graph's terms:

- a step is an edge the graph already draws — `causes → triggers` (an event and the card that
  fires on it), `produces → requires` (a supply and the card that needs it) — or one of the
  three edges the vocabulary is missing (✗ untap, ✗ copy, ✗ blink);
- the cycle is **closed** when each activation cost inside it (a tap, a sacrifice, mana) is
  covered by a product inside it;
- a **payoff** is a node whose `triggers` name an event the cycle causes and which itself
  `causes:life-loss` or `produces` `card`, `token` or `mana`;
- **stacking** (doublers, proliferate) is the same shape without the cycle: one product,
  multiplied — exponential rather than infinite.

## The patterns

### 1. Untap engine — tap ability, untapper, fuel

*At the table:* Krenko, Mob Boss taps for goblins; Thornbite Staff untaps him whenever a
creature dies; Goblin Bombardment (or Skirk Prospector) sacrifices a goblin to make one die.
Every pass makes one more goblin than it costs. With Purphoros or Impact Tremors out, every
pass also drains the table. Verified on Commander Spellbook; all three pieces are in D6 today.

*Characteristic:* a permanent with a `{T}:` ability whose product can be turned into an event,
an untap that fires on that event, and an outlet that turns the product into the event.

*Signature:* A has a tap ability ✗`tap-ability` and `produces:token` (or `mana`, `card`);
B ✗`roles:untap` with `triggers:creature-dies` (Thornbite Staff today reads `triggers:
creature-dies` and `roles:removal`, which is why the Primary Purpose ladder rings its removal
chip until untap lands); C `roles:sac-outlet` `causes:creature-dies`. Cycle length 3.

*Cousins:* Kiki-Jiki + Thornbite Staff + any outlet (copy instead of tap-for-tokens);
Bloom Tender / Selvala + Freed from the Real / Pemmin's Aura (✗untap that costs less mana than
the untapped permanent makes: `produces:mana` ≥ cost).

### 2. Sacrifice loop — outlet, dies-trigger, a body that comes back

*At the table:* Blood Artist drains for every death; Ashnod's Altar turns each death into
mana; a Persist creature with a way to remove its -1/-1 counter (Melira, Solemnity — the card
D4 is adding) comes back every time. Without the counter trick it is a very good engine; with
it, infinite.

*Characteristic:* an outlet, a payoff that listens for the death, and a body whose return is
free.

*Signature:* `roles:sac-outlet` + (`triggers:creature-dies` ∧ `causes:life-loss` or
`produces:mana|card`) + (`roles:recursion` or ✗`mechanics:persist` / ✗`undying` with
✗`roles:counter-removal`). Cycle length 3–4. Everything but persist/undying and counter removal
exists today; both keywords are in Scryfall's keyword list, so they may already be in
`mechanics` — PR B confirms and adds the counter-removal role.

### 3. Blink loop — flicker source, an ETB that pays for the next flicker

*At the table:* Deadeye Navigator soulbonds to Peregrine Drake: blink the Drake for {1}{U},
it untaps five lands, blink again. Every enter-the-battlefield payoff in the deck fires each
time.

*Characteristic:* an exile-and-return effect with a repeatable cost, and a creature whose ETB
produces more than that cost (mana, or an untap of lands).

*Signature:* ✗`roles:blink` (repeatable, on a permanent) + `causes:creature-etb` +
(`produces:mana` on ETB or ✗`roles:untap` targeting lands) + payoffs `triggers:creature-etb`.
Cycle length 2, payoffs unbounded. Blink is the largest missing term: the graph cannot see any
flicker deck's engine today.

### 4. Copy loop — copier plus an untap-on-enter body

*At the table:* Kiki-Jiki, Mirror Breaker or Splinter Twin copies Zealous Conscripts /
Pestermite / Felidar Guardian; the copy enters, untaps Kiki-Jiki, repeat: infinite hasty
attackers.

*Characteristic:* a repeatable copy effect whose product can untap or re-use the copier.

*Signature:* ✗`roles:copy` + `grants:haste` (the copier or a haste enabler) + a target with
`causes:creature-etb` and ✗`roles:untap` (or ✗`roles:blink` for the Guardian shape). Cycle
length 2. Kiki-Jiki reads `produces:token` today, which is true and not the point.

### 5. Token stacking — makers and doublers

*At the table:* Krenko under Parallel Lives, Doubling Season or Anointed Procession; each
activation doubles twice. Not infinite; exponential, and the reason a token deck ends games.

*Characteristic:* one product, multiplied by every doubler on the board.

*Signature:* `produces:token` × `multiplies:token`. Fully visible today: the graph already
draws the *Makes → multiplies* edge (Krenko → Parallel Lives) and the ladder rings Parallel
Lives' multiplier chip.

### 6. Trigger stacking — the doublers of events

*At the table:* Panharmonicon doubles every ETB; Teysa doubles death triggers; Isshin doubles
attack triggers.

*Signature:* `multiplies:creature-etb|creature-dies|attack|combat-begin|trigger` paired with
any card that `causes` the event. Visible today (the generic `trigger` doubler pairs with any
card that has a trigger, and is scored weakest for it).

### 7. Drain-per-trigger — the payoff that makes any loop a kill

*At the table:* Purphoros, Impact Tremors, Blood Artist, Zulaport Cutthroat, Corpse Knight.

*Characteristic:* listens for the event a loop produces and converts each occurrence into
life loss at every opponent. Not a loop; the exhaust pipe every loop needs.

*Signature:* `triggers:creature-etb|creature-dies|sacrifice|cast-spell` ∧ `causes:life-loss`.
Visible today; the ladder rings the trigger chip on all of them.

### 8. Storm and cast-trigger chains

*At the table:* rituals into a storm spell; Aetherflux Reservoir counting casts; Birgi or
Storm-Kiln Artist paying for the next spell.

*Characteristic:* each spell cast produces the mana (or the cards) for the next; a counter of
casts is the payoff.

*Signature:* `triggers:cast-instant-sorcery|cast-spell` ∧ (`produces:mana|treasure|card`) +
`mechanics:storm` (a Scryfall keyword, so already in `mechanics`) + ✗`roles:cost-reduction`.
Partly visible today; cost reduction is the missing edge.

### 9. Extra combats and extra turns

*At the table:* Aggravated Assault + Bear Umbra or Sword of Feast and Famine (untap lands on
combat damage); Time Warp + Eternal Witness + a blink or bounce loop.

*Characteristic:* an effect that adds a phase or a turn, and a way to pay for it again inside
the phase or turn it adds.

*Signature:* `multiplies:combat-begin` (additional combat phase is already read as this) +
✗`roles:untap` on lands; ✗`roles:extra-turn` + `roles:recursion`. The bracket flag for extra
turns exists on the deck page's reading; the card-level term does not.

### 10. Counter stacking and proliferate

*At the table:* Hardened Scales, Branching Evolution, proliferate under Atraxa.

*Signature:* `produces:counter` × `multiplies:counter` (proliferate is read as a counter
multiplier) + `triggers:counter-placed` payoffs. Visible today.

### 11. Draw–damage cycles

*At the table:* Niv-Mizzet, Parun with Curiosity or Ophidian Eye: draw → damage → draw.

*Characteristic:* two cards, each causing what the other triggers on.

*Signature:* A `triggers:draw-card` `causes:life-loss`; B `triggers:life-loss` `causes:draw-card`.
A two-node `causes → triggers` cycle, and the one infinite shape the graph's existing edges
close on their own. It is the acceptance case for the cycle finder: if PR C cannot find this
one, nothing else matters.

## What the vocabulary needs (PR B — shipped; the table is the specification it was built to)

| Term | Kind | Reads | Why |
|---|---|---|---|
| `untap` | role | "untap target/another/all … (creature\|permanent\|land)", "untap equipped creature", "untap it" on a trigger | patterns 1, 3, 4, 9 |
| `tap-ability` | mechanic | text contains `{T}:` on a nonland | pattern 1 (the thing an untapper untaps) |
| `copy` | role | "create a token that's a copy of", "copy target" | pattern 4 |
| `blink` | role | "exile target … then return it/that card to the battlefield", repeatable (not a one-shot instant unless it is the loop's cost) | pattern 3 |
| `counter-removal` | role | "remove a -1/-1 counter", "counters can't be put on" | pattern 2 |
| `extra-turn` | role | "take an extra turn" | pattern 9 |
| `cost-reduction` | role | "cost {N} less to cast" | pattern 8 |
| `persist`, `undying`, `storm`, `cascade` | mechanics | Scryfall keywords — confirm they survive the bake into `mechanics` | 2, 8 |

Each is a pattern in `card-classify.js` (`ROLE_PATTERNS`), re-derived over the cached rules
text by `node tools/graph-amplifiers.mjs --all` and pinned in `tests/card-classify.mjs` against
the named cards above and against the cards that must *not* carry them (Sol Ring, Winter Orb,
Clone, Banishing Light, Blasphemous Act's self-discount, the hatchlings' self-counter-removal).
The Primary Purpose ladder gained `untap`, `copy` and `blink` between *Multiplier* and *Team
quality*, so Thornbite Staff rings untap and Kiki-Jiki rings copy. `persist`, `undying`,
`storm` and `cascade` do arrive in `mechanics` from Scryfall's keywords.

## The detection rule (PR C)

Within a deck's card set (or the focused card's neighbourhood), look for directed cycles of
length 2–4 over these edges: `causes → triggers`, `produces → requires`, `untap → tap-ability`,
`copy → creature-etb`, `blink → creature-etb`. Keep a cycle when every activation cost on it is
covered by a product on it (mana from `produces:mana`, a body from `produces:token`, a death
from `sac-outlet`). Attach payoffs: nodes with `triggers` in the cycle's events that
`causes:life-loss` or produce cards, tokens or mana. Draw the cycle as **loop edges** (the
strongest kind, above *Causes → triggers*), label each edge with the source card's Primary
Purpose, and let the depth gauge's **loop mode** walk only loop and payoff edges: depth 1 the
cards that close a cycle with the commander, depth 2 the cards that close one with those,
depth 3 the payoffs. Ownership stays on the node (owned, ordered, not owned), so a loop with
one missing piece reads as one missing piece.

Acceptance, on the committed live state: D6 depth 1 = Thornbite Staff (and Kiki-Jiki once
added); depth 2 = Goblin Bombardment, Skirk Prospector; depth 3 = Purphoros, Impact Tremors,
Shared Animosity (and Coat of Arms once added). Sol Ring, Arcane Signet and every basic land
never appear in loop mode. Niv-Mizzet + Curiosity is found as a two-node cycle anywhere both
are on the canvas.
