# ROB-28: Yield turn follows the room

Branch: `codex/play-room-yield`, based on `origin/main` `d7eadfe1`.

The October 20 handoff puts play-test friction first. The board currently uses
its local Skip to end loop for an opponent's turn, stopping at every stack item.
Replace that opponent-turn path with the room's `yield` frame and render
`mayYield` and `yielding` from the acknowledged view. Required decisions remain
the player's; Stop yielding affects future passes once the room acknowledges it.

Implementation and proof are pending. Browser verification will cover the
request, acknowledgment, refusal, reconnect, required choices, and turn expiry;
screenshots and pointer hit tests will cover desktop and phone controls.

The paused October 18 land-spacing and drawer changes are preserved together in
the stash named `Preserve Oct18 approved ROB-98 and drawer fixes before Oct20 playtest work`.
Their approved designs remain in scope after the play-test fixes.
