/* Deck plans own slots, the library owns copies. Reference decks enter as drafts
 * and their historical owned flags are deliberately never migrated here. */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,esc:e,button:b,field:f,select:s,note,head,form,modal,commit,go,actions,views,$}=C;let showArchived=false;
const commander=d=>d.commanders.map(id=>C.state.cards[id]?.name||'Unknown').join(' + ');
/* THE GROUP A DECK DRAWS FROM. Attaching one does two things and claims no more: when two
   copies could fill the same requirement the filed one is reserved first, and the deck can
   file its own reserved copies into the group in a single action -- which is what makes a
   group like "Main Deck" describe the deck rather than whatever was dragged into it. */
const attached=d=>d.groupId?C.state.groups.find(g=>g.id===d.groupId)||null:null;
/* SIMULATION HISTORY. Every measured run of this deck, newest first: when, on what protocol,
   the score with its error, the two figures a reader compares first, how many games, and
   whether it measured the list as it stands now. A run is filed the moment it finishes --
   from the Lab or from here -- so the history is the record, not a thing to remember to
   save; the tile and the hero carry the latest score so the page answers "how good is it"
   before it is opened. */
const measuredReports=d=>C.state.reports.filter(r=>r.deckId===d.id&&r.origin==='measured');
const latestReport=d=>measuredReports(d).slice(-1)[0]||null;
const scoreOf=r=>r&&r.metrics&&r.metrics.score&&r.metrics.score.value!==null&&r.metrics.score.value!==undefined?String(r.metrics.score.value):'';
const when=iso=>{const t=Date.parse(iso||'');return Number.isFinite(t)?new Date(t).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):String(iso||'');};
function historyHTML(d){
  const reports=measuredReports(d).slice().reverse(),fp=M.fingerprint(d);
  const metric=(r,k,suffix='')=>{const m=r.metrics&&r.metrics[k];return m&&m.value!==null&&m.value!==undefined?e(String(m.value))+suffix:'—';};
  const status=`<span class="cm-pause-pill" id="cm-deck-sim-status" hidden></span>`;
  if(!reports.length)return `<section class="v-panel cm-history" id="cm-sec-history"><h2>Simulation history</h2><p>No measurement yet. Measure this deck and every run is kept here — the score, what it measured, and which list it measured.</p><div class="cm-actions">${b('Measure this deck','measure-deck',{deck:d.id},true)}${status}</div><p class="cm-muted">Measuring runs the engine in the background on the published protocol — six seeds of 20,000 games — and files the report here when it finishes.</p></section>`;
  return `<section class="v-panel cm-history" id="cm-sec-history"><h2>Simulation history</h2><p class="cm-muted">${reports.length} measured run${reports.length===1?'':'s'}, newest first. A run is filed the moment it finishes; a list change makes earlier runs historical, not wrong.</p><div class="cm-table-wrap"><table class="cm-table cm-history-table"><thead><tr><th scope="col">When</th><th scope="col">Protocol</th><th scope="col">Score</th><th scope="col">Win rate</th><th scope="col">Avg win turn</th><th scope="col">Games</th><th scope="col">List</th><th scope="col">Report</th></tr></thead><tbody>${reports.map(r=>`<tr><td data-label="When">${e(when(r.importedAt))}</td><td data-label="Protocol">${e(r.protocol)}</td><td data-label="Score"><strong>${metric(r,'score')}</strong>${r.metrics&&r.metrics.scoreStandardError?` <small class="cm-muted">± ${metric(r,'scoreStandardError')}</small>`:''}</td><td data-label="Win rate">${metric(r,'winRate','%')}</td><td data-label="Avg win turn">${metric(r,'averageWinTurn')}</td><td data-label="Games">${((r.run&&r.run.games)||0).toLocaleString()}</td><td data-label="List">${r.deckFingerprint===fp?'<span class="cm-badge good">Current list</span>':'<span class="cm-badge">Historical list</span>'}</td><td data-label="Report">${b('View report','deck-report',{deck:d.id,report:r.id},false,{cls:'compact'})}</td></tr>`).join('')}</tbody></table></div><div class="cm-actions">${b('Measure again','measure-deck',{deck:d.id})}${reports.length>1?b('Compare two runs','compare-reports',{deck:d.id}):''}${b('Reports & advice','deck-evidence',{deck:d.id})}${status}</div></section>`;
}
/* NO ART, NO EMPTY PANEL. A deck whose commander has no cached picture used to be a dark
   rectangle with text at the bottom; the commander's initials, faint, in the deck's own two
   colours, say what the tile is from across the room. */
const PIP={W:'#fff0b4',U:'#53acff',B:'#696076',R:'#ee735f',G:'#66b889'};
function initials(d){const c=C.state.cards[d.commanders[0]],ci=(c&&c.colorIdentity)||[],a=PIP[ci[0]]||'#b9b3a8',b2=PIP[ci[1]]||a;const text=(c?c.name:d.name).split(/[\s,]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');return `<div class="cm-deck-initials" aria-hidden="true" style="--ci-a:${a};--ci-b:${b2}">${e(text||'?')}</div>`;}
const art=d=>{const name=commander(d).toLowerCase();for(const n of ['atraxa','krenko','shadrix','chulane'])if(name.includes(n))return 'assets/crankmagic/commander-'+n+'.webp?v=1';return C.state.cards[d.commanders[0]]?.image||'';};
/* THE RIBBON READS LEFT TO RIGHT IN THE ORDER THE WORK HAPPENS: what the list asks for,
   what you have for it, what is on its way, what is still owed -- and last, separately,
   where the cards physically are. "In deck" used to lead, and it meant the physical box,
   so a deck you had finished buying read 0 and the ribbon looked broken rather than
   merely unconfirmed. */
/* TWO CLUSTERS, NOT FIVE FIGURES SPREAD ACROSS THE PAGE. The build-night questions on the left
   -- in the box, to pull, on the way, to buy -- and the money on the right: what finishing
   costs at sheet prices against the deck's cap. The bar under them is the same hundred as one
   line, and the legend names its colours. */
const pullCount=r=>r.pullFromBench+r.pullFromOtherBox;
function stats(d){const r=M.readiness(C.state,d),cap=d.definition.budget??(C.RULES?C.RULES.deckCap:null);
  return `<div class="cm-stats cm-deck-stats"><div class="cm-stat-cluster"><div><strong>${r.inBox}</strong><span>In box</span></div><div><strong>${pullCount(r)}</strong><span>To pull</span></div><div><strong>${r.ordered+r.incoming}</strong><span>Ordered</span></div><div><strong>${r.toBuy}</strong><span>${d.status==='draft'?'Not yet reserved':'To buy'}</span></div></div><div class="cm-stat-cluster cm-stat-money"><div><strong>${C.money(r.costToFinish)}</strong><span>$ to finish</span></div><div><strong>${cap===null?'—':C.money(cap)}</strong><span>cap</span></div></div></div><div class="cm-deck-readiness">${C.readinessBar(r)}${C.readinessLegend(r)}</div>`+budgetCard(d,r);}
/* THE BUDGET CARD. What finishing costs at sheet prices, what has been paid, what the owned
   copies are worth against the cap -- one bar, amber past 90%, red past 100% -- the Game
   Changer count, and how many lines were paid over the 110% cap. Every figure is the
   model's (readiness) or the rules module's, so the card agrees with the Shop strip and the
   Orders tab by construction: the same lots, the same prices. */
function budgetCard(d,r){const R=globalThis.CrankRules,cap=d.definition.budget??(R?R.RULES.deckCap:null),perCard=d.definition.perCardCap??(R?R.RULES.perCardMax:null);
  const pct=cap>0?r.marketValue/cap*100:null,tone=pct===null?'':pct>100?' cm-over':pct>90?' cm-near':'';
  const lots=C.state.lots.filter(l=>l.allocation?.deckId===d.id),overCap=R?lots.filter(l=>Number.isFinite(l.paid)&&R.capFor(C.state.cards[l.cardId].price)!==null&&l.paid>R.capFor(C.state.cards[l.cardId].price)).length:0;
  const dear=perCard!==null?d.slots.filter(x=>x.purpose==='main'&&C.state.cards[x.cardId].price>perCard).length:0,gc=gcCount(d);
  return `<section class="cm-budget${tone}" aria-label="Budget"><div class="cm-budget-figures"><div><strong>${C.money(r.costToFinish)}</strong><span>$ to finish (base)</span></div><div><strong>${C.money(r.paid)}</strong><span>Paid so far</span></div><div><strong>${C.money(r.marketValue)}</strong><span>Market value${pct!==null?` · ${Math.round(pct)}% of ${C.money(cap)} cap`:' · no cap'}</span></div><div><strong>${gc} / ${GC_LIMIT}</strong><span>Game Changers</span></div><div><strong class="${overCap?'cm-amber':''}">${overCap}</strong><span>line${overCap===1?'':'s'} over the 110% cap</span></div>${dear?`<div><strong class="cm-amber">${dear}</strong><span>card${dear===1?'':'s'} over ${C.money(perCard)}</span></div>`:''}</div>${cap>0?`<div class="cm-budget-bar" role="img" aria-label="Market value ${Math.round(pct)}% of the cap"><i style="width:${Math.min(100,pct)}%"></i></div>`:''}</section>`;}
/* THE JUMP BAR. A deck page runs to five thousand pixels on a phone; the sections are named
   under the ribbon and stay there while it scrolls. Buttons, not anchors: a hash is the
   router's, and #composition would have opened My Decks. */
const SECTIONS=[['composition','Composition'],['commander','Commander'],['guide','How to play'],['swot','SWOT'],['upgrades','Upgrade Path'],['record','Record'],['history','Simulation history']];
function jumpBar(d){const runs=measuredReports(d).length;return `<nav class="cm-jump" aria-label="On this page">${SECTIONS.map(([id,label])=>`<button type="button" class="cm-jump-link" data-action="jump" data-target="cm-sec-${id}">${e(label)}${id==='history'?` <small>${runs} run${runs===1?'':'s'}</small>`:''}</button>`).join('')}</nav>`;}
actions.jump=el=>{const t=document.getElementById(el.dataset.target);if(!t)return;const bar=document.querySelector('.cm-jump'),top=t.getBoundingClientRect().top+scrollY-((bar?bar.getBoundingClientRect().height:0)+(matchMedia('(max-width:760px)').matches?54:0)+10);scrollTo({top,behavior:'smooth'});};
views.decks=async params=>{const did=params.get('deck');if(did){const found=C.state.decks.find(x=>x.id===did);if(!found){C.main.innerHTML=head('My Decks','Deck not found','This library has no deck with that id. It may live in another browser’s library, or under a different link.',b('My Decks','home',{},true));return;}await overview(found);return;}const decks=C.state.decks.filter(d=>showArchived||!d.archived),picks=(C.state.preferences.comparisonPicks||[]).filter(id=>C.state.decks.some(d=>d.id===id));
/* THE SHOWCASE. The page opens on cards, not on a sentence: a fan of the reader's own
   commanders when they have decks, and three well-known ones while they do not. The fan
   is decoration -- it never claims a holding. */
const fanDecks=decks.filter(d=>!d.archived).slice(0,3),fanSrc=fanDecks.length?fanDecks.map(d=>[art(d),commander(d).split(',')[0]]).filter(([src])=>src):[['assets/crankmagic/commander-krenko.webp?v=1','Krenko'],['assets/crankmagic/commander-shadrix.webp?v=1','Shadrix'],['assets/crankmagic/commander-atraxa.webp?v=1','Atraxa']];
const fanSlots=fanSrc.length===1?['center']:fanSrc.length===2?['left','right']:['left','right','center'];
const fan=fanSrc.length?`<div class="cm-cardfan" aria-hidden="true">${fanSrc.map(([src,name],i)=>`<div class="cm-fan-card cm-fan-${fanSlots[i]}" style="background-image:url('${e(src)}')"><span>${e(name.toUpperCase())}</span></div>`).join('')}</div>`:'';
C.main.innerHTML=`<section class="cm-showcase"><div><div class="v-eyebrow cm-eyebrow-warm">Your Commander workshop</div><h1>Build it.<br><span>Make it yours.</span></h1><p class="cm-sub">Deck plans, the cards they need, and the games you want to play.</p><div class="cm-actions">${b('Create a deck','new-deck',{},true)}${b('Open Deck Lab','open-lab')}<button type="button" class="v-button" data-action="compare-decks"${picks.length<2?' disabled':''} title="${picks.length<2?'Tick at least two decks to compare them':'Compare the ticked decks'}">Compare selected${picks.length?` (${picks.length})`:''}</button></div></div>${fan}</section>`+`<div class="cm-toolbar cm-toolbar-split"><h2>Your decks</h2><label class="cm-checkbox cm-show-archived"><input id="cm-show-archived" type="checkbox" ${showArchived?'checked':''}>Show archived</label></div>`+(decks.length?`<div class="cm-deck-grid">${decks.map(d=>{const r=M.readiness(C.state,d);/* THE TILE. The compare tick lives in the top-right corner, always present, so comparing is
   a tick and the Compare button rather than a link to find in each footer. The mana pips sit
   on their own row under the mechanic; the footer -- bracket, latest score, hand count --
   used to wrap around them. */
const picked=picks.includes(d.id);
const toGo=r.target-r.owned,badge=d.archived?['draft','Archived']:r.ready?['inbox','Ready to play']:['buy',`In progress · ${toGo} to go`];
return `<article class="cm-deck-tile${picked?' is-picked':''}">${art(d)?`<img class="cm-deck-art" src="${e(art(d))}" alt="" loading="lazy">`:initials(d)}<label class="cm-tile-pick" title="Tick to compare this deck"><input type="checkbox" data-action="compare-pick" data-deck="${e(d.id)}"${picked?' checked':''} aria-label="Compare ${e(d.name)}"></label><button data-action="deck" data-deck="${e(d.id)}"><small>${e(d.name)}</small><h3>${e(commander(d)||'Choose a commander')}</h3>${d.definition.mechanics.length?`<p>${e(d.definition.mechanics.join(' · '))}</p>`:''}<span class="cm-tile-mana">${C.colors(C.state.cards[d.commanders[0]]?.colorIdentity)}</span>${C.pill(e(badge[1]),badge[0],'title="Cards not yet owned"')}</button><div class="cm-tile-ready">${C.readinessBar(r)}<span class="cm-tile-caption">${r.inBox} in box · ${pullCount(r)} pull · ${r.toBuy} buy${(()=>{const g=C.state.games.filter(x=>x.deckId===d.id);if(!g.length)return '';const w=g.filter(x=>x.outcome==='win').length,l=g.filter(x=>x.outcome==='loss').length;return ` · ${w}–${l}`;})()}</span></div><footer><span>B${d.definition.baseBracket}${scoreOf(latestReport(d))?` · <span class="cm-badge" title="Latest measured score">${e(scoreOf(latestReport(d)))} pts</span>`:''}</span><span class="cm-muted">${d.locked?'Locked':''}</span><span class="cm-tile-tools"><button type="button" class="cm-icon-button cm-tile-menu-btn" data-action="deck-menu" data-deck="${e(d.id)}" aria-haspopup="menu" aria-label="Deck options for ${e(d.name)}">⋯</button></span></footer></article>`;}).join('')}</div>`:`<section class="v-panel cm-empty"><h2>A fresh library. A new deck.</h2><p>Start from a commander and let the Lab build the 99, or paste a list you already have. Adding a plan creates no owned copies.</p><div class="cm-actions">${b('Select a commander','open-lab',{},true)}${b('Import a list','import-list')}${b('Import a backup','restore')}</div></section>`);$('#cm-show-archived').addEventListener('change',ev=>{showArchived=ev.target.checked;C.render();});};
/* A card's roles: the ones the catalog already carries, or the classifier read fresh from
   the rules text -- the same vocabulary the graph joins cards on, so "ramp" here is the
   ramp the Discover page means. */
const rolesOf=c=>Array.isArray(c.roles)&&c.roles.length?c.roles:(globalThis.MtgCardClassify&&MtgCardClassify.classify?(MtgCardClassify.classify(c).roles||[]):[]);
async function overview(d){const cards=d.slots.filter(r=>r.purpose==='main').map(r=>({c:C.state.cards[r.cardId],q:r.quantity})),types=['Land','Creature','Artifact','Enchantment','Instant','Sorcery','Planeswalker'],curve=Array(8).fill(0);for(const {c,q} of cards)if(!/Land/.test(c.typeLine))curve[Math.min(7,Number(c.manaValue)||0)]+=q;const max=Math.max(1,...curve),issues=[...M.legality(C.state,d),...M.definitionIssues(C.state,d)];let offline=null;const leaders=await Promise.all(d.commanders.map(id=>C.catalog.details(C.state.cards[id],{onFail:error=>{offline=error;}})));
  if(offline)C.notice('Could not reach Scryfall, so this page is showing the card facts already saved. Card data age is in User Functions.',true);let guide=null;try{const data=await C.catalog.load(CrankAssets.guides);guide=data.decks.find(g=>g.commander===leaders[0]?.name);}catch{}if(C.route().view!=='decks'||C.route().params.get('deck')!==d.id)return;const swot=structural(d,cards);
const ready=M.readiness(C.state,d),heroArt=art(d);
/* WHAT THE LIST COSTS AGAINST WHAT THE DEFINITION ALLOWS. The Lab drafts against the cap as
   a target rather than a wall, so a list can arrive here over it -- and the reader used to
   find out only when Finalize refused. It is a badge in the hero now, with both numbers. */
const spend=cards.reduce((n,{c,q})=>Number.isFinite(c.price)?n+c.price*q:n,0),cap=d.definition.budget,overCap=cap!==null&&cap!==undefined&&spend>cap;
const latest=latestReport(d);
C.main.innerHTML=`<section class="cm-deck-hero"${heroArt?` style="--hero:url('${e(heroArt)}')"`:''}><div class="cm-deck-hero-copy"><div class="v-eyebrow cm-eyebrow-warm">My Decks / Deck overview</div><h1>${e(d.name)}</h1><p>${e(commander(d))} ${C.colors(C.state.cards[d.commanders[0]]?.colorIdentity)} <span class="cm-badge ${ready.ready?'good':''}">${d.archived?'Archived':d.status==='draft'?'Draft':ready.ready?'Ready to play':'In progress'}</span> <span class="cm-badge">Bracket ${e(String(d.definition.baseBracket))}–${e(String(d.definition.bracketCeiling))}</span>${overCap?` <span class="cm-badge warn" title="Recorded prices of the main list against the definition’s total cap">Over the ${e(C.money(cap))} cap · about ${e(C.money(spend))}</span>`:''}${latest?` <span class="cm-badge" title="Latest measured score">Measured ${e(scoreOf(latest))} pts</span>`:''}${attached(d)?` <span class="cm-badge">Group: ${e(attached(d).name)}</span> <button type="button" class="cm-text-button cm-hero-link" data-action="deck-group" data-group="${e(d.groupId)}">Open group</button>`:''}${d.locked?' <span class="cm-badge warn">Locked</span>':''}</p></div><div class="cm-actions">${b('View deck cards','deck-cards',{deck:d.id},true)}${b('Edit definition','edit-deck',{deck:d.id})}${d.status==='draft'?b('Edit card list','edit-list',{deck:d.id}):''}</div></section>`+stats(d)+/* THREE THINGS YOU DO TO A DECK, AND TWO DRAWERS FOR THE REST. Nine buttons in one row
   made the two that matter -- where the deck's cards come from, and whether it is settled --
   as easy to miss as Export deck list. The row is now the work, in the order it happens:
   the group it draws from, reserving copies against it, and locking it once it is together.
   Everything that reads the deck goes behind Insight; everything administrative behind
   Manage. Put the deck in its box is gone from here entirely: which box a copy sits in is a
   fact about that copy, recorded per card (or per tick) in the Collection, and for this
   app's purposes locking the deck is the sentence a reader means by it. */
/* THE ACTION ROW IS THE WORK, IN THE ORDER IT HAPPENS: pull what you own into the box, buy
   what you do not, weigh the upgrades, log the game. Card status stays; everything
   administrative and every read-only view lives behind More. */
`<div class="cm-actions cm-deck-actions">${d.archived?b('Restore as draft','restore-deck',{deck:d.id})+b('Delete permanently','delete-deck',{deck:d.id}):(d.status==='final'?b(pullCount(ready)+ready.remove>0?`Pull sheet (${pullCount(ready)+ready.remove})`:'Pull sheet','deck-pull',{deck:d.id},pullCount(ready)+ready.remove>0):b('Finalize & reserve','finalize',{deck:d.id},true))+b(`Buy list (${ready.toBuy})`,'deck-buy-list',{deck:d.id})+b(`Upgrades (${d.slots.filter(r=>r.purpose!=='main').length})`,'deck-upgrades',{deck:d.id})+b('Log a game','log-game',{deck:d.id})+b('Card status','deck-status-menu',{deck:d.id},false,{caret:'down'})+b('More','deck-more-menu',{deck:d.id},false,{caret:'down'})}</div>`+(d.archived?note('Archived: this list remains in history. Its copies were released; their actual physical boxes are still recorded.'):d.status==='draft'?note('Draft: review the list before finalizing. There are no reservations until you finalize.'+(overCap?` This list is about ${C.money(spend)} at recorded prices against a ${C.money(cap)} cap; Finalize will offer to raise or remove the cap, or trim the list first.`:''),overCap):tip('finalized','Finalized: reservations track what this list needs. The pull sheet walks the cards you own into the box; the buy list is what is left.'))+jumpBar(d)+`<div class="cm-grid-2"><section class="v-panel" id="cm-sec-composition"><h2>Composition</h2><div class="cm-curve" aria-label="Mana curve">${curve.map((n,i)=>`<div><span>${n||''}</span><i style="height:${n/max*88}px"></i><span>${i===7?'7+':i}</span></div>`).join('')}</div><div class="cm-count-list">${types.map(t=>`<span>${C.glossary.html(t)} <strong>${cards.filter(x=>x.c.typeLine.includes(t)).reduce((n,x)=>n+x.q,0)}</strong></span>`).join('')}<span>Ramp <strong>${cards.filter(x=>rolesOf(x.c).includes('ramp')).reduce((n,x)=>n+x.q,0)}</strong></span></div><small>Multitype cards appear in each applicable type. Ramp is read from the rules text by the same classifier the graph uses.</small></section><section class="v-panel" id="cm-sec-commander">${leaders.map(c=>`<div class="cm-commander">${c.image?`<img src="${e(c.image)}" alt="${e(c.name)}">`:'<div></div>'}<div><h2>About the Commander</h2><h3>${e(c.name)}</h3><ul><li>${C.mana(c.manaCost)} · ${c.power!==null?e(c.power+'/'+c.toughness)+' · ':''}${C.glossary.html(c.typeLine)}</li><li>${C.glossary.html(c.keywords.join(', ')||'No keyword abilities recorded')}</li>${c.oracleText.split('\n').filter(line=>/^(When|Whenever|At the beginning)|:/.test(line)).map(t=>`<li>${C.glossary.html(t)}</li>`).join('')}</ul><p>${e(commanderUse(c))}</p>${b('Full card & rules','card',{card:c.id})}</div></div>`).join('<hr>')}</section></div><div class="cm-grid-2"><section class="v-panel" id="cm-sec-guide"><h2>Strategy & how to play</h2>${guideHTML(guide,d,leaders,cards)}<h3>Your notes</h3><p>${e(d.notes||'No deck notes yet.')}</p></section><section class="v-panel" id="cm-sec-swot"><h2>SWOT & recommendations</h2>${note('Structural observations from this list: text matches, not modeled availability. Measured performance is in Simulation history below; matchup-specific advice still needs four-player testing.')}<div class="cm-swot">${Object.entries(swot).map(([k,v])=>`<div><h3>${e(k)}</h3><p>${e(v)}</p></div>`).join('')}</div><h3>Review next</h3><ul>${issues.slice(0,5).map(x=>`<li>${e(x)}</li>`).join('')||'<li>The basic Commander list checks pass. Review price, bracket expectations and your playgroup’s preferences.</li>'}</ul>${b('Explore recommendations','deck-suggestions',{deck:d.id})}${b('Review linked upgrades','jump',{target:'cm-sec-upgrades'})}</section></div>`+upgradesHTML(d)+recordHTML(d)+historyHTML(d);}
/* THE UPGRADE PATH HAS A HOME. The ceiling cards used to interleave the Collection as
   Suggestion rows, with no replaces, no tier, no price and no reason. This panel is the
   deck's linked options as the list Rob wrote them: what comes in, what it replaces, the
   tier, the sheet price, why -- and Promote, which is acceptOption: the main slot takes the
   new card, the old copy is released to another need or the bench, and the new card is a
   To buy row at its sheet price. Game Changers wear a chip and are counted against the
   bracket's limit of two in the header; promoting a third asks first. */
const GC_LIMIT=2;
let upFilter={tuned:false,cheap:false};
const cheapLine=d=>/^D[56]\b/.test(d.name)?1.5:2;
const gcCount=d=>d.slots.filter(r=>r.purpose==='main'&&C.state.cards[r.cardId]&&C.state.cards[r.cardId].gameChanger).reduce((n,r)=>n+r.quantity,0);
function upgradesHTML(d){
  const all=d.slots.filter(r=>r.purpose==='upgrade'),line=cheapLine(d),gc=gcCount(d);
  /* The sheet price where the catalog has one; the price the upgrade was written with otherwise. */
  const priceOf=r=>{const c=C.state.cards[r.cardId];return Number.isFinite(c.price)?c.price:Number.isFinite(r.price)?r.price:null;};
  const rows=all.filter(r=>(!upFilter.tuned||r.tier===1)&&(!upFilter.cheap||(priceOf(r)!==null&&priceOf(r)<=line))).sort((a,b)=>(a.tier||9)-(b.tier||9)||((priceOf(a)||0)-(priceOf(b)||0)));
  const toMax=all.reduce((n,r)=>n+(priceOf(r)>0?priceOf(r)*r.quantity:0),0);
  const head=`<h2>Upgrade Path <span class="cm-pull-n">${all.length}</span> <span class="cm-muted cm-up-max">${C.money(Math.round(toMax*100)/100)} to Max</span> ${C.pill(`GC ${gc} / ${GC_LIMIT}`,gc>GC_LIMIT?'remove':'watch','title="Game Changers in the main list against the bracket limit"')}</h2>`;
  if(!all.length)return `<section class="v-panel cm-upgrades" id="cm-sec-upgrades">${head}<p class="cm-muted">No linked upgrades yet. Open a card’s Replacements &amp; options from the deck’s list, or load them with the live file.</p></section>`;
  return `<section class="v-panel cm-upgrades" id="cm-sec-upgrades">${head}<div class="cm-actions cm-up-filters"><label class="cm-checkbox"><input type="checkbox" data-up-filter="tuned"${upFilter.tuned?' checked':''}>Tuned only</label><label class="cm-checkbox"><input type="checkbox" data-up-filter="cheap"${upFilter.cheap?' checked':''}>Under ${C.money(line)}</label><span class="cm-muted">${rows.length} of ${all.length}</span></div><div class="cm-table-wrap"><table class="cm-table cm-up-table"><thead><tr><th scope="col">Add</th><th scope="col">Replaces</th><th scope="col">Tier</th><th scope="col">Price</th><th scope="col">Why</th><th scope="col">Promote</th></tr></thead><tbody>${rows.map(r=>{const c=C.state.cards[r.cardId],out=C.state.cards[M.slot(C.state,d.id,r.replaces).cardId];return `<tr><td><button type="button" class="cm-card-name" data-action="card" data-card="${e(c.id)}">${e(c.name)}</button>${c.gameChanger?' '+C.pill('GC','remove','title="Game Changer"'):''}</td><td>${e(out.name)}</td><td>${r.tier?`T${r.tier}`:'—'}</td><td class="cm-price">${C.money(priceOf(r))}</td><td class="cm-up-why">${e(r.why||r.notes||'')}</td><td>${b('Promote','promote-option',{deck:d.id,slot:r.id},false,{cls:'compact'})}</td></tr>`;}).join('')||`<tr><td colspan="6">Nothing matches these filters.</td></tr>`}</tbody></table></div></section>`;}
actions['promote-option']=el=>{const d=M.deck(C.state,el.dataset.deck),r=M.slot(C.state,d.id,el.dataset.slot),c=C.state.cards[r.cardId],out=C.state.cards[M.slot(C.state,d.id,r.replaces).cardId];
  const gc=gcCount(d),willExceed=c.gameChanger&&!out.gameChanger&&gc+1>GC_LIMIT;
  C.review(`Promote ${c.name}`,C.compareCards(out,c,{outLabel:'Out of the deck',intoLabel:'Into the deck'})+note(`${c.name} takes the slot; ${out.name}’s copy is released to another need or the bench. ${c.name} joins the buy list at ${C.money(Number.isFinite(c.price)?c.price:r.price)} until a copy is recorded.`)+(willExceed?note(`This is a Game Changer, and the list already carries ${gc} of the ${GC_LIMIT} the bracket allows. Promote it and the deck reads bracket 4.`,true):''),{type:'acceptOption',deckId:d.id,slotId:r.id});};
document.addEventListener('change',ev=>{const t=ev.target.closest('[data-up-filter]');if(!t)return;upFilter[t.dataset.upFilter]=t.checked;const d=C.route().params.get('deck');if(d&&C.route().view==='decks')C.render();});
/* THE GUIDE. A hand-written one when this commander has it (data/deck-guides.json); otherwise
   one generated from this exact list and its latest measurement by guide-measured.js -- which
   names only cards in the deck and states only what it counted. The note says which. */
function guideHTML(written,d,leaders,cards){
  let g=written,label;
  if(g)label=note('Written guide for this commander. It describes the reference list it was written for, not a newly simulated assessment of yours.');
  else{
    const leader=leaders[0];if(!leader||!cards.length)return '<p>Add cards to this deck and a guide will be generated from the list: what feeds the commander, how the curve sits, and where the counts run thin.</p>';
    const report=C.state.reports.filter(r=>r.deckId===d.id&&r.origin==='measured').slice(-1)[0]||null;
    try{g=CrankGuideMeasured.build({commander:leader,cards:cards.map(x=>({card:x.c,quantity:x.q})),styles:CrankCatalog.playStyles(leader),report});}catch(err){return `<p class="cm-muted">The guide could not be generated: ${e(err.message)}</p>`;}
    label=note(report?'Generated from this list and its measurement. It names only cards in the deck and claims nothing it did not count; the measured line is the simulator\u2019s, the rest is arithmetic.':'Generated from this list. Measure the deck in the Deck Lab and the measured line joins it. It names only cards in the deck and claims nothing it did not count.');
  }
  return label+`<p class="cm-guide-meta">${g.archetype?`<span class="cm-badge">${e(g.archetype)}</span>`:''}${g.difficulty?`<span class="cm-badge ${g.difficulty.tier==='Advanced'?'warn':g.difficulty.tier==='Beginner'?'good':''}">${e(g.difficulty.tier)}</span><span class="cm-muted">${e(g.difficulty.why)}</span>`:''}</p><p class="cm-guide-hook">${e(g.hook)}</p>${g.whatItDoes?`<h3>What it does</h3><p>${e(g.whatItDoes)}</p>`:''}<h3>How it wins</h3><p>${e(g.howItWins)}</p>${(g.turns||[]).map(t=>`<h3>${e(t.when)}</h3><p>${e(t.do)}</p>`).join('')}<h3>Mulligan</h3><p>${e(g.mulligan)}</p>${g.keyCards?.length?`<h3>Key cards</h3><ul class="cm-guide-keys">${g.keyCards.map(k=>`<li><button type="button" class="cm-card-name" data-action="card" data-card="${e(CrankCatalog.key(k.name))}">${e(k.name)}</button> — ${e(k.why)}</li>`).join('')}</ul>`:''}${g.watchFor?.length?`<h3>Watch for</h3><ul class="cm-guide-watch">${g.watchFor.map(x=>`<li>${e(x)}</li>`).join('')}</ul>`:''}`;
}
function commanderUse(c){const o=c.oracleText||'';if(/create/i.test(o)&&/goblin/i.test(o)&&/number of goblins/i.test(o))return 'Establish a Goblin board before tapping Krenko. More Goblins increase the number created by each activation; account for summoning sickness and protect the engine.';if(/token/i.test(o))return 'Set up the resources and timing this commander’s abilities require. Use the resulting tokens to support your deck’s plan, and leave the mana needed for its activated abilities.';if(/draw/i.test(o))return 'Sequence the plays that satisfy this commander’s draw ability, then use the extra cards to keep your plan moving. Keep interaction available when committing the commander.';return 'Build around the abilities shown here. Meet their trigger conditions or activation costs, time the commander around your available mana, and protect it when your next plays depend on it.';}
function structural(d,cards){const count=re=>cards.filter(x=>re.test(x.c.oracleText||'')).reduce((n,x)=>n+x.q,0),draw=count(/draw .*card/i),interaction=count(/destroy|exile target|counter target/i),lands=cards.filter(x=>/Land/.test(x.c.typeLine)).reduce((n,x)=>n+x.q,0);return {Strengths:`${draw} cards mention drawing cards; ${interaction} mention removal or countering. These are text matches, not modeled availability.`,Weaknesses:`${lands} lands in the list. Check opening-hand reliability and access to every commander color.`,Opportunities:`Explore ${d.definition.mechanics.join(', ')||'your commander’s core mechanics'} and compare role-compatible options while preserving the deck’s definition.`,Threats:'Opposing disruption, resource denial and faster win conditions need four-player testing. No matchup probability is asserted here.'};}
actions.deck=el=>go('decks',{deck:el.dataset.deck});actions['deck-cards']=el=>go('collection',{deck:el.dataset.deck});actions['deck-group']=el=>go('collection',{group:el.dataset.group});actions['open-lab']=()=>go('lab');
/* TWO WAYS TO START A DECK, because there are two ways people start one. From scratch you
   pick a commander and the ninety-nine come later. From what you already have, the group is
   the deck: it names its own commander -- the one Commander-legal card in it -- and the deck
   is created attached to that group, so the thing it draws from is set from the first day. */
function commanderDeck(groupId){
  return C.cardPicker('Choose your commander',c=>form('Name your new deck',f('Deck name','name',c.name+' deck','required maxlength="160"')+f('Core mechanic','mechanic',c.mechanics[0]||c.keywords[0]||''),async data=>{const id='deck:'+C.uid();await commit({type:'createDeck',deckId:id,name:data.name,commanders:[c.id],cards:[c],slots:[{cardId:c.id,quantity:1}],definition:{mechanics:data.mechanic?[data.mechanic]:[]},...(groupId?{groupId}:{})});go('decks',{deck:id});},'Create draft'),{commander:true});
}
const groupRows=g=>g.entries.length?g.entries.map(r=>({cardId:r.cardId,quantity:r.quantity,printing:r.printing})):C.state.lots.filter(l=>l.groupIds.includes(g.id)).map(l=>({cardId:l.cardId,quantity:l.quantity,printing:l.printing}));
const filledGroups=()=>C.state.groups.filter(g=>groupRows(g).length);
function groupDeck(groupId){
  const g=C.state.groups.find(x=>x.id===groupId);
  if(!g)throw Error('Choose a collection group.');
  const rows=groupRows(g);
  if(!rows.length)throw Error(`${g.name} holds no cards yet, so there is nothing to start a deck from. Import a list into it, or start from a commander.`);
  const leaders=rows.map(r=>C.state.cards[r.cardId]).filter(c=>c&&c.commander&&c.legalities?.commander==='legal');
  if(!leaders.length)throw Error(`${g.name} holds no Commander-legal creature, so there is nothing to lead the deck. Add one, or start from a commander instead.`);
  return form(`New deck from ${g.name}`,f('Deck name','name',leaders[0].name+' deck','required maxlength="160"')+s('Commander','commanderId',leaders.map(c=>[c.id,c.name]),leaders[0].id)+note(`${rows.reduce((n,r)=>n+r.quantity,0)} cards come across from ${g.name}, and the deck stays attached to that group.`),
    async data=>{const id='deck:'+C.uid();
      await commit({type:'createDeck',deckId:id,name:data.name,commanders:[data.commanderId],groupId:g.id,
        slots:rows.some(r=>r.cardId===data.commanderId)?rows:[{cardId:data.commanderId,quantity:1},...rows]});
      go('decks',{deck:id});},'Create draft');
}
/* NOTHING HERE IS A QUESTION YOU HAVE TO ANSWER. Both selects open on the answer most
   people want -- a commander, and a fresh group made with the deck -- so Continue works
   without touching either. The group select had no such default: it opened on whichever
   group happened to sort first and read as a demand to pick one. Its first option is now
   the thing that already happens when you say nothing. */
actions['new-deck']=()=>{
  const sources=filledGroups();
  if(!sources.length)return commanderDeck();
  return form('Start a new deck',
    s('Start from','how',[['commander','A commander — build the 99 from there'],['group','The cards in a collection group']],'commander')
    +`<div class="cm-full">${s('Collection group','groupId',[['','Create a new collection group'],...C.state.groups.map(g=>[g.id,g.name])],'')}</div>`
    +note('Leave the group alone and one is made with the deck, named after it. Choose an existing group and the deck lives there instead — and if you are also starting from that group, its cards come across as the deck’s list.'),
    v=>{
      if(v.how!=='group')return commanderDeck(v.groupId||undefined);
      if(!v.groupId)throw Error('Choose which collection group to start from — a new empty group has no cards to start from. Or start from a commander instead.');
      return groupDeck(v.groupId);
    },'Continue');
};
actions['edit-deck']=el=>{const d=M.deck(C.state,el.dataset.deck);form('Deck Definition',f('Deck name','name',d.name,'required maxlength="160"')+f('Core mechanics (comma separated)','mechanics',d.definition.mechanics.join(', '))+s('Base bracket','baseBracket',[1,2,3,4,5],d.definition.baseBracket)+s('Bracket ceiling','bracketCeiling',[1,2,3,4,5],d.definition.bracketCeiling)+f('Total price cap ($)','budget',d.definition.budget??'',`type="number" min="0" step="0.01" placeholder="${C.RULES?C.RULES.deckCap:225}"`)+f('Per-card price cap ($)','perCardCap',d.definition.perCardCap??'',`type="number" min="0" step="0.01" placeholder="${C.RULES?C.RULES.perCardMax:30}"`)+s('Collection group this deck draws from','groupId',C.state.groups.map(g=>[g.id,g.name]),d.groupId||(C.state.groups[0]&&C.state.groups[0].id)||'')+`<label class="cm-full">Deck notes<textarea name="notes">${e(d.notes)}</textarea></label>`,data=>commit({type:'editDeck',deckId:d.id,name:data.name,notes:data.notes,groupId:data.groupId||null,definition:{...d.definition,baseBracket:Number(data.baseBracket),bracketCeiling:Number(data.bracketCeiling),mechanics:data.mechanics.split(',').map(x=>x.trim()).filter(Boolean),/* BLANK MEANS THE HOUSE RULE. The caps used to be blank on every live deck, so nothing was
       ever over anything. The form shows the standing figures as placeholders and writes them
       on save when the field is left empty; Finalize's "remove the price caps" clears them. */
      budget:data.budget===''?(C.RULES?C.RULES.deckCap:null):Number(data.budget),perCardCap:data.perCardCap===''?(C.RULES?C.RULES.perCardMax:null):Number(data.perCardCap)}}));};
/* ATTACHING AN EXISTING GROUP IS THE OTHER ROAD IN: you uploaded a sheet, the cards are in a
   group, and now you want a deck around them. So attaching offers to bring the group's cards
   across as the deck's list -- offered only where it cannot destroy anything, on a draft
   whose list is still empty or just its commander. Filing copies into the group by hand is
   gone: a copy reserved for the deck is in the deck's group by being reserved for the deck. */
actions['attach-group']=el=>{
  const d=M.deck(C.state,el.dataset.deck);
  if(!C.state.groups.length)throw Error('Create a collection group first, from the Collection page.');
  const choices=C.state.groups.filter(g=>g.id!==d.groupId);
  if(!choices.length)throw Error(`${d.name} is already attached to your only collection group.`);
  const main=()=>d.slots.filter(r=>r.purpose==='main');
  const bare=d.status==='draft'&&main().length<=1;
  /* The offer is about the group you pick, which you pick after the dialog opens -- keying it
     off the first one in the list hid it whenever that one happened to be empty. */
  const anyRows=choices.some(g=>groupRows(g).length);
  form(d.groupId?'Change the collection group':'Attach a collection group',
    `<div class="cm-full">${s('Collection group','groupId',choices.map(g=>[g.id,g.name]),'')}</div>`
    +(bare&&anyRows?`<label class="cm-checkbox cm-full"><input type="checkbox" name="adopt" checked>Bring the group\u2019s cards across as this deck\u2019s list</label>`:'')
    +note('This deck\u2019s cards appear under this group in the Collection, and a copy filed there is reserved for this deck before any other matching copy.'),
    v=>{
      const g=C.state.groups.find(x=>x.id===v.groupId);
      const rows=g?groupRows(g):[];
      const take=v.adopt&&bare&&rows.length;
      const keep=main().map(r=>({cardId:r.cardId,quantity:r.quantity,printing:r.printing,purpose:'main'}));
      const slots=rows.some(r=>d.commanders.includes(r.cardId))?rows:[...keep,...rows];
      return commit({type:'editDeck',deckId:d.id,groupId:v.groupId,...(take?{slots}:{})});
    },d.groupId?'Change group':'Attach group');
};
/* FINALIZING IS WHERE LEGALITY STARTS COSTING MONEY: it is the step that turns a plan into
   reservations and a To buy list. So the hundred are re-read from Scryfall first, and the
   deck's own card records take the fresh ban list -- by name, onto the ids the deck already
   uses, so nothing is duplicated. The model's existing rule then refuses a banned card by
   name, as it always would have if the facts had been current. When Scryfall cannot be
   reached the check is skipped and said so, rather than passing silently on old facts. */
async function refreshLegality(d){
  const cards=[...new Set(d.slots.filter(r=>r.purpose==='main').map(r=>r.cardId).concat(d.commanders))]
    .map(id=>C.state.cards[id]).filter(Boolean);
  if(!cards.length)return true;
  const result=await C.catalog.recheck(cards);
  if(!result.reachable){
    C.notice('Could not reach Scryfall, so this deck was checked against the card catalog as it was last refreshed. Card data age is in User Functions.',true);
    return false;
  }
  const fresh=new Map(result.checked.map(c=>[c.name.toLowerCase(),c]));
  const moved=cards.map(c=>{const f=fresh.get(c.name.toLowerCase());
    return f&&JSON.stringify(f.legalities||{})!==JSON.stringify(c.legalities||{})?{...c,legalities:f.legalities,verified:true}:null;}).filter(Boolean);
  if(moved.length)await commit({type:'cards',cards:moved},{renderView:false});
  return true;
}
actions.finalize=async el=>{
  const d=M.deck(C.state,el.dataset.deck);
  const current=await refreshLegality(d);
  const fresh=M.deck(C.state,d.id),money=M.definitionIssues(C.state,fresh),legal=M.legality(C.state,fresh);
  /* THE CAP IS THE ONLY THING IN THE WAY. The Lab drafts against the definition's price cap
     as a target, not a wall, so a list can arrive here costing more than the cap allows --
     and the reader found out only when Finalize refused. Say it here, with the numbers, and
     offer the two honest ways through: raise the cap to what the list costs, or drop it.
     Trimming the list is the third, and that one is a Cancel. */
  if(money.length&&!legal.length){
    const main=fresh.slots.filter(r=>r.purpose==='main').map(r=>({c:C.state.cards[r.cardId],q:r.quantity}));
    const spend=main.reduce((n,{c,q})=>Number.isFinite(c.price)?n+c.price*q:n,0),dearest=Math.max(0,...main.map(({c})=>Number.isFinite(c.price)?c.price:0));
    const def=fresh.definition,raise={...def,budget:def.budget!==null&&spend>def.budget?Math.ceil(spend):def.budget,perCardCap:def.perCardCap!==null&&dearest>def.perCardCap?Math.ceil(dearest*100)/100:def.perCardCap};
    const raiseLabel=`Raise the cap${raise.budget!==def.budget?' to '+C.money(raise.budget):''}${raise.perCardCap!==def.perCardCap?(raise.budget!==def.budget?' and':'')+' the per-card cap to '+C.money(raise.perCardCap):''} and finalize`;
    return form('This list costs more than its cap',`<div class="cm-full">${note(money.join(' '),true)}<p class="cm-muted">About ${e(C.money(spend))} at recorded prices${def.budget!==null?` against a ${e(C.money(def.budget))} total cap`:''}.</p></div>${s('What to do','how',[['raise',raiseLabel],['clear','Remove the price caps and finalize'],['trim','Keep the cap — I will trim the list first']],'raise')}`,
      async v=>{if(v.how==='trim')return;const definition=v.how==='raise'?raise:{...def,budget:null,perCardCap:null};
        await commit({type:'batch',summary:`Finalized ${fresh.name} after ${v.how==='raise'?'raising':'removing'} its price cap`,commands:[{type:'editDeck',deckId:fresh.id,definition},{type:'finalize',deckId:fresh.id}]});},'Finalize');
  }
  C.review('Finalize '+fresh.name,note(`This reserves eligible available copies and creates To buy requirements for the remainder. It does not claim you own any missing cards. Prices and bracket expectations require your review.${current?' Every card in the list was re-checked against Scryfall just now.':''}`),{type:'finalize',deckId:d.id});
};
actions.lock=async el=>{const d=M.deck(C.state,el.dataset.deck);if(!d.locked)await refreshLegality(d);C.review(d.locked?'Unlock deck':'Lock deck',note('All copies remain visible. A lock excludes the deck’s copies from automatic build consideration unless you explicitly allow that donor.'),{type:'lock',deckId:d.id,locked:!d.locked});};
actions.fulfill=el=>C.review('Reserve available copies',note('Unassigned eligible copies fulfill matching needs. This changes reservations; it does not physically move cards.'),{type:'fulfill',deckId:el.dataset.deck});
function popMenu(el,html,width=250){
  document.querySelectorAll('.cm-tile-menu').forEach(m=>m.remove());
  const menu=document.createElement('div');menu.className='cm-menu cm-tile-menu';menu.setAttribute('popover','auto');menu.innerHTML=html;
  document.body.appendChild(menu);const r=el.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-width))+'px';
  menu.style.top=Math.min(r.bottom+6,window.innerHeight-menu.offsetHeight-8)+'px';
  menu.showPopover();menu.addEventListener('toggle',ev=>{if(ev.newState==='closed')menu.remove();});
  menu.addEventListener('click',ev=>{if(ev.target.closest('[data-action]'))menu.hidePopover();});
  return menu;
}
actions['deck-more-menu']=el=>{const d=M.deck(C.state,el.dataset.deck),g=attached(d);popMenu(el,`<p>${e(d.name)}</p>${g?b('View the collection group','deck-group',{group:g.id}):''}${b(g?'Change the collection group':'Attach a collection group','attach-group',{deck:d.id})}${b('Reserve available copies','fulfill',{deck:d.id})}${d.status==='final'?b(d.locked?'Unlock deck':'Lock deck','lock',{deck:d.id}):''}<hr>${b('Edit definition','edit-deck',{deck:d.id})}${b('Export deck list','deck-export',{deck:d.id})}${b('Archive deck','archive',{deck:d.id})}<hr><p>Insight</p>${b('Recommendations','deck-suggestions',{deck:d.id})}${b('Reports & advice','deck-evidence',{deck:d.id})}`,270);};
actions['deck-pull']=el=>go('pull',{deck:el.dataset.deck});
actions['deck-buy-list']=el=>go('shop',{deck:el.dataset.deck});
actions['deck-upgrades']=el=>{const target=document.getElementById('cm-sec-upgrades');if(target&&C.route().params.get('deck')===el.dataset.deck)return actions.jump({dataset:{target:'cm-sec-upgrades'}});go('decks',{deck:el.dataset.deck});};
/* A TIP IS READ ONCE. The finalized banner sat on every visit to every finalized deck with no
   way to close it; it closes now, and stays closed, under preferences.dismissedTips. */
function tip(id,text){const gone=(C.state.preferences.dismissedTips||[]).includes(id);return gone?'':`<div class="cm-note cm-tip"><span>${e(text)}</span><button type="button" class="cm-tip-close" data-action="dismiss-tip" data-tip="${e(id)}" aria-label="Dismiss this tip">×</button></div>`;}
actions['dismiss-tip']=el=>commit({type:'preferences',values:{dismissedTips:[...new Set([...(C.state.preferences.dismissedTips||[]),el.dataset.tip])]}});
actions['group-menu']=el=>{
  const d=M.deck(C.state,el.dataset.deck),g=attached(d);
  popMenu(el,g?`<p>This deck lives in ${e(g.name)}</p>${b('View the group','deck-group',{group:g.id})}${b('Add planned cards','add-group-entry',{group:g.id})}${b('Change the group','attach-group',{deck:d.id})}`
    :`<p>No collection group attached</p>${b('Attach a collection group','attach-group',{deck:d.id})}`);
};
actions['deck-menu']=el=>{const d=M.deck(C.state,el.dataset.deck);document.querySelectorAll('.cm-tile-menu').forEach(m=>m.remove());const menu=document.createElement('div');menu.className='cm-menu cm-tile-menu';menu.setAttribute('popover','auto');
  menu.innerHTML=`<p>${e(d.name)}</p>${b('Open deck','deck',{deck:d.id})}${b('View deck cards','deck-cards',{deck:d.id})}<hr>${d.archived?b('Restore as draft','restore-deck',{deck:d.id})+`<button data-action="delete-deck" data-deck="${e(d.id)}" class="cm-danger">Delete permanently</button>`:b('Archive deck','archive',{deck:d.id})}`;
  document.body.appendChild(menu);const r=el.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-230))+'px';menu.style.top=Math.min(r.bottom+6,window.innerHeight-260)+'px';menu.showPopover();menu.addEventListener('toggle',ev=>{if(ev.newState==='closed')menu.remove();});};
actions['delete-deck']=el=>{const d=M.deck(C.state,el.dataset.deck);if(!d.archived)throw Error('Archive the deck first. Delete permanently is offered on archived decks only.');
  const games=C.state.games.filter(g=>g.deckId===d.id).length,reports=C.state.reports.filter(r=>r.deckId===d.id).length;
  /* The typed DELETE goes with the message: a reader who has turned the warning off has
     said they know what this does, and asking them to type it anyway is theatre. What is
     never skipped is that it only applies to archived decks. */
  if(C.skipping('deleteDeck'))return commit({type:'deleteDeck',deckId:d.id,confirmed:true}).then(()=>{C.notice('Deleted permanently. You turned this confirmation off; User Functions → Confirmations turns it back on.');go('decks');});
  form('Delete '+d.name+' permanently',`<div class="cm-full">${note(`This removes the deck plan, ${reports} report${reports===1?'':'s'} and ${games} logged game${games===1?'':'s'}. Copies physically in its deck box return to the Bench. Your owned cards are not deleted. This cannot be undone.`,true)}${f('Type DELETE to confirm','confirm','','required autocomplete="off"')}<label class="cm-checkbox cm-full"><input type="checkbox" name="skipNext">Don’t show this message again</label></div>`,async v=>{if(v.confirm!=='DELETE')throw Error('Type DELETE exactly.');if(v.skipNext)await C.setSkip('deleteDeck',true);await commit({type:'deleteDeck',deckId:d.id,confirmed:true});go('decks');},'Delete permanently');};
/* Straight through when the reader has said so, with a toast that names what happened and
   where the confirmation went, so a silent archive is never a mystery. */
actions.archive=el=>C.skipping('archive')
  ?commit({type:'archive',deckId:el.dataset.deck,confirmed:true}).then(()=>C.notice('Archived. You turned this confirmation off; User Functions → Confirmations turns it back on.'))
  :C.review('Archive this deck',note('Keep the plan and history. Owned copies go to compatible outstanding needs in deck priority order, then the Bench. Orders and actual box locations remain recorded.',true),{type:'archive',deckId:el.dataset.deck},{remember:'archive'});actions['restore-deck']=el=>commit({type:'restoreDeck',deckId:el.dataset.deck});
/* LOG A GAME, WITH THE FACTS THE RECORD CARD READS BACK: the date, the finish in a pod of
   how many, the bracket it was played at, the card that won it and the card that sat dead in
   hand -- both pickers limited to the deck's own list. */
actions['log-game']=el=>{const d=M.deck(C.state,el.dataset.deck),did=d.id,cards=d.slots.filter(r=>r.purpose==='main').map(r=>C.state.cards[r.cardId]).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>[c.id,c.name]);
  form('Log a real game',f('Date','playedAt',new Date().toISOString().slice(0,10),'type="date" required')+s('Outcome','outcome',[['win','Win'],['loss','Loss'],['draw','Draw'],['unfinished','Unfinished']],'win')+s('Finish','finish',[['','Not recorded'],1,2,3,4,5,6],'')+s('Pod size','pod',[['','Not recorded'],2,3,4,5,6],4)+s('Bracket','bracket',[['','Not recorded'],1,2,3,4,5],d.definition.baseBracket)+f('Turns (optional)','turns','','type="number" min="1" max="1000"')+s('Card that won it','mvpCardId',[['','—'],...cards],'')+s('Dead card in hand','deadCardId',[['','—'],...cards],'')+f('Opposing commanders / styles','opponents')+s('Your seat','seat',[['','Not recorded'],1,2,3,4],'')+`<label class="cm-full">What happened?<textarea name="notes" placeholder="Key plays, threat assessment, mulligans, mistakes or table agreements"></textarea></label>`,
    data=>commit({type:'game',deckId:did,outcome:data.outcome,playedAt:data.playedAt||undefined,finish:data.finish?Number(data.finish):null,pod:data.pod?Number(data.pod):null,bracket:data.bracket?Number(data.bracket):null,mvpCardId:data.mvpCardId||null,deadCardId:data.deadCardId||null,turns:data.turns?Number(data.turns):null,seat:data.seat?Number(data.seat):null,opponents:data.opponents,notes:data.notes}),'Save game record');};
/* THE RECORD, READ BACK. Games were write-only: logged and then only visible as JSON in a
   dialog. The card says the last-n W-L, the win rate with its n, dollars paid per win, and --
   through the Wilson interval game-record.js already had -- whether there are enough games to
   say anything at all: below eight decided games the honest sentence is "too few games to
   tell". The last ten games are listed with the card that won and the one that sat dead. */
const MIN_GAMES=8;
const gamesOf=d=>C.state.games.filter(g=>g.deckId===d.id).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at)));
function recordSummary(d){const games=gamesOf(d),wins=games.filter(g=>g.outcome==='win').length,losses=games.filter(g=>g.outcome==='loss').length,decided=wins+losses;const W=globalThis.MtgGameRecord;const interval=W&&decided?W.wilson(wins,decided):null;return {games,wins,losses,decided,rate:decided?wins/decided:null,interval};}
function recordHTML(d){const {games,wins,losses,decided,rate,interval}=recordSummary(d),r=M.readiness(C.state,d);
  const head=`<h2>Record <span class="cm-pull-n">${games.length}</span></h2>`;
  if(!games.length)return `<section class="v-panel cm-record" id="cm-sec-record">${head}<p class="cm-muted">No games logged yet. Log a game from the action row and the record reads back here: wins and losses, the win rate once there are enough games to trust it, what each win cost, and which cards decided the games.</p></section>`;
  const perWin=wins?r.paid/wins:null,dateOf=g=>{const t=Date.parse(g.at||'');return Number.isFinite(t)?new Date(t).toLocaleDateString(undefined,{dateStyle:'medium'}):String(g.at||'').slice(0,10);};
  const verdict=decided<MIN_GAMES?`Too few games to tell — ${decided} decided of ${MIN_GAMES} needed.`:interval?`Win rate ${Math.round(rate*100)}% (${Math.round(interval.low*100)}–${Math.round(interval.high*100)}% at 95% over ${decided} decided games)${interval.low>0.25?' — better than a fair four-player seat':interval.high<0.25?' — below a fair four-player seat':' — not distinguishable from a fair seat yet'}.`:'';
  const name=id=>id&&C.state.cards[id]?e(C.state.cards[id].name):'—';
  return `<section class="v-panel cm-record" id="cm-sec-record">${head}<div class="cm-budget-figures cm-record-figures"><div><strong>${wins}–${losses}${games.length-decided?`–${games.length-decided}`:''}</strong><span>W–L${games.length-decided?'–other':''}, last ${games.length}</span></div><div><strong>${rate===null?'—':Math.round(rate*100)+'%'}</strong><span>win rate · n = ${decided}</span></div><div><strong>${perWin===null?'—':C.money(Math.round(perWin*100)/100)}</strong><span>paid per win</span></div></div><p class="cm-muted">${verdict}</p><div class="cm-table-wrap"><table class="cm-table cm-record-table"><thead><tr><th scope="col">When</th><th scope="col">Result</th><th scope="col">Finish</th><th scope="col">Bracket</th><th scope="col">Won it</th><th scope="col">Dead in hand</th><th scope="col">Turns</th></tr></thead><tbody>${games.slice(0,10).map(g=>`<tr><td>${dateOf(g)}</td><td>${C.pill(e(g.outcome),g.outcome==='win'?'inbox':g.outcome==='loss'?'remove':'watch')}</td><td>${g.finish?`${g.finish}${g.pod?' of '+g.pod:''}`:'—'}</td><td>${g.bracket?'B'+g.bracket:'—'}</td><td>${name(g.mvpCardId)}</td><td>${name(g.deadCardId)}</td><td>${g.turns??'—'}</td></tr>`).join('')}</tbody></table></div></section>`;}
actions['deck-export']=el=>{const d=M.deck(C.state,el.dataset.deck);C.download(d.name.replace(/[^\w-]+/g,'-')+'.txt',d.slots.filter(r=>r.purpose==='main').map(r=>r.quantity+' '+C.state.cards[r.cardId].name).join('\n'),'text/plain');};
actions['deck-evidence']=el=>{const d=M.deck(C.state,el.dataset.deck),reports=C.state.reports.filter(r=>r.deckId===d.id),advice=C.state.advice.filter(r=>r.deckId===d.id),games=C.state.games.filter(r=>r.deckId===d.id);modal('Reports, advice & game history',`${note('Every measured run is filed here and under Simulation history on the deck page. Imported reports keep their protocol and exact-list fingerprint; a list change makes older results historical, not current.')}${b('Import report / advice pack','import-evidence',{deck:d.id})}${b('Compare reports','compare-reports',{deck:d.id})}${b('Export advice request','advice-request',{deck:d.id})}<h3>Simulation reports</h3>${reports.map(r=>`<details class="cm-details"><summary>${e(r.protocol)} · ${e(r.importedAt)} · ${r.deckFingerprint===M.fingerprint(d)?'Current list':'Historical list'}</summary><pre style="white-space:pre-wrap">${e(JSON.stringify(r,null,2))}</pre></details>`).join('')||'<p>No imported reports.</p>'}<h3>Advice</h3>${advice.map(r=>`<article>${note(r.deckFingerprint===M.fingerprint(d)?'Matches current list':'Historical advice for a different list')}<p style="white-space:pre-wrap">${e(r.text)}</p></article>`).join('')||'<p>No advice packs.</p>'}<h3>Recorded games</h3>${games.map(g=>`<p><strong>${e(g.outcome)}</strong> · ${e(String(g.at).slice(0,10))}${g.finish?` · ${g.finish}${g.pod?' of '+g.pod:''}`:''}${g.bracket?' · B'+g.bracket:''} · ${g.turns??'?'} turns<br>${e(g.notes)}</p>`).join('')||'<p>No games logged yet.</p>'}`);};
/* THE WHOLE LIST AT A STATUS, FROM THE DECK. A draft saved from the Lab is a hundred plans,
   and the reader who owns most of them says so once here rather than a hundred times in the
   Collection. On a finalized deck it takes only what is still owed. */
actions['deck-status-menu']=el=>{const d=M.deck(C.state,el.dataset.deck),ladder=(C.statusLadder||[]).filter(([id])=>id!=='incoming');
  popMenu(el,`<p>${d.status==='draft'?'Every card in the draft list becomes':'Every card still owed becomes'}</p>${ladder.map(([id,label,why])=>`<button type="button" class="cm-rung" aria-label="${e(label)}" data-action="deck-status" data-deck="${e(d.id)}" data-source="${id}"><span class="cm-rung-label">${e(label)}</span><small>${e(why)}</small></button>`).join('')}`,260);};
actions['deck-status']=el=>{const d=M.deck(C.state,el.dataset.deck),source=el.dataset.source,label=C.source(source);
  C.review(`Set ${d.name}’s cards to ${label}`,note(d.status==='draft'?`One copy record per card in the draft list, at ${label}, filed under the deck’s collection group. Cards that already have copies filed there are skipped, so this can be run again after the list changes.`:`Only what the deck still owes: one copy record per outstanding card at ${label}, reserved to its slot.`),{type:'acquireSlots',deckId:d.id,source});};
actions['deck-report']=el=>{const d=M.deck(C.state,el.dataset.deck),r=C.state.reports.find(x=>x.id===el.dataset.report&&x.deckId===d.id);if(!r)throw Error('That report is no longer in the library.');
  modal(`Simulation report · ${d.name} · ${when(r.importedAt)}`,(r.deckFingerprint===M.fingerprint(d)?'':note('Historical: this run measured an earlier version of the list.'))+(C.reportHTML?C.reportHTML(r,d.definition):`<pre style="white-space:pre-wrap">${e(JSON.stringify(r,null,2))}</pre>`));};
actions['measure-deck']=async el=>{const d=M.deck(C.state,el.dataset.deck);if(!C.measureDeck)throw Error('The simulator is not loaded.');
  const say=t=>{const pill=$('#cm-deck-sim-status');if(pill){pill.hidden=false;pill.textContent=t;}};say('Starting…');
  try{const {report,result}=await C.measureDeck(d.id,say);C.notice(`Measured ${report.metrics.score.value} points from ${result.games.toLocaleString()} games in ${(result.elapsedMs/1000).toFixed(1)}s. Filed under Simulation history.`);}
  catch(err){say(err.message);throw err;}};
actions['advice-request']=el=>{const d=M.deck(C.state,el.dataset.deck);C.download('CrankMagic-advice-request.json',JSON.stringify({format:'crankmagic-advice-request',version:1,deckFingerprint:M.fingerprint(d),definition:d.definition,deckName:d.name,cards:d.slots.map(r=>({name:C.state.cards[r.cardId].name,quantity:r.quantity,purpose:r.purpose,oracleText:C.state.cards[r.cardId].oracleText})),responseContract:{kind:'advice',deckFingerprint:'Copy the exact supplied fingerprint',text:'Explain strategy, sequencing, weaknesses and proposed replacements. Do not invent simulator results.'}},null,2));};
actions['import-evidence']=el=>{const d=M.deck(C.state,el.dataset.deck);form('Import versioned report or advice',`<div class="cm-full">${note('Accepts a JSON object with kind (report or advice), deckFingerprint, and protocol for reports or text for advice. Imported material is labeled and never executed.')}<label>JSON file<input name="file" type="file" accept=".json" required></label></div>`,async(_,formEl)=>{const file=formEl.elements.file.files[0];if(file.size>10000000)throw Error('Limit evidence packs to 10 MB.');const data=CrankEvidence.validate(JSON.parse(await file.text()));const known=[M.fingerprint(d),...d.versions.map(v=>M.fingerprint(v))];if(!known.includes(data.deckFingerprint))throw Error('This pack does not match any retained version of this deck. Its original version must be present before importing.');if(!['report','advice'].includes(data.kind))throw Error('Set kind to report or advice.');if(data.kind==='report'&&(!data.protocol||typeof data.metrics!=='object'||!data.versions))throw Error('Reports need protocol, versions and metrics provenance.');await commit({type:data.kind,deckId:d.id,[data.kind]:data});},'Import pack');};
});
