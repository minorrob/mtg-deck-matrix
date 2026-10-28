# What still plays differently from a physical table (2026-10-21)

Rob, 2026-10-21: *"This game is extremely deterministic in the functionality and specificity of what cards do, and the
combinations of 100 cards out of 35,000+ creates a hyper complex and interesting data architecture and interaction
project. We can't skip on any part."* This is the full list of what does not yet play as it would at a table of people:
cards the table refuses, cards that play differently, choices the engine makes for a player, and checks that step around
a card instead of proving it. It is the work list. An item leaves it when the behavior is correct, never when a check
stops looking at it.

**The words, as Rob uses them** (also in AGENTS.md's spirit, "a test that cannot fail is a comment"):
- **Fix:** the card or rule now behaves as at a physical table, proved by scenarios or a suite.
- **Ignore** (or skip, workaround): a card, case or check is excluded, retargeted or loosened while the behavior stays
  wrong or unproven. An ignore is always named as one, and stays on this list.

**State:** main `1d385054` (library load lanes L2, L3, L4 and L6 merged), plus `claude/engine-sentence-paragraphs` (the
Gemstone Caverns item in section 1). Open: L1 (#831), L5 (#829); the candidate review (lane 7) never ran.

**Sources:** the bodies and comments of all 832 pull requests; the repository's documents (`docs/ACTIVE.md`, the
handoffs, `docs/engine/**`, the lane files); the engine's code and suites; Linear. Each line names where it was recorded.
"Checked" marks the items read again in the code for this list; the rest are as recorded and not reproduced in a game.

## 1. This week's two ignores, and what became of them

| Item | What was done | Now |
| --- | --- | --- |
| Gemstone Caverns in `engine-compile`'s held-out sample | #830 (`cc895e5f`) excluded cards the sentence library writes half an ability of. **An ignore.** | **Fixed** in `claude/engine-sentence-paragraphs`: a paragraph is one ability (CR 113.2c), so a paragraph the library knows only in part goes to the writer whole (`game/engine/cards/sentences.mjs`, `partialTranslate`). The exclusion is removed; Gemstone Caverns is sampled again and passes. The card itself always played right at the table (its scenario "With a luck counter, instead one mana of any color -- and no {C}"); what was wrong was how the compiler learns a card like it. |
| `tests/card-waves.mjs` on Windows | Left failing in #830 as "Windows path separators only". | **Fixed** in the same branch: the test compares where each file landed in "/" whatever the system's separator. |
| Black Knight in `tests/card-compiler.mjs` | Its example of a vetoed card became Vodalian Zombie once L4 defined Black Knight. The test's subject changed; the veto is not fixed. | **Open.** Calibration charges Goblin Piledriver's failed attack-trigger template to every template the card used, so "protection from COLOR" is distrusted and **18 cards are vetoed** (Vodalian Zombie and 17 others; `docs/engine/card-compiler-2026-10-19.md`:30). Fix: charge a failure to the template that failed, or fix Goblin Piledriver's attack template. |

## 2. Rob's seven live decks: cards the table refuses on main today (22)

| Card | Deck | Why | Where the work is |
| --- | --- | --- | --- |
| Grist, the Hunger Tide | D1 | "repeat this process"; a static that works off the battlefield (CR 113.6c) | built in #831 (open) |
| Oath of Teferi | D1 | loyalty abilities twice a turn; a delayed return | #831 |
| Ajani Steadfast | D1 | emblems (CR 114); "prevent all but 1" | #831 |
| Ajani, the Greathearted | D1 | a loyalty counter on each other planeswalker | #831 |
| Carth the Lion | D1 | an extra [+1] on loyalty costs (CR 606) | #831 |
| Garruk Relentless | D1 | a planeswalker that transforms | #831 |
| Interplanar Beacon | D1 | two different colors, for planeswalker spells only | #831 |
| Mordenkainen | D1 | exchange hand and library (CR 701.12d); emblem | #831 |
| Teferi, Hero of Dominaria | D1 | emblem; delayed untap | #831 |
| The Wandering Emperor | D1 | loyalty abilities at flash timing the turn she entered | #831 |
| Vraska, Relic Seeker | D1 | "life total becomes 1" | #831 |
| Way of the Mentor | D1 | loyalty counters on gaining life | #831 |
| Teferi, Time Raveler | D7 | opponents cast only at sorcery timing (CR 307.5); sorceries with flash | #831 |
| **Nethroi, Apex of Death** | D4 | **mutate (CR 702.140, 721): merged permanents and the "mutates" trigger; stopped, not built** | no lane |
| **Boromir, Warden of the Tower** | D7 | **"the Ring tempts you" (CR 701.54): the Ring emblem, the Ring-bearer and its four abilities; stopped** | no lane |
| Plumb the Forbidden | D5 | "sacrifice one or more" as an additional cost, and its reflexive copy trigger | built in #829 (open) |
| Ruthless Lawbringer | D5 | a reflexive "when you do" after an optional sacrifice | #829 |
| Wall of Shards | D4 | cumulative upkeep paid by an opponent gaining 1 life | #829 |
| Dark-Dweller Oracle | D6 | exile the top card, play it this turn | #829 |
| Blossoming Defense | D3 | a compiler candidate: playtest tables only, never reviewed | the candidate review (never ran) |
| Goblin Sledder | D6 | the same | the candidate review |
| Absorb | D7 | the same | the candidate review |

All 449 design-deck cards are final, both design commanders (Kaalia, Kynaios) and D7's Queza among them. Load Live still
reads the 9-30 Master; moving it to the 10-21 library is ROB-186 (Rob's call).

## 3. Rob's library outside the decks: not playable on main (25)

- Waiting on #831: Hedron-Field Purists (level up), Stingerquill Voxmancer // Vicious Verse, Woodwork Prodigy // Soul
  Tether (prepare). Teferi, Mage of Zhalfir needs #831's sorcery-timing rule, then its own definition.
- Waiting on #829: Acrobatic Cheerleader, Blacksnag Buzzard (plot, CR 702.170), Zimone, Bear Trap, Boilerbilges Ripper,
  Fear of Immobility, Gold Rush, Hovel Hurler, Ruric Thar, Sunbond, Tenured Tethermage, Verdant Kraken.
- **Cunning Wish, Extrapolate the Impossible:** cards from outside the game (CR 400.11); not built. ACTIVE.md says a wish
  "does nothing in Commander", the L2 lane that it waits on the construct; Rob's ruling decides which.
- **Bludgeon Brawl:** an equip cost counted from the artifact's own mana value; the Equipment subtype granted in layer 4,
  its set fixed as it applies (CR 613.6); a granted +X/+0 per artifact; the unattach when it leaves (CR 704.5n).
- **Ichor Elixir:** planar dice (CR 901.9, Planechase). Rob backlogged it (ROB-187).
- Candidates never reviewed: Ankle Biter, Hydroblast, Pyroclasm, Scarblade Scout, Voracious Varmint.

## 4. Defined, but plays differently from a physical table

| Card or cards | What differs | Recorded |
| --- | --- | --- |
| Urza's Saga | III searches "mana value 1 or less", not "mana cost {0} or {1}": a colored one-drop artifact (Esper Sentinel) is found, and should not be. **Checked.** | #547 |
| Elspeth, Sun's Champion | The -7 emblem is two lasting effects with no emblem object: the board shows no emblem. **Checked.** | #637 |
| Token copies of a shock land | Enter untapped for free: "unless you pay 2 life" is never asked of a token. **Checked** (`permanents.mjs`). | code |
| Innocuous Rat (manifest dread) | CR 701.40f: a chosen card that can't enter should go to the graveyard; not handled | #828 |
| Plumb the Forbidden | No copies if it leaves the stack before its reflexive trigger resolves; last known information unsettled | #829 |
| Reverberate, Dualcaster Mage, Double Vision, Flare of Duplication, Narset's Reversal, Thousand-Year Storm, Jin-Gitaxias, Echoes of Eternity | A copy of an "up to N targets" spell keeps the original targets; "you may choose new targets" is not offered | `asking.mjs`:1559 |
| Any protection from a color | Damage from a source that has left the battlefield is treated as from no source, so protection does not stop it (a dead red creature's trigger) | `asking.mjs`:1693 |
| Wirewood Symbiote, Quirion Ranger; any cost or effect returning a commander to hand from the battlefield or the library's top | The command-zone choice (CR 903.9b) is not offered | `commander.mjs`:43 |
| Torbran, Fiery Emancipation and other damage doublers | Where nobody can be asked, the order that deals the least is applied | #533, #579, #582 |
| Metallic Mimic, Mirrormade, Sculpting Steel | Type chosen after it enters; a copy of a copy not asked again; Mimic misses the copied type | #543, #546 |
| Station cards (Wurmwall Sweeper) | N+ abilities checked again as they resolve, where by the rules they would still resolve | #545 |
| Song of the Dryads; Sagas under ability loss | Layer-4 timing of the lost abilities (CR 305.7), printed chapters, an ability lost as it enters (614.12) | #717 |
| Incubator tokens | Their copies are single-faced | #721 |
| Social Snub | A copy reads last known information instead of copying the spell | #721 |
| Winter; Narset | Winter's prompt says "a permanent"; a draw-two cost is not refused under Narset | #722 |
| Monarch cards | The board does not show the monarch | #721 |
| Two limited "you may play" permissions on one card | Merged, and one picked for the player | #722 |
| Alms Collector with dredge | Which replacement applies first is not asked (CR 616.1) | handoff 10-12 |
| "Each player draws" effects | Drawn in seat order, not from the active player | handoff 10-12 |
| Delve with {X}; dice | Delve not offered for an X spell; no die modifiers, no "whenever you roll" trigger | handoff 10-12 |
| Cards cast face down from exile (Gandalf) | CR 708.4 and unlookable face-down cards (406.4) are not built | #707 |
| Casts from exile, or with alternative costs | Offered only with the mana already in the pool | #628, #657 |
| {X} cards, or cards with an additional cost, cast by an effect's "pay mana" | Not offered | `asking.mjs`:2143 |
| "Up to N targets" spells cast free or by an effect | Left out of what may be cast | `actions.mjs`:2053 |
| Tokens and copies of prepare cards | Never prepared | `attributes.mjs`:23 |
| Convoke with Phyrexian or {2/W} symbols | Left to the mana pool | #619 |
| Planeswalkers in combat | Trample over a planeswalker (CR 702.19c) not built | #597 |
| Vinebred Brawler, Safewright Cavalry | Must-be-blocked and one-blocker rules proved by suites, never yet at a real table | #830 |
| Sphinx of the Second Sun | A judgment call on CR 103.8a | #724 |
| Land drops | A person may play a land in any step of their own turn: a house rule Rob chose, not a gap | `5e9167fa` |

## 5. Choices the engine makes for the player

AGENTS.md: *"any decisions that takes place within the game the players should be given that option."* Each of these
is decided in code today.

| Moment | What is decided | Recorded |
| --- | --- | --- |
| An attacker with trample blocked by one creature | Exactly lethal to the blocker, the rest to the player; the attacker's controller may assign more to the blocker (CR 702.19b) and is not asked. **Checked.** | `combat.mjs`:616, 719 |
| Two damage replacements where nobody can be asked | The order that deals the least | `replacement.mjs`:33, 489 |
| Counter replacements on entering, as a cost, from infect or proliferate (Hardened Scales with a doubler) | The most if the affected player puts them, the fewest if another does | `statics.mjs`:735 |
| Token replacements outside a resolution | The order that makes the most tokens | `statics.mjs`:484 |
| Destruction replacements in nested effects | Regeneration first, then umbra armor in the order attached | `zones.mjs`:820 |
| A token put onto the battlefield attacking, outside a resolution | It attacks the first player in turn order | `permanents.mjs`:245 |
| Entering replacements | Applied in the order found | `replacement.mjs`:492 |
| Zone-change replacements (Liesa) | The question is raised but the move does not wait for it (no two such effects defined yet) | `replacement.mjs`:35 |
| Ways to pay | Only the first 24 tap choices and 12 payment choices are offered | `actions.mjs`:1501, `mana.mjs`:267 |
| Draw replacements where nobody can be asked | The first player in turn order | `zones.mjs`:637 |

## 6. AI seats beside people

Not rules gaps, but a card the AI never uses plays differently at a table of four. The house AI never sacrifices for
Plumb the Forbidden, never plots (Blacksnag Buzzard), never attacks planeswalkers, and does not value the monarch
(#829, #597, #721).

## 7. Checks that step around a card (ignores in suites and tools)

| Check | What it skips | Effect in play |
| --- | --- | --- |
| `engine-compile` smoke games | Condemn, Mirrodin Avenged, Precise Redaction, Cloud's Limit Break, Eriette's Lullaby, Flourishing Grapple, Rebuff the Wicked, Explosive Derailment, Proft are named as cards a smoke game cannot cast | none: each card's own scenarios prove it |
| Compiler candidates' smoke games | `ok` even when the card was never played: 8 never played (Argivian Restoration, Artifact Blast, Blue Elemental Blast, Devout Decree, Flashfreeze, Halt Order, Refurbish, You Are Already Dead); 130 resolved nothing; CI replays 1 in 97 | candidates at playtest tables, untested |
| Calibration | A template no card was held out on is trusted at one card: 1,041 of 2,643 candidates rest on one | candidates may misplay |
| Candidates | 2,643 compiler candidates and 25 provisional cards have no scenarios of their own; the 25 were never read back by a second model; promotion would write the observed smoke result as the card's scenario | playtest tables only, labeled |
| `engine-room-games` | Seeds 3 and 5 left out; the deal frozen at the definitions of `e243ccde`; refused pilot answers logged, not failed | later cards never dealt there |
| `engine-x11-leave-questions` | Pilot answers the rules refuse are replaced, not failed | a refused answer goes unnoticed |
| Coverage | 7 partial constructs counted as built ("up to X" targets, durations past end of turn, UnlessCost, Count, Valid, ThisTurnCast, OptionalDecider): `coverage.md`'s percentages are high | the measure, not play |
| Scenario runner | `settle` takes the first legal answer (225 steps, 138 cards); `optional` skips a move not offered without saying so (6 cards); `targets: "any"` takes the first aim (11 cards) | those steps prove less than they read |
| `tools/fuzz-live.mjs` | A definition that throws is left out silently; commanders are legendary creatures only | those cards are never fuzzed |
| Six; Ichor Elixir | Suites assert they do not play (locks on stopped cards) | to retarget once built |
| `data/engine/support.json` | Every row "unsupported" since 10-04; the frozen local runtime refuses every nonbasic card | the cloud table reads `definitions.mjs` |

## 8. Rules not built, and the cards they hold back

| Rule or construct | Cards |
| --- | --- |
| Mutate, merged permanents (CR 702.140, 721) | Nethroi, Apex of Death (D4) |
| The Ring tempts you (CR 701.54) | Boromir, Warden of the Tower (D7); it alone holds back 8 of the 11 most-played cards that need it |
| Cards from outside the game (CR 400.11) | Cunning Wish, Extrapolate the Impossible |
| Emblems (CR 114), loyalty twice, opponents at sorcery timing | built in #831 (open): Teferi Hero, Ajani Steadfast, Mordenkainen, Oath of Teferi, both Teferis; Daretti; Elspeth's emblem object |
| Equip {X} from the card itself; a layer-4 Equipment grant | Bludgeon Brawl |
| Planar dice (CR 901.9) | Ichor Elixir, Fractured Powerstone (ROB-187) |
| Blocker-side requirements: "must block", "can block an additional creature", "can't block alone", battles (ROB-149) | none named; #830 built only the attacker side |
| "Instead" of entering, on every route to the battlefield | Mox Diamond |
| Counters divided at activation (CR 601.2d) | The Earth Crystal |
| A random number; a cast by another player mid-resolution; a random order to the bottom | Tibalt's Trickery, Endurance |
| A replacement on every route to a graveyard | Dauthi Voidwalker, Valgavoth |
| "Cards drawn this turn", pay 4 life or put each back | Sylvan Library |
| Exert (CR 701.43); mana that gives haste | Arena of Glory |
| Retrace; dash; boast twice | Six; Ragavan; Birgi |
| The remaining forms of "the cards an effect moved" | Gix, The Legend of Kyoshi, Gisa |
| Draw replacements | Notion Thief, Abundance, Underrealm Lich |
| "Exiled with"; mana of any type; ability cost reduction | Nightveil Specter, Dire Fleet Daredevil, Forensic Gadgeteer |
| The devotion type change | Purphoros, Bronze-Blooded |
| Shield counters (CR 122.1c) | Sanctuary Warden |
| Convoke with {X} | Chord of Calling |
| The spell's own cast trigger | Nulldrifter |
| "Counted, not proven" in the catalog | The Lord of Pain, Decree of Pain, Dismantling Wave |
| Megamorph; decayed; a "discard X cards" cost | Jadar (decayed); others not named |
| Remembered objects (the most-played construct missing: 62 cards), entered/died this turn, ChoosePlayer, Discover, Imprint, Cascade, "your life total", Wither, FlipCoin | counts in `docs/engine/catalog.md` and `coverage.md`; library blockers: RememberObjects 66, RememberChanged 51, MayPlay 30 |
| Costs that tap, sacrifice or exile N of a type | Captivating Vampire, Kellogg, Piper of the Swarm, Sephara, Shimmer Dragon, Lathril, Grim Hireling, Drivnod |
| "Pay {N}; if you do" | Hellkite Charger, Dawn of Hope, Hashaton |
| Granted triggers and abilities | Dionus, Clavileño, Power Fist, Zombie Master, Svyelun, The Odd Acorn Gang, Bello, Ygra |
| Stack and copy constructs | Strionic Resonator, Weaver of Harmony, Zada, Pyromancer's Goggles, Arcane Bombardment, Electroduplicate, Hydroid Krasis |
| Modal and targeting forms | Golgari Charm, Fiery Confluence, Will of the Mardu, Will of the Jeskai, Not of This World, Nasty End, Monument to Endurance |
| Counted or remembered amounts | Dina, Susur Secundi, Steel Hellkite, Twilight Diviner, Chandra's Incinerator, Dark Deal, Malcolm, Grab the Prize, Gishath, Riveteers Ascendancy |
| Combat taxes and blocks | Odric, Archangel of Tithes, Norn's Annex, Summon: Yojimbo, Sting, Mjölnir |
| Restricted mana; enter-as choices; myriad | Food Chain, Klauth, Elementalist's Palette, Inga, Esika, Glasspool Mimic, Auton Soldier, Master Biomancer, Brudiclad |
| Enchant player; eminence; Rooms; "unless" sacrifice or discard; others | Curse of Opulence, Paradox Haze, The Ur-Dragon, Dollmaker's Shop, Blast Zone, The Goose Mother, Fandaniel, Painful Quandary, Brazen Borrower, Overmaster, Yuna, Eluge, Lignify, Kenrith's Transformation, Full Throttle, All-Out Assault, Wild Magic Surge, Songbirds' Blessing, Kastral, Flare of Fortitude, Invigorate, Fecund Greenshell, Breach the Multiverse, Cloud, Virtue of Knowledge, Ghyrson Starn |

The groups from the M4 batches (#499 to #555) are as those PRs recorded them; whether a later construct now covers a
card was not re-checked, and none of those cards is defined on main.

## 9. Recorded in play, and fixed since (for the record)

Rampant Growth and the land searches finding nothing (Rob's playtest note 6); Freyalise's token's mana ability on the
stack (#703); Foggy Swamp Vinebender with Path of Ancestry (#710); amass with Braids (#711); control gained for good
breaking the room's save; Mystic Forge with disguise cards; Song of the Dryads on a lord (fixed after it was wrong on a
quarter of targets); Canopy Gargantuan's trigger after its source left (ROB-175); Lethal Scheme through Bolas's Citadel
(ROB-177); the AI choosing nothing on every "up to" (ROB-164); same-named Goblins in a Krenko swarm (ROB-168); X spells
needing lands tapped by hand (#819 for new matches; ROB-74's payment draft still open).

**Never found:** the card in Luke's game that did one effect and not its "draw two" (ROB-17, ROB-70).
