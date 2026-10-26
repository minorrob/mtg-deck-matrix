# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-r4-combat.mjs']
BREAKS = [
 ('Send ignores unsettled attackers', 'crankmagic-board.js', 'const canSendBlocks = () => blockValid() && blocksSettled() && !sending;', 'const canSendBlocks = () => blockValid() && !sending;'),
 ('local Confirm publishes', 'crankmagic-board.js', 'blockSettled.add(id);if(phone())stageRail=false;checkBlocks();draw();', 'blockSettled.add(id);actions["board-confirm"]();if(phone())stageRail=false;checkBlocks();draw();'),
 ('move leaves old attacker ready', 'crankmagic-board.js', 'for(const i of old.filter(i=>!picked.includes(i)))blockSettled.delete(view.decision.options.find(x=>x.index===i)?.attackerId);', ''),
 ('global reason assigned to all attackers', 'crankmagic-board.js', 'const fromCheck=checked?.byAttacker?.find(x=>x.attackerId===id)?.reasons || [];', 'const fromCheck=checked?.reasons || [];'),
 ('stale Send binds', 'crankmagic-board.js', 'Number(el?.dataset?.revision)===view?.revision && ', ''),
 ('attacker strip wraps', 'crankmagic-stage.css', '.cm-r4-combat .cm-combat-groups{display:flex;flex-flow:row nowrap;', '.cm-r4-combat .cm-combat-groups{display:flex;flex-flow:row wrap;'),
 ('chosen blockers borrow ownership color', 'crankmagic-stage.css', '.cm-block-tile[aria-pressed=true]{background:var(--color-ink);', '.cm-block-tile[aria-pressed=true]{background:var(--st-inbox);'),
]
