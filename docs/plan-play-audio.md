# Play audio: sound effects and background music — scope and plan

**Asked for by Rob, 2026-09-21:** integrate the sound effects and the lobby, combat and general
background music from `crankmagic-audio-pack`.

---

## What the pack actually contains, measured

Source: `C:\Users\robmi\OneDrive\Desktop\crankmagic-play-audio-generated\crankmagic-audio-pack`.

| | |
|---|---|
| Index rows | **91** (`sound-index.json`, `.csv`, and the workbook) |
| Generated audio files | **86** — 83 SFX + 3 BGM beds |
| Total size | **4.3 MB** |
| Rows with no file | **5** — see below |
| Resolution Rules | **13** (R1–R13), a sheet in the workbook |

**By kind:** creature tribe 39, event 23, subtype 10, card type 9, bgm 5, ui 3, supertype 2.
**By priority:** P0 25, P1 55, P2 11.

**The three BGM beds that exist:** `bgm_lobby_mythic_calm` (60s), `bgm_game_aether_voyage` (75s),
`bgm_combat_battle_shimmer` (45s).

### The five rows with no audio

| Row | Consequence |
|---|---|
| `bgm_tension_darkening_myth` | **R11 asks for a tension bed under poison and commander-damage thresholds. It does not exist.** Either drop that rule or generate the bed. |
| `bgm_victory_linger` | No victory bed; the victory *SFX* row does exist. |
| `setting_sfx_volume`, `setting_bgm_volume`, `setting_mute_all` | Specifications, not sounds — they describe the Settings panel to build. |

---

## What the pack assumes that is not true here

Worth fixing in the plan rather than discovering during integration.

1. **Browsers will not play audio before a user gesture.** R11 says *"start `bgm_game_main` when
   the live game becomes ready/playing"*. On a page the player has not clicked, that call is
   rejected and the bed never starts — silently. **BGM must arm on the first interaction** and the
   UI needs somewhere to say "sound is off until you click". This is the single biggest thing the
   pack does not account for.
2. **The files are `.mp3`.** `README.md` says save as `.wav`/`.ogg`; `INTEGRATION-STUB.md` says
   files live "as `{Filename slug}.ogg`". The generated pack is MP3. Use the manifest, not the
   prose.
3. **`bgm_game_main` does not exist.** The stub names it; the bed is `bgm_game_aether_voyage`.
   Map through the manifest rather than through the stub's example names.
4. **Guests need the files too.** Anything not added to the guest gateway's public list is silence
   for every remote player. The host map and the gateway map both need the whole pack, added by a
   loop over the manifest rather than 86 hand-written lines.
5. **4.3 MB over a `trycloudflare` tunnel.** Fine on the host; it is a real download for a remote
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
| Counter spell | `GameEventSpellRemovedFromStack` | ✅ |
| Proliferate | `mechanic-choice-completed` | ✅ |
| Your turn | `GameEventTurnBegan` | ✅ |
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

### 1. The pack lands and is served
`game/ui/assets/audio/` (83 SFX + 3 BGM). `game/ui/assets` already holds 6.7 MB of playmats, and
`tests/page-budget.mjs` counts **visible words, not bytes**, so nothing budget-wise objects.
Host and gateway serve them by looping the manifest. A test asserts **every manifest slug resolves
to a file and every file is in the manifest** — the failure mode otherwise is one silent 404 per
missing clip, which nobody notices until a game is quiet in one specific place.

### 2. The audio engine, headless and tested
`game/ui/play-audio.mjs`: two Web Audio `GainNode` buses, lazy decode, an 80 ms duplicate throttle
(R13), and **the resolution rules as a pure function** —
`resolveCardSounds(typeLine, keywords) → [slug]` implementing R1–R7, including the tribe priority
order and the Legendary overlay. Pure, so the tribe order is tested without a browser or a sound
card. No file plays in the test; the function returns names.

### 3. Events wired through the existing feed
A second consumer of `table-notices.mjs`, with its own filter. Token-batch and board-wipe windows
(R9, R10) derived here and tested. **Nothing new hooks into the board's guts.**

### 4. BGM, and the gesture problem
Lobby bed on the lobby, game bed on the board, crossfade to combat when attackers are declared and
back afterwards (R11) — minus the tension bed, which does not exist. Arms on first interaction;
says so until then.

### 5. Settings
SFX volume, BGM volume, mute — the three `ui` rows. Persisted as
`crankmagic-audio-*`, matching `crankmagic-card-zoom` and `crankmagic-board-width` on the board
today. **Default: muted or low**, because a person starting their first game should not be
startled by their own laptop.

---

## What I would not do

- **Not hook audio into the board at a dozen points** as the stub suggests. One feed, two
  consumers.
- **Not ship the tension bed rule (R11) as if the bed exists.** It does not.
- **Not commit the generator scripts or the ElevenLabs key path.** The pack regenerates from
  outside the repo; the repo takes the output.
- **Not start on this before the engine work Rob has sequenced ahead of it**, unless he says
  otherwise. This plan is ready to execute, not started.

---

## Open questions for Rob

1. **Default volume, and default muted or not?** My recommendation is audio on at ~40% SFX / 25%
   BGM but a **one-time "sound is on" line** the first time, so nobody is ambushed.
2. **Generate the two missing beds** (`bgm_tension_darkening_myth`, `bgm_victory_linger`), or drop
   R11's tension rule and the victory bed?
3. **Guests: ship the pack to them, or host-only for now?** 4.3 MB over the tunnel on a phone is
   the trade.
