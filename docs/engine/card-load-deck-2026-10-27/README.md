# Card load, 2026-10-27: Rob's Orzhov deck

Rob, 2026-10-27: *"There are 25 cards not loaded into the engine in this set of cards. Identify those 25, then load them into the
engine so this deck becomes playable."* The list is a 100-card Commander deck (white and black: Zoraline, Cosmos Caller; the Bats,
Blood tokens and life-gain engines). Main was `3dd4cc05` (6,405 definitions, after the precons load).

## The 25 the engine lacked

Found by reading each distinct name of the list against the definitions in `game/engine/cards/` (the card's `identity.name`): 68
distinct nonbasic names, 43 already written, 25 not. None of the 25 was a compiler candidate (`data/engine/candidates.json`), so each is
written by hand, with scenarios.

| Card | What it needed |
| --- | --- |
| Agadeem's Awakening // Agadeem, the Undercrypt | A choice of "any number of target creature cards that each have a different mana value X or less"; the land side is a shock land |
| Blood Money | Destroy all creatures, a tapped Treasure for each nontoken one |
| Darkstar Augur | Offspring {B}, flying, a Dark Confidant upkeep |
| Deep Gnome Terramancer | A land entering under an opponent's control **without being played** |
| Defiler of Faith | **Paying 2 life for {W} less** on white permanent spells |
| Dusk Rose Reliquary | A sacrifice as an additional cost of a permanent, ward {2}, an exile until it leaves |
| Dwarven Priest | Life for each creature you control |
| Essence Channeler | Flying and vigilance after a life loss; counters moved to a creature when it dies |
| Gix, Yawgmoth Praetor | "Its controller may pay 1 life" for a card; **discard X cards** as a cost, an opponent's cards played free |
| Kamber, the Plunderer | Partner with Laurine; the **Blood token** |
| Key to the City | Unblockable for a discard; "whenever this becomes untapped", {2} to draw |
| Krav, the Unredeemed | Partner with Regna; sacrifice X creatures |
| Lithoform Engine | Copying an ability, an instant or sorcery, a permanent spell |
| Malakir Familiar | Life gained pumps it |
| Moonstone Eulogist | The Blood token; sacrificing an artifact |
| Nighthawk Scavenger | Power from the card types in opponents' graveyards |
| Orzhov Locket | A {W} or {B} mana ability; four hybrid, sacrifice, draw two |
| Pilgrim of the Ages | Fetch a basic Plains; return from the graveyard for {6} |
| Ruthless Knave | Sacrifice a creature for Treasures; sacrifice three Treasures to draw |
| Sanguine Evangelist | Battle cry; a Bat when it enters or dies |
| Taborax, Hope's Demise | Lifelink with five counters; a Cleric's death offers a card for 1 life |
| Tainted Adversary | "Pay {2}{B} any number of times", and the decayed Zombies |
| Traveling Minister | A sorcery-speed tap for +1/+0 and a life |
| Vanishing Verse | Exile target **monocolored** permanent |
| Zoraline, Cosmos Caller | Bats attacking gain life; a reflexive return with a finality counter |

## What was built (the Claude · Engine lane)

- **`monocolored`**, a selector key (`script/filter.mjs`; CR 105.2a): exactly one color, through the layers.
- **A Blood token** and **a decayed Zombie token** (`script/effects/permanents.mjs`, `PREDEFINED_TOKENS`; CR 111.10, 702.147): the
  Zombie's two abilities (it can't block; sacrificed at end of combat when it attacks) written out as a token's are.
- **"Without being played"** (`rules/actions.mjs` stamps a land play's arrival, `rules/trigger.mjs` reads `played`, `cards/index.mjs`
  carries it): a played land and one put onto the battlefield are told apart (CR 305.1).
- **`life-for-less`**, a static rule (`rules/statics.mjs`, `lifeForLess`; `rules/actions.mjs`, castOffers and castCost; CR 601.2b,
  601.2f): each such permission is a choice of the caster's, a variant of the cast of its own with the life added and the colored mana
  taken off (`{-W}` in the offer's `extraMana`). Only the colored symbol comes off, never generic mana.
- **"Discard X cards"** as an activated ability's cost (`rules/actions.mjs`): X announced from none to the cards in hand, and X of 0 a
  single way to pay.
- **`differentManaValues`**, a target key (`script/bind.mjs`, `script/schema.mjs`): the counted target's options carry their mana
  value and are capped at one apiece (`capped`, which the controller and the pilots already hold every answerer to), refused with what
  to do.

## Ignores, named

- **Deep Gnome Terramancer** ("Do this only once each turn"): the effect is gated on the ability's first resolution of the turn
  (`firstResolution`), so a player who declines the first time cannot do it on a second landfall the same turn. A table lets them.
- **Defiler of Faith** reduces a colored symbol of the printed cost; a white spell whose white is only a hybrid symbol ({W/B}) is not
  reduced.
- **Tainted Adversary's** "decayed" is the token's two abilities, not a keyword other cards can grant.

## Proof

Personal-HP, this branch:

- `node --stack-size=4000 game/tools/batch/check-cards.mjs`: 6,430 definitions, 0 failed.
- `tests/engine-deck-load-1027.mjs` (new), `tests/engine-cards.mjs`, `tests/engine-equip.mjs`, `tests/engine-catalog.mjs`,
  `tests/data-integrity.mjs`, the other 400 `tests/engine-*.mjs`, `card-*`, `table-candidates`, `table-basics`, `sentence-*`, `room-*`
  suites.
- `game/tools/batch/breaks-deck-load-1027.py`: 20 breaks, `missed: []`.
- Two other lanes' breaks were re-anchored where this load moved their lines and proved caught again:
  `breaks-train-e-f4.py` ("forEach: an ability target may say it") and `breaks-wave4a-h1.py` ("permission's cost: asked").
- **Not proven:** a game at a real table with this deck.
