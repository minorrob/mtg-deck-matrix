# Candidate review, 2026-10-23 (card load step 6)

15 candidates, the most-wanted first. For each: is every ability its sentence, and is what the game showed what the card does? Promote the approved ones with `node game/tools/card-waves.mjs --promote "A,B"`.

## Darkmoss Bridge

**Oracle text:** This land enters tapped. / Indestructible / {T}: Add {B} or {G}.

**Weakest template:** seen on 16 card(s), band 10-19 (100.0% in calibration).

**Templates, and cards that taught them:** `1:this land enters tapped` (Adagia, Windswept Bastion, Airship Engine Room, Arcane Sanctum); `1:indestructible` (Brash Taunter, Darksteel Angel, Darksteel Citadel); `1:{t}: add {b} or {g}` (Bayou, Blooming Marsh, Deathcap Glade)

| Sentence | Ability |
| --- | --- |
| This land enters tapped. | `{"kind":"replacement","watches":{"event":"enters","who":"self"},"change":{"entersTapped":true}}` |
| Indestructible | `{"kind":"keyword","keyword":"indestructible"}` |
| {T}: Add {B} or {G}. | `{"kind":"activated","mana":true,"cost":[{"atom":"{T}"}],"effects":[{"effect":"addMana","choice":[{"B":1},{"G":1}]}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Darkmoss Bridge, Wastes, Wastes
- seat 0 graveyard: empty
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty
- Darkmoss Bridge has Indestructible

## Goldmire Bridge

**Oracle text:** This land enters tapped. / Indestructible / {T}: Add {W} or {B}.

**Weakest template:** seen on 15 card(s), band 10-19 (100.0% in calibration).

**Templates, and cards that taught them:** `1:this land enters tapped` (Adagia, Windswept Bastion, Airship Engine Room, Arcane Sanctum); `1:indestructible` (Brash Taunter, Darksteel Angel, Darksteel Citadel); `1:{t}: add {w} or {b}` (Concealed Courtyard, Forum of Amity, Godless Shrine)

| Sentence | Ability |
| --- | --- |
| This land enters tapped. | `{"kind":"replacement","watches":{"event":"enters","who":"self"},"change":{"entersTapped":true}}` |
| Indestructible | `{"kind":"keyword","keyword":"indestructible"}` |
| {T}: Add {W} or {B}. | `{"kind":"activated","mana":true,"cost":[{"atom":"{T}"}],"effects":[{"effect":"addMana","choice":[{"W":1},{"B":1}]}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Goldmire Bridge, Wastes, Wastes
- seat 0 graveyard: empty
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty
- Goldmire Bridge has Indestructible

## Snow-Covered Plains

**Oracle text:** ({T}: Add {W}.)

**Weakest template:** seen on 13 card(s), band 10-19 (100.0% in calibration).

**Templates, and cards that taught them:** `1:{t}: add {w}` (Abandoned Air Temple, Adagia, Windswept Bastion, Ancient Den)

| Sentence | Ability |
| --- | --- |
| ({T}: Add {W}.) | `{"kind":"activated","mana":true,"cost":[{"atom":"{T}"}],"effects":[{"effect":"addMana","mana":{"W":1}}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Snow-Covered Plains, Wastes, Wastes
- seat 0 graveyard: empty
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty

## Spellbook

**Oracle text:** You have no maximum hand size.

**Weakest template:** seen on 7 card(s), band 5-9 (100.0% in calibration).

**Templates, and cards that taught them:** `1:you have no maximum hand size` (Body of Knowledge, Curiosity Crafter, Decanter of Endless Water)

| Sentence | Ability |
| --- | --- |
| You have no maximum hand size. | `{"kind":"static","rule":"no-maximum-hand-size","affects":{"what":"player","who":"you"}}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Spellbook, Wastes, Wastes
- seat 0 graveyard: empty
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty

## Rumble Arena

**Oracle text:** Vigilance / When this land enters, scry 1. (Look at the top card of your library. You may put it on the bottom.) / {T}: Add {C}. / {1}, {T}: Add one mana of any color.

**Weakest template:** seen on 5 card(s), band 5-9 (100.0% in calibration).

**Templates, and cards that taught them:** `1:vigilance` (Adeline, Resplendent Cathar, Ao, the Dawn Sky, Arcades, the Strategist); `1:when this land enters, scry N` (Temple of Abandon, Temple of Deceit, Temple of Enlightenment); `1:{t}: add {c}` (Academy Ruins, Access Tunnel, Accursed Duneyard); `1:{N}, {t}: add N mana of any color` (Conduit Pylons, Giant's Boulder, Prismatic Lens)

| Sentence | Ability |
| --- | --- |
| Vigilance | `{"kind":"keyword","keyword":"vigilance"}` |
| When this land enters, scry 1. (Look at the top card of your library. You may put it on the bottom.) | `{"kind":"triggered","trigger":{"on":"enters","who":"self"},"effects":[{"effect":"scry","count":1}]}` |
| {T}: Add {C}. | `{"kind":"activated","mana":true,"cost":[{"atom":"{T}"}],"effects":[{"effect":"addMana","mana":{"C":1}}]}` |
| {1}, {T}: Add one mana of any color. | `{"kind":"activated","mana":true,"cost":[{"atom":"mana","cost":"{1}"},{"atom":"{T}"}],"effects":[{"effect":"addMana","anyColor":true}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Rumble Arena, Wastes, Wastes
- seat 0 graveyard: empty
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty
- Rumble Arena has Vigilance

## Scarblade Scout

**Oracle text:** Lifelink / When this creature enters, mill two cards. (Put the top two cards of your library into your graveyard.)

**Weakest template:** seen on 3 card(s), band 2-4 (99.4% in calibration).

**Templates, and cards that taught them:** `1:lifelink` (Abigale, Eloquent First-Year, Aerith Gainsborough, Angel of Indemnity); `1:when this creature enters, mill N cards` (Aftermath Analyst, Dark Matter Manipulator, Platypus-Bear)

| Sentence | Ability |
| --- | --- |
| Lifelink | `{"kind":"keyword","keyword":"lifelink"}` |
| When this creature enters, mill two cards. (Put the top two cards of your library into your graveyard.) | `{"kind":"triggered","trigger":{"on":"enters","who":"self"},"effects":[{"effect":"mill","count":2}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Scarblade Scout, Swamp, Wastes, Wastes, Wastes
- seat 0 graveyard: Wastes, Wastes
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty
- Scarblade Scout has Lifelink

## Overkill

**Oracle text:** Target creature gets -0/-9999 until end of turn.

**Weakest template:** seen on 2 card(s), band 2-4 (99.4% in calibration).

**Templates, and cards that taught them:** `1:target creature gets -N/-N until end of turn` (Last Gasp, Peppersmoke)

| Sentence | Ability |
| --- | --- |
| Target creature gets -0/-9999 until end of turn. | `{"kind":"spell","targets":[{"what":"permanent","types":["Creature"]}],"effects":[{"effect":"pump","targets":{"target":0},"power":0,"toughness":-9999}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes, Wastes
- seat 0 battlefield: Swamp, Wastes, Wastes, Wastes, Wastes
- seat 0 graveyard: Overkill
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Wastes
- seat 1 battlefield: Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: Smoke Bear, Smoke Sorcery
- seat 1 exile: empty

## Blood Seeker

**Oracle text:** Whenever a creature an opponent controls enters, you may have that player lose 1 life.

**Weakest template:** seen on 1 card(s), band 1 (99.6% in calibration).

**Templates, and cards that taught them:** `1:whenever a creature an opponent controls enters, you may have that player lose N life` (Suture Priest)

| Sentence | Ability |
| --- | --- |
| Whenever a creature an opponent controls enters, you may have that player lose 1 life. | `{"kind":"triggered","trigger":{"on":"enters","who":"any","filter":{"types":["Creature"],"controller":"opponent"}},"effects":[{"effect":"loseLife","who":"that player","amount":1}],"optional":true}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Blood Seeker, Swamp, Wastes, Wastes, Wastes
- seat 0 graveyard: empty
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty

## Dakmor Salvage

**Oracle text:** This land enters tapped. / {T}: Add {B}. / Dredge 2 (If you would draw a card, you may mill two cards instead. If you do, return this card from your graveyard to your hand.)

**Weakest template:** seen on 1 card(s), band 1 (99.6% in calibration).

**Templates, and cards that taught them:** `1:this land enters tapped` (Adagia, Windswept Bastion, Airship Engine Room, Arcane Sanctum); `1:{t}: add {b}` (Blazemire Verge, Bleachbone Verge, Bojuka Bog); `1:dredge N` (Life from the Loam)

| Sentence | Ability |
| --- | --- |
| This land enters tapped. | `{"kind":"replacement","watches":{"event":"enters","who":"self"},"change":{"entersTapped":true}}` |
| {T}: Add {B}. | `{"kind":"activated","mana":true,"cost":[{"atom":"{T}"}],"effects":[{"effect":"addMana","mana":{"B":1}}]}` |
| Dredge 2 (If you would draw a card, you may mill two cards instead. If you do, return this card from your graveyard to your hand.) | `{"kind":"keyword","keyword":"dredge","amount":2}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Dakmor Salvage, Wastes, Wastes
- seat 0 graveyard: empty
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty
- Dakmor Salvage has Dredge

## Deserted Temple

**Oracle text:** {T}: Add {C}. / {1}, {T}: Untap target land.

**Weakest template:** seen on 1 card(s), band 1 (99.6% in calibration).

**Templates, and cards that taught them:** `1:{t}: add {c}` (Academy Ruins, Access Tunnel, Accursed Duneyard); `2:{N}, {t}: untap target TYPE` (Thousand-Year Elixir)

| Sentence | Ability |
| --- | --- |
| {T}: Add {C}. | `{"kind":"activated","mana":true,"cost":[{"atom":"{T}"}],"effects":[{"effect":"addMana","mana":{"C":1}}]}` |
| {1}, {T}: Untap target land. | `{"kind":"activated","cost":[{"atom":"mana","cost":"{1}"},{"atom":"{T}"}],"targets":[{"what":"permanent","types":["Land"]}],"effects":[{"effect":"untap","targets":{"target":0}}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Deserted Temple, Wastes, Wastes
- seat 0 graveyard: empty
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty

## Electroduplicate

**Oracle text:** Create a token that's a copy of target creature you control, except it has haste and "At the beginning of the end step, sacrifice this token." / Flashback {2}{R}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)

**Weakest template:** seen on 1 card(s), band 1 (99.6% in calibration).

**Templates, and cards that taught them:** `1:create a token that's a copy of target creature you control, except it has haste and "at the beginning of the end step, sacrifice this token."` (Kindle the Inner Flame); `1:flashback {N}{r}{r}` (Bulk Up)

| Sentence | Ability |
| --- | --- |
| Create a token that's a copy of target creature you control, except it has haste and "At the beginning of the end step, sacrifice this token." | `{"kind":"spell","targets":[{"what":"permanent","types":["Creature"],"controller":"you"}],"effects":[{"effect":"copyPermanent","targets":{"target":0},"except":{"addKeywords":["Haste"],"addAbilities":[{"kind":"triggered","text":"At the beginning of the end step, sacrifice this token.","trigger":{"on":"end step","yours":false},"effects":[{"effect":"moveZone","targets":"self","sacrifice":true}]}]}}]}` |
| Flashback {2}{R}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.) | `{"kind":"keyword","keyword":"flashback","cost":[{"atom":"mana","cost":"{2}{R}{R}"}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Mountain, Smoke Bear, Smoke Relic, Wastes, Wastes, Wastes, Wastes
- seat 0 graveyard: Electroduplicate
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty

## Poison Dart Frog

**Oracle text:** Reach / {T}: Add one mana of any color. / {2}: This creature gains deathtouch until end of turn.

**Weakest template:** seen on 1 card(s), band 1 (99.6% in calibration).

**Templates, and cards that taught them:** `1:reach` (Ancient Greenwarden, Arboreal Grazer, Attercop); `1:{t}: add N mana of any color` (Aetheric Amplifier, Arbor Adherent, Bandit's Haul); `2:{N}: this TYPE gains KW until end of turn` (Afterthought Sentry)

| Sentence | Ability |
| --- | --- |
| Reach | `{"kind":"keyword","keyword":"reach"}` |
| {T}: Add one mana of any color. | `{"kind":"activated","mana":true,"cost":[{"atom":"{T}"}],"effects":[{"effect":"addMana","anyColor":true}]}` |
| {2}: This creature gains deathtouch until end of turn. | `{"kind":"activated","cost":[{"atom":"mana","cost":"{2}"}],"effects":[{"effect":"pump","targets":"self","power":0,"toughness":0,"keywords":["Deathtouch"]}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Forest, Poison Dart Frog, Wastes, Wastes, Wastes
- seat 0 graveyard: empty
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty
- Poison Dart Frog has Reach, Deathtouch

## Skull Prophet

**Oracle text:** {T}: Add {B} or {G}. / {T}: Mill two cards. (Put the top two cards of your library into your graveyard.)

**Weakest template:** seen on 1 card(s), band 1 (99.6% in calibration).

**Templates, and cards that taught them:** `1:{t}: add {b} or {g}` (Bayou, Blooming Marsh, Deathcap Glade); `1:{t}: mill N cards` (Perpetual Timepiece)

| Sentence | Ability |
| --- | --- |
| {T}: Add {B} or {G}. | `{"kind":"activated","mana":true,"cost":[{"atom":"{T}"}],"effects":[{"effect":"addMana","choice":[{"B":1},{"G":1}]}]}` |
| {T}: Mill two cards. (Put the top two cards of your library into your graveyard.) | `{"kind":"activated","cost":[{"atom":"{T}"}],"effects":[{"effect":"mill","count":2}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes
- seat 0 battlefield: Forest, Skull Prophet, Swamp, Wastes, Wastes
- seat 0 graveyard: empty
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty

## Thought Scour

**Oracle text:** Target player mills two cards. / Draw a card.

**Weakest template:** seen on 1 card(s), band 1 (99.6% in calibration).

**Templates, and cards that taught them:** `1:target player mills N cards` (Brain Freeze); `1:draw a card` (Ancestral Anger, Artifist Acumen, Contentious Plan)

| Sentence | Ability |
| --- | --- |
| Target player mills two cards.
Draw a card. | `{"kind":"spell","targets":[{"what":"player"}],"effects":[{"effect":"mill","who":{"target":0},"count":2},{"effect":"draw","count":1}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Wastes, Wastes, Wastes
- seat 0 battlefield: Island, Wastes, Wastes
- seat 0 graveyard: Thought Scour, Wastes, Wastes
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: Smoke Sorcery
- seat 1 exile: empty

## Unnatural Restoration

**Oracle text:** Return target permanent card from your graveyard to your hand. Proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)

**Weakest template:** seen on 1 card(s), band 1 (99.6% in calibration).

**Templates, and cards that taught them:** `1:return target permanent card from your graveyard to your hand` (Restore with Empathy); `1:proliferate` (Contentious Plan, Radstorm, Steady Progress)

| Sentence | Ability |
| --- | --- |
| Return target permanent card from your graveyard to your hand. Proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.) | `{"kind":"spell","targets":[{"what":"card","zone":"graveyard","controller":"you","nonTypes":["Instant","Sorcery"]}],"effects":[{"effect":"moveZone","targets":{"target":0},"to":"hand"},{"effect":"proliferate"}]}` |

**What the game showed** (the drafted scenario's expectations):

- seat 0 at 40 life
- seat 0 hand: Smoke Bear, Wastes
- seat 0 battlefield: Forest, Smoke Bear, Smoke Relic, Wastes, Wastes, Wastes
- seat 0 graveyard: Smoke Sorcery, Unnatural Restoration
- seat 0 exile: empty
- seat 1 at 40 life
- seat 1 hand: Smoke Sorcery, Wastes
- seat 1 battlefield: Smoke Bear, Smoke Charm, Smoke Giant, Smoke Relic, Wastes
- seat 1 graveyard: empty
- seat 1 exile: empty
