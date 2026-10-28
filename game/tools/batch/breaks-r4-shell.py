# r4 D1: a folded choice, a saved HUD value and a destructive confirmation are behavior, not decoration.
SUITES = ['tests/board-r4-shell.mjs']
BREAKS = [
    ('folded decisions disappear', 'crankmagic-board.js',
     "${!visible && d && d.kind !== 'draw' ? decision() : ''}", ""),
    ('HUD release does not persist', 'crankmagic-board.js',
     'keep(HUD_KEY, Math.max(100, Math.min(200, Number(el.value) || 100)));',
     '/* Deliberate break: forget the released HUD value. */'),
    ('concede skips confirmation', 'crankmagic-board.js',
     "if (el?.dataset.confirm !== '1')", "if (false)"),
]
