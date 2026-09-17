import {defaultPlaymat,resolvePlaymat,readMatPreferences,paintMat} from '/playmats.mjs';
import {openGameSetup} from '/setup.mjs';
import {validateActionRevision,paymentMayAutoResolve,mayAutoPassPriority} from '/action-policy.mjs';
import {cardGridMetrics,arrangeCardGroups} from '/card-layout.mjs';
import {createLivePoller} from '/live-poll.mjs';
// Earlier running hosts do not advertise this module until their next restart.
const {manaStatus,manaColors,sourceColors}=await import('/mana-status.mjs').catch(()=>({manaStatus:null,manaColors:[]}));
const {recommendedActions,combatTotals}=await import('/play-guidance.mjs').catch(()=>({recommendedActions:()=>[],combatTotals:()=>[]}));
import '/handoff.mjs';
import '/app/card-classify.js';
import '/app/crankmagic-facets.js';
const $=id=>document.getElementById(id);
const guestMode=location.pathname==='/play';
let seatSession=null;if(guestMode)try{seatSession=JSON.parse(sessionStorage.getItem('crankmagic-seat-session')||'null');}catch{/* The lobby will replace a corrupt browser-only session. */}
let viewerSeatId=Number.isSafeInteger(seatSession?.seatId)?seatSession.seatId:0;
const debugDecisions=new URLSearchParams(location.search).has('debugDecisions');
let lastActionSuccess=null;
document.body.classList.add('table-view');
const opponents=document.createElement('div');opponents.className='opponent-boards';opponents.setAttribute('aria-label','Opponent boards');
$('seat-1').before(opponents);for(const id of [1,2,3])opponents.append($('seat-'+id));
function reportCanvasSize(){if(window.parent!==window)window.parent.postMessage({type:'crankmagic-canvas-size',height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin);}
new ResizeObserver(reportCanvasSize).observe(document.body);
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===window.parent&&event.data?.type==='crankmagic-viewport'&&Number.isFinite(event.data.height))document.body.style.setProperty('--table-viewport',Math.max(400,Math.min(4000,event.data.height))+'px');});

const data=await fetch('/match.json').then(r=>r.ok?r.json():{frames:[],log:[],pod:{seats:[]}}).catch(()=>({frames:[],log:[],pod:{seats:[]}}));
let resizingBoard=false,boardWidth=null,draggingCard=null,suppressClickUntil=0,pendingPlay=null,lastTurnName='',live=null,livePolling=false,gameToken=null,lastState='',choiceId=null,actionBusy=false,aiPrompting=false,noticeUntil=0,lastDecision='';
const pendingCasts=new Map(),handPositions=new Map();let appliedRevision=-1,appliedMatch=null,paymentAttempt=null,paymentNotice='',approvedPayment=null,yieldTurn=null,holdResponsesTurn=null;
let primarySeat=viewerSeatId,followActive=false,followedTurn=null;const visualGroups=new Map(),freePositions=new Map();
let hideOpponents=false,hideInformation=false;
let cardZoom=100;try{const saved=Number(localStorage.getItem('crankmagic-card-zoom'));if(saved>=32&&saved<=140)cardZoom=saved;}catch{}
const zoneLayouts=new Map(),cardLayoutObserver=new ResizeObserver(entries=>{for(const {target}of entries)zoneLayouts.get(target)?.();});
function releaseCardLayouts(root){for(const zone of root.querySelectorAll('.mat-zone')){cardLayoutObserver.unobserve(zone);zoneLayouts.delete(zone);}}
let lastActionError='';
try{const saved=Number(localStorage.getItem('crankmagic-board-width'));if(saved>=320&&saved<=2400)boardWidth=saved;}catch{}
const names=['You · Chulane','Krenko','Atraxa','Shadrix'];
const levels=new Map([[1,3],[2,3],[3,3]]);
const visibleArtwork=new Map();for(const f of data.frames)for(const p of f.players)for(const z of Object.values(p.zones))for(const c of z.cards)if(c.name&&c.art)visibleArtwork.set(c.name,c.art);
let index=Math.max(0,data.frames.findIndex(f=>f.turn>=18 && f.phase==='MAIN1'));
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function button(text,fn,cls){const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;}
function frame(){return live?.state?.players?live.state:data.frames[index];}
function humanPlayer(){return frame()?.players.find(p=>p.playerId===viewerSeatId);}
let rememberedTurn=-1;
function turnPlayer(){
  const f=frame();if(!f)return null;
  if(Number.isInteger(f.turnPlayerId))return f.players.find(p=>p.playerId===f.turnPlayerId);
  // Compatibility with an already-running adapter, which exposes turn ownership in its prompt.
  const match=live?.ui.prompt?.match(/Turn:\s*(\d+)\s*\(([^\n]+)\)/);
  if(match&&Number(match[1])===f.turn){lastTurnName=match[2];rememberedTurn=f.turn;}
  return rememberedTurn===f.turn?f.players.find(p=>p.name===lastTurnName):null;
}
function hasPriority(){if(Number.isInteger(frame()?.priorityPlayerId))return frame().priorityPlayerId===viewerSeatId;return live?.ui.prompt?.match(/^Priority:\s*([^\n]+)/)?.[1]===humanPlayer()?.name;}
function attackSelection(){return live?.ui.inputType==='InputAttack'||/Select creatures to attack/i.test(live?.ui.prompt||'');}
function blockSelection(){return live?.ui.inputType==='InputBlock'||/Select.*blocker|select.*block target/i.test(live?.ui.prompt||'');}
function canSelectCard(c){return live?.ui.selectables.includes(c.cardId)||((attackSelection()||blockSelection())&&!!live?.ui.cardActions?.[c.cardId]);}
function phaseName(phase){return ({MAIN1:'main phase 1',MAIN2:'main phase 2',END_OF_TURN:'end step',COMBAT_DECLARE_ATTACKERS:'declare attackers',COMBAT_DECLARE_BLOCKERS:'declare blockers'})[String(phase).toUpperCase()]||String(phase&&phase!=='null'?phase:'Setup').replaceAll('_',' ').toLowerCase();}
function turnLabel(){const p=turnPlayer(),phase=frame()?.phase;return `${p?.playerId===viewerSeatId?'YOUR TURN':p?`${p.name}’s turn`:frame()?.turn===0?'SETTING UP':'TURN OWNER UNAVAILABLE'} · Turn ${frame()?.turn??0} · ${phaseName(phase)}`;}
function notifyAction(text){$('notice').textContent=text;noticeUntil=Date.now()+6500;let toast=$('action-notice');if(!toast){toast=el('div','action-notice');toast.id='action-notice';toast.setAttribute('role','status');document.body.append(toast);}(($('focus').open)?$('focus'):document.body).append(toast);toast.textContent=text;toast.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>toast.hidden=true,6500);}
function playRestriction(c){
  if(!live)return 'Connect to your live table first.';
  if(live.ui.choice||live.ui.nativeFallback)return 'Finish the current card choice first.';
  if(live.ui.ok==='Auto'&&humanPlayer()?.zones.Hand.cards.some(h=>h.cardId===c.cardId))return 'Finish the current mana payment or cancel it before playing another card.';
  if(humanPlayer()?.zones.Hand.cards.some(h=>h.cardId===c.cardId)&&c.typeLine?.split('—')[0].includes('Land')){
    const owner=turnPlayer();if(owner&&owner.playerId!==viewerSeatId)return `It is ${owner.name}’s turn. Play this land during your main phase.`;
    if(!['MAIN1','MAIN2'].includes(frame().phase)||frame().stackSize>0)return 'Play a land during your main phase, with an empty stack.';
  }
  return '';
}
async function playCard(c){
  if(actionBusy){notifyAction('Your previous action is still being submitted.');return;}
  if(pendingCasts.has(c.cardId)){notifyAction(`${c.name} is already being played. Its progress is shown on your mat.`);return;}
  const reason=playRestriction(c);if(reason){notifyAction(reason);return;}
  const fromZone=['Hand','Command'].find(z=>humanPlayer()?.zones[z].cards.some(h=>h.cardId===c.cardId));
  if(fromZone){pendingPlay={cardId:c.cardId,card:{...c},fromZone,started:Date.now(),stage:'Submitting play…',leftSource:false,autoPaid:false};pendingCasts.set(c.cardId,pendingPlay);refreshBoards();}
  if(!await gameAction({kind:'card',targetId:c.cardId})){pendingCasts.delete(c.cardId);if(pendingPlay?.cardId===c.cardId)pendingPlay=null;refreshBoards();}
}
function updatePendingCasts(){
  const ui=live.ui,players=frame().players,now=Date.now();
  for(const [id,cast]of pendingCasts){
    const location=players.flatMap(p=>Object.entries(p.zones).map(([zone,z])=>({zone,card:z.cards.find(c=>c.cardId===id)}))).find(item=>item.card);
    const inSource=humanPlayer()?.zones[cast.fromZone].cards.some(c=>c.cardId===id);
    let finished='';
    if(location&&location.zone!==cast.fromZone)finished=`${cast.card.name} ${location.zone==='Battlefield'?'entered the battlefield.':'moved to '+location.zone.toLowerCase()+'.'}`;
    else if(cast.leftSource&&inSource&&!ui.choice&&ui.ok!=='Auto')finished=cast.failureReason||`${cast.card.name} returned to your ${cast.fromZone.toLowerCase()}.`;
    else if(!ui.choice&&/^Action was not completed:|^That action is unavailable/.test(ui.prompt))finished=ui.prompt;
    else if(inSource&&!ui.choice&&ui.ok!=='Auto'&&now-cast.started>5000)finished=`${cast.card.name} is still in your ${cast.fromZone.toLowerCase()}. Check timing, costs and remaining land plays.`;
    else if(!location&&cast.leftSource&&frame().stackSize===0&&!ui.choice&&ui.ok!=='Auto'&&now-cast.started>15000)finished=`${cast.card.name} is no longer in a visible zone. Check History for the result.`;
    if(finished){pendingCasts.delete(id);if(pendingPlay===cast)pendingPlay=null;notifyAction(finished);continue;}
    if(!inSource)cast.leftSource=true;
    cast.stage=ui.nativeFallback?'Choice needed in engine window':pendingPlay===cast&&ui.choice?'Choose how to play':pendingPlay===cast&&ui.ok==='Auto'?(ui.okEnabled?'Paying available mana…':'Mana payment needed'):!inSource&&frame().stackSize>0?'On the stack · awaiting responses':!inSource?'Finishing the cast…':'Submitting play…';
  }
}
function castingPreview(){
  const tray=el('section','casting-tray');tray.setAttribute('aria-label','Cards being played');
  const announced=(frame().stack||[]).filter(item=>item.kind!=='spell'||!pendingCasts.has(item.cardId)).map(item=>({cardId:item.cardId,card:{...item,name:item.name||'Face-down spell'},stage:item.stage==='casting'?'Mana payment needed':'On the stack · awaiting responses'}));
  for(const cast of [...pendingCasts.values(),...announced]){
    const row=el('div','casting-card');row.dataset.pendingCard=cast.cardId;
    const art=button('',()=>inspect(cast.card),'casting-art');art.setAttribute('aria-label','Inspect pending '+cast.card.name);if(cast.card.art){const img=el('img');img.src=cast.card.art;img.alt=cast.card.name;art.append(img);}else art.textContent=cast.card.name;
    const info=el('div');info.append(el('small','',cast.card.kind&&cast.card.kind!=='spell'?'ABILITY':'SPELL'),el('strong','',cast.card.name),el('span','casting-status',cast.stage));
    const stackItem=(frame().stack||[]).find(item=>cast.card.stackId!=null?item.stackId===cast.card.stackId:item.cardId===cast.cardId&&item.kind==='spell');
    if(stackItem?.targets?.length){const list=el('div','casting-targets');list.append(el('strong','','Targets'));for(const target of stackItem.targets)list.append(el('span','',target.name||(target.kind==='player'?'Player '+target.playerId:'Hidden card #'+target.cardId)));info.append(list);}
    if(cast.stage.startsWith('On the stack')){info.append(el('small','',cast.card.kind&&cast.card.kind!=='spell'?'The ability resolves after responses.':/Creature|Artifact|Enchantment|Planeswalker|Battle/.test(cast.card.typeLine||'')?'Enters play after the spell resolves.':'Resolves after players finish responding.'));if(hasPriority()&&!live.ui.choice&&/^Priority:/m.test(live.ui.prompt)){const next=button('Pass priority',()=>gameAction({kind:'ok'},fresh=>fresh.ui.ok==='OK'&&fresh.ui.okEnabled&&!fresh.ui.choice&&fresh.state.stackSize>0&&fresh.state.priorityPlayerId===viewerSeatId),'primary-action');info.append(next);}}
    else if(live.ui.ok==='Auto'&&!live.ui.okEnabled)info.append(el('small','','Not enough available mana for automatic payment. Use a mana source or cancel below.'));
    else if(live.ui.choice||live.ui.nativeFallback)info.append(button('Show choice',()=>{mountControls();controls.scrollIntoView({block:'nearest',behavior:'smooth'});}));
    row.append(art,info);tray.append(row);
  }
  return tray;
}
let selectedCardId=null,cardMenu=null;
function highlightSelection(id){selectedCardId=id;for(const node of document.querySelectorAll('.card[data-card-id]'))node.classList.toggle('selected-card',Number(node.dataset.cardId)===id);}
function closeCardMenu(){if(cardMenu){cardMenu.hidePopover();cardMenu.remove();cardMenu=null;}highlightSelection(null);lastDecision='';}
function cardActions(c,anchor){
  if(canSelectCard(c)){gameAction({kind:'card',targetId:c.cardId});return;}
  closeCardMenu();highlightSelection(c.cardId);
  const body=el('div','card-quick-actions');body.setAttribute('popover','auto');body.setAttribute('role','dialog');body.setAttribute('aria-label',c.name+' actions');cardMenu=body;
  const heading=el('div','quick-action-heading');heading.append(el('strong','',c.name),button('×',closeCardMenu));body.append(heading);
  if(c.art){const image=el('img','quick-card-image');image.src=c.art;image.alt=c.name;image.draggable=false;body.append(image);}
  const own=humanPlayer();const zone=Object.keys(own?.zones||{}).find(z=>own.zones[z].cards.some(card=>card.cardId===c.cardId));
  if(zone){const reason=playRestriction(c),action=button(zone==='Hand'?(c.typeLine?.includes('Land')?'Play land':'Cast card'):zone==='Command'?'Cast commander':'Use ability →',()=>{if(zone!=='Battlefield')closeCardMenu();highlightSelection(c.cardId);playCard(c);},'primary-action');action.disabled=!!reason;action.title=reason||'Show this card’s engine-offered actions, including mana and other costs.';body.append(action);if(reason)body.append(el('p','fine',reason));else if(zone==='Battlefield')body.append(el('small','',c.tapped?'Tapped · an effect is needed to untap. Other abilities may still be usable.':'Untapped · tap costs are paid when you use an ability.'));}
  if(visualGroups.has(c.cardId))body.append(button('Ungroup this card',()=>{visualGroups.delete(c.cardId);closeCardMenu();refreshBoards();}));
  if(freePositions.has(c.cardId))body.append(button('Return to automatic layout',()=>{freePositions.delete(c.cardId);closeCardMenu();refreshBoards();}));
  body.append(el('div','quick-ability-options'));
  if(c.oracleText)body.append(el('p','quick-rules',c.oracleText));
  body.addEventListener('click',event=>{if(!event.target.closest('button,a,input,select,textarea'))closeCardMenu();});
  ($('focus').open?$('focus'):document.body).append(body);body.showPopover();
  const r=anchor?.getBoundingClientRect()||{right:innerWidth/2,left:innerWidth/2,top:innerHeight/2};
  body.style.left=Math.max(8,Math.min(innerWidth-body.offsetWidth-8,r.right+10))+'px';body.style.top=Math.max(8,Math.min(innerHeight-body.offsetHeight-8,r.top))+'px';
  body.addEventListener('toggle',event=>{if(event.newState==='closed'&&cardMenu===body){cardMenu=null;body.remove();highlightSelection(null);lastDecision='';}});
  (body.querySelector('.primary-action:not(:disabled)')||body.querySelector('button'))?.focus();
}
function refreshBoards(){if(draggingCard!==null||resizingBoard||!frame())return;render();if($('focus').open)focusBoard(frame().players.find(p=>p.playerId===Number($('focus').dataset.seat)));}
function handCarousel(cards,id){
  const shell=el('div','hand-carousel'),track=el('div','cards hand-track');track.id=id;track.tabIndex=0;track.setAttribute('aria-label','Your hand cards');
  const previous=button('‹',()=>move(-1),'hand-arrow'),next=button('›',()=>move(1),'hand-arrow');
  previous.setAttribute('aria-label','Scroll your hand left');next.setAttribute('aria-label','Scroll your hand right');
  previous.setAttribute('aria-controls',id);next.setAttribute('aria-controls',id);
  function move(direction){track.scrollBy({left:direction*Math.max(140,track.clientWidth*.8),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
  function update(){previous.disabled=track.scrollLeft<=1;next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;}
  track.addEventListener('scroll',()=>{handPositions.set(id,track.scrollLeft);update();},{passive:true});track.addEventListener('keydown',e=>{if(e.target!==track)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}});
  for(const card of cards)track.append(cardButton(card));if(!cards.length)track.append(el('p','empty','Your hand is empty.'));
  shell.append(previous,track,next);requestAnimationFrame(()=>{track.scrollLeft=handPositions.get(id)||0;update();});
  // Observe this mounted carousel only; disconnect when its host is re-rendered.
  const observer=new ResizeObserver(()=>{if(shell.isConnected)update();});observer.observe(track);shell.dispose=()=>observer.disconnect();
  return shell;
}
function disposeCarousels(host){for(const shell of host.querySelectorAll('.hand-carousel'))shell.dispose?.();}
let deckFacts;
async function deckView(){
  const seat=data.pod.seats[0],deck=seat?.deck,body=el('div','deck-browser');
  if(!deck){showDialog('Your deck',el('p','fine','Your deck will be available after the table connects.'));return;}
  body.append(el('p','fine',`${deck.name} · ${deck.total} cards in your starting list. Filters describe card abilities; fired mechanics are recorded separately during play.`));
  const loading=el('p','fine','Loading card filters…');body.append(loading);showDialog('Your deck · starting list',body);$('detail').classList.add('deck-dialog');
  // Reuse the app's public classifications. Never join historical ownership/deck flags.
  deckFacts??=Promise.all(['/app/data/cards.json','/app/data/graph.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error('Card catalog unavailable');return r.json();}))).catch(()=>{deckFacts=null;return null;});
  const facts=await deckFacts;if(!body.isConnected)return;loading.remove();
  const lookup=cards=>{const m=new Map();for(const c of cards){if(c.oracleId||c.id)m.set(c.oracleId||c.id,c);m.set(c.name,c);}return m;};
  const catalog=lookup(facts?.[0]?.cards||[]),graph=lookup(facts?.[1]?.cards||[]),snapshot=lookup(seat.mechanics?.cards||[]);
  const facets=globalThis.CrankFacets.FACETS.filter(f=>!f.mine&&!['colors','mv','lands'].includes(f.key));
  const rows=[...deck.commanders.map(c=>({...c,section:'Commander'})),...deck.library.map(c=>({...c,section:'Main deck'}))].map(entry=>{
    const find=m=>m.get(entry.oracleId)||m.get(entry.name)||{},raw={...find(catalog),...find(snapshot),...entry},g=find(graph);
    const tags=globalThis.MtgCardClassify.classify({typeLine:raw.typeLine,oracleText:raw.oracleText,keywords:raw.keywords||[],card_faces:raw.faces||[]});
    const row={...raw,...tags,type:raw.typeLine,mv:raw.manaValue??g.mv??null,rarity:raw.rarity||g.rarity||'',deckEntry:true,art:entry.art?.normal||visibleArtwork.get(entry.name)};
    for(const f of facets)if(Array.isArray(tags[f.key])||Array.isArray(raw[f.key])||Array.isArray(g[f.key]))row[f.key]=[...new Set([...(tags[f.key]||[]),...(raw[f.key]||[]),...(g[f.key]||[])])];
    return row;
  });
  if(!facts)body.append(el('p','fine','Public catalog unavailable. Using the saved deck mechanics; some price and mana-value filters may have incomplete coverage.'));
  const controls=el('div','deck-filters'),primary=el('div','deck-filter-grid'),more=el('details','deck-more'),advanced=el('div','deck-filter-grid');more.append(el('summary','','More filters · triggers, mechanics, tribes and mana value'),advanced);
  const inputs=new Map(),selected={};
  function field(label,key,choices,host=primary){
    const wrap=el('label','deck-filter'),input=el(choices?'select':'input');wrap.append(el('span','',label),input);input.setAttribute('aria-label',label);
    if(choices){const all=el('option','','All');all.value='';input.append(all);for(const value of choices){const option=el('option','',value);option.value=value;input.append(option);}}
    else{input.type=['min','max','price'].includes(key)?'number':'search';if(input.type==='number'){input.min='0';input.step='any';}}
    inputs.set(key,input);input.addEventListener(choices?'change':'input',()=>{selected[key]=input.value;draw();});host.append(wrap);
  }
  field('Search name or rules','q');
  for(const key of ['type','manaKind']){const f=facets.find(f=>f.key===key);field(f.label,key,[...new Set(rows.flatMap(f.from))].sort());}
  field('Color identity','color',['W','U','B','R','G','C']);field('Mechanic / keyword','keyword');
  for(const f of facets.filter(f=>!['type','manaKind'].includes(f.key)))field(f.label,f.key,[...new Set(rows.flatMap(f.from))].sort(),advanced);
  field('Subtype','subtype',null,advanced);field('Minimum mana value','min',null,advanced);field('Maximum mana value','max',null,advanced);field('Maximum price · USD','price',null,advanced);
  const count=el('p','deck-result-count');count.setAttribute('aria-live','polite');const results=el('div','deck-results');
  const reset=button('Clear filters',()=>{for(const [key,input]of inputs){input.value='';delete selected[key];}draw();});
  controls.append(primary,more,reset,count);body.append(controls,results);
  function draw(){
    const includes=(value,q)=>String(value||'').toLowerCase().includes(String(q||'').trim().toLowerCase());
    const visible=rows.filter(c=>{
      if(!includes(c.name+' '+(c.oracleText||''),selected.q)||!includes(c.typeLine,selected.subtype)||!includes([c.oracleText,...(c.keywords||[]),...(c.mechanics||[])].join(' '),selected.keyword))return false;
      if(selected.color&&(selected.color==='C'?(c.colorIdentity||[]).length:!(c.colorIdentity||[]).includes(selected.color)))return false;
      for(const [key,value,comparison]of [['min',c.mv,(a,b)=>a>=b],['max',c.mv,(a,b)=>a<=b],['price',c.price,(a,b)=>a<=b]])if(selected[key]!==undefined&&selected[key]!==''&&(value==null||!Number.isFinite(Number(value))||!comparison(Number(value),Number(selected[key]))))return false;
      return facets.every(f=>!selected[f.key]||f.from(c).includes(selected[f.key]));
    });
    count.textContent=`${visible.reduce((n,c)=>n+(c.quantity||1),0)} of ${deck.total} cards · ${visible.length} distinct entries`;results.replaceChildren();
    for(const label of ['Commander','Main deck']){const entries=visible.filter(c=>c.section===label);if(!entries.length)continue;const section=el('section'),list=el('div','cards');section.append(el('h3','',label));for(const c of entries.sort((a,b)=>a.name.localeCompare(b.name)))list.append(cardButton(c,c.quantity||1));section.append(list);results.append(section);}
    if(!visible.length)results.append(el('p','empty','No cards match these filters. Clear a filter to broaden the list.'));
  }
  draw();
}
const pileZones=[['Command','Command zone','mat-command'],['Exile','Exile','mat-exile'],['Library','Library','mat-library'],['Graveyard','Graveyard','mat-graveyard']];
function pileButton(p,zone,label,cls){
  const z=p.zones[zone],face=zone==='Command'?z.cards[0]:z.cards.at(-1),pile=button('',()=>{
    if(Date.now()<suppressClickUntil)return;
    if(zone==='Command'&&p.playerId===viewerSeatId&&face&&live){cardActions(face,pile);return;}
    if(zone==='Library')notifyAction(`${z.count} cards remain.${p.playerId===viewerSeatId?' Double-click to take your pending draw-step draw.':''}`);else zoneView(p,zone);
  },cls);
  if(zone==='Command'&&p.playerId===viewerSeatId&&face&&live){enableHandDrag(pile,face);pile.addEventListener('dblclick',()=>{closeCardMenu();playCard(face);});pile.title='Drag your commander onto your mat to cast; mana and commander tax are paid automatically.';}
  if(zone==='Library'&&p.playerId===viewerSeatId){pile.addEventListener('dblclick',drawStepCard);if(live?.ui.choice?.mode==='draw')pile.classList.add('draw-ready');pile.title='Double-click to take your pending draw-step draw';}
  pile.setAttribute('aria-label',`${names[p.playerId]} ${label}, ${z.count} cards`);
  if(zone==='Library'&&z.count){const back=el('span','library-back');back.append(el('span','','✦'));pile.append(back);}
  else if(face?.art){const art=el('img');art.draggable=false;art.src=face.art;art.alt=face.name;art.loading='lazy';pile.append(art);}else pile.append(el('span','pile-empty',z.count?'◇':'—'));
  pile.append(el('span','pile-count',z.count),el('span','mat-zone-label',label));return pile;
}
function groups(cards){
  if(live)return cards.map(card=>({card,count:1}));
  const m=new Map();
  for(const c of cards){const key=JSON.stringify([c.name,c.tapped,c.counters,c.power,c.toughness,c.damage,c.owner,c.controller,c.faceDown,c.art]);if(m.has(key))m.get(key).count++;else m.set(key,{card:c,count:1});}
  return [...m.values()];
}
function cardButton(c,count=1){
  const b=button('',()=>{if(Date.now()<suppressClickUntil)return;if(live&&!c.deckEntry&&canSelectCard(c))gameAction({kind:'card',targetId:c.cardId});else if(live&&!c.deckEntry&&Object.values(humanPlayer()?.zones||{}).some(z=>z.cards.some(card=>card.cardId===c.cardId)))cardActions(c,b);else inspect(c,count);},'card'+(c.tapped?' tapped':''));b.setAttribute('aria-label',`${c.name||'Face-down card'}${count>1?`, ${count} copies`:''}${c.tapped?', tapped':''}`);if(c.cardId!=null){b.dataset.cardId=c.cardId;b.classList.toggle('selected-card',c.cardId===selectedCardId);}
  const fallback=()=>{const box=el('span','fallback');box.append(el('strong','',c.name||'Face-down card'),el('b','',c.token?'✦':'◇'),el('small','',c.token?'TOKEN':'Card image unavailable'));b.replaceChildren(box);};
  if(c.art){const image=el('img');image.src=c.art;image.alt=c.name||'Face-down card';image.loading='lazy';image.draggable=false;image.addEventListener('error',fallback,{once:true});b.append(image);}else fallback();
  if(count>1)b.append(el('span','count','×'+count));
  if((c.typeLine?.includes('Creature')||c.token)&&(c.power!==undefined||c.toughness!==undefined))b.append(el('span','badge',`${c.power??'?'}/${c.toughness??'?'}`));
  if(c.counters&&Object.keys(c.counters).length){const dice=el('span','counter-dice');for(const [type,n] of Object.entries(c.counters))dice.append(el('span','die',`${type} ${n}`));b.append(dice);}
  if(live&&!c.deckEntry){
    b.draggable=false;
    if(['Hand','Command'].some(z=>humanPlayer()?.zones[z].cards.some(card=>card.cardId===c.cardId)))enableHandDrag(b,c);
    else if(frame().players.some(p=>p.zones.Battlefield.cards.some(card=>card.cardId===c.cardId)))enableHandDrag(b,c,true);
    b.addEventListener('dblclick',()=>{if(!Object.values(humanPlayer()?.zones||{}).some(z=>z.cards.some(card=>card.cardId===c.cardId)))return;closeCardMenu();if($('card-detail').open)$('card-detail').close();playCard(c);});
    b.addEventListener('contextmenu',event=>{event.preventDefault();cardActions(c,b);});
    if(canSelectCard(c))b.classList.add('selectable');
    const attack=frame().combat?.attacks.find(a=>a.attacker.cardId===c.cardId),block=frame().combat?.attacks.find(a=>a.blockers.some(x=>x.cardId===c.cardId));
    if(attack||block){b.classList.add('combat-assigned');b.append(el('span','combat-card-badge',attack?'→ '+attack.defender?.name:'Blocks '+block.attacker.name));}
  }
  return b;
}
function enableHandDrag(node,card,battlefield=false){
  node.classList.add('hand-draggable');
  node.addEventListener('pointerdown',down=>{
    if(down.button!==0)return;const x=down.clientX,y=down.clientY;let ghost=null,target=null;draggingCard=card.cardId;node.setPointerCapture(down.pointerId);
    const move=event=>{
      if(!ghost&&Math.hypot(event.clientX-x,event.clientY-y)<6)return;
      event.preventDefault();
      if(!ghost){draggingCard=card.cardId;document.body.classList.add('dragging-hand');ghost=node.cloneNode(true);ghost.removeAttribute('aria-label');ghost.setAttribute('aria-hidden','true');ghost.className='card drag-ghost';ghost.style.width=node.clientWidth+'px';($('focus').open?$('focus'):document.body).append(ghost);}
      ghost.style.left=(event.clientX-node.clientWidth/2)+'px';ghost.style.top=(event.clientY-35)+'px';
      target?.classList.remove('drop-ready');target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.player-mat[data-human-drop]');target?.classList.add('drop-ready');
    };
    const finish=event=>{
      node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',finish);node.removeEventListener('pointercancel',finish);
      draggingCard=null;
      if(ghost){suppressClickUntil=Date.now()+400;ghost.remove();target?.classList.remove('drop-ready');document.body.classList.remove('dragging-hand');const hit=document.elementFromPoint(event.clientX,event.clientY);target=hit?.closest('.player-mat[data-human-drop]');
        if(event.type==='pointerup'&&battlefield){const onto=Number(hit?.closest('.card[data-card-id]')?.dataset.cardId),player=frame().players.find(p=>p.zones.Battlefield.cards.some(c=>c.cardId===card.cardId)),mat=hit?.closest('.player-mat');if(onto!==card.cardId&&player?.zones.Battlefield.cards.some(c=>c.cardId===onto)){const group=visualGroups.get(onto)||'group:'+onto;visualGroups.set(onto,group);visualGroups.set(card.cardId,group);freePositions.delete(onto);freePositions.delete(card.cardId);notifyAction('Cards grouped visually. Game state is unchanged.');}else if(mat&&Number(mat.dataset.seat)===player?.playerId){const r=mat.getBoundingClientRect();visualGroups.delete(card.cardId);freePositions.set(card.cardId,{x:Math.max(0,Math.min(.83,(event.clientX-r.left)/r.width-.065)),y:Math.max(0,Math.min(.64,(event.clientY-r.top)/r.height-.04))});}}
        else if(event.type==='pointerup'&&target)playCard(card);refreshBoards();}
    };
    node.addEventListener('pointermove',move);node.addEventListener('pointerup',finish,{once:true});node.addEventListener('pointercancel',finish,{once:true});
  });
}
function inspect(c,count=1,initial=false){
  const box=$('inspector');box.replaceChildren();
  if(c.art){const img=el('img');img.src=c.art;img.alt=c.name;box.append(img);}
  box.append(el('h3','',c.name||'Face-down card'));
  if(c.typeLine)box.append(el('p','',c.typeLine));
  box.append(el('p','',c.deckEntry?`${count} ${count===1?'copy':'copies'} in your saved starting deck. This does not indicate which cards remain in the library.`:`${count>1?`${count} permanents with matching recorded attributes shown together. `:''}${c.tapped?'Tapped. ':''}${c.damage?`${c.damage} damage marked. `:''}Card instance ${c.cardId??'commander'}.`));
  box.append(el('p','',c.art?'Actual card printing. Rules state comes from the engine.':'This preview has no cached artwork for this token or card.'));
  if(!initial) {
    $('card-detail-body').replaceChildren(...[...box.children].map(n=>n.cloneNode(true)));
    $('card-detail').showModal();
    syncModalViewport();
  }
}
function syncModalViewport(){if(window.parent!==window)window.parent.postMessage({type:'crankmagic-focus',open:!!document.querySelector('dialog[open]:not(#game-setup)')},location.origin);}
function showDialog(title,body){delete $('detail').dataset.history;$('detail').classList.remove('mat-dialog','deck-dialog');$('detail-title').textContent=title;$('detail-body').replaceChildren(body);if(!$('detail').open)$('detail').showModal();syncModalViewport();}
function zoneView(p,zone){const body=el('div');const z=p.zones[zone];body.append(el('p','fine',`${z.count} cards · recorded turn ${frame().turn}`));const cards=el('div','cards');for(const {card,count} of groups(z.cards))cards.append(cardButton(card,count));if(!z.cards.length)cards.append(el('p','empty','This zone has no visible cards.'));body.append(cards);showDialog(`${names[p.playerId]} · ${zone}`,body);}
// A presentation partition, not a rules classification. Each permanent appears once.
// Use only the type portion, so subtypes such as Enchantment don't misclassify a card.
function boardGroups(cards){
  const buckets=new Map(['Creatures','Artifacts','Enchantments','Planeswalkers','Battles','Other permanents','Mana · lands'].map(name=>[name,[]]));
  for(const card of cards){
    const types=(card.typeLine||'').split(/—|\s-\s/)[0].split(/\s+/);
    const name=card.faceDown?'Other permanents':types.includes('Creature')?'Creatures':types.includes('Land')?'Mana · lands':types.includes('Artifact')?'Artifacts':types.includes('Enchantment')?'Enchantments':types.includes('Planeswalker')?'Planeswalkers':types.includes('Battle')?'Battles':'Other permanents';
    buckets.get(name).push(card);
  }
  return [...buckets];
}
function focusBoard(p){
  if(!p)return;
  const dialog=$('focus');dialog.className='focus-dialog tone-'+p.playerId;dialog.dataset.seat=p.playerId;
  $('focus-title').textContent=names[p.playerId];
  $('focus-status').replaceChildren(el('strong','',turnLabel()),button('Life '+p.health.life+' · Poison '+p.health.poison+'/10',()=>showHealth(p)));
  const content=$('focus-content'),scrollTop=content.scrollTop;disposeCarousels(content);releaseCardLayouts(content);content.replaceChildren();
  const stage=el('div','focus-mat-stage');stage.append(matView(p,true));content.append(stage);
  if(p.playerId===viewerSeatId){const hand=el('section','focus-hand');hand.id='focus-hand';const heading=el('div','hand-label');heading.append(el('strong','','Your hand'),el('span','',p.zones.Hand.count+' cards'));hand.append(heading,handCarousel(p.zones.Hand.cards,'focus-hand-cards'));content.append(hand);}
  else content.append(el('p','fine','Opponent hand: '+p.zones.Hand.count+' cards · hidden'));
  if(!dialog.open)dialog.showModal();content.scrollTop=scrollTop;syncModalViewport();mountControls();
}
function seatMat(id){const appearance=live?.appearance?.find(s=>s.seatId===id),preference=readMatPreferences()[id];const requested=appearance?.playmat&&(!preference||preference===appearance.playmatChoice)?appearance.playmat:preference||defaultPlaymat(id);return resolvePlaymat(requested,live?.matchId||data.pod.podHash||'preview',id);}
window.addEventListener('crankmagic-playmat',()=>{if(live||data.frames.length){render();if($('focus').open)focusBoard(frame().players.find(p=>p.playerId===Number($('focus').dataset.seat)));}});
window.addEventListener('storage',event=>{if(event.key==='crankmagic-playmats-v1')window.dispatchEvent(new Event('crankmagic-playmat'));});
function matView(p,focused=false){
  const mat=el('div',`player-mat${p.playerId===viewerSeatId?' personal-mat':' plain-mat'}`);
  mat.dataset.seat=p.playerId;
  paintMat(mat,seatMat(p.playerId));mat.addEventListener('click',event=>{if(!focused&&!event.target.closest('button')&&!draggingCard&&Date.now()>=suppressClickUntil)setPrimarySeat(p.playerId);});
  mat.setAttribute('aria-label',`${names[p.playerId]} playmat`);
  if(live&&p.playerId===viewerSeatId){
    mat.dataset.humanDrop='true';
    mat.addEventListener('dragover',event=>{if(draggingCard!==null){event.preventDefault();event.dataTransfer.dropEffect='move';mat.classList.add('drop-ready');}});
    mat.addEventListener('dragleave',event=>{if(!mat.contains(event.relatedTarget))mat.classList.remove('drop-ready');});
    mat.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();mat.classList.remove('drop-ready');const raw=event.dataTransfer.getData('application/x-crankmagic-card');const id=/^\d+$/.test(raw)?Number(raw):draggingCard;const card=humanPlayer()?.zones.Hand.cards.find(c=>c.cardId===id);if(card)playCard(card);});
  }
  const lands=p.zones.Battlefield.cards.filter(c=>c.typeLine?.split('—')[0].includes('Land'));
  const nonlands=p.zones.Battlefield.cards.filter(c=>!lands.includes(c));
  for(const [name,cls,cards] of [['Battlefield','mat-battlefield',nonlands],['Lands','mat-lands',lands]]) {
    const zone=el('section',`mat-zone ${cls}`);zone.setAttribute('aria-label',`${names[p.playerId]} ${name}`);
    const list=el('div','cards mat-cards');
    const grouped=new Map(),capacity=name==='Lands'?6:3,crowded=cards.filter(c=>!freePositions.has(c.cardId)).length>capacity;
    for(const card of cards.filter(c=>!freePositions.has(c.cardId))){const mana=/^[^\n:]*:\s*Add\b/im.test(card.oracleText||''),types=card.typeLine||'';const label=card.token?'Tokens':types.includes('Land')?'Lands':mana&&types.includes('Creature')?'Mana dorks':mana&&types.includes('Artifact')?'Mana rocks':types.includes('Creature')?'Creatures':types.includes('Artifact')?'Artifacts':types.includes('Enchantment')?'Enchantments':'Other';const key=visualGroups.get(card.cardId)||label;if(!grouped.has(key))grouped.set(key,{manual:key.startsWith('group:'),label:key.startsWith('group:')?'Your group':label,cards:[]});grouped.get(key).cards.push(card);}
    const large=focused||p.playerId===primarySeat;
    const drawGroups=groups=>{list.replaceChildren();for(const group of groups){const stacked=group.stacked,stack=el('div','battlefield-group'+(stacked?'':' expanded-group'));const label=el('small','group-label',group.label);if(group.showLabel===false)label.style.visibility='hidden';stack.append(label);const fan=el('div','card-fan'+(stacked?'':' spread-cards'));for(const card of group.cards)fan.append(cardButton(card));stack.append(fan);list.append(stack);}if(!cards.length)list.append(el('span','mat-empty',p.health?.status==='out'?'Eliminated':'Empty'));};
    if(large){list.classList.add('zoom-card-grid');let layoutKey='';const layout=()=>{if(!zone.isConnected||draggingCard!==null)return;const m=cardGridMetrics({width:list.clientWidth,height:list.clientHeight,matWidth:mat.clientWidth,zoom:cardZoom,lands:name==='Lands'});list.style.setProperty('--grid-card-width',m.cardWidth+'px');list.style.setProperty('--card-columns',m.columns);list.dataset.columns=m.columns;list.dataset.rows=m.rows;mat.style.setProperty('--free-card-width',cardGridMetrics({width:mat.clientWidth*.64,height:mat.clientHeight*.5,matWidth:mat.clientWidth,zoom:cardZoom}).cardWidth+'px');const key=m.capacity+':'+cardZoom;if(key!==layoutKey){layoutKey=key;drawGroups(arrangeCardGroups([...grouped.values()],m.capacity));}};zoneLayouts.set(zone,layout);cardLayoutObserver.observe(zone);}
    else drawGroups([...grouped.values()].map(group=>({...group,stacked:crowded||group.manual})));
    zone.append(list,el('span','mat-zone-label',`${name} · ${cards.length}`));mat.append(zone);
  }
  for(const card of p.zones.Battlefield.cards.filter(c=>freePositions.has(c.cardId))){const position=freePositions.get(card.cardId),piece=el('div','free-card');piece.style.left=position.x*100+'%';piece.style.top=position.y*100+'%';piece.append(cardButton(card));mat.append(piece);}
  const guide=el('div','mat-turn-guide');guide.setAttribute('aria-label','Turn sequence reminder');
  const phaseGroups=[['UNTAP'],['UPKEEP'],['DRAW'],['MAIN1'],['COMBAT_BEGIN','COMBAT_DECLARE_ATTACKERS','COMBAT_DECLARE_BLOCKERS','COMBAT_FIRST_STRIKE_DAMAGE','COMBAT_DAMAGE','COMBAT_END'],['MAIN2'],['END_OF_TURN','CLEANUP']];
  ['1. Untap','2. Upkeep','3. Draw','4. Main phase 1','5. Combat','6. Main phase 2','7. End / cleanup'].forEach((phase,i)=>{const current=turnPlayer()?.playerId===p.playerId&&phaseGroups[i].includes(frame().phase),step=el('span',current?'current-phase':'',phase);if(current)step.setAttribute('aria-current','step');guide.append(step);});
  mat.append(guide);
  const life=button('',()=>showHealth(p),'mat-life');life.setAttribute('aria-label',`${names[p.playerId]} life ${p.health.life}; inspect counters`);
  life.append(el('small','','Life'),el('strong','',p.health.life));mat.append(life);
  for(const [zone,label,cls] of pileZones)mat.append(pileButton(p,zone,label,`mat-pile ${cls}`));
  if((p.playerId===primarySeat||focused)&&(pendingCasts.size||frame().stack?.length))mat.append(castingPreview());
  return mat;
}
function attachBoardResize(box){
  if(boardWidth)box.style.maxWidth=boardWidth+'px';else box.style.removeProperty('max-width');
  const handle=el('button','board-resize','⤡');handle.type='button';handle.setAttribute('aria-label','Resize your board');handle.title='Drag to resize your board. Arrow keys adjust size; double-click resets.';
  function save(width){const table=box.closest('.table'),columns=getComputedStyle(table).gridTemplateColumns.split(' ').map(parseFloat),limit=columns.at(-1)||table.clientWidth;boardWidth=Math.round(Math.max(Math.min(320,limit),Math.min(limit,width)));box.style.maxWidth=boardWidth+'px';try{localStorage.setItem('crankmagic-board-width',boardWidth);}catch{}handle.setAttribute('aria-valuetext',boardWidth+' pixels wide');}
  handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();resizingBoard=true;const x=event.clientX,y=event.clientY,w=box.clientWidth,ratio=box.querySelector('.player-mat').clientWidth/box.querySelector('.player-mat').clientHeight;handle.setPointerCapture(event.pointerId);
    const move=e=>{const dx=e.clientX-x,dy=(e.clientY-y)*ratio;save(w+(Math.abs(dx)>Math.abs(dy)?dx:dy));};
    const done=()=>{resizingBoard=false;handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',done);handle.removeEventListener('pointercancel',done);refreshBoards();};
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',done,{once:true});handle.addEventListener('pointercancel',done,{once:true});
  });
  handle.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(event.key)){event.preventDefault();save(box.clientWidth+(['ArrowLeft','ArrowDown'].includes(event.key)?-30:30));}});
  handle.addEventListener('dblclick',()=>{boardWidth=null;try{localStorage.removeItem('crankmagic-board-width');}catch{}box.style.removeProperty('max-width');});box.append(handle);
}
function renderSeat(p){
  const box=$(`seat-${p.playerId}`);releaseCardLayouts(box);box.replaceChildren();const active=turnPlayer()?.playerId===p.playerId;box.classList.toggle('active-turn',active);if(active)box.setAttribute('aria-label',names[p.playerId]+' · active turn');else box.removeAttribute('aria-label');
  const kind=live?.seats?.find(s=>s.seatId===p.playerId)?.kind;const head=el('div','seat-heading');const title=el('div');title.append(el('div','seat-label',live?(p.playerId===viewerSeatId?'YOU · HUMAN':kind==='human'?'HUMAN OPPONENT':'AI · PILOT'):(p.playerId===viewerSeatId?'YOUR DECK · RECORDED NATIVE PILOT':'AI OPPONENT · NATIVE PROBE')),el('div','seat-title',names[p.playerId]));
  if(active)title.append(el('span','turn-badge','● TURN'));const health=button('',()=>showHealth(p),'seat-health');health.append(el('strong','',p.health.life),el('small','',`☣ ${p.health.poison}/10 · CMD ${p.health.commanderDamageMax}/21${p.health.status==='out'?' · OUT':''}`));health.setAttribute('aria-label',`${names[p.playerId]} life ${p.health.life}, poison ${p.health.poison}, commander damage ${p.health.commanderDamageMax}`);head.append(title,health,el('span','seat-hand-count',`Hand ${p.zones.Hand.count}`),button('Focus board',()=>focusBoard(p)));box.append(head,matView(p));if(p.playerId===primarySeat)attachBoardResize(box);
  const identity=p.commanderIdentity||(p.playerId===viewerSeatId?data.pod.seats[0]?.deck.commanders.flatMap(c=>c.colorIdentity||[]):p.zones.Command.cards.flatMap(c=>c.colorIdentity||[]))||[];
  if(!manaStatus)return;
  const status=manaStatus(p,frame().players,identity),mana=el('div','mana-status');mana.setAttribute('aria-label',names[p.playerId]+' mana sources');
  for(const color of manaColors){const n=status.counts[color],gem=el('span','mana-source mana-'+color);gem.append(el('b','',color),el('span','',`${n.untapped} / ${n.tapped}`),el('small','',`Pool ${n.floating}`));gem.title=`${color}: ${n.untapped} untapped sources, ${n.tapped} tapped sources; ${n.floating} floating mana. Source count is not mana quantity or guaranteed availability.`;mana.append(gem);}
  mana.append(el('small','mana-legend','Untapped / tapped sources · Pool = floating mana'+(status.shared?' · Multicolor sources appear under each color.':'')));box.append(mana);
}
function showHealth(p){
  const h=p.health,body=el('div'),metrics=el('div','metrics');
  for(const [value,label] of [[h.life,'Life'],[`${h.poison} / 10`,'Poison'],[`${h.commanderDamageMax} / 21`,'Most from one commander']]){const m=el('div','metric');m.append(el('strong','',value),el('small','',label));metrics.append(m);}body.append(metrics);
  body.append(el('p','fine',h.status==='out'?`Out · ${h.lossReason}`:'The engine checks loss conditions and applies card exceptions before eliminating a player.'));
  const t=el('table','damage-table'),thead=el('thead'),tr=el('tr');for(const s of ['Commander','Owner','Damage received','Remaining'])tr.append(el('th','',s));thead.append(tr);t.append(thead);const tb=el('tbody');
  for(const row of h.commanderDamage){const r=el('tr');for(const value of [row.name,names[row.ownerSeatId],row.damage,row.remaining])r.append(el('td','',value));tb.append(r);}t.append(tb);body.append(t);
  body.append(el('p','fine',`Combined commander damage: ${h.commanderDamageTotal}. Standard Commander tracks each commander separately. Life gain does not erase this damage history.`));
  showDialog(`${names[p.playerId]} · life and counters`,body);
}
function logText(e){const f=e.fields;switch(e.kind){case'GameEventSpellAbilityCast':return f.sa?.description||f.sa?.host?.name||'Spell or ability put on stack';case'GameEventSpellResolved':return `${f.spell?.host?.name||'Ability'} resolved${f.hasFizzled?' without effect':''}.`;case'GameEventPlayerDamaged':return `${f.source?.name} dealt ${f.amount} ${f.combat?'combat ':''}${f.infect?'infect ':''}damage to ${f.target?.name}.`;case'GameEventPlayerPoisoned':return `${f.receiver?.name||f.player?.name||'Player'} received poison.`;case'GameEventLandPlayed':return `${f.player?.name} played ${f.land?.name}.`;default:return e.kind;}}
let trackerTab='info',trackerPlayer=0,trackerFacts=null,trackerKey='';
const sidebar=document.querySelector('aside'),tabs=el('div','inspector-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Card information and deck tracker');
const infoTab=button('Card',()=>selectPane('info')),statsTab=button('Tracker',()=>selectPane('tracker')),historyTab=button('History',()=>selectPane('history'));
for(const [b,id]of [[infoTab,'info'],[statsTab,'tracker'],[historyTab,'history']]){b.setAttribute('role','tab');b.id='tab-'+id;b.setAttribute('aria-controls',id==='info'?'inspector':id==='history'?'events':'tracker-pane');}
const combatPane=el('section','combat-pane');combatPane.id='combat-pane';combatPane.hidden=true;combatPane.setAttribute('role','tabpanel');combatPane.setAttribute('aria-labelledby','tab-combat');const combatTab=button('Combat',()=>selectPane('combat'));combatTab.id='tab-combat';combatTab.setAttribute('role','tab');combatTab.setAttribute('aria-controls','combat-pane');
const tracker=el('section','tracker-pane');tracker.id='tracker-pane';tracker.setAttribute('role','tabpanel');tracker.setAttribute('aria-labelledby','tab-tracker');
$('inspector').setAttribute('role','tabpanel');$('inspector').setAttribute('aria-labelledby','tab-info');$('events').setAttribute('role','tabpanel');$('events').setAttribute('aria-labelledby','tab-history');tabs.append(infoTab,statsTab,historyTab,combatTab);sidebar.prepend(tabs);sidebar.append(tracker,combatPane);
function selectPane(value){if(value==='combat'&&hideInformation){hideInformation=false;document.body.classList.remove('hide-information');hideInfo.textContent='Hide information pane';mountControls();refreshBoards();}trackerTab=value;combatPane.hidden=value!=='combat';combatTab.setAttribute('aria-selected',String(value==='combat'));if(value==='combat')renderCombat(true);for(const [b,id]of [[infoTab,'info'],[statsTab,'tracker'],[historyTab,'history']])b.setAttribute('aria-selected',String(value===id));for(const n of sidebar.querySelectorAll('.aside-title,#inspector'))n.hidden=value!=='info';for(const n of sidebar.querySelectorAll('.log-header,#events'))n.hidden=value!=='history';tracker.hidden=value!=='tracker';if(value==='tracker')renderTracker(true);if(value==='history')renderHistory();}
function historyRows(){if(!frame())return [];return live?(live.telemetry?.recent||[]):data.log.filter(e=>e.sequence<=frame().sequence).slice(-80).reverse().map(e=>({id:e.eventId,turn:e.turn,label:logText(e),name:''}));}
let historyQuery='',historyLimit=80,historyPhases=false;
function historyContent(){const body=el('div','history-feed'),rows=historyRows();body.append(el('p','fine','Recorded public activity · newest first. Private draws and choices are hidden.'));
  const search=el('input');search.type='search';search.placeholder='Find a card or event…';search.setAttribute('aria-label','Search game history');search.value=historyQuery;const phaseLabel=el('label','fine'),phaseToggle=el('input');phaseToggle.type='checkbox';phaseToggle.checked=historyPhases;phaseLabel.append(phaseToggle,document.createTextNode(' Include phase changes'));const list=el('div'),more=button('Show more events',()=>{historyLimit+=80;draw();});
  function draw(){list.replaceChildren();const visible=rows.filter(e=>(historyPhases||!/^(untap|upkeep|draw|main1|main2|combat .+|end of turn|cleanup)$/.test(e.label))&&(!historyQuery||[e.label,e.name,names[e.playerId]].join(' ').toLowerCase().includes(historyQuery.toLowerCase())));for(const e of visible.slice(0,historyLimit)){const row=el('div','history-row');row.append(el('small','',`TURN ${e.turn??'?'}${e.playerId!=null?' · '+names[e.playerId]:''}`),el('strong','',/^(main1|main2)$/i.test(e.label)?phaseName(e.label):e.label),el('span','',e.name||''));list.append(row);}if(!visible.length)list.append(el('p','empty',rows.length?'No matching events.':'Public activity will appear here as the game progresses.'));more.hidden=visible.length<=historyLimit;}
  search.addEventListener('input',()=>{historyQuery=search.value;draw();});phaseToggle.addEventListener('change',()=>{historyPhases=phaseToggle.checked;draw();});body.append(search,phaseLabel,list,more);draw();return body;}
let historyKey='';
function renderHistory(){if(document.activeElement?.matches('input[aria-label="Search game history"]'))return;const rows=historyRows(),key=JSON.stringify(rows);if(key===historyKey)return;historyKey=key;$('event-count').textContent=rows.length+' events';$('events').replaceChildren(historyContent());if($('detail').open&&$('detail').dataset.history==='true')$('detail-body').replaceChildren(historyContent());}
function openHistory(){showDialog('Game history',historyContent());$('detail').dataset.history='true';}
const historyShortcut=button('History',openHistory);document.querySelector('header').append(historyShortcut);$('close-focus').before(button('History',openHistory));
$('detail').addEventListener('close',()=>delete $('detail').dataset.history);
function renderTracker(force=false){
  if(!frame())return;const t=live?.telemetry,key=JSON.stringify([trackerPlayer,t,frame().players]);if(!force&&key===trackerKey)return;trackerKey=key;tracker.replaceChildren();
  if(!trackerFacts){trackerFacts=new Map();fetch('/app/data/cards.json').then(r=>r.json()).then(d=>{for(const c of d.cards)trackerFacts.set(c.name,c);renderTracker(true);}).catch(()=>{});}
  const chooser=el('select');chooser.setAttribute('aria-label','Track player');for(const p of frame().players){const o=el('option','',names[p.playerId]);o.value=p.playerId;chooser.append(o);}chooser.value=trackerPlayer;chooser.addEventListener('change',()=>{trackerPlayer=Number(chooser.value);renderTracker(true);});tracker.append(chooser);
  const p=frame().players.find(p=>p.playerId===trackerPlayer)||humanPlayer(),rows=(t?.cards||[]).filter(c=>c.controller===p.playerId),sum=k=>rows.reduce((n,c)=>n+(c[k]||0),0);
  if(manaStatus){
    const identity=p.commanderIdentity||(p.playerId===viewerSeatId?data.pod.seats[0]?.deck.commanders.flatMap(c=>c.colorIdentity||[]):p.zones.Command.cards.flatMap(c=>c.colorIdentity||[]))||[],mana=manaStatus(p,frame().players,identity),section=el('section');section.append(el('h3','','Mana by color'));const table=el('table','mana-breakdown'),head=el('tr');for(const label of ['Color','Untapped','Tapped','Pool'])head.append(el('th','',label));table.append(head);for(const color of manaColors){const row=el('tr'),n=mana.counts[color];for(const value of [color,n.untapped,n.tapped,n.floating])row.append(el('td','',value));table.append(row);}section.append(table,el('p','fine','Source counts include lands, mana dorks and rocks. Multicolor sources appear in each color; counts cannot be added together. Restrictions, summoning sickness and mana quantity are checked by the engine when paying.'));
    const sources=el('details');sources.append(el('summary','','Mana sources on this board'));for(const card of p.zones.Battlefield.cards){const fact={...card,oracleText:card.oracleText||trackerFacts.get(card.name)?.oracleText||''};if(!sourceColors(fact,identity,manaColors.slice(0,5)).length)continue;const kind=card.typeLine?.includes('Land')?'Land':card.typeLine?.includes('Creature')?'Mana dork':'Mana rock / permanent';sources.append(el('p','fine',`${card.name} · ${kind} · ${card.tapped?'tapped':'untapped'}`));}section.append(sources);tracker.append(section);
  }
  const metrics=el('div','tracker-metrics');
  for(const [label,value]of [['Life',p.health.life],['Poison',p.health.poison],['Hand',p.zones.Hand.count],['Lands played',t?sum('lands'):'—'],['Tap events',t?sum('taps'):'—'],['Counters added',t?sum('countersAdded'):'—'],['Spells cast',t?.classified?sum('spells'):'—'],['Activated on stack',t?.classified?sum('abilities'):'—'],['Triggers stacked',t?.classified?sum('triggers'):'—'],['Proliferate selections',t?.proliferateInstrumented&&p.playerId===viewerSeatId?t.counts.proliferateChoices:'—']]){const box=el('div');box.append(el('strong','',value),el('small','',label));metrics.append(box);}tracker.append(metrics);
  tracker.append(el('p','fine',t?'Recorded events for visible sources, including actions later undone. Tap events include mana, attacks and costs. Ability counts cover stack entries; mana activations can bypass the stack. Proliferate selections count choices, not counters added. A dash means instrumentation is unavailable.':'The event tracker is waiting for the updated local host. Current board rules are available below.'));
  const rules=el('section');rules.append(el('h3','','Rules currently on this board'));
  for(const c of p.zones.Battlefield.cards){const fact=trackerFacts.get(c.name)||data.pod.seats[0]?.mechanics?.cards?.find(f=>f.name===c.name),row=el('details','board-rule');row.append(el('summary','',c.name+(c.tapped?' · tapped':'')));
    row.append(el('p','',fact?.oracleText||'Rules text is not cached for this object.'),button('Inspect',()=>inspect(c)));rules.append(row);}
  if(!p.zones.Battlefield.cards.length)rules.append(el('p','fine','No permanents yet. Trigger conditions, static rules and activated abilities appear here as cards enter.'));tracker.append(rules);
  const activity=el('section');activity.append(el('h3','','Card activity'));for(const c of rows.sort((a,b)=>b.stackEntries-a.stackEntries).slice(0,15))activity.append(el('p','tracker-card-row',c.name+' · '+c.stackEntries+' stack entries · '+c.taps+' taps · '+c.countersAdded+' counters added'));if(!rows.length)activity.append(el('p','fine','No recorded activity for visible cards in this seat yet.'));tracker.append(activity);
  const log=el('details','tracker-log');log.append(el('summary','','Recent events'));for(const event of (t?.recent||[]).filter(e=>e.playerId===p.playerId).slice(0,20))log.append(el('p','fine','Turn '+(event.turn??'?')+' · '+event.name+' · '+event.label));tracker.append(log);
  if(p.playerId===viewerSeatId){const review=el('section');review.append(el('h3','','Deck review notes'),el('p','fine','Watch for cards held without a use, colors you could not produce, triggers you could not exploit, and opposing effects that disrupted your plan. Counts alone are not a reason to cut a card.'));
    const notes=el('textarea');notes.setAttribute('aria-label','Deck review notes');notes.placeholder='Cards to reconsider, missed synergies, interaction to add…';const key='crankmagic-review-'+(live?.matchId||'replay');try{notes.value=localStorage.getItem(key)||'';}catch{}notes.addEventListener('input',()=>{try{localStorage.setItem(key,notes.value);}catch{}});review.append(notes,button('Export tracker report',()=>{const report={schema:'CrankMagicTracker@1',matchId:live?.matchId,turn:frame().turn,deck:data.pod.seats[0]?.deck.name,telemetry:t||null,notes:notes.value,limitations:['Only observed visible sources are summarized.','Missing instrumentation is unknown, not zero.','Causal loop detection and exact mana-efficiency attribution are not implemented.']};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='crankmagic-tracker.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));tracker.append(review);}
}
const guidance=el('details','recommended-actions');guidance.hidden=true;const guidanceTitle=el('summary','','Recommended actions'),guidanceBody=el('div','recommendation-list');guidance.append(guidanceTitle,guidanceBody);document.querySelector('.replaybar').after(guidance);
let guidanceKey='',combatKey='';
function renderGuidance(){
  const rows=live?recommendedActions(frame(),live.ui,historyRows(),viewerSeatId):[];guidance.hidden=!rows.length;const key=JSON.stringify(rows);if(key===guidanceKey)return;guidanceKey=key;guidanceTitle.textContent='Recommended actions · '+phaseName(frame().phase);guidanceBody.replaceChildren();
  for(const row of rows){const item=el('article');item.append(el('strong','',row.title),el('p','fine',row.reason));if(row.cardId!=null){const card=Object.values(humanPlayer().zones).flatMap(z=>z.cards).find(c=>c.cardId===row.cardId);if(card)item.append(button('Review card',e=>cardActions(card,e.currentTarget)));}guidanceBody.append(item);}
  guidanceBody.append(el('small','coaching-note','Local coaching · suggestions, not a guaranteed best line. Costs and targets are validated when you act.'));
}
function renderCombat(force=false){
  if(!live||decisionPointer||(!force&&trackerTab!=='combat'))return;
  const current=frame().combat,previous=live.telemetry?.combats?.at(-1),combat=/COMBAT/.test(frame().phase)?(current||{turn:frame().turn,attacks:[]}):previous,rows=historyRows().filter(e=>e.turn===(combat?.turn??frame().turn)&&(/COMBAT/.test(e.phase||'')||/combat damage|infect damage/.test(e.label)));
  const key=JSON.stringify([combat,rows,live.ui.cardActions,live.ui.highlightedCards,live.ui.prompt]);if(!force&&key===combatKey)return;combatKey=key;combatPane.replaceChildren();
  combatPane.append(el('h3','',`${/COMBAT/.test(frame().phase)?"Combat":"Last combat"} · turn ${combat?.turn??frame().turn}`));
  const picking=attackSelection()||blockSelection();
  if(picking){combatPane.append(el('p','fine',attackSelection()?'Choose the defender above, then toggle your creatures here. Selecting a different defender affects the next creature you select.':'Select the attacker you want to block, then select your blockers. Only blockers currently allowed by the engine are offered. Flying requires flying or reach; trample may carry excess damage through. Review each pairing before Confirm blockers.'));
    const candidates=frame().players.flatMap(p=>p.zones.Battlefield.cards).filter(c=>canSelectCard(c));
    const attackers=new Set(current?.attacks.map(a=>a.attacker.cardId)||[]);if(blockSelection())candidates.sort((a,b)=>Number(attackers.has(b.cardId))-Number(attackers.has(a.cardId)));
    if(blockSelection()&&!candidates.some(c=>!attackers.has(c.cardId)))combatPane.append(el('p','combat-total','No legal blockers for the selected attacker. Choose another attacker or confirm your blocks.'));
    const choices=el('div','combat-candidates');for(const c of candidates){const b=button('',()=>gameAction({kind:'card',targetId:c.cardId}),'combat-card-choice');b.dataset.cardId=c.cardId;if(c.art){const img=el('img');img.src=c.art;img.alt=c.name;b.append(img);}b.append(el('span','',c.name),el('small','',live.ui.cardActions?.[c.cardId]||'Select creature'));const isAttacker=!!current?.attacks.some(a=>a.attacker.cardId===c.cardId);const selected=blockSelection()&&isAttacker?live.ui.highlightedCards?.includes(c.cardId):!!current?.attacks.some(a=>a.attacker.cardId===c.cardId||a.blockers.some(b=>b.cardId===c.cardId));if(blockSelection()&&isAttacker)b.append(el('small','',selected?'SELECTED ATTACKER · choose blockers below':'Choose blockers for this attacker'));b.classList.toggle('combat-assigned',selected);b.setAttribute('aria-pressed',String(selected));choices.append(b);}combatPane.append(choices);}
  if(!combat?.attacks?.length)combatPane.append(el('p','fine','No attackers assigned yet. Your confirmed attack and block assignments will appear here.'));
  for(const total of combatTotals(combat?.attacks))combatPane.append(el('div','combat-total',`${total.name} ← ${total.power} attacking power · ${total.unblockedPower} currently unblocked · ${total.flyingPower} flying / ${total.groundPower} ground${total.tramplePower?' · '+total.tramplePower+' trample power':''}${total.commanderPower?' · '+total.commanderPower+' commander power':''}${total.infectPower?' · '+total.infectPower+' infect power':''}`));
  if(combat?.attacks?.length)combatPane.append(el('p','fine','Power totals are not final damage: blockers, first/double strike, prevention, trample and responses can change the result. Trample, infect and commander power can overlap flying or ground power.'));
  for(const row of combat?.attacks||[]){const item=el('article','combat-assignment');item.append(el('strong','',`${row.attacker.name} ${row.attacker.power}/${row.attacker.toughness} → ${row.defender?.name||'Defender'}`),el('p','fine',[...(row.attacker.keywords||[]),...(row.attacker.commander?['commander']:[])].join(' · ')||'Normal combat damage'),el('p','',row.blockers.length?'Blocked by '+row.blockers.map(b=>`${b.name} ${b.power}/${b.toughness}${b.keywords?.length?' ('+b.keywords.join(', ')+')':''}`).join(' + '):row.blocked?'Blocked; blocker has left combat':'No blocker assigned'));combatPane.append(item);}
  combatPane.append(el('h4','','Responses & results'));
  if(!rows.length)combatPane.append(el('p','fine','No recorded combat results yet. Damage, spells, abilities and departing creatures will be listed here as they happen.'));
  for(const row of rows.filter(e=>!/^(combat |tapped|untapped)/i.test(e.label)||/damage/.test(e.label)).slice(0,40)){const item=el('div','history-row');item.append(el('strong','',row.label),el('span','',row.name));combatPane.append(item);}
  combatPane.append(button('Full game history',()=>selectPane('history')));
}
selectPane('history');
function render(){
  document.querySelector('.focus-eyebrow').textContent=live?'FOCUSED BOARD · LIVE GAME':'FOCUSED BOARD · REPLAY';
  const f=frame();$('phase').textContent=turnLabel();$('position').textContent=live?'Live game':`Recorded phase ${index+1} / ${data.frames.length}`;$('timeline').value=index;
  $('prev').disabled=index===0;$('next').disabled=index===data.frames.length-1;
  follow.textContent='Follow active player: '+(followActive?'on':'off');
  const activeSeat=live?.seats?.find(seat=>seat.seatId===turnPlayer()?.playerId);promptAi.hidden=!live||guestMode||activeSeat?.kind!=='ai';promptAi.disabled=aiPrompting;promptAi.textContent=aiPrompting?'Prompting AI…':activeSeat?'Prompt '+(activeSeat.name||'AI'):'Prompt AI';
  if(followActive&&followedTurn!==f.turn&&turnPlayer()){primarySeat=turnPlayer().playerId;followedTurn=f.turn;}
  for(const p of f.players){const seat=$('seat-'+p.playerId);seat.classList.toggle('primary-seat',p.playerId===primarySeat);if(p.playerId===primarySeat)opponents.after(seat);else opponents.append(seat);renderSeat(p);}
  for(const p of f.players.filter(p=>p.playerId!==primarySeat)){const seat=$('seat-'+p.playerId);seat.querySelector('.seat-heading').append(button('Show board',()=>setPrimarySeat(p.playerId)));}
  const you=f.players.find(p=>p.playerId===viewerSeatId);disposeCarousels($('hand-host'));$('hand-host').replaceChildren(handCarousel(you.zones.Hand.cards,'hand'));$('hand-count').textContent=`${you.zones.Hand.count} cards`;
  renderHistory();
}
const follow=button('Follow active player: off',()=>{followActive=!followActive;followedTurn=null;follow.textContent='Follow active player: '+(followActive?'on':'off');refreshBoards();});
function setPrimarySeat(playerId){const f=frame();if(!f?.players.some(player=>player.playerId===playerId))return;primarySeat=playerId;followActive=false;followedTurn=null;follow.textContent='Follow active player: off';refreshBoards();}
const myBoard=button('My board',()=>setPrimarySeat(viewerSeatId));myBoard.title='Show your playmat in the main board area';
const holdResponses=button('Hold priority',()=>{const turn=frame()?.turn;if(turn==null||turnPlayer()?.playerId===viewerSeatId){notifyAction('Priority is already yours. Use a card or board ability when you are ready.');return;}holdResponsesTurn=holdResponsesTurn===turn?null:turn;holdResponses.textContent=holdResponsesTurn===turn?'Resume auto-pass':'Hold priority';holdResponses.title=holdResponsesTurn===turn?'Priority will stop for your instant-speed actions this turn.':'Keep priority stops available during the active opponent’s turn.';lastDecision='';renderDecision();});holdResponses.title='Keep priority stops available during the active opponent’s turn.';
$('view-deck').before(follow,myBoard,holdResponses);
const promptAi=button('Prompt AI',async()=>{const active=live?.seats?.find(seat=>seat.seatId===turnPlayer()?.playerId);if(!active||active.kind!=='ai'){notifyAction('No AI player currently has a decision to make.');return;}if(aiPrompting)return;aiPrompting=true;render();try{if(!gameToken)gameToken=(await fetch('/api/setup').then(r=>r.json())).token;const response=await fetch('/api/ai-pilots/prompt',{method:'POST',headers:{'Content-Type':'application/json','X-Commander-Token':gameToken},body:JSON.stringify({seatId:active.seatId})}),result=await response.json();if(!response.ok)throw Error(result.error||'Unable to prompt the AI');notifyAction(result.waitingForForge?(active.name||'AI')+' is waiting for Forge to confirm its last action.':(active.name||'AI')+' is re-evaluating its next move.');setTimeout(()=>refreshLiveView().catch(error=>notifyAction(error.message)),150);}catch(error){notifyAction(error.message);}finally{aiPrompting=false;render();}});promptAi.title='Ask the active AI to immediately re-evaluate its next legal Forge decision.';
$('view-deck').before(promptAi);
const viewOptions=el('div','view-options');viewOptions.setAttribute('popover','auto');viewOptions.id='table-view-options';viewOptions.append(follow);
const zoomControl=el('label','card-zoom-control','Card size '),zoomSlider=el('input'),zoomOutput=el('output','',cardZoom+'%');zoomSlider.type='range';zoomSlider.min='32';zoomSlider.max='140';zoomSlider.step='1';zoomSlider.value=cardZoom;zoomSlider.setAttribute('aria-label','Board card size');zoomControl.append(zoomSlider,zoomOutput);const setCardZoom=value=>{cardZoom=Math.max(32,Math.min(140,Number(value)));zoomSlider.value=cardZoom;zoomOutput.textContent=cardZoom===32?'Compact · 6 × 3':cardZoom+'%';try{localStorage.setItem('crankmagic-card-zoom',cardZoom);}catch{}for(const layout of zoneLayouts.values())layout();};zoomSlider.addEventListener('input',()=>setCardZoom(zoomSlider.value));viewOptions.append(zoomControl,button('Compact cards · 6 × 3',()=>setCardZoom(32)),button('Reset card size',()=>setCardZoom(100)));
const hideOthers=button('Hide other boards',()=>{hideOpponents=!hideOpponents;document.body.classList.toggle('hide-opponents',hideOpponents);hideOthers.textContent=hideOpponents?'Show other boards':'Hide other boards';refreshBoards();});
const hideInfo=button('Hide information pane',()=>{hideInformation=!hideInformation;document.body.classList.toggle('hide-information',hideInformation);hideInfo.textContent=hideInformation?'Show information pane':'Hide information pane';mountControls();refreshBoards();});viewOptions.append(hideOthers,hideInfo);document.body.append(viewOptions);const viewButton=button('View options',()=>viewOptions.togglePopover());$('view-deck').before(viewButton);
$('timeline').max=data.frames.length-1;$('timeline').addEventListener('input',e=>{index=+e.target.value;render();});$('prev').addEventListener('click',()=>{index=Math.max(0,index-1);render();});$('next').addEventListener('click',()=>{index=Math.min(data.frames.length-1,index+1);render();});
$('close-detail').addEventListener('click',()=>$('detail').close());$('clear-inspect').addEventListener('click',()=>$('inspector').replaceChildren(el('p','empty','Select any visible card to inspect it.')));
$('card-detail').addEventListener('click',()=>$('card-detail').close());
$('close-focus').addEventListener('click',()=>$('focus').close());
$('focus').addEventListener('close',mountControls);
for(const id of ['focus','detail','card-detail'])$(id).addEventListener('close',syncModalViewport);
$('focus-size').addEventListener('input',e=>{$('focus').style.setProperty('--focus-zoom',e.target.value+'%');$('focus').style.setProperty('--focus-scale',e.target.value/100);$('focus-size-value').textContent=e.target.value+'%';});
$('view-hand').addEventListener('click',()=>zoneView(frame().players.find(p=>p.playerId===viewerSeatId),'Hand'));
$('view-deck').addEventListener('click',deckView);
$('notice').textContent='Real recorded engine states · Native AI proof · Human play, API pilots and measured reports are still being built.';
$('setup').textContent=guestMode?'Table lobby':'Game setup';
$('setup').addEventListener('click',()=>guestMode?location.assign('/'):openGameSetup().catch(error=>showDialog('Game setup',el('p','fine',error.message))));
if(data.frames.length){render();const c=data.pod.seats[0]?.deck.commanders[0];if(c&&new URLSearchParams(location.search).has('replay'))inspect({name:c.name,art:c.art.normal,typeLine:c.typeLine,cardId:'commander'},1,true);else $('inspector').replaceChildren(el('p','fine','Select any visible card to inspect it.'));}

const liveButton=button('Join live table',startLive,'join-live');document.querySelector('header').append(liveButton);
const controls=el('section','live-controls');controls.hidden=true;controls.setAttribute('aria-label','Your game decision');document.querySelector('.hand').prepend(controls);
const actionDock=el('div','action-dock');sidebar.prepend(actionDock);
const prompt=el('p'),decisionArt=el('div','decision-art'),options=el('div','live-options'),buttons=el('div','live-buttons');controls.append(prompt,decisionArt,options,buttons);
let completionReport=null,completionLoading=false,completionFeedbackSaved=false,completionStatus='';
function mountControls(){const host=$('focus').open&&Number($('focus').dataset.seat)===viewerSeatId?$('focus-hand'):matchMedia('(min-width:1201px)').matches&&!hideInformation?actionDock:document.querySelector('.hand');if(host&&controls.parentElement!==host)host.prepend(controls);}
let decisionPointer=false,lastCombatInput='';for(const area of [controls,combatPane])area.addEventListener('pointerdown',()=>{decisionPointer=true;});window.addEventListener('pointerup',()=>{setTimeout(()=>decisionPointer=false,0);});window.addEventListener('pointercancel',()=>decisionPointer=false);
window.addEventListener('resize',mountControls);
function drawStepCard(){const q=live?.ui.choice;if(q?.mode==='draw')gameAction({kind:'answer',choiceId:q.id,indices:[]});else notifyAction(frame()?.phase==='DRAW'?'This draw step has already been handled by the engine.':'Your library can be drawn from when your draw-step draw is pending.');}
async function gameAction(action,guard){
  if(!live)return false;if(actionBusy){notifyAction("Your previous selection is still being applied. Please try again in a moment.");return false;}actionBusy=true;
  const observedRevision=live.revision;
  try{if(guestMode&&!seatSession?.capability)throw Error('Return to the lobby and redeem your invitation');if(!guestMode&&!gameToken)gameToken=(await fetch('/api/setup').then(r=>r.json())).token;
    const headers=guestMode?{Authorization:'Bearer '+seatSession.capability}:{};
    const freshResponse=await fetch(guestMode?'/match/view':'/api/game-view',{headers}),fresh=await freshResponse.json();if(!freshResponse.ok)throw Error(fresh.error);live=fresh;
    if(guard&&!guard(fresh))return false;
    validateActionRevision(observedRevision,fresh,action.kind,!!guard);
    const response=await fetch(guestMode?'/match/action':'/api/game-action',{method:'POST',headers:{'Content-Type':'application/json',...(guestMode?{Authorization:'Bearer '+seatSession.capability}:{'X-Commander-Token':gameToken})},body:JSON.stringify({...action,...(guestMode?{matchId:fresh.matchId}:{}),revision:fresh.revision,actionId:crypto.randomUUID()})});
    const result=await response.json();if(!response.ok)throw Error(result.error);
    const ackTimestamp=Date.now();
    lastActionSuccess={timestamp:ackTimestamp,action:action.kind};
    setTimeout(()=>{if(lastActionSuccess?.timestamp===ackTimestamp)lastActionSuccess=null;renderDecision();},1500);
    renderDecision();
    return true;
  }catch(error){notifyAction(error.message);return false;}finally{actionBusy=false;if(livePolling)setTimeout(()=>refreshLiveView().catch(error=>notifyAction(error.message)),50);}
}
function downloadMatchReport(){if(!completionReport)return;const url=URL.createObjectURL(new Blob([JSON.stringify(completionReport,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=`crankmagic-match-${completionReport.matchId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function loadCompletionReport(){
  if(completionReport||completionLoading)return;completionLoading=true;
  try{if(!guestMode&&!gameToken)gameToken=(await fetch('/api/setup').then(r=>r.json())).token;const response=await fetch(guestMode?'/match/report':'/api/match-report',{headers:guestMode?{Authorization:'Bearer '+seatSession?.capability}:{}}),value=await response.json();if(!response.ok)throw Error(value.error);completionReport=value;completionStatus='Review the match evidence, then save your feedback.';}
  catch(error){completionStatus='Match report: '+error.message;}finally{completionLoading=false;lastDecision='';renderDecision();}
}
function publishMatchReport(report){
  if(window.parent!==window){window.parent.postMessage({type:'crankmagic-match-report',report},location.origin);return true;}
  try{const channel=JSON.parse(sessionStorage.getItem('crankmagic-return-channel')||'null');if(channel?.schema==='CrankMagicReturnChannel@1'&&window.opener&&!window.opener.closed&&channel.sourceDeckId===report.deck?.source?.deckId){window.opener.postMessage({type:'crankmagic-match-report',nonce:channel.nonce,report},channel.origin);return true;}}catch{}
  return false;
}
async function submitCompletionFeedback(){
  if(!completionReport)return;const rating=Number(options.querySelector('#match-rating')?.value),deckRating=Number(options.querySelector('#match-deck-rating')?.value),notes=options.querySelector('#match-notes')?.value||'';
  try{if(!guestMode&&!gameToken)gameToken=(await fetch('/api/setup').then(r=>r.json())).token;const response=await fetch(guestMode?'/match/feedback':'/api/match-feedback',{method:'POST',headers:{'Content-Type':'application/json',...(guestMode?{Authorization:'Bearer '+seatSession.capability}:{'X-Commander-Token':gameToken})},body:JSON.stringify({matchId:completionReport.matchId,rating,experienceRating:rating,deckRating,notes})}),value=await response.json();if(!response.ok)throw Error(value.error);completionReport={...completionReport,playerFeedback:{rating,deckRating,experienceRating:rating,notes,submittedAt:new Date().toISOString()}};completionFeedbackSaved=true;completionStatus=publishMatchReport(completionReport)?'Feedback saved. Sending this report to the deck that entered the match…':'Feedback saved. Download the report to keep it with this deck.';lastDecision='';renderDecision();}
  catch(error){completionStatus=error.message;lastDecision='';renderDecision();}
}
window.addEventListener('message',event=>{if(event.data?.matchId!==completionReport?.matchId)return;let accepted=event.origin===location.origin&&event.source===window.parent;if(!accepted)try{const channel=JSON.parse(sessionStorage.getItem('crankmagic-return-channel')||'null');accepted=event.origin===channel?.origin&&event.source===window.opener;}catch{}if(!accepted)return;if(event.data.type==='crankmagic-match-report-saved'){completionStatus='Feedback and game report saved to your CrankMagic deck.';completionFeedbackSaved=true;lastDecision='';renderDecision();}if(event.data.type==='crankmagic-match-report-error'){completionStatus='The game report could not be attached: '+event.data.error;lastDecision='';renderDecision();}});
function renderDecision(){
  if(live&&frame().gameOver){
    mountControls();controls.hidden=false;const winners=frame().players.filter(p=>p.health?.status==='won').map(p=>names[p.playerId]);
    const completedKey=JSON.stringify(['complete',live.matchId,winners,!!completionReport,completionFeedbackSaved,completionStatus]);if(lastDecision===completedKey)return;lastDecision=completedKey;
    prompt.textContent=winners.length?'Game complete · '+winners.join(' and ')+' won.':'Game complete · review the final result in History.';
    options.replaceChildren();decisionArt.replaceChildren();buttons.replaceChildren();
    if(!completionReport){options.append(el('p','fine',completionStatus||(completionLoading?'Building the match report…':'Building the match report…')));void loadCompletionReport();return;}
    const summary=completionReport.telemetry?.counts||{};options.append(el('p','fine',`${completionReport.outcome.toUpperCase()} · ${completionReport.turns??'?'} turns · ${summary.spells||0} spells · ${summary.triggers||0} triggers · ${summary.battlefieldDeaths||0} battlefield deaths`));
    if(!completionFeedbackSaved){const experience=el('label','completion-field','Your game experience'),rating=el('select');rating.id='match-rating';for(let n=5;n>=1;n--){const option=el('option','',`${n} · ${n===5?'Excellent':n===4?'Good':n===3?'Mixed':n===2?'Difficult':'Poor'}`);option.value=n;if(n===4)option.selected=true;rating.append(option);}experience.append(rating);const deckLabel=el('label','completion-field','How the deck performed'),deckRating=rating.cloneNode(true);deckRating.id='match-deck-rating';deckLabel.append(deckRating);const notesLabel=el('label','completion-field','What worked, what struggled, and cards to reconsider'),notes=el('textarea');notes.id='match-notes';notes.maxLength=4000;notes.rows=3;notes.placeholder='Key plays, missed interactions, dead cards, threat assessment, and changes to test…';notesLabel.append(notes);options.append(experience,deckLabel,notesLabel);buttons.append(button('Save feedback & attach report',submitCompletionFeedback,'primary-action'));}
    options.append(el('p','fine',completionStatus));buttons.append(button('Download report',downloadMatchReport),button('Review game history',()=>selectPane('history')),button('Play another game',()=>guestMode?location.assign('/'):openGameSetup()));return;
  }
  if(decisionPointer)return;
  mountControls();controls.hidden=false;const ui=live.ui;const combatInput=(attackSelection()?'attack':blockSelection()?'block':'')+frame().turn;if(combatInput!==lastCombatInput){lastCombatInput=combatInput;if((attackSelection()||blockSelection())&&!hideInformation)selectPane('combat');}
  if(ui.ok!=='Auto')approvedPayment=null;
  const paymentId=ui.payment?.abilityId??ui.prompt,paymentApproved=paymentMayAutoResolve(ui,!!pendingPlay,approvedPayment);
  if(paymentApproved&&ui.ok==='Auto'&&/pay mana cost/i.test(ui.prompt)&&ui.choice?.title==='Select Mana to Produce'){
    const q=ui.choice,symbols={WHITE:'W',BLUE:'U',BLACK:'B',RED:'R',GREEN:'G',COLORLESS:'C'},cost=ui.prompt.match(/Pay Mana Cost:\s*([^\n]+)/i)?.[1]||'',counts=manaStatus?.(humanPlayer(),frame().players).counts;
    const optionsByNeed=q.options.filter(o=>symbols[o.label]&&cost.includes('{'+symbols[o.label]+'}')).sort((a,b)=>(counts?.[symbols[a.label]]?.untapped??0)-(counts?.[symbols[b.label]]?.untapped??0));
    const choice=optionsByNeed[0]||q.options.find(o=>o.label==='COLORLESS')||q.options[0];
    if(choice&&!actionBusy){prompt.textContent='Choosing mana for the unpaid cost…';options.replaceChildren();buttons.replaceChildren();closeCardMenu();gameAction({kind:'answer',choiceId:q.id,indices:[choice.index]},fresh=>fresh.ui.choice?.id===q.id);return;}
  }
  if(yieldTurn!==frame().turn)yieldTurn=null;
  if(holdResponsesTurn!==frame().turn)holdResponsesTurn=null;
  holdResponses.textContent=holdResponsesTurn===frame().turn?'Resume auto-pass':'Hold priority';
  holdResponses.title=holdResponsesTurn===frame().turn?'Priority will stop for your instant-speed actions this turn.':'Keep priority stops available during the active opponent’s turn.';
  const safeToContinue=mayAutoPassPriority(live,viewerSeatId,yieldTurn,holdResponsesTurn);
  if(safeToContinue){
    prompt.textContent='Following '+turnPlayer().name+'’s turn…';options.replaceChildren();buttons.replaceChildren();decisionArt.replaceChildren();lastDecision='';
    if(!actionBusy){const turn=frame().turn;gameAction({kind:'ok'},fresh=>fresh.state.turn===turn&&mayAutoPassPriority(fresh,viewerSeatId,yieldTurn,holdResponsesTurn));}
    return;
  }
  // Forge identifies the payment's originating ability. Triggered/other-player costs
  // require a human Pay cost choice; they must not inherit casting automation.
  const paying=paymentApproved&&ui.ok==='Auto'&&!ui.choice&&!ui.nativeFallback&&/pay mana cost/i.test(ui.prompt);
  if(!paying){paymentAttempt=null;paymentNotice='';}
  if(paying&&ui.okEnabled&&paymentAttempt!==ui.prompt&&!actionBusy){
    const payment=ui.prompt;paymentAttempt=payment;
    gameAction({kind:'ok'},fresh=>fresh.ui.ok==='Auto'&&fresh.ui.okEnabled&&!fresh.ui.choice&&!fresh.ui.nativeFallback&&fresh.ui.prompt===payment).then(ok=>{if(!ok)paymentAttempt=null;});
  }
  if(paying&&!ui.okEnabled&&paymentNotice!==ui.prompt){
    const payment=ui.prompt,cost=payment.match(/Pay Mana Cost:\s*([^\n]+)/i)?.[1]||'this cost',card=pendingPlay?.card.name||'This card';
    paymentNotice=payment;const failure=`Cannot cast ${card}: ${cost} is required, and automatic payment cannot find enough currently usable mana. The card returned to your ${pendingPlay?.fromZone?.toLowerCase()||'previous zone'}.`;if(pendingPlay)pendingPlay.failureReason=failure;notifyAction(failure);
    if(ui.cancelEnabled&&!actionBusy){prompt.textContent='Returning the card…';decisionArt.replaceChildren();options.replaceChildren();buttons.replaceChildren();gameAction({kind:'cancel'},fresh=>fresh.ui.ok==='Auto'&&!fresh.ui.okEnabled&&fresh.ui.cancelEnabled&&fresh.ui.prompt===payment);return;}
  }
  if(paying&&ui.okEnabled){
    prompt.textContent='Paying mana…';decisionArt.replaceChildren();options.replaceChildren();buttons.replaceChildren();lastDecision='';return;
  }
  const decisionKey=JSON.stringify([ui,frame()?.stackSize,pendingPlay?.cardId,frame()?.combat]);if(decisionKey===lastDecision){controls.hidden=!!(cardMenu&&ui.choice?.title==='Choose an ability'&&ui.choice.options.length>1);return;}lastDecision=decisionKey;
  const priority=/^Priority:/m.test(ui.prompt);
  prompt.textContent=ui.nativeFallback||ui.choice?.title||(priority?(hasPriority()?(turnPlayer()?.playerId===viewerSeatId?'Your action · play a card or use a board ability.':holdResponsesTurn===frame().turn?'Priority held · play an instant, flash card, or ability, then pass.':'Resolving the current action…'):'Waiting for the active player…'):ui.prompt);
  buttons.replaceChildren();decisionArt.replaceChildren();
  if(ui.choice){const q=ui.choice;
    if(q.title==='Choose an ability'&&cardMenu&&q.options.length>1){
      const choices=cardMenu.querySelector('.quick-ability-options');
      choices.replaceChildren(...q.options.map(option=>button(option.label,()=>{closeCardMenu();gameAction({kind:'answer',choiceId:q.id,indices:[option.index]});},'ability-option')));
      if(q.min===0)choices.append(button('Cancel',()=>{closeCardMenu();gameAction({kind:'answer',choiceId:q.id,indices:[]});}));
      cardMenu.querySelector('.primary-action')?.setAttribute('hidden','');
      options.replaceChildren();controls.hidden=true;return;
    }
    const card=frame().players.flatMap(p=>Object.values(p.zones).flatMap(z=>z.cards)).find(c=>c.cardId===(q.cardId??selectedCardId));
    if(card?.art){const img=el('img');img.src=card.art;img.alt=card.name;decisionArt.append(img);}
    // Compatibility with running adapters: Forge takes a sole offered ability for browser card selections.
    if(q.title==='Choose an ability'&&q.options.length===1&&q.autoSelect!==false){
      options.replaceChildren();prompt.textContent='Playing your card…';gameAction({kind:'answer',choiceId:q.id,indices:[q.options[0].index]}).then(ok=>{if(!ok)lastDecision='';});return;
    }
    if(choiceId!==q.id){choiceId=q.id;options.replaceChildren();
      if(q.mode==='draw')options.append(button(lastActionSuccess&&lastActionSuccess.action==='answer'?'✓ Acknowledged':'Draw card',drawStepCard,'primary-action'+(lastActionSuccess&&lastActionSuccess.action==='answer'?' action-acknowledged':'')));
      else if(q.mode==='order'){
        options.append(el('p','fine',q.min===q.max?'Arrange all items in the requested order, then confirm.':`Choose ${q.min}–${q.max} items and arrange their order, then confirm.`));
        for(const option of q.options){const row=el('div','ordered-choice');row.dataset.index=option.index;const selected=el('input');selected.type='checkbox';selected.checked=q.min===q.options.length||q.selectedIndices?.includes(option.index);selected.disabled=q.min===q.options.length;selected.setAttribute('aria-label','Include '+option.label);row.append(selected,el('span','',option.label));row.append(button('↑',()=>{const previous=row.previousElementSibling;if(previous?.classList.contains('ordered-choice'))options.insertBefore(row,previous);}),button('↓',()=>{const next=row.nextElementSibling;if(next?.classList.contains('ordered-choice'))options.insertBefore(next,row);}));row.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-label',`Move ${option.label} ${i?'down':'up'}`));options.append(row);}
      }
      else if(q.mode==='damage'){
        options.append(el('p','fine','Assign this creature’s damage. Lethal is the amount required for assignment, before prevention or replacement effects.'));
        for(const recipient of q.options){const label=el('label','damage-recipient'),n=el('input');n.type='number';n.min=0;n.max=q.total;n.step=1;n.value=0;n.dataset.recipient=recipient.index;n.setAttribute('aria-label','Damage to '+recipient.label);label.append(el('span','',recipient.label+(recipient.defender?' · defender':' · lethal '+recipient.lethal)),n);options.append(label);}
        const remaining=el('p','damage-remaining');const update=()=>{const assigned=[...options.querySelectorAll('input')].reduce((sum,n)=>sum+Number(n.value),0);remaining.textContent=`${assigned} / ${q.total} assigned · ${q.total-assigned} remaining`;};options.oninput=update;options.append(remaining);update();
      }
      else if(q.mode==='amount'){
        options.append(el('p','fine','Distribute the complete amount among these recipients.'));
        for(const recipient of q.options){const label=el('label','damage-recipient'),n=el('input');n.type='number';n.min=q.minEach;n.max=recipient.max;n.step=1;n.value=q.minEach;n.dataset.recipient=recipient.index;n.setAttribute('aria-label','Amount for '+recipient.label);label.append(el('span','',`${recipient.label} · maximum ${recipient.max}`),n);options.append(label);}
        const remaining=el('p','damage-remaining');const update=()=>{const assigned=[...options.querySelectorAll('input')].reduce((sum,n)=>sum+Number(n.value),0);remaining.textContent=`${assigned} / ${q.total} assigned · ${q.total-assigned} remaining`;};options.oninput=update;options.append(remaining);update();
      }
      else if(q.mode==='integer'){const n=el('input');n.type='number';n.min=q.min;n.max=q.max;n.value=q.min;n.id='choice-number';n.setAttribute('aria-label',q.title);options.append(n);}
      else if(q.mode==='text'){const n=el('input');n.type=q.numeric?'number':'text';n.maxLength=1000;n.value=q.initial||'';n.id='choice-text';n.setAttribute('aria-label',q.title);if(q.options?.length){const list=el('datalist');list.id='choice-text-options';for(const option of q.options){const item=el('option');item.value=option.label;list.append(item);}n.setAttribute('list',list.id);options.append(n,list);}else options.append(n);}
      else if(['one','boolean','index'].includes(q.mode))for(const option of q.options)options.append(button(option.label,()=>gameAction({kind:'answer',choiceId:q.id,indices:[option.index]}),'ability-option'));
      else for(const option of q.options){const label=el('label','choice-option'),input=el('input');input.type='checkbox';input.name='game-choice';input.value=option.index;if(q.mode!=='ack')label.append(input);label.append(el('span','',option.label));options.append(label);}
    }
    if(q.mode==='order')buttons.append(button('Confirm order',()=>gameAction({kind:'answer',choiceId:q.id,indices:[...options.querySelectorAll('.ordered-choice')].filter(row=>row.querySelector('input').checked).map(row=>Number(row.dataset.index))})));
    else if(q.mode==='damage'){
      buttons.append(button('Confirm damage assignment',()=>gameAction({kind:'answer',choiceId:q.id,amounts:[...options.querySelectorAll('input[data-recipient]')].map(n=>Number(n.value))})));
      if(q.maySkip)buttons.append(button('Skip this assignment',()=>gameAction({kind:'answer',choiceId:q.id,skip:true})));
    }
    else if(q.mode==='amount')buttons.append(button('Confirm allocation',()=>gameAction({kind:'answer',choiceId:q.id,amounts:[...options.querySelectorAll('input[data-recipient]')].map(n=>Number(n.value))})));
    else if(q.mode==='integer')buttons.append(button('Apply amount',()=>gameAction({kind:'answer',choiceId:q.id,value:Number($('choice-number').value)})));
    else if(q.mode==='text'){buttons.append(button('Submit',()=>gameAction({kind:'answer',choiceId:q.id,text:$('choice-text').value})));buttons.append(button('Cancel',()=>gameAction({kind:'answer',choiceId:q.id,cancel:true})));}
    else if(q.mode==='ack')buttons.append(button('Continue',()=>gameAction({kind:'answer',choiceId:q.id,indices:[]})));
    else if(q.mode==='many')buttons.append(button('Done selecting',()=>gameAction({kind:'answer',choiceId:q.id,indices:[...options.querySelectorAll('input:checked')].map(n=>Number(n.value))})));
    else if(q.min===0&&q.mode!=='draw')buttons.append(button('Cancel',()=>gameAction({kind:'answer',choiceId:q.id,indices:[]})));
  }else{
    choiceId=null;options.replaceChildren();
    const visibleCardIds=new Set(frame().players.flatMap(p=>Object.values(p.zones).flatMap(z=>z.cards.map(c=>c.cardId))));
    const hiddenCandidates=(ui.selectableCards||[]).filter(c=>!visibleCardIds.has(c.cardId));
    if(hiddenCandidates.length){
      const help=el('p','fine',hiddenCandidates.length===1?'Select the available card to continue.':`Choose from ${hiddenCandidates.length} cards Forge made available for this decision.`),tray=el('div','selection-card-grid');
      options.append(help,tray);
      for(const card of hiddenCandidates){
        const selected=ui.highlightedCards?.includes(card.cardId),pick=button('',()=>gameAction({kind:'card',targetId:card.cardId}),'selection-card-choice'+(selected?' selected-card':''));
        pick.setAttribute('aria-label',(selected?'Selected ':'Select ')+(card.name||'card'));pick.setAttribute('aria-pressed',String(!!selected));
        if(card.art){const image=el('img');image.src=card.art;image.alt=card.name||'Selectable card';pick.append(image);}
        else pick.append(el('strong','',card.name||'Selectable card'));
        pick.append(el('span','',card.name||'Selectable card'));tray.append(pick);
      }
    }
    const confirmLabel=priority&&ui.ok==='OK'?(turnPlayer()?.playerId===viewerSeatId&&frame().stackSize===0?'Continue from '+phaseName(frame().phase):'Pass priority'):ui.ok==='Auto'?'Pay cost':ui.ok||'Continue';
    const confirm=button(lastActionSuccess&&lastActionSuccess.action==='ok'?'✓ Acknowledged':confirmLabel,()=>{if(ui.ok==='Auto')approvedPayment=paymentId;gameAction({kind:'ok'});});
    confirm.title=priority?'Finish acting for now and let the other players respond.':'';
    confirm.disabled=!ui.okEnabled||!!ui.nativeFallback||(lastActionSuccess&&lastActionSuccess.action==='ok');
    if(lastActionSuccess&&lastActionSuccess.action==='ok')confirm.classList.add('action-acknowledged');
    
    if(ui.nativeFallback){
      const fallbackNotice=el('p','nativefallback-notice',ui.nativeFallback+' The browser control is temporarily unavailable.');
      options.append(fallbackNotice);
    }
    
    if(!ui.okEnabled&&!ui.nativeFallback&&ui.ok){
      const viewerHasControl=live.viewerSeatId!=null&&live.state?.priorityPlayerId===live.viewerSeatId;
      const isConfirmDecision=/keep|mulligan|starting player/i.test(ui.prompt||'');
      if(!viewerHasControl&&isConfirmDecision){
        const actingPlayer=frame()?.players.find(p=>p.playerId===live.state?.priorityPlayerId);
        prompt.textContent=actingPlayer?`Waiting for ${names[actingPlayer.playerId]} to decide…`:'Waiting for another player to decide…';
        confirm.hidden=true;
      }
    }
    
    buttons.append(confirm);
    
    if(debugDecisions){
      const debugInfo=el('p','decision-debug-info',`Debug: viewerSeat=${viewerSeatId} ok=${ui.ok} okEnabled=${ui.okEnabled} nativeFallback=${!!ui.nativeFallback} inputType=${ui.inputType||'none'} revision=${live?.revision||0}`);
      options.append(debugInfo);
    }
    if(priority&&hasPriority()&&turnPlayer()?.playerId!==viewerSeatId){const hold=button(holdResponsesTurn===frame().turn?'Resume auto-pass':'Hold responses this turn',()=>{holdResponsesTurn=holdResponsesTurn===frame().turn?null:frame().turn;lastDecision='';renderDecision();});hold.title='Keep priority stops available while this opponent finishes their turn.';buttons.append(hold);}
    if(ui.cancelEnabled){
      const yielding=priority&&ui.cancel==='End Turn'&&turnPlayer()?.playerId!==viewerSeatId;
      const cancelLabel=priority&&ui.cancel==='End Turn'?(turnPlayer()?.playerId===viewerSeatId?'End my turn':'Yield through this turn'):ui.cancel||'Cancel';
      const cancel=button(lastActionSuccess&&lastActionSuccess.action==='cancel'?'✓ Acknowledged':cancelLabel,()=>{if(yielding){yieldTurn=frame().turn;gameAction({kind:'ok'});}else gameAction({kind:'cancel'});});
      cancel.title=yielding?'Skip empty stops this turn. Spells, abilities and required choices still allow a response.':'';
      cancel.disabled=!!ui.nativeFallback||(lastActionSuccess&&lastActionSuccess.action==='cancel');
      if(lastActionSuccess&&lastActionSuccess.action==='cancel')cancel.classList.add('action-acknowledged');
      buttons.append(cancel);
    }
    if(ui.selectables.length&&!hiddenCandidates.length)buttons.append(el('span','fine','Select highlighted cards on the playmat.'));
    // Player selection belongs to an explicit target/defender prompt, never ordinary priority.
    const startingPlayer=/who would you like to start|starting player|start this game/i.test(ui.prompt);
    if(attackSelection()){
      prompt.textContent='Choose a defender, then select your attackers. Review Combat before confirming.';
      confirm.textContent='Confirm attackers';
      if(ui.cancel==='Alpha Strike'){const all=buttons.querySelectorAll('button')[1];if(all){all.textContent='Attack with all';all.title='Forge assigns all eligible attackers. Restrictions can require another defender; review every destination before confirming.';}}
      const targets=frame().combat?.defenders||frame().players.filter(p=>p.playerId!==viewerSeatId&&p.health.status!=='out').map(p=>({kind:'player',id:p.playerId,name:p.name}));
      for(const target of targets){const selected=target.kind==='player'?(ui.highlightedPlayers?.includes(target.id)||ui.prompt.includes('attack '+target.name+' ')):ui.highlightedCards?.includes(target.id);const b=button((selected?'✓ Attacking ':'Attack ')+target.name,()=>gameAction({kind:target.kind,targetId:target.id}),'defender-choice');b.setAttribute('aria-pressed',String(!!selected));buttons.append(b);}
      buttons.append(button('Review attackers & blockers',()=>selectPane('combat')));
    }else if(blockSelection()){confirm.textContent='Confirm blockers';buttons.append(el('p','fine','Select an attacker in Combat, then one of your creatures to assign or remove its block.'),button('Review attackers & blockers',()=>selectPane('combat')));}
    else if(!priority&&(startingPlayer||(/select|choose|target/i.test(ui.prompt)&&/player|opponent/i.test(ui.prompt))))for(const p of frame().players.filter(p=>p.health.status!=='out'))buttons.append(button((startingPlayer?'Start with ':'Target ')+names[p.playerId],()=>gameAction({kind:'player',targetId:p.playerId})));
  }
}
const livePoller=createLivePoller({
  read:async signal=>{
    const response=await fetch(guestMode?'/match/view':'/api/game-view',{signal,headers:guestMode?{Authorization:'Bearer '+seatSession?.capability}:{}});
    const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'Unable to read the table'),{status:response.status});return value;
  },apply:applyLiveView,interval:()=>pendingCasts.size?250:750,
  onError:(error,{fatal})=>{
    liveButton.textContent=fatal?'Table access ended':'Reconnecting…';liveButton.disabled=!fatal;
    $('notice').textContent=fatal?error.message+' Return to the table lobby.':'Connection interrupted. Reconnecting to the live table…';
    if(fatal)livePolling=false;
  }
});
async function startLive(){if(livePolling)return;livePolling=true;liveButton.disabled=true;await livePoller.start();}
async function refreshLiveView(){await livePoller.refresh();}
function applyLiveView(value){
    if(value.state?.players?.length){
      if(appliedMatch===value.matchId&&value.revision<appliedRevision)return;
      if(appliedMatch&&appliedMatch!==value.matchId){pendingCasts.clear();pendingPlay=null;completionReport=null;completionLoading=false;completionFeedbackSaved=false;completionStatus='';}
      viewerSeatId=Number.isSafeInteger(value.viewerSeatId)?value.viewerSeatId:viewerSeatId;if(primarySeat===0&&!appliedMatch)primarySeat=viewerSeatId;appliedMatch=value.matchId;appliedRevision=value.revision;live=value;data.pod=value.pod;for(const p of value.state.players)names[p.playerId]=p.playerId===viewerSeatId?`You · ${p.name}`:p.name;
      if(value.ui.lastAction?.status==='error'&&value.ui.lastAction.id!==lastActionError){lastActionError=value.ui.lastAction.id;notifyAction(value.ui.lastAction.message);}
      updatePendingCasts();
      document.body.classList.add('online-live');document.body.dataset.seats=value.state.players.length;document.querySelector('.preview').textContent=guestMode?'LIVE TABLE · INVITED SEAT':'LIVE TABLE · LOCAL HOST';document.querySelector('.scrubber').hidden=true;
      const key=JSON.stringify([value.state,value.ui.selectables,value.ui.prompt,[...pendingCasts.values()].map(c=>[c.cardId,c.stage])]);if(key!==lastState&&draggingCard===null&&!resizingBoard&&!decisionPointer){lastState=key;for(const id of [0,1,2,3])$(`seat-${id}`).hidden=!value.state.players.some(p=>p.playerId===id);render();if($('focus').open)focusBoard(frame().players.find(p=>p.playerId===Number($('focus').dataset.seat)));}
      renderDecision();renderHistory();renderGuidance();renderCombat();if(trackerTab==='tracker')renderTracker();liveButton.textContent='Live table connected';if(Date.now()>noticeUntil)$('notice').textContent='Drag from hand to play. Select your card for actions; inspect for a larger view. History records public activity.';
    }
}
window.addEventListener('crankmagic-game-ready',async()=>{await startLive();if(!live)return;document.body.classList.remove('setup-screen');$('game-setup').close();if(window.parent!==window)window.parent.postMessage({type:'crankmagic-live'},location.origin);reportCanvasSize();});
window.addEventListener('crankmagic-game-closed',()=>{livePolling=false;livePoller.stop();live=null;gameToken=null;lastState='';lastDecision='';completionReport=null;completionLoading=false;completionFeedbackSaved=false;completionStatus='';pendingCasts.clear();pendingPlay=null;visualGroups.clear();freePositions.clear();});
if(new URLSearchParams(location.search).has('embedded')){document.body.classList.add('embedded');document.querySelector('.brand')?.remove();const sidebar=button('☰ Sidebar',()=>window.parent.postMessage({type:'crankmagic-sidebar'},location.origin)),editor=button('Deck editor',()=>window.parent.postMessage({type:'crankmagic-exit'},location.origin));document.querySelector('header').prepend(sidebar,editor);}
if(guestMode){document.querySelector('.brand')?.remove();document.querySelector('.workshop-link')?.remove();$('setup').textContent='Table lobby';}
if(!new URLSearchParams(location.search).has('replay')){if(guestMode){document.body.classList.remove('setup-screen');await startLive();}else{document.body.classList.add('setup-screen');await openGameSetup();}}
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==window.parent||window.parent===window)return;if(event.data?.type==='crankmagic-setup')openGameSetup(event.data.imported).catch(error=>{$('notice').textContent=error.message;});});
