# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-land-identity.mjs', 'tests/board-r4-layout.mjs']
BREAKS = [
 ('camera remains narrow', 'crankmagic-stage.css', 'width:320px;max-width:calc(100vw - 16px)', 'width:220px;max-width:calc(100vw - 16px)'),
 ('spacing preview never reaches cards', 'crankmagic-board.js', "function applySpacing(host) {if(host)host.style.setProperty('--card-space',String(spacing()/100));}", 'function applySpacing(host) {}'),
 ('tap splits the land stack', 'crankmagic-board.js', "['cardId','tapped','printing'", "['cardId','printing'"),
 ('public permanent differences ignored', 'crankmagic-board.js', "return JSON.stringify(ordered(Object.fromEntries(Object.entries(c).filter(([k])=>!omitted.has(k)))));", 'return c.name;'),
 ('all-tapped stack activates a member', 'crankmagic-board.js', 'if(members.length && !next)return;', ''),
 ('stack tap chooses first physical member again', 'crankmagic-board.js', 'next?.cardId ?? id', 'id'),
 ('divider visible stroke too thick', 'crankmagic-stage.css', 'top:3px;height:1px;background:var(--color-line-strong)', 'top:3px;height:8px;background:var(--color-line-strong)'),
]
