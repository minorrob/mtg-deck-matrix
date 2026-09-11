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
  if(!reports.length)return `<section class="v-panel cm-history"><h2>Simulation history</h2><p>No measurement yet. Measure this deck and every run is kept here — the score, what it measured, and which list it measured.</p><div class="cm-actions">${b('Measure this deck','measure-deck',{deck:d.id},true)}${status}</div><p class="cm-muted">Measuring runs the engine in the background on the published protocol — six seeds of 20,000 games — and files the report here when it finishes.</p></section>`;
  return `<section class="v-panel cm-history"><h2>Simulation history</h2><p class="cm-muted">${reports.length} measured run${reports.length===1?'':'s'}, newest first. A run is filed the moment it finishes; a list change makes earlier runs historical, not wrong.</p><div class="cm-table-wrap"><table class="cm-table cm-history-table"><thead><tr><th scope="col">When</th><th scope="col">Protocol</th><th scope="col">Score</th><th scope="col">Win rate</th><th scope="col">Avg win turn</th><th scope="col">Games</th><th scope="col">List</th><th scope="col">Report</th></tr></thead><tbody>${reports.map(r=>`<tr><td>${e(when(r.importedAt))}</td><td>${e(r.protocol)}</td><td><strong>${metric(r,'score')}</strong>${r.metrics&&r.metrics.scoreStandardError?` <small class="cm-muted">± ${metric(r,'scoreStandardError')}</small>`:''}</td><td>${metric(r,'winRate','%')}</td><td>${metric(r,'averageWinTurn')}</td><td>${((r.run&&r.run.games)||0).toLocaleString()}</td><td>${r.deckFingerprint===fp?'<span class="cm-badge good">Current list</span>':'<span class="cm-badge">Historical list</span>'}</td><td>${b('View report','deck-report',{deck:d.id,report:r.id},false,{cls:'compact'})}</td></tr>`).join('')}</tbody></table></div><div class="cm-actions">${b('Measure again','measure-deck',{deck:d.id})}${reports.length>1?b('Compare two runs','compare-reports',{deck:d.id}):''}${b('Reports & advice','deck-evidence',{deck:d.id})}${status}</div></section>`;
}
const art=d=>{const name=commander(d).toLowerCase();for(const n of ['atraxa','krenko','shadrix','chulane'])if(name.includes(n))return 'assets/crankmagic/commander-'+n+'.webp?v=1';return C.state.cards[d.commanders[0]]?.image||'';};
/* THE RIBBON READS LEFT TO RIGHT IN THE ORDER THE WORK HAPPENS: what the list asks for,
   what you have for it, what is on its way, what is still owed -- and last, separately,
   where the cards physically are. "In deck" used to lead, and it meant the physical box,
   so a deck you had finished buying read 0 and the ribbon looked broken rather than
   merely unconfirmed. */
function stats(d){const r=M.readiness(C.state,d);return `<div class="cm-stats"><div><strong>${r.target}</strong><span>planned</span></div><div><strong>${r.owned}</strong><span>owned &amp; reserved</span></div><div><strong>${r.ordered}</strong><span>ordered</span></div><div><strong>${r.toBuy}</strong><span>${d.status==='draft'?'not yet reserved':'to buy'}</span></div><div><strong>${r.placed}</strong><span>in deck box</span></div></div>`;}
views.decks=async params=>{const did=params.get('deck');if(did){await overview(M.deck(C.state,did));return;}const decks=C.state.decks.filter(d=>showArchived||!d.archived),picks=(C.state.preferences.comparisonPicks||[]).filter(id=>C.state.decks.some(d=>d.id===id));
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
return `<article class="cm-deck-tile${picked?' is-picked':''}">${art(d)?`<img class="cm-deck-art" src="${e(art(d))}" alt="" loading="lazy">`:''}<label class="cm-tile-pick" title="Tick to compare this deck"><input type="checkbox" data-action="compare-pick" data-deck="${e(d.id)}"${picked?' checked':''} aria-label="Compare ${e(d.name)}"></label><button data-action="deck" data-deck="${e(d.id)}"><span class="cm-badge ${r.ready?'good':''}">${d.archived?'Archived':r.ready?'Ready to play':'In progress'}</span><small>${e(d.name)}</small><h3>${e(commander(d)||'Choose a commander')}</h3><p>${e(d.definition.mechanics.join(' · ')||'Mechanic to explore')}</p><span class="cm-tile-mana">${C.colors(C.state.cards[d.commanders[0]]?.colorIdentity)}</span></button><footer><span>B${d.definition.baseBracket}${scoreOf(latestReport(d))?` · <span class="cm-badge" title="Latest measured score">${e(scoreOf(latestReport(d)))} pts</span>`:''}</span><span class="cm-muted">${r.owned} / ${r.target} in hand${d.locked?' · Locked':''}</span><span class="cm-tile-tools"><button type="button" class="cm-icon-button cm-tile-menu-btn" data-action="deck-menu" data-deck="${e(d.id)}" aria-haspopup="menu" aria-label="Deck options for ${e(d.name)}">⋯</button></span></footer></article>`;}).join('')}</div>`:`<section class="v-panel cm-empty"><h2>A fresh library. A new deck.</h2><p>Start from a commander and let the Lab build the 99, or paste a list you already have. Adding a plan creates no owned copies.</p><div class="cm-actions">${b('Select a commander','open-lab',{},true)}${b('Import a list','import-list')}${b('Import a backup','restore')}</div></section>`);$('#cm-show-archived').addEventListener('change',ev=>{showArchived=ev.target.checked;C.render();});};
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
C.main.innerHTML=`<section class="cm-deck-hero"${heroArt?` style="--hero:url('${e(heroArt)}')"`:''}><div class="cm-deck-hero-copy"><div class="v-eyebrow cm-eyebrow-warm">My Decks / Deck overview</div><h1>${e(d.name)}</h1><p>${e(commander(d))} ${C.colors(C.state.cards[d.commanders[0]]?.colorIdentity)} <span class="cm-badge ${ready.ready?'good':''}">${d.archived?'Archived':d.status==='draft'?'Draft':ready.ready?'Ready to play':'In progress'}</span> <span class="cm-badge">Bracket ${e(String(d.definition.baseBracket))}–${e(String(d.definition.bracketCeiling))}</span>${overCap?` <span class="cm-badge warn" title="Recorded prices of the main list against the definition’s total cap">Over the ${e(C.money(cap))} cap · about ${e(C.money(spend))}</span>`:''}${latest?` <span class="cm-badge" title="Latest measured score">Measured ${e(scoreOf(latest))} pts</span>`:''}${attached(d)?` <button type="button" class="cm-badge cm-badge-link" data-action="deck-group" data-group="${e(d.groupId)}" title="Open this group in the Collection">Group: ${e(attached(d).name)}</button>`:''}${d.locked?' <span class="cm-badge warn">Locked</span>':''}</p></div><div class="cm-actions">${b('View deck cards','deck-cards',{deck:d.id},true)}${b('Edit definition','edit-deck',{deck:d.id})}${d.status==='draft'?b('Edit card list','edit-list',{deck:d.id}):''}</div></section>`+stats(d)+/* THREE THINGS YOU DO TO A DECK, AND TWO DRAWERS FOR THE REST. Nine buttons in one row
   made the two that matter -- where the deck's cards come from, and whether it is settled --
   as easy to miss as Export deck list. The row is now the work, in the order it happens:
   the group it draws from, reserving copies against it, and locking it once it is together.
   Everything that reads the deck goes behind Insight; everything administrative behind
   Manage. Put the deck in its box is gone from here entirely: which box a copy sits in is a
   fact about that copy, recorded per card (or per tick) in the Collection, and for this
   app's purposes locking the deck is the sentence a reader means by it. */
`<div class="cm-actions">${d.archived?b('Restore as draft','restore-deck',{deck:d.id})+b('Delete permanently','delete-deck',{deck:d.id}):b('Collection group','group-menu',{deck:d.id})+b('Card status','deck-status-menu',{deck:d.id},false,{caret:'down'})+b('Reserve available copies','fulfill',{deck:d.id})+(d.status==='draft'?b('Finalize & reserve','finalize',{deck:d.id}):b(d.locked?'Unlock deck':'Lock deck','lock',{deck:d.id}))}${b('Insight','deck-insight-menu',{deck:d.id},false,{caret:'down'})}${b('Manage','deck-manage-menu',{deck:d.id},false,{caret:'down'})}</div>`+(d.archived?note('Archived: this list remains in history. Its copies were released; their actual physical boxes are still recorded.'):d.status==='draft'?note('Draft: review the list before finalizing. There are no reservations until you finalize.'+(overCap?` This list is about ${C.money(spend)} at recorded prices against a ${C.money(cap)} cap; Finalize will offer to raise or remove the cap, or trim the list first.`:''),overCap):note('Finalized: reservations track what this list needs. Put the deck in its box once you have sleeved it, or confirm copies one at a time from the Collection.'))+`<div class="cm-grid-2"><section class="v-panel"><h2>Composition</h2><div class="cm-curve" aria-label="Mana curve">${curve.map((n,i)=>`<div><span>${n}</span><i style="height:${n/max*88}px"></i><span>${i===7?'7+':i}</span></div>`).join('')}</div><div class="cm-count-list">${types.map(t=>`<span>${C.glossary.html(t)} <strong>${cards.filter(x=>x.c.typeLine.includes(t)).reduce((n,x)=>n+x.q,0)}</strong></span>`).join('')}<span>Ramp <strong>${cards.filter(x=>rolesOf(x.c).includes('ramp')).reduce((n,x)=>n+x.q,0)}</strong></span></div><small>Multitype cards appear in each applicable type. Ramp is read from the rules text by the same classifier the graph uses.</small></section><section class="v-panel">${leaders.map(c=>`<div class="cm-commander">${c.image?`<img src="${e(c.image)}" alt="${e(c.name)}">`:'<div></div>'}<div><h2>About the Commander</h2><h3>${e(c.name)}</h3><ul><li>${C.mana(c.manaCost)} · ${c.power!==null?e(c.power+'/'+c.toughness)+' · ':''}${C.glossary.html(c.typeLine)}</li><li>${C.glossary.html(c.keywords.join(', ')||'No keyword abilities recorded')}</li>${c.oracleText.split('\n').filter(line=>/^(When|Whenever|At the beginning)|:/.test(line)).map(t=>`<li>${C.glossary.html(t)}</li>`).join('')}</ul><p>${e(commanderUse(c))}</p>${b('Full card & rules','card',{card:c.id})}</div></div>`).join('<hr>')}</section></div><div class="cm-grid-2"><section class="v-panel"><h2>Strategy & how to play</h2>${guideHTML(guide,d,leaders,cards)}<h3>Your notes</h3><p>${e(d.notes||'No deck notes yet.')}</p></section><section class="v-panel"><h2>SWOT & recommendations</h2>${note('Structural observations from this list: text matches, not modeled availability. Measured performance is in Simulation history below; matchup-specific advice still needs four-player testing.')}<div class="cm-swot">${Object.entries(swot).map(([k,v])=>`<div><h3>${e(k)}</h3><p>${e(v)}</p></div>`).join('')}</div><h3>Review next</h3><ul>${issues.slice(0,5).map(x=>`<li>${e(x)}</li>`).join('')||'<li>The basic Commander list checks pass. Review price, bracket expectations and your playgroup’s preferences.</li>'}</ul>${b('Explore recommendations','deck-suggestions',{deck:d.id})}${b('Review linked upgrades','deck-cards',{deck:d.id})}</section></div>`+historyHTML(d);}
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
actions['edit-deck']=el=>{const d=M.deck(C.state,el.dataset.deck);form('Deck Definition',f('Deck name','name',d.name,'required maxlength="160"')+f('Core mechanics (comma separated)','mechanics',d.definition.mechanics.join(', '))+s('Base bracket','baseBracket',[1,2,3,4,5],d.definition.baseBracket)+s('Bracket ceiling','bracketCeiling',[1,2,3,4,5],d.definition.bracketCeiling)+f('Total price cap ($; blank means no cap)','budget',d.definition.budget??'','type="number" min="0" step="0.01"')+f('Per-card price cap ($)','perCardCap',d.definition.perCardCap??'','type="number" min="0" step="0.01"')+s('Collection group this deck draws from','groupId',C.state.groups.map(g=>[g.id,g.name]),d.groupId||(C.state.groups[0]&&C.state.groups[0].id)||'')+`<label class="cm-full">Deck notes<textarea name="notes">${e(d.notes)}</textarea></label>`,data=>commit({type:'editDeck',deckId:d.id,name:data.name,notes:data.notes,groupId:data.groupId||null,definition:{...d.definition,baseBracket:Number(data.baseBracket),bracketCeiling:Number(data.bracketCeiling),mechanics:data.mechanics.split(',').map(x=>x.trim()).filter(Boolean),budget:data.budget===''?null:Number(data.budget),perCardCap:data.perCardCap===''?null:Number(data.perCardCap)}}));};
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
actions['deck-insight-menu']=el=>{const d=M.deck(C.state,el.dataset.deck);popMenu(el,`<p>What this deck looks like</p>${b('Recommendations','deck-suggestions',{deck:d.id})}${b('Reports & advice','deck-evidence',{deck:d.id})}`);};
actions['deck-manage-menu']=el=>{const d=M.deck(C.state,el.dataset.deck);popMenu(el,`<p>${e(d.name)}</p>${b('Log a game','log-game',{deck:d.id})}${b('Export deck list','deck-export',{deck:d.id})}<hr>${b('Edit definition','edit-deck',{deck:d.id})}${b('Archive deck','archive',{deck:d.id})}`);};
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
actions['log-game']=el=>{const did=el.dataset.deck;form('Log a real game',s('Outcome','outcome',[['win','Win'],['loss','Loss'],['draw','Draw'],['unfinished','Unfinished']],'win')+f('Turns (optional)','turns','','type="number" min="1" max="1000"')+f('Opposing commanders / styles','opponents')+s('Your seat','seat',[['','Not recorded'],1,2,3,4],'')+`<label class="cm-full">What happened?<textarea name="notes" placeholder="Key plays, threat assessment, mulligans, mistakes or table agreements"></textarea></label>`,data=>commit({type:'game',deckId:did,outcome:data.outcome,turns:data.turns?Number(data.turns):null,seat:data.seat?Number(data.seat):null,opponents:data.opponents,notes:data.notes}),'Save game record');};
actions['deck-export']=el=>{const d=M.deck(C.state,el.dataset.deck);C.download(d.name.replace(/[^\w-]+/g,'-')+'.txt',d.slots.filter(r=>r.purpose==='main').map(r=>r.quantity+' '+C.state.cards[r.cardId].name).join('\n'),'text/plain');};
actions['deck-evidence']=el=>{const d=M.deck(C.state,el.dataset.deck),reports=C.state.reports.filter(r=>r.deckId===d.id),advice=C.state.advice.filter(r=>r.deckId===d.id),games=C.state.games.filter(r=>r.deckId===d.id);modal('Reports, advice & game history',`${note('Every measured run is filed here and under Simulation history on the deck page. Imported reports keep their protocol and exact-list fingerprint; a list change makes older results historical, not current.')}${b('Import report / advice pack','import-evidence',{deck:d.id})}${b('Compare reports','compare-reports',{deck:d.id})}${b('Export advice request','advice-request',{deck:d.id})}<h3>Simulation reports</h3>${reports.map(r=>`<details class="cm-details"><summary>${e(r.protocol)} · ${e(r.importedAt)} · ${r.deckFingerprint===M.fingerprint(d)?'Current list':'Historical list'}</summary><pre style="white-space:pre-wrap">${e(JSON.stringify(r,null,2))}</pre></details>`).join('')||'<p>No imported reports.</p>'}<h3>Advice</h3>${advice.map(r=>`<article>${note(r.deckFingerprint===M.fingerprint(d)?'Matches current list':'Historical advice for a different list')}<p style="white-space:pre-wrap">${e(r.text)}</p></article>`).join('')||'<p>No advice packs.</p>'}<h3>Recorded games</h3>${games.map(g=>`<p><strong>${e(g.outcome)}</strong> · ${e(g.at)} · ${g.turns??'?'} turns<br>${e(g.notes)}</p>`).join('')||'<p>No games logged yet.</p>'}`);};
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
