# Card load, 2026-10-23: the next most-played cards and the candidates, six sessions

Rob, 2026-10-23: *"I want to run another 6 sessions in parallel to load the next big batches of cards ... I will then return
here when they all opened a PR and committed, and you'll handle merging them all as one merge to avoid conflicts."*

## What is in it

Rob's library is nearly loaded (`docs/engine/library-load-2026-10-21/`, Linear ROB-183): 4 of its cards are still unloaded,
and the 8 candidates still wait for review. So this batch reaches past the library into the most-played Commander cards,
`data/engine/top-cards.json`, the 3,239 cards that fill 80% of Commander deck slots. 1,677 of them are not yet defined.

The six sessions hold **333 cards**:

| | Cards | Where from |
| --- | ---: | --- |
| **To write** by hand | 189 | The 185 most-played cards that no table plays and no candidate covers (ranks 313 to 1,031), and the library's last 4 (Cunning Wish, Extrapolate the Impossible, Teferi, Mage of Zhalfir, Bludgeon Brawl) |
| **To review** and promote | 144 | Every candidate among the most-played cards (136) and Rob's 8, three of them in his live decks: Absorb (D7), Goblin Sledder (D6), Blossoming Defense (D3) |

The cards to write are dealt by theme, so one lane owns each rule its cards need, most-played first, as the waves were run
(`docs/handoff-2026-10-12.md` §5). A review builds no rule, so the candidates go to their theme's lane while it has room
and otherwise to the lightest one. Each session holds 55 or 56 cards.

| Session | Lane file | To write | To review | Branch |
| --- | --- | ---: | ---: | --- |
| 1 | `lane-L1-stack.json`: the stack, walkers and two-faced cards | 24 | 31 (Absorb) | `claude/engine-w4d-l1-stack` |
| 2 | `lane-L2-graveyard.json`: the graveyard | 33 | 22 | `claude/engine-w4d-l2-graveyard` |
| 3 | `lane-L3-combat.json`: combat and equipment | 29 | 26 | `claude/engine-w4d-l3-combat` |
| 4 | `lane-L4-mana.json`: lands and mana | 30 | 26 | `claude/engine-w4d-l4-mana` |
| 5 | `lane-L5-tokens.json`: tokens, counters and sacrifice | 33 | 23 (Goblin Sledder) | `claude/engine-w4d-l5-tokens` |
| 6 | `lane-L6-spells.json`: spells, draws and discards | 40 | 16 (Blossoming Defense) | `claude/engine-w4d-l6-spells` |

- **Which wave this is:** wave 4d of `docs/handoff-2026-10-12.md` (Linear ROB-93), with its leftovers (Sylvan Library,
  Ragavan, Arena of Glory, Dauthi Voidwalker, Birgi, Emry, Six, The Earth Crystal) placed in the lanes whose themes own
  their constructs.
- **What the files are:** `BRIEF.md` holds the rules every lane follows, and `PROMPTS.md` the six copy/paste prompts.
- **What a lane file holds:** `cards` (to write) and `review` (to promote), each most-wanted first. `index.json` holds
  every card's tier when this was built.

## The merge: one integration, not six

The sessions do not merge. Each pushes its branch and opens a **draft** PR. When all six are up, the session that built
this (on `claude/focused-feynman-tt20o3`) merges them as one, in five steps:

1. **Merge the branches.** Each lane merges in order (L1 to L6) into one integration branch, with merge commits.
2. **Regenerate.** Every generated file is regenerated once, from the merged directory: `definitions.mjs`, `coverage.md`,
   `catalog.md`, `engine-catalog.json`, the README's suite count and the data inventory. So are the candidate store
   (`node game/tools/card-compiler.mjs --write`) and the module playtest tables seat from it
   (`node game/tools/engine-candidates.mjs --write`).
3. **Resolve the code.** Where two lanes built the same rule, one implementation is kept and the other lane's breaks are
   retargeted to it. `anchors.py` re-anchors any break a merge moved.
4. **Verify.** `check-cards`, the engine suites, the seeded games and `--check-lane` for every lane file.
5. **Open one PR.** It closes the six lane PRs as superseded by it.

## Rebuilding this

```sh
# the library collection, from the workbook (docs/engine/library-load-2026-10-21/README.md, "Rebuilding this")
node --stack-size=4000 tools/library-engine-index.mjs --live /tmp/collection.json --top 185 --lane-size 45 \
  --rides faces:walkers,walkers:stack --review-by-theme --out docs/engine/card-load-2026-10-23
node tools/library-engine-index.mjs --check-lane docs/engine/card-load-2026-10-23/lane-L1-stack.json   # cards and review
```
