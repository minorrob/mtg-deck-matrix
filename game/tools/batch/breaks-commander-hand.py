# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-29 and ROB-169 on the board: the commander tax shown and said, both partners in the command zone, a look at a hand."""
SUITES = ["tests/board-commander-hand.mjs"]
T = "crankmagic-board.js"
CSS = "crankmagic-stage.css"
BREAKS = [
    ("the tax badge never drawn", T,
     '${tax !== null ? `<span class="cm-bcard-tax"',
     '${false ? `<span class="cm-bcard-tax"'),
    ("the tax not said with the card's name", T,
     'const state = [tax !== null ? `commander tax ${tax}` : "",',
     'const state = ["",'),
    ("only the first partner drawn", T,
     'const many = label === "Command" && zone.cards.length > 1;',
     'const many = false;'),
    ("the second partner under the first one's labels", CSS,
     '.cm-board-partners>.cm-bcard{z-index:1}\n.cm-board-partners>.cm-bcard+.cm-bcard{position:absolute;z-index:2;',
     '.cm-board-partners>.cm-bcard{}\n.cm-board-partners>.cm-bcard+.cm-bcard{position:absolute;'),
    ("the name runs under the tax badge", CSS,
     '.cm-bcard.has-tax .cm-bcard-name{right:',
     '.cm-bcard.has-tax .cm-bcard-name{--unused:'),
    ("the tax badge under 10px", CSS,
     'font-size:max(10px,calc(var(--bc,72px) * .13))',
     'font-size:calc(var(--bc,72px) * .13)'),
    ("the hand looked at not drawn", T,
     'if (shown.length) body = `<div class="cm-board-shown">',
     'if (false) body = `<div class="cm-board-shown">'),
    ("a shown card opens nothing", T,
     'const c = findCard(cardId) || shownCard(cardId);',
     'const c = findCard(cardId);'),
]
