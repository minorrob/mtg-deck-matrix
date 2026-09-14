/* THE HOUSE RULES FOR SPENDING, in one place.
 *
 * Rob's buying rules were in his head and in a spreadsheet, and the app knew none of them:
 * a $100 pool for the season, nothing over $30 a card, a deck worth no more than $225, and
 * a listing over $2 is only worth taking at up to 110% of the sheet price -- above $5 the
 * local store gets first refusal. The Shop's cap column, the price-band strip, the budget
 * card and the order warnings all read these figures from here, so changing a rule is one
 * edit and every screen agrees.
 *
 * Pure: no DOM, no state. Node and the browser both load it (tests/crankmagic-rules.mjs). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CrankRules=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const RULES={capFloor:2,capPct:.10,localOnly:5,perCardMax:30,deckCap:225,pool:100};
  const round=n=>Math.round(n*100)/100;
  const num=v=>v===null||v===undefined||v===''?NaN:Number(v);
  /* What a listing is worth paying. At or under the floor the sheet price is the cap; above it
     the cap is the sheet price plus the percentage, to the cent. Unknown stays unknown. */
  function capFor(price){const p=num(price);if(!Number.isFinite(p)||p<0)return null;return p<=RULES.capFloor?round(p):round(p*(1+RULES.capPct));}
  /* Local store first: a card at or over this line is bought in person before it is ordered. */
  const localOnly=price=>Number.isFinite(num(price))&&num(price)>=RULES.localOnly;
  /* The three bands the buy list is read in. The boundaries are stated so a price is in
     exactly one: under a dollar, a dollar to five, over five. */
  const BANDS=[['under1','Under $1',p=>p<1],['1to5','$1 – $5',p=>p>=1&&p<=5],['over5','Over $5',p=>p>5]];
  function bandOf(price){const p=num(price);if(!Number.isFinite(p)||p<0)return BANDS[0][0];return (BANDS.find(([,,test])=>test(p))||BANDS[0])[0];}
  /* Every rule a line breaks, as short words for a marker; none of them blocks anything. */
  function warnings({price,paid,vendor}={}){const out=[];const p=num(price),k=num(paid);
    if(Number.isFinite(k)&&k>RULES.perCardMax)out.push(`over $${RULES.perCardMax}`);
    else if(Number.isFinite(p)&&p>RULES.perCardMax)out.push(`over $${RULES.perCardMax}`);
    if(Number.isFinite(k)&&Number.isFinite(p)&&capFor(p)!==null&&k>capFor(p))out.push('over the 110% cap');
    if(localOnly(p)&&vendor&&/tcgplayer|card kingdom/i.test(vendor))out.push('≥ $5 not local');
    return out;}
  /* THE DECK-PAGE AND GRAPH LITERALS, named here rather than in the modules that use them. */
  const GC_LIMIT=2;                                  // Game Changers the deck page allows in a main list before it warns
  const UPGRADE_CHEAP_LINE=2;                        // the "cheap" filter on the Upgrade Path: at or under this many dollars
  const TYPE_ORDER=['Commander','Creature','Planeswalker','Battle','Instant','Sorcery','Artifact','Enchantment','Land','Other'];
  const LOOP_MAX_LEN=4;                              // the longest cycle the loop finder closes
  /* THE HOUSE MINIMUMS BY ROLE: what a hundred should carry before the role lens stops warning.
     Removal and the two engines of a Commander deck's economy are the ones the house has a
     number for; the other lenses show their count plain. The Lab's draft targets read the same
     figures for ramp and draw. */
  const ROLE_MINIMUMS={removal:8,wipe:2,ramp:10,draw:10};
  /* Presentation data: the art a deck tile shows for a commander, by a word of its name; a
     commander without one shows the record's own image. */
  const DECK_ART={atraxa:'assets/crankmagic/commander-atraxa.webp?v=1',krenko:'assets/crankmagic/commander-krenko.webp?v=1',shadrix:'assets/crankmagic/commander-shadrix.webp?v=1',chulane:'assets/crankmagic/commander-chulane.webp?v=1'};
  const deckArt=commanderName=>{const n=String(commanderName||'').toLowerCase();for(const [word,src] of Object.entries(DECK_ART))if(n.includes(word))return src;return '';};
  return {RULES,capFor,localOnly,BANDS,bandOf,warnings,round,GC_LIMIT,UPGRADE_CHEAP_LINE,TYPE_ORDER,LOOP_MAX_LEN,ROLE_MINIMUMS,DECK_ART,deckArt};
});
