# Card load, 2026-10-24: Rob's four priority lists

Rob, 2026-10-24: *"Here are a few lists of cards we need to prioritize loading into the engine. Review what needs to be
loaded, then begin the engine updates to make all of these cards playable."*

The paste holds four deck lists, each ending with its commander. Main was `abdf77a6` (6,155 definitions, after PR #855).

## The review

| List | Commander | Cards | Playable now | To write |
| --- | --- | ---: | ---: | ---: |
| 1, flicker (W/U) | Niko, Light of Hope | 85 | 63 | 22 |
| 2, Alliance (G/W/U) | Galadriel, Light of Valinor | 50 | 39 | 11 |
| 3, the Shire (W/B/G) | Frodo, Adventurous Hobbit + Sam, Loyal Attendant | 78 | 40 | 38 |
| 4, counters (G/W/U) | Yuna, Grand Summoner; Tidus, Yuna's Guardian | 74 | 45 | 29 |
| **All, each card once** | | **287** | **187** | **100** |

Duplicate basics across lists are counted once. **No list's commander is playable yet** (Tidus is, Yuna is not), so no
deck plays until its commander and its other unwritten cards are in.

- **Three names are flavor names**, not unknown cards: Herugrim, Sword of Rohan is Sword of Hearth and Home; Lifelong
  Friendship is Eladamri's Call; Wild Rose Rebellion is Counterspell (`data/flavor-names.json`). The deck importer
  resolves them (`card-resolve.js`) and all three are defined.
- **None of the 100 is a compiler candidate.** The compiler (`card-compiler.mjs`, run on these cards alone) finds a
  sentence no defined card writes in 94 of them, 5 in another layout (Aang, Swift Savior and Hengegate Pathway are
  double-faced; Hunter's Talent is a Class; Of Herbs and Stewed Rabbit and the three Summon: cards are Sagas), and
  Pristine Talisman blocked on a compile problem. So each is written by hand.
- **Most need no new rule.** The definitions already use Food, explore, proliferate, shield and stun counters, phasing,
  spree, gift, impending, warp, Eerie and Rooms, Sagas (Summon: Fenrir), Classes, Pathways, hideaway, landcycling,
  affinity, partner with, the Ring, d20 rolls, trigger doubling (Panharmonicon), exile-until and forestwalk.
- **The rules not built yet**, as far as the definitions show (each lane confirms before building):

| Rule | Cards | Lane |
| --- | --- | --- |
| Airbend (exile; its owner may cast it for {2}), waterbend, transform | Airbender Ascension, Avatar's Wrath, Aang, Swift Savior | P1 |
| Myriad (stopped on 10-24) | Battle Angels of Tyr | P1 |
| Harness and the ∞ ability | The Mind Stone | P1 |
| An additional end step | Y'shtola Rhul | P1 |
| "Leave the battlefield without dying" | Dour Port-Mage | P1 |
| Opponents' entering triggers suppressed | Elesh Norn, Mother of Machines | P1 |
| The second card drawn, second spell cast; an extra turn skipped (stopped on 10-23) | Trouble in Pairs | P1 |
| Devour Food | Feasting Hobbit | P2 |
| Sacrifice X as a cost (stopped on 10-23); the token-plus-Squirrels replacement | Chatterfang, Squirrel General | P2 |
| Descend | Canonized in Blood | P2 |
| Damage dealt this game by a creature with a name | Gollum, Obsessed Stalker | P2 |
| Alliance's "choose one that hasn't been chosen this turn" | Gala Greeters, Galadriel, Light of Valinor | P3 |
| Monstrosity X counted at resolution; moving counters between permanents | Maester Seymour, Resourceful Defense, Rikku | P3 |

## The load: three lanes

Each lane is a theme, so no two build the same rule. Each runs on its own branch from this one and opens a draft PR into it;
this branch integrates the three and goes to `main` as one PR.

| Lane | File | Cards | Branch |
| --- | --- | ---: | --- |
| P1 blink | `lane-P1-blink.json` | 29 | `claude/engine-roblists-p1-blink` |
| P2 Food | `lane-P2-food.json` | 38 | `claude/engine-roblists-p2-food` |
| P3 counters | `lane-P3-counters.json` | 33 | `claude/engine-roblists-p3-counters` |

`BRIEF.md` is every lane's brief. Where each card stands: `node tools/library-engine-index.mjs --check-lane <lane file>`.

## The result: all 100 written, every list playable

| Lane | PR | Final | Scenarios | Stopped |
| --- | --- | ---: | ---: | --- |
| P1 blink | #861 | 29 of 29 | 91 | none |
| P2 Food | #860 | 38 of 38 | 141 | none |
| P3 counters | #859 | 33 of 33 | 89 | none |

**6,155 definitions became 6,255.** All 287 cards of the four lists are final: 284 by name, the other 3 by their flavor
names. Each lane's PR body lists its engine changes; in short:

- **P1:** airbend as an owner's {2} alternative cost (a card with no mana cost too); waterbend and transforming Aang;
  myriad; harness and ∞; an additional end step; copies until the next end step; "leave without dying"; spells cast from
  anywhere but a hand, and opponents barred from that; Elesh Norn's suppression; a spell exiling itself; opponents' extra
  turns skipped; Trouble in Pairs' second draw, second spell and two attackers.
- **P2:** devour; sacrifice X as a cost; X reduced by a cost reduction left over (affinity); Sam's Food discount; a
  life-gain adder; descend; a named creature's combat damage this game; the Ring-bearer and tempt count; playing a linked
  exiled card free; "commander creatures you own"; skulk. The sentence library no longer reads a permanent's sentence as a
  spell (CR 113.3a).
- **P3:** shield counters (CR 122.1c; they had not been built); Alliance's unchosen modes; "choose one at random"; moving
  any number of counters; monstrosity X counted at resolution; an attack tax until your next turn; counter triggers once
  per creature per action; a copy entering with X more counters.
- **The integration:** fidelity no longer lets an ability inside a longer sentence claim the rest of it (Gandalf the
  White's Flash had claimed "... as though they had flash"; an all-reminder line, Dryad Arbor's, still is claimed by the
  ability inside it, CR 207.2a). `engine-compile`'s held-out checks no longer depend on where the sample lands: its
  miscount check samples 40 cards and claims a catch among those it changed. `card-waves` compares paths with forward
  slashes, so it passes on Windows.

**Ignores** (a card that plays differently from a table in one case, named, not fixed):
- **Entity Tracker, Fear of Sleep Paralysis:** "whenever you fully unlock a Room" is not watched. The engine has no Rooms.
- **Bilbo, Birthday Celebrant beside a life doubler:** +1 then doubling is applied without asking; the order is the
  affected player's (CR 616.1).
- **Feasting Hobbit:** devour's counters go on just after it enters (as riot's do), so an "enters with power N or more"
  trigger would miss them.
- **Lobelia, Defender of Bag End:** its mode is chosen as it resolves, not as it is activated (CR 700.2a), the engine's
  existing rule for modes without targets.

These go on the gameplay-gap list (`docs/engine/gameplay-gaps-2026-10-21.md`, PR #834) when it reaches `main`.

**Follow-up:** the new templates make 58 compiler candidates (from 23), playable only at playtest tables until a wave
reviews them.

**Proof** (Personal-HP, the integrated head):
- `check-cards`: 6,255 definitions, 10,482 scenarios, 0 failed. Definitions, coverage, catalog and the data inventory
  `--check` current.
- 414 suites green: every `tests/engine-*.mjs`, the three lanes' suites, `card-waves`, `card-compiler`,
  `sentence-library`, `table-candidates`, `table-basics`, `table-scenarios`, the `room-*` suites, `data-integrity`,
  `feature-wiring`.
- Breaks: each lane's file `missed: []` (P1 53, P2 58, P3 on its own branch); `breaks-roblists-integration.py` 2 of 2; the
  two P2 breaks re-anchored by the merge caught again; `anchors.py` 3,184 breaks in 151 files, no problems.
