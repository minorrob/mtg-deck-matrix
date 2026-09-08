/* The Deck Lab: choose a commander, define the deck, draft the 99, measure it, and only
 * then -- on a click that says so -- make it a deck.
 *
 * THE DRAFT IS A PREVIEW. "Run initial draft" used to create a deck in My Decks as a side
 * effect, so trying three budgets left three drafts behind. Now it builds a preview the
 * Lab keeps (and remembers across a reload, in preferences.labPreview, with the cards
 * themselves saved as identities -- never as copies you own). "Save this deck" is the
 * only thing that writes to My Decks, and it is available from the moment the starting
 * point is filled in: a commander alone can be saved and drafted later.
 *
 * MEASUREMENT IS CONNECTED; REFINEMENT IS NOT. "Measure" runs the real engine through
 * crankmagic-sim.js, in a worker, on the published protocol, against the preview or the
 * saved deck, and files a comparable report. A card the engine cannot read is fetched from
 * Scryfall first -- two requests for a hundred cards -- rather than handed back to the
 * reader as a wall. The two refinement steps between the draft and the report need a
 * candidate search that has not been built, so they stay waiting and say why. A step that
 * did not happen never lights up: the orb state is derived from stored evidence.
 *
 * THE PICKER REACHES EVERY LEGAL COMMANDER. The catalog registers 3,411 of them; the old
 * pane showed the 45 most popular and nothing said so, which read as "only the commanders
 * we already worked with". Now it says how many match, pages through them, filters by
 * colour identity as well as name, play style and rank, and inspects any of them. */
(globalThis.CrankFeatures ||= []).push(function(C){
const {M,esc:e,button:b,field:f,select:s,note,form,modal,actions,views,$}=C;
let leader=null,partner=null,mode='commander',groupId='',deckId='',draftName='',definition=M.defaultDefinition(),pool='all',includeInDeck=false,includeReserved=false;
let preview=null;          // the drafted list that is not yet a deck
let shownLimit=45;         // how many picker rows are drawn before "Show more"
let pickerColors=[];       // the picker's colour-identity filter
let runner=null;
const choices=CrankCatalog.MECHANICS.map(([label])=>label);
const STEPS=['User Input Captured','Initial 99 Cards Chosen','Simulator & 99 Refined','Simulator loops complete','Simulation Report','Completed Deck'];
const COLORS=[['W','White'],['U','Blue'],['B','Black'],['R','Red'],['G','Green']];
const total=rows=>(rows||[]).reduce((n,r)=>n+Number(r.quantity||1),0);
const cardOf=id=>C.state.cards[id]||C.catalog.get(id)||null;
const leadersOf=p=>(p?.commanders||[]).map(cardOf).filter(Boolean);

/* A preview survives a reload only if every card it names is still known. */
function restorePreview(){
  const p=C.state.preferences.labPreview;
  if(!p||!Array.isArray(p.slots)||!p.slots.length)return null;
  if(!p.slots.every(r=>cardOf(r.cardId))||!leadersOf(p).length)return null;
  return p;
}
async function keepPreview(next){preview=next;await C.commit({type:'preferences',values:{labPreview:next}},{renderView:false});}

views.lab=async()=>{
  preview=preview||restorePreview();
  const last=C.state.preferences.lastLabRun,saved=last?C.state.decks.find(x=>x.id===last.deckId):null;
  if(preview&&!leader)leader=leadersOf(preview)[0]||null;
  C.main.innerHTML=C.head('Deck Lab · Find a commander → build the 99','The deck you want to play.','Start with a commander or an existing list. Define the deck, draft the initial cards, measure them, then save what you decide to keep.',b('?','lab-help'))
    +`<div class="cm-lab-grid"><section class="v-panel"><form id="cm-lab-form"><h2>Starting point</h2>${s('Start from','mode',[['commander','Select Commander → Auto-build 99'],['list','Existing list or Collection group']],mode)}
    <h3 class="cm-section-heading">Commander choice</h3><p class="cm-muted">Every verified legal commander in the catalog — ${C.catalog.all().filter(c=>c.commander&&c.legalities?.commander==='legal').length.toLocaleString()} of them — including cards you may need to buy. These filters only choose the commander.</p>
    <div class="cm-form-grid">${f('Search commander name','commanderQuery',leader?.name||'','autocomplete="off" placeholder="Name, or a printed variant name"')}${s('Play style filter','commanderMechanic',[['','Any play style'],...choices],'')}${s('EDHREC rank filter','rank',[['','Any rank'],['100','Top 100'],['500','Top 500'],['1000','Top 1,000']],'')}
    <div><span class="cm-muted" style="font-size:13px">Colour identity within</span><div class="cm-color-pills">${COLORS.map(([k,name])=>`<label class="cm-color-pill" title="${e(name)}"><input type="checkbox" name="commanderColor" value="${k}" ${pickerColors.includes(k)?'checked':''}><img src="assets/mana/${k}.svg?v=1" alt="">${k}</label>`).join('')}<label class="cm-color-pill" title="Colorless commanders only"><input type="checkbox" name="commanderColor" value="C" ${pickerColors.includes('C')?'checked':''}>C</label></div></div></div>
    <div class="cm-commander-results" id="cm-lab-results"></div>
    <div class="cm-actions">${b('Search exact name / link','lab-resolve')}${b('Record an unlisted commander','lab-manual')}${b('Add partner / second commander','lab-partner')}${b('Remove second commander','lab-unpartner')}</div>
    <div id="cm-lab-selected"></div>
    <p class="cm-muted">EDHREC commander popularity · past 2 years · snapshot: ${e(C.catalog.rankDate?.slice(0,10)||'date unavailable')}. Results are ordered by rank; unranked commanders follow. A rank filter excludes unknown and combined-pair ranks.</p>
    <div id="cm-existing-list" ${mode==='list'?'':'hidden'}><h3 class="cm-section-heading">Existing cards</h3>${s('Collection group','group',[['','Choose a group'],...C.state.groups.map(g=>[g.id,g.name])],groupId)}${s('Or an existing deck','existingDeck',[['','Choose a deck'],...C.state.decks.filter(x=>!x.archived).map(x=>[x.id,x.name])],deckId)}<div class="cm-actions" style="margin-top:12px">${b('Create group / import list','import-list')}${b('Create empty group','new-group')}</div></div>
    <h3 class="cm-section-heading">Deck Definition</h3><p class="cm-muted">These inputs apply to the full list and the way you want it to play.</p>
    <div class="cm-form-grid">${f('Deck name','deckName',draftName,'placeholder="My new Commander deck"')}${s('Primary play style','mechanic',[['','Open to exploration'],...choices],definition.mechanics[0]||'')}${s('Base bracket','baseBracket',[1,2,3,4,5],definition.baseBracket)}${s('Bracket ceiling','bracketCeiling',[1,2,3,4,5],definition.bracketCeiling)}${f('Total deck price cap ($)','budget',definition.budget??'','type="number" min="0" step="0.01" placeholder="No cap"')}${f('Per-card cap ($)','perCardCap',definition.perCardCap??'','type="number" min="0" step="0.01" placeholder="No cap"')}${s('Play style','playStyle',['Balanced','Aggressive','Reactive','Value engine','Combo'],definition.playStyle)}${s('Speed','speed',[1,2,3,4,5],definition.speed)}${s('Competitiveness','competitiveness',[1,2,3,4,5],definition.competitiveness)}${s('Saltiness','saltiness',[[1,'1 · Extremely friendly'],[2,'2 · Friendly'],[3,'3 · Assertive'],[4,'4 · Disruptive'],[5,'5 · Any legal winning mechanic']],definition.saltiness)}${s('Initial card pool','pool',[['all','All legal catalog cards'],['owned','Use my eligible owned copies']],pool)}<label class="cm-checkbox"><input name="inDeck" type="checkbox" ${includeInDeck?'checked':''}>Consider cards currently In deck</label><label class="cm-checkbox"><input name="reserved" type="checkbox" ${includeReserved?'checked':''}>Consider unlocked reserved copies</label><label class="cm-checkbox"><input name="sellTrade" type="checkbox" ${definition.reuse.includeSellTrade!==false?'checked':''}>Include available Sell / Trade copies</label><label class="cm-full">Restrictions and preferences<textarea name="restrictions">${e(definition.restrictions)}</textarea></label></div>
    ${note('A total price cap is planned, not merely obeyed: basics do the cheap work, no single card takes more than a few times an even share of the cap, and the list always completes or says what cap would complete it. Unknown prices are excluded when a cap is set. Bracket ceiling limits Game Changers (none below 3, three at 3). Play style, speed and saltiness still require your review: the simulator measures a finished list, it does not yet refine one against these inputs.')}
    <p class="cm-error" id="cm-lab-error" hidden role="alert"></p></form></section>${runPane(saved)}</div>`;

  const results=$('#cm-lab-results'),lab=$('#cm-lab-form');
  function search(){
    const q=lab.elements.commanderQuery.value,mech=lab.elements.commanderMechanic.value,rankMax=lab.elements.rank.value?Number(lab.elements.rank.value):null;
    const colorless=pickerColors.includes('C');
    let rows=C.catalog.search(q,{commander:true,mechanic:mech,rankMax,limit:Infinity,colors:pickerColors.filter(k=>k!=='C')});
    if(colorless)rows=rows.filter(c=>!(c.colorIdentity||[]).length);
    const shown=rows.slice(0,shownLimit),narrowed=q||mech||rankMax||pickerColors.length;
    results.innerHTML=rows.length?`<p class="cm-muted cm-picker-count">${rows.length.toLocaleString()} legal commander${rows.length===1?'':'s'} match · showing ${shown.length} by EDHREC popularity${narrowed?'':' — type a name, or filter by play style or colour'}</p>`
      +shown.map(c=>{const styles=CrankCatalog.playStyles(c).slice(0,2).join(' · ');return `<div class="cm-commander-result cm-picker-row"><button type="button" class="cm-picker-choose" data-lab-commander="${e(c.id)}"><strong>${e(c.name)}</strong>${c.flavorName?`<em>${e(c.flavorName)}</em>`:''}</button><span class="cm-picker-cost">${c.manaCost?C.mana(c.manaCost):(c.manaValue!==null&&c.manaValue!==undefined?`<small class="cm-muted">MV ${e(String(c.manaValue))}</small>`:'')}</span>${C.colors(c.colorIdentity)}<span class="cm-picker-meta">${c.commanderRank?'#'+Number(c.commanderRank).toLocaleString()+' · ':''}${e(styles||c.mechanics[0]||c.keywords[0]||'Explore abilities')}</span><button type="button" class="cm-text-button" data-lab-inspect="${e(c.id)}">Inspect</button></div>`;}).join('')
      +(rows.length>shown.length?`<button type="button" class="v-button" data-lab-more>Show ${Math.min(45,rows.length-shown.length)} more of ${rows.length.toLocaleString()}</button>`:'')
      :'<p>No matching local commander. Search the exact name or provide its Scryfall link.</p>';
  }
  function chosen(){
    document.querySelector('[data-action=lab-unpartner]').hidden=!partner;
    const leaders=[leader,partner].filter(Boolean);
    $('#cm-lab-selected').innerHTML=leaders.map(c=>`<div class="cm-selected-commander"><strong>${e(c.name)}</strong> ${C.colors(c.colorIdentity)} ${c.manaCost?C.mana(c.manaCost):''}<p>${e(c.typeLine)}${CrankCatalog.playStyles(c).length?' · '+e(CrankCatalog.playStyles(c).slice(0,4).join(' · ')):''}</p><div class="cm-actions">${b('Inspect commander','card',{card:c.id})}</div></div>`).join('')||note('Choose a commander above.');
    const save=$('#cm-lab-save');if(save)save.disabled=!canSave();
  }
  function canSave(){return mode==='list'?Boolean(lab.elements.group.value||lab.elements.existingDeck.value):Boolean(leader);}
  function adoptGroupCommander(){
    const g=C.state.groups.find(x=>x.id===lab.elements.group.value);
    if(!g||!g.commanderCardId)return;
    const card=C.state.cards[g.commanderCardId];
    if(!card)return;
    leader=C.catalog.get(card.id)||C.catalog.exact(card.name)||card;
    lab.elements.commanderQuery.value=leader.name;
    chosen();
  }
  results.addEventListener('click',ev=>{
    const more=ev.target.closest('[data-lab-more]');if(more){shownLimit+=45;search();return;}
    const inspect=ev.target.closest('[data-lab-inspect]');if(inspect){C.inspector(inspect.dataset.labInspect).catch(err=>C.notice(err.message,true));return;}
    const el=ev.target.closest('[data-lab-commander]');if(el){leader=C.catalog.get(el.dataset.labCommander);lab.elements.commanderQuery.value=leader.name;chosen();results.innerHTML='';}
  });
  for(const name of ['commanderQuery','commanderMechanic','rank'])lab.elements[name].addEventListener('input',()=>{shownLimit=45;search();});
  lab.addEventListener('change',ev=>{if(ev.target.name==='commanderColor'){pickerColors=[...lab.querySelectorAll('[name=commanderColor]:checked')].map(i=>i.value);shownLimit=45;search();}if(ev.target.name==='group'||ev.target.name==='existingDeck'){const save=$('#cm-lab-save');if(save)save.disabled=!canSave();}});
  lab.elements.mode.addEventListener('change',ev=>{mode=ev.target.value;$('#cm-existing-list').hidden=mode!=='list';const save=$('#cm-lab-save');if(save)save.disabled=!canSave();});
  lab.elements.group.addEventListener('change',adoptGroupCommander);
  if(mode==='list')adoptGroupCommander();
  search();chosen();
  C.catalog.loadGraph().then(()=>{if(C.main.contains(lab))search();}).catch(()=>{});

  actions['lab-resolve']=async()=>{const c=await C.catalog.resolve(lab.elements.commanderQuery.value);if(!c||!c.commander||c.legalities.commander!=='legal')throw Error('No verified legal commander found. Check the name or provide its Scryfall link.');if(!C.state.cards[c.id])await C.commit({type:'cards',cards:[c]},{renderView:false});leader=c;lab.elements.commanderQuery.value=c.name;chosen();};
  actions['lab-manual']=()=>C.manualCard(lab.elements.commanderQuery.value,c=>{leader=c;$('#cm-dialog').close();chosen();});
  actions['lab-unpartner']=()=>{partner=null;chosen();};
  actions['lab-partner']=()=>C.cardPicker('Select a legal partner / second commander',c=>{partner=c;$('#cm-dialog').close();chosen();},{commander:true});

  /* Read the whole form once, into the module state the next render rebuilds it from. */
  function readForm(){
    const v=Object.fromEntries(new FormData(lab));
    definition=M.defaultDefinition({baseBracket:Number(v.baseBracket),bracketCeiling:Number(v.bracketCeiling),budget:v.budget===''?null:Number(v.budget),perCardCap:v.perCardCap===''?null:Number(v.perCardCap),mechanics:v.mechanic?[v.mechanic]:[],playStyle:v.playStyle,speed:Number(v.speed),competitiveness:Number(v.competitiveness),saltiness:Number(v.saltiness),restrictions:v.restrictions,reuse:{includeSellTrade:!!v.sellTrade}});
    groupId=v.group;deckId=v.existingDeck;draftName=v.deckName;pool=v.pool;includeInDeck=!!v.inDeck;includeReserved=!!v.reserved;
    return v;
  }

  /* RUN INITIAL DRAFT: build, fetch the printed text, keep as a preview. Nothing is
     saved to My Decks. */
  async function runDraft(){
    const run=$('#cm-lab-run'),error=$('#cm-lab-error'),status=$('#cm-lab-sim-status');run.disabled=true;error.hidden=true;
    try{
      if(!lab.reportValidity())return;
      if(!leader)throw Error(mode==='list'?'This list does not say which card is the commander. Choose one above, or re-import a list with the commander after a blank line.':'Select a commander before running.');
      const v=readForm();
      const leaders=await Promise.all([leader,partner].filter(Boolean).map(c=>C.catalog.details(c)));
      let built;
      if(mode==='list'){
        let rows;
        if(deckId)rows=M.deck(C.state,deckId).slots.filter(r=>r.purpose==='main').map(r=>({...r,id:undefined}));
        else{const g=C.state.groups.find(x=>x.id===groupId);if(!g)throw Error('Choose a Collection group or existing deck.');rows=g.entries.map(r=>({...r,id:undefined}));if(!rows.length)rows=C.state.lots.filter(l=>l.groupIds.includes(g.id)).map(l=>({cardId:l.cardId,quantity:l.quantity,printing:l.printing}));}
        if(!rows.length)throw Error('The chosen group has no cards yet. Import or enter a list first.');
        built={slots:rows,cards:rows.map(r=>C.state.cards[r.cardId]),issues:[],notes:[],method:'Existing list copied exactly into a new draft; no simulation executed',estimatedPrice:null,unknownPrices:0};
      }else{
        status.textContent='Drafting…';
        await C.catalog.loadGraph();
        const available={};for(const l of C.state.lots)if(M.eligibility(C.state,l,{includeInDeck,includeReserved,includeSellTrade:!!v.sellTrade}).eligible)available[l.cardId]=(available[l.cardId]||0)+l.quantity;
        built=CrankDraft.build({commanders:leaders,cards:C.catalog.all(),definition,available,benchOnly:pool==='owned'});
      }
      /* REFUSE THE EMPTY DRAFT. Zero of the 99 is an error with the builder's own reasons;
         fewer than 99 is kept as a partial preview and said out loud. */
      const chosen99=built.slots.filter(r=>!leaders.some(c=>c.id===r.cardId)).reduce((n,r)=>n+r.quantity,0);
      if(!chosen99)throw Error('The builder could not choose any of the 99. '+(built.issues.join(' ')||'Check the pool and price limits.'));
      /* THE PRINTED TEXT, NOW. A graph row has no rules text; the engine cannot read it
         and neither can the reader reviewing the draft. Two requests, not a wall later. */
      let fetchNote='';
      try{
        const {missing}=await C.catalog.hydrate([...built.cards,...leaders],{onProgress:m=>{status.textContent=`Fetching card text · ${m.done} of ${m.total}`;}});
        if(missing.length)fetchNote=`Scryfall did not return ${missing.length} card${missing.length===1?'':'s'}: ${missing.slice(0,5).join(', ')}${missing.length>5?'…':''}.`;
      }catch(err){fetchNote='Card text could not be fetched now ('+err.message+'). Measure will ask again.';}
      const cards=[...built.cards,...leaders].filter(Boolean).map(c=>C.catalog.get(c.id)||c);
      const name=draftName||leader.name+' · '+(definition.mechanics[0]||'new draft');
      const next={commanders:leaders.map(c=>c.id),slots:built.slots.map(r=>({cardId:r.cardId,quantity:r.quantity,purpose:r.purpose||'main',pinned:!!r.pinned})),definition,name,method:built.method,notes:built.notes||[],issues:[...built.issues,...(fetchNote?[fetchNote]:[])],estimatedPrice:built.estimatedPrice,unknownPrices:built.unknownPrices||0,at:new Date().toISOString(),report:null};
      /* Legality of the list as it would be saved, checked on a copy of the state. */
      const probe=M.apply(C.state,{id:C.uid(),type:'createDeck',deckId:'deck:preview',name,commanders:next.commanders,cards,slots:next.slots,definition}).state;
      next.issues.push(...M.legality(probe,M.deck(probe,'deck:preview')));
      const count=total(next.slots);
      preview=next;
      await C.commit({type:'batch',commands:[{type:'cards',cards},{type:'preferences',values:{labPreview:next}}],summary:count===100?'Drafted a starting list. Nothing is saved to My Decks until you choose Save this deck.':`Drafted a PARTIAL list — ${count} of 100 cards. Loosen the limits and run again, or save it and edit by hand.`},{renderView:false});
      redrawRun();
      if(count!==100)C.notice(next.issues.filter(x=>/could be chosen/.test(x)).join(' ')||`Only ${count} of 100 cards were chosen.`,true);
    }catch(err){error.textContent=err.message;error.hidden=false;}
    finally{const again=$('#cm-lab-run');if(again)again.disabled=false;}
  }
  /* The run pane is redrawn in place after a draft or a measurement, so the Run button is
     a new element each time and is wired again each time. */
  function wireRun(){const run=$('#cm-lab-run');if(run)run.onclick=runDraft;}
  function redrawRun(){const last=C.state.preferences.lastLabRun,saved=last?C.state.decks.find(x=>x.id===last.deckId):null;const pane=$('#cm-lab-run-pane');if(pane)pane.outerHTML=runPane(saved);const save=$('#cm-lab-save');if(save)save.disabled=!canSave();wireRun();}
  wireRun();

  /* SAVE THIS DECK: the one write to My Decks. From a preview when there is one, from the
     commander alone when there is not. A measured preview brings its report along. */
  actions['lab-save']=async()=>{
    const v=readForm();
    const leaders=preview?leadersOf(preview):[leader,partner].filter(Boolean);
    if(!leaders.length&&mode!=='list')throw Error('Choose a commander first.');
    let slots,cards,name,notes,method,issues;
    if(preview){
      slots=preview.slots;cards=[...slots.map(r=>cardOf(r.cardId)),...leaders].filter(Boolean);name=(v.deckName||'').trim()||preview.name;method=preview.method;notes=preview.notes||[];issues=preview.issues||[];
    }else if(mode==='list'){
      let rows;
      if(deckId)rows=M.deck(C.state,deckId).slots.filter(r=>r.purpose==='main').map(r=>({...r,id:undefined}));
      else{const g=C.state.groups.find(x=>x.id===groupId);if(!g)throw Error('Choose a Collection group or existing deck.');rows=g.entries.map(r=>({...r,id:undefined}));if(!rows.length)rows=C.state.lots.filter(l=>l.groupIds.includes(g.id)).map(l=>({cardId:l.cardId,quantity:l.quantity,printing:l.printing}));}
      if(!rows.length)throw Error('The chosen group has no cards yet. Import or enter a list first.');
      slots=rows;cards=[...rows.map(r=>C.state.cards[r.cardId]),...leaders].filter(Boolean);name=(v.deckName||'').trim()||(leaders[0]?.name||'New deck');method='Existing list copied exactly into a new deck; no simulation executed';notes=[];issues=[];
    }else{
      slots=leaders.map(c=>({cardId:c.id,quantity:1,purpose:'main'}));cards=leaders;name=(v.deckName||'').trim()||leaders[0].name+' · new deck';method='Saved from the Deck Lab before any draft was run';notes=[];issues=[];
    }
    const id='deck:'+C.uid();
    const commands=[{type:'createDeck',deckId:id,name,commanders:leaders.map(c=>c.id),cards,slots,definition:preview?preview.definition:definition,notes:[method,...notes].join('\n')}];
    if(preview?.report)commands.push({type:'report',deckId:id,report:preview.report});
    commands.push({type:'preferences',values:{lastLabRun:{deckId:id,method,issues,at:new Date().toISOString()},labPreview:null}});
    preview=null;
    await C.commit({type:'batch',commands,summary:`Saved ${name} to My Decks`+(commands.some(c=>c.type==='report')?' with its measurement':'')});
  };
  actions['lab-discard']=async()=>{await keepPreview(null);C.notice('Draft discarded. Nothing was saved.');redrawRun();};

  /* REVIEW THE DRAFT without saving it: the hundred, by role, with prices. */
  actions['lab-review']=()=>{
    if(!preview)throw Error('Run a draft first.');
    const rows=preview.slots.map(r=>({c:cardOf(r.cardId),q:r.quantity})).filter(x=>x.c);
    const groups=new Map();
    for(const x of rows){const r=preview.commanders.includes(x.c.id)?'commander':CrankDraft.role(x.c);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(x);}
    const order=['commander','land','ramp','draw','interaction','engine'],label={commander:'Commander',land:'Lands',ramp:'Ramp',draw:'Card draw',interaction:'Interaction',engine:'Engine & threats'};
    const priced=rows.filter(x=>x.c.price>0).reduce((n,x)=>n+x.c.price*x.q,0),unknown=rows.filter(x=>!(x.c.price>0)&&!/\bBasic\b/.test(x.c.typeLine||'')).length;
    modal('Draft · '+preview.name,`<div class="cm-preview-total"><span><strong>${total(preview.slots)}</strong> cards</span><span><strong>${C.money(priced)}</strong> at recorded prices${unknown?` · ${unknown} without a price`:''}</span><span><strong>${rows.filter(x=>/Land/.test(x.c.typeLine||'')).reduce((n,x)=>n+x.q,0)}</strong> lands</span></div>
      ${note(preview.method)}${preview.issues.length?`<div class="cm-note cm-warning">${preview.issues.map(x=>`<p>${e(x)}</p>`).join('')}</div>`:''}
      <div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>Card</th><th>Type</th><th>Qty</th><th>Price</th></tr></thead><tbody>${order.filter(r=>groups.has(r)).map(r=>`<tr class="cm-group-row"><td colspan="4">${e(label[r])} · ${groups.get(r).reduce((n,x)=>n+x.q,0)}</td></tr>`+groups.get(r).sort((a,b)=>a.c.name.localeCompare(b.c.name)).map(x=>`<tr><td><button type="button" class="cm-card-name" data-action="card" data-card="${e(x.c.id)}">${e(x.c.name)}</button></td><td>${e(x.c.typeLine||'')}</td><td>${x.q}</td><td>${x.c.price>0?e(C.money(x.c.price)):'<span class="cm-muted">—</span>'}</td></tr>`).join('')).join('')}</tbody></table></div>
      <details class="cm-details"><summary>How this list was built</summary>${(preview.notes||[]).map(x=>`<p class="cm-muted">${e(x)}</p>`).join('')}</details>
      <div class="cm-actions" style="margin-top:14px">${b('Save this deck','lab-save',{},true)}${b('Discard draft','lab-discard')}</div>`);
  };

  /* MEASURE the preview or the saved deck. What the engine cannot read is fetched first. */
  actions['lab-measure']=async el=>{
    const status=$('#cm-lab-sim-status');
    const saved=el.dataset.deck?M.deck(C.state,el.dataset.deck):null;
    const subject=saved||(preview?{id:null,commanders:preview.commanders,slots:preview.slots}:null);
    if(!subject)throw Error('Run a draft or save a deck first.');
    let lineup=CrankSim.lineupFor(C.state,subject),cover=CrankSim.coverage(lineup);
    if(!cover.total){
      const last=C.state.preferences.lastLabRun;
      const why=saved&&last&&last.deckId===saved.id&&(last.issues||[]).length?' The builder reported: '+last.issues.join(' '):'';
      throw Error('This deck has no cards to measure yet.'+why+' Add cards with Edit card list, or run the draft again with looser limits.');
    }
    if(cover.ratio<.95){
      status.textContent=`Fetching card text for ${cover.unreadable.length} cards…`;
      const need=cover.unreadable.map(n=>C.catalog.exact(n)||{name:n});
      let missing=[];
      try{const got=await C.catalog.hydrate(need,{onProgress:m=>{status.textContent=`Fetching card text · ${m.done} of ${m.total}`;}});missing=got.missing;if(got.hydrated.length)await C.commit({type:'cards',cards:got.hydrated},{renderView:false});}
      catch(err){status.textContent='';throw Error('The engine cannot read '+cover.unreadable.length+' cards and Scryfall could not be reached to fetch their text ('+err.message+'). Reconnect and measure again.');}
      lineup=CrankSim.lineupFor(C.state,subject);cover=CrankSim.coverage(lineup);
      if(cover.ratio<.95){status.textContent='';throw Error(`After asking Scryfall the engine still cannot read ${cover.unreadable.length} card${cover.unreadable.length===1?'':'s'}: ${cover.unreadable.slice(0,6).join(', ')}${cover.unreadable.length>6?' and '+(cover.unreadable.length-6)+' more':''}.${missing.length?' Scryfall did not know: '+missing.slice(0,4).join(', ')+'.':''} Check those names in Collection, or replace them with Edit card list.`);}
    }
    CrankSim.assertMeasurable(cover,'published');
    const plan=CrankSim.protocolFor('published');
    runner=runner||CrankSim.createRunner();
    if(runner.busy)throw Error('A measurement is already running.');
    const [config,opponents]=await Promise.all([fetch(CrankAssets.simConfig).then(r=>r.json()),fetch(CrankAssets.simOpponents).then(r=>r.json())]);
    status.textContent='Measuring… seed 0 of '+plan.seedCount;
    try{
      const result=await runner.measure({protocol:'published',lineup,config,opponents,table:config.table,onProgress:m=>{status.textContent=`Measuring… seed ${m.done} of ${m.total} · ${m.mean} points so far`;}});
      const report=CrankSim.packFor(result,{protocol:'published',table:config.table,seatCount:(opponents.tables[config.table]||[]).length,cardsVersion:CrankAssets.cards,coverage:cover});
      if(saved)await C.commit({type:'report',deckId:saved.id,report});
      else{await keepPreview({...preview,report});redrawRun();}
      C.notice(`Measured ${report.metrics.score.value} points from ${result.games.toLocaleString()} games in ${(result.elapsedMs/1000).toFixed(1)}s.`+(saved?'':' Save this deck to keep the report with it.'));
    }catch(err){status.textContent=err.message;throw err;}
  };
};

/* THE RUN PANE. Its state is read, not set: a step lights up because a preview, a report or
   a saved deck exists. */
function runPane(saved){
  const subject=preview||saved;
  const count=preview?total(preview.slots):saved?M.readiness(C.state,saved).target:0;
  const measuredSaved=saved?C.state.reports.filter(r=>r.deckId===saved.id&&r.origin==='measured').slice(-1)[0]:null;
  const measured=preview?preview.report:measuredSaved;
  const stepState=i=>{
    if(i===0)return (leader||subject)?'complete':'active';
    if(i===1)return count===100?'complete':subject?'active':'waiting';
    if(i===4)return measured?'complete':'waiting';
    if(i===5)return saved&&!preview?'complete':'waiting';
    return 'waiting';
  };
  const simLabel=measured?`Measured ${measured.metrics.score.value} points · ${measured.protocol}`:subject?'Not measured yet':'Build a draft first';
  const last=C.state.preferences.lastLabRun;
  const canSaveNow=Boolean(leader||preview);
  return `<aside class="v-panel cm-run-panel" id="cm-lab-run-pane"><div class="cm-actions"><button class="v-button primary" id="cm-lab-run" type="button">Run initial draft</button>${preview?b('Measure this draft','lab-measure'):saved?b('Measure this deck','lab-measure',{deck:saved.id}):''}<span class="cm-pause-pill" id="cm-lab-sim-status">${e(simLabel)}</span></div>
    <div class="cm-lab-save-row"><button class="v-button" id="cm-lab-save" type="button" data-action="lab-save" ${canSaveNow?'':'disabled'}>Save this deck</button><span class="cm-muted">${preview?'Writes this draft to My Decks.':'Writes the commander and definition to My Decks; draft or edit the 99 any time after.'}</span></div>
    <ol class="cm-run-steps">${STEPS.map((label,i)=>{const st=stepState(i);return `<li><span class="cm-run-orb ${st}" id="cm-step-${i}" aria-label="${st==='complete'?'Complete':st==='active'?'Active':'Waiting'}"><i></i><i></i><i></i><img src="assets/mana/G.svg?v=1" alt=""></span>${e(label)}${i===1&&subject&&count!==100?` <small class="cm-muted">· ${count} of 100</small>`:''}</li>`;}).join('')}</ol>
    <div id="cm-lab-result">${preview?`<h3>${e(preview.name)} <span class="cm-badge">Draft · not saved</span></h3>${note(preview.method)}<p>${count} of 100 cards${preview.estimatedPrice!==null&&preview.estimatedPrice!==undefined?` · about ${e(C.money(preview.estimatedPrice))} at recorded prices`:''}${preview.unknownPrices?` · ${preview.unknownPrices} without a price`:''}.</p>${(preview.issues||[]).map(x=>`<p class="cm-muted">${e(x)}</p>`).join('')}<div class="cm-actions">${b('Review draft cards','lab-review')}${b('Discard draft','lab-discard')}</div>`
      :saved?`<h3>${e(saved.name)} <span class="cm-badge good">Saved</span></h3>${note(last.method)}${(last.issues||[]).map(x=>`<p class="cm-muted">${e(x)}</p>`).join('')}<div class="cm-actions">${b('Open in My Decks','deck',{deck:saved.id})}${b('Review deck cards','deck-cards',{deck:saved.id})}${b('Reports & advice','deck-evidence',{deck:saved.id})}</div>`
      :'<p class="cm-muted">Run initial draft builds a list you can review and measure here. Nothing reaches My Decks until you choose Save this deck; no cards are purchased, owned or reserved by any step.</p>'}</div>
    <p class="cm-muted">Measuring runs the engine in the background on the published protocol — six seeds of 20,000 games — and stores a report you can compare with another run of the same protocol. The two refinement steps need a candidate search that is not built yet, so they stay waiting. Finalize the saved list in My Decks when you accept it.</p></aside>`;
}

actions['lab-help']=()=>modal('Explore · Test · Decide',`<h3>Built around your game</h3><p>Choose a commander from the legal catalog — every one of them, by name, printed variant name, play style, colour identity or rank — or begin with a list you already have. Deck Definition records your hard limits and play preferences.</p><p><strong>Run initial draft</strong> builds a starting list from card metadata and keeps it here as a preview; a total price cap is planned so the list completes, or it tells you what cap would. <strong>Measure</strong> runs the simulator on the preview or a saved deck — real games, in the background, on the same protocol as every published rating — fetching any card text the engine lacks first. <strong>Save this deck</strong> is the only step that writes to My Decks, and it works from the commander alone.</p><p>The simulator's three opponents are sampled archetype profiles, not four real decks with hands and boards, so a score compares lists under one model rather than predicting an evening. Every report carries that caveat with it.</p>${note('No AI API key or paid model call is required for current workflows. Reports belong to the exact list they describe.')}`);
});
