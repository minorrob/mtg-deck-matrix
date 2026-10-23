"""Prove the live Babylon/lobby assertions fail when their behavior is broken. Run at repo root."""
SUITES = ['tests/board-babylon.mjs']
BREAKS = [
    ('old saved rotation returns', 'crankmagic-board.js',
     'rotation: 0, cards: camera.cards,', 'rotation: Number(stored("cm-stage-rotation")) || 0, cards: camera.cards,'),
    ('table surface diverges from card hit areas', 'crankmagic-stage.js',
     's.table.root.rotation.y=g.yaw;', 's.table.root.rotation.y=.3;'),
    ('Play bypasses its lounge', 'crankmagic-app.js',
     'views.game=views.online=()=>views.playHome()', 'views.game=views.online=()=>views.table(new URLSearchParams())'),
    ('obsolete table materials leak', 'crankmagic-stage-tables.js',
     'for(const material of materials)material.dispose(false,true);', '// deliberately retain obsolete materials'),
    ('hand is clipped below screen', 'crankmagic-stage.css',
     'bottom:20px;height:clamp(220px,34vh,330px)', 'bottom:-12px;height:clamp(220px,34vh,330px)'),
    ('renderer survives leaving the game', 'crankmagic-stage.js',
     's.scene?.dispose();s.engine?.dispose();\n  }', 's.scene?.dispose();\n  }'),
    ('canvas steals a keyboard stop', 'crankmagic-stage.js',
     'canvas.tabIndex=-1;', 'canvas.tabIndex=0;'),
]
