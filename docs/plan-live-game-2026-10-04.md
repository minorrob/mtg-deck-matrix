# The plan for the live game, 2026-10-04

**Goal.** Rob plays a four-player Commander game by about **22:25 UTC on 2026-10-04**. The four decks come from the
sheet "Live Game Load 10.4". Seat 1 is human ("Trey"). Seats 2-4 are AI ("AI 1", "AI 2", "AI 3").

**Scope.** This is a planning document. It changes no engine, app or test file. The parent session evaluates it, folds
it into `docs/plan-execution-2026-10-03.md`, and executes it.

**Measured against** `main` at 533576f6. Every figure is from this container on 2026-10-04 unless it says otherwise.

---

## 0. The recommended path, in one screen

| # | Step | Owner | Ends |
| --- | --- | --- | --- |
| 1 | **Play at staging** (`staging.crankmagic.com`, profile `cloud-staging`), released by Rob from Personal-HP. The fallback is the same build under `wrangler dev --local` on Personal-HP. Production does not ship Play (profile `pages` leaves it out), so production is not an option today. | Rob (release) | 21:45 |
| 2 | **AI seats are the house pilot** (`game/engine/pilots/house-pilot.mjs`), as the room already seats them. No LLM pilot today; it is a separate follow-up (§3). | nobody: it exists | now |
| 3 | **Refresh the oracle snapshot.** All 56 missing names are on Scryfall in sets `fra`/`frc` (released 2026-10-02) and are Commander-legal. Then define as many cards as the time allows, in the impact order of §2.4. **The two commanders come first:** Jace, Multiverse Architect and Kiora of Salt and Sand. | parent + helper A | 21:20 merge |
| 4 | **Play two copies of each deck.** The *true* deck holds Rob's cards and lots. A *table* copy holds the same deck with Rob-approved stand-ins for every card the engine still can't play at the cutoff. Both go in one backup file that Rob restores **into the staging account**. | helper B | 21:30 |
| 5 | **Gate.** At most three trains on the local gate (about 31 min each). The last merge is no later than **21:20**. After that the decks change only through stand-ins in the backup, never through engine code. | parent | 21:20 |

The acceptance checks are in §1.2. The decisions Rob must answer are in §6.4, each with the recommended answer.

---

## 1. The minimum playable game

### 1.1 Definition

"Playing a game with my cards" means all of the following, today:

1. Rob's library at staging holds the four decks exactly as the sheet lists them: 4 × 100 cards, commanders set, and
   one lot per sheet row.
2. A table with **one human seat and three AI seats** starts from those decks. Each seat has its assigned deck and
   commander.
3. Every card that is played behaves as its definition says. Where a card has no definition yet, an **approved
   stand-in** takes its place in the *table* copy of the deck. Nothing is silently vanilla: the room refuses
   undefined cards (`game/room/table.mjs` `readDeck`, 422 *"The table cannot play these N cards yet"*). That refusal is
   the guard and it stays.
4. The game runs to a natural end, or for as long as Rob plays, with no engine exception. The AI seats answer fast
   enough that the table never waits on them.

Out of scope today: LLM opponents, difficulty levels, production, a second human, and cards defined only
"provisionally".

### 1.2 Acceptance checks (all green before Rob sits down)

| ID | Check | How (command or procedure) | Where | Pass |
| --- | --- | --- | --- | --- |
| A1 | The backup file restores | `readBackup()` from `collection-exchange.js` in Node 22 (WebCrypto is present). It accepts the file. `collection-model.js` `validate` passes. | container | no throw |
| A2 | The decks are the sheet | For each true deck: 100 main cards, its commander in `commanders[]`, and the cards and counts equal to the sheet rows. Lot quantities total 400. | container | exact match |
| A3 | Every table deck seats | For each table deck, its names go through `tableCards` (`cloud/game-room.mjs`) and `readDeck`. Nothing is unsupported, and the commander is legal. | container | 0 refused |
| A4 | Four-seat games finish | A scratch harness in the shape of `tests/engine-room-games.mjs` runs `startRoom` with the four table decks, house pilots in all four seats, and 5 seeds. It plays to the end, or to turn 25, and is not committed. | container | 0 exceptions; each game ≤ 45 s |
| A5 | AI latency | The same harness times each `choose` and `answer` call. | container | p99 < 50 ms per decision; mean time per AI turn < 1 s |
| A6 | Play end to end | `node tests/uat/play-e2e.mjs` (the staging build under `wrangler dev --local`) at the final `main`. If wrangler won't install here, it runs on Personal-HP. | container or Personal-HP | PASS |
| A7 | The staging smoke test | Rob, about 20 min: restore the backup at staging → Play → New table → seats 2-4 set to "An AI" → assign the decks → Start → play to turn 3. Check the commander in the command zone and one AI attack. | staging | no error banner; AIs act |
| A8 | The replay | The finished A4 games replay to the same hash. `engine-room-games` already asserts this, and the harness reuses it. | container | identical |

A1-A5 and A8 are the parent's or helper B's job before 21:30. A6 runs on the final merge. A7 is Rob's, after the release.

---

## 2. Card coverage

### 2.1 The parent's measurement, confirmed and extended

| Deck (seat) | Commander | Defined | Undefined, in snapshot | Not in snapshot | Commander playable |
| --- | --- | --- | --- | --- | --- |
| Trey (human) | Jace, Multiverse Architect | 59 | 8 | 33 | **no** (not in the snapshot) |
| AI 1 | Chulane, Teller of Tales | 82 | 13 | 5 | yes |
| AI 2 | Kiora of Salt and Sand | 68 | 14 | 18 | **no** (not in the snapshot) |
| AI 3 | Teysa Karlov | 88 | 9 | 3 | yes |
| **Total** | | **297** | **44** | **59 (56 unique)** | |

The counts by `loadCardIndex().resolve(name)?.playable` agree with the table's own list. `game/engine/cards/definitions.mjs`
is generated from the same directory by `game/tools/engine-definitions.mjs --write`, and holds 1,481 playable
definitions. There are no compiled scripts yet, so `resolve` returns `null` for each of the 103 card slots above.

### 2.2 The 56 names not in the snapshot: a refresh brings all of them in

**Method.** `POST https://api.scryfall.com/cards/collection` with the 56 names. Scryfall is reachable from this
container, and the result was kept in the scratchpad.

**Result.** All 56 were found. Every one is in set **`fra`** or **`frc`**, released **2026-10-02**, with
`legalities.commander = "legal"`.

**Why they were missing.** The snapshot is Scryfall's `oracle_cards` bulk of 2026-09-22, ten days before the set came
out. `tools/build-engine-cards.mjs` takes every Commander-legal card and uses no name list, so
`node tools/build-engine-cards.mjs` brings all 56 in. `data/commander-universe.json` already holds Kiora and Jace, so
the library side needs no refresh.

**Checks after the refresh:**

```sh
node tools/build-engine-cards.mjs          # ~24 MB download; rewrites data/engine/{oracle,tokens,support}.json
node -e 'const O=require("./data/engine/oracle.json").cards;for(const n of ["Jace, Multiverse Architect","Kiora of Salt and Sand","Way of the Pyromancer"])console.log(n,!!O.find(c=>c.name===n))'
```

**Side effects to expect:**

- `oracle.json` changes size (about 14 MB, and up).
- `support.json` gets new `unsupported` rows.
- Every suite that pins the pool count or the file's hash moves with it. Run `tests/data-integrity.mjs`, the engine
  suites and `tests/asset-versions.mjs` before the train. The `crankmagic-refresh` skill names the order.

The refresh is its own commit, in train 1.

**Fallback if Scryfall had not had them:** hand-enter identity rows in `oracle.json`'s shape, with a `source` that
says so, from the printed card. It is not needed today.

### 2.3 A new mechanic dominates: **empower Jace**

The set's keyword action reads, in its reminder text: *"Put N loyalty counters on a Jace token you control. If you
don't control one, first create a blue Jace planeswalker token with '[−1]: Surveil 1' and '[−3]: Draw a card.'"* A
second shared piece grants loyalty abilities ("Planeswalkers you control have '[−N]: …'").

| Shared engine piece (new) | Unlocks (card slots) | Est. |
| --- | --- | --- |
| **P1 Empower Jace N.** A predefined Jace token: a planeswalker token with two loyalty abilities, and N loyalty counters added to it (or created first). Loyalty counters, loyalty abilities and the per-turn rule (CR 606.3, `rules/actions.mjs:835`) already exist. | Trey 11, AI 2 11 (**22**) | 1.5-2 h |
| **P2 Granted loyalty abilities** ("Planeswalkers you control have …"): a static ability that adds an ability to each planeswalker you control, through the layers (ability-adding effects, CR 613.1f) | Kiora (commander), 7 × Way of …, Avatar of Burgeoning Echoes (**9**) | 1-1.5 h |
| **P3 "Reveal until a creature or planeswalker card"**, then onto the battlefield, the rest to the bottom in a random order | Jace MA (commander) −3, Identity Echo (**2**) | 45 min |
| **P4 "Whenever you activate a loyalty ability"**, and the condition "if you've activated a loyalty ability this turn". The use record already exists (`usesThisTurn(state, id, "loyalty")`). | Kiora, Ajani Unrelenting, Way of the Mind Sculptor, Way of the Paradox (**4**) | 45 min |
| **P5 "May pay {2} at the beginning of combat, or can't attack Jaces you control"**: an opponent's choice and an attack restriction toward a subset of planeswalkers | Jace MA (commander) (**1**) | 1 h |

**Commanders.** Jace needs P3 + P5. "Can be your commander" is already recognized, with two definitions. Kiora needs
P2 + P4. That is about 3.5-4 hours of engine work for the two commanders alone. It is tight but possible, and only if
it starts by 16:15 in a helper session that does nothing else.

### 2.4 Every undefined card, ranked

**Tiers:**

- **T0** is a land that only needs an "enters tapped unless" condition (the check lands already exist).
- **T1** uses existing pieces only.
- **T2** needs one of P1-P5, or one small new piece.
- **T3** needs a named-not-built mechanic: adventure, emblem, echo, impending, overload, rebound, suspend, multikicker,
  Class, manifest, paradigm, transform, phasing, eminence, copy-a-spell, cast from another zone. None of T3 is today's
  work.

"Impact" is the card's weight in its deck: **H** is the commander, an engine of the deck or a key answer; **M** is a
solid role-player; **L** is filler or a land.

#### Trey: Jace (41 undefined)

| Card | Tier | Needs | Impact |
| --- | --- | --- | --- |
| Jace, Multiverse Architect | T2 | P3, P5 (planeswalker commander already works) | **H (commander)** |
| Dedicated Commons, Fatehold Annex, Meticulous Commons, Stingerquill Annex, Theorix Annex | T0 | enters tapped unless you control a planeswalker | L (×5) |
| Turbulent Crater / Shore / Wetlands / Steppe | T0 | enters tapped unless opponents control ≥ 8 lands (a count across opponents); basic land types | L (×4) |
| Geist of Saint Thalia | T1 | cost reduction for noncreature spells (`spells-cost-less`) | M |
| Your Fate Ends Here | T1 | destroy, with a mana value filter; surveil | M |
| Saheeli, Jewel of Avishkar | T1 | cast-a-noncreature-spell trigger → Thopter; a static granting haste | H |
| Vraska, Soul of Stone | T1-T2 | the same trigger; a custom Sculpture Treasure creature token | M |
| Grateful Apparition | T1 | combat-damage trigger; proliferate (exists) | M |
| Teyo, Lightshield Expert | T1-T2 | flash; ETB hexproof; a counter that depends on the target's type | M |
| Ob Nixilis, the Ascended | T2 | destroy all tapped creatures opponents control and count them; "if you gained life this turn" (turn records exist since #593) | H |
| Niv-Mizzet, Ghost Counsel | T2 | "may pay that much life"; draw that many | M |
| Avacyn, Angel of Horror | T2 | a delayed return at the next end step | H |
| Identity Echo | T2 | P3 | M |
| Fatehold Charm, Protege's Awakening, Theorist's Proxy, Plan for All Outcomes, Violent Echoes | T2 | P1 (+ modes, the owner's top-or-bottom choice, excess damage, "can't be countered") | M (×5) |
| Way of the Healer / Necromancer / Pyromancer / Warlord | T2 | P1 + P2 | M (×4) |
| Ajani Unrelenting | T2 | P4; damage to each creature except your tokens | M |
| Oblivion Ring | T2 | linked exile until it leaves (RememberObjects, on X11's list) | H |
| Gifts Ungiven | T2 | an opponent chooses from revealed cards | L |
| Serra's Emissary | T2-T3 | choose a card type; protection from it for a player and creatures | H |
| Ajani Resolute | T3 | emblem | M |
| Darksteel Angel | T3 | "can't lose the game"; counter prevention | M |
| Emrakul, the Exigent Doom | T3 | cast trigger; ward with a sacrifice cost; cast from exile | H |
| Teferi's Reproach | T3 | phasing; protection from everything | L |
| The Ur-Sphinx | T3 | eminence; casting free from milled cards | H |
| Overlord of the Mistmoors | T3 | impending | H |
| Quintorius Kand | T3 | discover; casting from exile | M |
| Winds of Abandon | T3 | overload | M |

#### AI 1: Chulane (18 undefined)

| Card | Tier | Needs | Impact |
| --- | --- | --- | --- |
| Greenhouse Propagator | T1 | another-creature-enters trigger; a mana ability | M |
| Prophesied End | T1 | destroy; "if it wasn't attacking" | M |
| Rescue Girl, First Responder | T1 | bounce your own permanent; only during your turn | M |
| Vigorbloom Charm | T1-T2 | modal; fight | M |
| Fell the Mighty | T1-T2 | destroy all creatures with power greater than the target's | M |
| Reflector Mage | T2 | bounce; "can't cast spells with the same name until your next turn" | H |
| Skyclave Apparition | T2 | linked exile; a leaves-the-battlefield X/X token | H |
| Deputy of Detention | T2 | linked exile, with the same name | H |
| Soulherder | T2 | exiled-from-the-battlefield trigger; flicker | H |
| Faeburrow Elder | T2 | count the colors among permanents | M |
| Loot, the Nexus | T2 | count the distinct powers | M |
| Fblthp, the Lost | T2 | becomes-the-target trigger; the "from your library" condition | M |
| Divert Disaster | T2 | counter unless they pay; Lander token | M |
| Ephemerate | T3 | rebound | H |
| Karmic Guide | T3 | echo | M |
| Bofur, Reliable Guardian | T3 | adventure | L |
| The Eternal Wanderer | T3 | an attack limit on a planeswalker; a delayed return | M |
| Venat, Heart of Hydaelyn | T3 | transform | M |

#### AI 2: Kiora (32 undefined)

| Card | Tier | Needs | Impact |
| --- | --- | --- | --- |
| Kiora of Salt and Sand | T2 | P2, P4; a whenever-you-attack trigger | **H (commander)** |
| Arcane Amphisbaena, Mindseeker Oculus, Tam's Resistance, Protege's Awakening, Theorist's Proxy, Plan for All Outcomes | T2 | P1 | M (×6) |
| Jace, Reality Sculptor | T2-T3 | P1; "until your next turn, attackers get -5/-0"; a loyalty threshold | H |
| Avatar of Burgeoning Echoes | T2 | P1 + P2; landfall | M |
| Way of the Mind Sculptor / Way of the Paradox | T2 | P1 + P4 | M (×2) |
| Budding Insurgent | T1 | sacrifice to destroy an artifact or enchantment; draw if it was legendary | M |
| Compel Brutality | T1-T2 | bite; damage equal to loyalty | M |
| Proft, Consulting Detective | T2 | a scry/surveil trigger | M |
| Hexhaven Invigorator | T2 | is-dealt-damage trigger; search for up to that many lands | M |
| Sphinx of False Conclusions | T2 | dies-if-not-a-token → a token copy | M |
| Fact or Fiction | T2 | an opponent separates piles | M |
| Aetheric Amplifier, Deepglow Skate | T2 | double counters | M |
| Branching Evolution | T2 | replacement on counters | M |
| Study Hall | T2 | mana spent on the commander → scry | L |
| Tekuthal, Inquiry Dominus | T2 | doubled proliferate; remove counters as a cost | M |
| Berta, Wise Extrapolator | T2-T3 | increment | M |
| Song of the Dryads | T2-T3 | a type-setting Aura | H |
| Way of the Cryomancer | T3 | copy a spell | M |
| Delay, Everflowing Chalice, Germination Practicum, Innkeeper's Talent, Kasmina, Reality Shift, Hall of Echoes | T3 | suspend; multikicker; paradigm; Class; shared loyalty abilities; manifest; copy + legend rule | M-L (×7) |

#### AI 3: Teysa (12 undefined)

| Card | Tier | Needs | Impact |
| --- | --- | --- | --- |
| Edgar, Ancient Bloodlord | T1 | a dies trigger; sacrifice as a cost; a counter; menace | M |
| Liliana the Faultless | T1 | an enters trigger; discard as a cost; hexproof | M |
| Millikin | T1 | a mana ability with a mill cost | L |
| Tithe Taker | T1 | a cost increase during your turn; Afterlife (exists, D5) | M |
| Silence the Echo | T2 | an alternative additional cost (sacrifice or pay {3}) | M |
| Path of Ancestry | T2 | commander-identity mana; a scry when that mana is spent | L |
| Rally the Ancestors | T2 | X; a delayed exile | M |
| Skrelv's Hive | T2 | toxic; corrupted | M |
| Ao, the Dawn Sky | T2-T3 | a modal dies trigger; total mana value from the top seven | H |
| Bolas's Citadel, Promise of Loyalty, Serra Paragon | T3 | play from the top, paying life; vow counters; casting from the graveyard | H/M |

### 2.5 What fits in the time

The measured pace is about 1,000 definitions in three days across sessions, about 14 an hour. A T0/T1 card is 10-20
minutes with its scenarios. Each train costs 31 minutes of gate.

| Wave | Cards | Owner | Train |
| --- | --- | --- | --- |
| W0 the refresh | 0 (data only) | parent | 1 |
| W1 the T0 lands and T1 | 9 lands + about 16 T1 = **about 25** | parent | 1 (as many as are ready by 17:40), the rest in 2 |
| W2 the commanders and their pieces | P3, P5 → Jace; P2, P4 → Kiora; then Identity Echo, Ajani Unrelenting, Way of the Mind Sculptor / Paradox | helper A | 2 |
| W3 empower (stretch) | P1 → up to 22 slots, if P1 is proven by 20:15 | helper A | 3 |
| W4 the easy T2 | Ob Nixilis, Avacyn, Reflector Mage, Rally the Ancestors, Silence the Echo … | parent | 2-3 |

**Expected at the cutoff:** about 30-45 of the 103 slots, and both commanders (P ≈ 0.6 for both; Kiora is the likelier
of the two). That leaves **about 55-70 slots for stand-ins**, mostly in Trey's and Kiora's decks.

### 2.6 The policy for a card the engine can't play by game time

| Option | Gameplay | Effort | Fidelity to Rob's deck | Risk |
| --- | --- | --- | --- | --- |
| **a. Functional stand-in**: a *defined* card with the same color identity, the same mana value ±1 and the same role (removal → removal, ramp → ramp, a land → a land of the same colors) | best | about 30 min for helper B to propose; Rob approves one table | high in feel, low in exact text | Rob must approve; a few roles have no defined equivalent |
| b. A basic land of the deck's colors | the deck floods; weak | none | low | a game of mostly lands for Trey (41 slots) |
| c. Leave it out (a deck under 100) | the curve holds, the deck is thin | none | medium | not a legal Commander deck; the table allows it (`readDeck` caps at 250 and has no minimum) |
| d. A provisional definition at a playtest table (D5) | real cards | high | exact | unproven definitions in a live game; the plan's own bar says no |

**Recommendation: (a)**, with **(b)** as the blanket fallback for any stand-in Rob rejects or that has no
equivalent. All of it goes in the *table* copies, so the *true* decks stay exact (§5).

**Commanders.** If Jace or Kiora is not merged by 21:20, the stand-in commander needs Rob's explicit approval:

| Missing commander | Stand-in |
| --- | --- |
| Jace (W U B R) | **Jodah, the Unifier** (defined, five colors), or Ramos, Dragon Engine |
| Kiora (G U) | **Tatyova, Benthic Druid** (defined, G U) |

Tatyova is also in AI 1's deck, so the same card would be in two decks. That is fine at a table.

---

## 3. The three AI seats

### 3.1 What exists

| Piece | Where | What it does |
| --- | --- | --- |
| House pilot | `game/engine/pilots/house-pilot.mjs` (`housePilot({seat, cards})`: `choose(view, actions)`, `answer(view, choice)`) | A deterministic heuristic over `legalActions`. It imports nothing and uses no clock or randomness (`tests/engine-house-pilot.mjs` enforces this). It costs microseconds per decision. |
| Room driving | `game/room/room.mjs` `drive()` (:286-314) | **Synchronous.** A seat with `pilot === "house"` is answered inline. Pilot answers are not taped, because the pilot is deterministic (:256). A refused answer falls back to `leastAnswer`. |
| Lobby | `game/room/table.mjs` `create()` / `deck()` / `tick()` | Seat 0 is the human host, plus 1-3 seats of kind `human` or `ai`. An AI seat becomes `pilot: "house"`. The host assigns the AI seats' decks. |
| Proof | `tests/engine-room-games.mjs` | 10 seeded four-house games of real definitions through the real room. Each has a 45 s budget, and the slowest is about 11 s. |
| LLM choice providers | `game/tools/api-choice-provider.mjs` (OpenAI, Anthropic) | **For the Forge host only.** Single-choice index, 4.5 s timeout, 64 output tokens. Nothing in `game/room` or `cloud/` uses them. |
| The AI door | `cloud/ai.mjs` | `POST /api/ai/explain` uses the `ANTHROPIC_API_KEY` **Worker secret**, spend caps and an allowlist. It is closed until set. "LLM seats come through the same gates later." |
| `pilot-policy.js` (root) | the deck simulator | Not related to rooms. |

### 3.2 The options compared

**Assumptions** for the LLM figures: Haiku 4.5 at $1 / $5 per million tokens (the prices in `cloud/ai.mjs`). About 2.5k
input and 40 output tokens for each decision with a compact observation. **About 400-900 AI decisions per four-seat
game**, most of them priority passes. That last figure is an estimate; A4/A5 count it exactly.

| | Rules-only (house pilot) | LLM pilot | Hybrid: house for passes, mana and trivial answers; LLM for main-phase casts, attacks and targets |
| --- | --- | --- | --- |
| Latency per decision | < 1 ms | 0.8-3 s (network plus model), with a tail over 5 s | < 1 ms for about 85%; 1-3 s for about 15% |
| AI time per game | seconds | **15-40 min** spent waiting on AI seats: unplayable | about 3-8 min across the game, about 10-30 s per AI turn |
| Cost per game | $0 | about $1-3 | about $0.20-0.50 |
| Failure modes | weak play, and unreasonable on complex new cards; no outage risk | timeouts, rate limits, an invalid index, the key or the network missing from the Durable Object, a replay that diverges (answers not taped) | the same as the LLM pilot, on fewer calls; every failure falls to the house pilot within a 4 s timeout |
| What has to be built | nothing | `drive()` made async (it is synchronous today); taping pilot answers for replay; outbound fetch from the Durable Object; the Worker secret at staging; an observation builder for the engine's view; the spend cap; tests | everything the LLM pilot needs, plus the split between the two |
| Fits in 7 h with proof? | **yes (done)** | no | no: about 1.5-2 sessions plus a gate, and it changes the room contract (replay) |

**Recommendation: the house pilot today.** Name the hybrid as the follow-up step, behind the AI door (D12): async
`drive()` with answers taped, `createAnthropicChoiceProvider`'s shape ported to the engine view, a 4 s timeout falling
back to `housePilot`, and a spend cap per table. Its proof is `engine-room-games` with the provider stubbed (latency
and failures injected), plus a replay identical to the original from the tape.

**The credential, by name only.**

- No variable named like an AI API key (for example `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) appears in this
  container's environment.
- The only proxy-injected credential is `CLOUDFLARE_API_TOKEN`, for `*.cloudflare.com`.
  `GET /client/v4/user/tokens/verify` answered "Invalid API Token". It may be account-scoped and was not tested
  further. It is not an AI credential.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are present by name; whether they serve a model is unconfirmed.
- A closer look at the environment's user-provided key names was refused by this session's permission classifier as
  credential exploration, so it was not pursued.

**The finding does not change today's recommendation.** A seat runs in the Durable Object, and the Durable Object can
reach only its own Worker secret (`wrangler secret put ANTHROPIC_API_KEY`, set by Rob), never a container variable.

---

## 4. Where the game is played, and the setup flow

| Venue | Ships Play? | Who can deploy | Today |
| --- | --- | --- | --- |
| Production (`pages` profile, crankmagic.com) | **No.** Play is left out, and the tab says Coming Soon (`tools/release-pages.mjs:99`). | Rob only, on Rob's go | not an option without a profile change: out of scope |
| **Staging** (`cloud-staging`, staging.crankmagic.com) | yes (`play: "cloud"`, `tables: {playtest: true}`), behind Cloudflare Access and the invite list | Rob from Personal-HP (`node tools/release-pages.mjs` for the profile, then `wrangler deploy` from the built folder; `docs/release-pages.md`). The container can't deploy, and Workers Builds fail. | **recommended** |
| Local `wrangler dev --local` on Personal-HP | yes (what `tests/uat/play-e2e.mjs` drives) | Rob | **fallback** if the release or Access fails |
| A preview | Workers Builds previews fail every build (ACTIVE.md) | none | no |

### The flow, step by step

1. **Release.** Rob releases staging from `main` at the final merge, by 21:45.
2. **Load the library.** Rob signs in at staging, then Library → Restore from a backup file →
   `live-game-2026-10-04.crankmagic-backup.json` (§5). The restore **replaces** that account's staging library.
   Production's library is a different database and is untouched. Before restoring, Rob exports the current staging
   library with Save a backup, so nothing is lost.
3. **Create the table.** Play → New table. Seat 1 is the host, which is Rob, playing Trey's deck (D-L2). Seats 2-4 are
   set to **An AI**.
4. **Assign the decks.** For each seat, Change deck lists the library's decks that are not archived and have a
   commander (`crankmagic-table.js:89`). Pick the **table** copy: "Trey · Jace (table)", "AI 1 · Chulane (table)" and so
   on. The deck shows "N of 100 known", and must show 100 of 100. An AI seat is ready once it has a deck.
5. **Start.** Rob presses Start, the countdown runs, and the game begins.

### Gaps in that flow

| Gap | Blocks today? | Fix |
| --- | --- | --- |
| Staging needs Rob at Personal-HP to release | **yes, if Rob isn't there** | Rob is there from 21:20 to 21:45 (D-L1); the fallback is local `wrangler dev` on the same machine |
| Seat 0 is always the host and always human | only if "Trey" is a different person than Rob | Trey hosts from their own account with the backup restored there, or Rob plays Trey's deck (recommended) |
| No deck-to-player field (§5) | no | the deck names carry the seat label |
| The table refuses a deck with any undefined card | yes, for the true decks | the table copies with stand-ins (§2.6) |
| An inviting second human needs Access and the invite list | no (one human) | — |
| No AI difficulty | no | — |
| The "Load Live" button in the skill's text is no longer in the app | no | use Restore from a backup file, which reads the same envelope |

---

## 5. The library backup file

### 5.1 The format the app restores

`collection-exchange.js`:

- `backup(data)` writes:
  `{schema: "live-state@1", format: "crankmagic-backup", version: 1, generator, createdAt, checksum, payload: {state, history}}`.
- `checksum` is the SHA-256 (lowercase hex) of `stable(payload)`, a canonical JSON with object keys sorted
  recursively. It covers only `payload`, so extra top-level keys are harmless.
- `readBackup(raw)` does these steps in order:
  1. checks the format and the version;
  2. recomputes the checksum and refuses on a mismatch ("No data was replaced.");
  3. runs `M.migrate`, then `M.validate`;
  4. checks that `history` is an array of `{id, summary}`.

`collection-model.js` `validate` checks schema version 4 with these keys: `cards` (a map, with `card:` + base64url of
the folded name), `decks`, `lots`, `groups`, `reports`, `games`, `advice`, `imports` and `preferences`.

- A **deck** holds `slots[{id, cardId, quantity, purpose: "main", committed: true}]` and `commanders[cardId]`.
- A **lot** holds `{id, cardId, quantity, printing, paid, source: "owned", offer: "none", groupIds,
  location: {kind: "deck", deckId}, allocation?: {deckId, slotId}}`.

### 5.2 How to generate it: reuse the live-load pipeline

`tools/build-live-state.mjs` already turns a name-based `live-load@1` file into exactly this envelope, through
`tools/live-load.js` and `Exchange.backup`. It resolves names against `commander-universe.json`, which already holds the
new set. `--scryfall cache.json` fills in rules text and images for cards the universe knows only as rows.

1. **Sheet → `live-load@1`** (scratch file, not committed): `decks: [{id: "D1".."D4", name, commander, definition,
   cards: [[name, qty], ...]}]`. Each deck's `cards` **includes the commander** and totals 100, matching the committed
   `data/live-load.json`. Set `owned.inDeck.{D1..D4}` to the same lists, which gives one lot per sheet row (325 rows,
   400 cards), and leave `bench`, `ordered`, `buy`, `paid` and `upgrades` empty. Deck names carry the seat:
   **"Trey · Jace, Multiverse Architect"**, **"AI 1 · Chulane"**, **"AI 2 · Kiora"**, **"AI 3 · Teysa"**.
2. **Add the table copies** as `D5`-`D8`, named "… (table)", with the approved stand-ins and **no lots**. They are
   draft decks; the engine will play them.
3. **Build** with `buildFile(url, {scryfall})` imported from `tools/build-live-state.mjs`. Do *not* run the CLI, which
   overwrites `data/live-state.json`, whose fingerprint `tests/live-load.mjs` pins. Write
   `JSON.stringify(out.backup)` to the scratchpad as `live-game-2026-10-04.crankmagic-backup.json`. Use the Scryfall
   cache of the 56 `fra`/`frc` cards (from `/cards/collection`) as `--scryfall`.
4. **Validate** with A1, A2 and A3. Run A3 against the **final** `main`'s `definitions.mjs`. If a commander merged
   late, regenerate the table copies with fewer stand-ins.
5. **Hand it over** as a file through the session's file-send, not committed. It is Rob's library, and a committed
   backup would change a pinned fixture.

### 5.3 Where deck-to-player assignment lives

There is **no place for it in the state**. Decks have no owner, player or seat field. Seat assignment is a table-time
choice (§4, step 4).

The deck names carry the label, and that is enough for today. If a durable field is wanted later, it is a schema change
(version 5, with a migration) that Rob decides on. It is not in today's scope.

---

## 6. The timeline (UTC)

### 6.1 The lanes, with no file touched by two sessions

| Lane | Session | Owns (and only these) |
| --- | --- | --- |
| **P** | the parent (holds `docs/ACTIVE.md`) | `data/engine/*` (the refresh); new card files in W1/W4 under `game/engine/cards/**` **except the files helper A owns**; `game/engine/cards/definitions.mjs` (regenerated **only by P**, at train assembly); README / catalog / suite counts; trains and merges |
| **A** | helper A, the engine pieces | `game/engine/rules/**`, `game/engine/script/**`, the token predefinitions; the card files for Jace MA, Kiora, Identity Echo, Ajani Unrelenting, Way of …, and all the empower cards; new scenario suites for P1-P5. Branch `claude/live-game-pieces`; it hands P a branch to fold into the train and **never regenerates `definitions.mjs`**. |
| **B** | helper B, the decks and acceptance | Files **outside the repo**, in its scratchpad: the live-load source, the stand-in table, the backup file, and the A4/A5 harness. It commits nothing; it sends Rob the file and P the results. |

**Rule for A and P.** A's card list is fixed above. P never authors those cards, and A never authors W1 or W4 cards. A
card both lanes need goes to A.

### 6.2 The schedule

| UTC | P (parent) | A (engine pieces) | B (decks and acceptance) | Rob | Checkpoint |
| --- | --- | --- | --- | --- | --- |
| 15:55-16:15 | reads this plan; spawns A and B; sends Rob the decisions (§6.4) | starts on P3 then P5 (Jace) | builds the live-load source from the sheet | answers D-L1 to D-L5 | **C0:** the decisions are answered, or the recommended answers are taken |
| 16:15-17:40 | the refresh (W0) and its suites; W1: 9 lands, then the T1 cards in impact order | P3, P5 → Jace, with scenarios | the scratch backup of the true decks (A1, A2); a draft of the stand-in table | — | |
| 17:40-18:15 | **Train 1:** the refresh + W1; `tools/local-ci.sh <head> 2` (about 31 min); merge on PASS | P2, P4 → Kiora | stand-in table v1 to Rob, about 60 slots | approves the stand-ins | **C1 (18:15):** train 1 merged; Jace's pieces proven on A's branch? |
| 18:15-19:40 | W4: the easy T2 cards (Ob Nixilis, Avacyn, Reflector Mage, Rally, Silence the Echo, Edgar ...) | Jace + Kiora definitions; Identity Echo, Ajani Unrelenting, Way of the Mind Sculptor / Paradox; P1 if time allows | the A4/A5 harness running on the true decks with stand-ins | — | **C2 (19:40):** the commanders merge into the train, **or** stand-in commanders go ahead (D-L3) |
| 19:40-20:20 | **Train 2:** W4 + A's branch; the gate; merge | P1 (empower) on its own | A3/A4/A5 on train 2's head | — | **C3 (20:20):** train 2 merged; the A4 harness is green |
| 20:20-21:20 | **Train 3 (only if worth it):** P1 + the empower cards + leftovers, merged by **21:20**, or skipped | hands P1 to P by 20:30, or stops | regenerates the table copies against the final `main`; A1-A5, A8 | — | **C4 (21:20): code freeze.** `main` is final. |
| 21:20-21:45 | A6 (`play-e2e`) on final `main`; updates `docs/ACTIVE.md` | done | sends Rob the final backup and the stand-in list | **releases staging** from Personal-HP | **C5:** staging is live at the final `main` |
| 21:45-22:10 | on call | — | on call | **A7:** restore, the table, start, turn 3 | **C6:** the smoke test passes, or switch to local `wrangler dev` |
| 22:25 | — | — | — | **plays** | |

### 6.3 Risks and fallbacks

| Risk | Likelihood | Fallback |
| --- | --- | --- |
| A gate fails (a flaky browser suite) and costs a train | medium (it happened on 10-03 and 10-04) | Leave the machine to the gate (AGENTS.md). If train 2 fails, train 3 is its re-run, and the empower work drops. Train 3 is the last that can merge before 21:20. |
| The commanders aren't ready by C2 | medium (about 0.4 for Jace) | Stand-in commanders (§2.6), approved at C0 |
| The refresh moves pinned hashes and breaks many suites | medium | It is its own commit at the start of train 1, with its suites run before the train is assembled. The worst case is the refresh going alone in train 1. |
| A new definition crashes in a real game (not in its scenarios) | medium | A4 runs on the final head. A card that crashes is swapped for its stand-in in the table copy, with no code change after the freeze. |
| Staging release or Access fails | low-medium | `wrangler dev --local` on Personal-HP, with the same build and the backup restored there |
| The house pilot stalls the game (an unanswerable choice) | low (`leastAnswer` fallback) | A4/A5 catch it beforehand. The table's Concede or End clears a stuck seat. |
| Rob isn't at Personal-HP at 21:20 | depends on Rob | No release means no game at staging. Then play at the last staging release with whatever it seats (the four true decks will not seat there), or move the game. |
| The restore wipes a staging library Rob wanted to keep | low | Export it first (§4, step 2) |

### 6.4 The decisions for Rob, with the recommended answers

| # | Decision | Recommended | If not |
| --- | --- | --- | --- |
| D-L1 | Where: staging, released by you from Personal-HP between 21:20 and 21:45; local `wrangler dev` as the fallback | **Yes** | no venue for a cloud game today |
| D-L2 | Who sits in the human seat: you, as the host, playing Trey's deck | **Yes**: the room's seat 0 is the host | Trey hosts from their own account, with the backup restored there and their Access invite added |
| D-L3 | The commander stand-ins if the real ones miss C2: Jodah, the Unifier for Jace, and Tatyova, Benthic Druid for Kiora | **Yes** | that deck can't seat today |
| D-L4 | The card stand-ins: functional stand-ins in "(table)" copies, basics where nothing fits; the true decks kept exact | **Yes**, approved as one table at C1 | basics only (worse games), or leave cards out (decks under 100) |
| D-L5 | The AI seats are the house pilot today; an LLM/hybrid pilot is a later step behind the AI door | **Yes** | an LLM seat can't be built and proven by 22:25 |
| D-L6 | The gate stays two runs per train, even on the last one | **Yes** (AGENTS.md) | one run saves about 15 min on train 3 and buys one more batch of cards |

---

## 7. Follow-ups after the game (not today)

- **The hybrid AI pilot** (§3.2): async `drive()`, taped answers, the house fallback, the spend cap, behind D12.
- **The empower piece (P1)**, if it missed today, and the T3 mechanics in X11's order. The ranking in §2.4 is the
  input.
- **A durable deck owner field**, if Rob wants seat labels to outlive the deck names (schema v5).
- **The `crankmagic-live-load-sync` skill** names a "Load Live" button the app no longer has; the skill text should
  say "Restore from a backup file".
