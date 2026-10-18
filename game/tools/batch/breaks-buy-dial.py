# Deliberate regressions for the buy priority dial (ROB-118).
# Each break is a real mutation of crankmagic-collection.js that tests/buy-dial.mjs catches.

breaks = [
    {
        "id": "dial-no-sliders",
        "why": "The dial renders with no sliders",
        "file": "crankmagic-collection.js",
        "original": 'return `<div class="cm-buy-dial"><div class="cm-dial-head"><h3>Buy priority</h3>',
        "mutant": 'return `<div class="cm-buy-dial"><div class="cm-dial-head"><h3>Buy priority</h3></div></div>`;return `<div style="display:none">',
        "catches": "cost slider present"
    },
    {
        "id": "dial-ignores-weights",
        "why": "The dial ignores the saved weights and always starts at 0",
        "file": "crankmagic-collection.js",
        "original": "const prefs=C.state.preferences,w={cost:prefs.buyWeightCost??1,speed:prefs.buyWeightSpeed??0,print:prefs.buyWeightPrint??0};",
        "mutant": "const prefs=C.state.preferences,w={cost:0,speed:0,print:0};",
        "catches": "cost starts at 100"
    },
    {
        "id": "percentages-not-updated",
        "why": "Dragging a slider does not update the percentages",
        "file": "crankmagic-collection.js",
        "original": "const updatePct=()=>{const BP=globalThis.CrankBuyPlan;if(!BP)return;",
        "mutant": "const updatePct=()=>{return;const BP=globalThis.CrankBuyPlan;if(!BP)return;",
        "catches": "cost at 50 shows 50%"
    },
    {
        "id": "dial-hidden-phone",
        "why": "The dial is hidden at 390 wide",
        "file": "crankmagic-collection.js",
        "original": 'return `<div class="cm-buy-dial">',
        "mutant": 'return `<div class="cm-buy-dial" style="display:none">',
        "catches": "cost slider visible at 390 wide"
    }
]
