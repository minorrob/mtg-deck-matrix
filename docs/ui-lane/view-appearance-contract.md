# Contract: `appearance`, what a permanent looks like when it is not its own card (Linear ROB-329)

Status: proposed and built on 2026-10-31 by Claude (engine half and board half in one PR, the contract written first).
Additive to `CrankRoomView@1`; no existing field changes and no seat that ignores the key notices it.

Rob, 2026-10-30, mid-game: *"when using Oko, Thief of Crowns and turning an artifact into a 3/3 green Elk creature, you
didn't change the card art to that token image. The power/toughness updated, but the card image should also update."*

## The gap

The view sent a permanent's name (`name`, the card it is) and its current `types`, `power`, `toughness`, `keywords`. A name
cannot say what the permanent now looks like, so the board drew the artifact's own art on a 3/3 Elk. ROB-207 added the first
field of this kind (`face: "back"`); this is the second.

## The field

On a battlefield card, to every seat that can name it (as `name` is), only while it applies:

```json
"appearance": {"token": "Elk", "colors": ["G"], "subtypes": ["Elk"], "power": 3, "toughness": 3}
```

| Key | Meaning |
| --- | --- |
| `token` | The name of the token it looks like: its creature types, in order, joined by a space (`"Elk"`). The board draws that token's picture. |
| `colors` | Its current colors (layer 5), WUBRG letters. |
| `subtypes` | The creature types an effect set on it (layer 4), the ones `token` is made of. |
| `power`, `toughness` | Its base power and toughness (layer 7b), before counters and pumps, as a token's picture prints them. |

`name`, `types`, `power`, `toughness` and the rest keep their meaning: `name` is still the card it is (the artifact), and
`power`/`toughness` are still the current figures with counters and pumps.

## When it is present, and when it is not

Present when, in the permanent's current characteristics, **an effect set its creature types and it has lost all
abilities**: "becomes a green Elk creature ... loses all abilities" (Oko, Thief of Crowns' +1 on an artifact or a creature,
Kenrith's Transformation). That pair is what makes a permanent look like a token rather than
the card: a permanent that keeps its abilities is still recognizably its card (an animated Vehicle, Duplicant, Mirror Entity).

Absent (the key is not there, as `face` is absent for a front face):

* an ordinary card, a token that is what it was created as, a card in any zone but the battlefield;
* a face-down permanent (no name, so nothing to look like; CR 708.2a);
* once the effect ends (Aura left, the permanent left the battlefield): the next view has no key, so **the board reverts with
  no state of its own**.

Not covered, filed rather than faked: a copy (`becomeCopy`, Hall of Echoes; the copy's name and picture are a different
contract) and a card turned face up.

## Who draws what

* **Engine** (`game/engine/projection.mjs`, `game/engine/rules/layers.mjs` `lookOf`): derives it from the layers, public like
  `name`. Tests: `tests/room-view-appearance.mjs`.
* **Board** (`crankmagic-board.js`, `pictureOf`): draws the token picture (Scryfall, by the token's name) instead of the
  card's, keeps the card's own name on the card, draws a small mark on it, says in its label what it looks like, and offers the
  original art one press away in the card's menu (Original: the card's own picture, in the inspector). The hover and the
  large pop-up draw the same picture as the card. Tests: `tests/board-oko-elk-art.mjs`.
