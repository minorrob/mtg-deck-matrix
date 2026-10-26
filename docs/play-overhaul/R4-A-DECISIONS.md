# r4 A decision checkpoint

The decision desk now uses source art and identity, a task sentence, local Pick/Review steps when
needed, a local compact Next from the grouped picker to review, the selected targets, engine-worded consequence, and one binding action. Target headers
preserve controller zero and put You last; mixed lands fold inside their controller. A one-target
question uses the engine effect, the visible affected card and possessive words. It has one verb
press and Change target. Unknown effects keep the original question. Source identity comes from
CH-56 decision.sourceId (or the acting priority option); names and thumbnails resolve only through
the current projection. A face-down or absent card is not named by a catalog lookup.

Target instances remain engine groups. Up to three groups surround the source; further groups use
a pager. Four layers represent a stack of any size, with count and keyboard/click cycling of the
actual visible top card. The system duration is 160ms; reduced motion changes immediately.

A card with one legal action has its binding Play Card / Cast Spell / Activate control and no
option row. Its offered index and revision remain authoritative. Prepared creatures can show
their separate inset copy's cast offer through preparedFrom without changing that offered index.

Cancel clears an unsent draft. A mandatory question with no draft has no fake Cancel button. It cannot discard a mandatory engine question. Don't is a binding
press only for an existing legal decline option; the UI does not manufacture that option.
The selected live-region summary and revision guard remain. The older private-inspection,
choice-review and expired-reveal regressions are retained with r4 labels and actual persistent
DecisionSlot assertions in place of the superseded pending-label cue.

The actual Full actionBar primary now uses on-accent text; tests compare its computed foreground
and background in dark and light. Visual review found legacy white-on-cream text in the left
rail and a sticky entire review region; the rail follows the register and only its action row
sticks. Phone review art is compact and the bottom sheet can use 75% of the viewport. Separate
question/action images document scrolling where both cannot fit at once, including 200% HUD.

Proof (commands use installed Chrome and local fixture server):

- `node tests/board-r4-decisions.mjs`: final count recorded with commit handoff; grouping, exact
  legal action, no preview sends, legal decline, Prepared inset, real primary/text contrast,
  keyboard cycling, revision guard and phone question/action reach.
- `node tests/board-r2-actions-inspection.mjs`: 115 checks, private draft/payment/reveal and inspection.
- `node tests/board-result-bridge.mjs`: 25 checks after canonical writes delegate to the shared
  account-bound table writer. Board retains context/read/retry guards and legacy-only fallback.
- Mutation specifications: `breaks-r4-decisions.py` and `breaks-board-result-bridge.py` under
  `game/tools/batch/`.

Screenshots use r4-desk-W01-<view>-<width>.png, r4-desk-W01-phone-question.png and the same task
evidence directory as D1. Fixture card images remain placeholders. Combined real-game acceptance,
combat B, board C, view/account D2 and staging are still open.

Independent engine review found two presentation seams, now guarded: ability stack IDs use their
own namespace (never object lookup by the same number), and a multi-target trigger combination
retains its offered label rather than substituting the acting source card. `board-target-presentation`
executes the actual helper against object/ability ID collision, current/departed source and missing
ability cases (7 checks). The browser fixture includes two distinct trigger target combinations.
Latest local refinements after the first A proof require coordinator browser/mutation execution;
they are deliberately marked pending until the canonical run completes.
