# Play UX validation — 2026-09-15

## Current behavior

The Play setup is the page canvas. Live play has one toolbar, an optional opponent column, the selected primary mat, the human hand, and an optional Card/Tracker/History pane. Board resizing is anchored at the top left. Phase names use main phase 1 and main phase 2.

Card actions use a non-modal panel with a 240px image and actions below it. Hand and command-zone drags request engine actions; battlefield drags only arrange cards. Automatic type groups fan when crowded; manual groups can be created and individual cards can be dragged back out. Automatic layout is available from the card panel. Battlefield group positions are session-local.

Casting is visible during payment and while on the stack, including after reload. The stack projection distinguishes spells and abilities, removes cancelled/resolved objects, and does not expose hidden names. The payment planner runs only during an explicitly requested cast/activation. Normal mana-color choices during payment are selected from the remaining cost; actual affordability remains engine-owned. Mana displays count tapped/untapped sources by color and distinguish floating mana. Shared multicolor sources are not additive or a guaranteed spendable total.

Empty opponent priority stops advance automatically. Effects on the stack, required choices and normal end-step response windows remain. Yield also skips the empty end-step stop. Until target/impact coverage is complete, yielding conservatively stops for any stack effect, not just effects targeted at the human.

History retains observed public identities after a card/token leaves play. It reports casting, known targets, resolution, damage, zone transitions, counters, poison, mana-pool changes, shuffles, combat declarations and phase changes. Card search, optional phase display and progressive event loading keep long games usable. Private draws, library order and raw choice descriptions are excluded. Damage earlier in the same turn is supporting context, not a claim of proven causality. Full causal chains, missed triggers, undo reconciliation and comprehensive loop accounting remain open.

## Evidence

- The prior checkpoint verified a human draw-step pause, one library double-click drawing exactly one card, no duplicate draw, and a direct land drag entering the battlefield.
- Live Contentious Plan casting paid automatically using Sol Ring and Fellwar Stone, with no Auto click or color prompt. It remained visible on the stack. Proliferate retained the human selection step; completing it moved the spell to the graveyard and drew one card.
- Empty opponent phases progressed automatically, while opponent spells and triggers retained response windows.
- At 1440×900, the card action panel displayed a readable image without dimming the mat. Hiding both side panes expanded the board. Dragging Sol Ring onto Throne of Geth created a visual group; dragging it onto empty mat space removed it from the group.
- The missing Inkling was hit for 4 by Krenko's Cinder Strike on turn 25 and moved to the graveyard. A regression test now reconstructs this history even when no current visible card remains and the browser/host reloads.
- Opening shuffle events exist for all four players. The Atraxa library contains 17 creature front faces among 99 cards; the chance of seeing none in the first 13 cards is approximately 7.21%. No draw smoothing or creature/land injection is applied.
- `ShuffleAudit` verified 100 successive 99-card shuffles against standard Java Random, with no lost/duplicated cards and no reset to the previous order. Fresh preparation uses a cryptographic random seed; subsequent engine shuffles advance the seeded stream.
- Eighteen companion tests pass. The Java adapter and shuffle audit compile against the pinned Forge jar. The first PR CI run passed all required repository suites; later changes require a fresh passing run before merge.

## Remaining limits

Local Forge and its host must remain running. Journals are not durable game-position checkpoints. Native AI is available; API pilots and invited human seats are not implemented. Some complex engine decisions still use the native window. Token artwork and conditional mana-source reporting are incomplete; exact rules and payment restrictions remain enforced by Forge.

## Combat and coaching update

- Combat uses the engine's selected defender and legal card action labels. The defender is highlighted; each creature shows its attack or block assignment. Confirmation is labeled **Confirm attackers** or **Confirm blockers**.
- The **Combat** pane shows attacker/defender/blocker pairs and attacking power, including overlapping commander and infect power. These are explicitly not a damage prediction. Its recap records spells, abilities, actual damage, life/poison changes and battlefield exits during combat, and retains the final declaration after combat ends.
- **Recommended actions** is an optional, collapsible local coaching panel for the human's turn. It reacts to phases, pending choices, the human hand, engine-offered actions and public boards. It explains suggestions; it does not execute them or claim optimal play. It never reads opposing hands or hidden library order. API coaching is not connected.
- Empty combat review windows are retained unless the human yields through the turn. Effects on the stack still stop a yield.
- New combat assignment telemetry requires a game launched with the updated adapter; older saved journals retain their existing events but cannot recover assignments that were never recorded.

Validation: 22 companion tests passed, including coaching privacy, phase gating, combat totals and a retained combat recap. Adapter compilation passed. Fresh-game browser validation is in progress.
