/* THE NEW DECK FLOW (Rob, 2026-10-23: the Decks requirements' Part B, capture 2). A new deck starts as an empty shell and
 * is defined after that; for a Commander deck the commander comes first, before any other card.
 *
 *   Start from         the shell is saved as it opens (SHL-3). Four ways to one commander -- Pick a commander, Choose
 *                      colors, Choose play style, Choose mechanics -- and Next assigns it to the deck (STF-1 to STF-10).
 *   Define the Deck    Define the deck, or Leave undefined. General, Gameplay, Mechanics, Cards; Create deck (DEF).
 *   Review             Auto-create's 99 before anything is saved: by slot role, alternatives on a click, batch Remove,
 *                      the summary bar; Create deck enters each card by its source (RVW).
 *
 * One frame for the two pop-ups (DLG-1 to DLG-4): compact, a nav on the left, the canvas on the right, one primary
 * button bottom right, and no explanatory copy. The vocabulary, the recommendations and the builder are the Deck
 * intelligence lane's (deck-vocabulary.js, deck-recommend.js, deck-autocreate.js); nothing here calls a model (REC-3). */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,esc:e,button:b,actions,commit,go,modal}=C;
const V=globalThis.CrankVocabulary,R=globalThis.CrankRecommend,A=globalThis.CrankAutoCreate,L=globalThis.CrankLegality;
const COLOR_NAME={W:'White',U:'Blue',B:'Black',R:'Red',G:'Green',C:'Colorless'};
let F=null,index=null,indexLoading=null,targets=null,brackets=null;
/* THE COMMANDER INDEX (data/commander-index.json): every commander with its colors, rank, play styles and mechanics. */
async function loadIndex(){if(index)return index;indexLoading??=fetch('data/commander-index.json?v=1').then(r=>{if(!r.ok)throw Error(`The commander list could not be read (${r.status}). Try again when connected.`);return r.json();}).then(d=>{index={...d,rows:d.commanders.map(c=>({name:c.n,ci:c.ci,rank:c.r,styles:c.s.map(i=>d.styles[i].id),mechanics:c.m.map(i=>d.mechanics[i].id),pair:c.p||''}))};return index;}).finally(()=>{indexLoading=null;});return indexLoading;}
const loadJSON=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`${url} could not be read (${r.status}).`);return r.json();};
const ownedNames=()=>{const out=new Set();for(const l of C.state.lots)if(l.source==='owned'){const c=C.state.cards[l.cardId];if(c)out.add(c.name);}return out;};
const pips=ci=>C.colors(String(ci||'').split('').filter(Boolean));
const short=name=>String(name||'').split(',')[0].replace(/\s+(the|of)\s.*$/i,'');

/* THE FRAME (DLG). `nav` is [[id,label,mark?]]; the current item is pressed. */
function frame(title,nav,current,canvas,primary,{back=null,cls='',head=''}={}){
  const d=modal(title,`<div class="cm-flow ${cls}">${head}<div class="cm-flow-body"><nav class="cm-flow-nav" aria-label="${e(title)}">${nav.map(([id,label,mark])=>`<button type="button" data-action="flow-nav" data-to="${e(id)}" aria-pressed="${id===current}"${mark?` data-mark="${e(mark)}"`:''}>${e(label)}</button>`).join('')}</nav><section class="cm-flow-canvas" id="cm-flow-canvas">${canvas}</section></div><footer class="cm-flow-foot">${back?`<button type="button" class="v-button" data-action="${e(back.action)}">${e(back.label)}</button>`:'<span></span>'}<button type="button" class="v-button primary" data-action="${e(primary.action)}"${primary.disabled?' disabled':''}>${e(primary.label)}</button></footer></div>`);
  d.classList.add('cm-flow-dialog');return d;}
actions['flow-nav']=el=>{if(!F)return;if(F.step==='start')F.method=el.dataset.to;else F.section=el.dataset.to;draw();};

/* ── START FROM ─────────────────────────────────────────────────────────────────────────────────────────────── */
const METHODS=[['pick','Pick a commander'],['colors','Choose colors'],['style','Choose play style'],['mechanics','Choose mechanics']];
/* Opening Start from saves the shell (SHL-1 to SHL-3): the deck and its own group, no commander, no cards. Opening it
   on a deck that has no commander yet reopens it (SHL-4). */
actions['start-from']=async el=>{const id=el?.dataset?.deck||'',query=el?.dataset?.query||'';
  let deckId=id&&C.state.decks.some(d=>d.id===id)?id:'';
  if(!deckId){deckId='deck:'+C.uid();await commit({type:'createDeck',deckId,name:'New deck',commanders:[],slots:[]},{renderView:false});}
  const d=M.deck(C.state,deckId);
  F={step:'start',deckId,name:d.name==='New deck'?'':d.name,method:'pick',query,picks:{colors:[],include:false,colorless:false,styles:[],mechanics:[]},commander:null,second:null,def:null,section:'general'};
  await loadIndex().catch(()=>null);draw();};
/* The landing page and the Decks page reach the same flow (NEW-2: the old Create pop-up and the Build wizard are gone). */
C.build={start:query=>actions['start-from']({dataset:{query:query||''}})};
C.startFrom=deckId=>actions['start-from']({dataset:{deck:deckId||''}});
/* DEFINE THE DECK FOR A DECK THAT HAS ITS COMMANDER (a shell left undefined, or one made before this flow). */
actions['define-deck']=async el=>{const d=M.deck(C.state,el.dataset.deck);if(!d.commanders.length)return actions['start-from'](el);
  await loadIndex().catch(()=>null);const leads=d.commanders.map(id=>C.card(id)).filter(Boolean),graph=await C.catalog.loadGraph().catch(()=>null);
  F={step:'define',deckId:d.id,name:d.name,method:'pick',query:'',picks:{colors:[],include:false,colorless:false,styles:[],mechanics:[]},commander:{name:leads[0]?.name,ci:(leads[0]?.colorIdentity||[]).join('')},second:leads[1]?{name:leads[1].name,ci:(leads[1].colorIdentity||[]).join('')}:null,leads,graph,def:defFrom(d),section:'general'};F.def.mode='define';draw();};

function results(rows,{limit=40}={}){
  const sel=F.commander?.name;
  return rows.length?`<ul class="cm-flow-results" role="listbox" aria-label="Commanders">${rows.slice(0,limit).map(r=>`<li><button type="button" role="option" data-action="flow-commander" data-name="${e(r.name)}" aria-selected="${r.name===sel}"><strong>${e(r.name)}</strong>${pips(r.ci)}${r.owned?C.pill('Owned','inbox'):''}${r.matches?`<small>${r.matches} match${r.matches===1?'':'es'}</small>`:''}</button></li>`).join('')}</ul>`:'<p class="cm-muted" role="status">No commander matches.</p>';}
/* Each method matches on its own picks: colors, or play styles, or mechanics -- one way to one commander each (STF-2). */
function matching(){if(!index)return [];const p=F.picks,m=F.method;
  return V.matchCommanders(index.rows,m==='colors'?{colors:p.colorless?[]:p.colors,include:p.include,colorless:p.colorless}:m==='style'?{styles:p.styles}:{mechanics:p.mechanics},ownedNames());}
function startCanvas(){
  const m=F.method,p=F.picks;
  const chip=(action,id,label,on,extra='')=>`<button type="button" class="cm-chip-toggle v-button" data-action="${action}" data-id="${e(id)}" aria-pressed="${on}"${extra}>${label}</button>`;
  let body='';
  if(m==='pick')body=`<label class="cm-flow-field">Commander name<input id="cm-flow-query" autocomplete="off" value="${e(F.query)}"></label><div id="cm-flow-list"></div>`;
  if(m==='colors')body=`<div class="cm-flow-colors" role="group" aria-label="Colors">${[...V.COLORS,'C'].map(x=>chip('flow-color',x,`<span class="cm-pip-letter">${x}</span>`,x==='C'?p.colorless:p.colors.includes(x),` aria-label="${COLOR_NAME[x]}" title="${COLOR_NAME[x]}"`)).join('')}</div><label class="cm-checkbox"><input type="checkbox" data-flow-include${p.include?' checked':''}${p.colorless?' disabled':''}>Include more colors</label><div id="cm-flow-list">${p.colors.length||p.colorless?results(matching()):''}</div>`;
  if(m==='style')body=`<div class="cm-flow-chips" role="group" aria-label="Play styles">${(index?.styles||[]).map(s=>chip('flow-style',s.id,e(s.label),p.styles.includes(s.id))).join('')}</div><div id="cm-flow-list">${p.styles.length?results(matching()):''}</div>`;
  if(m==='mechanics')body=`<div class="cm-flow-chips" role="group" aria-label="Mechanics">${(index?.mechanics||[]).map(x=>chip('flow-mech',x.id,e(x.label),p.mechanics.includes(x.id))).join('')}</div><div id="cm-flow-list">${p.mechanics.length?results(matching()):''}</div>`;
  /* STF-9, Q14: a second commander when the first allows one, limited to legal pairs; optional. */
  const pair=F.commander&&index?index.rows.find(r=>r.name===F.commander.name)?.pair:'';
  const second=pair?`<div class="cm-flow-second"><label class="cm-flow-field">Second commander<input id="cm-flow-second" autocomplete="off" value="${e(F.second?.name||'')}" list="cm-flow-second-names"></label><datalist id="cm-flow-second-names">${secondChoices(pair).map(r=>`<option value="${e(r.name)}">`).join('')}</datalist></div>`:'';
  const chosen=F.commander?`<p class="cm-flow-chosen" id="cm-flow-chosen"><strong>${e(F.commander.name)}</strong>${pips(F.commander.ci)}${F.second?` + <strong>${e(F.second.name)}</strong>`:''}</p>`:'';
  /* The picked commander's card sits under its name (Rob, 2026-10-27). */
  const rec=F.commander&&m==='pick'?(C.catalog.exact?.(F.commander.name)||C.card?.(F.commander.id)):null,art=rec?.image||rec?.imageSmall||'';
  const pic=art?`<img class="cm-flow-commander-art" src="${e(art)}" alt="${e(F.commander.name)}" loading="lazy">`:'';
  /* What came with the commander is preselected, and the page says so; a color outside its identity would remove it. */
  const note2=text=>F.commander?`<p class="cm-muted cm-flow-foot-note" role="status">${e(text)}</p>`:'';
  const hint=m==='colors'&&F.commander?`<p class="cm-muted cm-flow-foot-note" role="status">Choosing a color outside ${e(short(F.commander.name))}'s identity removes it as your commander.</p>`:m==='style'&&p.styles.length?note2('Styles associated with this commander are preselected'):m==='mechanics'&&p.mechanics.length?note2('Mechanics associated with this commander are preselected'):'';
  return body+hint+chosen+pic+second;}
/* Which commanders can be the second (Q14): commander-legality.js is asked about the pair at Next, with both cards. */
function secondChoices(kind){const want={'partner':['partner'],'partner-with':['partner-with'],'chooses-background':['background'],'background':['chooses-background'],'doctor':['companion'],'companion':['doctor']}[kind]||[];
  return (index?.rows||[]).filter(r=>want.includes(r.pair)&&r.name!==F.commander?.name).sort((a,b)=>(a.rank||1e9)-(b.rank||1e9)||a.name.localeCompare(b.name,'en-US'));}
function drawStart(){
  const nameField=`<label class="cm-flow-name">Deck name<input id="cm-flow-name" maxlength="160" value="${e(F.name)}" placeholder="${e(F.commander?`${short(F.commander.name)} deck`:'New deck')}"></label>`;
  const d=frame('Start from',METHODS,F.method,startCanvas(),{label:'Next',action:'flow-next',disabled:!F.commander},{head:nameField});
  const q=d.querySelector('#cm-flow-query');
  if(q){const show=()=>{F.query=q.value;const list=d.querySelector('#cm-flow-list');const owned=ownedNames();
      const rows=q.value.trim()?C.catalog.search(q.value,{commander:true,limit:40}).map(c=>({name:c.name,ci:(c.colorIdentity||[]).join(''),owned:owned.has(c.name)})).sort((a,b)=>b.owned-a.owned):[];
      list.innerHTML=q.value.trim()&&!(F.picked&&F.commander&&q.value===F.commander.name)?results(rows):'';};q.addEventListener('input',()=>{F.picked=false;show();});show();if(!F.picked)q.focus();}
  d.querySelector('#cm-flow-name')?.addEventListener('change',ev=>{F.name=ev.target.value.trim();if(F.name)commit({type:'editDeck',deckId:F.deckId,name:F.name},{renderView:false}).catch(()=>{});});
  d.querySelector('[data-flow-include]')?.addEventListener('change',ev=>{F.picks.include=ev.target.checked;draw();});
  d.querySelector('#cm-flow-second')?.addEventListener('change',ev=>{const v=ev.target.value.trim();F.second=v?secondChoices(index.rows.find(r=>r.name===F.commander.name).pair).find(r=>r.name===v)||null:null;if(v&&!F.second)ev.target.setCustomValidity('Choose a commander from the list.');else ev.target.setCustomValidity('');});
  d.addEventListener('close',()=>{if(F&&F.step==='start'){const n=d.querySelector('#cm-flow-name')?.value.trim();if(n&&n!==M.deck(C.state,F.deckId).name)commit({type:'editDeck',deckId:F.deckId,name:n},{renderView:false}).catch(()=>{});}},{once:true});}
const toggle=(list,id)=>list.includes(id)?list.filter(x=>x!==id):[...list,id];
actions['flow-color']=el=>{const x=el.dataset.id,p=F.picks;if(x==='C'){p.colorless=!p.colorless;if(p.colorless)p.colors=[];}else{p.colorless=false;p.colors=toggle(p.colors,x);}dropIfOutside();draw();};
actions['flow-style']=el=>{F.picks.styles=toggle(F.picks.styles,el.dataset.id);draw();};
actions['flow-mech']=el=>{F.picks.mechanics=toggle(F.picks.mechanics,el.dataset.id);draw();};
/* The selection survives switching methods (STF-3); a different commander drops a second that no longer pairs. */
actions['flow-commander']=el=>{const name=el.dataset.name,row=index?.rows.find(r=>r.name===name)||{name,ci:(C.catalog.exact?.(name)?.colorIdentity||[]).join('')};if(F.commander?.name!==name)F.second=null;F.commander=row;F.picked=true;F.query=row.name;
  /* The commander's own colors, play styles and mechanics (data/commander-index.json) are preselected in the other three ways in. */
  const ci=String(row.ci||'').split('').filter(Boolean);F.picks.colors=ci;F.picks.colorless=!ci.length;F.picks.include=false;F.picks.styles=[...(row.styles||[])];F.picks.mechanics=[...(row.mechanics||[])];draw();};
/* A color outside the commander's identity removes the commander; the colors beneath it say so first. */
function dropIfOutside(){if(!F.commander)return;const ci=new Set(String(F.commander.ci||'').split('').filter(Boolean)),p=F.picks;
  if(p.colors.some(x=>!ci.has(x))||(p.colorless&&ci.size)){F.commander=null;F.second=null;F.picked=false;}}
/* NEXT (STF-3, REC-1, REC-4): the commander, and only the commander, goes on the deck; its mechanics and play styles go
   into the definition marked as from the commander. Then Define the Deck. */
actions['flow-next']=async()=>{if(!F?.commander)return;
  const full=async name=>{const c=C.catalog.exact?.(name)||C.catalog.search(name,{commander:true,limit:1})[0]||await C.catalog.resolve(name);if(!c)throw Error(`${name} could not be found in the card catalog.`);return C.catalog.details?await C.catalog.details(c):c;};
  const lead=await full(F.commander.name),pair=F.second?await full(F.second.name):null;
  if(pair&&L){const problems=L.check({commanders:[lead,pair].map(L.normalize),cards:[]}).problems.filter(p=>p.code==='pair');if(problems.length)throw Error(problems[0].says||`${lead.name} and ${pair.name} are not a legal pair.`);}
  const leads=[lead,pair].filter(Boolean),graph=await C.catalog.loadGraph().catch(()=>null),rowOf=n=>graph?.cards?.find(c=>c.name===n)||null;
  const brought=R&&index?R.fromCommander(leads.map(c=>rowOf(c.name)).filter(Boolean),{styles:index.styles,mechanics:index.mechanics}):{styles:[],mechanics:[]};
  const styles=[...new Set(leads.flatMap(c=>index?.rows.find(r=>r.name===c.name)?.styles||[]))];
  const d=M.deck(C.state,F.deckId),name=(document.getElementById('cm-flow-name')?.value||F.name||'').trim()||`${leads.map(c=>short(c.name)).join(' + ')} deck`;
  const mechanicIds=[...new Set([...(brought.mechanics||[])])],labels=mechanicIds.map(id=>(index.mechanics.find(m=>m.id===id)||{}).label).filter(Boolean);
  await commit({type:'batch',summary:`Assigned ${leads.map(c=>c.name).join(' + ')} to ${name}`,commands:[{type:'cards',cards:leads},{type:'editDeck',deckId:F.deckId,name,commanders:leads.map(c=>c.id),slots:leads.map(c=>({cardId:c.id,quantity:1})),definition:{...d.definition,mechanics:labels,mechanicIds,styles,fromCommander:{styles,mechanics:mechanicIds}}}]},{renderView:false});
  F={...F,step:'define',name,leads,graph,def:defFrom(M.deck(C.state,F.deckId)),section:'general'};draw();};

/* ── DEFINE THE DECK ────────────────────────────────────────────────────────────────────────────────────────── */
const SECTIONS=[['general','General'],['gameplay','Gameplay'],['mechanics','Mechanics'],['cards','Cards']];
const PILOT=['Beginner','Intermediate','Advanced'];
const WEIGHTS=[['Balanced','Balanced'],['Offense','Offense'],['Defense','Defense'],['Response','Response'],['Value','Value'],['Combo','Combo']];
const SOURCE_LABELS=[['bench','Bench only'],['buy','Bench and cards to buy'],['decks','Bench, cards to buy and cards in other decks']];
const FLAGS=[['massLandDenial','No mass land denial'],['extraTurns','No chained extra turns'],['lateCombos','Two-card infinites only as late finishers'],['gameChangerCap','The bracket’s Game Changer cap']];
function defFrom(d){const x=d.definition;return {mode:null,bracket:'',sources:x.cardSources||'buy',budget:x.budget??'',restrictions:x.restrictions||'',flags:{massLandDenial:true,extraTurns:true,lateCombos:true,gameChangerCap:true,...(x.restrictionFlags||{})},
  saltiness:x.saltiness,speed:x.speed,competitiveness:x.competitiveness,pilot:x.pilot||'',primary:x.composition?.primary||'',tribe:x.composition?.tribe||'',secondary:x.composition?.secondary||'',
  mechanics:[...(x.mechanicIds||[])],fromCommander:x.fromCommander||{styles:[],mechanics:[]},cards:'',weighting:'Balanced',group:'',missing:[]};}
const identity=()=>new Set((F.leads||[]).flatMap(c=>c.colorIdentity||[]));
function poolFits(){if(!F.graph)return null;F.fitCache??=V.fits(F.graph.cards,identity());return F.fitCache;}
function defineCanvas(){const x=F.def,s=F.section,on=(a,b2)=>a===b2?' checked':'';
  const top=`<div class="cm-flow-modes" role="radiogroup" aria-label="Define the deck"><label class="cm-flow-mode"><input type="radio" name="mode" value="define"${on(x.mode,'define')}>Define the deck</label><label class="cm-flow-mode"><input type="radio" name="mode" value="undefined"${on(x.mode,'undefined')}>Leave undefined</label></div>`;
  if(x.mode!=='define')return top;
  const head=s==='general'?top:'';
  const sel=(name,opts,v)=>`<select name="${name}">${opts.map(([k,l])=>`<option value="${e(k)}"${String(k)===String(v)?' selected':''}>${e(l)}</option>`).join('')}</select>`;
  const issues=(x.missing||[]).filter(m=>m.section.toLowerCase()===s);
  const field=(label,inner,cls='')=>{const name=(inner.match(/name="([^" ]+)"/)||[])[1],issue=issues.find(m=>m.field===name||(!m.field&&s==='gameplay'&&name==='primary')),id=`cm-flow-${name}-error`;
    if(issue)inner=inner.replace(/<(input|select) /,`<$1 aria-invalid="true" aria-describedby="${id}" `);
    return `<label class="cm-flow-field ${cls}${issue?' is-missing':''}">${e(label)}${inner}${issue?`<span id="${id}" class="cm-error" role="alert">${e(issue.says)}</span>`:''}</label>`;};
  let body='';
  if(s==='general')body=field('Deck name',`<input name="name" maxlength="160" value="${e(F.name)}">`)
    +field('Bracket',sel('bracket',[['',`Default (B${M.defaultDefinition().baseBracket})`],...[1,2,3,4,5].map(n=>[n,`Bracket ${n}`])],x.bracket))
    +`<fieldset class="cm-flow-field"><legend>Card sources</legend>${SOURCE_LABELS.map(([k,l])=>`<label class="cm-checkbox"><input type="radio" name="sources" value="${k}"${on(x.sources,k)}>${e(l)}</label>`).join('')}</fieldset>`
    +field('Budget ($)',`<input name="budget" type="number" min="0" step="1" value="${e(x.budget)}">`)
    +`<fieldset class="cm-flow-field"><legend>Restrictions</legend>${FLAGS.map(([k,l])=>`<label class="cm-checkbox"><input type="checkbox" name="flag-${k}"${x.flags[k]?' checked':''}>${e(l)}</label>`).join('')}<label class="cm-flow-other">Other restrictions (optional)<input name="restrictions" maxlength="300" value="${e(x.restrictions)}" placeholder="Anything else to avoid, in your words"></label></fieldset>`;
  if(s==='gameplay'){const fits=poolFits(),styles=(index?.styles||[]).filter(st=>!fits||fits.find(f=>f.id===st.id)?.fits);
    const tribes=x.primary==='tribal'&&F.graph?V.tribes(F.graph.cards,identity()):[];
    const scale=(name,label)=>field(label,sel(name,[1,2,3,4,5].map(n=>[n,String(n)]),x[name]));
    body=`<h3>Experience</h3><div class="cm-flow-row">${scale('saltiness','Saltiness')}${scale('speed','Speed')}${scale('competitiveness','Competitiveness')}${field('Pilot',sel('pilot',[['','Any'],...PILOT.map(p=>[p,p])],x.pilot))}</div>`
      +`<h3>Composition</h3>`+field('Primary',sel('primary',[['','Choose…'],['auto','Let CrankMagic choose'],...styles.map(st=>[st.id,st.label])],x.primary),x.missing.includes('gameplay')?'is-missing':'')
      +(x.primary==='tribal'?field('Tribe',sel('tribe',[['','Let CrankMagic choose'],...tribes.slice(0,40).map(t=>[t.id,`${t.label} (${t.cards})`])],x.tribe)):'')
      +field('Second (optional)',sel('secondary',[['','None'],...styles.filter(st=>st.id!==x.primary).map(st=>[st.id,st.label])],x.secondary));}
  if(s==='mechanics'){const counts=F.graph?V.mechanicCounts(F.graph.cards,identity(),(index?.mechanics||[]).map(m=>m.id)):[];
    body=`<div class="cm-flow-chips" role="group" aria-label="Preferred mechanics">${(index?.mechanics||[]).map(m=>{const n=counts.find(c=>c.id===m.id),mine=x.fromCommander.mechanics.includes(m.id),picked=x.mechanics.includes(m.id);
      return `<button type="button" class="v-button cm-chip-toggle${n?.flagged?' is-thin':''}" data-action="flow-def-mech" data-id="${e(m.id)}" aria-pressed="${picked}"${mine?' data-from="commander" title="From the commander"':''}>${e(m.label)}${mine?' <small>commander</small>':''}${picked&&n?.flagged?` <small>${n.cards} cards fit</small>`:''}</button>`;}).join('')}</div>${x.mechanics.length>V.MAX_MECHANICS?`<p class="cm-error" role="alert">Choose at most ${V.MAX_MECHANICS} mechanics for Auto-create.</p>`:''}`;}
  if(s==='cards'){const own=M.deck(C.state,F.deckId).groupId,groups=C.state.groups.filter(g=>g.id!==own&&M.deckMayTake(C.state,g,F.deckId));
    body=`<div class="cm-flow-modes" role="radiogroup" aria-label="Cards">${[['auto','Auto-create'],['merge','Merge in a Group'],['later','Define later']].map(([k,l])=>`<label class="cm-flow-mode"><input type="radio" name="cards" value="${k}"${on(x.cards,k)}>${e(l)}</label>`).join('')}</div>`
      +(x.cards==='auto'?`<fieldset class="cm-flow-field"><legend>Weighting</legend><div class="cm-flow-row">${WEIGHTS.map(([k,l])=>`<label class="cm-checkbox"><input type="radio" name="weighting" value="${k}"${on(x.weighting,k)}>${e(l)}</label>`).join('')}</div></fieldset>`
        +(x.missing.length?`<ul class="cm-flow-missing" role="alert">${x.missing.map(m=>`<li><button type="button" class="cm-text-button" data-action="flow-nav" data-to="${e(m.section.toLowerCase())}">${e(m.section)}</button>: ${e(m.says)}</li>`).join('')}</ul>`:''):'')
      +(x.cards==='merge'?field('Collection group',sel('group',[['','Choose a group…'],...groups.map(g=>[g.id,C.groupLabel(g)])],x.group)):'');}
  return head+body+(s!=='gameplay'?issues.filter(m=>!m.field).map(m=>`<p class="cm-error" role="alert">${e(m.says)}</p>`).join(''):'');}
function keepDefine(d){const f=d.querySelector('#cm-flow-canvas');if(!f)return;const x=F.def;
  for(const el of f.querySelectorAll('input,select')){const n=el.name;if(!n)continue;
    if(n==='mode'||n==='cards'||n==='weighting'||n==='sources'){if(el.checked)x[n]=el.value;continue;}
    if(n.startsWith('flag-')){x.flags[n.slice(5)]=el.checked;continue;}
    if(n==='name'){F.name=el.value.trim();continue;}
    if(['saltiness','speed','competitiveness'].includes(n)){x[n]=Number(el.value);continue;}
    x[n]=el.value;}}
function drawDefine(){const x=F.def,marks=new Map(x.missing.map(m=>[m.section.toLowerCase(),'Needs a choice']));
  const d=frame('Define the Deck',x.mode==='define'?SECTIONS.map(([id,l])=>[id,l,marks.get(id)]):[],F.section,defineCanvas(),{label:'Create deck',action:'flow-create',disabled:!x.mode},{back:{label:'Back',action:'flow-back'}});
  const missing=x.missing.length;
  if(missing)d.querySelector('.cm-flow-foot').insertAdjacentHTML('afterbegin',`<span class="cm-error" role="status">${e(x.missing[0].says)} · ${missing} field${missing===1?'':'s'} left</span>`);
  d.querySelector('[aria-invalid=true]')?.focus();
  d.querySelector('#cm-flow-canvas').addEventListener('change',()=>{keepDefine(d);x.missing=x.missing.filter(m=>m.field==='name'?!F.name:m.field==='budget'?(!Number.isFinite(Number(x.budget))||Number(x.budget)<0):false);draw();});}
actions['flow-def-mech']=el=>{keepDefine(document.querySelector('.cm-flow-dialog'));F.def.mechanics=toggle(F.def.mechanics,el.dataset.id);draw();};
/* BACK (DEF-7): Start from with the commander still selected; a different commander then recomputes what came from it. */
actions['flow-back']=()=>{keepDefine(document.querySelector('.cm-flow-dialog'));F.step='start';F.fitCache=null;draw();};
const definitionOf=()=>{const d=M.deck(C.state,F.deckId),x=F.def,base=x.bracket?Number(x.bracket):d.definition.baseBracket;
  const styles=[x.primary,x.secondary].filter(v=>v&&v!=='auto');
  return {...d.definition,baseBracket:base,bracketCeiling:Math.max(base,d.definition.bracketCeiling),budget:x.budget===''||x.budget===null?null:Number(x.budget),restrictions:x.restrictions||'',restrictionFlags:{...x.flags},cardSources:x.sources,
    saltiness:x.saltiness,speed:x.speed,competitiveness:x.competitiveness,...(x.pilot?{pilot:x.pilot}:{}),composition:{primary:x.primary||'',tribe:x.tribe||'',secondary:x.secondary||''},
    styles:styles.length?styles:d.definition.styles||[],mechanicIds:x.mechanics,mechanics:x.mechanics.map(id=>(index?.mechanics||[]).find(m=>m.id===id)?.label).filter(Boolean),
    playStyle:(A.WEIGHTINGS.find(([w])=>w===x.weighting)||A.WEIGHTINGS[0])[1]};};
/* CREATE DECK (DEF-3, DEF-6, CRD). */
actions['flow-create']=async()=>{const dlg=document.querySelector('.cm-flow-dialog');if(dlg)keepDefine(dlg);const x=F.def,deckId=F.deckId;
  if(x.mode==='undefined'){F=null;actions.close();return go('decks',{deck:deckId});}
  x.missing=[];
  if(!F.name)x.missing.push({section:'General',field:'name',says:'Name the deck.'});
  if(x.budget!==''&&(!Number.isFinite(Number(x.budget))||Number(x.budget)<0))x.missing.push({section:'General',field:'budget',says:'Enter a budget of $0 or more.'});
  if(x.missing.length){F.section='general';return draw();}
  if(!x.cards){x.missing=[{section:'Cards',says:'Choose Auto-create, Merge in a Group or Define later.'}];F.section='cards';return draw();}
  let def=definitionOf();
  if(x.cards==='auto'){
    /* Let CrankMagic choose: the style with the most cards around the commander, and for Tribal the commander's tribe. */
    if(x.primary==='auto'){const best=(poolFits()||[]).filter(f=>f.fits).sort((a,b2)=>(F.leads.length&&index?(index.rows.find(r=>r.name===F.leads[0].name)?.styles.includes(b2.id)-index.rows.find(r=>r.name===F.leads[0].name)?.styles.includes(a.id)):0)||b2.cards-a.cards)[0];x.primary=best?best.id:'';def=definitionOf();}
    if(x.primary==='tribal'&&!x.tribe&&F.graph){const t=V.chooseTribe(F.graph.cards,identity(),F.leads.map(c=>F.graph.cards.find(g=>g.name===c.name)).filter(Boolean));x.tribe=t?t.id:'';def=definitionOf();}
    const counts=F.graph?V.mechanicCounts(F.graph.cards,identity(),x.mechanics):[];
    x.missing=A.missing({composition:def.composition.primary?def.composition:null,mechanics:x.mechanics},counts);
    if(x.missing.length){F.section=x.missing[0].section.toLowerCase();return draw();}
    await commit({type:'editDeck',deckId,name:F.name||M.deck(C.state,deckId).name,definition:def},{renderView:false});
    return review();}
  const commands=[{type:'editDeck',deckId,name:F.name||M.deck(C.state,deckId).name,definition:def}];
  let left=[];
  if(x.cards==='merge'){if(!x.group){x.missing=[{section:'Cards',says:'Choose the group to merge in.'}];return draw();}
    const r=mergeCommands(deckId,x.group,def);commands.push(...r.commands);left=r.left;}
  await commit({type:'batch',summary:x.cards==='merge'?`Merged a group into ${F.name}`:`Defined ${F.name}`,commands});
  F=null;actions.close();go('decks',{deck:deckId});
  if(left.length)C.notice(`Left out ${left.length} card${left.length===1?'':'s'}: ${left.slice(0,6).map(l=>`${l.name} (${l.why})`).join(', ')}${left.length>6?'…':''}.`,false,{undo:false});};

/* MERGE IN A GROUP (CRD-3, Q16): the group's cards go on the list, within the card sources; the source group is left as
   it is and its copies are filed in this deck's group too. Cards outside the commander's colors, past the hundred, or
   not allowed by the card sources are listed and left out. */
function mergeCommands(deckId,groupId,def){const s=C.state,d=M.deck(s,deckId),g=s.groups.find(x=>x.id===groupId),id=new Set(d.commanders.flatMap(c=>C.card(c)?.colorIdentity||[]));
  const lots=s.lots.filter(l=>l.groupIds.includes(groupId)),names=new Map();
  for(const l of lots){const c=s.cards[l.cardId];if(c&&!names.has(c.id))names.set(c.id,{c,owned:l.source==='owned',inBox:l.location?.kind==='deck'});}
  for(const r of g.entries){const c=s.cards[r.cardId];if(c&&!names.has(c.id))names.set(c.id,{c,owned:false,inBox:false});}
  const slots=d.slots.map(r=>({cardId:r.cardId,quantity:r.quantity})),left=[],sources=def.cardSources||'buy';let seats=slots.reduce((n,r)=>n+r.quantity,0);
  for(const {c,owned,inBox} of names.values()){
    if(slots.some(r=>r.cardId===c.id))continue;
    const ci=C.card(c.id)?.colorIdentity||c.colorIdentity||[];
    if(ci.some(x=>!id.has(x))){left.push({name:c.name,why:'outside the colors'});continue;}
    if(sources==='bench'&&(!owned||inBox)){left.push({name:c.name,why:'not on the Bench'});continue;}
    if(sources==='buy'&&inBox&&owned){left.push({name:c.name,why:'in another deck'});continue;}
    if(seats>=100){left.push({name:c.name,why:'past the hundred'});continue;}
    slots.push({cardId:c.id,quantity:1});seats++;}
  return {commands:[{type:'editDeck',deckId,slots},...(lots.length&&d.groupId?[{type:'groupLots',groupId:d.groupId,lotIds:lots.map(l=>l.id)}]:[])],left};}

/* ── REVIEW (RVW) ─────────────────────────────────────────────────────────────────────────────────────────────── */
function availability(){const s=C.state,bench=new Map(),decks=new Map();
  for(const l of s.lots){if(l.source!=='owned'||(l.offer||'none')!=='none')continue;const c=s.cards[l.cardId];if(!c)continue;
    if(!l.allocation&&!l.chosenFor&&l.location?.kind!=='deck')bench.set(c.name,(bench.get(c.name)||0)+l.quantity);
    else if(l.location?.kind==='deck'&&l.location.deckId!==F.deckId){const x=s.decks.find(y=>y.id===l.location.deckId);if(x&&!x.archived){const list=decks.get(c.name)||[];list.push({deckId:x.id,name:x.name,lotId:l.id});decks.set(c.name,list);}}}
  return name=>({bench:bench.get(name)||0,decks:decks.get(name)||[]});}
async function review(){
  const graph=F.graph||await C.catalog.loadGraph();F.graph=graph;
  targets??=await loadJSON('data/composition-targets.json?v=1').catch(()=>null);brackets??=(await loadJSON('data/commander-brackets.json').catch(()=>({brackets:[]}))).brackets;
  const d=M.deck(C.state,F.deckId),def=d.definition,leads=F.leads.map(c=>graph.cards.find(g=>g.name===c.name)).filter(Boolean);
  const recs=R.recommend({commanders:leads,definition:{styles:[def.composition?.primary,def.composition?.secondary].filter(Boolean),mechanics:def.mechanicIds||[]},pool:graph.cards,relate:globalThis.CrankGraph?.relate||null,loops:globalThis.CrankLoops||null});
  /* Mass land denial is refused where the card's own text can prove it (compliance-model.js, when loaded). */
  const tagsOf=globalThis.MtgComplianceModel?.deriveComplianceTags,exclude=c=>{if(!def.restrictionFlags?.massLandDenial||!tagsOf)return false;const rec=C.card(c.id)||C.catalog.exact?.(c.name);return !!rec&&!!rec.oracleText&&tagsOf(rec).includes('mass land denial');};
  const banned=new Set(((await loadJSON('data/commander-banned.json').catch(()=>({cards:[]}))).cards||[]).map(x=>typeof x==='string'?x:x.name));
  F.review={out:A.build({commanders:leads,definition:{...def,mechanics:def.mechanicIds||[],neverInclude:[]},weighting:Object.entries({Balanced:'Balanced',Aggressive:'Offense',Defensive:'Defense',Reactive:'Response','Value engine':'Value',Combo:'Combo'}).find(([k])=>k===def.playStyle)?.[1]||'Balanced',targets,pool:graph.cards,recommendations:recs,available:availability(),exclude,banned,brackets}),removed:new Set(),open:null};
  F.step='review';draw();}
const imageOf=name=>{const g=F.graph?.cards.find(c=>c.name===name);return C.card(g?.id)?.imageSmall||g?.image||'';};
function drawReview(){const {out,removed,open}=F.review,slots=out.slots,live=slots.filter(s=>s.card&&!removed.has(s.seat));
  const toBuy=live.filter(s=>s.source==='buy').reduce((n,s)=>n+(s.price||0),0),budget=M.deck(C.state,F.deckId).definition.budget;
  const groups=new Map();for(const s of slots){const k=s.role==='theme'?s.label:s.label.split(',')[0];if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);}
  const flags=(out.summary.mechanics||[]).filter(m=>m.flagged);
  const bar=`<div class="cm-review-bar" role="status"><span><b>${live.length}</b> of ${slots.length} seats filled</span><span><b>${out.summary.lands}</b> lands</span><span>To buy <b>${e(C.money(Math.round(toBuy*100)/100))}</b>${Number.isFinite(budget)&&budget>0?` of ${e(C.money(budget))}`:''}</span><span>Bench <b>${live.filter(s=>s.source==='bench').length}</b> · To buy <b>${live.filter(s=>s.source==='buy').length}</b> · Other decks <b>${live.filter(s=>s.source==='deck').length}</b></span>${flags.map(m=>`<span class="cm-review-flag">${e(V.label(m.id.slice(2)))}: ${m.cards} cards fit</span>`).join('')}</div>`;
  const thumb=s=>`<li class="cm-review-card${removed.has(s.seat)?' is-removed':''}${open===s.seat?' is-open':''}" data-seat="${s.seat}"><label class="cm-review-tick"><input type="checkbox" data-review-tick="${s.seat}" aria-label="Select ${e(s.card)}"${removed.has(s.seat)?' disabled':''}></label><button type="button" class="cm-review-thumb" data-action="review-open" data-seat="${s.seat}" title="${e(s.card)} · ${e(s.label)}">${imageOf(s.card)?`<img src="${e(imageOf(s.card))}" alt="${e(s.card)}" loading="lazy">`:`<span>${e(s.card)}</span>`}</button><small>${e(s.source==='deck'?`in ${String(C.state.decks.find(x=>x.id===s.deckId)?.name||'').split(' ')[0]}`:s.source==='bench'?'Bench':'To buy')}</small></li>`;
  const empty=s=>`<li class="cm-review-card is-empty" data-seat="${s.seat}"><span>${e(s.label)}</span><small>Empty seat</small></li>`;
  const body=[...groups].map(([k,list])=>`<section class="cm-review-group"><h3>${e(k)} <small>${list.filter(s=>s.card&&!removed.has(s.seat)).length}</small></h3><ul>${list.map(s=>s.card&&!removed.has(s.seat)?thumb(s):empty(s)).join('')}</ul></section>`).join('');
  const s=open?slots.find(x=>x.seat===open):null;
  const alt=s?`<aside class="cm-review-alts" aria-label="Alternatives for ${e(s.card)}"><h3>${e(s.card)} <small>${e(s.label)}</small></h3>${s.alternatives.length?`<ul>${s.alternatives.map(a=>`<li><label class="cm-checkbox"><input type="radio" name="alt" value="${e(a.name)}">${e(a.name)} <small>${e(a.source==='bench'?'Bench':a.source==='deck'?'Other deck':'To buy')}${a.price?` · ${e(C.money(a.price))}`:''}</small></label></li>`).join('')}</ul><button type="button" class="v-button" data-action="review-confirm">Confirm</button>`:'<p class="cm-muted">No other card meets this seat.</p>'}</aside>`:'';
  const dlg=modal('Review the deck',`<div class="cm-flow cm-flow-review">${bar}<div class="cm-review-tools"><button type="button" class="v-button" data-action="review-remove">Remove</button></div><div class="cm-review-body">${body}</div>${alt}<footer class="cm-flow-foot"><button type="button" class="v-button" data-action="review-back">Back</button><button type="button" class="v-button primary" data-action="review-create">Create deck</button></footer></div>`);
  dlg.classList.add('cm-flow-dialog','cm-flow-dialog-review');}
actions['review-open']=el=>{F.review.open=Number(el.dataset.seat)===F.review.open?null:Number(el.dataset.seat);draw();};
/* RVW-2: an alternative that meets the same slot definition takes the seat. */
actions['review-confirm']=()=>{const pick=document.querySelector('.cm-review-alts [name=alt]:checked');if(!pick)throw Error('Choose an alternative first.');const s=F.review.out.slots.find(x=>x.seat===F.review.open),a=s.alternatives.find(x=>x.name===pick.value);
  const old={name:s.card,source:s.source,price:s.price};Object.assign(s,{card:a.name,source:a.source,price:a.price,deckId:null});s.alternatives=[old,...s.alternatives.filter(x=>x.name!==a.name)].slice(0,5);F.review.open=null;draw();};
/* RVW-3: ticked cards come out; their seats stay empty for the Library later. */
actions['review-remove']=()=>{const ticks=[...document.querySelectorAll('[data-review-tick]:checked')].map(x=>Number(x.dataset.reviewTick));if(!ticks.length)throw Error('Tick the cards to remove first.');for(const t of ticks)F.review.removed.add(t);draw();};
actions['review-back']=()=>{F.step='define';F.section='cards';draw();};
/* RVW-6: each card enters by its source -- a Bench copy as the deck's own card (Loading), a card to buy as Reserved ·
   To buy, a copy in another deck as Reserved · in Dn. Nothing is boxed or bought; the deck stays a draft. The slot
   definitions are saved with the deck (CRD-8). */
actions['review-create']=async()=>{const {out,removed}=F.review,s=C.state,deckId=F.deckId,d=M.deck(s,deckId),graph=F.graph;
  const live=out.slots.filter(x=>x.card&&!removed.has(x.seat)),names=[...live.map(x=>x.card),...out.lands.nonbasic.map(x=>x.name),...out.lands.basic.map(x=>x.name)];
  const recs=new Map();for(const n of new Set(names)){const c=C.catalog.exact?.(n)||C.catalog.search(n,{limit:1}).find(x=>x.name===n);if(c)recs.set(n,c);}
  const missing=[...new Set(names)].filter(n=>!recs.has(n));if(missing.length)throw Error(`These cards are not in the card catalog yet: ${missing.slice(0,5).join(', ')}.`);
  const slots=[...d.slots.map(r=>({cardId:r.cardId,quantity:r.quantity})),...live.map(x=>({cardId:recs.get(x.card).id,quantity:1,seat:{role:x.role,label:x.label,...(x.mv?{mv:x.mv}:{}),...(x.style?{style:x.style}:{}),...(x.mechanic?{mechanic:x.mechanic}:{}),...(x.tribe?{tribe:x.tribe}:{})}})),
    ...out.lands.nonbasic.map(x=>({cardId:recs.get(x.name).id,quantity:1,seat:{role:'land',label:'land'}})),...out.lands.basic.filter(x=>x.quantity>0).map(x=>({cardId:recs.get(x.name).id,quantity:x.quantity,seat:{role:'land',label:'basic land'}}))];
  /* Two names the catalog reads as one card (a flavor name, a face) are one seat with two copies' worth, never two rows. */
  const merged=[];for(const r of slots){const same=merged.find(x=>x.cardId===r.cardId);if(same)same.quantity+=r.quantity;else merged.push({...r});}
  const commands=[{type:'cards',cards:[...new Map([...recs.values()].map(c=>[c.id,c])).values()]},{type:'editDeck',deckId,slots:merged}];
  await commit({type:'batch',summary:`Auto-created ${live.length+out.summary.lands} cards for ${d.name}`,commands},{renderView:false});
  /* A Bench copy is reserved to its seat (Loading, the deck's own card, not in the box); a copy in another deck's box,
     chosen as this deck's card, is reserved to its seat here too: Reserved · in Dn. */
  const after=C.state,deck=M.deck(after,deckId),reserve=[],taken=new Set();
  const lotFor=(cid,test)=>after.lots.find(z=>!taken.has(z.id)&&z.cardId===cid&&z.source==='owned'&&(z.offer||'none')==='none'&&z.allocation?.deckId!==deckId&&test(z));
  const room=new Map(deck.slots.map(r=>[r.id,M.shortfall(after,deck,r)]));
  for(const x of [...live,...out.lands.nonbasic.map(y=>({card:y.name,source:y.source}))]){const cid=recs.get(x.card).id,r=deck.slots.find(z=>z.cardId===cid);if(!r||!(room.get(r.id)>0))continue;
    const l=x.source==='bench'?lotFor(cid,z=>!z.allocation&&!z.chosenFor&&z.location?.kind!=='deck'):x.source==='deck'&&x.deckId?lotFor(cid,z=>z.location?.kind==='deck'&&z.location.deckId===x.deckId):null;
    if(l){taken.add(l.id);room.set(r.id,room.get(r.id)-1);reserve.push({type:'allocate',lotId:l.id,deckId,slotId:r.id,quantity:1,confirmed:true});}}
  for(let i=0;i<reserve.length;i+=100)await commit({type:'batch',summary:`Reserved ${reserve.length} owned cop${reserve.length===1?'y':'ies'} for ${d.name}`,commands:reserve.slice(i,i+100)},{renderView:false});
  F=null;actions.close();go('decks',{deck:deckId});};

function draw(){if(!F)return;if(F.step==='start')drawStart();else if(F.step==='define')drawDefine();else drawReview();}
});
