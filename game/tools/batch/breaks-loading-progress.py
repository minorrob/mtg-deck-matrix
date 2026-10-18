"""
Mutations that tests/loading-progress.mjs must catch.

Each mutation breaks the loading progress feature in a specific way.
The test suite must fail on each one, then pass when restored.
Run with: python3 game/tools/batch/breaks.py game/tools/batch/breaks-loading-progress.py
"""

SUITES = ['tests/loading-progress.mjs']

BREAKS = [
    ('Remove progressbar role', 'crankmagic-progress.js',
     'role="progressbar"',
     'role="status"'),
    ('Remove aria-valuenow', 'crankmagic-progress.js',
     'aria-valuenow="${indeterminate ? \'\' : \'0\'}"',
     'aria-valuenow=""'),
    ('Remove aria-valuemax', 'crankmagic-progress.js',
     'aria-valuemax="100"',
     'aria-valuemax="0"'),
    ('Break monotonic check', 'crankmagic-progress.js',
     '// Monotonic only - never go backwards\n      if (value < lastValue) return;',
     '// Monotonic disabled\n      // if (value < lastValue) return;'),
    ('Never complete', 'crankmagic-progress.js',
     'element.remove();',
     '// element.remove();'),
    ('Break percentage formatting', 'crankmagic-progress.js',
     'const formatted = value.toLocaleString(\'en-US\');',
     'const formatted = String(value);'),
    ('Remove indeterminate class', 'crankmagic-progress.js',
     '${indeterminate ? \' cm-progress-indeterminate\' : \'\'}',
     ''),
    ('Remove reduced motion class', 'crankmagic-progress.js',
     '${reducedMotion ? \' cm-progress-static\' : \'\'}',
     ''),
    ('Break error state class', 'crankmagic-progress.js',
     'element.classList.add(\'cm-progress-has-error\');',
     '// element.classList.add(\'cm-progress-has-error\');'),
    ('Remove progress bar element', 'crankmagic-progress.js',
     '<div class="cm-progress-bar',
     '<div class="cm-progress-hidden'),
    ('Clamp to 98% instead of 99%', 'card-catalog.js',
     'options.onProgress(Math.min(99,',
     'options.onProgress(Math.min(98,'),
    ('Never reach 100%', 'card-catalog.js',
     'if(options.onProgress){Object.keys(progress).forEach(k=>progress[k]=1);options.onProgress(100,100);}',
     'if(options.onProgress){Object.keys(progress).forEach(k=>progress[k]=0.99);}'),
]
