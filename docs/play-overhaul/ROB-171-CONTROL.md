# Changed-control cards (ROB-171)

Rob's October 20 request: put the actual card on its current controller's board with a distinctive
marker, and leave an inspection-only ghost on the board of the player who lost control. The ghost
must identify the controller and quote the responsible Oracle effect, including its return condition.

## Contract boundary

Current `CrankRoomView@1` groups Battlefield cards by owner and supplies their current derived
`controller`. Play can draw each real card on that controller's board and label its owner.
It cannot determine the previous controller or responsible control effect from this view.

Engine request ROB-172, mirrored in ACTIVE Requests row 11 and ROB-11, asks for public control
provenance, the displaced controller and exact Oracle wording/duration. Chained steals, effects
ending in timestamp order, permanent control, entering under another player's control and face-down
sources must be defined. The UI must not promise that killing a source returns a card to its owner.

This branch starts with the existing-contract placement and ownership marker. The complete
lost-controller ghost and return explanation remain blocked on ROB-172 reaching main.

## Proof

Implementation, browser reach, deliberate regressions and screenshots pending.
Staging, physical phones and hardware WebGL are unproven. Production remains held.
