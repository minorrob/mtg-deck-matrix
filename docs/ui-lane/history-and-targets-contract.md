# Contract: targets on the stack, structured history, "load earlier" (`CrankRoomView@1`, additive)

Linear ROB-327 (targets seen on the stack, while resolving, and in the History) and ROB-332 (the whole game's History,
who did what to whom, card names that hover). One change to the room's view, written before either half is built
(2026-10-31, Claude; Rob's answer on ROB-334, 2026-10-30: *"load earlier is acceptable. The room sends the newest N lines
plus a request for older ones; the board scrolls back through them."*).

Everything here is **additive**: no field is renamed or removed, `text` and `mark` stay, and a client that reads none of
it behaves as before. Everything here is **public**: the same for every seat and for a spectator, built from what the
table already says to everyone (`game/room/history.mjs`, `game/engine/projection.mjs`).

## 1. What a stack entry is aimed at

`view.state.stack[i]` keeps `targets` (the engine's raw choices, as before) and gains:

```
aimed:      Aim[]                        every target of the entry, flat, in the order chosen ([] when it has none)
aimedModes: [{text, aimed: Aim[]}]       only on an entry whose modes were chosen (CR 700.2) and where at least one
                                         mode has a target: each such mode's own words and its targets, in the order chosen
```

An `Aim` is one of:

| Shape | Means |
| --- | --- |
| `{kind:"player", id, name}` | a player (`id` = `playerId`) |
| `{kind:"object", id, name, zone}` | a card, permanent or spell anyone can see; `zone` is `battlefield`, `graveyard`, `exile`, `stack` or `command`. `id` is a `cardId` of the view, so `findCard(id)` finds it |
| `{kind:"object", id, name:null, hidden:true}` | aimed at, but it cannot be named (face down, or in a hidden zone) |
| `{kind:"object", id, gone:true}` | **it has left**: a zone change makes a new object (CR 400.7), so the id is no longer anywhere. No name is given, so no stale name can be drawn |
| `{kind:"ability", id, name, gone?}` | a spell's or ability's entry on the stack (`id` = its `stackId`); `name` like "Fauna Shaman's activated ability" |

A counted target ("up to two target creatures") is flattened; a target not chosen yet is left out (`aimed` fills in as the
entry's targets are chosen: a trigger's, a moment after it is on the stack).

## 2. A history line, structured

`view.history[i]` (oldest to newest, as today) is now:

```
{turn, seq, text, mark?, actor?, source?, targets?, modes?, cards?}
```

| Field | Means |
| --- | --- |
| `turn`, `text`, `mark` | as before. `text` stays the full sentence ("Maya cast Lightning Bolt targeting Rob") so an old client works |
| `seq` | a number, **unique and strictly increasing; 0 is the game's first line**. Never reused, kept when the room is put away and woken (a room saved before this has its lines numbered from 0 when it wakes). A draw line that grows keeps its `seq` |
| `actor` | the `playerId` who did it (absent for the game's own lines) |
| `source` | `{name, ref}`: the card (or the card whose ability) that acted. Absent when it has no public name |
| `targets` | `Aim[]` as it was when the line was written (a history is a record: it says what the spell was aimed at *then*). `gone` is never set on a line |
| `modes` | `[{text, targets: Aim[]}]`, on a modal spell with a targeted mode |
| `cards` | `[{name, ref}]`: every card named in `text`, **in order of appearance**, so the board can wrap each name. `ref` is the engine object id when the line was written (a zone change makes a new object, so it may no longer be in the view; the picture is found by `name`). Only a card that is public appears: a face-down card and a card moving between two hidden zones are never named |

Wording the engine half adds: a cast line names its targets (`Maya cast Lightning Bolt targeting Rob`; two targets,
`targeting Bear and Rob`; modal, `Maya cast Kolaghan's Command: <mode> → Rob; <mode> → Sol Ring`); an activated ability
has a line (`Rob activated Fauna Shaman's ability targeting Bear`); a spell that fizzled says so (`Lightning Bolt fizzled:
its target is gone`) instead of "resolved". Nothing is said for a spell with no target beyond what it said.

## 3. How the whole game reaches the board: the newest lines, and "load earlier"

* `view.history` is the newest `HISTORY_VIEW` lines (was 120). `view.historyFirst` is the `seq` of the oldest line the room
  holds (0, unless the room was saved before lines were numbered). A client has everything once it holds `historyFirst`.
* The room now **keeps the whole game's lines** (it kept 300). They are stored in sealed segments of 200 lines, each its own
  storage key beside the room's (`room/<matchId>/history-NNNNN`), so the room's own record stays small; the newest lines
  stay in the record. An old record has no segments and wakes as before.
* **Ask for older lines** over the room's socket (a seat's or a spectator's):
  `{type:"history", before:<seq>, limit?:<1..200, default 100>}`
  and the room answers the asker alone:
  `{type:"history", before:<seq>, lines:[...], first:<seq>}`
  `lines` are the up-to-`limit` lines with `seq < before`, **oldest to newest**; `first` is `historyFirst`. Asking with the
  `seq` of the oldest line held returns the page before it; an empty `lines` means there is nothing older. The room method
  is `room.historyBefore({before, limit})` (the same for every seat, as the history is public).
* **The client merges by `seq`**: a view's lines replace lines of the same `seq` (a draw line grows), and a view whose
  oldest `seq` is more than one past the newest the client holds (a gap: many AI turns in one slice) starts the client's
  store again from that view, and "load earlier" fills what is above it.

## 4. Bandwidth

Measured in `tests/game-history.mjs`'s games; the number is reported on the PR. Fields are only present when they have a
value, `cards` carries names once, and a view carries fewer lines than before (older ones are one request away).

## 5. Out of scope here (filed as Linear issues)

* A *triggered* ability's targets in the History (a trigger's targets are chosen after it is on the stack; no event says
  them). The stack shows them (`aimed`); the History does not yet.
