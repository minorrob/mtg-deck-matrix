# UX Audit reconciliation of docs/intake/play-ux-requests-2026-10-26.md

**Status r2 (2026-10-26):** every decision and conflict is ruled on by Rob (last columns); frames revised to his markup; RQ-01 and RQ-08 are no longer gated. Audit pushback on C3 (one objection, then built Rob's way): double click as the only way to tap carries two costs. On touch there is no reliable double tap (the phone layout zooms or selects on it), so the card menu row (#884's ⤓ / ↷ rows) must stay as the single-tap path to the same actions. And a double click that activates while a single click inspects means the first click must not do anything a second click cannot cleanly follow: opening the inspector or card menu on click one and activating on click two works without the 300 ms wait, so no delay is needed; the build should assert that in the test. With those two conditions the audit has no further objection.

**From:** the UX Audit session (crankmagic-ux-walkthrough.html, section 'PR #887 reconciliation'). **Date:** 2026-10-26. **Read against:** main f72d857a, re-checked against f2e00ba4 (#886 builds RQ-03.1 and the shared grip() handle); production 9ca99e5. Element IDs are the walkthrough's `<frame>-<K><nn>`; frames W01–W18 are drawn in the walkthrough.

## Section 8 table

| RQ | Class | Audit finding(s) | wireframe_ids | wireframe_gap | Change made to the audit | Open question for Rob | Rob's decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RQ-01.1 | CONFLICT (C1) | F-127 new; F-088 | desk-target-1-R03, -M01, -T02, -T03, -M02; -M03, -T04, -C02 | drawn: W01 | F-127 added; R-27 amended (the verb button is the binding press) | Approve W01: compact source row above the large affected card? | Approved r2: Keith under the arrow with no arrow of its own (or dropped); the verb nearly on the arrow; both thumbs pop the large card; a Cancel for optional ('may') effects. |
| RQ-01.2 | NEW | F-117 new | desk-target-3x1-R03..R05, -M02..M04, -T05; desk-target-3x3-R03..R07; desk-target-stack-R02, -R04, -R05 | drawn: W02, W03, W04 | F-117 added | Source top-left (W02) or centered at 3 groups (W03)? Past 3 groups: page (W04-R05) or scroll? 'Up to 4' = 4 visible, ×N beyond? | Approved r2 (W02–W04): less padding under the header and the question; Collapse less tall. D2–D4 settled. |
| RQ-01.3 | process | — | W01–W04 | — | none; gate noted on R-27 | Which frames are approved to build? | Approved: W01–W04. |
| RQ-02 | EXTENDS F-103 + NEW F-118 | F-103, F-118 new | play-fullscreen-1-C17; play-table-1-C13, -C14; play-tools-C18, -C19; board-divider-T01 | no: state note on W17 | F-118 added; F-103, R-25, R-31 amended | C3 (click map); C-A7: Esc returns focus first, then opens the Table menu? | C3 decided by D5 (Rob's double-click map); C-A7 approved. |
| RQ-03.1 | DONE on main (#886, 2026-10-26) | F-119 new (resolved on main) | play-fullscreen-1-C06; play-table-1-C12, -C27; pane-modules-C05, -C09 | drawn: W13 (now a record of the built behavior) | F-119 added and marked resolved: #886 adds a grip() separator under each module (drag, arrow keys, double-click reset, 80–1400 px, stored per device as cm-board-module-h) and a desk-card size grip; grip() is the shared handle C6 asked for | None for RQ-03.1. D9 narrows to RQ-11's divider only. | Resolved (#886). |
| RQ-03.2 | NEW (main only) | F-120 new; F-093 | play-coach-R06, -T06, -C09; coach-header-R02, -T01, -R04, -T03 | drawn: W11 | F-120 added; F-093, R-28 amended | 36 px header accepted? (production's is 49 px; the banner is main's) | Approved. |
| RQ-03.3 | EXTENDS F-093 + NEW F-121 | F-121 new | play-coach-C42..C45, -C46; coach-questions-C01, -R03, -C06..C10 | drawn: W12 | F-121 added | Overlay over the conversation (intake, audit) confirmed? | Approved; the 'Questions to Ask' line 25 % less tall; overlays the conversation. |
| RQ-03.4 | EXTENDS F-114 | F-122 new; F-114 | P45 'Arrange drawer order'; P62 matrix (play-coach pane headers not captured in edit mode) | no (not required) | F-122 added; F-114 amended | Remove the six-dot handle from every header (audit pick) or keep it if small? | Approved: remove the six-dot handle. |
| RQ-03.5 | CONFLICT (R-25 line) | F-123 new; F-085, F-091, F-098 | play-fullscreen-3-R06, -C09; play-fullscreen-1-C23; pane-modules-C01, -C06, -R03 | drawn: W13 | F-123 added; R-25 line superseded; F-091/F-098 amended (pulse cue stays) | Keep the pending-choice pulse when a module is collapsed (audit condition)? | Approved; pulse stays; headers and their buttons 20–25 % less tall (W13 r2). |
| RQ-04 | NEW | F-124 new (P1) | none (engine) | no | F-124 added | None for the UI; Engine lane first. | None. |
| RQ-05.1 | NEW | F-125 new | combat-strip-2-C01, -C02; desk-block-1-C05, -C06 | drawn: W05, W08 | F-125 added | Per-attacker button: 'Confirm' (Rob) or 'Set blocks' (audit, so Confirm never looks like Send)? | Approved r2: tile rows tightened, state word top-right (W05). |
| RQ-05.2 | NEW | F-125 new | combat-strip-2-R01, -T01, -T02, -C03; combat-strip-9-R01, -R02, -C10; combat-tile-states-T02..T04 | drawn: W05, W06, W07 | F-125 added | Strip heading: 'Combat · blocks' (audit) since it now holds the draft? Lock glyph on Send? | Approved; no lock glyph. Wrapping denied: one row scrolled by arrows with '+N more' above Send (W06 r2). |
| RQ-05.3 | NEW | F-125 new | combat-tile-states-C01, -C02, -C03 | drawn: W07 | F-125 added | None. | Approved. |
| RQ-05.4a–e, g | NEW | F-125 new | desk-block-1-T02, -M01, -R03, -C02..C06, -T04; desk-block-2-C02, -C03; desk-block-0-R03 | drawn: W08, W09, W10 | F-125 added | Several blockers on one attacker (Proposed) confirmed? | Approved r2: blocker tiles show effective P/T and pop the card on hover (W08). |
| RQ-05.4f | CONFLICT (C4) | F-125 new | combat-strip-9-T21 | drawn: W06 note | F-125 added | Twin marker: small corner mark + hover lights the card (audit pick), or position only? | Corner mark approved (C4). |
| RQ-06.1 | EXTENDS | F-088 | play-fullscreen-3-C15, -C17, -T11; desk-one-action-C01, -T03 | drawn: W14 | F-088, R-27 amended | Label by action type (Play Card / Cast Spell / Activate) confirmed? | Approved as drawn (W14 left). |
| RQ-06.2 | EXTENDS (R-27 Undo) | F-088 | play-fullscreen-4-C27; desk-one-action-C02, -T04, -T05 | drawn: W14 | R-27 amended | Window: rest of the step (Rob) within the Proposed guard; undo shown to every seat in the log? | Approved r2: no Undo button; a thin 60–70 % black hover drawer at the card's bottom edge carries '↶ Undo'; inactive once the card is locked in; undo shown in the log. |
| RQ-07 | NEW (partly on main) | F-126 new | desk-targets-grouped-R03..R05, -T03, -C01..C06 | drawn: W15 | F-126 added | Grouping replaces the '(Keith's)' suffix (audit pick) or adds to it? | Approved r2: Next and Cancel smaller and styled apart from the options; the possessive sentence lives on W01. |
| RQ-08.1 | NEW | F-127 new | desk-target-1-R04, -M03 | drawn: W01 | F-127 added | None. | Approved. |
| RQ-08.2 | NEW | F-127 new | play-fullscreen-3-T08 (title style); desk-target-1-T04 | drawn: W01 | F-127 added | None. | Approved. |
| RQ-08.3 | NEW | F-127 new | desk-target-1-T04, -T05 | drawn: W01 | F-127 added | 'your' for own cards; 's after s; 'may' = verb / Don't verb: confirmed? | Confirmed. |
| RQ-08.4 | CONFLICT (R-27) | F-127 new; F-088 | desk-target-1-C02, -T06 | drawn: W01 | Audit done: commitReview holds only Confirm, Clear, an sr-only 'Selected' live region and the stale-draft revision guard; both move to the verb button. R-27 amended | Approve removal of the second step? | Approved. |
| RQ-09 | EXTENDS F-092 | F-092 | play-tools-C23, -C25, -C27; camera-spacing-T05, -C07 | drawn: W18 | F-092, R-28 amended | Default: flush (0) or slight overlap (−10%)? Audit pick: flush. | Approved. |
| RQ-10.1–10.4 | NEW | F-128 new | play-fullscreen-4-C27; land-stack-R02..R05, -M01, -M05, -M06, -T01..T03 | drawn: W16 | F-128 added | C3 click map; 'identical' = name + state, printings merge (Proposed) confirmed? | Approved r2: tapped copy tilts 30°, not 90°; the count sits in the same hover drawer at the card's bottom edge (W16). D20 approved. |
| RQ-10.5 | DUPLICATE (#878, questions only) | — | — | — | Noted in F-128: the battlefield is the gap | None. | None. |
| RQ-11 | NEW | F-129 new; F-119 | play-fullscreen-1-C06; play-table-1-C12, -C27; board-divider-C01, -T02 | drawn: W17 | F-129 added | Memory per view (Proposed) confirmed? Minimum one row each side? | Approved r2: the divider is a line only, taking no battlefield space (W17). |

## Conflicts

| # | Between | Intake | Audit | Rob decides | Ruling |
| --- | --- | --- | --- | --- | --- |
| C1 | RQ-01.1 vs RQ-08 | Intake: one target = RQ-08 layout with a compact source row; many = RQ-01.2 quadrants with a summary question. | Audit: agree. W01 draws it. Keep the compact row at ¼–⅓ of the desk card so RQ-01's 'picture of the card doing the targeting' survives on the one-target screen. | Approve W01. | Approved: W01, with the audit's position. |
| C2 | RQ-08.4 vs the engine | Intake: audit before removal. | Audit: done against main f72d857a. The second step is board-side only (commitReview): Confirm, Clear, an sr-only live region, and a guard that disables Confirm when the draft's revision is stale. The room re-checks legality on submit. No response window hangs on it. Move the guard and the live region to the verb button; delete the step. | Approve removal. | Approved: the press on W01's verb button (C02) is the confirm; the commit-review semantics stay board-side only; C03 (Change target) stays. |
| C3 | RQ-02, RQ-10 vs existing and queued clicks | Intake: RQ-02 only on empty board area; RQ-10 single click taps the next untapped copy; take-back double-click stays; queued 'double-click taps' moot. | Audit pick: one click map for the whole board. Single click on a land or stack = tap one (RQ-10.3). Double click on empty board area = focus (RQ-02). The take-back of a land just played moves to the Undo icon of RQ-06.2 (W14-C02), so a land has one click meaning and the 300 ms single-click wait (takeBackLand) goes, which also makes tapping feel faster. Queued 'double left click taps' is dropped. | Decide the click map; the audit's removes the 300 ms wait. | Rob's double-click map (D5) wins: single click inspects, double click activates. Audit pushback: see below. |
| C4 | RQ-05.4f vs ROB-168, ROB-26 | Intake: remove the visible number; twins told apart by position, a small mark, or a hover that lights the card. | Audit pick: all three, in this order of weight: the thumbnail's art and position in the strip match the board order; a small corner mark (a, b, c) on twins only; hover or focus lights the card on the table (data-peek-card already exists). The engine's ids stay underneath for tests and the log. | Confirm the corner mark. | Corner mark approved. |
| C5 | RQ-06.1 vs queued Hand / Board / Other grouping | Intake: RQ-06.1 applies inside any grouping. | Audit: agree; W14 shows the single-action desk independent of grouping. | None. | Agreed. |
| C6 | RQ-03.1, RQ-11 vs the existing drawer resize | Intake: one shared handle component and one saved-layout store. | Audit: #886 already shipped grip() as that component (module heights, desk card, drawer width). RQ-11's divider should be another grip() call. Still open: the hand-size handle: the hand-size handle (play-table-1-C27) joins the same component. The three existing handles have three different aria wordings; one wording pattern: '<what>: drag, or use the arrow keys'. | None. | Approved. |
| C-A7 | RQ-02 (Esc returns focus) vs R-25 (Esc opens the Table menu) | New, found by the audit. | Audit pick: Esc is contextual: with a card menu or dialog open it closes that; with an opponent's board focused it returns to your own board; otherwise it opens the Table menu (R-25). One key, three layers, innermost first. | Confirm the Esc order. | Approved. |
| C-A8 | RQ-03.5 (header click collapses any module) vs R-25 ('the choices panel does not collapse on desktop') | New, found by the audit. | Audit: Rob's instruction wins; R-25's line is superseded. The audit keeps its condition: a collapsed module with a pending choice shows the pulsing 'Your choice is waiting · Show' cue in the center slot and on the header (F-091, F-098). | Confirm the cue stays. | Approved. |

## Decisions before the build

| # | Item | Decision | Intake | Audit | Rob's ruling |
| --- | --- | --- | --- | --- | --- |
| D1 | RQ-01 / RQ-08 | Approve W01 (one target) and W02–W04 (many) as the frames to build from. | Intake: wireframe first, Rob approves. | Audit: W01 and W02 as drawn; W03 only if D2 picks centered; W04's pager if D3 picks page. | Approved: W01 and W02 to build from; W03 and W04 also approved (RQ-01.2 'W02 through W04: approved'). |
| D2 | RQ-01.2 | Source position with 3 effect groups. | Intake Proposed: centered, targets around it. | Audit pick: top-left always (W02's grammar), so one-target, one-group and three-group screens read the same; centered (W03) only if Rob prefers the hub look. | Both frames approved, so: top-left for 1–2 groups (W02), centered at 3 (W03). |
| D3 | RQ-01.2 | More than 3 effect groups. | Intake: scroll or page, to be drawn. | Audit pick: page (W04-R05), so the source never scrolls away. | Page (W04's pager). |
| D4 | RQ-01.2 | 'Up to 4 cards' per quadrant. | Intake: 4 per quadrant, read as a cap; a stack over 4 keeps cycling with ×N. | Audit: read as 4 visible layers; the stack holds any count; ×N on the badge. | 4 visible layers, any count behind ×N. |
| D5 | C3 | Click map for lands, stacks and empty board area. | Intake: single click taps the next copy; take-back double-click stays; queued double-click-taps moot. | Audit pick: take-back moves to the Undo icon (RQ-06.2); the 300 ms single-click wait goes. | Rob's click map (replaces both): single click = inspect (as today); double click on any card or stack = activate it: a land taps and its mana is available; a tap ability taps and the Actions pane lists its abilities; a castable card the same; with more than one option the Actions pane shows them. Double-clicking the just-tapped card again untaps it, until a card is played with that mana or the tap is undone; undoing a card played with that mana untaps its lands automatically. Double click on empty board area = focus (RQ-02). Audit pushback noted below; built Rob's way. |
| D6 | C4 | How twins are told apart without '#486'. | Intake: position, a small mark, or hover-light. | Audit pick: corner mark on twins only + hover-light; position is implicit. | Corner mark approved (plus hover-light). |
| D7 | C-A7 | What Esc does on the board. | Intake: Esc returns to your own board (RQ-02 Proposed). | Audit pick: innermost first: menu/dialog → focus back → Table menu. | Approved: menu/dialog → focus back → Table menu. |
| D8 | C-A8 | Collapsing the choices module on desktop. | Intake: header click collapses any module (RQ-03.5). | Audit: allowed; the pending-choice pulse stays. | Approved: collapse allowed; the pending-choice pulse stays. |
| D9 | RQ-11 | Where the divider position is saved (module heights are settled: #886 stores them per device in cm-board-module-h). | Intake: per person, per view. | Audit pick: beside cm-board-module-h, per device, per view, through the same grip() helper #886 added. | Approved for RQ-11's divider: beside cm-board-module-h, per device, per view (module heights already built by #886). |
| D10 | RQ-03.2 | Header height. | Intake: about ¼ of today's (main's banner). | Audit: 36 px, one line; production's 49 px header is the nearer baseline, so the saving on production is modest. | Approved: 36 px, one line. |
| D11 | RQ-03.4 | The six-dot handle. | Intake: fix if small, else remove. | Audit pick: remove everywhere; ↑ ↓ in edit mode suffice. | Approved: remove the six-dot handle everywhere. |
| D12 | RQ-05.1 | The per-attacker button label. | Intake (Rob): Confirm. | Audit pick: 'Set blocks', so the strip's Send blockers is the only thing called a confirm-like send; if Confirm stays, its tooltip says 'this attacker only'. | Not ruled on separately; W05/W08 approved as drawn, so the per-attacker button stays 'Confirm' (Rob's wording) with the tooltip 'this attacker only'. |
| D13 | RQ-05.2 | Strip heading and Send glyph. | Intake: 'Send blockers' far right, tooltip 'stays private until sent'. | Audit pick: heading 'Combat · blocks' (the strip now holds a draft, not confirmed assignments); 🔒 glyph on Send while private, ✓ once sent. | Lock glyph removed (Rob). Heading 'Combat · blocks' stands with the approved W05. |
| D14 | RQ-05 Proposed | Several blockers on one attacker; moving a blocker unsettles its old attacker. | Intake: allowed; limits from legalBlocks. | Audit: agree; W09 draws it. | Approved (W09). |
| D15 | RQ-06.2 | Undo window and visibility. | Intake: rest of the step, within the Proposed guard; log shows 'undone' to every seat. | Audit: agree on both; add that Undo is never offered after a card was revealed by the play (search, draw). | Approved: rest of the step within the Proposed guard; 'undone' in every seat's log; never after a reveal. |
| D16 | RQ-07 | Grouping vs the '(Keith's)' suffix. | Intake: headers per player, You last. | Audit pick: grouping replaces the suffix; the sr-only label keeps 'Keith's'. | Approved: grouping replaces the suffix; the possessive sentence belongs to the next screen (W01). |
| D17 | RQ-08.3 | Wording rules. | Intake Proposed: 'your', 's after s, engine verb, 'may' = verb / Don't verb, 'face-down creature'. | Audit: agree; add 'this' for a card that is both source and target ('Sacrifice this Sakura-Tribe Elder?'). | Confirmed, with 'this' when source = target. |
| D18 | RQ-08.4 | Remove the second confirm step. | Intake: after an audit. | Audit: audit done (C2); remove. | Approved: remove; the verb button in W01 is the only confirm, board-side (C2). |
| D19 | RQ-09 | Default spacing. | Intake: a tighter default. | Audit pick: flush (0) by default; overlap on request; P/T readable on the right-most card at the tightest setting. | Approved: flush by default. |
| D20 | RQ-10 | Definition of identical. | Intake Proposed: same name and state; printings merge; Aura/counters/animated/token-beside-nontoken sits apart. | Audit: agree; it is #878's sameKey, so one definition for questions and the board. | Approved: #878's sameKey for questions and the board. |
| D21 | RQ-02 | Where a double click counts. | Intake: empty board area only; on a card, the card's action. | Audit: agree; also on the seat header of the Other seats strip (R-31). | Approved with the audit's C3 pick, then superseded by D5 for cards: empty board area focuses; a card activates. |

## Rob's frame markup (r2), as applied

| Frame | Change |
| --- | --- |
| W01 | T03 'Keith' under the big arrow, no arrow of its own (could be dropped); T02 verb moved down to sit nearly on the arrow; M01 and M02 both pop the large card on hover; a Cancel (C04) for optional effects. |
| W02 | Padding halved between the header and T02, and between T02 and R03; Collapse (C01) less tall. Applied to every desk frame. |
| W05 | T03/T04/T05 row gaps halved; T06 state word 15 % narrower, in the top-right corner, 6 px from the edge like the thumbs; no lock glyph on C03. |
| W06 | Denied as a wrap. Redrawn: one row of W05 tiles, a thin right arrow the height of a tile, '+N more' as accent subtext above Send aligned to the tiles' top, a left arrow once scrolled. |
| W08–W10 | Blocker tiles show effective P/T and pop the card on hover. |
| W12 | 'Questions to Ask' line 25 % less tall (22 px). |
| W13 | Header rows and their buttons 20–25 % less tall (28 / 22 px); RQ-03.1 grip shown as built. |
| W14 | No Undo button. A thin hover drawer (60–70 % black, one 11–12 px line) slides up from the card's bottom edge with '↶ Undo'; overlaps, no spacing changes; not shown once the card is locked in. |
| W15 | Next and Cancel smaller, styled apart from the option tiles. |
| W16 | Tapped copy tilted 30°, stack shape kept; the count ('×4 · 3 untapped') in the same hover drawer flush to the card's bottom edge. |
| W17 | Divider drawn as a 1 px line with an invisible hit area; takes no battlefield space. |

## Findings added, amended, superseded

- Added: F-117, F-118, F-119, F-120, F-121, F-122, F-123, F-124, F-125, F-126, F-127, F-128, F-129 (F-124 is P1; the rest P2/P3).
- Amended: F-088, F-091, F-092, F-093, F-098, F-103, F-114, F-119; PR prompts R-25, R-27, R-28, R-31.
- Superseded: R-25's line 'on desktop ≥ 1200 px the panel does not collapse' (RQ-03.5). No whole finding.
- Findings no RQ touches (unchanged): S0–S11 and S16 entirely (F-001…F-072, F-105…F-116); S12 lobby F-073…F-081; board F-082 (P0, no Concede/Leave), F-083, F-084, F-085, F-086, F-087, F-089, F-090; Table view F-099, F-100, F-101; Focus view F-102, F-104; results F-094…F-097.

## Frames

| Frame | Key | Covers | Elements |
| --- | --- | --- | --- |
| W01 | `desk-target-1` | RQ-01.1 RQ-08.1 RQ-08.2 RQ-08.3 RQ-08.4 RQ-07 | 16 |
| W02 | `desk-target-3x1` | RQ-01.2 RQ-07 | 21 |
| W03 | `desk-target-3x3` | RQ-01.2 RQ-07 | 21 |
| W04 | `desk-target-stack` | RQ-01.2 | 26 |
| W05 | `combat-strip-2` | RQ-05.1 RQ-05.2 RQ-05.3 | 19 |
| W06 | `combat-strip-9` | RQ-05.2 | 42 |
| W07 | `combat-tile-states` | RQ-05.2 RQ-05.3 | 22 |
| W08 | `desk-block-1` | RQ-05.4 RQ-05.1 | 14 |
| W09 | `desk-block-2` | RQ-05.4 RQ-05.1 | 14 |
| W10 | `desk-block-0` | RQ-05.4 | 14 |
| W11 | `coach-header` | RQ-03.2 | 11 |
| W12 | `coach-questions` | RQ-03.3 | 15 |
| W13 | `pane-modules` | RQ-03.1 RQ-03.4 RQ-03.5 | 17 |
| W14 | `desk-one-action` | RQ-06.1 RQ-06.2 | 14 |
| W15 | `desk-targets-grouped` | RQ-07 | 19 |
| W16 | `land-stack` | RQ-10.1 RQ-10.2 RQ-10.3 RQ-10.4 | 17 |
| W17 | `board-divider` | RQ-11 RQ-02 | 12 |
| W18 | `camera-spacing` | RQ-09 | 14 |

## Source facts the audit relied on

- The targets question title is `${name}: choose one target …` (game/engine/script/bind.mjs countedChoice); options append ` (Name's)` for permanents not the chooser's and number twins `(1)`, `(2)`.
- The second confirm step is board-side only: crankmagic-board.js commitReview() renders an sr-only 'Selected: …' live region, Confirm (disabled while sending or when draftRevision ≠ view.revision) and Clear. No engine step hangs on it.
- The block draft: crankmagic-board.js blockDraft() (blocker-first, text pairs, 'Clear this blocker', 'All block options') and the foot 'No blocks' / 'Confirm blocks'; the public strip is combatStrip() ('Combat · confirmed assignments').
- Production's Coach header at capture was one 49 px line (play-coach-R06); the banner Rob measured is main's.
- Existing drag handles: pane width (play-fullscreen-1-C06), boards' widths (play-table-1-C12), hand size (play-table-1-C27), each with its own aria wording.
