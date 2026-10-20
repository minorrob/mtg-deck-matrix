# Priority and card decisions: ROB-23, ROB-24, ROB-29, ROB-169

Branch `codex/play-priority-cards`, from main 27fba609 with direct-blocking #801 as a dependency.

Implementation in progress: one priority response path, inspectable stack entries and presentation of public cast/resolve events between views; Draw card and library share a guarded answer; command-zone cards show the room's tax; acknowledgment choices display the cards the seat is allowed to inspect.

Engine dependencies remain ROB-102 for the new-match passStack/drawBeat policy, ROB-166 for terminal reasons, ROB-167 for rematch routing and ROB-172 for control provenance. #795/#796 are managed by Rob's other harness.

Browser, mutation, privacy, whole-game, asset and CI proof pending. No release requested for this slice.
