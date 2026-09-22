# Play audio: sound effects and background music — scope and plan

**Asked for by Rob, 2026-09-21:** integrate the sound effects and the lobby, combat and general
background music from `crankmagic-audio-pack`.

---

## What the pack actually contains, measured

**Updated 2026-09-21, later the same day.** Rob generated the two missing beds and the pack moved:
`crankmagic2-play-audio-generated\crankmagic-audio-pack` supersedes the original, which no longer
exists. **88 audio files** (83 SFX + **5** BGM beds), **5.3 MB**. Both
`bgm_tension_darkening_myth` and `bgm_victory_linger` are present, so **R11's tension bed ships as
written** and there is a victory bed. The only rows still without audio are the three `ui` settings
rows — specifications, not sounds. The counts in the table below are the original measurement; the
corrected figures are the ones above.

Source: `C:\Users\robmi\OneDrive\Desktop\crankmagic2-play-audio-generated\crankmagic-audio-pack`.

| | |
|---|---|
| Index rows | **91** (`sound-index.json`, `.csv`, and the workbook) |
| Generated audio files | **88** — 83 SFX + 5 BGM beds |
| Total size | **5.3 MB** |
| Rows with no file | **3**, all of them Settings specifications — see below |
| Resolution Rules | **13** (R1–R13), a sheet in the workbook |

**By kind:** creature tribe 39, event 23, subtype 10, card type 9, bgm 5, ui 3, supertype 2.
**By priority:** P0 25, P1 55, P2 11.

**The five BGM beds:** `bgm_lobby_mythic_calm` (60s), `bgm_game_aether_voyage` (75s),
`bgm_combat_battle_shimmer` (45s), `bgm_tension_darkening_myth`, `bgm_victory_linger`.

### The rows with no audio

| Row | Consequence |
|---|---|
| `bgm_tension_darkening_myth` | ~~Missing~~ — **generated 2026-09-21. R11 ships as written.** |
| `bgm_victory_linger` | ~~Missing~~ — **generated 2026-09-21.** |
| `setting_sfx_volume`, `setting_bgm_volume`, `setting_mute_all` | Specifications, not sounds — they describe the Settings panel to build. |

---

## What the pack assumes that is not true here

Worth fixing in the plan rather than discovering during integration.

1. **Browsers will not play audio before a user gesture.** R11 says *"start `bgm_game_main` when
   the live game becomes ready/playing"*. On a page the player has not clicked, that call is
   rejected and the bed never starts — silently. **BGM must arm on the first interaction.** This is
   the single biggest thing the pack does not account for, and it is harder than it looks: the
   context has to be built and resumed *synchronously inside* the handler, because awaiting the
   pack's index first ends the gesture and loses the permission with no error anywhere.
   ~~The UI needs somewhere to say "sound is off until you click".~~ **Not needed, 2026-09-22** —
   nothing can be heard before a click, so that line could only ever be read by somebody who had
   already clicked.
2. **The files are `.mp3`.** `README.md` says save as `.wav`/`.ogg`; `INTEGRATION-STUB.md` says
   files live "as `{Filename slug}.ogg`". The generated pack is MP3. Use the manifest, not the
   prose.
3. **`bgm_game_main` does not exist.** The stub names it; the bed is `bgm_game_aether_voyage`.
   Map through the manifest rather than through the stub's example names.
4. **Guests need the files too.** Anything not added to the guest gateway's public list is silence
   for every remote player. The host map and the gateway map both need the whole pack, added by a
   loop over the manifest rather than 88 hand-written lines.
5. **5.3 MB over a `trycloudflare` tunnel.** Fine on the host; it is a real download for a remote
   guest on a phone. Load lazily and never block play on it.

---

## The architecture decision that makes this small

**Audio is a second consumer of the event feed the board already reads.**

Stage A.6 built `game/ui/table-notices.mjs`: a pure module that takes
`live.telemetry.recent`, a `seen` set and the viewer's seat, and returns the rows worth reacting
to. The notice UI is one consumer. **Audio is another**, with a different filter.

That matters because `INTEGRATION-STUB.md` proposes hooking audio into the board at a dozen
separate points — cast, ETB, combat, life, poison, wipe, tokens, proliferate, turn, win/lose. Every
one of those is already a row in the feed, arriving on the same 750 ms poll, already deduplicated
by event id. Hooking them separately would mean a second set of triggers to keep in step with the
first.

**Checked row by row** against `game/tools/match-telemetry.mjs`:

| Pack event | Feed row | |
|---|---|---|
| Attack / block declared | `GameEventAttackersDeclared` / `…Blockers…` | ✅ |
| Combat damage, commander damage | `GameEventPlayerDamaged` (+ `· commander damage`) | ✅ |
| Life gain / loss | `Life X → Y`, and `lifeDelta()` already gives the sign | ✅ |
| Poison | `GameEventPlayerPoisoned` | ✅ |
| Destroy / exile / dies / ETB / mill | `GameEventCardChangeZone` labels | ✅ |
| Draw | `Drew a card` (viewer only) | ✅ |
| Counter spell | ~~`GameEventSpellRemovedFromStack`~~ — **corrected 2026-09-22.** Only `public-stack.mjs` sees that kind; `match-telemetry.mjs` drops it, so a countered spell never reaches `recent`. | ❌ no row |
| Proliferate | `mechanic-choice-completed` | ✅ |
| Your turn | ~~`GameEventTurnBegan`~~ — **corrected 2026-09-22.** That kind does not exist anywhere in this repo. Derived from the untap step instead: the one step every turn begins with and in which nobody receives priority (CR 502). | ✅ derived |
| Victory / defeat | `state.gameOver` + `health.status` | ✅ |
| Cast (all 60 type/tribe/subtype clips) | `GameEventSpellAbilityCast` + `typeLine` | ✅ |
| **Create tokens** | needs a *batch* — R10 says one clip per batch, not per token | ⚠️ derive |
| **Board wipe** | needs "many permanents died at once" — R9 says once per wipe | ⚠️ derive |
| **Equip / crew** | needs to know the ability *is* an equip or a crew | ❌ card semantics |

The two ⚠️ are derivable from the feed with a window: several `Created → Battlefield` rows in one
event batch is a token batch; several `Died` rows in one batch is a wipe. The ❌ needs
`CrankCardScript@1` from the engine plan (#305) — the same dependency the two blocked alerts have.

---

## Phases

Each its own PR with a test that was red first, in the repo's usual way.

### 1. The pack lands and is served — **done, #341**
`game/ui/assets/audio/` (83 SFX + 5 BGM). `game/ui/assets` already holds 6.7 MB of playmats, and
`tests/page-budget.mjs` counts **visible words, not bytes**, so nothing budget-wise objects.
Host and gateway serve them by looping the manifest. A test asserts **every manifest slug resolves
to a file and every file is in the manifest** — the failure mode otherwise is one silent 404 per
missing clip, which nobody notices until a game is quiet in one specific place.

### 2. The audio engine, headless and tested — **done, #342 and #345**
Split in two, because the halves have nothing to say to each other.
`game/ui/play-audio-rules.mjs` is R1–R7 and R13 as pure functions of a type line and has never
heard of a speaker; `game/ui/play-audio.mjs` is two Web Audio `GainNode` buses, lazy decode and
the crossfade, with the context, fetch and storage injected so it runs headless.
The rules took three decisions the workbook left open — all ten subtype voices rather than the
three R3–R5 name, the tribe list past R6's ellipsis, and Snow riding R2's overlay path — each
marked where it was made.

### 3. Events wired through the existing feed — **done, #344**
`game/ui/play-audio-events.mjs`, a second consumer of the same `recent` the notices read, with its
own filter and its own `seen` set. R9's board wipe is measured against the glossary's own "most or
all ... at once" rather than against an invented count; R10's token batch reads `isToken` off the
card, because the label cannot tell a token from anything else arriving. **Nothing new hooks into
the board's guts.**

### 4. BGM, and the gesture problem — **done, #346**
Lobby bed on the lobby, game bed on the board, combat bed through any `COMBAT_` step, tension bed
at two-thirds of each lethal clock (7 of 10 poison, 14 of 21 commander damage), victory linger on
game over. The context is built and resumed **synchronously inside the first pointerdown** —
awaiting the pack's index first would end the gesture and lose the permission with no error
anywhere. No "sound is off until you click" line was needed in the end: nothing can be heard
before a click, so the note would only ever be read by somebody who had already clicked.

### 5. Settings — **done, #346**
SFX volume, BGM volume, mute — the three `ui` rows, in View options beside the card size.
Persisted as `crankmagic-audio-*`, matching `crankmagic-card-zoom` and `crankmagic-board-width`.
**Not muted, at 0.5 and 0.18** — see question 1 below for where those numbers came from. Muting
disables the sliders rather than hiding them and keeps the volumes, so unmuting returns the mix
the player chose. Nothing is drawn at all until the engine is running, because a slider that
cannot change anything is worse than no slider.

---

## What I would not do

- **Not hook audio into the board at a dozen points** as the stub suggests. One feed, two
  consumers.
- **Not commit the generator scripts or the ElevenLabs key path.** The pack regenerates from
  outside the repo; the repo takes the output.
- **Not start on this before the engine work Rob has sequenced ahead of it**, unless he says
  otherwise. This plan is ready to execute, not started.

---

## Open questions for Rob

1. ~~**Default volume, and default muted or not?**~~ **Settled 2026-09-22, from the pack rather
   than from taste.** The pack names no numbers but states the ratio twice — every BGM index row
   says "Duck under SFX", and the generated README says the beds sit "~-6 to -12 dB relative". The
   middle of that is -9 dB, so **0.5 SFX and 0.18 BGM**; only the SFX figure was a choice. Not
   muted, and no "sound is on" line is needed after all: a browser plays nothing until the player
   has clicked, so the first sound always arrives after they have reached for the board.
2. ~~Generate the two missing beds?~~ **Done 2026-09-21** — both are in the pack.
3. ~~**Guests: ship the pack to them, or host-only for now?**~~ **Shipped to guests, 2026-09-21.**
   Both maps are driven from one walk of disk, so the two cannot drift. If 5.3 MB over the tunnel
   turns out to hurt a phone, the fix is lazy loading rather than a second list.

---

## Where this ended up

All five phases are merged or in flight as of 2026-09-22, in six PRs (#341 and #342–#346).

**Heard in a real game, 2026-09-22.** A two-seat match against the native Forge AI, driven from a
browser the way a player drives it, fetched these and nothing else in its first few turns — with
no page errors:

```
bgm/bgm_lobby_mythic_calm.mp3      the lobby, before the table went live
bgm/bgm_game_aether_voyage.mp3     crossfaded in when it did
sfx/sfx_event_draw.mp3             the viewer's own draw
sfx/sfx_play_land.mp3              a land
sfx/sfx_event_etb.mp3              a permanent arriving
bgm/bgm_combat_battle_shimmer.mp3  crossfaded again at the first COMBAT_ step
```

That is the whole chain in one line of evidence: engine event → journal → `match-telemetry` →
`play-audio-events` → `play-audio` → network. **Not yet heard in a four-player pod**, where the
board wipe and the token batch are likeliest to turn up.

**Three clips can never play**, each for a reason recorded in `UNREACHABLE_FROM_THE_FEED`:
`sfx_event_counterspell` needs a telemetry row that does not exist; `sfx_event_equip` and
`sfx_event_crew` need to know an ability *is* an equip or a crew, which is `CrankCardScript@1`
from the engine plan — the same dependency the two blocked board alerts wait on.
