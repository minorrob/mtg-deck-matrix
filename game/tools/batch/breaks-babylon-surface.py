# ROB-52 / ROB-100: each mutation must fail the actual browser proof.
SUITES = ['tests/table-babylon-surface.mjs']
BREAKS = [
    ('Forest loses its peripheral motion', 'crankmagic-stage-babylon.js',
     'if (!opts.reduced && !document.hidden) app.ambientFrame = requestAnimationFrame(frame);',
     'if (false) app.ambientFrame = requestAnimationFrame(frame);'),
    ('decorative canvas enters the keyboard order', 'crankmagic-stage-babylon.js',
     'engine.canvasTabIndex = -1; canvas.tabIndex = -1;', 'engine.canvasTabIndex = 0; canvas.tabIndex = 0;'),
    ('failed artwork loses its readable mat', 'crankmagic-stage-babylon.js',
     "material.emissiveColor = B.Color3.FromHexString(i ? '#21403b' : '#294942');", "material.emissiveColor = new B.Color3(0, 0, 0);"),
    ('raised table trim covers the mats', 'crankmagic-stage-babylon.js',
     'table.root.position.y = -highest - .015;', 'table.root.position.y = .08;'),
    ('camera no longer agrees with the DOM', 'crankmagic-stage-babylon.js',
     'projection.setRowFromFloats(2, 0, .14,', 'projection.setRowFromFloats(2, 0, 0,'),
    ('selected table design is ignored', 'crankmagic-stage-babylon.js',
     'root.CrankTables.build(B, scene, design.id,', "root.CrankTables.build(B, scene, 'medieval-banded',"),
    ('mat geometry is shifted from its controls', 'crankmagic-stage-babylon.js',
     'r.x + r.width / 2 - g.width / 2', 'r.x + r.width / 2 - g.width / 2 + 10'),
    ('context loss never exposes the readable fallback', 'crankmagic-stage-babylon.js',
     'canvas.hidden = true; onLost();', 'canvas.hidden = true;'),
    ('leaving Full leaks its scene', 'crankmagic-stage-babylon.js',
     "app.scene?.dispose(); app.scene = null; app.signature = '';", "app.scene = null; app.signature = '';"),
]
