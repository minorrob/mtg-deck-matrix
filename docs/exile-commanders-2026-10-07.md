# Linked-exile commanders, October 7, 2026

`codex/exile-commanders` follows advice PR #672 at `b58b4534`. Main and Train B
remain untouched. The two definitions come from the committed Oracle record;
there are no substitutes or provisional promotions.

## Rules implemented

Quintorius, Loremaster links the noncreature, nonland graveyard card selected at
its controller's end step and creates its 3/2 red-white Spirit. Its activation
pays mana, taps Quintorius and sacrifices a Spirit. The resolved permission
survives its source, expires this turn and casts only the chosen linked card,
without its mana cost but with mandatory additional costs. Its spell goes to
the bottom of its owner's library when it would go from the stack to a graveyard,
including a counter or illegal targets. Other destinations and a permanent that
resolved are unaffected. A commander owner receives their replacement choice;
a saved pending choice resumes without duplicate completion events.

Maralen, Fae Ascendant exiles the targeted opponent's top two cards when it or
another controlled Elf/Faerie enters. Its static permission follows its current
controller and abilities. It permits one qualifying spell each turn, including
an opponent's turn, only from cards linked to that object and exiled this turn.
The current number of Elf/Faerie permanents determines the mana-value limit;
a permanent with both types counts once, including Kindred noncreatures.
A new Maralen object cannot use the old object's links. An Adventure is evaluated
with that spell's characteristics. Normal casting timing remains in force.

The common permission path presents separate offers when costs or riders differ.
It retains the previous ordering of existing zone permissions and caches its
read-only permission inventory only within one derivation question. It does not
cache across actions. Broad MayPlay catalog coverage is still not claimed.

A final regression caught free-cast effects incorrectly offering lands after
support for costless spells was added. The first changed event was a Forest
cast after Darksteel Monolith entered. Lands are now explicitly refused as spells
(CR 305.9); both Monolith and Omniscience have regression checks. No performance
threshold was increased. The held seed returned to 75 turns and 21.2 seconds
in the isolated performance rerun, inside the existing 45-second and CPU gates.
The discarded diagnostic journal/profile runs are not acceptance evidence.

## Validation

- `node tests/engine-exile-commanders.mjs`: 107 targeted checks.
- `NODE=<Node22> python game/tools/batch/breaks.py game/tools/batch/breaks-exile-commanders.py`:
  all 38 intentional faults caught and restored.
- All 242 engine/regression suites passed: `tests/engine-*.mjs`,
  `tests/data-integrity.mjs`, and `tests/feature-wiring.mjs`. This includes the
  1,000-game deterministic replay/hidden-information gate and unchanged room
  performance gates. The final added source-grant assertions also passed.
- D2 browser rerun: two human contexts plus two house pilots, 349 UI actions,
  44 turns, natural win, zero whole-match refusals, reload preserving revision
  and pending choice, 354 protected frames per human. D5 rerun: 377 UI actions,
  33 turns, natural win, zero whole-match refusals and 381 protected frames per
  human; the same reload checks passed. Both runs have 13 assertions.
  Commands: `UAT_CHROME=/usr/bin/chromium REAL_DECKS_REQUIRED=1
  REAL_DECK_ID=D2 node tests/uat/real-deck-game.mjs`, then the same with `D5`.
  These use Node 22.23.3, Playwright 1.56.0 and system Chromium 151.
- 1,658 confirmed definitions, plus 28 provisional definitions checked but not
  seated; 2,760 hand-authored card scenarios. D1 has 18 missing cards and D7 has
  11 unavailable cards. Across the seven committed lists, 49 distinct names
  remain unavailable (48 undefined plus provisional Tegwyll). D2 and D5 stay
  complete; D3 has 9 gaps, D4 has 4, and D6 has 7.

These are cloud-local isolated proofs, not a staged release or the exact October 4
backup on the offline desktop. `docs/cloud-release-gates-2026-10-07.md` records
the separately verified egress, credentials, backup and artifact-transfer gates.
Production Play is an authorized delivery goal; no release switch or deployed
version was changed by this card batch. Paid AI remains unapproved and disabled.
