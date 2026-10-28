# Session B · Play combat

Repo minorrob/mtg-deck-matrix. Branch `claude/r4-b-combat` from `integration/r4` after D1 has merged. PR against `integration/r4`; do not merge.

Read first: `00-task-list.md`, `01-unified-change-set.md` §0–§2 (X2, X3) and §3.3, §1 (RQ-12), `AGENTS.md`, `docs/ACTIVE.md`, Design System READMEs `Button`, `StatusChip`, `Drawer`. Frames: W05, W06 (r2: one scrolling row), W07, W08, W09, W10 and their element indexes. Source today: `crankmagic-board.js` `combatStrip()`, `blockDraft()`, the blocking foot (`"No blocks"` / `"Confirm blocks"`), `blockValid()`, `legalBlocks` use, ROB-26 / ROB-168 numbering, #878 attack-all, `attackRisk()`.

## Scope

CH-20 … CH-25. Files: `crankmagic-board.js` combat functions only (`combatStrip`, `blockDraft`, the blocking branch of `decision`'s foot, `attackRisk` display), combat CSS in `crankmagic-stage.css`. Not: the general desk (A), card clicks (C), shell (D1).

## Change

1. **CH-20 Strip (W05 r2, W07).** Section heading "Combat · blocks" (it holds the draft now); whole-set status in the strip ("The table accepts this draft" / "3 of 9 settled"); one tile per attacker: attacker thumb, three tight rows (Attacking · → · defender's name), defender thumb(s) or a dashed empty slot after Don't block, the state word in the top-right corner 6px from the edge (needs a choice / ✓ ready / ✗ + reason from `legalBlocks.reasons`). States by border + glow + word: unsettled dashed gold glow, ready solid emerald, refused `color-required`. Clicking a tile opens that attacker in the desk.
2. **CH-21 One row (W06 r2).** Tiles never wrap: a thin right arrow the height of a tile scrolls by one tile (keyboard → when the strip has focus); "+N more" as accent-colored `small` (13px) subtext above Send blockers, aligned to the tiles' top edge; a left arrow appears once scrolled.
3. **CH-22 Send blockers.** Far right, the sapphire primary (the only one on the board during blocks), disabled until every attacker is settled, tooltip "stays private until sent" and, when disabled, why ("1 attacker still needs a choice"); no lock glyph (D13). Nothing is sent before it.
4. **CH-23 Desk per attacker (W08–W10).** Title "Block <attacker>"; the attacker is already chosen (no selection inside the desk); desk card + facts line ("4/1 · attacking you · haste"); legal blocker tiles with thumb, name and effective P/T, hover pops the card, `aria-pressed` inverts to ink (not green: X2), a second click clears (no "Clear this blocker"); several blockers on one attacker (D14); a blocker moved from another attacker unsettles that one; Don't block (secondary) + Confirm (secondary, tooltip "this attacker only", D12/X3): Confirm saves this attacker's blocks only and sends nothing; after Don't block the tile reads ready with the dashed slot. Removed: "stays private until confirmed", "Attackers for … select again to remove", "#486" numbers, "All block options".
5. **CH-24 Twins (C4/D6).** Same-named creatures carry a small corner mark (a, b, c) on the thumb in the strip and the desk; hover or focus lights the card on the table; the engine's ids stay underneath for tests and the log.
6. **CH-25 Attacks + RQ-12.** Declaring attackers keeps "All at <player>" / None and the attack-risk hints; the way back is None / unpick; the declared set stays a private draft until Confirm.

## Acceptance

- Two attackers: strip shows two tiles, Send disabled with the tooltip naming the unsettled count; settling both enables it; sending once updates the public strip.
- Nine attackers: no wrap; the right arrow scrolls one tile; "+7 more" shows and counts down; the left arrow appears after a scroll.
- Refused draft: the tile turns refused with the reason text from `legalBlocks.reasons`.
- Desk: a chosen tile shows inverted-to-ink, not accent; a second click clears it; two blockers on one attacker allowed when legal; moving a blocker unsettles its old attacker.
- No visible "#<id>" in strip or desk; twins show a, b marks; hovering a tile adds `is-lit` to the table card.
- Full, Table, Focus and phone; 1440/390; three themes. Privacy tests pass (a draft never leaves the seat before Send).

Test: `tests/table-board.mjs` combat cases, `tests/board-choice-stacks.mjs` (attack all), the privacy suite; breaks scripts; `tools/local-ci.sh`; one green Actions run. PR title `r4 B: combat strip and blocker desk`. Stop.
