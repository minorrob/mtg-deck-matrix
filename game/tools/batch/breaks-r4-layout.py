# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-land-identity.mjs', 'tests/board-r4-layout.mjs']
BREAKS = [
 ('tap splits the land stack', 'crankmagic-board.js', "['cardId','tapped','printing'", "['cardId','printing'"),
 ('attached land joins ordinary lands', 'crankmagic-board.js', "c.faceDown || !c.name || c.attachments?.length", "c.faceDown || !c.name"),
 ('all-tapped stack activates a member', 'crankmagic-board.js', 'if(members.length && !next)return;', ''),
 ('stack tap chooses first physical member again', 'crankmagic-board.js', 'next?.cardId ?? id', 'id'),
 ('divider visible stroke too thick', 'crankmagic-stage.css', 'top:3px;height:1px;background:var(--color-line-strong)', 'top:3px;height:8px;background:var(--color-line-strong)'),
]
