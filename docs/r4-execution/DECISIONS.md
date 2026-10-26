# Execution decisions

These decisions implement the revised plan Rob approved. Source rulings remain visible in `source/`.

| ID | Resolution | Reason |
| --- | --- | --- |
| EX-01 | Create integration before S0; do not merge foundation alone to main. | Tokens and adapted screens should reach main together. |
| EX-02 | Coordinator starts immediately and merges dependencies throughout the effort. | D1 must integrate before dependent Play work can proceed. |
| EX-03 | One writer handles D1, A, B, C and D2 sequentially; reviewers can work in parallel. | Those packets share board functions, CSS and tests. |
| EX-04 | HUD size is a continuous 100-200% slider, previews live and saves on release, per device. | Preserve the repository's standing size-control rule and device-specific fit. The account-synced segmented proposal is not adopted. |
| EX-05 | Board captions are at least 15px at scale 1; general UI text is at least 12px. | The CH-31 11-12px line contradicts the r4 HUD scale. |
| EX-06 | Interaction transitions use the 160ms system duration; reduced motion is immediate. | The CH-12 250ms slide conflicts with the global motion contract. |
| EX-07 | Keep a compatible palette/register representation and deterministic migration of historical preferences. | The supplied application script and packet use different theme names. Never lose a valid saved preference or flash an unrelated theme. |
| EX-08 | Cancel clears an unsent draft; Don't is offered only when the engine permits declining; submitted Undo is server-authorized. | Mandatory effects cannot be skipped and hidden information cannot be rewound by the UI. |
| EX-09 | Separate Admin UI from backend authorization; v1 feature-switch and health displays are read-only. | The audit's first slice is read-only. Editable production switches are not silently added by a broader packet. |
| EX-10 | Retain newer Play backgrounds, graphics and Planned Changes behavior from main. | The packets were written against an older snapshot. |
| EX-11 | Extend existing untap, land take-back, sharing and game-record paths before creating replacements. | Several packet requests already have tested foundations. |
| EX-12 | Preserve meaningful existing assertions when migrating supplied tests. | Replacing tests wholesale must not remove behavioral coverage. |
| EX-13 | Stage source commits from the integration branch only after combined acceptance. No production release. | Preserve one release owner and a reviewable rollback target. |
| EX-14 | Apply the 15px scaled HUD floor to game-state captions and facts; preserve explicit component typography for Coach and Camera forms, with the general 12px floor. | M's blanket board-DOM sentence conflicts with the specified 36px Coach header, 22px Questions row with 13px text, and 13px Camera labels. Concrete component metrics take precedence over that blanket sweep; game-state text does not inherit those exceptions. |

The general undo house rule follows the packet's intended capability, but its availability and window are
defined by the room contract and server checks. UI visibility is not evidence an undo is legal. A default
must not retroactively change an existing game's rules.
