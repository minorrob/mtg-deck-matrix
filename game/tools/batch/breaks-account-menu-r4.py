"""Shared native AccountMenu semantics must fail under real browser regressions."""
SUITES = ['tests/account-menu-r4.mjs']
BREAKS = [
    ('account Escape leaks into board draft shortcuts', 'crankmagic-app.js',
     "if(C.accountMenuOpen()&&event.key==='Escape')", "if(false&&event.key==='Escape')"),
    ('redrawn account invoker loses focus return', 'crankmagic-app.js',
     'menuChip=C.focusFind(menuChipKey)', 'menuChip=null'),
    ('account invoker aria state stays collapsed', 'crankmagic-app.js',
     "String(e.newState==='open'", "String(false"),
    ('Careful group loses its required label', 'index.html',
     'role="group" aria-label="Careful"', 'role="group" aria-label="Other"'),
    ('danger text uses low-contrast raised backdrop', 'crankmagic.css',
     '#cm-user-menu .cm-menu-group-danger,#cm-user-menu #cm-account-out{background:var(--color-panel);',
     '#cm-user-menu .cm-menu-group-danger,#cm-user-menu #cm-account-out{background:var(--color-raised);'),
]
