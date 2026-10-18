# ROB-52 / ROB-100: live Babylon surface slice

Branch: `codex/play-babylon-surface`, based on main's merged shared shell (`73f55b35`) and the Table camera fix in #765. The phone proposal remains separately reviewable in #766.

This slice replaces the Full view's ground renderer with the approved Babylon table catalog. The selected table remains `cm-stage-table`, with medieval-banded the default and the existing legacy aliases. Existing DOM cards, counters, attachments, keyboard controls and room-authorized actions remain in place. The shared camera geometry must align the meshes and DOM at every existing Tilt/Zoom endpoint; no new controls or defaults are introduced.

Proof required before ready: actual three-dimensional table parts for all seven designs, projection agreement, selected design persistence, context-loss/readable fallback and recovery, repeated Full/Table transitions without leaks, browser suites with geometry required, deliberate regressions and 1280x720/390x844 screenshots with stable IDs. Production packaging must include the pinned engine and its license under the existing CSP. No live result is claimed by this planning commit.

Remaining ROB-52 work after this slice: rigid card meshes, pickup/inspect/return and section-bounded drag, authoritative live tap actions, touch and accessible equivalents. Physical-phone and hardware WebGL validation remain unproven.
