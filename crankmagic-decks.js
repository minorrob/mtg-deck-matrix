/* Deck plans own slots, the library owns copies. Reference decks enter as drafts
 * and their historical owned flags are deliberately never migrated here. */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,esc:e,button:b,field:f,select:s,note,form,modal,commit,go,actions,views,$}=C;let showArchived=false;
const R=globalThis.CrankRules;   // the house rules and the deck-page literals live there
const DECK_TABS=[['overview','Overview'],['cards','Cards'],['guide','Guide'],['upgrades','Upgrades'],['history','History']];
/* The nav under Decks is the decks: the one you are reading is marked, so the sidebar is a
   deck switcher, and the How page sits under it as the map it is. */
C.SUBNAV.decks=()=>{const r=C.route(),did=(r.view==='decks'||r.view==='pull'||r.view==='change')?r.params.get('deck')||'':'';
  return [...C.state.decks.filter(d=>!d.archived).slice(0,12).map(d=>({label:d.name,hash:'#decks?deck='+encodeURIComponent(d.id),current:d.id===did})),{label:'How a deck comes together',hash:'#how',current:r.view==='how'}];};
C.HELP.decks={title:'Decks',body:`<p>Every deck you have, at its stage: <strong>Defining</strong> while the list is being written, <strong>Building</strong> while cards are still to buy or to add, <strong>Playable</strong> when substitutes make up the hundred, <strong>Complete</strong> when every reserved copy is in the physical deck.</p><p>Each tile's bar is the hundred: in the physical deck, ready to add, ordered, to buy. Tick two or more tiles to compare them; the ⋯ on a tile archives or restores it.</p>`};
C.HELP.deck={title:'A deck page',body:`<p>The header is the summary: commander, stage, bracket, mechanics and the latest measured score; the row beside it is the work — add what you own, buy what you do not, log the game, measure — and the rest is under More.</p><p><strong>Overview</strong> is where the deck stands: Progress counts the physical deck, ready to add, ordered and to buy; Cost is what finishing costs against the cap; the Next line says what to do first. <strong>Cards</strong> is the hundred by type with where each copy stands (actions on a card are in Cards). <strong>Guide</strong> is the commander, the strategy and SWOT — SWOT is structural, text matches, not modeled availability. <strong>Upgrades</strong> is the working list and the Upgrade Path. <strong>History</strong> is the game record and every measured run.</p><p>A <strong>finalized</strong> deck's reservations track what its list needs: Ready to add walks the cards you own into the physical deck, and the buy list is what is left. A <strong>draft</strong> has no reservations until you finalize it. An <strong>archived</strong> deck keeps its history; its copies were released, and where each one physically is stays recorded.</p>`};
const commander=d=>d.commanders.map(id=>C.card(id)?.name||'Unknown').join(' + ');
/* WHAT THE DECK IS ABOUT: the owner's mechanics when the definition names them, otherwise
   read off the list by the catalog -- marked derived, so the tile can say it is a reading
   and the definition form can offer it as a placeholder. */
function mechanicsOf(d){if(d.definition.mechanics.length)return {list:d.definition.mechanics,derived:false};const main=d.slots.filter(r=>r.purpose==='main').map(r=>C.card(r.cardId)).filter(Boolean);const list=CrankCatalog.deckMechanics?CrankCatalog.deckMechanics(main,C.card(d.commanders[0])):[];return {list,derived:true};}
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
function initials(d){const c=C.card(d.commanders[0]),ci=(c&&c.colorIdentity)||[],a=PIP[ci[0]]||'#b9b3a8',b2=PIP[ci[1]]||a;const text=(c?c.name:d.name).split(/[\s,]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');return `<div class="cm-deck-initials" aria-hidden="true" style="--ci-a:${a};--ci-b:${b2}">${e(text||'?')}</div>`;}
const art=d=>R.deckArt(commander(d))||C.card(d.commanders[0])?.image||'';
/* THE RIBBON READS LEFT TO RIGHT IN THE ORDER THE WORK HAPPENS: what the list asks for,
   what you have for it, what is on its way, what is still owed -- and last, separately,
   where the cards physically are. "In deck" used to lead, and it meant the physical box,
   so a deck you had finished buying read 0 and the ribbon looked broken rather than
   merely unconfirmed. */
/* TWO CLUSTERS, NOT FIVE FIGURES SPREAD ACROSS THE PAGE. The build-night questions on the left
   -- in the box, ready to add, on the way, to buy -- and the money on the right: what finishing
   costs at sheet prices against the deck's cap. The bar under them is the same hundred as one
   line, and the legend names its colours. */
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
/* ONE CARD, TWO COLUMNS: where the deck stands, and what it costs. The readiness figures and
   the money figures used to sit in two containers with two green bars that read as the same
   thing twice. Progress is the left column -- in box, ready to add, ordered, to buy, Game Changers,
   with the readiness bar -- and Cost is the right: to finish, paid, market value against the
   cap, the cap itself, and the lines paid over the 110% cap. Every figure is the model's
   (readiness) or the rules module's, so the card agrees with the Shop strip and the Orders
   tab by construction: the same lots, the same prices. */
function stats(d){const r=M.readiness(C.state,d),R=globalThis.CrankRules,cap=d.definition.budget??(R?R.RULES.deckCap:null),perCard=d.definition.perCardCap??(R?R.RULES.perCardMax:null);
  const pct=cap>0?r.marketValue/cap*100:null,tone=pct===null?'':pct>100?' cm-over':pct>90?' cm-near':'';
  const lots=C.state.lots.filter(l=>l.allocation?.deckId===d.id),overCap=R?lots.filter(l=>Number.isFinite(l.paid)&&R.capFor(C.card(l.cardId).price)!==null&&l.paid>R.capFor(C.card(l.cardId).price)).length:0;
  const dear=perCard!==null?d.slots.filter(x=>x.purpose==='main'&&C.card(x.cardId).price>perCard).length:0,gc=gcCount(d);
  /* Each Progress figure wears the colour of its segment in the bar below (`key`), so the
     bar needs no legend: the figures are the key. Paid so far counts a copy with no recorded
     price at the catalog's list price, marked ≈, so the figure is never a misleading $0. */
  const fig=(v,label,cls='',key='',title='')=>`<div${title?` title="${e(title)}"`:''}><strong${cls?` class="${cls}"`:''}>${v}</strong><span>${key?`<i class="cm-key ${key}" aria-hidden="true"></i>`:''}${label}</span></div>`;
  const owned=lots.filter(l=>l.source==='owned'),estimated=owned.filter(l=>!Number.isFinite(l.paid)),paidOrList=owned.reduce((n,l)=>n+(Number.isFinite(l.paid)?l.paid:(C.card(l.cardId)?.price||0))*l.quantity,0);
  return `<section class="cm-deck-summary${tone}" aria-label="Deck progress and cost"><div class="cm-summary-col"><h3>Progress</h3><div class="cm-summary-figures">${fig(r.sleeved,'Physical deck','','inbox')}${r.standIns||r.remove?fig(r.standIns,`of them substitute${r.standIns===1?'':'s'}${r.remove?` · ${r.remove} to take out`:''}`,'','standin'):''}${fig(pullCount(r),'Ready to add','','pull')}${fig(r.ordered,'Ordered','','ordered')}${fig(r.toBuy,d.status==='draft'?'Not yet reserved':'To buy','','buy')}${fig(`${gc} / ${GC_LIMIT}`,'Game Changers')}</div>${C.readinessBar(r)}</div><div class="cm-summary-col cm-summary-cost"><h3>Cost</h3><div class="cm-summary-figures">${fig(C.money(r.costToFinish),'$ to finish')}${fig((estimated.length?'≈ ':'')+C.money(Math.round(paidOrList*100)/100),'Paid so far','','',estimated.length?`${estimated.reduce((n,l)=>n+l.quantity,0)} owned cop${estimated.reduce((n,l)=>n+l.quantity,0)===1?'y has':'ies have'} no recorded price and count at list price. Set Paid on a row in Cards to replace the estimate.`:'')}${fig(C.money(r.marketValue),`Market value${pct!==null?` · ${Math.round(pct)}% of cap`:''}`)}${fig(cap===null?'—':C.money(cap),'Cap')}${fig(overCap,`line${overCap===1?'':'s'} over the 110% cap`,overCap?'cm-amber':'')}${dear?fig(dear,`card${dear===1?'':'s'} over ${C.money(perCard)}`,'cm-amber'):''}</div>${cap>0?`<div class="cm-budget-bar" role="img" aria-label="Market value ${Math.round(pct)}% of the cap"><i style="width:${Math.min(100,pct)}%"></i></div>`:''}</div></section>`;}
actions.jump=el=>{const t=document.getElementById(el.dataset.target);if(!t)return;const bar=document.querySelector('.cm-jump'),top=t.getBoundingClientRect().top+scrollY-((bar?bar.getBoundingClientRect().height:0)+(matchMedia('(max-width:760px)').matches?54:0)+10);scrollTo({top,behavior:'smooth'});};
views.decks=async params=>{const did=params.get('deck');if(did){const found=C.state.decks.find(x=>x.id===did);if(!found){C.main.innerHTML=C.pageHead('Decks',b('Decks','home',{},true))+note('Deck not found: this library has no deck with that id. It may live in another browser’s library, or under a different link.',true);return;}await overview(found);return;}const decks=C.state.decks.filter(d=>showArchived||!d.archived),picks=(C.state.preferences.comparisonPicks||[]).filter(id=>C.state.decks.some(d=>d.id===id)),invited=!!C.onlineDeckRequest?.();
/* THE SHOWCASE. The page opens on cards, not on a sentence: a fan of the reader's own
   commanders when they have decks, and three well-known ones while they do not. The fan
   is decoration -- it never claims a holding. */
const fanDecks=decks.filter(d=>!d.archived).slice(0,3),fanSrc=fanDecks.length?fanDecks.map(d=>[art(d),commander(d).split(',')[0]]).filter(([src])=>src):[['assets/crankmagic/commander-krenko.webp?v=1','Krenko'],['assets/crankmagic/commander-shadrix.webp?v=1','Shadrix'],['assets/crankmagic/commander-atraxa.webp?v=1','Atraxa']];
const fanSlots=fanSrc.length===1?['center']:fanSrc.length===2?['left','right']:['left','right','center'];
const fan=fanSrc.length?`<div class="cm-cardfan" aria-hidden="true">${fanSrc.map(([src,name],i)=>`<div class="cm-fan-card cm-fan-${fanSlots[i]}" style="background-image:url('${e(src)}')"><span>${e(name.toUpperCase())}</span></div>`).join('')}</div>`:'';
/* THE PAGE IS THE DECKS. With a library to show, the page name is the heading and the tiles
   are the page. The showcase -- the fan and "Build it. Make it yours." -- is the welcome a
   fresh library gets, and the only place the slogan is spoken. */
const anyDecks=C.state.decks.length>0,howLink=`<a class="cm-how-link" href="#how">How a deck comes together</a>`,compare=`<button type="button" class="v-button" data-action="compare-decks"${picks.length<2?' disabled':''} title="${picks.length<2?'Tick at least two decks to compare them':'Compare the ticked decks'}">Compare selected${picks.length?` (${picks.length})`:''}</button>`;
C.main.innerHTML=(anyDecks?C.pageHead('Decks',b('Create a deck','new-deck',{},true)+b('Build a deck','open-lab')+compare,'decks')+`<div class="cm-toolbar cm-toolbar-split">${howLink}<label class="cm-checkbox cm-show-archived"><input id="cm-show-archived" type="checkbox" ${showArchived?'checked':''}>Show archived</label></div>`
  :`<section class="cm-showcase"><div><h1>Build it.<br><span>Make it yours.</span></h1><div class="cm-actions">${b('Create a deck','new-deck',{},true)}${b('Build a deck','open-lab')}${b('Import a list','import-list')}${b('Import a backup','restore')}</div><p class="cm-sub">${howLink}</p></div>${fan}</section>`)+(decks.length?`<div class="cm-deck-grid">${decks.map(d=>{const r=M.readiness(C.state,d);/* THE TILE. The compare tick lives in the top-right corner, always present, so comparing is
   a tick and the Compare button rather than a link to find in each footer. The mana pips sit
   on their own row under the mechanic; the footer -- bracket, latest score, hand count --
   used to wrap around them. */
const picked=picks.includes(d.id);
/* FOUR STAGES, ONE WORD EACH, AND A BORDER TO MATCH: Defining (green) while the list is being
   built, Building (blue under half the list in the physical deck, purple past half), Playable
   while substitutes make up the hundred, Complete (gold) when every reserved copy is in. */
const badge=d.archived?['draft','Archived']:d.status==='draft'?['draft','Defining']:r.complete?['inbox','Complete']:r.playable?['standin','Playable']:['buy','Building'];
/* ONE CAPTION, EACH FIGURE ONCE: what is still to buy, ordered, ready to add or standing in,
   then the record. The bar is the hundred; a deck with nothing left to do says only how many
   are in the physical deck. */
const games=C.state.games.filter(x=>x.deckId===d.id),record=games.length?`${games.filter(x=>x.outcome==='win').length}–${games.filter(x=>x.outcome==='loss').length}`:'';
const caption=[r.toBuy?`${r.toBuy} ${d.status==='draft'?'not yet reserved':'to buy'}`:'',r.ordered?`${r.ordered} ordered`:'',pullCount(r)?`${pullCount(r)} ready to add`:'',r.standIns?`${r.standIns} substitute${r.standIns===1?'':'s'}`:''].filter(Boolean);
if(!caption.length)caption.push(`${r.sleeved} in the physical deck`);if(record)caption.push(record);
const stage=d.archived?'archived':d.status==='draft'?'defining':r.complete?'complete':r.playable?'playable':'building';
return `<article class="cm-deck-tile cm-stage-${stage}${picked?' is-picked':''}">${art(d)?`<img class="cm-deck-art" src="${e(art(d))}" alt="" loading="lazy">`:initials(d)}<label class="cm-tile-pick" title="Tick to compare this deck"><input type="checkbox" data-action="compare-pick" data-deck="${e(d.id)}"${picked?' checked':''} aria-label="Compare ${e(d.name)}"></label><button data-action="deck" data-deck="${e(d.id)}"><small>${e(d.name)}</small><h3>${e(commander(d)||'Choose a commander')}</h3>${(()=>{const m=mechanicsOf(d);return m.list.length?`<p${m.derived?' class="cm-tile-derived" title="Read from the list. Name your own in Deck Definition."':''}>${e(m.list.join(' · '))}</p>`:'';})()}<span class="cm-tile-mana">${C.colors(C.card(d.commanders[0])?.colorIdentity)}</span>${C.pill(e(badge[1]),badge[0])}</button><div class="cm-tile-ready">${C.readinessBar(r)}<span class="cm-tile-caption">${e(caption.join(' · '))}</span></div><footer><span>B${d.definition.baseBracket}${scoreOf(latestReport(d))?` · <span class="cm-badge" title="Latest measured score">${e(scoreOf(latestReport(d)))} pts</span>`:''}</span><span class="cm-muted">${d.locked?'Locked':''}</span><span class="cm-tile-tools"><button type="button" class="cm-icon-button cm-tile-menu-btn" data-action="deck-menu" data-deck="${e(d.id)}" aria-haspopup="menu" aria-label="Deck options for ${e(d.name)}">⋯</button></span></footer></article>`;}).join('')}</div>`:anyDecks?'<p class="cm-muted">Every deck here is archived. Tick Show archived to see them.</p>':'');$('#cm-show-archived')?.addEventListener('change',ev=>{showArchived=ev.target.checked;C.render();});};
/* A card's roles: the ones the catalog already carries, or the classifier read fresh from
   the rules text -- the same vocabulary the graph joins cards on, so "ramp" here is the
   ramp the Discover page means. */
const rolesOf=c=>Array.isArray(c.roles)&&c.roles.length?c.roles:(globalThis.MtgCardClassify&&MtgCardClassify.classify?(MtgCardClassify.classify(c).roles||[]):[]);
async function overview(d){const cards=d.slots.filter(r=>r.purpose==='main').map(r=>({c:C.card(r.cardId),q:r.quantity})),types=['Land','Creature','Artifact','Enchantment','Instant','Sorcery','Planeswalker'],curve=Array(8).fill(0);for(const {c,q} of cards)if(!/Land/.test(c.typeLine))curve[Math.min(7,Number(c.manaValue)||0)]+=q;const max=Math.max(1,...curve),issues=[...M.legality(C.state,d),...M.definitionIssues(C.state,d)];/* ONLY THE GUIDE TAB WAITS ON THE NETWORK. The commander's full card and the written guide
   are read for About the Commander and Strategy; the other four tabs draw from the saved
   facts and open at once -- a deck page used to wait on a Scryfall round trip (ten seconds
   when the network is down) before it could show its own progress card. */
const wantGuide=C.route().params.get('tab')==='guide';let offline=null;
const leaders=wantGuide?await Promise.all(d.commanders.map(id=>C.catalog.details(C.card(id),{onFail:error=>{offline=error;}}))):d.commanders.map(id=>C.card(id)).filter(Boolean);
  if(offline)C.notice('Could not reach Scryfall, so this page is showing the card facts already saved. Card data age is in User Functions.',true);let guide=null;if(wantGuide){try{const data=CrankAssets.expect(await C.catalog.load(CrankAssets.guides),'guides');guide=data.decks.find(g=>g.commander===leaders[0]?.name);}catch{}}if(C.route().view!=='decks'||C.route().params.get('deck')!==d.id)return;const swot=structural(d,cards);
const ready=M.readiness(C.state,d),heroArt=art(d);
/* WHAT THE LIST COSTS AGAINST WHAT THE DEFINITION ALLOWS. The Lab drafts against the cap as
   a target rather than a wall, so a list can arrive here over it -- and the reader used to
   find out only when Finalize refused. It is a badge in the hero now, with both numbers. */
const spend=cards.reduce((n,{c,q})=>Number.isFinite(c.price)?n+c.price*q:n,0),cap=d.definition.budget,overCap=cap!==null&&cap!==undefined&&spend>cap;
const latest=latestReport(d);
/* THE PAGE IS FIVE TABS. Overview answers "where is this deck and what do I do next" and
   nothing else: the hero, the progress and cost card, one Next line. Cards is the hundred
   with where each copy stands; Guide is the commander, the strategy and SWOT; Upgrades is the
   working list and the Upgrade Path; History is the game record and every measured run. The
   tab rides on the route (?tab=), so a link lands on the tab it means and Back returns to it. */
const tab=DECK_TABS.some(([id])=>id===C.route().params.get('tab'))?C.route().params.get('tab'):'overview';
/* ONE PRIMARY, TWO BESIDE IT, MEASURE, AND THE REST UNDER MORE. The three that stay are the
   ones a deck is worked with -- add what you own, buy what you do not, log the game -- and a
   draft's are edit, finalize, log (a deck is often played before its reservations exist). On a
   phone the same three are a fixed bar at the foot of the screen (`.cm-action-bar`), where a
   thumb reaches them; the hero keeps Measure, More and the ?. */
const work=d.archived?[b('Restore as draft','restore-deck',{deck:d.id},true),b('Delete permanently','delete-deck',{deck:d.id})]
  :d.status==='final'?[b(pullCount(ready)+ready.remove>0?`Ready to add (${pullCount(ready)+ready.remove})`:'Ready to add','deck-pull',{deck:d.id},true),b(`Buy list (${ready.toBuy})`,'deck-buy-list',{deck:d.id}),b('Log a game','log-game',{deck:d.id})]
  :[b('Edit card list','edit-list',{deck:d.id},true),b('Finalize & reserve','finalize',{deck:d.id}),b('Log a game','log-game',{deck:d.id})];
const measure=d.archived||!cards.length?'':b(latest?'Measure again':'Measure','measure-deck',{deck:d.id});
/* THE TRACE: the deck's strategy lit from the commander outward, on Discover's canvas. */
const traceBtn=d.archived||!cards.length?'':b('Trace','deck-trace',{deck:d.id});
/* THE CHANGE LIST (Rob, 14 September): what to pull from the physical deck and what to put in,
   read against the mana formula and the floors before a card moves; the count is the rows
   that can be done now. */
const changeBtn=d.archived||d.status!=='final'||!C.changePlan?'':(()=>{const p=C.changePlan(d),n=p?p.rows.filter(r=>r.available).length:0;return b(n?`Make the change (${n})`:'Make the change','deck-change',{deck:d.id});})();
const useInInvitedGame=!d.archived&&C.onlineDeckRequest?.()?b('Use in invited game','online-guest-deck',{deck:d.id},true):'';
const mech=mechanicsOf(d),games=C.state.games.filter(g=>g.deckId===d.id);
const counts={cards:cards.reduce((n,x)=>n+x.q,0),upgrades:d.slots.filter(r=>r.purpose==='upgrade').length+d.slots.filter(r=>r.purpose==='main'&&r.option).length,history:measuredReports(d).length+games.length};
const tabs=`<div class="cm-tabs cm-deck-tabs" role="tablist" aria-label="Deck page">${DECK_TABS.map(([id,label])=>`<button type="button" role="tab" aria-selected="${id===tab}" data-action="deck-tab" data-deck="${e(d.id)}" data-tab="${id}">${label}${counts[id]?` <small>${counts[id].toLocaleString()}</small>`:''}</button>`).join('')}</div>`;
const body={
  overview:()=>(d.status==='draft'&&overCap?note(`Over the ${C.money(cap)} cap by about ${C.money(spend-cap)} at recorded prices. Finalize offers to raise the cap or trim the list.`,true):'')+stats(d)+`<p class="cm-deck-next" id="cm-deck-next"><strong>Next:</strong> ${e(nextLine(d,ready))}</p>`+glance(d,cards,curve,max,types),
  cards:()=>cardsTab(d,cards,curve,max,types),
  guide:()=>`<div class="cm-grid-2"><section class="v-panel" id="cm-sec-commander">${leaders.map(c=>`<div class="cm-commander">${c.image?`<img src="${e(c.image)}" alt="${e(c.name)}">`:'<div></div>'}<div><h2>About the Commander</h2><h3>${e(c.name)}</h3><ul><li>${C.mana(c.manaCost)} · ${c.power!==null?e(c.power+'/'+c.toughness)+' · ':''}${C.glossary.html(c.typeLine)}</li><li>${C.glossary.html(c.keywords.join(', ')||'No keyword abilities recorded')}</li>${c.oracleText.split('\n').filter(line=>/^(When|Whenever|At the beginning)|:/.test(line)).map(t=>`<li>${C.glossary.html(t)}</li>`).join('')}</ul><p>${e(commanderUse(c))}</p>${b('Full card & rules','card',{card:c.id})}</div></div>`).join('<hr>')}</section><section class="v-panel" id="cm-sec-guide"><h2>Strategy & how to play</h2>${guideHTML(guide,d,leaders,cards)}<h3>Your notes</h3><p>${e(d.notes||'No deck notes yet.')}</p></section></div><section class="v-panel" id="cm-sec-swot"><h2>SWOT & recommendations</h2><div class="cm-swot">${Object.entries(swot).map(([k,v])=>`<div><h3>${e(k)}</h3><p>${e(v)}</p></div>`).join('')}</div><h3>Review next</h3><ul>${issues.slice(0,5).map(x=>`<li>${e(x)}</li>`).join('')||'<li>The basic Commander list checks pass. Review price, bracket expectations and your playgroup’s preferences.</li>'}</ul>${b('Explore recommendations','deck-suggestions',{deck:d.id})}${b('Review linked upgrades','deck-upgrades',{deck:d.id})}</section>`,
  upgrades:()=>workingHTML(d)+upgradesHTML(d),
  history:()=>recordHTML(d)+historyHTML(d)
}[tab]();
C.main.innerHTML=`<section class="cm-deck-hero"${heroArt?` style="--hero:url('${e(heroArt)}')"`:''}><div class="cm-deck-hero-copy"><a class="cm-crumb" href="#decks">Decks</a><h1>${e(d.name)}</h1><p>${e(commander(d))} ${C.colors(C.card(d.commanders[0])?.colorIdentity)} <span class="cm-badge ${ready.ready?'good':''}">${d.archived?'Archived':d.status==='draft'?'Defining':ready.complete?'Complete':ready.playable?'Playable':'Building'}</span> <span class="cm-badge">Bracket ${e(String(d.definition.baseBracket))}–${e(String(d.definition.bracketCeiling))}</span>${overCap?` <span class="cm-badge warn" title="Recorded prices of the main list against the definition’s total cap">Over the ${e(C.money(cap))} cap · about ${e(C.money(spend))}</span>`:''}${latest?` <span class="cm-badge" title="Latest measured score">Measured ${e(scoreOf(latest))} pts</span>`:''}${attached(d)?` <span class="cm-badge">Group: ${e(attached(d).name)}</span> <button type="button" class="cm-text-button cm-hero-link" data-action="deck-group" data-group="${e(d.groupId)}">Open group</button>`:''}${d.locked?' <span class="cm-badge warn">Locked</span>':''}</p>${mech.list.length?`<p class="cm-deck-mechanics${mech.derived?' cm-tile-derived':''}"${mech.derived?' title="Read from the list. Name your own in Deck Definition."':''}>${e(mech.list.join(' · '))}</p>`:''}</div><div class="cm-actions cm-deck-actions">${useInInvitedGame}<span class="cm-deck-work">${work.join('')}</span>${measure}${traceBtn}${changeBtn}${b('More','deck-more-menu',{deck:d.id},false,{caret:'down'})}${C.helpButton('deck')}</div></section>`+tabs+body+(d.archived?'':`<nav class="cm-action-bar" aria-label="Deck actions">${useInInvitedGame}${work.join('')}</nav>`);}
actions['online-guest-deck']=el=>C.sendDeckToInvitedGame(M.deck(C.state,el.dataset.deck));
/* THE NEXT LINE. One sentence, in the order the work happens: add what you already own, buy
   what you do not, wait for what is ordered, swap the substitutes out when the real copies
   arrive. Every number is readiness's, so the line agrees with the figures above it. */
function nextLine(d,r){
  if(d.archived)return 'archived. Restore it as a draft to work on it again.';
  const n=d.slots.filter(x=>x.purpose==='main').reduce((a,x)=>a+x.quantity,0);
  if(d.status==='draft')return n<100?`finish the list (${n} of 100), then Finalize & reserve.`:'Finalize & reserve — the copies you own are reserved for it and the rest become the buy list.';
  const steps=[],pull=pullCount(r),subs=r.remove||r.standIns;
  if(pull)steps.push(`add the ${pull} card${pull===1?'':'s'} you already own (Ready to add)`);
  if(r.toBuy)steps.push(`buy ${r.toBuy} card${r.toBuy===1?'':'s'}${r.costToFinish?` (${C.money(r.costToFinish)})`:''}`);
  if(r.ordered)steps.push(`${r.ordered} ordered cop${r.ordered===1?'y is':'ies are'} on the way`);
  if(subs)steps.push(`swap out the ${subs} substitute${subs===1?'':'s'} from Ready to add`);
  if(!steps.length)return 'nothing — every card is in the physical deck. Log a game.';
  return steps.length===1?steps[0]+'.':`${steps[0]}, then ${steps[1]}${steps.length>2?`, and ${steps.length-2} more step${steps.length>3?'s':''}`:''}.`;
}
/* The composition -- the curve and the type counts -- drawn once for the Cards tab's head and the Overview's glance. */
/* Each card counts once, under its first type in the rules' order (a creature that is also an artifact is a creature), so the counts sum to the hundred and agree with the glance's type bar. */
const typeOf=c=>R.TYPE_ORDER.find(k=>k!=='Commander'&&k!=='Other'&&c.typeLine.includes(k))||'Other';
function compositionHTML(cards,curve,max,types){return cards.length?`<div class="cm-deck-composition"><div class="cm-curve" aria-label="Mana curve">${curve.map((n,i)=>`<div><span>${n||''}</span><i style="height:${n/max*88}px"></i><span>${i===7?'7+':i}</span></div>`).join('')}</div><div class="cm-count-list">${types.map(t=>`<span>${C.glossary.html(t)} <strong>${cards.filter(x=>typeOf(x.c)===t).reduce((n,x)=>n+x.q,0)}</strong></span>`).join('')}<span>Ramp <strong>${cards.filter(x=>rolesOf(x.c).includes('ramp')).reduce((n,x)=>n+x.q,0)}</strong></span></div></div>`:'';}
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
/* THE CARDS TAB: the hundred by type, each with where its copy stands, read from the same
   projection the Cards page tables -- so a row here and a row there never disagree. Actions on
   a card (status, price, options) stay on Cards; this is the list you read. The composition
   -- curve and type counts -- sits at its head, because it is about these cards. */
function cardsTab(d,cards,curve,max,types){
  const rows=M.projection(C.state).filter(r=>r.deckId===d.id&&r.purpose==='main'),bySlot=new Map(),subs=new Map();
  for(const r of rows){const k=r.kind==='need'?r.slotId:r.allocation?.slotId;if(!k)continue;if(!bySlot.has(k))bySlot.set(k,[]);bySlot.get(k).push(r);}
  /* WHICH SEAT A SUBSTITUTE IS HOLDING (play-space plan §2.12). `standInFor` is recorded when the
     proxy goes into the box, so the seat can say who is keeping it warm — which is the reading a
     reader wants on the list itself, rather than a count on the substitute card's own line. */
  const heldBy=new Map();
  for(const r of M.projection(C.state)){if(r.standInDeckId!==d.id)continue;subs.set(r.cardId,(subs.get(r.cardId)||0)+r.quantity);
    if(r.standInFor){const n=(C.card(r.cardId)||{}).name||'';if(n)heldBy.set(r.standInFor,[...(heldBy.get(r.standInFor)||[]),n]);}}
  const sum=(list,f)=>list.filter(f).reduce((n,r)=>n+r.quantity,0);
  const status=slot=>{if(d.status==='draft')return ['Draft list',M.statusTone('Draft list')];const rs=bySlot.get(slot.id)||[];const need=sum(rs,r=>r.kind==='need'),ordered=sum(rs,r=>r.kind==='lot'&&r.source==='ordered'),ready=sum(rs,r=>r.kind==='lot'&&r.source==='owned'&&r.placement!=='Physical deck'),boxed=sum(rs,r=>r.placement==='Physical deck');
    return need?[slot.quantity>1?`To buy ${need}`:'To buy','buy']:ordered?['Ordered',M.statusTone('Ordered')]:ready?['Ready to add','pull']:boxed>=slot.quantity?['Physical deck',M.statusTone('Physical deck')]:['Reserved',M.statusTone('Reserved')];};
  const ORDER=R.TYPE_ORDER,groups=new Map(ORDER.map(k=>[k,[]]));
  for(const slot of d.slots.filter(r=>r.purpose==='main')){const c=C.card(slot.cardId);if(!c)continue;groups.get(d.commanders.includes(slot.cardId)?'Commander':ORDER.find(k=>k!=='Commander'&&k!=='Other'&&c.typeLine.includes(k))||'Other').push({slot,c});}
  const line=({slot,c})=>{const [label,tone]=status(slot),sub=subs.get(slot.cardId)||0,held=heldBy.get(slot.id)||[];return `<li><span class="cm-deck-qty">${slot.quantity}</span><button type="button" class="cm-card-name" data-action="card" data-card="${e(c.id)}">${e(c.name)}</button><span class="cm-deck-mana">${C.mana(c.manaCost)}</span><span class="cm-price">${Number.isFinite(c.price)?C.money(c.price):''}</span><span class="cm-deck-flags">${C.pill(e(label),tone)}${sub?C.pill(`${sub} substitute${sub===1?'':'s'} in the box`,'standin'):''}${held.length?C.pill(e(`held by ${held.slice(0,2).join(', ')}${held.length>2?` and ${held.length-2} more`:''}`),'standin','title="A substitute is in the box for this seat until the real card is ready."'):''}${slot.option?C.pill('Option','watch'):''}${c.gameChanger?C.pill('GC','remove','title="Game Changer"'):''}</span></li>`;};
  const composition=compositionHTML(cards,curve,max,types);
  return `<section class="v-panel cm-deck-cards" id="cm-sec-cards"><div class="cm-deck-cards-head"><h2>The hundred <span class="cm-pull-n">${cards.reduce((n,x)=>n+x.q,0)}</span></h2><div class="cm-actions">${b('View deck cards','deck-cards',{deck:d.id},true)}${b('Export deck list','deck-export',{deck:d.id})}</div></div>${cards.length?'':'<p class="cm-muted">No cards yet. Edit the card list, or build one in the Deck Lab.</p>'}${composition}${[...groups].filter(([,l])=>l.length).map(([k,l])=>`<h3>${e(k)} <small>${l.reduce((n,x)=>n+x.slot.quantity,0)}</small></h3><ul class="cm-deck-list">${l.sort((a,b2)=>(Number(a.c.manaValue)||0)-(Number(b2.c.manaValue)||0)||a.c.name.localeCompare(b2.c.name)).map(line).join('')}</ul>`).join('')}</section>`;
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
    label=note(report?'Generated from this list and its measurement. It names only cards in the deck and claims nothing it did not count; the measured line is the simulator\u2019s, the rest is arithmetic.':'Generated from this list. Measure the deck in the Deck Lab and the measured line joins it. It names only cards in the deck and claims nothing it did not count.');
  }
  return label+`<p class="cm-guide-meta">${g.archetype?`<span class="cm-badge">${e(g.archetype)}</span>`:''}${g.difficulty?`<span class="cm-badge ${g.difficulty.tier==='Advanced'?'warn':g.difficulty.tier==='Beginner'?'good':''}">${e(g.difficulty.tier)}</span><span class="cm-muted">${e(g.difficulty.why)}</span>`:''}</p><p class="cm-guide-hook">${e(g.hook)}</p>${g.whatItDoes?`<h3>What it does</h3><p>${e(g.whatItDoes)}</p>`:''}<h3>How it wins</h3><p>${e(g.howItWins)}</p>${(g.turns||[]).map(t=>`<h3>${e(t.when)}</h3><p>${e(t.do)}</p>`).join('')}<h3>Mulligan</h3><p>${e(g.mulligan)}</p>${g.keyCards?.length?`<h3>Key cards</h3><ul class="cm-guide-keys">${g.keyCards.map(k=>`<li><button type="button" class="cm-card-name" data-action="card" data-card="${e(CrankCatalog.key(k.name))}">${e(k.name)}</button> — ${e(k.why)}</li>`).join('')}</ul>`:''}${g.watchFor?.length?`<h3>Watch for</h3><ul class="cm-guide-watch">${g.watchFor.map(x=>`<li>${e(x)}</li>`).join('')}</ul>`:''}`;
}
function commanderUse(c){const o=c.oracleText||'';if(/create/i.test(o)&&/goblin/i.test(o)&&/number of goblins/i.test(o))return 'Establish a Goblin board before tapping Krenko. More Goblins increase the number created by each activation; account for summoning sickness and protect the engine.';if(/token/i.test(o))return 'Set up the resources and timing this commander’s abilities require. Use the resulting tokens to support your deck’s plan, and leave the mana needed for its activated abilities.';if(/draw/i.test(o))return 'Sequence the plays that satisfy this commander’s draw ability, then use the extra cards to keep your plan moving. Keep interaction available when committing the commander.';return 'Build around the abilities shown here. Meet their trigger conditions or activation costs, time the commander around your available mana, and protect it when your next plays depend on it.';}
function structural(d,cards){const count=re=>cards.filter(x=>re.test(x.c.oracleText||'')).reduce((n,x)=>n+x.q,0),draw=count(/draw .*card/i),interaction=count(/destroy|exile target|counter target/i),lands=cards.filter(x=>/Land/.test(x.c.typeLine)).reduce((n,x)=>n+x.q,0);return {Strengths:`${draw} cards mention drawing cards; ${interaction} mention removal or countering. These are text matches, not modeled availability.`,Weaknesses:`${lands} lands in the list. Check opening-hand reliability and access to every commander color.`,Opportunities:`Explore ${mechanicsOf(d).list.join(', ')||'your commander’s core mechanics'} and compare role-compatible options while preserving the deck’s definition.`,Threats:'Opposing disruption, resource denial and faster win conditions need four-player testing. No matchup probability is asserted here.'};}
actions.deck=el=>go('decks',{deck:el.dataset.deck});actions['deck-cards']=el=>go('cards',{deck:el.dataset.deck});actions['deck-group']=el=>go('cards',{group:el.dataset.group});actions['open-lab']=()=>go('lab');
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
  const leaders=rows.map(r=>C.card(r.cardId)).filter(c=>c&&c.commander&&c.legalities?.commander==='legal');
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
actions['edit-deck']=el=>{const d=M.deck(C.state,el.dataset.deck);form('Deck Definition',f('Deck name','name',d.name,'required maxlength="160"')+f('Core mechanics (comma separated)','mechanics',d.definition.mechanics.join(', '),`placeholder="${e(mechanicsOf(d).derived?mechanicsOf(d).list.join(', '):'')}"`)+s('Base bracket','baseBracket',[1,2,3,4,5],d.definition.baseBracket)+s('Bracket ceiling','bracketCeiling',[1,2,3,4,5],d.definition.bracketCeiling)+f('Total price cap ($)','budget',d.definition.budget??'',`type="number" min="0" step="0.01" placeholder="${C.RULES?C.RULES.deckCap:225}"`)+f('Per-card price cap ($)','perCardCap',d.definition.perCardCap??'',`type="number" min="0" step="0.01" placeholder="${C.RULES?C.RULES.perCardMax:30}"`)+s('Collection group this deck draws from','groupId',C.state.groups.map(g=>[g.id,g.name]),d.groupId||(C.state.groups[0]&&C.state.groups[0].id)||'')+`<label class="cm-full">Deck notes<textarea name="notes">${e(d.notes)}</textarea></label>`,data=>commit({type:'editDeck',deckId:d.id,name:data.name,notes:data.notes,groupId:data.groupId||null,definition:{...d.definition,baseBracket:Number(data.baseBracket),bracketCeiling:Number(data.bracketCeiling),mechanics:data.mechanics.split(',').map(x=>x.trim()).filter(Boolean),/* BLANK MEANS THE HOUSE RULE. The caps used to be blank on every live deck, so nothing was
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
  if(!C.state.groups.length)throw Error('Create a collection group first, from the Cards page.');
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
    const main=fresh.slots.filter(r=>r.purpose==='main').map(r=>({c:C.card(r.cardId),q:r.quantity}));
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
  document.body.appendChild(menu);
  const place=()=>{if(!el.isConnected){if(menu.matches(':popover-open'))menu.hidePopover();return;}const r=el.getBoundingClientRect();if(r.bottom<0||r.top>window.innerHeight){if(menu.matches(':popover-open'))menu.hidePopover();return;}
    menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-width))+'px';
    menu.style.top=Math.min(r.bottom+6,window.innerHeight-menu.offsetHeight-8)+'px';};
  menu.showPopover();place();C.followAnchor(menu,place);menu.addEventListener('toggle',ev=>{if(ev.newState==='closed')menu.remove();});
  menu.addEventListener('click',ev=>{if(ev.target.closest('[data-action]'))menu.hidePopover();});
  return menu;
}
actions['deck-more-menu']=el=>{const d=M.deck(C.state,el.dataset.deck),g=attached(d),ladder=C.statusLadder||[],upgrades=d.slots.filter(r=>r.purpose!=='main').length;
  popMenu(el,`<p>${e(d.name)}</p>${g?b('View the collection group','deck-group',{group:g.id}):''}${b(g?'Change the collection group':'Attach a collection group','attach-group',{deck:d.id})}${b('Reserve available copies','fulfill',{deck:d.id})}${d.status==='final'?b(d.locked?'Unlock deck':'Lock deck','lock',{deck:d.id}):''}<hr>${b(`Upgrades (${upgrades})`,'deck-upgrades',{deck:d.id})}${b('Role lens (Discover)','deck-lens',{deck:d.id})}${d.status==='draft'?b(`Buy list (${M.readiness(C.state,d).toBuy})`,'deck-buy-list',{deck:d.id}):''}${b('Edit definition','edit-deck',{deck:d.id})}${b('Export deck list','deck-export',{deck:d.id})}${b('Archive deck','archive',{deck:d.id})}${d.archived?'':`<hr><p>${d.status==='draft'?'Every card in the draft list becomes':'Every card still owed becomes'}</p>${ladder.map(([id,label,why])=>`<button type="button" class="cm-rung" aria-label="${e(label)}" data-action="deck-status" data-deck="${e(d.id)}" data-source="${id}"><span class="cm-rung-label">${e(label)}</span><small>${e(why)}</small></button>`).join('')}`}<hr><p>Insight</p>${b('Recommendations','deck-suggestions',{deck:d.id})}${b('Reports & advice','deck-evidence',{deck:d.id})}${b(C.termsOn()?'Hide term definitions':'Show term definitions','toggle-terms')}`,290);};
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
  menu.innerHTML=`<p>${e(d.name)}</p>${b('Open deck','deck',{deck:d.id})}${b('View deck cards','deck-cards',{deck:d.id})}<hr>${d.archived?b('Restore as draft','restore-deck',{deck:d.id})+`<button data-action="delete-deck" data-deck="${e(d.id)}" class="cm-danger">Delete permanently</button>`:b('Archive deck','archive',{deck:d.id})}`;
  document.body.appendChild(menu);const r=el.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-230))+'px';menu.style.top=Math.min(r.bottom+6,window.innerHeight-260)+'px';menu.showPopover();menu.addEventListener('toggle',ev=>{if(ev.newState==='closed')menu.remove();});};
actions['delete-deck']=el=>{const d=M.deck(C.state,el.dataset.deck);if(!d.archived)throw Error('Archive the deck first. Delete permanently is offered on archived decks only.');
  const games=C.state.games.filter(g=>g.deckId===d.id).length,reports=C.state.reports.filter(r=>r.deckId===d.id).length;
  /* The typed DELETE goes with the message: a reader who has turned the warning off has
     said they know what this does, and asking them to type it anyway is theatre. What is
     never skipped is that it only applies to archived decks. */
  if(C.skipping('deleteDeck'))return commit({type:'deleteDeck',deckId:d.id,confirmed:true}).then(()=>{C.notice('Deleted permanently. You turned this confirmation off; User Functions → Confirmations turns it back on.');go('decks');});
  form('Delete '+d.name+' permanently',`<div class="cm-full">${note(`This removes the deck plan, ${reports} report${reports===1?'':'s'} and ${games} logged game${games===1?'':'s'}. Copies physically in it return to the Bench. Your owned cards are not deleted. This cannot be undone.`,true)}${f('Type DELETE to confirm','confirm','','required autocomplete="off"')}<label class="cm-checkbox cm-full"><input type="checkbox" name="skipNext">Don’t show this message again</label></div>`,async v=>{if(v.confirm!=='DELETE')throw Error('Type DELETE exactly.');if(v.skipNext)await C.setSkip('deleteDeck',true);await commit({type:'deleteDeck',deckId:d.id,confirmed:true});go('decks');},'Delete permanently');};
/* Straight through when the reader has said so, with a toast that names what happened and
   where the confirmation went, so a silent archive is never a mystery. */
actions.archive=el=>C.skipping('archive')
  ?commit({type:'archive',deckId:el.dataset.deck,confirmed:true}).then(()=>C.notice('Archived. You turned this confirmation off; User Functions → Confirmations turns it back on.'))
  :C.review('Archive this deck',note('Keep the plan and history. Owned copies go to compatible outstanding needs in deck priority order, then the Bench. Orders and actual box locations remain recorded.',true),{type:'archive',deckId:el.dataset.deck},{remember:'archive'});actions['restore-deck']=el=>commit({type:'restoreDeck',deckId:el.dataset.deck});
/* LOG A GAME, WITH THE FACTS THE RECORD CARD READS BACK: the date, the finish in a pod of
   how many, the bracket it was played at, the card that won it and the card that sat dead in
   hand -- both pickers limited to the deck's own list. */
actions['log-game']=el=>{const d=M.deck(C.state,el.dataset.deck),did=d.id,cards=d.slots.filter(r=>r.purpose==='main').map(r=>C.card(r.cardId)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>[c.id,c.name]);
  form('Log a real game',f('Date','playedAt',new Date().toISOString().slice(0,10),'type="date" required')+s('Outcome','outcome',[['win','Win'],['loss','Loss'],['draw','Draw'],['unfinished','Unfinished']],'win')+s('Finish','finish',[['','Not recorded'],1,2,3,4,5,6],'')+s('Pod size','pod',[['','Not recorded'],2,3,4,5,6],4)+s('Bracket','bracket',[['','Not recorded'],1,2,3,4,5],d.definition.baseBracket)+f('Turns (optional)','turns','','type="number" min="1" max="1000"')+s('Card that won it','mvpCardId',[['','—'],...cards],'')+s('Dead card in hand','deadCardId',[['','—'],...cards],'')+f('Opposing commanders / styles','opponents')+s('Your seat','seat',[['','Not recorded'],1,2,3,4],'')+`<label class="cm-full">What happened?<textarea name="notes" placeholder="Key plays, threat assessment, mulligans, mistakes or table agreements"></textarea></label>`,
    data=>Promise.resolve(commit({type:'game',deckId:did,outcome:data.outcome,playedAt:data.playedAt||undefined,finish:data.finish?Number(data.finish):null,pod:data.pod?Number(data.pod):null,bracket:data.bracket?Number(data.bracket):null,mvpCardId:data.mvpCardId||null,deadCardId:data.deadCardId||null,turns:data.turns?Number(data.turns):null,seat:data.seat?Number(data.seat):null,opponents:data.opponents,notes:data.notes})).then(()=>{if(C.route().view==='decks'&&C.route().params.get('deck')===did)go('decks',{deck:did,tab:'history'});}),'Save game record');};
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
  const name=id=>id&&C.card(id)?e(C.card(id).name):'—';
  return `<section class="v-panel cm-record" id="cm-sec-record">${head}<div class="cm-budget-figures cm-record-figures"><div><strong>${wins}–${losses}${games.length-decided?`–${games.length-decided}`:''}</strong><span>W–L${games.length-decided?'–other':''}, last ${games.length}</span></div><div><strong>${rate===null?'—':Math.round(rate*100)+'%'}</strong><span>win rate · n = ${decided}</span></div><div><strong>${perWin===null?'—':C.money(Math.round(perWin*100)/100)}</strong><span>paid per win</span></div></div><p class="cm-muted">${verdict}</p><div class="cm-table-wrap"><table class="cm-table cm-record-table"><thead><tr><th scope="col">When</th><th scope="col">Result</th><th scope="col">Finish</th><th scope="col">Bracket</th><th scope="col">Won it</th><th scope="col">Dead in hand</th><th scope="col">Turns</th><th scope="col">Evidence</th></tr></thead><tbody>${games.slice(0,10).map(g=>`<tr><td>${dateOf(g)}</td><td>${C.pill(e(g.outcome),g.outcome==='win'?'inbox':g.outcome==='loss'?'remove':'watch')}</td><td>${g.finish?`${g.finish}${g.pod?' of '+g.pod:''}`:'—'}</td><td>${g.bracket?'B'+g.bracket:'—'}</td><td>${name(g.mvpCardId)}</td><td>${name(g.deadCardId)}</td><td>${g.turns??'—'}</td><td>${g.online?b('Online report','online-game-report',{deck:d.id,game:g.id},false,{cls:'compact'}):'Manual log'}</td></tr>`).join('')}</tbody></table></div></section>`;}
actions['online-game-report']=el=>{const d=M.deck(C.state,el.dataset.deck),g=C.state.games.find(item=>item.id===el.dataset.game&&item.deckId===d.id);if(!g?.online)throw Error('That online match report is no longer available.');const r=g.online,c=r.telemetry?.counts||{},recommendations=r.deckSignals?.recommendations||[];
  modal(`Online match · ${d.name} · ${String(r.completedAt||g.at).slice(0,10)}`,`${note(`${String(r.outcome).toUpperCase()} · ${r.turns??'?'} turns · ${r.podSize??g.pod??'?'} players · journal ${r.telemetry?.integrity?.complete?'complete':'needs review'}`)}<div class="cm-budget-figures"><div><strong>${c.spells||0}</strong><span>spells</span></div><div><strong>${c.triggers||0}</strong><span>triggers</span></div><div><strong>${c.abilities||0}</strong><span>abilities</span></div><div><strong>${c.battlefieldDeaths||0}</strong><span>battlefield deaths</span></div></div><h3>Deck signals</h3><ul>${recommendations.map(item=>`<li><strong>${e(item.confidence||'evidence')}:</strong> ${e(item.text)}</li>`).join('')||'<li>No recommendation was generated from this match.</li>'}</ul><h3>Player feedback</h3><p>${e(r.playerFeedback?.notes||'No written feedback.')}</p><details class="cm-details"><summary>Full sanitized match report</summary><pre style="white-space:pre-wrap">${e(JSON.stringify(r,null,2))}</pre></details>`);};
actions['deck-export']=el=>{const d=M.deck(C.state,el.dataset.deck);C.download(d.name.replace(/[^\w-]+/g,'-')+'.txt',d.slots.filter(r=>r.purpose==='main').map(r=>r.quantity+' '+C.card(r.cardId).name).join('\n'),'text/plain');};
actions['deck-evidence']=el=>{const d=M.deck(C.state,el.dataset.deck),reports=C.state.reports.filter(r=>r.deckId===d.id),advice=C.state.advice.filter(r=>r.deckId===d.id),games=C.state.games.filter(r=>r.deckId===d.id);modal('Reports, advice & game history',`${note('Every measured run is filed here and under Simulation history on the deck page. Imported reports keep their protocol and exact-list fingerprint; a list change makes older results historical, not current.')}${b('Import report / advice pack','import-evidence',{deck:d.id})}${b('Compare reports','compare-reports',{deck:d.id})}${b('Export advice request','advice-request',{deck:d.id})}<h3>Simulation reports</h3>${reports.map(r=>`<details class="cm-details"><summary>${e(r.protocol)} · ${e(r.importedAt)} · ${r.deckFingerprint===M.fingerprint(d)?'Current list':'Historical list'}</summary><pre style="white-space:pre-wrap">${e(JSON.stringify(r,null,2))}</pre></details>`).join('')||'<p>No imported reports.</p>'}<h3>Advice</h3>${advice.map(r=>`<article>${note(r.deckFingerprint===M.fingerprint(d)?'Matches current list':'Historical advice for a different list')}<p style="white-space:pre-wrap">${e(r.text)}</p></article>`).join('')||'<p>No advice packs.</p>'}<h3>Recorded games</h3>${games.map(g=>`<p><strong>${e(g.outcome)}</strong> · ${e(String(g.at).slice(0,10))}${g.finish?` · ${g.finish}${g.pod?' of '+g.pod:''}`:''}${g.bracket?' · B'+g.bracket:''} · ${g.turns??'?'} turns<br>${e(g.notes)}</p>`).join('')||'<p>No games logged yet.</p>'}`);};
/* THE WHOLE LIST AT A STATUS, FROM THE DECK. A draft saved from the Lab is a hundred plans,
   and the reader who owns most of them says so once here rather than a hundred times in the
   Collection. On a finalized deck it takes only what is still owed. */
actions['deck-status']=el=>{const d=M.deck(C.state,el.dataset.deck),source=el.dataset.source,label=C.source(source);
  C.review(`Set ${d.name}’s cards to ${label}`,note(d.status==='draft'?`One copy record per card in the draft list, at ${label}, filed under the deck’s collection group. Cards that already have copies filed there are skipped, so this can be run again after the list changes.`:`Only what the deck still owes: one copy record per outstanding card at ${label}, reserved to its slot.`),{type:'acquireSlots',deckId:d.id,source});};
actions['deck-report']=el=>{const d=M.deck(C.state,el.dataset.deck),r=C.state.reports.find(x=>x.id===el.dataset.report&&x.deckId===d.id);if(!r)throw Error('That report is no longer in the library.');
  modal(`Simulation report · ${d.name} · ${when(r.importedAt)}`,(r.deckFingerprint===M.fingerprint(d)?'':note('Historical: this run measured an earlier version of the list.'))+(r.list?.length?`<div class="cm-actions cm-report-actions">${b('Spin off as a new deck','report-spinoff',{deck:d.id,report:r.id},true)}<span class="cm-muted">The ${r.list.reduce((n,x)=>n+x.quantity,0)} cards this run measured become a finalized deck of their own, with this commander; this deck is untouched.</span></div>`:'')+(C.reportHTML?C.reportHTML(r,d.definition):`<pre style="white-space:pre-wrap">${e(JSON.stringify(r,null,2))}</pre>`));};
/* A MEASURED HUNDRED AS ITS OWN DECK. The report carries the list it measured; spinning it off
   creates a deck from exactly that list, finalizes it so its claims are real, and files a copy
   of the report with it. Finalize can refuse (a cap, a legality change since the run): the
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
  try{await C.commit({type:'batch',commands:[create,{type:'finalize',deckId:id},copy],summary:`Spun off ${name} from a simulation report and finalized it`},{renderView:false});C.notice(`${name} is a finalized deck of its own.`);}
  catch(err){await C.commit({type:'batch',commands:[create,copy],summary:`Spun off ${name} from a simulation report as a draft`},{renderView:false});C.notice(`${name} was saved as a draft, not finalized: ${err.message}`,true);}
  actions.close();go('decks',{deck:id});};
actions['measure-deck']=async el=>{const d=M.deck(C.state,el.dataset.deck);if(!C.measureDeck)throw Error('The simulator is not loaded.');
  const say=t=>{const pill=$('#cm-deck-sim-status');if(pill){pill.hidden=false;pill.textContent=t;}};say('Starting…');
  try{const {report,result}=await C.measureDeck(d.id,say);C.notice(`Measured ${report.metrics.score.value} points from ${result.games.toLocaleString()} games in ${(result.elapsedMs/1000).toFixed(1)}s. Filed under Simulation history.`);}
  catch(err){say(err.message);throw err;}};
actions['advice-request']=el=>{const d=M.deck(C.state,el.dataset.deck);C.download('CrankMagic-advice-request.json',JSON.stringify({format:'crankmagic-advice-request',version:1,deckFingerprint:M.fingerprint(d),definition:d.definition,deckName:d.name,cards:d.slots.map(r=>({name:C.card(r.cardId).name,quantity:r.quantity,purpose:r.purpose,oracleText:C.card(r.cardId).oracleText})),responseContract:{kind:'advice',deckFingerprint:'Copy the exact supplied fingerprint',text:'Explain strategy, sequencing, weaknesses and proposed replacements. Do not invent simulator results.'}},null,2));};
actions['import-evidence']=el=>{const d=M.deck(C.state,el.dataset.deck);form('Import versioned report or advice',`<div class="cm-full">${note('Accepts a JSON object with kind (report or advice), deckFingerprint, and protocol for reports or text for advice. Imported material is labeled and never executed.')}<label>JSON file<input name="file" type="file" accept=".json" required></label></div>`,async(_,formEl)=>{const file=formEl.elements.file.files[0];if(file.size>10000000)throw Error('Limit evidence packs to 10 MB.');const data=CrankEvidence.validate(JSON.parse(await file.text()));const known=[M.fingerprint(d),...d.versions.map(v=>M.fingerprint(v))];if(!known.includes(data.deckFingerprint))throw Error('This pack does not match any retained version of this deck. Its original version must be present before importing.');if(!['report','advice'].includes(data.kind))throw Error('Set kind to report or advice.');if(data.kind==='report'&&(!data.protocol||typeof data.metrics!=='object'||!data.versions))throw Error('Reports need protocol, versions and metrics provenance.');await commit({type:data.kind,deckId:d.id,[data.kind]:data});},'Import pack');};
});
