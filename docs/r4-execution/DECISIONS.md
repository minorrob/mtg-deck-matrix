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
| EX-15 | Keep the legacy 16:9 mat shape in Table and Focus where it fits both complete zone rows and their chrome. When the scaled header and battlefield/lands row minima cannot fit, grow the mat vertically and scroll its viewport. Preserve card aspect ratios, column widths, normal row gaps, horizontal fit and hand clearance. | Actual four-seat captures showed Lands reduced to clipped strips; the real-room Focus1280×800 case also placed its Library draw control behind the hand. CH-33 explicitly requires at least one usable row on each side of the divider; that requirement takes precedence over the older mat aspect ratio. Geometry checks must cover the conditional minimum rather than discard aspect checks everywhere. |
| EX-16 | Measure the public card badges to establish a readable minimum. In Table, retain the continuous 60–160 control by applying its natural size delta above that minimum when needed; keep Hand sizing independent and card proportions intact. | A simple maximum of natural width and caption minimum made the whole Table range flat at HUD200. Both original endpoints must change rendered size, fit their captions and stay within the layout. Requested scale percentages can therefore include a readability offset instead of implying an exact raster ratio when that minimum binds. |
| EX-17 | Tapping any card rotates it 30 degrees inside its existing slot. Keep card spacing, slot sizes and neighboring positions unchanged; rotated corners may overlap or tuck under adjacent cards. | Rob explicitly clarified this during execution. It supersedes the coordinator's stricter rotated-footprint containment/recentering checks. Untapped badge readability and access to controls remain required. |

The general undo house rule follows the packet's intended capability, but its availability and window are
defined by the room contract and server checks. UI visibility is not evidence an undo is legal. A default
must not retroactively change an existing game's rules.
