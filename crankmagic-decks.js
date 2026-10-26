/* Deck plans own slots, the library owns copies. Reference decks enter as drafts
 * and their historical owned flags are deliberately never migrated here. */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,esc:e,button:b,field:f,select:s,note,form,modal,commit,go,actions,views,$}=C;let showArchived=false;
const R=globalThis.CrankRules;   // the house rules and the deck-page literals live there
const DECK_TABS=[['overview','Overview'],['hundred','The hundred'],['upgrades','Upgrades'],['explore','Explore'],['acquire','Acquire']];
let sharedSnapshot=null,sharedRead=null;
const sharingOwner=()=>C.signedInAs?.()||C.sharingOwner?.()||null;
function readShared(force=false){const owner=sharingOwner();
  if(!force&&sharedSnapshot?.owner===owner&&Date.now()-sharedSnapshot.at<30000)return Promise.resolve(sharedSnapshot.items);
  if(sharedRead?.owner===owner)return sharedRead.promise;
  const pending={owner,promise:C.sharedItems().then(items=>{if(sharingOwner()===owner)sharedSnapshot={owner,items,at:Date.now()};return items;}).finally(()=>{if(sharedRead===pending)sharedRead=null;})};sharedRead=pending;return pending.promise;}
/* Tab hash redirects for backward compatibility */
const TAB_REDIRECTS={cards:'hundred',guide:'overview',history:'overview'};
/* THE DECKS NAV (Rob, 2026-10-23: the Decks requirements' NAV-1 to NAV-8). Five entries and no deck names: My Decks,
   Favorites, Create, Shared, About Deck Building. This one function builds all five -- sharing no longer wraps it --
   and opening a deck adds or marks none of them. */
C.SUBNAV.decks=()=>{const r=C.route(),p=r.params,list=r.view==='decks'&&!p.get('deck'),fav=list&&p.get('fav')==='1',shared=(list&&p.get('stage')==='shared')||(r.view==='shared'&&p.get('kind')!=='library');
  return [{label:'My Decks',hash:'#decks',current:list&&!fav&&!shared&&location.hash!=='#new'},{label:'Favorites',hash:'#decks?fav=1',current:fav},
    {label:'Create',hash:'#new',current:location.hash==='#new'},{label:'Shared',hash:'#decks?stage=shared',current:shared},
    {label:'About Deck Building',hash:'#about-deck-building',current:r.view==='about-deck-building'||r.view==='how'}];};
C.HELP.decks={title:'Decks',body:`<p>Every deck you have, by its stage. <strong>Building</strong>: fewer than 100 seats on the list. <strong>Defined</strong>: all 100 seats on the list, To buy and Ordered cards included. <strong>Boxed</strong>: the box holds the hundred, its Final cards and Substitutes. <strong>Playable</strong>: Defined, and the table knows every card. Boxed and Playable decks are Defined too, so they show under each chip they meet; each tile's badge is its furthest stage.</p><p><strong>Shared</strong> is the decks other people share with you. Star a deck to keep it under <strong>Favorites</strong>. Tick decks to compare, box, group, favorite or remove them together under <strong>Bulk actions</strong>. More in <a href="#about-deck-building">About Deck Building</a>.</p>`};
C.HELP.deck={title:'A deck page',body:`<p>The header is the summary: commander, stage, bracket, mechanics and the latest measured score; the row beside it is the work — add what you own, buy what you do not, log the game, measure — and the rest is under More.</p><p><strong>Overview</strong> is where the deck stands: Progress counts the physical deck, ready to add, ordered and to buy; Cost is what finishing costs, against the deck's own budget if it has one; the Next line says what to do first. The hundred at a glance, game record, simulation history, commander guide, strategy and SWOT all live here. <strong>The hundred</strong> is the full 100-card list by type with where each copy stands (actions on a card are in Cards). <strong>Upgrades</strong> is the working list and the Upgrade Path. <strong>Explore</strong> is deck-scoped explore and relationships (Role lens, Trace). <strong>Acquire</strong> is the buy list, orders, and acquisition tracking.</p><p>A <strong>locked</strong> deck's reservations track what its list needs: Planned Changes walks the cards you own into the physical deck, and the buy list is what is left. A <strong>draft</strong> holds the copies you put in it; Lock list checks the list is a legal hundred and puts what is missing on the buy list. An <strong>archived</strong> deck keeps its history; its copies were released, and where each one physically is stays recorded.</p>`};
const commander=d=>d.commanders.map(id=>C.card(id)?.name||'Unknown').join(' + ');
/* A PRECON'S OWN PATH (Rob, 2026-10-01: "When it's a precon deck that's been selected, it should have a very different
   acquisition path"). A deck made from a precon carries the precon's id and name (createDeck's `precon`); one made
   before that is recognized by what the precon import leaves behind -- its collection group named after the precon,
   led by the precon's commander -- against the newest release's list. Such a deck is bought as one product: Acquire,
   The hundred, the Cost card and the Next line offer Buy the Precon, not a buy list of singles, and Finalize is Save. */
const PRECON_BUY={
  /* Rob's link (2026-10-01). Amazon's page does not show its price to a fetch; $49.99 is the deck's list price (MSRP),
     which Amazon lists, recorded with its date. A precon without a link of its own gets an Amazon search for it. */
  MultiverseReforged_FRC:{url:'https://www.amazon.com/dp/B0GXC9SDV9',listPrice:49.99,asOf:'2026-10-01'}
};
let latestCache=null,latestLoading=null;
function preconOf(d){
  if(d.precon)return d.precon;
  if(!latestCache){
    /* Drawn again only when the list makes the open deck a precon, and never under an open dialog: a deck that is not
       one is not redrawn for nothing, and nobody loses what they were doing. */
    if(!latestLoading)latestLoading=latestPrecons().catch(()=>null).then(x=>{latestCache=x||{decks:[]};const r=C.route(),open=r.view==='decks'&&C.state.decks.find(y=>y.id===r.params.get('deck'));
      if(open&&!open.precon&&preconOf(open)&&!document.querySelector('#cm-dialog[open]'))C.render();});
    return null;
  }
  const g=d.groupId?C.state.groups.find(x=>x.id===d.groupId):null,lead=C.card(d.commanders[0])?.name;
  const p=g&&latestCache.decks.find(x=>x.name===g.name&&(x.commander[0]||{}).name===lead);
  return p?{id:p.id,name:p.name,setName:p.setName||''}:null;
}
const preconBuy=p=>{const known=PRECON_BUY[p.id];return {url:known?known.url:`https://www.amazon.com/s?k=${encodeURIComponent(`Magic The Gathering ${p.setName?p.setName+' ':''}${p.name} Commander Deck`)}`,price:known?known.listPrice:null,asOf:known?known.asOf:null};};
const buyPrecon=(p,primary=false)=>`<a class="v-button${primary?' primary':''}" href="${e(preconBuy(p).url)}" target="_blank" rel="noopener" data-precon-buy="${e(p.id)}">Buy the Precon</a>`;
/* THE PRECON'S PRICE, as the Acquire tab and the Cost card read it: the list price with its date, or a dash and Amazon. */
const preconPrice=p=>{const b=preconBuy(p);return b.price===null?{figure:'—',title:'No price recorded for this precon yet; Amazon shows it'}:{figure:C.money(b.price),title:`List price on Amazon, as of ${C.usDate(b.asOf)}`};};
/* THE HEADER'S COMMANDER LINE (Rob, 2026-10-01: "The mana next to the card name ... should always match" the card): each
   commander's name with its printed cost, drawn by the same symbols as the card's, never the color identity's pips. */
const heroCost=d=>d.commanders.map(id=>{const c=C.card(id);return `<span class="cm-hero-commander">${e(c?.name||'Unknown')} ${c?C.mana(c.manaCost,c.typeLine):''}</span>`;}).join(' + ');
/* WHAT THE DECK IS ABOUT: the owner's mechanics when the definition names them, otherwise
   read off the list by the catalog -- marked derived, so the tile can say it is a reading
   and the definition form can offer it as a placeholder. */
function mechanicsOf(d){if(d.definition.mechanics.length)return {list:d.definition.mechanics,derived:false};const main=d.slots.filter(r=>r.purpose==='main').map(r=>C.card(r.cardId)).filter(Boolean);const list=CrankCatalog.deckMechanics?CrankCatalog.deckMechanics(main,C.card(d.commanders[0])):[];return {list,derived:true};}
/* THE GROUP A DECK DRAWS FROM. Attaching one does two things and claims no more: when two
   copies could fill the same requirement the filed one is reserved first, and the deck can
   file its own reserved copies into the group in a single action -- which is what makes a
   group like "Main Deck" describe the deck rather than whatever was dragged into it. */
const attached=d=>d.groupId?C.state.groups.find(g=>g.id===d.groupId)||null:null;
/* COMMANDER + 99 (Rob, 2026-09-28; docs/plan-groups.md, G3). A deck holds its commander, its 99 and its contents.
   The list keeps the commander among its hundred, so the 99 is the list less the commanders it names; the badge
   says it that way and reads legality live, a finalized deck or not. Over a hundred is allowed, and says so. */
function legalBadge(d){const main=d.slots.filter(r=>r.purpose==='main'),total=main.reduce((n,r)=>n+r.quantity,0),lead=d.commanders.filter(id=>main.some(r=>r.cardId===id)).length||d.commanders.length,rest=total-lead,of=100-lead;
  const issues=M.legality(C.state,d),who=lead>1?'Commanders':'Commander';
  return issues.length?`<span class="cm-badge warn cm-legal-badge" title="${e(issues[0])}">Not legal · ${who} + ${rest} of ${of}</span>`:`<span class="cm-badge good cm-legal-badge" title="A legal Commander deck: ${lead} + ${rest} = 100">Legal · ${who} + ${of}</span>`;}
/* SIMULATION HISTORY. Every measured run of this deck, newest first: when, on what protocol,
   the score with its error, the two figures a reader compares first, how many games, and
   whether it measured the list as it stands now. A run is filed the moment it finishes --
   from the Lab or from here -- so the history is the record, not a thing to remember to
   save; the tile and the hero carry the latest score so the page answers "how good is it"
   before it is opened. */
const measuredReports=d=>C.state.reports.filter(r=>r.deckId===d.id&&r.origin==='measured');
const latestReport=d=>measuredReports(d).slice(-1)[0]||null;
const scoreOf=r=>r&&r.metrics&&r.metrics.score&&r.metrics.score.value!==null&&r.metrics.score.value!==undefined?String(r.metrics.score.value):'';
const when=iso=>{const t=Date.parse(iso||'');return Number.isFinite(t)?new Date(t).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}):String(iso||'');};
function historyHTML(d){
  const reports=measuredReports(d).slice().reverse(),fp=M.fingerprint(d,C.state);
  const metric=(r,k,suffix='')=>{const m=r.metrics&&r.metrics[k];return m&&m.value!==null&&m.value!==undefined?e(String(m.value))+suffix:'—';};
  const status=`<span class="cm-pause-pill" id="cm-deck-sim-status" hidden></span>`;
  if(!reports.length)return `<section class="v-panel cm-history" id="cm-sec-history"><h2>Simulation history</h2><p>No measurement yet. Measure this deck and every run is kept here — the score, what it measured, and which list it measured.</p><div class="cm-actions">${b('Measure this deck','measure-deck',{deck:d.id},true)}${status}</div><p class="cm-muted">Measuring runs the engine in the background on the published protocol — six seeds of 20,000 games — and files the report here when it finishes.</p></section>`;
  return `<section class="v-panel cm-history" id="cm-sec-history"><h2>Simulation history</h2><p class="cm-muted">${reports.length} measured run${reports.length===1?'':'s'}, newest first. A run is filed the moment it finishes; a list change makes earlier runs historical, not wrong.</p><div class="cm-table-wrap"><table class="cm-table cm-history-table"><thead><tr><th scope="col">When</th><th scope="col">Protocol</th><th scope="col">Score</th><th scope="col">Win rate</th><th scope="col">Avg win turn</th><th scope="col">Games</th><th scope="col">List</th><th scope="col">Report</th></tr></thead><tbody>${reports.map(r=>`<tr><td data-label="When">${e(when(r.importedAt))}</td><td data-label="Protocol">${e(r.protocol)}</td><td data-label="Score"><strong>${metric(r,'score')}</strong>${r.metrics&&r.metrics.scoreStandardError?` <small class="cm-muted">± ${metric(r,'scoreStandardError')}</small>`:''}</td><td data-label="Win rate">${metric(r,'winRate','%')}</td><td data-label="Avg win turn">${metric(r,'averageWinTurn')}</td><td data-label="Games">${((r.run&&r.run.games)||0).toLocaleString('en-US')}</td><td data-label="List">${r.deckFingerprint===fp?'<span class="cm-badge good">Current list</span>':'<span class="cm-badge">Historical list</span>'}</td><td data-label="Report">${b('View report','deck-report',{deck:d.id,report:r.id},false,{cls:'compact'})}</td></tr>`).join('')}</tbody></table></div><div class="cm-actions">${b('Measure again','measure-deck',{deck:d.id})}${reports.length>1?b('Compare two runs','compare-reports',{deck:d.id}):''}${b('Reports & advice','deck-evidence',{deck:d.id})}${status}</div></section>`;
}
/* ALL REPORTS attached to this deck (Hosted Play + Measure + imported). Simple list for
   deck overview, no Measure wizard chrome. */
/* THE MEASURE REPORT (r3, 30-measure-report; R3.5b). One filed measurement, read the way the design draws it:
   what the number can be trusted for FIRST, then the number, then what made it.

   The fidelity notice is computed from the report's own facts, never asserted: the cards the engine could
   not read (they played as blanks), the cards that win in a way the engine does not model, whether the
   deck's list has changed since, and whether a different engine generation measured it. None of those is
   a high-fidelity measurement; the list changing or the engine changing makes it a low one, because the
   number no longer describes this deck under this model. Every measurement also carries its own limits --
   sampled opponents, no real stack -- which sit under the notice, not hidden behind the score.

   The checks are the score's own breakdown (sim-engine's scoreParts): each part's reading against the
   engine's stated target, and the points it earned of the points it could. Nothing here is recomputed. */
function fidelityOf(r,d){
  const m=r.metrics||{},list=Array.isArray(r.list)?r.list:[],total=list.reduce((n,x)=>n+(Number(x.quantity)||1),0)||null;
  const read=m.cardsTheEngineCouldRead?.value,unread=total&&Number.isFinite(read)?Math.max(0,total-read):0;
  const unwatched=m.winPathsTheEngineCannotWatch?.value||0,names=(r.unwatchedWinCards||[]).slice(0,4);
  const generation=globalThis.CrankSim&&CrankSim.ENGINE_GENERATION,engine=r.versions&&r.versions.engine;
  const reasons=[];
  if(r.deckFingerprint!==M.fingerprint(d,C.state))reasons.push({severe:true,text:'The deck’s list has changed since this was measured. Measure again for the hundred it holds now.'});
  if(generation&&engine&&engine!==generation)reasons.push({severe:true,text:`Measured by engine ${engine}; the app now runs ${generation}. Scores from different engines are not comparable.`});
  if(unread)reasons.push({text:`${unread} card${unread===1?'':'s'} the engine could not read played as blanks.`});
  if(unwatched)reasons.push({text:`${unwatched} card${unwatched===1?' wins':'s win'} in a way the engine does not model${names.length?`: ${names.join(', ')}`:''}. A deck built on ${unwatched===1?'it':'them'} is described less well by this score.`});
  return {level:!reasons.length?'high':reasons.some(x=>x.severe)?'low':'medium',reasons};
}
function reportView(d,id){
  const r=C.state.reports.find(x=>x.id===id&&x.deckId===d.id);
  const back=`<a class="v-button" href="#decks?deck=${encodeURIComponent(d.id)}">Back to deck</a>`;
  if(!r){C.main.innerHTML=`<a class="cm-crumb" href="#decks?deck=${encodeURIComponent(d.id)}">Decks › ${e(deckNumberOff(d.name))}</a>`+C.pageHead('Measure',back)+note('That report is not in this library. It may have been measured on another device, or deleted with an older version of the deck.',true);return;}
  const m=r.metrics||{},score=m.score?.value,se=m.scoreStandardError?.value,f=fidelityOf(r,d),parts=r.scoreParts||[];
  const weakest=parts.filter(p=>Number.isFinite(p.points)&&Number.isFinite(p.max)&&p.max>0).slice().sort((a,b)=>a.points/a.max-b.points/b.max)[0];
  const refinement=new URLSearchParams({deck:d.id,report:r.id,...(weakest?{axis:weakest.key||weakest.label}:{})});
  const LEVEL={high:'High',medium:'Medium',low:'Low'};
  const fact=[Number.isFinite(se)?`± ${se.toFixed(1)}`:'',m.winRate?.value!=null?`wins ${m.winRate.value}% of games`:'',r.run?.games?`${r.run.games.toLocaleString('en-US')} games`:''].filter(Boolean).join(' · ');
  C.main.innerHTML=`<a class="cm-crumb" href="#decks?deck=${encodeURIComponent(d.id)}">Decks › ${e(deckNumberOff(d.name))}</a>`
    +C.pageHead('Measure',back+b('Export report','report-export',{deck:d.id,report:r.id}),'deck',`<p class="cm-decks-summary">How this list played under the simulation model, measured ${e(when(r.run?.measuredAt||r.importedAt))}.</p>`)
    +`<section class="cm-fidelity cm-fidelity-${f.level}" aria-label="Fidelity"><h2>Fidelity: ${LEVEL[f.level]}</h2>${f.reasons.length?`<ul>${f.reasons.map(x=>`<li>${e(x.text)}</li>`).join('')}</ul>`:'<p>The list is the one measured, every card was read, and nothing in it wins in a way the engine cannot watch.</p>'}`
    +`${(r.limits||[]).length?`<details><summary>What any Measure is, and is not</summary><ul>${r.limits.map(x=>`<li>${e(x)}</li>`).join('')}</ul></details>`:''}</section>`
    +`<div class="cm-report-grid"><section class="v-panel cm-report-score"><h2>Score</h2><p class="cm-report-number">${Number.isFinite(score)?e(String(Math.round(score))):'—'}</p><p>of 100</p>${fact?`<p class="cm-muted">${e(fact)}</p>`:''}</section>`
    +`<section class="v-panel cm-report-checks"><h2>What made the number</h2>${parts.length?`<table><thead><tr><th scope="col">Check</th><th scope="col">What it read</th><th scope="col">Points</th></tr></thead><tbody>${parts.map(p=>`<tr><th scope="row">${e(p.label)}</th><td>${e(p.reads)}</td><td>${e(String(p.points))} of ${e(String(p.max))}</td></tr>`).join('')}</tbody></table>`:'<p class="cm-muted">This report carries no breakdown of its score (it was filed before reports did).</p>'}</section></div>`
    +`<section class="v-panel cm-report-refine"><h2>Refine the deck</h2>${weakest?`<p>Start with <strong>${e(weakest.label)}</strong> · ${e(String(weakest.points))} of ${e(String(weakest.max))}.</p>`:''}<div class="cm-actions"><a class="v-button primary" href="#discover?${e(refinement.toString())}">Fix in Explore</a>${b('Measure again','measure-deck',{deck:d.id})}</div></section>`;
}
actions['report-export']=el=>{const d=M.deck(C.state,el.dataset.deck),r=C.state.reports.find(x=>x.id===el.dataset.report);if(!r)throw Error('That report is not in this library.');
  C.download(`CrankMagic-measure-${deckNumberOff(d.name).replace(/[^\w-]+/g,'-')}-${M.today()}.json`,JSON.stringify(r,null,2));};
function reportsHTML(d){
  const allReports=C.state.reports.filter(r=>r.deckId===d.id);
  if(!allReports.length)return '';
  const fp=M.fingerprint(d,C.state);
  return `<section class="v-panel cm-reports" id="cm-sec-reports"><h2>Reports</h2><p class="cm-muted">${allReports.length} report${allReports.length===1?'':'s'} attached to this deck. Reports from simulations, play sessions, or imported data.</p><ul class="cm-reports-list">${allReports.slice().reverse().map(r=>`<li><strong>${e(r.protocol||'Unknown protocol')}</strong> · ${e(when(r.importedAt))} · ${r.deckFingerprint===fp?'<span class="cm-badge good">Current list</span>':'<span class="cm-badge">Historical list</span>'}${r.origin?` · <span class="cm-muted">${e(r.origin)}</span>`:''} · <a href="#decks?deck=${encodeURIComponent(d.id)}&amp;report=${encodeURIComponent(r.id)}">Open report</a></li>`).join('')}</ul></section>`;
}
/* NO ART, NO EMPTY PANEL. A deck whose commander has no cached picture used to be a dark
   rectangle with text at the bottom; the commander's initials, faint, in the deck's own two
   colors, say what the tile is from across the room. */
/* The five pip colors are the --mana-* tokens, read from the stylesheet rather than repeated
   here (design handoff revision 2, INTAKE item 4). They used to be five literals of the
   pre-Gallery palette, which no theme switch could reach: on a light theme the tile tint came
   from the tokens and the initials behind it came from these, and the two disagreed. Read once
   and cached -- a getComputedStyle per pip inside a render over a hundred rows is a forced
   reflow per card. The cache is keyed on the theme, so the switch to Felt and Cream re-reads the
   five values by itself and no other module has to remember to tell it. */
let PIP_CACHE=null,PIP_THEME=null;
function manaColors(){
  const root=typeof document!=='undefined'&&document.getElementById('matrix-v2');
  if(!root)return {};                       /* before the shell exists, fall through to the neutral */
  const theme=root.dataset.theme||'dark';
  if(PIP_CACHE&&PIP_THEME===theme)return PIP_CACHE;
  const cs=getComputedStyle(root),out={};
  for(const k of ['W','U','B','R','G']){const v=cs.getPropertyValue('--mana-'+k).trim();if(v)out[k]=v;}
  PIP_CACHE=out;PIP_THEME=theme;return out;
}
function initials(d){const PIP=manaColors(),c=C.card(d.commanders[0]),ci=(c&&c.colorIdentity)||[],a=PIP[ci[0]]||'#b9b3a8',b2=PIP[ci[1]]||a;const text=(c?c.name:d.name).split(/[\s,]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');return `<div class="cm-deck-initials" aria-hidden="true" style="--ci-a:${a};--ci-b:${b2}">${e(text||'?')}</div>`;}
const art=d=>R.deckArt(commander(d))||C.card(d.commanders[0])?.image||'';
/* THE RIBBON READS LEFT TO RIGHT IN THE ORDER THE WORK HAPPENS: what the list asks for,
   what you have for it, what is on its way, what is still owed -- and last, separately,
   where the cards physically are. "In deck" used to lead, and it meant the physical box,
   so a deck you had finished buying read 0 and the ribbon looked broken rather than
   merely unconfirmed. */
/* TWO CLUSTERS, NOT FIVE FIGURES SPREAD ACROSS THE PAGE. The build-night questions on the left
   -- in the box, ready to add, on the way, to buy -- and the money on the right: what finishing
   costs at sheet prices against the deck's budget. The bar under them is the same hundred as one
   line, and the legend names its colors. */
const pullCount=r=>r.pullFromBench+r.pullFromOtherBox;
/* THE WORKING LIST: what is marked to come out, and what is meant to come in. Option flags
   are the owner's own ranking of what goes first when a swap is needed; the cards coming in
   are the Planned entries and free copies filed in the deck's group that are not in its
   hundred, plus the Upgrade Path suggestions attached to the slots they would replace.
   Nothing here changes the deck; it is the sheet you read before you sit down to swap. */
function workingHTML(d){
  const options=d.slots.filter(r=>r.purpose==='main'&&r.option),pins=d.slots.filter(r=>r.purpose==='main'&&r.pinned).length,suggestions=d.slots.filter(r=>r.purpose!=='main'&&!r.committed).length;
  const g=attached(d),inList=new Set(d.slots.filter(r=>r.purpose==='main').map(r=>r.cardId));
  const planned=g?[...g.entries.map(r=>({name:C.card(r.cardId)?.name||'',quantity:r.quantity,why:r.notes||'',status:'Planned'})),...C.state.lots.filter(l=>l.groupIds.includes(g.id)&&!(l.allocation&&l.allocation.deckId===d.id)&&!inList.has(l.cardId)).map(l=>({name:C.card(l.cardId)?.name||'',quantity:l.quantity,why:l.notes.replace(/^D\d+:\s*/,''),status:C.source(l.source)}))]:[];
  if(!options.length&&!planned.length&&!suggestions)return '';
  const item=(name,quantity,tag,why,extra='')=>`<li><strong>${e(name)}</strong>${quantity>1?` ×${quantity}`:''} <span class="cm-badge${tag==='Option'?' cm-badge-option':''}">${e(tag)}</span>${extra}${why?`<span class="cm-muted">${e(why)}</span>`:''}</li>`;
  return `<section class="v-panel cm-working" id="cm-sec-working"><h2>Working list</h2><div class="cm-grid-2"><div><h3>Options · first to swap out <small>${options.length}</small></h3>${options.length?`<ul class="cm-working-list">${options.map(r=>item(C.card(r.cardId)?.name||'',r.quantity,'Option',r.optionWhy,b('Clear','flag-slot',{deck:d.id,slot:r.id}))).join('')}</ul>`:'<p class="cm-muted">None flagged. Flag a card from its row in Cards: ⋯ → Flag as option.</p>'}${pins?`<p class="cm-muted">${pins} pinned card${pins===1?'':'s'} stay whatever happens.</p>`:''}</div><div><h3>Coming in <small>${planned.length+suggestions}</small></h3>${planned.length?`<ul class="cm-working-list">${planned.map(p=>item(p.name,p.quantity,p.status,p.why)).join('')}</ul>`:''}${suggestions?`<p>${suggestions} recommended update${suggestions===1?'':'s'} from the Upgrade Path, each attached to the card it comes in for. ${b('See them','deck-upgrades',{deck:d.id})}</p>`:''}${!planned.length&&!suggestions?'<p class="cm-muted">Nothing planned. Add a planned card to the deck’s group from Cards.</p>':''}</div></div></section>`;
}
actions.jump=el=>{const t=document.getElementById(el.dataset.target);if(!t)return;const bar=document.querySelector('.cm-jump'),top=t.getBoundingClientRect().top+scrollY-((bar?bar.getBoundingClientRect().height:0)+(matchMedia('(max-width:760px)').matches?54:0)+10);scrollTo({top,behavior:'smooth'});};
views.decks=async params=>{const did=params.get('deck');if(did){const found=C.state.decks.find(x=>x.id===did);if(!found){C.main.innerHTML=C.pageHead('Decks',b('Decks','home',{},true))+note('Deck not found: this library has no deck with that id. It may live in another browser’s library, or under a different link.',true);return;}if(params.get('report')){reportView(found,params.get('report'));return;}await overview(found);return;}
/* THE DECKS PAGE (Rob, 2026-10-23: the Decks requirements' Part A). Which decks, read by their stage; the chips, the
   Favorites filter and the Include public decks toggle live in the address -- #decks?stage=boxed&fav=1 -- so Back
   undoes them and a link reopens the same view. Archived decks show only with Show archived ticked. */
const decks=C.state.decks.filter(d=>(showArchived||!d.archived)&&(C.showLobbyDecks||!M.isLobbyDeck(d))),lobbyHidden=C.state.decks.filter(d=>!d.archived&&M.isLobbyDeck(d)).length;
const atTable=!!C.play?.open();
/* THE STAGES (§2, FLT-1 to FLT-3): one reader, the model's deckStatus -- stage Building or Defined, and boxed. The chips
   are tests, not buckets, so a Boxed deck is under Defined too (Q6); Playable is Defined plus the table's own check
   (crankmagic-table.js, C.play), shown only where Play is in the cloud. Shared is whose deck it is, not a stage. */
const statusOf=new Map(decks.map(d=>[d.id,M.deckStatus(C.state,d)]));
const CHIPS=[['all','All'],['boxed','Boxed'],['defined','Defined'],['building','Building'],...(atTable?[['playable','Playable']]:[]),['shared','Shared']];
const fits={all:()=>true,boxed:x=>x.boxed,defined:x=>x.stage==='defined',building:x=>x.stage==='building',playable:x=>x.stage==='defined'};
const SORTS=[['closest','Closest to finished'],['name','Name'],['recent','Recently changed']];
/* An old address (toload, loading, complete) opens All (FLT-8). */
const stage=CHIPS.some(([k])=>k===params.get('stage'))?params.get('stage'):'all',sort=SORTS.some(([k])=>k===params.get('sort'))?params.get('sort'):'closest';
const fav=params.get('fav')==='1',favs=new Set(C.state.preferences.favoriteDecks||[]);
const pub=params.has('public')?params.get('public')==='1':!!C.state.preferences.includePublicShares;
/* THE SELECTION (SEL-1, SEL-10): a tick picks a deck for any bulk action. Changing the chip or the Favorites filter
   clears it, so no action ever applies to a deck you can't see. */
const viewKey=stage+'|'+fav;if(C.deckPicksView!==viewKey){C.deckPicksView=viewKey;C.comparePicks=new Set();}
const picks=[...(C.comparePicks||[])].filter(id=>id.startsWith('share:')||C.state.decks.some(d=>d.id===id));
const fanDecks=decks.filter(d=>!d.archived&&d.commanders.length).slice(0,3),fanSrc=fanDecks.length?fanDecks.map(d=>[art(d),commander(d).split(',')[0]]).filter(([src])=>src):[['assets/crankmagic/commander-krenko.webp?v=1','Krenko'],['assets/crankmagic/commander-shadrix.webp?v=1','Shadrix'],['assets/crankmagic/commander-atraxa.webp?v=1','Atraxa']];
const fanSlots=fanSrc.length===1?['center']:fanSrc.length===2?['left','right']:['left','right','center'];
const fan=fanSrc.length?`<div class="cm-cardfan" aria-hidden="true">${fanSrc.map(([src,name],i)=>`<div class="cm-fan-card cm-fan-${fanSlots[i]}" style="background-image:url('${e(src)}')"><span>${e(name.toUpperCase())}</span></div>`).join('')}</div>`:'';
const anyDecks=C.state.decks.length>0,howLink=`<a class="cm-how-link" href="#about-deck-building">About Deck Building</a>`;
/* BULK ACTIONS (SEL-2): one menu button left of New deck, active from one deck ticked. */
const bulk=`<button type="button" class="v-button" data-action="bulk-menu" aria-haspopup="menu"${picks.length?'':' disabled'} title="${picks.length?'Act on the ticked decks':'Tick a deck to act on it'}">Bulk actions${picks.length?` (${picks.length})`:''}</button>`;
/* THE SUMMARY LINE: how many decks, how many the table can play (PLAYABLE MEANS PLAYABLE ON PLAY, Rob 2026-10-22), and
   the substitutes still standing in. Each figure is said once, here. */
const live=decks.filter(d=>!d.archived),ready=live.map(d=>M.readiness(C.state,d));
const subs=ready.reduce((n,x)=>n+(x.standIns||0),0);
const words=['no','one','two','three','four','five','six','seven','eight','nine','ten'];
const count=n=>n<=10?words[n]:String(n);
const playWords=n=>n===live.length?(live.length===1?', ready to play':', all playable'):n===0?(live.length===1?', not playable yet':', none playable yet'):`, ${count(n)} playable`;
const summary=live.length&&stage!=='shared'?`<p class="cm-decks-summary">${e(count(live.length).replace(/^./,c=>c.toUpperCase()))} deck${live.length===1?'':'s'}<span id="cm-decks-playable">${C.play?.open()&&playSeen.count!==null&&playSeen.of===live.length?playWords(playSeen.count):''}</span>.${subs?` <b>${subs} substitute${subs===1?'':'s'}</b> still standing in.`:''}</p>`:'';
const acct=M.budgets(C.state),cash=v=>e(C.money(Math.round(v*100)/100));
const budgetLine=acct.decks.length&&stage!=='shared'?`<p class="cm-muted cm-decks-budget" title="Each deck counts at its budget, or at its cost when that is more. Nothing is refused for money.">${acct.budget===null?`Your decks plan <strong>${cash(acct.planned)}</strong> together. <a href="#settings">Set an account budget</a>`:`Your decks plan <strong>${cash(acct.planned)}</strong> of your <strong>${cash(acct.budget)}</strong> account budget · <strong class="${acct.over?'cm-over':''}">${cash(Math.abs(acct.left))} ${acct.over?'over':'left'}</strong> · <a href="#settings">Budget</a>`}</p>`:'';
const footLinks=anyDecks?`<div class="cm-deck-footlinks">${howLink}${lobbyHidden||C.showLobbyDecks?`<label class="cm-checkbox cm-show-lobby" title="Decks the Play lobby built for a seat. They stay out of Decks and the library until you save one."><input id="cm-show-lobby" type="checkbox" ${C.showLobbyDecks?'checked':''}>Show lobby decks${lobbyHidden&&!C.showLobbyDecks?` (${lobbyHidden})`:''}</label>`:''}</div>`:'';
const changed=new Map();if(sort==='recent')for(const row of await C.repo.history()){const id=row.operation&&row.operation.deckId;if(id&&!changed.has(id))changed.set(id,row.at||'');}
const leftToDo=d=>{const r=M.readiness(C.state,d);return (r.toBuy||0)+(r.ordered||0)+(r.standIns||0);};
const byName=(a,b)=>a.name.localeCompare(b.name,'en-US',{numeric:true});
const order={closest:(a,b)=>leftToDo(a)-leftToDo(b)||byName(a,b),name:byName,recent:(a,b)=>String(changed.get(b.id)||b.createdAt||'').localeCompare(String(changed.get(a.id)||a.createdAt||''))||byName(a,b)}[sort];
const shown=stage==='shared'?[]:decks.filter(d=>fits[stage](statusOf.get(d.id))&&(!fav||favs.has(d.id))).sort((a,b)=>(a.archived-b.archived)||order(a,b));
C.deckGridOrder=shown.map(d=>d.id);
const hashFor=(k,v)=>{const q=new URLSearchParams({stage,sort});if(fav)q.set('fav','1');if(params.has('public'))q.set('public',params.get('public'));if(v===null)q.delete(k);else q.set(k,v);if(q.get('stage')==='all')q.delete('stage');if(q.get('sort')==='closest')q.delete('sort');if(q.get('stage')!=='shared')q.delete('public');return '#decks'+(q.size?'?'+q:'');};
const chipDecks=decks.filter(d=>!fav||favs.has(d.id));
const chipCount=k=>k==='shared'?(!C.sharingAvailable?.()?0:null):k==='playable'?(playSeen.count!==null&&playSeen.of===live.length?chipDecks.filter(d=>statusOf.get(d.id).stage==='defined'&&seenOf(playSeen.lines,d.id)?.ok).length:null):chipDecks.filter(d=>fits[k](statusOf.get(d.id))).length;
const bar=`<div class="cm-decks-bar"><nav class="cm-decks-stages" aria-label="Show decks">${CHIPS.map(([k,label])=>{const n=chipCount(k);return `<a class="v-button cm-chip-toggle" data-stage-chip="${k}" aria-label="${e(label)}" aria-describedby="cm-stage-count-${k}" href="${e(hashFor('stage',k))}"${k===stage?' aria-current="true"':''}><span>${e(label)}</span> <small id="cm-stage-count-${k}" data-stage-count="${k}">${n===null?'…':n.toLocaleString('en-US')}</small></a>`;}).join('')}</nav>`
  +`<div class="cm-decks-order">${stage==='shared'?`<label class="cm-checkbox cm-include-public"><input id="cm-include-public" type="checkbox" ${pub?'checked':''}>Include public decks</label>`:`<label class="cm-decks-sort">Sort<select id="cm-decks-sort" aria-label="Sort decks">${SORTS.map(([k,label])=>`<option value="${k}"${k===sort?' selected':''}>${e(label)}</option>`).join('')}</select></label><label class="cm-checkbox cm-show-archived"><input id="cm-show-archived" type="checkbox" ${showArchived?'checked':''}>Show archived</label>`}</div></div>`;
const chipName=(CHIPS.find(([k])=>k===stage)||[,''])[1];
const noneHere=fav?`<p class="cm-muted cm-decks-none">No favorites yet. Star a deck to see it here.</p>`:`<p class="cm-muted cm-decks-none">No ${e(chipName.toLowerCase())} decks right now. <a href="#decks${sort==='closest'?'':'?sort='+e(sort)}">Show all</a></p>`;
const latestSlot='<section class="cm-precon-latest" id="cm-precon-latest" aria-label="New from Wizards" hidden></section>',latestTile=latestSlot.replace('<section','<article').replace('</section>','</article>').replace('cm-precon-latest"','cm-precon-latest cm-precon-tile"');
if(stage!=='shared')C.preconLatest('cm-precon-latest');
const title=fav?'Favorites':stage==='shared'?'Shared':'Decks';
/* THE TILE'S TOOLS (FAV-1, SEL-1): left to right, the select tick, the star, the ⋯. They show on hover; a favorite's
   filled star stays (FAV-3). The star is a real toggle button (FAV-6). */
const star=(key,name)=>{const on=favs.has(key);return `<button type="button" class="cm-icon-button cm-tile-star${on?' is-on':''}" data-action="favorite-deck" data-deck="${e(key)}" aria-pressed="${on}" aria-label="${on?'Unfavorite':'Favorite'} ${e(name)}" title="${on?'Unfavorite':'Favorite'}">${on?'★':'☆'}</button>`;};
const pick=(key,name)=>`<label class="cm-tile-pick" title="Select ${e(name)}"><input type="checkbox" data-action="select-deck" data-deck="${e(key)}"${picks.includes(key)?' checked':''} aria-label="Select ${e(name)}"></label>`;
const STAGE_TONE={Building:'draft',Defined:'pull',Boxed:'inbox',Archived:'draft'};
const stageWord=d=>{const x=statusOf.get(d.id);return d.archived?'Archived':x.boxed?'Boxed':x.stage==='defined'?'Defined':'Building';};
const tile=d=>{const r=M.readiness(C.state,d),picked=picks.includes(d.id),word=stageWord(d);
  const games=C.state.games.filter(x=>x.deckId===d.id),record=games.length?`${games.filter(x=>x.outcome==='win').length}–${games.filter(x=>x.outcome==='loss').length}`:'';
  const caption=[r.toBuy?`${r.toBuy} to buy`:'',r.ordered?`${r.ordered} ordered`:'',r.pullFromBench?`${r.pullFromBench} loading`:'',r.pullFromOtherBox?`${r.pullFromOtherBox} in another box`:'',r.standIns?`${r.standIns} sub${r.standIns===1?'':'s'}`:''].filter(Boolean);
  if(!caption.length)caption.push(`${r.sleeved} in the physical deck`);if(record)caption.push(record);
  const ci=(C.card(d.commanders[0])?.colorIdentity)||[],tint=/^[WUBRG]$/.test(ci[0]||'')?`--tint:var(--mana-${ci[0]});`:'';
  const sets=(d.sets||[]).length?`<span class="cm-tile-sets" aria-label="Deck sets">${d.sets.map(x=>`<span class="cm-chip">${e(x)}</span>`).join('')}</span>`:'';
  return `<article class="cm-deck-tile${picked?' is-picked':''}" data-deck-tile="${e(d.id)}" data-stage="${e(word.toLowerCase())}" style="${tint}"${stage==='playable'&&seenOf(playSeen.lines,d.id)&&!playSeen.lines.get(d.id).ok?' hidden':''}>${art(d)?`<img class="cm-deck-art" src="${e(art(d))}" alt="" loading="lazy">`:initials(d)}<span class="cm-tile-tools">${pick(d.id,d.name)}${star(d.id,d.name)}<button type="button" class="cm-icon-button cm-tile-menu-btn" data-action="deck-menu" data-deck="${e(d.id)}" aria-haspopup="menu" aria-label="Deck options for ${e(d.name)}">⋯</button></span>${C.pill(e(word),STAGE_TONE[word])}<span class="cm-tile-mana">${C.colors(ci)}</span><button data-action="${d.commanders.length?'deck':'start-from'}" data-deck="${e(d.id)}"><small>${e(d.name)}</small><h3>${e(commander(d)||'Choose a commander')}</h3>${(()=>{const m=mechanicsOf(d);return m.list.length?`<p${m.derived?' class="cm-tile-derived" title="Read from the list. Name your own in Deck Definition."':''}>${e(m.list.slice(0,3).join(' · '))}</p>`:'';})()}<span class="cm-tile-ready">${C.readinessBar(r)}<span class="cm-tile-caption"><span>${e(caption.join(' · '))}</span><b>B${d.definition.baseBracket}${scoreOf(latestReport(d))?` · ${e(scoreOf(latestReport(d)))} pts`:''}${d.locked?' · Locked':''}</b></span></span>${playLine(d.id)}</button>${sets}${M.isLobbyDeck(d)?`<div class="cm-tile-lobby">${C.pill('Lobby deck','draft')}${b('Save to Decks','promote-lobby-deck',{deck:d.id},false,{cls:'compact'})}</div>`:''}</article>`;};
/* A DECK SHARED WITH YOU (FLT-6): a tile in the same grid with the owner's name; it opens on its own page. Its
   favorite and its tick are yours, keyed by the share, and never touch the owner's deck (FAV-5). */
C.sharedTile=x=>{const key='share:'+x.id,c=x.content,name=c.name;return `<article class="cm-deck-tile cm-deck-shared" data-shared-tile="${e(x.id)}" data-via="${e(x.via||'')}"><span class="cm-tile-tools">${pick(key,name)}${star(key,name)}</span>${C.pill('Shared','draft')}<a class="cm-deck-shared-link" href="#shared?item=${e(x.id)}"><small>${e(name)}</small><h3>${e(c.commanders.map(m=>m.name).join(' + ')||'No commander yet')}</h3>${c.description?`<p>${e(c.description)}</p>`:''}<span class="cm-tile-caption"><span>Shared by ${e(x.owner)} · ${x.access==='collaborator'?'Collaborator':'Reviewer'}${x.via==='public'?' · Public':''}</span></span></a></article>`;};
const sharedGrid=`<div class="cm-deck-grid" id="cm-shared-grid" aria-busy="true"><p class="cm-muted" role="status">Loading the decks shared with you…</p></div>`;
const grid=stage==='shared'?sharedGrid:shown.length?`<div class="cm-deck-grid">${anyDecks&&!fav&&stage==='all'?latestTile:''}${shown.map(tile).join('')}<a class="cm-deck-new" href="#new" data-action="new-deck"><span aria-hidden="true">+</span>New deck</a></div>`:'';
C.main.innerHTML=(anyDecks||stage==='shared'?C.pageHead(title,bulk+b('New deck','new-deck',{},true),'decks',summary)+bar
  :C.pageHead(title,b('New deck','new-deck',{},true),'decks')+`<section class="v-panel cm-decks-empty">${fan}<h2>No decks yet</h2><p class="cm-muted">Start from a commander, bring a list, or restore a backup you saved.</p><div class="cm-actions">${b('Start from a commander','start-from',{},true)}${b('Bring a list','wizard-import')}${b('Restore backup…','restore')}</div><p>${howLink}</p></section>`+latestSlot)
  +(grid?grid+(stage==='shared'?'':budgetLine+footLinks):anyDecks?(decks.length?noneHere:'<p class="cm-muted">Every deck here is archived. Tick Show archived to see them.</p>')+footLinks:'');
$('#cm-show-archived')?.addEventListener('change',ev=>{showArchived=ev.target.checked;C.render();});$('#cm-decks-sort')?.addEventListener('change',ev=>{location.hash=hashFor('sort',ev.target.value);});$('#cm-show-lobby')?.addEventListener('change',ev=>{C.showLobbyDecks=ev.target.checked;C.render();});
/* INCLUDE PUBLIC DECKS (FLT-6, Q8): off by default, private shares only; the choice is remembered with the person. */
$('#cm-include-public')?.addEventListener('change',async ev=>{const on=ev.target.checked;history.replaceState(null,'',hashFor('public',null));await commit({type:'preferences',values:{includePublicShares:on}},{renderView:false});C.render();});
if(stage==='shared'){const box=document.getElementById('cm-shared-grid');
  let owner=null;Promise.resolve(C.sharingReady).then(()=>{owner=sharingOwner();if(!box.isConnected)return null;if(!C.sharedItems||!C.sharingAvailable?.()){box.innerHTML='<p class="cm-muted cm-decks-none">Sign in to see the decks other people share with you.</p>';box.removeAttribute('aria-busy');return null;}return readShared(true);}).then(items=>{if(!items||!box.isConnected||owner!==sharingOwner())return;const count=document.querySelector('[data-stage-count=shared]');if(count)count.textContent=items.filter(x=>(pub||x.via!=='public')&&(!fav||favs.has('share:'+x.id))).length.toLocaleString('en-US');const list=items.filter(x=>(pub||x.via!=='public')&&(!fav||favs.has('share:'+x.id)));C.sharedShown=list;
    box.innerHTML=list.length?list.map(C.sharedTile).join(''):`<p class="cm-muted cm-decks-none">${fav?'No favorites yet. Star a deck to see it here.':pub?'Nobody has shared a deck with you yet.':'Nobody has shared a deck with you privately yet. Tick Include public decks to see public ones.'}</p>`;box.removeAttribute('aria-busy');})
    .catch(err=>{if(box.isConnected){box.innerHTML=`<p class="cm-muted cm-decks-none" role="alert">${e(err.message)}</p>`;box.removeAttribute('aria-busy');}});
  return;}
/* Shared is a count on every stage. Bound background reads to this account and refresh on entry to Shared. */
const sharedChip=document.querySelector('[data-stage-count=shared]');let sharedOwner=null;
Promise.resolve(C.sharingReady).then(()=>{sharedOwner=sharingOwner();return C.sharingAvailable?.()&&C.sharedItems?readShared():[];}).then(items=>{if(sharedChip?.isConnected&&sharingOwner()===sharedOwner)sharedChip.textContent=items.filter(x=>(pub||x.via!=='public')&&(!fav||favs.has('share:'+x.id))).length.toLocaleString('en-US');}).catch(error=>{if(sharedChip?.isConnected){sharedChip.textContent='—';sharedChip.title=error.message;}});
/* AI-5: each tile says whether the table can play its deck, where Play is in the cloud (crankmagic-table.js, C.play);
   and the summary, how many of them it can. Playable (FLT-4) puts away the tiles the table can't play every card of --
   the chip already shows only Defined decks, so a 92-seat deck the table knows is never Playable. */
if(C.play?.open())confirmLate([...document.querySelectorAll('[data-play-for]')],()=>C.play.tiles()).then(()=>{
  for(const el of document.querySelectorAll('[data-play-for]'))if(el.hidden)playSeen.lines.delete(el.dataset.playFor);else playSeen.lines.set(el.dataset.playFor,{text:el.textContent,ok:el.classList.contains('is-playable')});
  if(stage==='playable'){
    const tiles=[...document.querySelectorAll('[data-deck-tile]')];
    for(const t of tiles)t.hidden=!t.querySelector('[data-play-for].is-playable');
    if(tiles.length&&tiles.every(t=>t.hidden))document.querySelector('.cm-deck-grid')?.insertAdjacentHTML('beforebegin',noneHere);
  }
  return C.play.count(live);
}).then(n=>{const el=document.getElementById('cm-decks-playable');if(n!==null&&n!==undefined)Object.assign(playSeen,{count:n,of:live.length});if(el&&n!==null&&n!==undefined)el.textContent=playWords(n);const chip=document.querySelector('[data-stage-count=playable]');if(chip&&n!==null&&n!==undefined)chip.textContent=chipCount('playable').toLocaleString('en-US');});};
/* A card's roles: the ones the catalog already carries, or the classifier read fresh from
   the rules text -- the same vocabulary the graph joins cards on, so "ramp" here is the
   ramp the Discover page means. */
const rolesOf=c=>Array.isArray(c.roles)&&c.roles.length?c.roles:(globalThis.MtgCardClassify&&MtgCardClassify.classify?(MtgCardClassify.classify(c).roles||[]):[]);
async function overview(d){const cards=d.slots.filter(r=>r.purpose==='main').map(r=>({c:C.card(r.cardId),q:r.quantity})),types=['Land','Creature','Artifact','Enchantment','Instant','Sorcery','Planeswalker'],curve=Array(8).fill(0);for(const {c,q} of cards)if(!/Land/.test(c.typeLine))curve[Math.min(7,Number(c.manaValue)||0)]+=q;const max=Math.max(1,...curve),issues=[...M.legality(C.state,d),...M.definitionIssues(C.state,d)];/* ONLY THE OVERVIEW TAB WAITS ON THE NETWORK (Phase 1 PR4). The commander's full card and the written guide
   are read for About the Commander and Strategy; the other tabs draw from the saved
   facts and open at once -- a deck page used to wait on a Scryfall round trip (ten seconds
   when the network is down) before it could show its own progress card. */
const wantGuide=!C.route().params.get('tab')||C.route().params.get('tab')==='overview';let offline=null;
const leaders=wantGuide?await Promise.all(d.commanders.map(id=>C.catalog.details(C.card(id),{onFail:error=>{offline=error;}}))):d.commanders.map(id=>C.card(id)).filter(Boolean);
  if(offline)C.notice('Could not reach Scryfall, so this page is showing the card facts already saved. Card data age is in User Functions.',true);let guide=null;if(wantGuide){try{const data=CrankAssets.expect(await C.catalog.load(CrankAssets.guides),'guides');guide=data.decks.find(g=>g.commander===leaders[0]?.name);}catch{}}if(C.route().view!=='decks'||C.route().params.get('deck')!==d.id)return;const swot=structural(d,cards);
const ready=M.readiness(C.state,d),heroArt=art(d);
/* WHAT THE LIST COSTS AGAINST THE DECK'S BUDGET. The Lab drafts against the budget as a target
   rather than a wall, so a list can arrive here over it. It is a badge in the hero, with both
   numbers, and only that: a budget informs and never refuses (Rob, 2026-10-18; docs/budgets.md). */
const {cost:spend,budget:cap,over:overCap}=M.deckBudget(C.state,d);
const latest=latestReport(d);
/* THE PAGE IS FIVE TABS (Phase 1 PR4). Overview answers "where is this deck and what do I do next":
   hero, progress, cost, next actions, hundred-at-a-glance, plus History and Guide content folded under it
   (not separate top tabs). The hundred is the full 100-card list by type with copy/owned status.
   Upgrades is the working list and Upgrade Path. Explore is deck-scoped explore/relationships (chrome only).
   Acquire is buy list, orders, and acquisition tracking. The tab rides on the route (?tab=), so a link
   lands on the tab it means and Back returns to it. Old hashes (cards/guide/history) redirect via TAB_REDIRECTS. */
/* Apply redirects for old tab hashes, then validate against current tabs */
let requestedTab=C.route().params.get('tab')||'overview';
requestedTab=TAB_REDIRECTS[requestedTab]||requestedTab;
const tab=DECK_TABS.some(([id])=>id===requestedTab)?requestedTab:'overview';
const precon=preconOf(d);
/* ONE PRIMARY, TWO BESIDE IT, MEASURE, AND THE REST UNDER MORE. The three that stay are the
   ones a deck is worked with -- add what you own, buy what you do not, log the game -- and a
   draft's are edit, finalize, log (a deck is often played before its reservations exist). On a
   phone the same three are a fixed bar at the foot of the screen (`.cm-action-bar`), where a
   thumb reaches them; the hero keeps Measure, More and the ?. */
const work=(w=>M.isLobbyDeck(d)&&!d.archived?[b('Save to Decks','promote-lobby-deck',{deck:d.id},true),...w]:w)(d.archived?[b('Restore as draft','restore-deck',{deck:d.id},true),b('Delete permanently','delete-deck',{deck:d.id})]
  /* THE PRIMARY IS THE STATE'S, NOT A FIXED SLOT (UAT B-20). Copies waiting to go into the box
     make Planned Changes the primary; failing that, an open shopping list makes it Buy list; a deck
     with neither is there to be played. The primary also goes first, where a thumb lands. */
  :d.status==='final'?(()=>{const readyN=pullCount(ready)+ready.remove+M.benchFree(C.state,d).copies,primary=readyN>0?'pull':ready.toBuy>0?'buy':'log';
    const row=[['pull',b(readyN>0?`Planned Changes (${readyN})`:'Planned Changes','deck-pull',{deck:d.id},primary==='pull')],['buy',precon?buyPrecon(precon,primary==='buy'):b(`Buy list (${ready.toBuy})`,'deck-buy-list',{deck:d.id},primary==='buy')],['log',b('Log a game','log-game',{deck:d.id},primary==='log')]];
    return row.sort((x,y)=>(x[0]===primary?-1:0)-(y[0]===primary?-1:0)).map(x=>x[1]);})()
  :[b('Edit card list','edit-list',{deck:d.id},true),precon?b('Save','precon-save',{deck:d.id}):b('Lock list','finalize',{deck:d.id}),b('Log a game','log-game',{deck:d.id})]);
const measure=d.archived||!cards.length?'':`<button type="button" class="v-button" data-action="measure-deck" data-deck="${e(d.id)}" title="Compare lists under the browser simulation model — not a full rules-engine game.">${latest?'Measure again':'Measure'}</button>`;
/* THE TRACE: the deck's strategy lit from the commander outward, on Discover's canvas. */
const traceBtn=d.archived||!cards.length?'':b('Trace','deck-trace',{deck:d.id});
/* THE CHANGE LIST (Rob, 14 September): what to pull from the physical deck and what to put in,
   read against the mana formula and the floors before a card moves; the count is the rows
   that can be done now. */
const changeBtn=d.archived||d.status!=='final'||!C.changePlan?'':(()=>{const p=C.changePlan(d),n=p?p.rows.filter(r=>r.available).length:0;return b(n?`Make the change (${n})`:'Make the change','deck-change',{deck:d.id});})();
const mech=mechanicsOf(d),games=C.state.games.filter(g=>g.deckId===d.id);
const counts={hundred:cards.reduce((n,x)=>n+x.q,0),upgrades:d.slots.filter(r=>r.purpose==='upgrade').length+d.slots.filter(r=>r.purpose==='main'&&r.option).length,acquire:precon?0:ready.toBuy};
const tabs=`<div class="cm-tabs cm-deck-tabs" role="tablist" aria-label="Deck page">${DECK_TABS.map(([id,label])=>`<button type="button" role="tab" aria-selected="${id===tab}" data-action="deck-tab" data-deck="${e(d.id)}" data-tab="${id}">${label}${counts[id]?` <small>${counts[id].toLocaleString('en-US')}</small>`:''}</button>`).join('')}</div>`;
/* HOW TO PLAY (DPG-3): Overview opens with the deck's own steps, numbered. A deck without them shows nothing here. */
const howToPlayHTML=d=>d.howToPlay?.length?`<section class="v-panel cm-how-to-play" id="cm-sec-how-to-play"><h2>How to play</h2><ol>${d.howToPlay.map(x=>`<li>${C.glossary?.html?C.glossary.html(x):e(x)}</li>`).join('')}</ol></section>`:'';
/* Build guide HTML for overview tab */
/* GUIDE & SWOT IS A DIALOG (r3, 31-deck-guide; R3.5). About the Commander stays on the page; the written
   guide, the deck's notes and the SWOT are drawn once, here, into a template, and the dialog opens a copy
   of it -- so the link and the More menu show exactly what the page computed, with nothing recomputed. */
const guideSection=()=>`<section class="v-panel" id="cm-sec-commander">${leaders.map(c=>`<div class="cm-commander">${c.image?`<img src="${e(c.image)}" alt="${e(c.name)}">`:'<div></div>'}<div><h2>About the Commander</h2><h3>${e(c.name)}</h3><ul><li>${C.mana(c.manaCost,c.typeLine)} · ${c.power!==null?e(c.power+'/'+c.toughness)+' · ':''}${C.glossary.html(c.typeLine)}</li><li>${C.glossary.html(c.keywords.join(', ')||'No keyword abilities recorded')}</li>${c.oracleText.split('\n').filter(line=>/^(When|Whenever|At the beginning)|:/.test(line)).map(t=>`<li>${C.glossary.html(t)}</li>`).join('')}</ul><p>${e(commanderUse(c))}</p>${b('Full card & rules','card',{card:c.id})}</div></div>`).join('<hr>')}</section><template id="cm-guide-template" data-deck="${e(d.id)}"><section class="cm-guide-dialog" id="cm-sec-guide"><h3>Strategy & how to play</h3>${guideHTML(guide,d,leaders,cards)}<h3>Your notes</h3><p>${e(d.notes||'No deck notes yet.')}</p></section><section class="cm-guide-dialog" id="cm-sec-swot"><h3>SWOT & recommendations</h3><div class="cm-swot">${Object.entries(swot).map(([k,v])=>`<div><h3>${e(k)}</h3><p>${e(v)}</p></div>`).join('')}</div><h3>Review next</h3><ul>${issues.slice(0,5).map(x=>`<li>${e(x)}</li>`).join('')||'<li>The basic Commander list checks pass. Review price, bracket expectations and your playgroup’s preferences.</li>'}</ul>${b('Explore recommendations','deck-suggestions',{deck:d.id})}${b('Review linked upgrades','deck-upgrades',{deck:d.id})}</section></template>`;
/* THE HERO (Track V.4b, the guide's step 4). The commander's own card stands beside the copy,
   tilted, with a glow in the deck's tint behind it -- the deck is a picture before it is a list.
   --tint is the same token the tile uses, so a deck looks like itself on both pages. */
const heroCard=leaders[0]&&leaders[0].image?`<div class="cm-deck-hero-card"><img src="${e(leaders[0].image)}" alt="${e(leaders[0].name)}" loading="lazy"></div>`:'';
const heroTint=/^[WUBRG]$/.test((C.card(d.commanders[0])?.colorIdentity||[])[0]||'')?`--tint:var(--mana-${(C.card(d.commanders[0]).colorIdentity)[0]});`:'';
const body={
  overview:()=>{
    /* A SHELL (SHL-2, SHL-4): with no commander, one click reopens Start from; with only its commander, Define the Deck.
       The Lab stays for testing decks; it is no longer how one starts (RVW-7). */
    if(!d.commanders.length)return `<section class="v-panel" id="cm-sec-overview-empty"><h2>Overview</h2><p class="cm-muted">Choose a commander first.</p><div class="cm-actions">${b('Start from','start-from',{deck:d.id},true)}</div></section>`;
    if(cards.length<=d.commanders.length)return howToPlayHTML(d)+`<section class="v-panel" id="cm-sec-overview-empty"><h2>Overview</h2><p class="cm-muted">Only the commander so far.</p><div class="cm-actions">${b('Define the Deck','define-deck',{deck:d.id},true)}${b('Import a list','wizard-import')}</div></section>`;
    /* THE BENTO (Track V.4b). The Progress and Cost panel and The hundred at a glance were two
       full-width stacks; they are one six-column grid of cards now, in the guide's spans. Every
       figure is the same figure -- readiness, the rules module, the classifier -- so the cards
       agree with the Shop strip and the Orders tab by construction, as the panels did. */
    return howToPlayHTML(d)+(d.status==='draft'&&overCap?note(`Over its ${C.money(cap)} budget by about ${C.money(spend-cap)} at recorded prices. A budget only informs: the list locks either way.`):'')
      +bento(d,cards,curve,max,types,ready,heroTint)+guideSection()+historyHTML(d)+recordCard(d)+reportsHTML(d);
  },
  hundred:()=>cardsTab(d,cards,curve,max,types),
  upgrades:()=>workingHTML(d)+upgradesHTML(d),
  explore:()=>`<section class="v-panel cm-explore-deck" id="cm-sec-explore"><h2>Explore</h2><p class="cm-muted">Explore this deck's card relationships and strategies in the interactive graph. Trace lights the deck from its commander outward; Lens filters by role.</p>${cards.length?`<div class="cm-actions"><a class="v-button primary" href="#discover?deck=${encodeURIComponent(d.id)}">Open Discover with this deck</a></div><p class="cm-muted">Opens Discover scoped to this deck. Progressive-disclosure tools (Trace, Lens, filters) are available once inside.</p>`:`<p class="cm-muted">Add cards to this deck first. Once your hundred has cards, return here to explore connections and strategies.</p><div class="cm-actions">${b('Edit card list','edit-list',{deck:d.id},true)}</div>`}</section>`,
  acquire:()=>precon?`<section class="v-panel cm-acquire-deck cm-acquire-precon" id="cm-sec-acquire"><h2>Acquire</h2><p>Buy the precon</p><div class="cm-budget-figures"><div title="${e(preconPrice(precon).title)}"><strong>${e(preconPrice(precon).figure)}</strong><span>$ Price</span></div></div><div class="cm-actions">${buyPrecon(precon,true)}</div></section>`
    :`<section class="v-panel cm-acquire-deck" id="cm-sec-acquire"><h2>Acquire</h2>${ready.toBuy||ready.ordered?`<p>Track what this deck needs and where to get it.</p><div class="cm-budget-figures"><div><strong>${ready.toBuy}</strong><span>To buy</span></div><div><strong>${ready.ordered}</strong><span>Ordered</span></div><div><strong>${C.money(ready.costToFinish)}</strong><span>$ to finish</span></div></div><div class="cm-actions">${b(`Buy list (${ready.toBuy})`,'deck-buy-list',{deck:d.id},true)}${b('View orders','shop-orders')}</div><p class="cm-muted">The buy list shows cards this deck needs with current prices. Orders track what's on the way from shops.</p>`:`<p class="cm-muted">This deck has no outstanding cards to acquire. Every reserved card is either in the physical deck or ready to add.</p>`}</section>`
}[tab]();
/* THE STAGE, ONE WORD (§2): the same reading as the tile's badge -- Building, Defined or Boxed -- or Archived. */
const stageNow=M.deckStatus(C.state,d),stageWord=d.archived?'Archived':stageNow.boxed?'Boxed':stageNow.stage==='defined'?'Defined':'Building';
C.main.innerHTML=`<section class="cm-deck-hero" style="${heroTint}${heroArt?`--hero:url('${e(heroArt)}')`:''}">${heroCard}<div class="cm-deck-hero-copy"><a class="cm-crumb" href="#decks">Decks</a><h1>${e(d.name)}</h1><p>${heroCost(d)} ${precon?`<span class="cm-badge cm-precon-badge" title="Made from the ${e(precon.name)} precon${precon.setName?` (${e(precon.setName)})`:''}">Precon · ${e(precon.name)}</span> `:''}<span class="cm-badge ${stageNow.boxed?'good':''}" data-stage="${e(stageWord)}">${e(stageWord)}</span> ${d.archived?'':legalBadge(d)} <span class="cm-badge">Bracket ${e(String(d.definition.baseBracket))}–${e(String(d.definition.bracketCeiling))}</span>${overCap?` <span class="cm-badge warn" title="The list at recorded prices against the deck’s budget. A budget only informs: nothing is refused for it.">Over the ${e(C.money(cap))} budget · about ${e(C.money(spend))}</span>`:''}${latest?` <span class="cm-badge" title="Latest measured score">Measured ${e(scoreOf(latest))} pts</span>`:''}${attached(d)?` <span class="cm-badge">Group: ${e(attached(d).name)}</span> <button type="button" class="cm-text-button cm-hero-link" data-action="deck-group" data-group="${e(d.groupId)}">Open group</button>`:''}${d.locked?' <span class="cm-badge warn">Locked</span>':''}</p>${deckPlayLine(d.id)}${mech.list.length?`<div class="cm-deck-chips${mech.derived?' cm-tile-derived':''}"${mech.derived?' title="Read from the list. Name your own in Deck Definition."':''}>${mech.list.map(m=>`<span class="cm-chip">${e(m)}</span>`).join('')}</div>`:''}${d.description?`<p class="cm-deck-strategy">${e(d.description)}</p>`:''}<div class="cm-actions cm-deck-actions"><span class="cm-deck-work">${work.join('')}</span>${changeBtn}${measure}${b('More','deck-more-menu',{deck:d.id},false,{caret:'down'})}</div></div></section>`+tabs+body+(d.archived?'':`<nav class="cm-action-bar" aria-label="Deck actions">${work.join('')}${changeBtn}</nav>`);C.afterOverview?.(d.id);const selectedGame=C.route().params.get('game');if(selectedGame){const row=C.main.querySelector(`[data-game-record="${CSS.escape(selectedGame)}"]`);if(row){row.scrollIntoView({block:'center'});row.focus({preventScroll:true});}}
/* AI-5: whether the table can play this deck, and Play this deck when it can (crankmagic-table.js, C.play). */
if(C.play?.open()){const line=document.getElementById('cm-deck-play');confirmLate(line?[line]:[],()=>C.play.deck(d)).then(()=>{const el=document.getElementById('cm-deck-play');if(!el||el.dataset.deck!==d.id)return;if(el.hidden){playSeen.deck.delete(d.id);const next=document.querySelector('#cm-deck-next .cm-bento-next-line');if(next)next.textContent=next.dataset.nextDefault;}else playSeen.deck.set(d.id,{html:el.innerHTML,ok:el.classList.contains('is-playable'),blockedState:el.dataset.blockedState||''});});}}
/* THE NEXT LINE. One sentence, in the order the work happens: add what you already own, buy
   what you do not, wait for what is ordered, swap the substitutes out when the real copies
   arrive. Every number is readiness's, so the line agrees with the figures above it. */
function nextLine(d,r){
  if(d.archived)return 'archived. Restore it as a draft to work on it again.';
  const n=d.slots.filter(x=>x.purpose==='main').reduce((a,x)=>a+x.quantity,0);
  if(d.status==='draft'&&preconOf(d))return 'save it to your decks, and buy the precon to own every card in it (Buy the Precon).';
  if(d.status==='draft')return n<100?`finish the list (${n} of 100); the copies you own are already reserved for it, and the rest are on the buy list.`:'Lock the list when it is settled — it marks the deck locked; its copies are already reserved and the rest are on the buy list.';
  const steps=[],pull=pullCount(r),subs=r.remove||r.standIns;
  if(pull)steps.push(`add the ${pull} card${pull===1?'':'s'} you already own (Planned Changes)`);
  if(r.toBuy)steps.push(preconOf(d)?'buy the precon for the rest (Buy the Precon)':`buy ${r.toBuy} card${r.toBuy===1?'':'s'}${r.costToFinish?` (${C.money(r.costToFinish)})`:''}`);
  if(r.ordered)steps.push(`${r.ordered} ordered cop${r.ordered===1?'y is':'ies are'} on the way`);
  if(subs)steps.push(`swap out the ${subs} substitute${subs===1?'':'s'} from Planned Changes`);
  if(!steps.length)return 'nothing — every card is in the physical deck. Log a game.';
  return steps.length===1?steps[0]+'.':`${steps[0]}, then ${steps[1]}${steps.length>2?`, and ${steps.length-2} more step${steps.length>3?'s':''}`:''}.`;
}
/* The composition -- the curve and the type counts -- drawn once for the Cards tab's head and the Overview's glance. */
/* Each card counts once, under its first type in the rules' order (a creature that is also an artifact is a creature), so the counts sum to the hundred and agree with the glance's type bar. */
const typeOf=c=>R.TYPE_ORDER.find(k=>k!=='Commander'&&k!=='Other'&&c.typeLine.includes(k))||'Other';
function compositionHTML(cards,curve,max,types){return cards.length?`<div class="cm-deck-composition"><div class="cm-curve" aria-label="Mana curve">${curve.map((n,i)=>`<div><span>${n||''}</span><i style="height:${n/max*88}px"></i><span>${i===7?'7+':i}</span></div>`).join('')}</div><div class="cm-count-list">${types.map(t=>`<span>${C.glossary.html(t)} <strong>${cards.filter(x=>typeOf(x.c)===t).reduce((n,x)=>n+x.q,0)}</strong></span>`).join('')}<span>Ramp <strong>${cards.filter(x=>rolesOf(x.c).includes('ramp')).reduce((n,x)=>n+x.q,0)}</strong></span></div></div>`:'';}
/* THE COST FIGURES, read once. stats() used to compute these inline and draw a panel with them;
   the bento needs the numbers in two different cards, so they are a function and the drawing is
   not. Every one is the rules module's or readiness's, so the cards agree with the Shop strip and
   the Orders tab by construction. */
/* BUDGET (Rob, 2026-10-18; docs/budgets.md): the deck's own, or none -- it inherits neither the account's budget nor the
   pod's rule -- and only informational. Its percentage is of the list's cost at recorded prices (M.deckBudget), the
   same figure the account's budget sums. */
function costOf(d){
  const r=M.readiness(C.state,d),R=globalThis.CrankRules,bud=M.deckBudget(C.state,d),cap=bud.budget,perCard=d.definition.perCardCap??(R?R.RULES.perCardMax:null);
  const pct=cap>0?bud.cost/cap*100:null;
  const lots=C.state.lots.filter(l=>l.allocation?.deckId===d.id);
  const overCap=R?lots.filter(l=>Number.isFinite(l.paid)&&R.capFor(C.card(l.cardId).price)!==null&&l.paid>R.capFor(C.card(l.cardId).price)).length:0;
  const dear=perCard!==null?d.slots.filter(x=>x.purpose==='main'&&C.card(x.cardId).price>perCard).length:0;
  const owned=lots.filter(l=>l.source==='owned'),estimated=owned.filter(l=>!Number.isFinite(l.paid)||l.paidSource==='catalog');
  const paidOrList=owned.reduce((n,l)=>n+(Number.isFinite(l.paid)?l.paid:(C.card(l.cardId)?.price||0))*l.quantity,0);
  return {r,cap,cost:bud.cost,perCard,pct,overCap,dear,estimated,paidOrList,gc:gcCount(d),tone:pct===null?'':pct>100?' cm-over':pct>90?' cm-near':''};
}
/* THE BENTO (Track V.4b, the guide's step 4, against screens/Gallery Deck Page.dc.html). Nine
   cards on a six-column grid, in the guide's spans: one tinted Next across the top, Progress and
   Cost beside each other, then the three readings of the hundred, how it plays, the cheapest
   upgrades, and the record. Nothing here is new information -- it is the Progress and Cost panel
   and The hundred at a glance, laid out as cards of known size instead of two full-width stacks. */
function bento(d,cards,curve,max,types,ready,tint=''){
  const {r,cap,cost:listCost,pct,overCap,dear,estimated,paidOrList,gc,tone}=costOf(d);
  const CL=globalThis.MtgCardClassify,total=cards.reduce((n,x)=>n+x.q,0);
  const card=(cls,label,inner,extra='')=>`<section class="cm-bento-card cm-bento-${cls}"${extra}><h3 class="cm-bento-label">${e(label)}</h3>${inner}</section>`;
  const key=(k,label,v)=>`<div><strong>${v}</strong><span><i class="cm-key ${k}" aria-hidden="true"></i>${e(label)}</span></div>`;

  /* NEXT. The state's one sentence, and the button that answers it. */
const next=`<section class="cm-bento-card cm-bento-next" id="cm-deck-next"><h3 class="cm-bento-label">Next</h3><p class="cm-bento-next-line" data-next-default="${e(nextLine(d,r))}">${e(seenOf(playSeen.deck,d.id)?.blockedState||nextLine(d,r))}</p></section>`;

  /* PROGRESS. A ring of the hundred -- what is in the physical deck, and how much of that is a
     substitute standing in -- with the four figures beside it, each under its segment's color. */
  const pctIn=total?Math.min(100,Math.round((r.sleeved/Math.max(1,r.reserved||total))*100)):0;
  const pctSub=total?Math.min(100,Math.round((r.standIns/Math.max(1,r.reserved||total))*100)):0;
  const circ=2*Math.PI*44;
  const ring=`<div class="cm-ring"><svg viewBox="0 0 112 112" width="112" height="112" role="img" aria-label="${pctIn}% of the hundred is in the physical deck, ${pctSub}% of it standing in">
    <circle cx="56" cy="56" r="44" fill="none" stroke="var(--v-raised)" stroke-width="12"></circle>
    <circle cx="56" cy="56" r="44" fill="none" stroke="var(--st-inbox)" stroke-width="12" stroke-linecap="butt" stroke-dasharray="${(circ*pctIn/100).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 56 56)"></circle>
    ${pctSub?`<circle cx="56" cy="56" r="44" fill="none" stroke="var(--st-standin)" stroke-width="12" stroke-linecap="butt" stroke-dasharray="${(circ*pctSub/100).toFixed(1)} ${circ.toFixed(1)}" stroke-dashoffset="${(-circ*(pctIn-pctSub)/100).toFixed(1)}" transform="rotate(-90 56 56)" opacity=".85"></circle>`:''}
  </svg><span class="cm-ring-center"><b>${r.sleeved}</b><small>in the box</small></span></div>`;
  const progress=card('progress','Progress',ring+`<div class="cm-bento-figures">${key('inbox','Real copies',r.sleeved-r.standIns)}${key('standin','Substitutes',r.standIns)}${key('ordered','To Buy · Ordered',r.ordered)}${key('buy','To buy',r.toBuy)}</div>`);

  /* COST. What finishing costs, against the deck's budget, with the three facts that qualify it. */
  const paidWord=(estimated.length?'≈ ':'')+C.money(Math.round(paidOrList*100)/100);
  const pre=preconOf(d),prePrice=pre&&preconPrice(pre);
  const cost=pre?card('cost','Cost',`<p class="cm-bento-figure" title="${e(prePrice.title)}">${e(prePrice.figure)}<small>$ Price</small></p><p class="cm-bento-facts">Bought as one product: ${e(pre.name)}.</p><div class="cm-actions">${buyPrecon(pre)}</div>`,` data-tone=""`)
    :card('cost','Cost',`<p class="cm-bento-figure">${e(C.money(r.costToFinish))}<small>to finish</small></p>`
    +(cap>0?`<div class="cm-budget-bar" role="img" aria-label="The list costs ${Math.round(pct)}% of its budget"><i style="width:${Math.min(100,pct)}%"></i></div>`:'')
    +`<p class="cm-bento-facts">${e(paidWord)} paid so far · ${e(C.money(r.marketValue))} market${pct!==null?` · ${Math.round(pct)}% of budget`:''}${overCap?` · ${overCap} line${overCap===1?'':'s'} over the 110% cap`:''}${dear?` · ${dear} card${dear===1?'':'s'} over the per-card cap`:''}</p>`
    +`<p class="cm-bento-facts cm-muted" title="The list at recorded prices: ${e(C.money(listCost))}">${cap===null?'No budget':`Budget ${e(C.money(cap))}`} · ${gc} of ${GC_LIMIT} Game Changers</p>`,` data-tone="${tone.trim()}"`);

  /* THE THREE READINGS OF THE HUNDRED, the same tallies the glance drew. */
  const tally=(list,f,cap2=9)=>{const m=new Map();for(const {c,q} of list){const k=f(c)||'Other';m.set(k,(m.get(k)||0)+q);}const all=[...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));if(all.length<=cap2)return all;const rest=all.slice(cap2-1);return [...all.slice(0,cap2-1),[`Other (${rest.length} kinds)`,rest.reduce((n,x)=>n+x[1],0)]];};
  const byType=tally(cards,typeOf),byPurpose=tally(cards.filter(({c})=>!/\bLand\b/.test(c.typeLine)),c=>{const p=CL&&CL.purposeOf?CL.purposeOf(c):null;return p&&p.label?p.label:'No purpose read';});
  const curveCard=card('curve','Mana curve',`<div class="cm-curve" aria-label="Mana curve">${curve.map((n,i)=>`<div><span>${n||''}</span><i style="height:${n/max*88}px"></i><span>${i===7?'7+':i}</span></div>`).join('')}</div>`);
  const typesCard=card('types','By card type',`<div class="cm-breakdown" role="img" aria-label="${e(byType.map(([k,n])=>`${k} ${n}`).join(', '))}">${byType.map(([k,n],i)=>`<i class="b${i%8}" style="flex:${n} 1 0" title="${e(k)} · ${n}"></i>`).join('')}</div><ul class="cm-breakdown-key">${byType.map(([k,n],i)=>`<li><i class="b${i%8}" aria-hidden="true"></i>${e(k)} <b>${n}</b></li>`).join('')}</ul>`);
  const purposeMax=Math.max(1,...byPurpose.map(x=>x[1]));
  const purpose=card('purpose','What the spells do',`<ul class="cm-purpose-rows">${byPurpose.map(([k,n],i)=>`<li><span>${e(k)}</span><i style="width:${Math.round(n/purposeMax*100)}%;opacity:${(1-i*0.07).toFixed(2)}"></i><b>${n}</b></li>`).join('')}</ul>`);

  /* HOW IT PLAYS. The strategy vocabulary's own reading of the commander and the named mechanics;
     everything counted or looked up, nothing generated, so the same deck always reads the same. */
  const S=globalThis.CrankStrategies,lead=C.card(d.commanders[0]);
  const terms=lead&&CL&&CL.classify?{...lead,...CL.classify(lead)}:lead;
  const desc=S&&lead?S.describe(terms,d.definition.mechanics||[]):null;
  const plays=card('plays','How it plays',desc&&desc.lines.length
    ?`<div class="cm-plays-grid">${desc.lines.slice(0,4).map(l=>`<div><strong>${e(l.label)}</strong><span>${e(l.why)}${l.source==='mechanics'?' (named by the deck)':''}</span></div>`).join('')}</div><p class="cm-bento-facts"><button type="button" class="cm-text-button" data-action="deck-guide" data-deck="${e(d.id)}">Full guide and SWOT</button></p>`
    :`<p class="cm-muted">${lead?`Nothing in ${e(lead.name)}'s rules text names a strategy the vocabulary knows. Name the deck's mechanics in its definition and they will read here.`:'The deck has no commander yet.'}</p>`);

  /* UPGRADE PATH. The four cheapest linked swaps, and a link to the rest. */
  const ups=d.slots.filter(x=>x.purpose==='upgrade').map(x=>({c:C.card(x.cardId),from:x.replaces?C.card(x.replaces):null})).filter(x=>x.c)
    .sort((a,b)=>(a.c.price??1e9)-(b.c.price??1e9));
  const upgrade=card('upgrade','Upgrade path',ups.length
    ?`<ul class="cm-upgrade-rows">${ups.slice(0,4).map(x=>`<li><span>${e(x.c.name)}${x.from?`<small>replaces ${e(x.from.name)}</small>`:''}</span><b>${e(C.money(x.c.price))}</b></li>`).join('')}</ul>${ups.length>4?`<p class="cm-bento-facts"><button type="button" class="cm-text-button" data-action="deck-tab" data-deck="${e(d.id)}" data-tab="upgrades">All ${ups.length}</button></p>`:''}`
    :`<p class="cm-muted">No linked upgrades yet. Open a card's Replace with to link one.</p>`);

  return `<div class="cm-bento" style="${tint}">${next}${progress}${cost}${curveCard}${typesCard}${purpose}${plays}${upgrade}</div>`;
}
/* RECORD keeps its own section, which draws the games and the empty state, in a card with the dashed border the guide's
   empty state asks for. It sits below the Simulation history now, and both below About the commander (Rob,
   2026-10-01: "About the commander ... should be above record and simulation report sections. Record should be below
   simulation report."). */
const recordCard=d=>`<div class="cm-bento-card cm-bento-record${C.state.games.some(g=>g.deckId===d.id)?'':' is-empty'}">${recordHTML(d)}</div>`;

/* THE HUNDRED AT A GLANCE (Rob, 14 September). On the Overview, under the progress card: the
   composition the Cards tab reads at its head, the hundred by card type and by Primary
   Purpose as two bars with their keys, and the deck's key strategy in the strategy
   vocabulary's own words -- what the commander's rules text offers and what the deck's
   named mechanics add (CrankStrategies.describe). Everything here is counted or looked up;
   nothing is generated by a model, so the same deck always reads the same way. */
function glance(d,cards,curve,max,types){
  if(!cards.length)return '';
  const total=cards.reduce((n,x)=>n+x.q,0),CL=globalThis.MtgCardClassify;
  /* A tally is the bands in size order; past nine, the small ones fold into one Other band so the bar and its key stay readable. */
  const tally=(list,f,max=9)=>{const m=new Map();for(const {c,q} of list){const k=f(c)||'Other';m.set(k,(m.get(k)||0)+q);}const all=[...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));if(all.length<=max)return all;const rest=all.slice(max-1);return [...all.slice(0,max-1),[`Other (${rest.length} kinds)`,rest.reduce((n,[,q])=>n+q,0)]];};
  /* The purpose bar reads the spells; the lands are the type bar's, and a card the classifier gives no purpose says so. */
  const byType=tally(cards,typeOf),byPurpose=tally(cards.filter(({c})=>!/\bLand\b/.test(c.typeLine)),c=>{const p=CL&&CL.purposeOf?CL.purposeOf(c):null;return p&&p.label?p.label:'No purpose read';});
  const bar=(list,label)=>`<div class="cm-glance-bar"><h4>${e(label)}</h4><div class="cm-breakdown" role="img" aria-label="${e(label)}: ${e(list.map(([k,n])=>`${k} ${n}`).join(', '))}">${list.map(([k,n],i)=>`<i class="b${i%8}" style="flex:${n} 1 0" title="${e(k)} · ${n}"></i>`).join('')}</div><ul class="cm-breakdown-key">${list.map(([k,n],i)=>`<li><i class="b${i%8}"></i>${e(k)} <strong>${n}</strong></li>`).join('')}</ul></div>`;
  const S=globalThis.CrankStrategies,lead=C.card(d.commanders[0]);
  const terms=lead&&CL&&CL.classify?{...lead,...CL.classify(lead)}:lead;
  const desc=S&&lead?S.describe(terms,d.definition.mechanics||[]):null;
  const strategy=desc&&desc.lines.length
    ?`<div class="cm-glance-strategy"><h4>Key strategy, read off ${e(lead.name)}</h4><p>${desc.lines.slice(0,4).map(l=>`<strong>${e(l.label)}</strong> — ${e(l.why)}${l.source==='mechanics'?' <span class="cm-muted">(named by the deck)</span>':''}`).join('; ')}.</p><p class="cm-muted">From the commander's rules text and the deck's named mechanics, in the same vocabulary the Trace lights on Discover; nothing here is generated.</p></div>`
    :`<div class="cm-glance-strategy"><h4>Key strategy</h4><p class="cm-muted">${lead?`Nothing in ${e(lead.name)}'s rules text names a strategy the vocabulary knows; name the deck's mechanics in its definition and they will read here.`:'The deck has no commander yet.'}</p></div>`;
  return `<section class="v-panel cm-glance" id="cm-sec-glance"><h2>The hundred at a glance <span class="cm-pull-n">${total}</span></h2><div class="cm-glance-grid">${compositionHTML(cards,curve,max,types)}${bar(byType,'By card type')}${bar(byPurpose,'By Primary Purpose, the spells')}</div>${strategy}</section>`;
}
/* THE CARDS TAB IS THE DECK'S VIEW (Rob, 2026-10-18): the same records the Library lists when it is scoped to this
   deck, read by the same function (the model's deckStatus), with the same pill and the same words beside it -- so a
   card cannot read one way here and another there. Four parts: In the deck, the box (Final and Substitute, by card
   type, the only cards that count toward the hundred); Loading, the deck's own cards owned and not put in yet;
   Reserved, the cards committed to take a seat; and Upgrades, the cards being considered, each naming what it would
   replace. Actions on a card (status, price, options) stay on the Library; this is the list you read. The
   composition -- curve and type counts -- sits at its head, because it is about these cards. */
/* A STAND-IN, CHOSEN BEFORE IT IS BOXED (Q1, 2026-10-23). An empty Reserved seat -- to buy or ordered, nothing holding it
   -- offers Choose a stand-in…: an owned Bench copy set aside for it, a Substitute · Loading that Box deck or Ready to
   add puts in. A chosen one can be cleared. */
const standInTool=(d,r,st)=>{if(d.archived)return '';
  if(st.use==='reserved'&&!st.from&&!st.replaces&&st.slotId&&d.status==='final')return ` <button type="button" class="cm-text-button cm-standin-choose" data-action="choose-standin" data-deck="${e(d.id)}" data-slot="${e(st.slotId)}">Choose a stand-in…</button>`;
  if(st.use==='substitute'&&!st.inBox&&r.kind==='lot')return ` <button type="button" class="cm-text-button cm-standin-clear" data-action="clear-standin" data-lot="${e(r.id)}">Clear</button>`;
  return '';};
actions['choose-standin']=el=>{const d=M.deck(C.state,el.dataset.deck),r=M.slot(C.state,d.id,el.dataset.slot),seat=C.card(r.cardId)?.name||'this seat';
  const free=C.state.lots.filter(l=>l.source==='owned'&&!l.allocation&&!l.chosenFor&&l.location?.kind!=='deck'&&(l.offer||'none')==='none');
  const names=[...new Set(free.map(l=>C.card(l.cardId)?.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'en-US'));
  if(!names.length)throw Error('No card on your Bench is free to stand in.');
  form(`A stand-in for ${seat}`,`<label class="cm-full">Bench card<input name="card" list="cm-standin-names" required autocomplete="off"></label><datalist id="cm-standin-names">${names.map(n=>`<option value="${e(n)}">`).join('')}</datalist>`,
    v=>{const l=free.find(x=>C.card(x.cardId)?.name===v.card.trim());if(!l)throw Error(`${v.card} is not a free Bench card. Choose one from the list.`);return commit({type:'standIn',lotId:l.id,deckId:d.id,slotId:r.id});},'Choose stand-in');};
actions['clear-standin']=el=>commit({type:'clearStandIn',lotId:el.dataset.lot});
function cardsTab(d,cards,curve,max,types){
  const precon=preconOf(d);   /* a precon's cards come with it: no To buy pill on each, one Buy the Precon at the head */
  const ds=M.deckStatus(C.state,d),name=id=>(C.card(id)||{}).name||'',deckName=id=>{const x=C.state.decks.find(y=>y.id===id);if(!x)return '';const m=x.name.match(/^(D\d+)\b/);return m?m[1]:x.name;};
  const line=({r,st})=>{const c=C.card(r.cardId);if(!c)return '';const label=M.stateLabel(st),note=M.stateNote(st,name,deckName),quiet=precon&&st.use==='reserved'&&!st.from&&st.ownership==='buy';
    return `<li><span class="cm-deck-qty">${r.quantity||1}</span><button type="button" class="cm-card-name" data-action="card" data-card="${e(c.id)}">${e(c.name)}</button><span class="cm-deck-mana">${C.mana(c.manaCost,c.typeLine)}</span><span class="cm-price">${Number.isFinite(c.price)?C.money(c.price):''}</span><span class="cm-deck-flags">${quiet?'':C.pill(e(label),M.stateTone(label))}${note&&!quiet?` <span class="cm-badge cm-badge-${e(st.use)}">${e(note)}</span>`:''}${r.option?C.pill('Option','watch'):''}${c.gameChanger?C.pill('GC','remove','title="Game Changer"'):''}${standInTool(d,r,st)}</span></li>`;};
  const byMana=(a,b2)=>(Number((C.card(a.r.cardId)||{}).manaValue)||0)-(Number((C.card(b2.r.cardId)||{}).manaValue)||0)||name(a.r.cardId).localeCompare(name(b2.r.cardId));
  const ORDER=R.TYPE_ORDER,groups=new Map(ORDER.map(k=>[k,[]]));
  for(const x of ds.rows.filter(x=>x.st.inBox)){const c=C.card(x.r.cardId);if(!c)continue;groups.get(d.commanders.includes(x.r.cardId)?'Commander':ORDER.find(k=>k!=='Commander'&&k!=='Other'&&c.typeLine.includes(k))||'Other').push(x);}
  const part=(title,list,why)=>list.length?`<h3 class="cm-deck-part">${e(title)} <small>${list.reduce((n,x)=>n+(x.r.quantity||1),0)}</small>${why?` <span class="cm-muted cm-deck-part-why">${e(why)}</span>`:''}</h3><ul class="cm-deck-list">${list.sort(byMana).map(line).join('')}</ul>`:'';
  const loading=ds.rows.filter(x=>(x.st.use==='final'||x.st.use==='substitute')&&!x.st.inBox),reserved=ds.rows.filter(x=>x.st.use==='reserved'),upgrades=ds.rows.filter(x=>x.st.use==='upgrade');
  const composition=compositionHTML(cards,curve,max,types);
  /* PLAY, AND WHY (Rob, 2026-10-18): Playable when the box holds the list -- Final and Substitute together -- Loading
     when owned cards cover the rest and only have to be put in, To load when a seat waits on a card not in hand. */
  /* A box that holds a whole hundred is Boxed (Rob, 2026-10-22); Playable is what Play can play (the line above it). */
  const n=v=>v.toLocaleString('en-US'),word=k=>({playable:'Boxed',loading:'Loading',toload:'To load'})[k];
  const why=ds.play==='playable'?`the box holds ${n(ds.deckTotal)}: Final ${n(ds.final)} + Substitute ${n(ds.substitute)}`
    :precon&&ds.reserved.buy?`buy the precon for the ${n(ds.reserved.buy)} card${ds.reserved.buy===1?'':'s'} you do not own`
    :!ds.locked?'the list is not locked yet'
    :ds.play==='loading'?`${n(ds.loading)} owned card${ds.loading===1?'':'s'} to put in the box`
    :`${n(Math.max(0,ds.list-ds.deckTotal-ds.loading))} seat${ds.list-ds.deckTotal-ds.loading===1?'':'s'} wait${ds.list-ds.deckTotal-ds.loading===1?'s':''} on a card you don't have`;
  const extra=[ds.reserved.total?`${n(ds.reserved.total)} Reserved`:'',ds.upgrade?`${n(ds.upgrade)} Upgrade${ds.upgrade===1?'':'s'}`:'',ds.complete?'complete':''].filter(Boolean).join(' · ');
  const playLine=`<p class="cm-deck-playable ${ds.play==='playable'?'is-playable':'is-short'}" data-play="${ds.play}"><b>${word(ds.play)}</b>: ${e(why)}${extra?` · ${e(extra)}`:''}</p>`;
  return `<section class="v-panel cm-deck-cards" id="cm-sec-cards"><div class="cm-deck-cards-head"><h2>The hundred <span class="cm-pull-n" title="Deck total: Final and Substitute in the box">${ds.deckTotal}</span></h2><div class="cm-actions">${b('View deck cards','deck-cards',{deck:d.id},true)}${b('Export deck list','deck-export',{deck:d.id})}${precon?buyPrecon(precon):''}</div></div>${playLine}${cards.length?'':'<p class="cm-muted">No cards yet. Edit the card list, or build one in the Deck Lab.</p>'}${composition}`
    +`${ds.deckTotal?`<h3 class="cm-deck-part">In the deck <small>${n(ds.deckTotal)}</small></h3>`:''}${[...groups].filter(([,l])=>l.length).map(([k,l])=>`<h4>${e(k)} <small>${l.reduce((m,x)=>m+(x.r.quantity||1),0)}</small></h4><ul class="cm-deck-list">${l.sort(byMana).map(line).join('')}</ul>`).join('')}`
    +part('Loading',loading,'owned, not in the box yet: the deck’s own cards and the stand-ins chosen for its seats')+part('Reserved',reserved,'committed to take a seat')+part('Upgrades',upgrades,'being considered')+`</section>`;
}
actions['deck-tab']=el=>go('decks',{deck:el.dataset.deck,tab:el.dataset.tab==='overview'?'':el.dataset.tab});
/* THE UPGRADE PATH HAS A HOME. The ceiling cards used to interleave the Collection as
   Suggestion rows, with no replaces, no tier, no price and no reason. This panel is the
   deck's linked options as the list Rob wrote them: what comes in, what it replaces, the
   tier, the sheet price, why -- and Promote, which is acceptOption: the main slot takes the
   new card, the old copy is released to another need or the bench, and the new card is a
   To buy row at its sheet price. Game Changers wear a chip and are counted against the
   bracket's limit of two in the header; promoting a third asks first. */
const GC_LIMIT=R.GC_LIMIT;
let upFilter={tuned:false,cheap:false};
const cheapLine=d=>Number.isFinite(d.definition?.upgradeLine)?d.definition.upgradeLine:R.UPGRADE_CHEAP_LINE;   // a deck may set its own line in its definition; the house line otherwise
const gcCount=d=>d.slots.filter(r=>r.purpose==='main'&&C.card(r.cardId)&&C.card(r.cardId).gameChanger).reduce((n,r)=>n+r.quantity,0);
function upgradesHTML(d){
  const all=d.slots.filter(r=>r.purpose==='upgrade'),line=cheapLine(d),gc=gcCount(d);
  /* The sheet price where the catalog has one; the price the upgrade was written with otherwise. */
  const priceOf=r=>{const c=C.card(r.cardId);return Number.isFinite(c.price)?c.price:Number.isFinite(r.price)?r.price:null;};
  const rows=all.filter(r=>(!upFilter.tuned||r.tier===1)&&(!upFilter.cheap||(priceOf(r)!==null&&priceOf(r)<=line))).sort((a,b)=>(a.tier||9)-(b.tier||9)||((priceOf(a)||0)-(priceOf(b)||0)));
  const toMax=all.reduce((n,r)=>n+(priceOf(r)>0?priceOf(r)*r.quantity:0),0);
  const head=`<h2>Upgrade Path <span class="cm-pull-n">${all.length}</span> <span class="cm-muted cm-up-max">${C.money(Math.round(toMax*100)/100)} to Max</span> ${C.pill(`GC ${gc} / ${GC_LIMIT}`,gc>GC_LIMIT?'remove':'watch','title="Game Changers in the main list against the bracket limit"')}</h2>`;
  if(!all.length)return `<section class="v-panel cm-upgrades" id="cm-sec-upgrades">${head}<p class="cm-muted">No linked upgrades yet. Open a card’s Replacements &amp; options from the deck’s list, or load them with the live file.</p></section>`;
  return `<section class="v-panel cm-upgrades" id="cm-sec-upgrades">${head}<div class="cm-actions cm-up-filters"><label class="cm-checkbox"><input type="checkbox" data-up-filter="tuned"${upFilter.tuned?' checked':''}>Tuned only</label><label class="cm-checkbox"><input type="checkbox" data-up-filter="cheap"${upFilter.cheap?' checked':''}>Under ${C.money(line)}</label><span class="cm-muted">${rows.length} of ${all.length}</span></div><div class="cm-table-wrap"><table class="cm-table cm-up-table"><thead><tr><th scope="col">Add</th><th scope="col">Replaces</th><th scope="col">Tier</th><th scope="col">Price</th><th scope="col">Why</th><th scope="col">Promote</th><th scope="col">Decline</th></tr></thead><tbody>${rows.map(r=>{const c=C.card(r.cardId),out=C.card(M.slot(C.state,d.id,r.replaces).cardId);return `<tr><td><button type="button" class="cm-card-name" data-action="card" data-card="${e(c.id)}">${e(c.name)}</button>${c.gameChanger?' '+C.pill('GC','remove','title="Game Changer"'):''}</td><td>${e(out.name)}</td><td>${r.tier?`T${r.tier}`:'—'}</td><td class="cm-price">${C.money(priceOf(r))}</td><td class="cm-up-why">${e(r.why||r.notes||'')}</td><td>${b('Promote','promote-option',{deck:d.id,slot:r.id},false,{cls:'compact'})}</td><td>${b('Decline','decline-option',{deck:d.id,slot:r.id},false,{cls:'compact cm-up-decline'})}</td></tr>`;}).join('')||`<tr><td colspan="7">Nothing matches these filters.</td></tr>`}</tbody></table></div></section>`;}
actions['promote-option']=el=>{const d=M.deck(C.state,el.dataset.deck),r=M.slot(C.state,d.id,el.dataset.slot),c=C.card(r.cardId),out=C.card(M.slot(C.state,d.id,r.replaces).cardId);
  const gc=gcCount(d),willExceed=c.gameChanger&&!out.gameChanger&&gc+1>GC_LIMIT;
  /* THE TWO VENDORS, ON THE SCREEN THAT DECIDES THE BUY (Rob, 15 September). Promoting puts this
     card on the buy list, so the receipt is the moment the price is worth checking against a real
     shop -- not one price the app cached, and not one shop. */
  const shop=`<p class="cm-up-buy">Check the price: <a class="cm-text-button" href="${e(C.buyLink(c))}" target="_blank" rel="noopener">${e(c.name)} on TCGplayer ↗</a> <a class="cm-text-button" href="${e(C.kingdomLink(c))}" target="_blank" rel="noopener">on Card Kingdom ↗</a></p>`;
  C.review(`Promote ${c.name}`,C.compareCards(out,c,{outLabel:'Out of the deck',intoLabel:'Into the deck'})+note(`${c.name} takes the slot; ${out.name}’s copy is released to another need or the bench. ${c.name} joins the buy list at ${C.money(Number.isFinite(c.price)?c.price:r.price)} until a copy is recorded.`)+shop+(willExceed?note(`This is a Game Changer, and the list already carries ${gc} of the ${GC_LIMIT} the bracket allows. Promote it and the deck reads bracket 4.`,true):''),{type:'acceptOption',deckId:d.id,slotId:r.id});};
/* DECLINE IS THE OTHER HALF OF THE LIST (Rob, 15 September). An upgrade you have looked at and
   ruled out should leave, or the list is a pile of things you keep re-reading. It removes the
   option and nothing else: the main slot is untouched, and any copy you own of the declined card
   stays owned. It asks first, because the row carries the reason it was written with. */
actions['decline-option']=el=>{const d=M.deck(C.state,el.dataset.deck),r=M.slot(C.state,d.id,el.dataset.slot),c=C.card(r.cardId),out=C.card(M.slot(C.state,d.id,r.replaces).cardId);
  C.review(`Decline ${c.name}`,note(`${c.name} leaves the Upgrade Path. ${out.name} keeps the slot, nothing is bought, and a copy of ${c.name} you already own stays owned. Add it again from ${out.name}’s Replacements & options.`),{type:'removeOption',deckId:d.id,slotId:r.id});};
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
    label=note(report?'Generated from this list and its measurement. It names only cards in the deck and claims nothing it did not count; the measured line is Measure\u2019s, the rest is arithmetic.':'Generated from this list. Measure the deck in the Deck Lab and the measured line joins it. It names only cards in the deck and claims nothing it did not count.');
  }
  return label+`<p class="cm-guide-meta">${g.archetype?`<span class="cm-badge">${e(g.archetype)}</span>`:''}${g.difficulty?`<span class="cm-badge ${g.difficulty.tier==='Advanced'?'warn':g.difficulty.tier==='Beginner'?'good':''}">${e(g.difficulty.tier)}</span><span class="cm-muted">${e(g.difficulty.why)}</span>`:''}</p><p class="cm-guide-hook">${e(g.hook)}</p>${g.whatItDoes?`<h3>What it does</h3><p>${e(g.whatItDoes)}</p>`:''}<h3>How it wins</h3><p>${e(g.howItWins)}</p>${(g.turns||[]).map(t=>`<h3>${e(t.when)}</h3><p>${e(t.do)}</p>`).join('')}<h3>Mulligan</h3><p>${e(g.mulligan)}</p>${g.keyCards?.length?`<h3>Key cards</h3><ul class="cm-guide-keys">${g.keyCards.map(k=>`<li><button type="button" class="cm-card-name" data-action="card" data-card="${e(CrankCatalog.key(k.name))}">${e(k.name)}</button> — ${e(k.why)}</li>`).join('')}</ul>`:''}${g.watchFor?.length?`<h3>Watch for</h3><ul class="cm-guide-watch">${g.watchFor.map(x=>`<li>${e(x)}</li>`).join('')}</ul>`:''}`;
}
function commanderUse(c){const o=c.oracleText||'';if(/create/i.test(o)&&/goblin/i.test(o)&&/number of goblins/i.test(o))return 'Establish a Goblin board before tapping Krenko. More Goblins increase the number created by each activation; account for summoning sickness and protect the engine.';if(/token/i.test(o))return 'Set up the resources and timing this commander’s abilities require. Use the resulting tokens to support your deck’s plan, and leave the mana needed for its activated abilities.';if(/draw/i.test(o))return 'Sequence the plays that satisfy this commander’s draw ability, then use the extra cards to keep your plan moving. Keep interaction available when committing the commander.';return 'Build around the abilities shown here. Meet their trigger conditions or activation costs, time the commander around your available mana, and protect it when your next plays depend on it.';}
function structural(d,cards){const count=re=>cards.filter(x=>re.test(x.c.oracleText||'')).reduce((n,x)=>n+x.q,0),draw=count(/draw .*card/i),interaction=count(/destroy|exile target|counter target/i),lands=cards.filter(x=>/Land/.test(x.c.typeLine)).reduce((n,x)=>n+x.q,0);return {Strengths:`${draw} cards mention drawing cards; ${interaction} mention removal or countering. These are text matches, not modeled availability.`,Weaknesses:`${lands} lands in the list. Check opening-hand reliability and access to every commander color.`,Opportunities:`Explore ${mechanicsOf(d).list.join(', ')||'your commander’s core mechanics'} and compare role-compatible options while preserving the deck’s definition.`,Threats:'Opposing disruption, resource denial and faster win conditions need four-player testing. No matchup probability is asserted here.'};}
actions.deck=el=>go('decks',{deck:el.dataset.deck});actions['deck-cards']=el=>go('cards',{deck:el.dataset.deck});actions['deck-group']=el=>go('cards',{group:el.dataset.group});actions['open-lab']=()=>go('lab');
/* A DECK FROM A GROUP'S CARDS, after an import: the group names its own commander -- the one Commander-legal card in
   it -- and the deck is created attached to that group. Starting from a commander is Start from (crankmagic-newdeck.js). */
const groupRows=g=>g.entries.length?g.entries.map(r=>({cardId:r.cardId,quantity:r.quantity,printing:r.printing})):C.state.lots.filter(l=>l.groupIds.includes(g.id)).map(l=>({cardId:l.cardId,quantity:l.quantity,printing:l.printing}));
C.groupDeck=gid=>groupDeck(gid);
function groupDeck(groupId){
  const g=C.state.groups.find(x=>x.id===groupId);
  if(!g)throw Error('Choose a collection group.');
  const rows=groupRows(g);
  if(!rows.length)throw Error(`${g.name} holds no cards yet, so there is nothing to start a deck from. Import a list into it, or start from a commander.`);
  const leaders=rows.map(r=>C.card(r.cardId)).filter(c=>c&&c.commander&&c.legalities?.commander==='legal');
  if(!leaders.length)throw Error(`${g.name} holds no Commander-legal creature, so there is nothing to lead the deck. Add one, or start from a commander instead.`);
  /* THE COPIES COME TOO, IF YOU SAY SO (Rob, 2026-09-28). He loaded 85 cards he owns into a group for a Quintorius deck,
     made the deck from the group, and found them still on the Bench: the deck copied the list and moved nothing. The
     copies on the Bench filed in this group can go straight into the new deck's box; a copy already in another deck, reserved for one, or offered for trade stays where it is. */
  const bench=C.state.lots.filter(l=>l.source==='owned'&&(l.groupIds||[]).includes(g.id)&&l.location?.kind==='bench'&&!l.allocation&&l.offer==='none'),copies=bench.reduce((n,l)=>n+l.quantity,0);
  return form(`New deck from ${g.name}`,f('Deck name','name',leaders[0].name+' deck','required maxlength="160"')+s('Commander','commanderId',leaders.map(c=>[c.id,c.name]),leaders[0].id)+note(`This makes a new draft deck whose list is the ${rows.reduce((n,r)=>n+r.quantity,0)} cards in ${g.name}, and the deck stays linked to ${g.name}.`)+(copies?`<label class="cm-checkbox cm-full"><input type="checkbox" name="move" checked> Put the ${copies} cop${copies===1?'y':'ies'} you own from ${e(g.name)} (now on the Bench) in the deck's box</label>`:''),
    async data=>{const id='deck:'+C.uid();
      const fromPrecon=pendingPrecon&&pendingPrecon.name===g.name?pendingPrecon:null;pendingPrecon=null;
      const play=fromPrecon?.play;   /* the library keeps a precon's id, name and set alone (collection-model.js) */
      await commit({type:'createDeck',deckId:id,name:data.name,commanders:[data.commanderId],groupId:g.id,...(fromPrecon?{precon:fromPrecon}:{}),
        slots:rows.some(r=>r.cardId===data.commanderId)?rows:[{cardId:data.commanderId,quantity:1},...rows]});
      if(data.move&&bench.length)await commit({type:'bulk',op:'place',deckId:id,lotIds:bench.map(l=>l.id),asStandIn:true});
      if(play&&C.play?.open())go('table',{deck:id});else go('decks',{deck:id});},'Create draft');
}
/* NOTHING HERE IS A QUESTION YOU HAVE TO ANSWER. Both selects open on the answer most
   people want -- a commander, and a fresh group made with the deck -- so Continue works
   without touching either. The group select had no such default: it opened on whichever
   group happened to sort first and read as a demand to pick one. Its first option is now
   the thing that already happens when you say nothing. */
/* THE FOUR ROADS, AND THE ONE THAT USED TO BE A WALL (Rob, 16 September). Two selects make
   four combinations, and one of them -- the cards in a collection group, group not made yet --
   answered Continue with a refusal: a new group is empty, and an empty group has no cards to
   start a deck from. True, and useless. That combination now opens the app's own import, where
   you upload a file or paste a list; the cards land in the new group and the deck is built from
   them without a second trip. The line under the selects names the road each pair takes before
   you press anything, so no combination has to be tried to find out what it does. */
/* UNIFIED NEW DECK WIZARD (Phase 1 PR3). One entry from Decks with three peer paths: Create, Import, Lab. */
/* SAVE TO DECKS promotes a lobby deck to an ordinary one (UAT M-15): it appears in the tiles, the sidebar, the compare list, the Lab and the library like any other. */
actions['promote-lobby-deck']=async el=>{const d=M.deck(C.state,el.dataset.deck);await commit({type:'editDeck',deckId:d.id,kind:'deck'});C.notice(`${d.name} is in Decks now.`);};
actions['new-deck']=()=>{
  modal('New deck',`<div class="cm-new-deck-wizard"><p class="cm-muted">Choose how you want to start your deck:</p>
    <div class="cm-wizard-paths">
      <button type="button" class="cm-wizard-path" data-action="start-from">
        <strong>Create</strong>
        <span>Start from a commander, then define the deck</span>
      </button>
      <button type="button" class="cm-wizard-path" data-action="wizard-import">
        <strong>Import</strong>
        <span>Upload or paste a decklist</span>
      </button>
      <button type="button" class="cm-wizard-path" data-action="import-archidekt">
        <strong>From a link</strong>
        <span>A public deck on Archidekt</span>
      </button>
      <button type="button" class="cm-wizard-path" data-action="start-precon">
        <strong>From a precon</strong>
        <span>One of Wizards' Commander decks</span>
      </button>
      <button type="button" class="cm-wizard-path" data-action="wizard-load">
        <strong>Load</strong>
        <span>Start from one of your own decks</span>
      </button>
    </div><div class="cm-actions">${b('Restore a backup','restore')}</div></div>`).classList.add('cm-new-deck-dialog');
};
/* LOAD PATH: start from one of Rob's own decks.
 *
 * Rob, 2026-09-24: "Create and Lab should be the same thing... that should be 'Load' which provides
 * the built-in options which are my decks." The Lab is still there -- it is a function inside a
 * deck (the Overview offers "Auto-build in Lab"), which is what he means by the two being the same
 * thing. It is just not one of three ways to START a deck, because it never was one.
 *
 * THE LABEL DROPS THE DECK NUMBER AND KEEPS THE ARCHETYPE. His decks are named "D5 Shadrix
 * Aristocrats", so the number is filing, not a name. Stripping it leaves the commander and the
 * archetype, and the commander's own first name is what separates them -- all seven parse:
 *   D1 Quintorius Spirits   -> Quintorius - Spirits
 *   D2 Chulane Value Loop   -> Chulane - Value Loop
 *   D7 Maralen Exile Cast   -> Maralen - Exile Cast
 * A deck that does not follow the pattern keeps its own name rather than being mangled into it. */
const deckNumberOff=name=>String(name||'').replace(/^D\d+\s+/,'');
function loadLabel(d){
  const bare=deckNumberOff(d.name),lead=commander(d).split(/[,\s]/)[0];
  if(lead&&bare.toLowerCase().startsWith(lead.toLowerCase())){
    const rest=bare.slice(lead.length).trim();
    if(rest)return `${lead} - ${rest}`;
  }
  return bare||d.name;
}
/* MOVING DECKS BETWEEN BROWSERS. Rob, 2026-09-24: "I should have a fast way of exporting my decks
 * from CrankMagic, then using the import function to load them and then the 'Load' screen to
 * choose one."
 *
 * The library is IndexedDB, which is per ORIGIN: the local host serves the app from
 * 127.0.0.1:8768 and the cloud copy from github.io, and those are two different stores. Decks
 * built in one are simply not present in the other, which is the likeliest reason Load opened
 * empty on a machine that plainly has seven decks. A file is the way across.
 *
 * The file carries the decks AND the card records they name, because an import on the other side
 * has to resolve every cardId without going to the network to do it. */
const DECK_FILE='CrankMagicDecks@1';
actions['export-decks']=()=>{
  const mine=C.state.decks.filter(d=>!d.archived&&!M.isLobbyDeck(d));
  if(!mine.length)return C.notice('There are no decks here to export.',true);
  const ids=new Set();
  for(const d of mine){for(const id of d.commanders||[])ids.add(id);for(const r of d.slots||[])ids.add(r.cardId);}
  const cards=[...ids].map(id=>C.card(id)).filter(Boolean);
  /* M.today(), not toISOString(): a file named from UTC is dated yesterday for half the evening,
     and tests/feature-wiring.mjs holds the whole app to local dates for exactly that reason. */
  C.download(`CrankMagic-decks-${M.today()}.json`,
    JSON.stringify({schema:DECK_FILE,exportedAt:new Date().toISOString(),decks:mine,cards},null,1));
  C.notice(`${mine.length} deck${mine.length===1?'':'s'} exported with ${cards.length} card records. Import the file in another browser, then open New deck · Load.`);
};
actions['import-decks']=()=>{
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    try{
      const parsed=JSON.parse(await file.text());
      if(parsed.schema!==DECK_FILE)throw Error(`That file is not a CrankMagic deck export. Expected ${DECK_FILE} and found ${parsed.schema||'no schema'}.`);
      const decks=Array.isArray(parsed.decks)?parsed.decks:[];
      if(!decks.length)throw Error('That export holds no decks.');
      const have=new Set(C.state.decks.map(d=>d.id));
      let added=0;
      for(const d of decks){
        /* A deck already here is left alone rather than duplicated -- importing the same file
           twice should not double the shelf. */
        if(have.has(d.id))continue;
        await commit({type:'createDeck',deckId:d.id,name:d.name,commanders:[...(d.commanders||[])],
          cards:(parsed.cards||[]).filter(c=>(d.commanders||[]).includes(c.id)||(d.slots||[]).some(r=>r.cardId===c.id)),
          slots:(d.slots||[]).map(r=>({cardId:r.cardId,quantity:r.quantity,...(r.purpose?{purpose:r.purpose}:{})})),
          definition:{...(d.definition||{})}});
        added+=1;
      }
      C.notice(added?`${added} deck${added===1?'':'s'} imported. Open New deck · Load to start from one.`
        :'Every deck in that file is already here.');
      actions['wizard-load']();
    }catch(error){C.notice(error.message,true);}
  },{once:true});
  input.click();
};
actions['wizard-load']=()=>{
  const mine=C.state.decks.filter(d=>!d.archived&&!M.isLobbyDeck(d));
  if(!mine.length)return modal('Load a deck',`<div class="cm-new-deck-wizard">
    ${note('This browser has no decks to start from. A library lives in the browser that made it, and the local host and the cloud copy are different browsers as far as storage is concerned — decks built in one are not in the other.',true)}
    <p class="cm-muted">Export them from the browser that has them, then bring the file here.</p>
    <div class="cm-actions">${b('Import a deck file','import-decks',{},true)}${b('Create one instead','start-from')}</div></div>`,()=>actions['new-deck']());
  const d0=modal('Load a deck',`<div class="cm-load-wizard">
    <div class="cm-load-list" role="listbox" aria-label="Your decks">${mine.map((d,i)=>
      `<button type="button" class="cm-load-item${i?'':' is-on'}" role="option" aria-selected="${i?'false':'true'}" data-action="load-pick" data-deck="${e(d.id)}">${e(loadLabel(d))}</button>`).join('')}</div>
    <div class="cm-load-detail" id="cm-load-detail"></div>
    <p class="cm-load-foot cm-muted">Decks live in the browser that made them. ${b('Export these decks','export-decks',{},false,{cls:'compact'})} ${b('Import a deck file','import-decks',{},false,{cls:'compact'})}</p>
  </div>`,()=>actions['new-deck']());
  /* Clicking the backdrop closes it. Rob asked for "click anywhere outside of the ... pane to
     close"; a <dialog> does not do that on its own, and this is scoped to this dialog rather than
     changed for every dialog in the app. */
  d0.addEventListener('click',ev=>{if(ev.target===d0)actions.close();});
  loadDetail(mine[0].id);
};
actions['load-pick']=el=>{
  for(const b of document.querySelectorAll('.cm-load-item')){
    const on=b===el;b.classList.toggle('is-on',on);b.setAttribute('aria-selected',String(on));
  }
  loadDetail(el.dataset.deck);
};
/* The right-hand pane: the commander, then what the deck is made of, then every card in it. The
   curve and the type counts are compositionHTML -- the same drawing the deck page uses, so a deck
   reads the same here as it does when it is open. */
function loadDetail(deckId){
  const host=document.getElementById('cm-load-detail');if(!host)return;
  const d=M.deck(C.state,deckId);
  const rows=(d.slots||[]).filter(r=>r.purpose!=='sideboard').map(r=>({c:C.card(r.cardId),q:r.quantity})).filter(x=>x.c);
  const types=['Land','Creature','Artifact','Enchantment','Instant','Sorcery','Planeswalker'];
  const curve=Array(8).fill(0);
  for(const {c,q} of rows)if(!/Land/.test(c.typeLine))curve[Math.min(7,Number(c.manaValue)||0)]+=q;
  const max=Math.max(1,...curve);
  const spells=rows.filter(x=>!/Land/.test(x.c.typeLine));
  const copies=spells.reduce((n,x)=>n+x.q,0);
  const avg=copies?(spells.reduce((n,x)=>n+(Number(x.c.manaValue)||0)*x.q,0)/copies):0;
  const face=C.card(d.commanders[0]);
  host.innerHTML=`<div class="cm-load-head">
      <div><h3>${e(loadLabel(d))}</h3><p class="cm-muted">${e(commander(d))}</p></div>
      <button type="button" class="v-button primary" data-action="load-choose" data-deck="${e(d.id)}">Choose this Deck</button>
    </div>
    ${face?.image?`<img class="cm-load-art" src="${e(face.image)}" alt="${e(face.name)}" loading="lazy">`:''}
    ${compositionHTML(rows,curve,max,types)}
    <p class="cm-load-avg">Average mana value <strong>${avg?avg.toFixed(2):'-'}</strong> <span class="cm-muted">across ${copies} nonland card${copies===1?'':'s'}</span></p>
    <div class="cm-load-cards">${rows.slice().sort((a,b)=>a.c.name.localeCompare(b.c.name)).map(x=>
      `<button type="button" class="cm-load-card" data-card-image="${e(x.c.image||'')}" data-card-name="${e(x.c.name)}"><span>${e(x.c.name)}</span><b>${x.q}</b></button>`).join('')}</div>
    <div class="cm-load-preview" hidden aria-hidden="true"></div>`;
  /* HOVER SHOWS THE CARD, and it stays until the cursor leaves or the list scrolls -- a preview
     that outlived a scroll would float over a row it no longer describes. */
  const preview=host.querySelector('.cm-load-preview'),list=host.querySelector('.cm-load-cards');
  const hide=()=>{preview.hidden=true;};
  list.addEventListener('mouseover',ev=>{
    const b=ev.target.closest('.cm-load-card');if(!b||!b.dataset.cardImage)return hide();
    preview.innerHTML=`<img src="${e(b.dataset.cardImage)}" alt="${e(b.dataset.cardName)}">`;
    preview.hidden=false;
  });
  list.addEventListener('mouseleave',hide);
  list.addEventListener('scroll',hide);
}
actions['load-choose']=async el=>{
  const source=M.deck(C.state,el.dataset.deck),id='deck:'+C.uid();
  actions.close();
  await commit({type:'createDeck',deckId:id,name:`${deckNumberOff(source.name)} copy`,
    commanders:[...source.commanders],
    cards:(source.slots||[]).map(r=>C.card(r.cardId)).filter(Boolean),
    slots:(source.slots||[]).map(r=>({cardId:r.cardId,quantity:r.quantity,...(r.purpose?{purpose:r.purpose}:{})})),
    definition:{...source.definition}});
  go('decks',{deck:id});
};

/* CREATE PATH: commander picker and manual building */
/* THE OLD CREATE POP-UP IS GONE (the Decks requirements' NEW-2, 2026-10-23): Create opens Start from (crankmagic-newdeck.js),
   and its road from a collection group's cards is Define the Deck's Merge in a Group (NEW-3, CRD-3). */
/* After a list is imported for a new deck: the deck, when the list names a commander to lead it. */
function deckFromImport(gid){
  const g=C.state.groups.find(x=>x.id===gid);
  if(g&&groupRows(g).length)return groupDeck(gid);
  C.notice('Import completed. Create a deck from the imported cards in the Cards page.');
}
/* The landing page's Step one (R3.8) starts a deck the two ways the wizard does: from a commander, with the name
   typed there already searched, or from a pasted list or a file, read by the app's own import. */
/* A DECK BY ITS LINK (R3.10a): the deck comes through the app's own importer (cloud/import.mjs) and becomes a list,
   commander first, in the same import the paste path opens, so it is read against the catalog and reviewed before
   anything is saved. A Moxfield or Deckstats link, or an importer out of reach, is answered with the paste path. */
function listOf(deck){const lead=new Set(deck.commander||[]);const rows=[...deck.cards].sort((a,b)=>(lead.has(b.name)?1:0)-(lead.has(a.name)?1:0));return rows.map(r=>`${r.quantity} ${r.name}`).join('\n');}
async function deckFromLink(url){
  const S=globalThis.MtgDeckSources;
  if(!S)throw Error('The deck-link reader is not loaded. Reload the page, or paste the list instead.');
  const out=await S.load(String(url||'').trim());
  if(out.error)throw Error(out.advice?`${out.error} ${out.advice}`:out.error);
  const warn=(out.deck.warnings||[]).join(' ');
  if(warn)C.notice(`${out.deck.name}: ${warn}`);
  return C.importList({name:out.deck.name||'New deck list',text:listOf(out.deck),after:deckFromImport});
}
C.startDeck={commander:query=>C.build.start(String(query||'').trim()),list:(text='')=>C.importList({name:'New deck list',text,after:deckFromImport}),link:deckFromLink,
  /* True for a link to a deck site the app knows: Step one sends it here rather than searching for it as a name. */
  isLink:text=>!!(globalThis.MtgDeckSources&&MtgDeckSources.identify(String(text||'').trim()))};
/* START FROM A PRECON (R3.10b): every Commander precon Wizards has published (data/precons.json, from MTGJSON by
   tools/build-precons.mjs), fetched only when the picker opens. A choice becomes a list, commander first, in the same
   import the paste path opens, so it is read against the catalog and reviewed before anything is saved. */
let preconCache=null,pendingPrecon=null;   /* the precon a precon start is importing, for the deck it makes */
async function precons(){
  if(preconCache)return preconCache;
  const A=globalThis.CrankAssets,r=await fetch(A.precons).catch(()=>null);
  if(!r||!r.ok)throw Error('The list of precons could not be loaded. Check the connection and try again, or paste a list instead.');
  return preconCache=A.expect(await r.json(),'precons');
}
const usDate=d=>new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const preconText=p=>p.commander.map(c=>`1 ${c.name}`).concat(p.cards.map(([n,q])=>`${q} ${n}`)).join('\n');
/* NEW FROM WIZARDS (Rob, 2026-09-30: the Reality Fracture precons, to add from the home screen). The newest release's
   decks alone come from data/precons-latest.json, a few kilobytes, and are drawn into a slot on the Decks hub and the
   landing page; a click starts one exactly as the picker does, fetching the full list only then. Nothing waits on
   it: the slot stays hidden until the file has arrived, and stays hidden if it never does. */
/* NO FLICKER ON A REDRAW (Rob, 2026-10-25: "an odd screen flicker every time I click a button on the Decks screen").
   Every save redraws the page, and some of it arrives late: on the hub this section, each tile's line from the table
   and the summary's playable count; on a deck's page its line from the table. Drawn empty each time, the page lost
   them for a moment (the section's height and a line on every tile) and the tiles below jumped. The file for this
   section is now fetched once, so a redraw fills it before the page is painted; each line from the table is drawn as
   it last read, and the late answer only corrects it. */
let latestOnce=null;
const playSeen={lines:new Map(),count:null,of:null,deck:new Map()};
const seenOf=(map,id)=>C.play?.open()?map.get(id):null;
const deckPlayLine=id=>{const s=seenOf(playSeen.deck,id);return `<p class="cm-deck-play${s&&s.ok?' is-playable':''}" id="cm-deck-play" data-deck="${e(id)}"${s?' data-play-seen':' hidden'}>${s?s.html:''}</p>`;};
const playLine=id=>{const s=seenOf(playSeen.lines,id);return `<span class="cm-tile-play${s&&s.ok?' is-playable':''}" data-play-for="${e(id)}"${s?' data-play-seen':' hidden'}>${s?e(s.text):''}</span>`;};
/* A line drawn as it last read waits for the table's answer to write it again. The answer writes only the decks it can
   check, and none if it fails, so a line it did not write by the time it finishes is put away and forgotten: a deck
   that lost its commander never keeps "Playable at the table". */
const confirmLate=(els,run)=>{
  const mark=els.filter(el=>el.hasAttribute('data-play-seen'));
  const seen=rs=>{for(const r of rs){const el=(r.target.nodeType===1?r.target:r.target.parentElement)?.closest('[data-play-seen]');el?.removeAttribute('data-play-seen');}};
  const mo=new MutationObserver(seen);for(const el of mark)mo.observe(el,{childList:true,characterData:true,subtree:true});
  return Promise.resolve(run()).finally(()=>{seen(mo.takeRecords());mo.disconnect();
    for(const el of mark)if(el.hasAttribute('data-play-seen')){el.removeAttribute('data-play-seen');el.hidden=true;el.textContent='';el.classList.remove('is-playable');}});
};
async function latestPrecons(){
  const A=globalThis.CrankAssets,r=await fetch(A.preconsLatest).catch(()=>null);
  if(!r||!r.ok)return null;
  return A.expect(await r.json(),'preconsLatest');
}
/* NEW FROM WIZARDS: each chip names its (first) commander, so the card shows under the pointer as a Library name's does (Rob, 2026-09-30). */
C.preconLatest=async id=>{
  const data=await (latestOnce||=latestPrecons().catch(()=>null).then(d=>{if(!d)latestOnce=null;return d;})),el=document.getElementById(id);
  if(!el||!data||!data.decks.length)return;
  const today=M.today(),sets=[...new Set(data.decks.map(p=>p.setName))].join(' · ');
  const html=`<div class="cm-precon-latest-head"><h2>New from Wizards</h2><span class="cm-muted">${e(sets)} · ${data.releaseDate>today?'Releases ':''}${e(usDate(data.releaseDate))}</span></div>
    <ul>${data.decks.map(p=>`<li><button type="button" class="cm-precon-chip" data-action="precon-start" data-precon="${e(p.id)}" data-card="${e(p.commander[0].name)}" title="Start from ${e(p.name)}"><strong>${e(p.name)}</strong><span><em class="cm-precon-lead">${e(p.commander.map(c=>c.name).join(' + '))}</em>${C.colors([...new Set(p.commander.flatMap(c=>c.colorIdentity))])}</span></button>${C.play?.open()?`<button type="button" class="cm-text-button cm-precon-play" data-action="precon-play" data-precon="${e(p.id)}" aria-label="Play ${e(p.name)}: make it a deck, then a table">Play it</button>`:''}</li>`).join('')}</ul>`;
  el.innerHTML=html;
  el.hidden=false;
};
async function preconPicker(){
  const data=await precons(),today=M.today();  /* the reader's own calendar date: a deck out today is out */
  const d=modal('Start from a precon',`<label>Search<input id="cm-precon-q" type="search" placeholder="A deck, a commander or a set code" autocomplete="off"></label><p class="cm-muted" id="cm-precon-n" aria-live="polite"></p><ul class="cm-precon-list" id="cm-precon-list"></ul>`);
  const q=d.querySelector('#cm-precon-q'),list=d.querySelector('#cm-precon-list'),n=d.querySelector('#cm-precon-n');
  const draw=()=>{
    const t=q.value.trim().toLowerCase(),hits=data.decks.filter(p=>!t||[p.name,p.code,...p.commander.map(c=>c.name)].some(x=>x.toLowerCase().includes(t)));
    n.textContent=`${hits.length.toLocaleString('en-US')} of ${data.decks.length.toLocaleString('en-US')} Commander precons, newest first`;
    list.innerHTML=hits.slice(0,60).map(p=>`<li><button type="button" class="cm-precon" data-action="precon-start" data-precon="${e(p.id)}"><strong>${e(p.name)}</strong><span class="cm-precon-lead">${e(p.commander.map(c=>c.name).join(' + '))}${C.colors([...new Set(p.commander.flatMap(c=>c.colorIdentity))])}</span><span class="cm-muted">${e(p.code)} · ${p.releaseDate>today?'Releases ':''}${e(usDate(p.releaseDate))}</span></button></li>`).join('')
      +(hits.length>60?`<li class="cm-muted">${(hits.length-60).toLocaleString('en-US')} more: narrow the search.</li>`:'')+(hits.length?'':'<li class="cm-muted">No precon matches that. Try a commander\'s name or a set code.</li>');
  };
  q.addEventListener('input',draw);draw();q.focus();
}
actions['start-precon']=()=>{actions.close();return preconPicker();};
/* NEW FROM WIZARDS' PLAY IT (AI-5): the same start, and once the deck is made, a new table with it at your seat in
   place of the deck's page (crankmagic-table.js, Play this deck). */
const startPrecon=async(el,play)=>{
  const p=(await precons()).decks.find(x=>x.id===el.dataset.precon);
  if(!p)throw Error('That precon is not in the list any more. Reload the page.');
  actions.close();
  pendingPrecon={id:p.id,name:p.name,setName:p.setName||'',...(play?{play:true}:{})};
  C.importList({name:p.name,text:preconText(p),after:deckFromImport});
  /* A card banned since it was printed, or one too new for the card list, is said before the review shows it. */
  if(p.notInUniverse)C.notice(`${p.name}: ${p.notInUniverse.length} of its cards ${p.notInUniverse.length===1?'is':'are'} not in the Commander card list today (${p.notInUniverse.slice(0,3).join(', ')}${p.notInUniverse.length>3?', …':''}): banned since it was printed, or too new. The review shows ${p.notInUniverse.length===1?'it':'them'}.`);
};
actions['precon-start']=el=>startPrecon(el,false);
actions['precon-play']=el=>startPrecon(el,true);
C.startDeck.precon=preconPicker;
actions['import-archidekt']=()=>{actions.close();return form('Import from Archidekt',f('Deck link','url','','required maxlength="300" placeholder="archidekt.com/decks/123456" inputmode="url" autocomplete="off"')+note('A public deck. It comes in as a list you review before anything is saved, read against the card catalog. Private decks, and Moxfield or Deckstats links, cannot be read this way: export the list there and paste it.'),v=>deckFromLink(v.url),'Import deck');};
/* IMPORT PATH: file/paste import */
actions['wizard-import']=()=>{
  actions.close();   /* the dialog handle lives in crankmagic-app.js; close through the shared action (D1) */
  if(!C.importList)throw Error('The import module is not loaded. Reload the page.');
  C.importList({name:'New deck list',back:()=>actions['new-deck'](),after:deckFromImport});
};
/* LAB PATH: navigate to Lab for auto-build */
actions['wizard-lab']=()=>{
  actions.close();   /* the dialog handle lives in crankmagic-app.js; close through the shared action (D1) */
  go('lab');
};
actions['edit-deck']=el=>{const d=M.deck(C.state,el.dataset.deck);form('Deck Definition',f('Deck name','name',d.name,'required maxlength="160"')+f('Core mechanics (comma separated)','mechanics',d.definition.mechanics.join(', '),`placeholder="${e(mechanicsOf(d).derived?mechanicsOf(d).list.join(', '):'')}"`)+s('Base bracket','baseBracket',[1,2,3,4,5],d.definition.baseBracket)+s('Bracket ceiling','bracketCeiling',[1,2,3,4,5],d.definition.bracketCeiling)+f('Budget ($)','budget',d.definition.budget??'',`type="number" min="0" step="0.01" placeholder="None"`)+f('Per-card price cap ($)','perCardCap',d.definition.perCardCap??'',`type="number" min="0" step="0.01" placeholder="${C.RULES?C.RULES.perCardMax:30}"`)+s('Collection group this deck draws from','groupId',C.state.groups.map(g=>[g.id,g.name]),d.groupId||(C.state.groups[0]&&C.state.groups[0].id)||'')+`<label class="cm-full">Description<textarea name="description" maxlength="${M.DESCRIPTION_MAX}" rows="3">${e(d.description||'')}</textarea></label><label class="cm-full">How to play <span class="cm-muted">· ${M.STEPS_MIN} to ${M.STEPS_MAX} steps, one per line</span><textarea name="howToPlay" rows="6">${e((d.howToPlay||[]).join('\n'))}</textarea></label><label class="cm-full">Your notes<textarea name="notes">${e(d.notes)}</textarea></label>`,data=>commit({type:'editDeck',deckId:d.id,name:data.name,notes:data.notes,description:data.description,howToPlay:data.howToPlay.split('\n'),groupId:data.groupId||null,definition:{...d.definition,baseBracket:Number(data.baseBracket),bracketCeiling:Number(data.bracketCeiling),mechanics:data.mechanics.split(',').map(x=>x.trim()).filter(Boolean),/* A BLANK BUDGET IS NO BUDGET (Rob, 2026-10-18): a deck inherits neither the account's budget nor the pod's rule.
       A blank per-card cap still writes the house rule, which the form shows as its placeholder. */
      budget:data.budget===''?null:Number(data.budget),perCardCap:data.perCardCap===''?(C.RULES?C.RULES.perCardMax:null):Number(data.perCardCap)}}));};
/* ATTACHING AN EXISTING GROUP IS THE OTHER ROAD IN: you uploaded a sheet, the cards are in a
   group, and now you want a deck around them. So attaching offers to bring the group's cards
   across as the deck's list -- offered only where it cannot destroy anything, on a draft
   whose list is still empty or just its commander. Filing copies into the group by hand is
   gone: a copy reserved for the deck is in the deck's group by being reserved for the deck. */
actions['attach-group']=el=>{
  const d=M.deck(C.state,el.dataset.deck);
  if(!C.state.groups.length)throw Error('Create a collection group first, from the Cards page.');
  const choices=C.state.groups.filter(g=>g.id!==d.groupId&&M.deckMayTake(C.state,g,d.id));
  if(!choices.length)throw Error(`No other group can be ${d.name}\u2019s box: the Bench, To sell / trade and other decks\u2019 groups are places of their own. Make a General group first, from the Library.`);
  const main=()=>d.slots.filter(r=>r.purpose==='main');
  const bare=d.status==='draft'&&main().length<=1;
  /* The offer is about the group you pick, which you pick after the dialog opens -- keying it
     off the first one in the list hid it whenever that one happened to be empty. */
  const anyRows=choices.some(g=>groupRows(g).length);
  form(d.groupId?'Change the collection group':'Attach a collection group',
    `<div class="cm-full">${s('Collection group','groupId',choices.map(g=>[g.id,C.groupLabel(g)]),'')}</div>`
    +(bare&&anyRows?`<label class="cm-checkbox cm-full"><input type="checkbox" name="adopt" checked>Bring the group\u2019s cards across as this deck\u2019s list</label>`:'')
    +note('This deck\u2019s cards appear under this group in Cards, and a copy filed there is reserved for this deck before any other matching copy.'),
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
    .map(id=>C.card(id)).filter(Boolean);
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
actions['precon-save']=el=>{const d=M.deck(C.state,el.dataset.deck);
  C.modal('Confirm save deck to your decks?',`<div class="cm-form-footer cm-precon-save">${b('Cancel','close')}${b('Confirm Changes','precon-save-confirm',{deck:d.id},true)}</div>`);};
actions['precon-save-confirm']=async el=>{const d=M.deck(C.state,el.dataset.deck);actions.close();await commit({type:'finalize',deckId:d.id,confirmed:true,as:'save'});};
actions.finalize=async el=>{
  if(el.getAttribute('aria-busy')==='true')return;
  const label=el.textContent;el.disabled=true;el.setAttribute('aria-busy','true');el.textContent='Checking the list…';
  try{
  const d=M.deck(C.state,el.dataset.deck);
  const current=await refreshLegality(d);
  const fresh=M.deck(C.state,d.id),money=M.definitionIssues(C.state,fresh);
  /* MONEY NEVER STOPS A LOCK (Rob, 2026-10-18; docs/budgets.md). A budget and a per-card cap only inform, so what they
     say about the list is read out here, beside the rest of the review, and the list locks either way. This used to
     be a dialog that refused to lock until the cap was raised or removed. */
  C.review('Lock the list of '+fresh.name,note(`This marks the list locked. The copies you own were reserved as the cards went in, and the rest are already on the buy list; locking changes neither. Prices and bracket expectations require your review.${current?' Every card in the list was re-checked against Scryfall just now.':''}`)+(money.length?`<p class="cm-muted cm-lock-money">${e(money.join(' '))}</p>`:''),{type:'finalize',deckId:d.id},{after:()=>C.notice(`Locked · ${M.readiness(C.state,M.deck(C.state,d.id)).toBuy} to buy`)});
  }finally{el.disabled=false;el.removeAttribute('aria-busy');el.textContent=label;}
};
actions.lock=async el=>{const d=M.deck(C.state,el.dataset.deck);if(!d.locked)await refreshLegality(d);C.review(d.locked?'Unlock deck':'Lock deck',note('All copies remain visible. A lock excludes the deck’s copies from automatic build consideration unless you explicitly allow that donor.'),{type:'lock',deckId:d.id,locked:!d.locked});};
actions.fulfill=el=>C.review('Reserve available copies',note('Unassigned eligible copies fulfill matching needs. This changes reservations; it does not physically move cards.'),{type:'fulfill',deckId:el.dataset.deck});
function popMenu(el,html,width=250){
  document.querySelectorAll('.cm-tile-menu').forEach(m=>m.remove());
  const menu=document.createElement('div');menu.className='cm-menu cm-tile-menu';menu.setAttribute('popover','auto');menu.innerHTML=html;
  document.body.appendChild(menu);
  const place=()=>{if(!el.isConnected){if(menu.matches(':popover-open'))menu.hidePopover();return;}const r=el.getBoundingClientRect();if(r.bottom<0||r.top>window.innerHeight){if(menu.matches(':popover-open'))menu.hidePopover();return;}
    menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-width))+'px';
    menu.style.top=Math.min(r.bottom+6,window.innerHeight-menu.offsetHeight-8)+'px';};
  menu.showPopover();place();C.followAnchor(menu,place);menu.addEventListener('toggle',ev=>{if(ev.newState==='closed')menu.remove();});
  menu.addEventListener('click',ev=>{if(ev.target.closest('[data-action]'))menu.hidePopover();});
  return menu;
}
/* THE MORE MENU, IN THE DESIGN'S ORDER (r3, 29-deck-more-menu; R3.5). What you do with this deck first --
   Measure, Trace in Explore, Guide & SWOT, Export, Compare with -- then renaming, archiving and deleting,
   with a reviewed Delete action in red. Everything the menu carried before the redesign stays,
   below those (INTAKE §3): the collection group, reserving, locking, upgrades, the role lens, the status
   ladder and the insight entries. The design also draws Duplicate; there is no way to duplicate a deck yet,
   so it is not drawn until there is. */
actions['deck-more-menu']=el=>{const d=M.deck(C.state,el.dataset.deck),g=attached(d),ladder=C.statusLadder||[],upgrades=d.slots.filter(r=>r.purpose!=='main').length,hasCards=d.slots.some(r=>r.purpose==='main');
  popMenu(el,`<p>This deck</p>${!d.archived&&hasCards?b('Measure','measure-deck',{deck:d.id}):''}${d.archived?'':b('Trace in Explore','deck-trace',{deck:d.id})}${b('Guide & SWOT','deck-guide',{deck:d.id})}${b('Export / print','deck-export',{deck:d.id})}${b('Compare with…','compare-with',{deck:d.id})}`
    +`<hr>${b('Rename & edit definition','edit-deck',{deck:d.id})}${d.archived?b('Restore as draft','restore-deck',{deck:d.id}):b('Change commander','change-commander',{deck:d.id})+b('Share Deck','share-deck',{deck:d.id})+b('Archive','archive',{deck:d.id})}<button type="button" data-action="delete-deck" data-deck="${e(d.id)}" class="cm-danger">Delete deck…</button>`
    +`<hr><p>Collection</p>${g?b('View the collection group','deck-group',{group:g.id}):''}${b(g?'Change the collection group':'Attach a collection group','attach-group',{deck:d.id})}${b('Reserve available copies','fulfill',{deck:d.id})}${d.status==='final'?b(d.locked?'Unlock deck':'Lock deck','lock',{deck:d.id}):''}${b(`Upgrades (${upgrades})`,'deck-upgrades',{deck:d.id})}${b('Role lens (Explore)','deck-lens',{deck:d.id})}${d.status==='draft'?b(`Draft list (${M.draftShort(C.state,d).reduce((n,x)=>n+x.quantity,0)})`,'deck-cards',{deck:d.id}):''}`
    +`${d.archived?'':`<hr><p>Every card still owed becomes</p>${ladder.map(([id,label,why])=>`<button type="button" class="cm-rung" aria-label="${e(label)}" data-action="deck-status" data-deck="${e(d.id)}" data-source="${id}"><span class="cm-rung-label">${e(label)}</span><small>${e(why)}</small></button>`).join('')}`}<hr><p>Insight</p>${b('Recommendations','deck-suggestions',{deck:d.id})}${C.adviseOpen&&!d.archived?b('Ask the AI advisor','deck-advise',{deck:d.id}):''}${b('Reports & advice','deck-evidence',{deck:d.id})}${b(C.termsOn()?'Hide term definitions':'Show term definitions','toggle-terms')}<button type="button" data-action="page-help" data-help="deck">About this page</button>`,290);};
/* Compare with…: this deck is ticked, and Decks says to tick the other. */
actions['compare-with']=el=>{const d=M.deck(C.state,el.dataset.deck);C.comparePicks=new Set([d.id]);C.deckPicksView='all|false';go('decks');C.notice(`Tick another deck to compare with ${deckNumberOff(d.name)}, then choose Bulk actions › Compare decks.`);};
/* Opened from the page, it opens in place and the address does not move (the first look's rule: the
   link stays on the deck). From another tab or the More menu, the Overview draws first and then opens it. */
let guideWanted=null;
function openGuide(id){const t=document.getElementById('cm-guide-template');if(!t||t.dataset.deck!==id)return false;const d=M.deck(C.state,id);
  modal('Guide & SWOT · '+deckNumberOff(d.name),`<div class="cm-guide-body"></div><div class="cm-form-footer">${b('Close','close')}</div>`);
  $('#cm-dialog .cm-guide-body').append(t.content.cloneNode(true));$('#cm-dialog').classList.add('cm-guide-modal');return true;}
actions['deck-guide']=el=>{const id=el.dataset.deck;if(openGuide(id))return;guideWanted=id;go('decks',{deck:id});};
C.afterOverview=id=>{if(guideWanted===id){guideWanted=null;openGuide(id);}};
actions['deck-pull']=el=>go('pull',{deck:el.dataset.deck});
actions['deck-buy-list']=el=>go('cards',{tab:'buy',deck:el.dataset.deck});
actions['deck-upgrades']=el=>go('decks',{deck:el.dataset.deck,tab:'upgrades'});
/* The role lens opens on Removal; the select in the pane reaches the other six. */
actions['deck-lens']=el=>go('discover',{lens:'Removal',deck:el.dataset.deck});
actions['deck-trace']=el=>go('discover',{deck:el.dataset.deck,trace:'1'});
actions['group-menu']=el=>{
  const d=M.deck(C.state,el.dataset.deck),g=attached(d);
  popMenu(el,g?`<p>This deck lives in ${e(g.name)}</p>${b('View the group','deck-group',{group:g.id})}${b('Add planned cards','add-group-entry',{group:g.id})}${b('Change the group','attach-group',{deck:d.id})}`
    :`<p>No collection group attached</p>${b('Attach a collection group','attach-group',{deck:d.id})}`);
};
actions['deck-menu']=el=>{const d=M.deck(C.state,el.dataset.deck);document.querySelectorAll('.cm-tile-menu').forEach(m=>m.remove());const menu=document.createElement('div');menu.className='cm-menu cm-tile-menu';menu.setAttribute('popover','auto');
  menu.innerHTML=`<p>${e(d.name)}</p>${b('Open deck','deck',{deck:d.id})}${b('View deck cards','deck-cards',{deck:d.id})}<hr>${d.archived?b('Restore as draft','restore-deck',{deck:d.id}):b('Change commander','change-commander',{deck:d.id})+b('Share Deck','share-deck',{deck:d.id})+b('Archive deck','archive',{deck:d.id})}<button data-action="delete-deck" data-deck="${e(d.id)}" class="cm-danger">Delete deck…</button>`;
  document.body.appendChild(menu);const r=el.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-230))+'px';menu.style.top=Math.min(r.bottom+6,window.innerHeight-260)+'px';menu.showPopover();menu.addEventListener('toggle',ev=>{if(ev.newState==='closed')menu.remove();});
  /* Choosing an entry closes the menu, as popMenu's do; Open deck used to leave it standing over the deck page it opened. */
  menu.addEventListener('click',ev=>{if(ev.target.closest('[data-action]'))menu.hidePopover();});};
/* SELECT, FAVORITE AND BULK ACTIONS (Rob, 2026-10-23: the Decks requirements' FAV and SEL). A tick selects a deck for
   any bulk action; a deck shared with you is keyed by its share ("share:<id>"). Favorites are the person's, kept with
   the account's preferences as a list of deck keys (FAV-5), so starring someone else's deck never touches it. */
const picked=()=>[...(C.comparePicks||[])];
const clearPicks=()=>{C.comparePicks=new Set();};
const deckName=key=>key.startsWith('share:')?(C.sharedShown||[]).find(x=>'share:'+x.id===key)?.content.name||'Shared deck':C.state.decks.find(d=>d.id===key)?.name||key;
/* A deck's short label in a notice: its id where the name starts with one ("D1 Atraxa" -> D1), else the name. */
const shortName=n=>{const m=/^(\S+)\s/.exec(n||'');return m&&/\d/.test(m[1])?m[1]:String(n||'');};
actions['select-deck']=el=>{const picks=(C.comparePicks=C.comparePicks||new Set()),k=el.dataset.deck;if(picks.has(k))picks.delete(k);else picks.add(k);C.render();};
const setFavorites=async(keys,on)=>{const now=new Set(C.state.preferences.favoriteDecks||[]);for(const k of keys)on?now.add(k):now.delete(k);await commit({type:'preferences',values:{favoriteDecks:[...now]}});};
actions['favorite-deck']=async el=>{const k=el.dataset.deck,on=!(C.state.preferences.favoriteDecks||[]).includes(k);await setFavorites([k],on);C.notice(`${on?'Favorited':'Unfavorited'} ${deckName(k)}.`);};
const plural=(n,one,many)=>n===1?one:many;
actions['bulk-menu']=el=>{const keys=picked();if(!keys.length)return;const shared=keys.some(k=>k.startsWith('share:')),own=keys.filter(k=>!k.startsWith('share:')),favs=new Set(C.state.preferences.favoriteDecks||[]),allFav=keys.every(k=>favs.has(k)),n=keys.length;
  const item=(label,action,why='')=>`<button type="button" data-action="${action}"${why?` disabled aria-disabled="true" title="${e(why)}"`:''}>${e(label)}</button>`;
  const notMine=shared?'You can only box, group or remove your own decks.':'';
  popMenu(el,`<p>${n} deck${n===1?'':'s'} selected</p>`
    +item('Compare decks','bulk-compare',n<2?'Select at least two decks to compare.':n>4?'Compare up to four decks at once.':shared?'Compare works on your own decks; open a shared deck to see its list.':'')
    +item(plural(own.length||n,'Box deck…','Box decks…'),'bulk-box',notMine)
    +item('Add to group…','bulk-group',notMine)
    +item(allFav?'Unfavorite':'Favorite','bulk-favorite')
    +item(plural(own.length||n,'Remove deck…','Remove decks…'),'bulk-remove',notMine),260);};
actions['bulk-compare']=async()=>{await actions['compare-decks']();clearPicks();};
actions['bulk-favorite']=async()=>{const keys=picked(),favs=new Set(C.state.preferences.favoriteDecks||[]),on=!keys.every(k=>favs.has(k));clearPicks();await setFavorites(keys,on);C.notice(`${on?'Favorited':'Unfavorited'} ${keys.length} deck${keys.length===1?'':'s'}.`);};
/* ADD TO GROUP: DECK SETS (Q3's default). A set is a short name (S0, G1, TB5…); pick one or create one, and a deck can be
   in several. The set shows as a tag on the tile. */
actions['bulk-group']=()=>{const ids=picked().filter(k=>!k.startsWith('share:')),names=[...new Set(C.state.decks.flatMap(d=>d.sets||[]))].sort((a,b)=>a.localeCompare(b,'en-US',{numeric:true}));
  form(`Add ${ids.length} deck${ids.length===1?'':'s'} to a group`,`<div class="cm-full"><p>${ids.map(id=>e(deckName(id))).join(', ')}</p></div>`+(names.length?s('Deck set','set',[['','Choose a set…'],...names.map(x=>[x,x])],''):'')+f(names.length?'Or a new set':'New set','name','',`maxlength="${M.SET_MAX}" placeholder="S0, G1, TB5…"`),
    async v=>{const name=(v.name||'').trim()||v.set;if(!name)throw Error('Choose a set or name a new one.');clearPicks();await commit({type:'batch',summary:`Added ${ids.length} deck${ids.length===1?'':'s'} to ${name}`,commands:ids.map(id=>({type:'editDeck',deckId:id,sets:[...new Set([...(M.deck(C.state,id).sets||[]),name])]}))});},'Add to group');};
/* REMOVE (Q4's default): a confirm naming the decks; Archive keeps their history and can be undone, Delete permanently
   can't. */
actions['bulk-remove']=()=>{const ids=picked().filter(k=>!k.startsWith('share:'));
  modal(`Remove ${ids.length} deck${ids.length===1?'':'s'}`,`<p>${ids.map(id=>`<strong>${e(deckName(id))}</strong>`).join(', ')}</p><p class="cm-muted">Archive keeps a deck's history and can be restored. Delete permanently removes it, its reports and its game log; owned copies stay in your library.</p><div class="cm-form-footer"><button type="button" class="v-button cm-danger" data-action="bulk-delete">Delete permanently</button><button type="button" class="v-button primary" data-action="bulk-archive">Archive</button></div>`);};
actions['bulk-archive']=async()=>{const ids=picked().filter(k=>!k.startsWith('share:')&&!M.deck(C.state,k).archived);clearPicks();C.actions.close();if(ids.length)await commit({type:'batch',summary:`Archived ${ids.length} deck${ids.length===1?'':'s'}`,commands:ids.map(id=>({type:'archive',deckId:id,confirmed:true}))});};
actions['bulk-delete']=async()=>{const ids=picked().filter(k=>!k.startsWith('share:'));clearPicks();C.actions.close();if(ids.length)await commit({type:'batch',summary:`Deleted ${ids.length} deck${ids.length===1?'':'s'} permanently`,commands:ids.map(id=>({type:'deleteDeck',deckId:id,confirmed:true}))});};
/* BOX DECKS (BOX-1 to BOX-9). One dialog for every selected deck, and it works with one. Three choices, each including
   the one before; each shows its count for every deck before Box is pressed, and choice 3 names every deck that gives a
   card up and what it becomes. The model plans it (M.boxPlan); every move is the `place` Planned Changes uses. */
actions['bulk-box']=()=>{const ids=picked().filter(k=>!k.startsWith('share:'));C.boxDialog(ids);};
const BOX_CHOICES=['The deck’s own cards','Own cards and substitutes','Own cards, substitutes and cards from other decks'];
C.boxDialog=ids=>{const order=C.deckGridOrder||[],at=id=>{const i=order.indexOf(id);return i<0?order.length:i;};ids=[...ids].sort((a,b)=>at(a)-at(b));
  const plans=[1,2,3].map(choice=>M.boxPlan(C.state,ids,choice)),first=plans.findIndex(p=>p.total>0),short=n=>e(shortName(n));
  const choice=(p,i)=>`<label class="cm-box-choice${p.total?'':' is-empty'}"><input type="radio" name="choice" value="${i+1}"${i===first?' checked':''}${p.total?'':' disabled'}><span><strong>${e(BOX_CHOICES[i])}</strong><ul class="cm-box-counts">${p.decks.map(x=>`<li data-box-deck="${e(x.deckId)}" data-box-choice="${i+1}">${short(x.name)}: <b>${x.count}</b> to box · ${x.inBoxAfter} in the box${x.stageAfter!==x.stageBefore?` · ${e(x.stageBefore)} → ${e(x.stageAfter)}`:''}</li>`).join('')}</ul>${i===2&&p.donors.length?`<ul class="cm-box-donors">${p.donors.map(x=>`<li data-donor="${e(x.deckId)}">${short(x.name)} gives up ${e(x.cards.join(', '))}; ${x.cards.length===1?'that seat goes':'those seats go'} back to Reserved · To buy${x.stageAfter!==x.stageBefore?` · ${short(x.name)}: ${e(x.stageBefore)} → ${e(x.stageAfter)}`:''}</li>`).join('')}</ul>`:''}${p.waiting.length?`<ul class="cm-box-waiting">${p.waiting.map(x=>`<li>${short(x.name)} keeps waiting for ${e(x.card)}: ${short(x.keptBy)} comes first</li>`).join('')}</ul>`:''}</span></label>`;
  if(first<0)return modal(ids.length===1?'Box deck':'Box decks',`<p>Nothing to box: ${ids.length===1?'this deck has':'these decks have'} no owned card waiting to go in.</p><div class="cm-form-footer">${b('Close','close',{},true)}</div>`);
  form(ids.length===1?`Box ${deckName(ids[0])}`:`Box ${ids.length} decks`,`<fieldset class="cm-full cm-box-choices"><legend>What to box</legend>${plans.map(choice).join('')}</fieldset>`,async v=>{const p=plans[Number(v.choice)-1];clearPicks();await commit(p.command);
    C.notice(p.decks.map(x=>`${shortName(x.name)}: ${x.count} boxed · ${x.inBoxAfter} in the box · ${x.stageAfter}`).join('. ')+'.');},'Box');};
actions['change-commander']=el=>{const d=M.deck(C.state,el.dataset.deck);
  const choose=previous=>C.cardPicker('Change commander',c=>{
    const current=M.deck(C.state,d.id),inList=current.slots.some(r=>r.purpose==='main'&&r.cardId===c.id);
    return C.review('Change commander',note(`${C.card(previous).name} → ${c.name}. ${inList?'The former commander stays in the main list.':'The new commander replaces the former commander in the list.'} Owned cards and physical locations stay the same. The deck becomes a draft for legality review.`),{type:'changeCommander',deckId:d.id,previous,cardId:c.id,cards:[c]});
  },{commander:true});
  if(d.commanders.length===1)return choose(d.commanders[0]);
  return form('Change commander',s('Commander to replace','previous',d.commanders.map(id=>[id,C.card(id).name]),d.commanders[0]),v=>choose(v.previous),'Choose replacement');};
actions['delete-deck']=el=>{const d=M.deck(C.state,el.dataset.deck);
  const games=C.state.games.filter(g=>g.deckId===d.id).length,reports=C.state.reports.filter(r=>r.deckId===d.id).length;
  const remove=async()=>{const result=await commit({type:'deleteDeck',deckId:d.id,confirmed:true},{renderView:false});
    // Navigation clears ordinary notices. Show this receipt afterward so Undo remains reachable.
    if(location.hash!=='#decks'){addEventListener('hashchange',()=>C.notice(result.summary),{once:true});go('decks');}
    else{await C.render();C.notice(result.summary);}};
  /* The deck's own name is what is typed (r3, 74-confirm-delete): it proves the reader is deleting
     the deck they think they are, which a fixed word did not. The typing goes with the message: a reader who has turned the warning off has
     said they know what this does, and asking them to type it anyway is theater. Owned copies survive even when the plan is deleted. */
  // A prior opt-out covered archived decks only; active decks always require review.
  if(d.archived&&C.skipping('deleteDeck'))return remove();
  form('Delete '+d.name+' permanently',`<div class="cm-full">${note(`This removes the deck plan, ${reports} report${reports===1?'':'s'} and ${games} logged game${games===1?'':'s'}. Copies physically in it return to the Bench. Your owned cards are not deleted. Only the Undo offered straight after can bring it back.`,true)}${f('Type the deck name to confirm','confirm','',`required autocomplete="off" placeholder="${e(d.name)}"`)}${d.archived?'<label class="cm-checkbox cm-full"><input type="checkbox" name="skipNext">Don’t show this message again for archived decks</label>':''}</div>`,async v=>{if(v.confirm.trim()!==d.name.trim())throw Error(`Type the deck name exactly: ${d.name}`);if(v.skipNext)await C.setSkip('deleteDeck',true);await remove();},'Delete permanently').classList.add('cm-destructive');};
/* Straight through when the reader has said so, with a toast that names what happened and
   where the confirmation went, so a silent archive is never a mystery. */
actions.archive=el=>C.skipping('archive')
  ?commit({type:'archive',deckId:el.dataset.deck,confirmed:true}).then(()=>C.notice('Archived. You turned this confirmation off; User Functions → Confirmations turns it back on.'))
  :C.review('Archive this deck',note('Keep the plan and history. Owned copies go to compatible outstanding needs in deck priority order, then the Bench. Orders and actual box locations remain recorded.',true),{type:'archive',deckId:el.dataset.deck},{remember:'archive'});actions['restore-deck']=el=>commit({type:'restoreDeck',deckId:el.dataset.deck});
/* LOG A GAME, WITH THE FACTS THE RECORD CARD READS BACK: the date, the finish in a pod of
   how many, the bracket it was played at, the card that won it and the card that sat dead in
   hand -- both pickers limited to the deck's own list. */
actions['log-game']=el=>{const d=M.deck(C.state,el.dataset.deck),did=d.id,last=C.state.games.filter(g=>g.deckId===did).at(-1),cards=d.slots.filter(r=>r.purpose==='main').map(r=>C.card(r.cardId)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'en-US')).map(c=>[c.id,c.name]);
  form('Log a real game',s('Outcome','outcome',[['win','Win'],['loss','Loss'],['draw','Draw'],['unfinished','Unfinished']],'win')+s('Card that won it','mvpCardId',[['','Choose a card (optional)'],...cards],'')+f('Date','playedAt',M.today(),'type="date" required')+s('Finish','finish',[['','Choose finish (optional)'],1,2,3,4,5,6],'')+s('Pod size','pod',[2,3,4,5,6],last?.pod||4)+s('Bracket','bracket',[1,2,3,4,5],d.definition.baseBracket)+f('Turns (optional)','turns','','type="number" min="1" max="1000"')+s('Dead card in hand','deadCardId',[['','Choose a card (optional)'],...cards],'')+f('Opposing commanders / styles','opponents')+s('Your seat','seat',[['','Choose seat (optional)'],1,2,3,4,5,6],last?.seat||'')+`<label class="cm-full">What happened?<textarea name="notes" placeholder="Key plays, threat assessment, mulligans, mistakes or table agreements"></textarea></label>`,
    async data=>{await commit({type:'game',deckId:did,outcome:data.outcome,playedAt:data.playedAt||undefined,finish:data.finish?Number(data.finish):null,pod:Number(data.pod),bracket:Number(data.bracket),mvpCardId:data.mvpCardId||null,deadCardId:data.deadCardId||null,turns:data.turns?Number(data.turns):null,seat:data.seat?Number(data.seat):null,opponents:data.opponents,notes:data.notes});
      if(C.route().view==='decks'&&C.route().params.get('deck')===did)go('decks',{deck:did,tab:'overview'});
      if(data.deadCardId){const card=C.card(data.deadCardId);modal('Game recorded',`<p>${e(card.name)} sat dead in hand.</p><div class="cm-form-footer">${b('Done','close')}${b('Mark '+card.name+' for replacement','game-mark-replacement',{deck:did,card:data.deadCardId},true)}</div>`);}
    },'Save game record');};
actions['game-mark-replacement']=async el=>{const d=M.deck(C.state,el.dataset.deck),slot=d.slots.find(r=>r.purpose==='main'&&r.cardId===el.dataset.card);if(!slot)throw Error('That card is no longer in this deck.');
  await commit({type:'flag',deckId:d.id,slotId:slot.id,option:true,why:'Sat dead in hand in a logged game.'},{renderView:false});actions.close();go('discover',{deck:d.id,replace:slot.cardId,card:slot.cardId});};

/* THE RECORD, READ BACK. Games were write-only: logged and then only visible as JSON in a
   dialog. The card says the last-n W-L, the win rate with its n, dollars paid per win, and --
   through the Wilson interval game-record.js already had -- whether there are enough games to
   say anything at all: below eight decided games the honest sentence is "too few games to
   tell". The last ten games are listed with the card that won and the one that sat dead. */
const MIN_GAMES=8;
const gamesOf=d=>C.state.games.filter(g=>g.deckId===d.id).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at)));
function recordSummary(d){const games=gamesOf(d),wins=games.filter(g=>g.outcome==='win').length,losses=games.filter(g=>g.outcome==='loss').length,decided=wins+losses;const W=globalThis.MtgGameRecord;const interval=W&&decided?W.wilson(wins,decided):null;return {games,wins,losses,decided,rate:decided?wins/decided:null,interval};}
/* A game played at a CrankMagic table says so, and says when an AI sat in: a win over the house pilot is not a
   win over three friends, and the record should not let one pass for the other (M5). */
const tableBadges=g=>`<span class="cm-badge" title="Played at a CrankMagic table">Table</span>${g.table.ai?' <span class="cm-badge warn" title="An AI played at least one seat">AI</span>':''}`;
function recordHTML(d){const {games,wins,losses,decided,rate,interval}=recordSummary(d),r=M.readiness(C.state,d);
  const head=`<h2>Record <span class="cm-pull-n">${games.length}</span></h2>`;
  if(!games.length)return `<section class="v-panel cm-record" id="cm-sec-record">${head}<p class="cm-muted">No games logged yet. Log a game from the action row and the record reads back here: wins and losses, the win rate once there are enough games to trust it, what each win cost, and which cards decided the games.</p></section>`;
  /* PAID PER WIN COUNTS WHAT THE COST PANEL COUNTS: a copy with no recorded price at the catalog's
     list price, marked ≈, the same figure "Paid so far" shows. It used to divide readiness.paid,
     the typed figure alone, so a deck whose copies came in without receipts read $0.00 per win
     under a Cost panel saying $95 paid (UAT P-05). */
  const ownedLots=C.state.lots.filter(l=>l.source==='owned'&&l.allocation&&l.allocation.deckId===d.id),paidEstimated=ownedLots.some(l=>!Number.isFinite(l.paid)||l.paidSource==='catalog'),paidOrList=ownedLots.reduce((n,l)=>n+(Number.isFinite(l.paid)?l.paid:(C.card(l.cardId)?.price||0))*l.quantity,0);
  const perWin=wins?paidOrList/wins:null,dateOf=g=>{const t=M.localDate(g.at);return t?t.toLocaleDateString('en-US',{dateStyle:'medium'}):String(g.at||'').slice(0,10);};
  const verdict=decided<MIN_GAMES?`Too few games to tell — ${decided} decided of ${MIN_GAMES} needed.`:interval?`Win rate ${Math.round(rate*100)}% (${Math.round(interval.low*100)}–${Math.round(interval.high*100)}% at 95% over ${decided} decided games)${interval.low>0.25?' — better than a fair four-player seat':interval.high<0.25?' — below a fair four-player seat':' — not distinguishable from a fair seat yet'}.`:'';
  const name=id=>id&&C.card(id)?e(C.card(id).name):'—';
  return `<section class="v-panel cm-record" id="cm-sec-record">${head}<div class="cm-budget-figures cm-record-figures"><div><strong>${wins}–${losses}${games.length-decided?`–${games.length-decided}`:''}</strong><span>W–L${games.length-decided?'–other':''}, last ${games.length}</span></div><div><strong>${rate===null?'—':Math.round(rate*100)+'%'}</strong><span>win rate · n = ${decided}</span></div><div><strong>${perWin===null?'—':(paidEstimated?'≈ ':'')+C.money(Math.round(perWin*100)/100)}</strong><span>paid per win</span></div></div><p class="cm-muted">${verdict}</p><div class="cm-table-wrap"><table class="cm-table cm-record-table"><thead><tr><th scope="col">When</th><th scope="col">Result</th><th scope="col">Finish</th><th scope="col">Bracket</th><th scope="col">Won it</th><th scope="col">Dead in hand</th><th scope="col">Turns</th><th scope="col">Evidence</th></tr></thead><tbody>${games.filter((g,i)=>i<10||g.id===C.route().params.get('game')).map(g=>`<tr data-game-record="${e(g.id)}" tabindex="-1"><td>${dateOf(g)}</td><td>${C.pill(e(g.outcome),g.outcome==='win'?'inbox':g.outcome==='loss'?'remove':'watch')}</td><td>${g.finish?`${g.finish}${g.pod?' of '+g.pod:''}`:'—'}</td><td>${g.bracket?'B'+g.bracket:'—'}</td><td>${name(g.mvpCardId)}</td><td>${name(g.deadCardId)}</td><td>${g.turns??'—'}</td><td>${g.online?b('Online report','online-game-report',{deck:d.id,game:g.id},false,{cls:'compact'}):g.table?tableBadges(g):'Manual log'}</td></tr>`).join('')}</tbody></table></div></section>`;}
actions['online-game-report']=el=>{const d=M.deck(C.state,el.dataset.deck),g=C.state.games.find(item=>item.id===el.dataset.game&&item.deckId===d.id);if(!g?.online)throw Error('That online match report is no longer available.');const r=g.online,c=r.telemetry?.counts||{},recommendations=r.deckSignals?.recommendations||[];
  modal(`Online match · ${d.name} · ${String(r.completedAt||g.at).slice(0,10)}`,`${note(`${String(r.outcome).toUpperCase()} · ${r.turns??'?'} turns · ${r.podSize??g.pod??'?'} players · journal ${r.telemetry?.integrity?.complete?'complete':'needs review'}`)}<div class="cm-budget-figures"><div><strong>${c.spells||0}</strong><span>spells</span></div><div><strong>${c.triggers||0}</strong><span>triggers</span></div><div><strong>${c.abilities||0}</strong><span>abilities</span></div><div><strong>${c.battlefieldDeaths||0}</strong><span>battlefield deaths</span></div></div><h3>Deck signals</h3><ul>${recommendations.map(item=>`<li><strong>${e(item.confidence||'evidence')}:</strong> ${e(item.text)}</li>`).join('')||'<li>No recommendation was generated from this match.</li>'}</ul><h3>Player feedback</h3><p>${e(r.playerFeedback?.notes||'No written feedback.')}</p><details class="cm-details"><summary>Full sanitized match report</summary><pre style="white-space:pre-wrap">${e(JSON.stringify(r,null,2))}</pre></details>`);};
actions['deck-export']=el=>{const d=M.deck(C.state,el.dataset.deck);C.download(d.name.replace(/[^\w-]+/g,'-')+'.txt',d.slots.filter(r=>r.purpose==='main').map(r=>r.quantity+' '+C.card(r.cardId).name).join('\n'),'text/plain');};
actions['deck-evidence']=el=>{const d=M.deck(C.state,el.dataset.deck),reports=C.state.reports.filter(r=>r.deckId===d.id),advice=C.state.advice.filter(r=>r.deckId===d.id),games=C.state.games.filter(r=>r.deckId===d.id);modal('Reports, advice & game history',`${note('Every measured run is filed here and under Simulation history on the deck page. Imported reports keep their protocol and exact-list fingerprint; a list change makes older results historical, not current.')}${b('Import report / advice pack','import-evidence',{deck:d.id})}${b('Compare reports','compare-reports',{deck:d.id})}${b('Export advice request','advice-request',{deck:d.id})}<h3>Simulation reports</h3>${reports.map(r=>`<details class="cm-details"><summary>${e(r.protocol)} · ${e(C.usDate(r.importedAt)||r.importedAt)} · ${r.deckFingerprint===M.fingerprint(d,C.state)?'Current list':'Historical list'}</summary><pre style="white-space:pre-wrap">${e(JSON.stringify(r,null,2))}</pre></details>`).join('')||'<p>No imported reports.</p>'}<h3>Advice</h3>${advice.map(r=>`<article>${note(r.deckFingerprint===M.fingerprint(d,C.state)?'Matches current list':'Historical advice for a different list')}<p style="white-space:pre-wrap">${e(r.text)}</p></article>`).join('')||'<p>No advice packs.</p>'}<h3>Recorded games</h3>${games.map(g=>`<p><strong>${e(g.outcome)}</strong>${g.table?' '+tableBadges(g):''} · ${e(dateOf(g))}${g.finish?` · ${g.finish}${g.pod?' of '+g.pod:''}`:''}${g.bracket?' · B'+g.bracket:''} · ${g.turns??'?'} turns<br>${e(g.notes)}</p>`).join('')||'<p>No games logged yet.</p>'}`);};
/* THE WHOLE LIST AT A STATUS, FROM THE DECK. A draft saved from the Lab is a hundred plans,
   and the reader who owns most of them says so once here rather than a hundred times in the
   Collection. On a finalized deck it takes only what is still owed. */
actions['deck-status']=el=>{const d=M.deck(C.state,el.dataset.deck),source=el.dataset.source,label=C.source(source);
  C.review(`Set ${d.name}’s cards to ${label}`,note(`Only what the deck still owes: one copy record per outstanding card at ${label}, reserved to its slot.`),{type:'acquireSlots',deckId:d.id,source});};
actions['deck-report']=el=>{const d=M.deck(C.state,el.dataset.deck),r=C.state.reports.find(x=>x.id===el.dataset.report&&x.deckId===d.id);if(!r)throw Error('That report is no longer in the library.');
  modal(`Simulation report · ${d.name} · ${when(r.importedAt)}`,(r.deckFingerprint===M.fingerprint(d,C.state)?'':note('Historical: this run measured an earlier version of the list.'))+(r.list?.length?`<div class="cm-actions cm-report-actions">${b('Spin off as a new deck','report-spinoff',{deck:d.id,report:r.id},true)}<span class="cm-muted">The ${r.list.reduce((n,x)=>n+x.quantity,0)} cards this run measured become a finalized deck of their own, with this commander; this deck is untouched.</span></div>`:'')+(C.reportHTML?C.reportHTML(r,d.definition):`<pre style="white-space:pre-wrap">${e(JSON.stringify(r,null,2))}</pre>`));};
/* A MEASURED HUNDRED AS ITS OWN DECK. The report carries the list it measured; spinning it off
   creates a deck from exactly that list, finalizes it so its claims are real, and files a copy
   of the report with it. Finalize can refuse (a legality change since the run; never money): the
   deck is then kept as a draft and the refusal is said. Overwriting the original deck with the
   measured hundred is deliberately not offered here. */
actions['report-spinoff']=async el=>{const d=M.deck(C.state,el.dataset.deck),r=C.state.reports.find(x=>x.id===el.dataset.report&&x.deckId===d.id);if(!r)throw Error('That report is no longer in the library.');if(!r.list?.length)throw Error('This report was filed before reports carried their list. Measure the deck again and spin off that run.');
  const missing=r.list.filter(x=>!C.card(x.cardId));if(missing.length)throw Error(`${missing.length} card${missing.length===1?'':'s'} of that list ${missing.length===1?'is':'are'} no longer in the library.`);
  const commanders=(r.commanders||[]).filter(id=>C.card(id)).length?r.commanders.filter(id=>C.card(id)):[...d.commanders];
  const cards=[...r.list.map(x=>C.card(x.cardId)),...commanders.map(id=>C.card(id))].filter(Boolean),slots=r.list.map(x=>({cardId:x.cardId,quantity:x.quantity,purpose:'main'}));
  const id='deck:'+C.uid(),score=scoreOf(r),name=`${d.name} · ${score?score+' pts · ':''}${when(r.importedAt)}`.slice(0,160);
  const create={type:'createDeck',deckId:id,name,commanders,cards,slots,definition:d.definition,notes:`Spun off from a simulation report of ${d.name} (${when(r.importedAt)}, report ${r.id}).`};
  const copy={type:'report',deckId:id,report:{...r,id:undefined,deckId:undefined,importedAt:undefined,spunOffFrom:{deckId:d.id,reportId:r.id}}};
  /* renderView:false: the page to draw is the new deck's, not this one's again. */
  try{await C.commit({type:'batch',commands:[create,{type:'finalize',deckId:id},copy],summary:`Spun off ${name} from a simulation report and locked its list`},{renderView:false});C.notice(`${name} is a locked deck of its own.`);}
  catch(err){await C.commit({type:'batch',commands:[create,copy],summary:`Spun off ${name} from a simulation report as a draft`},{renderView:false});C.notice(`${name} was saved as a draft, its list not locked: ${err.message}`,true);}
  actions.close();go('decks',{deck:id});};
actions['measure-deck']=async el=>{const d=M.deck(C.state,el.dataset.deck);if(!C.measureDeck)throw Error('Measure is not loaded.');
  const say=t=>{const pill=$('#cm-deck-sim-status');if(pill){pill.hidden=false;pill.textContent=t;}};say('Starting…');
  try{const {report,result}=await C.measureDeck(d.id,say);const filed=C.state.reports.filter(x=>x.deckId===d.id).at(-1);if(filed)go('decks',{deck:d.id,report:filed.id});C.notice(`Measured ${report.metrics.score.value} points from ${result.games.toLocaleString('en-US')} games in ${(result.elapsedMs/1000).toFixed(1)}s. The report is open; it is also filed under Reports on the deck.`);}
  catch(err){say(err.message);throw err;}};
actions['advice-request']=el=>{const d=M.deck(C.state,el.dataset.deck);C.download('CrankMagic-advice-request.json',JSON.stringify({format:'crankmagic-advice-request',version:1,deckFingerprint:M.fingerprint(d,C.state),definition:d.definition,deckName:d.name,cards:d.slots.map(r=>({name:C.card(r.cardId).name,quantity:r.quantity,purpose:r.purpose,oracleText:C.card(r.cardId).oracleText})),responseContract:{kind:'advice',deckFingerprint:'Copy the exact supplied fingerprint',text:'Explain strategy, sequencing, weaknesses and proposed replacements. Do not invent Measure results.'}},null,2));};
actions['import-evidence']=el=>{const d=M.deck(C.state,el.dataset.deck);form('Import versioned report or advice',`<div class="cm-full">${note('Accepts a JSON object with kind (report or advice), deckFingerprint, and protocol for reports or text for advice. Imported material is labeled and never executed.')}<label>JSON file<input name="file" type="file" accept=".json" required></label></div>`,async(_,formEl)=>{const file=formEl.elements.file.files[0];if(file.size>10000000)throw Error('Limit evidence packs to 10 MB.');const data=CrankEvidence.validate(JSON.parse(await file.text()));const known=[M.fingerprint(d,C.state),...d.versions.map(v=>M.fingerprint(v,C.state))];if(!known.includes(data.deckFingerprint))throw Error('This pack does not match any retained version of this deck. Its original version must be present before importing.');if(!['report','advice'].includes(data.kind))throw Error('Set kind to report or advice.');if(data.kind==='report'&&(!data.protocol||typeof data.metrics!=='object'||!data.versions))throw Error('Reports need protocol, versions and metrics provenance.');await commit({type:data.kind,deckId:d.id,[data.kind]:data});},'Import pack');};
});
