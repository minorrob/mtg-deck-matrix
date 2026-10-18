# Deliberate regressions for the buy priority dial (ROB-118).
# Each break is a real mutation of crankmagic-collection.js that tests/buy-dial.mjs catches.

SUITES = ["tests/buy-dial.mjs"]
BREAKS = [
    ('dial renders with no sliders', 'crankmagic-collection.js',
     'return `<div class="cm-buy-dial" data-testid="buy-dial"><div class="cm-dial-head"><h3>Buy priority</h3>',
     'return `<div class="cm-buy-dial" data-testid="buy-dial"><div class="cm-dial-head"><h3>Buy priority</h3></div></div>`;return `<div style="display:none">'),
    ('dial ignores saved weights', 'crankmagic-collection.js',
     'function dialHTML(){const BP=globalThis.CrankBuyPlan;if(!BP){return `<div class="cm-buy-dial cm-buy-dial-error"',
     'function dialHTML(){const BP=globalThis.CrankBuyPlan;if(!BP){return `<div class="cm-buy-dial cm-buy-dial-error";}const w={cost:0,speed:0,print:0};return `<div'),
    ('dragging slider does not update percentages', 'crankmagic-collection.js',
     'if(shop){C.main.addEventListener(\'input\',ev=>{const dial=ev.target.closest(\'[data-dial]\');if(!dial)return;const BP=globalThis.CrankBuyPlan;if(!BP)return;',
     'if(shop){C.main.addEventListener(\'input\',ev=>{return;const dial=ev.target.closest(\'[data-dial]\');if(!dial)return;const BP=globalThis.CrankBuyPlan;if(!BP)return;'),
    ('dial hidden at 390 wide', 'crankmagic-collection.js',
     'return `<div class="cm-buy-dial" data-testid="buy-dial">',
     'return `<div class="cm-buy-dial" data-testid="buy-dial" style="display:none">')
]
