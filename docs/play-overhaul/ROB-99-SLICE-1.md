# ROB-99 slice 1: shared desktop shell

Branch: `codex/play-shared-shell`, based on `origin/main` `f6018fe4`.

Rob, October 18: "one header and Camera in every view, Tilt only in Full."
The first slice also extracts Settings' Play card into `crankmagic-settings-play.js`.
It ports only the desktop shell from PR #735; phone layout, commander behavior,
and the Babylon renderer remain separate changes in Rob's requested order.

Acceptance: the shared header, profile, Camera view switch and both drawers work
in Full, Table and Focus. Tilt appears only in Full. Settings retains its existing
Play behavior through the extracted module. Browser proof uses
`GEOMETRY_REQUIRED=1`, stable object IDs, and 1280x720 and 390x844 screenshots.
Each changed guard receives a deliberate failing mutation before restoration.

Read on October 18 from PR #740's branch while it remained open: AGENTS, ACTIVE,
the handoff, program charter, Play workstream, readout protocol and the standing
Play design instructions. PR #740 must reach main before integrating its table
catalog and readout feed changes; no wholesale port of either source branch.

The pre-existing local edits on `codex/ui-playtest-plan-oct15` are preserved in
the Git stash named `Preserve pre-handoff local edits before Codex Play slice 1
(2026-10-18)`. They include Workshop edits and the four pending audio assets.

Proof: pending implementation. No browser, staging or hardware claim yet.
