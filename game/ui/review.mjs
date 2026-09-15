import {defaultPlaymat,resolvePlaymat,readMatPreferences,paintMat} from '/playmats.mjs';
import {openGameSetup} from '/setup.mjs';
// Earlier running hosts do not advertise this module until their next restart.
const {manaStatus,manaColors}=await import('/mana-status.mjs').catch(()=>({manaStatus:null,manaColors:[]}));
import '/handoff.mjs';
import '/app/card-classify.js';
import '/app/crankmagic-facets.js';
const $=id=>document.getElementById(id);
document.body.classList.add('table-view');
const opponents=document.createElement('div');opponents.className='opponent-boards';opponents.setAttribute('aria-label','Opponent boards');
$('seat-1').before(opponents);for(const id of [1,2,3])opponents.append($('seat-'+id));
function reportCanvasSize(){if(window.parent!==window)window.parent.postMessage({type:'crankmagic-canvas-size',height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin);}
new ResizeObserver(reportCanvasSize).observe(document.body);
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===window.parent&&event.data?.type==='crankmagic-viewport'&&Number.isFinite(event.data.height))document.body.style.setProperty('--table-viewport',Math.max(400,Math.min(4000,event.data.height))+'px');});

const data=await fetch('/match.json').then(r=>r.ok?r.json():{frames:[],log:[],pod:{seats:[]}}).catch(()=>({frames:[],log:[],pod:{seats:[]}}));
let resizingBoard=false,boardWidth=null,draggingCard=null,suppressClickUntil=0,pendingPlay=null,lastTurnName='',live=null,livePolling=false,gameToken=null,lastState='',choiceId=null,actionBusy=false,noticeUntil=0,lastDecision='';
const pendingCasts=new Map(),handPositions=new Map();let appliedRevision=-1,appliedMatch=null,paymentAttempt=null,paymentNotice='',yieldTurn=null;
let primarySeat=0,followActive=false,followedTurn=null;const visualGroups=new Map(),freePositions=new Map();
try{const saved=Number(localStorage.getItem('crankmagic-board-width'));if(saved>=320&&saved<=2400)boardWidth=saved;}catch{}
const names=['You · Chulane','Krenko','Atraxa','Shadrix'];
const levels=new Map([[1,3],[2,3],[3,3]]);
const visibleArtwork=new Map();for(const f of data.frames)for(const p of f.players)for(const z of Object.values(p.zones))for(const c of z.cards)if(c.name&&c.art)visibleArtwork.set(c.name,c.art);
let index=Math.max(0,data.frames.findIndex(f=>f.turn>=18 && f.phase==='MAIN1'));
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function button(text,fn,cls){const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;}
function frame(){return live?.state?.players?live.state:data.frames[index];}
function humanPlayer(){return frame()?.players.find(p=>p.playerId===0);}
let rememberedTurn=-1;
function turnPlayer(){
  const f=frame();if(!f)return null;
  if(Number.isInteger(f.turnPlayerId))return f.players.find(p=>p.playerId===f.turnPlayerId);
  // Compatibility with an already-running adapter, which exposes turn ownership in its prompt.
  const match=live?.ui.prompt?.match(/Turn:\s*(\d+)\s*\(([^\n]+)\)/);
  if(match&&Number(match[1])===f.turn){lastTurnName=match[2];rememberedTurn=f.turn;}
  return rememberedTurn===f.turn?f.players.find(p=>p.name===lastTurnName):null;
}
function hasPriority(){if(Number.isInteger(frame()?.priorityPlayerId))return frame().priorityPlayerId===0;return live?.ui.prompt?.match(/^Priority:\s*([^\n]+)/)?.[1]===humanPlayer()?.name;}
function turnLabel(){const p=turnPlayer(),phase=frame()?.phase;return `${p?.playerId===0?'YOUR TURN':p?`${p.name}’s turn`:frame()?.turn===0?'SETTING UP':'TURN OWNER UNAVAILABLE'} · Turn ${frame()?.turn??0} · ${String(phase&&phase!=='null'?phase:'Setup').replaceAll('_',' ').toLowerCase()}`;}
function notifyAction(text){$('notice').textContent=text;noticeUntil=Date.now()+6500;let toast=$('action-notice');if(!toast){toast=el('div','action-notice');toast.id='action-notice';toast.setAttribute('role','status');document.body.append(toast);}(($('focus').open)?$('focus'):document.body).append(toast);toast.textContent=text;toast.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>toast.hidden=true,6500);}
function playRestriction(c){
  if(!live)return 'Connect to your live table first.';
  if(live.ui.choice||live.ui.nativeFallback)return 'Finish the current card choice first.';
  if(live.ui.ok==='Auto'&&humanPlayer()?.zones.Hand.cards.some(h=>h.cardId===c.cardId))return 'Finish the current mana payment or cancel it before playing another card.';
  if(humanPlayer()?.zones.Hand.cards.some(h=>h.cardId===c.cardId)&&c.typeLine?.split('—')[0].includes('Land')){
    const owner=turnPlayer();if(owner&&owner.playerId!==0)return `It is ${owner.name}’s turn. Play this land during your main phase.`;
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
    else if(cast.leftSource&&inSource&&!ui.choice&&ui.ok!=='Auto')finished=`${cast.card.name} returned to your ${cast.fromZone.toLowerCase()}.`;
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
  const announced=(frame().stack||[]).filter(item=>!pendingCasts.has(item.cardId)).map(item=>({cardId:item.cardId,card:{...item,name:item.name||'Face-down spell'},stage:item.stage==='casting'?'Mana payment needed':'On the stack · awaiting responses'}));
  for(const cast of [...pendingCasts.values(),...announced]){
    const row=el('div','casting-card');row.dataset.pendingCard=cast.cardId;
    const art=button('',()=>inspect(cast.card),'casting-art');art.setAttribute('aria-label','Inspect pending '+cast.card.name);if(cast.card.art){const img=el('img');img.src=cast.card.art;img.alt=cast.card.name;art.append(img);}else art.textContent=cast.card.name;
    const info=el('div');info.append(el('small','','CASTING'),el('strong','',cast.card.name),el('span','casting-status',cast.stage));
    if(cast.stage.startsWith('On the stack')){info.append(el('small','','Enters play after the spell resolves.'));if(hasPriority()&&!live.ui.choice){const next=button('Pass priority',()=>gameAction({kind:'ok'},fresh=>fresh.ui.ok==='OK'&&fresh.ui.okEnabled&&!fresh.ui.choice&&fresh.state.stackSize>0&&fresh.state.priorityPlayerId===0),'primary-action');info.append(next);}}
    else if(live.ui.ok==='Auto'&&!live.ui.okEnabled)info.append(el('small','','Not enough available mana for automatic payment. Use a mana source or cancel below.'));
    else if(live.ui.choice||live.ui.nativeFallback)info.append(button('Show choice',()=>{mountControls();controls.scrollIntoView({block:'nearest',behavior:'smooth'});}));
    row.append(art,info);tray.append(row);
  }
  return tray;
}
let selectedCardId=null,cardMenu=null;
function highlightSelection(id){selectedCardId=id;for(const node of document.querySelectorAll('.card[data-card-id]'))node.classList.toggle('selected-card',Number(node.dataset.cardId)===id);}
function closeCardMenu(){if(cardMenu){cardMenu.hidePopover();cardMenu.remove();cardMenu=null;}highlightSelection(null);}
function cardActions(c,anchor){
  if(live?.ui.selectables.includes(c.cardId)){gameAction({kind:'card',targetId:c.cardId});return;}
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
  ($('focus').open?$('focus'):document.body).append(body);body.showPopover();
  const r=anchor?.getBoundingClientRect()||{right:innerWidth/2,left:innerWidth/2,top:innerHeight/2};
  body.style.left=Math.max(8,Math.min(innerWidth-body.offsetWidth-8,r.right+10))+'px';body.style.top=Math.max(8,Math.min(innerHeight-body.offsetHeight-8,r.top))+'px';
  body.addEventListener('toggle',event=>{if(event.newState==='closed'&&cardMenu===body){cardMenu=null;body.remove();highlightSelection(null);}});
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
    if(zone==='Command'&&p.playerId===0&&face&&live){cardActions(face,pile);return;}
    if(zone==='Library')notifyAction(`${z.count} cards remain.${p.playerId===0?' Double-click to take your pending draw-step draw.':''}`);else zoneView(p,zone);
  },cls);
  if(zone==='Command'&&p.playerId===0&&face&&live){enableHandDrag(pile,face);pile.addEventListener('dblclick',()=>{closeCardMenu();playCard(face);});pile.title='Drag your commander onto your mat to cast; mana and commander tax are paid automatically.';}
  if(zone==='Library'&&p.playerId===0){pile.addEventListener('dblclick',drawStepCard);if(live?.ui.choice?.mode==='draw')pile.classList.add('draw-ready');pile.title='Double-click to take your pending draw-step draw';}
  pile.setAttribute('aria-label',`${names[p.playerId]} ${label}, ${z.count} cards`);
  if(zone==='Library'&&z.count){const back=el('span','library-back');back.append(el('span','','✦'));pile.append(back);}
  else if(face?.art){const art=el('img');art.src=face.art;art.alt=face.name;art.loading='lazy';pile.append(art);}else pile.append(el('span','pile-empty',z.count?'◇':'—'));
  pile.append(el('span','pile-count',z.count),el('span','mat-zone-label',label));return pile;
}
function groups(cards){
  if(live)return cards.map(card=>({card,count:1}));
  const m=new Map();
  for(const c of cards){const key=JSON.stringify([c.name,c.tapped,c.counters,c.power,c.toughness,c.damage,c.owner,c.controller,c.faceDown,c.art]);if(m.has(key))m.get(key).count++;else m.set(key,{card:c,count:1});}
  return [...m.values()];
}
function cardButton(c,count=1){
  const b=button('',()=>{if(Date.now()<suppressClickUntil)return;if(live&&!c.deckEntry&&live.ui.selectables.includes(c.cardId))gameAction({kind:'card',targetId:c.cardId});else if(live&&!c.deckEntry&&Object.values(humanPlayer()?.zones||{}).some(z=>z.cards.some(card=>card.cardId===c.cardId)))cardActions(c,b);else inspect(c,count);},'card'+(c.tapped?' tapped':''));b.setAttribute('aria-label',`${c.name||'Face-down card'}${count>1?`, ${count} copies`:''}${c.tapped?', tapped':''}`);if(c.cardId!=null){b.dataset.cardId=c.cardId;b.classList.toggle('selected-card',c.cardId===selectedCardId);}
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
    if(live.ui.selectables.includes(c.cardId))b.classList.add('selectable');
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
  const content=$('focus-content'),scrollTop=content.scrollTop;disposeCarousels(content);content.replaceChildren();
  const stage=el('div','focus-mat-stage');stage.append(matView(p,true));content.append(stage);
  if(p.playerId===0){const hand=el('section','focus-hand');hand.id='focus-hand';const heading=el('div','hand-label');heading.append(el('strong','','Your hand'),el('span','',p.zones.Hand.count+' cards'));hand.append(heading,handCarousel(p.zones.Hand.cards,'focus-hand-cards'));content.append(hand);}
  else content.append(el('p','fine','Opponent hand: '+p.zones.Hand.count+' cards · hidden'));
  if(!dialog.open)dialog.showModal();content.scrollTop=scrollTop;syncModalViewport();mountControls();
}
function seatMat(id){const appearance=live?.appearance?.find(s=>s.seatId===id),preference=readMatPreferences()[id];const requested=appearance?.playmat&&(!preference||preference===appearance.playmatChoice)?appearance.playmat:preference||defaultPlaymat(id);return resolvePlaymat(requested,live?.matchId||data.pod.podHash||'preview',id);}
window.addEventListener('crankmagic-playmat',()=>{if(live||data.frames.length){render();if($('focus').open)focusBoard(frame().players.find(p=>p.playerId===Number($('focus').dataset.seat)));}});
window.addEventListener('storage',event=>{if(event.key==='crankmagic-playmats-v1')window.dispatchEvent(new Event('crankmagic-playmat'));});
function matView(p,focused=false){
  const mat=el('div',`player-mat${p.playerId===0?' personal-mat':' plain-mat'}`);
  mat.dataset.seat=p.playerId;
  paintMat(mat,seatMat(p.playerId));mat.addEventListener('click',event=>{if(!focused&&!event.target.closest('button')&&!draggingCard&&Date.now()>=suppressClickUntil){primarySeat=p.playerId;followActive=false;refreshBoards();}});
  mat.setAttribute('aria-label',`${names[p.playerId]} playmat`);
  if(live&&p.playerId===0){
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
    const grouped=new Map(),capacity=name==='Lands'?7:4,crowded=cards.filter(c=>!freePositions.has(c.cardId)).length>capacity;
    for(const card of cards.filter(c=>!freePositions.has(c.cardId))){const mana=/^[^\n:]*:\s*Add\b/im.test(card.oracleText||''),types=card.typeLine||'';const label=card.token?'Tokens':types.includes('Land')?'Lands':mana&&types.includes('Creature')?'Mana dorks':mana&&types.includes('Artifact')?'Mana rocks':types.includes('Creature')?'Creatures':types.includes('Artifact')?'Artifacts':types.includes('Enchantment')?'Enchantments':'Other';const key=visualGroups.get(card.cardId)||label;if(!grouped.has(key))grouped.set(key,{manual:key.startsWith('group:'),label:key.startsWith('group:')?'Your group':label,cards:[]});grouped.get(key).cards.push(card);}
    for(const group of grouped.values()){const stacked=crowded||group.manual,stack=el('div','battlefield-group'+(stacked?'':' expanded-group'));stack.append(el('small','group-label',group.label));const fan=el('div','card-fan'+(stacked?'':' spread-cards'));for(const card of group.cards)fan.append(cardButton(card));stack.append(fan);list.append(stack);}
    if(!cards.length)list.append(el('span','mat-empty',p.health?.status==='out'?'Eliminated':'Empty'));
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
  if(p.playerId===0&&(pendingCasts.size||frame().stack?.length))mat.append(castingPreview());
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
  const box=$(`seat-${p.playerId}`);box.replaceChildren();const active=turnPlayer()?.playerId===p.playerId;box.classList.toggle('active-turn',active);if(active)box.setAttribute('aria-label',names[p.playerId]+' · active turn');else box.removeAttribute('aria-label');
  const head=el('div','seat-heading');const title=el('div');title.append(el('div','seat-label',live?(p.playerId===0?'YOU · HUMAN':'AI · LOCAL PILOT'):(p.playerId===0?'YOUR DECK · RECORDED NATIVE PILOT':'AI OPPONENT · NATIVE PROBE')),el('div','seat-title',names[p.playerId]));
  if(active)title.append(el('span','turn-badge','● TURN'));const health=button('',()=>showHealth(p),'seat-health');health.append(el('strong','',p.health.life),el('small','',`☣ ${p.health.poison}/10 · CMD ${p.health.commanderDamageMax}/21${p.health.status==='out'?' · OUT':''}`));health.setAttribute('aria-label',`${names[p.playerId]} life ${p.health.life}, poison ${p.health.poison}, commander damage ${p.health.commanderDamageMax}`);head.append(title,health,el('span','seat-hand-count',`Hand ${p.zones.Hand.count}`),button('Focus board',()=>focusBoard(p)));box.append(head,matView(p));if(p.playerId===0)attachBoardResize(box);
  const identity=p.playerId===0?[...new Set((data.pod.seats[0]?.mechanics?.cards||[]).filter(c=>data.pod.seats[0].deck.commanders.some(cmd=>cmd.name===c.name)).flatMap(c=>c.colorIdentity||[]))]:p.zones.Command.cards.flatMap(c=>c.colorIdentity||[]);
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
const tracker=el('section','tracker-pane');tracker.id='tracker-pane';tracker.setAttribute('role','tabpanel');tracker.setAttribute('aria-labelledby','tab-tracker');
$('inspector').setAttribute('role','tabpanel');$('inspector').setAttribute('aria-labelledby','tab-info');$('events').setAttribute('role','tabpanel');$('events').setAttribute('aria-labelledby','tab-history');tabs.append(infoTab,statsTab,historyTab);sidebar.prepend(tabs);sidebar.append(tracker);
function selectPane(value){trackerTab=value;for(const [b,id]of [[infoTab,'info'],[statsTab,'tracker'],[historyTab,'history']])b.setAttribute('aria-selected',String(value===id));for(const n of sidebar.querySelectorAll('.aside-title,#inspector'))n.hidden=value!=='info';for(const n of sidebar.querySelectorAll('.log-header,#events'))n.hidden=value!=='history';tracker.hidden=value!=='tracker';if(value==='tracker')renderTracker(true);if(value==='history')renderHistory();}
function historyRows(){if(!frame())return [];return live?(live.telemetry?.recent||[]):data.log.filter(e=>e.sequence<=frame().sequence).slice(-80).reverse().map(e=>({id:e.eventId,turn:e.turn,label:logText(e),name:''}));}
function historyContent(){const body=el('div','history-feed'),rows=historyRows();body.append(el('p','fine','Recent recorded public card activity · newest first. Private draws and choices are hidden.'));
  for(const e of rows){const row=el('div','history-row');row.append(el('small','',`TURN ${e.turn??'?'}${e.playerId!=null?' · '+names[e.playerId]:''}`),el('strong','',e.label),el('span','',e.name||''));body.append(row);}
  if(!rows.length)body.append(el('p','empty',live?.telemetry?'No public card activity recorded yet. Plays and abilities will appear here.':'History is unavailable from this host.'));return body;}
let historyKey='';
function renderHistory(){const rows=historyRows(),key=JSON.stringify(rows);if(key===historyKey)return;historyKey=key;$('event-count').textContent=rows.length+' recent events';$('events').replaceChildren(historyContent());if($('detail').open&&$('detail').dataset.history==='true')$('detail-body').replaceChildren(historyContent());}
function openHistory(){showDialog('Game history',historyContent());$('detail').dataset.history='true';}
const historyShortcut=button('History',openHistory);document.querySelector('header').append(historyShortcut);$('close-focus').before(button('History',openHistory));
$('detail').addEventListener('close',()=>delete $('detail').dataset.history);
function renderTracker(force=false){
  if(!frame())return;const t=live?.telemetry,key=JSON.stringify([trackerPlayer,t,frame().players]);if(!force&&key===trackerKey)return;trackerKey=key;tracker.replaceChildren();
  if(!trackerFacts){trackerFacts=new Map();fetch('/app/data/cards.json').then(r=>r.json()).then(d=>{for(const c of d.cards)trackerFacts.set(c.name,c);renderTracker(true);}).catch(()=>{});}
  const chooser=el('select');chooser.setAttribute('aria-label','Track player');for(const p of frame().players){const o=el('option','',names[p.playerId]);o.value=p.playerId;chooser.append(o);}chooser.value=trackerPlayer;chooser.addEventListener('change',()=>{trackerPlayer=Number(chooser.value);renderTracker(true);});tracker.append(chooser);
  const p=frame().players.find(p=>p.playerId===trackerPlayer)||humanPlayer(),rows=(t?.cards||[]).filter(c=>c.controller===p.playerId),sum=k=>rows.reduce((n,c)=>n+(c[k]||0),0);
  const metrics=el('div','tracker-metrics');
  for(const [label,value]of [['Life',p.health.life],['Poison',p.health.poison],['Hand',p.zones.Hand.count],['Lands played',t?sum('lands'):'—'],['Tap events',t?sum('taps'):'—'],['Counters added',t?sum('countersAdded'):'—'],['Spells cast',t?.classified?sum('spells'):'—'],['Activated on stack',t?.classified?sum('abilities'):'—'],['Triggers stacked',t?.classified?sum('triggers'):'—'],['Proliferate selections',t?.proliferateInstrumented&&p.playerId===0?t.counts.proliferateChoices:'—']]){const box=el('div');box.append(el('strong','',value),el('small','',label));metrics.append(box);}tracker.append(metrics);
  tracker.append(el('p','fine',t?'Recorded events for visible sources, including actions later undone. Tap events include mana, attacks and costs. Ability counts cover stack entries; mana activations can bypass the stack. Proliferate selections count choices, not counters added. A dash means instrumentation is unavailable.':'The event tracker is waiting for the updated local host. Current board rules are available below.'));
  const rules=el('section');rules.append(el('h3','','Rules currently on this board'));
  for(const c of p.zones.Battlefield.cards){const fact=trackerFacts.get(c.name)||data.pod.seats[0]?.mechanics?.cards?.find(f=>f.name===c.name),row=el('details','board-rule');row.append(el('summary','',c.name+(c.tapped?' · tapped':'')));
    row.append(el('p','',fact?.oracleText||'Rules text is not cached for this object.'),button('Inspect',()=>inspect(c)));rules.append(row);}
  if(!p.zones.Battlefield.cards.length)rules.append(el('p','fine','No permanents yet. Trigger conditions, static rules and activated abilities appear here as cards enter.'));tracker.append(rules);
  const activity=el('section');activity.append(el('h3','','Card activity'));for(const c of rows.sort((a,b)=>b.stackEntries-a.stackEntries).slice(0,15))activity.append(el('p','tracker-card-row',c.name+' · '+c.stackEntries+' stack entries · '+c.taps+' taps · '+c.countersAdded+' counters added'));if(!rows.length)activity.append(el('p','fine','No recorded activity for visible cards in this seat yet.'));tracker.append(activity);
  const log=el('details','tracker-log');log.append(el('summary','','Recent events'));for(const event of (t?.recent||[]).filter(e=>e.playerId===p.playerId).slice(0,20))log.append(el('p','fine','Turn '+(event.turn??'?')+' · '+event.name+' · '+event.label));tracker.append(log);
  if(p.playerId===0){const review=el('section');review.append(el('h3','','Deck review notes'),el('p','fine','Watch for cards held without a use, colors you could not produce, triggers you could not exploit, and opposing effects that disrupted your plan. Counts alone are not a reason to cut a card.'));
    const notes=el('textarea');notes.setAttribute('aria-label','Deck review notes');notes.placeholder='Cards to reconsider, missed synergies, interaction to add…';const key='crankmagic-review-'+(live?.matchId||'replay');try{notes.value=localStorage.getItem(key)||'';}catch{}notes.addEventListener('input',()=>{try{localStorage.setItem(key,notes.value);}catch{}});review.append(notes,button('Export tracker report',()=>{const report={schema:'CrankMagicTracker@1',matchId:live?.matchId,turn:frame().turn,deck:data.pod.seats[0]?.deck.name,telemetry:t||null,notes:notes.value,limitations:['Only observed visible sources are summarized.','Missing instrumentation is unknown, not zero.','Causal loop detection and exact mana-efficiency attribution are not implemented.']};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='crankmagic-tracker.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));tracker.append(review);}
}
selectPane('history');
function render(){
  document.querySelector('.focus-eyebrow').textContent=live?'FOCUSED BOARD · LIVE GAME':'FOCUSED BOARD · REPLAY';
  const f=frame();$('phase').textContent=turnLabel();$('position').textContent=live?'Live game':`Recorded phase ${index+1} / ${data.frames.length}`;$('timeline').value=index;
  $('prev').disabled=index===0;$('next').disabled=index===data.frames.length-1;
  follow.textContent='Follow active player: '+(followActive?'on':'off');
  if(followActive&&followedTurn!==f.turn&&turnPlayer()){primarySeat=turnPlayer().playerId;followedTurn=f.turn;}
  for(const p of f.players){const seat=$('seat-'+p.playerId);seat.classList.toggle('primary-seat',p.playerId===primarySeat);if(p.playerId===primarySeat)opponents.after(seat);else opponents.append(seat);renderSeat(p);}
  for(const p of f.players.filter(p=>p.playerId!==primarySeat)){const seat=$('seat-'+p.playerId);seat.querySelector('.seat-heading').append(button('Show board',()=>{primarySeat=p.playerId;followActive=false;refreshBoards();}));}
  const you=f.players.find(p=>p.playerId===0);disposeCarousels($('hand-host'));$('hand-host').replaceChildren(handCarousel(you.zones.Hand.cards,'hand'));$('hand-count').textContent=`${you.zones.Hand.count} cards`;
  renderHistory();
}
const follow=button('Follow active player: off',()=>{followActive=!followActive;followedTurn=null;follow.textContent='Follow active player: '+(followActive?'on':'off');refreshBoards();});$('view-deck').before(follow,button('My board',()=>{primarySeat=0;followActive=false;follow.textContent='Follow active player: off';refreshBoards();}));
$('timeline').max=data.frames.length-1;$('timeline').addEventListener('input',e=>{index=+e.target.value;render();});$('prev').addEventListener('click',()=>{index=Math.max(0,index-1);render();});$('next').addEventListener('click',()=>{index=Math.min(data.frames.length-1,index+1);render();});
$('close-detail').addEventListener('click',()=>$('detail').close());$('clear-inspect').addEventListener('click',()=>$('inspector').replaceChildren(el('p','empty','Select any visible card to inspect it.')));
$('card-detail').addEventListener('click',()=>$('card-detail').close());
$('close-focus').addEventListener('click',()=>$('focus').close());
$('focus').addEventListener('close',mountControls);
for(const id of ['focus','detail','card-detail'])$(id).addEventListener('close',syncModalViewport);
$('focus-size').addEventListener('input',e=>{$('focus').style.setProperty('--focus-zoom',e.target.value+'%');$('focus').style.setProperty('--focus-scale',e.target.value/100);$('focus-size-value').textContent=e.target.value+'%';});
$('view-hand').addEventListener('click',()=>zoneView(frame().players.find(p=>p.playerId===0),'Hand'));
$('view-deck').addEventListener('click',deckView);
$('notice').textContent='Real recorded engine states · Native AI proof · Human play, API pilots and measured reports are still being built.';
$('setup').textContent='Game setup';
$('setup').addEventListener('click',()=>openGameSetup().catch(error=>showDialog('Game setup',el('p','fine',error.message))));
if(data.frames.length){render();const c=data.pod.seats[0]?.deck.commanders[0];if(c&&new URLSearchParams(location.search).has('replay'))inspect({name:c.name,art:c.art.normal,typeLine:c.typeLine,cardId:'commander'},1,true);else $('inspector').replaceChildren(el('p','fine','Select any visible card to inspect it.'));}

const liveButton=button('Join live table',startLive,'join-live');document.querySelector('header').append(liveButton);
const controls=el('section','live-controls');controls.hidden=true;controls.setAttribute('aria-label','Your game decision');document.querySelector('.hand').prepend(controls);
const actionDock=el('div','action-dock');sidebar.prepend(actionDock);
const prompt=el('p'),decisionArt=el('div','decision-art'),options=el('div','live-options'),buttons=el('div','live-buttons');controls.append(prompt,decisionArt,options,buttons);
function mountControls(){const host=$('focus').open&&$('focus').dataset.seat==='0'?$('focus-hand'):matchMedia('(min-width:1201px)').matches?actionDock:document.querySelector('.hand');if(host&&controls.parentElement!==host)host.prepend(controls);}
window.addEventListener('resize',mountControls);
function drawStepCard(){const q=live?.ui.choice;if(q?.mode==='draw')gameAction({kind:'answer',choiceId:q.id,indices:[]});else notifyAction(frame()?.phase==='DRAW'?'This draw step has already been handled by the engine.':'Your library can be drawn from when your draw-step draw is pending.');}
async function gameAction(action,guard){
  if(actionBusy||!live)return false;actionBusy=true;
  try{if(!gameToken)gameToken=(await fetch('/api/setup').then(r=>r.json())).token;
    const freshResponse=await fetch('/api/game-view'),fresh=await freshResponse.json();if(!freshResponse.ok)throw Error(fresh.error);live=fresh;
    if(guard&&!guard(fresh))return false;
    const response=await fetch('/api/game-action',{method:'POST',headers:{'Content-Type':'application/json','X-Commander-Token':gameToken},body:JSON.stringify({...action,revision:fresh.revision,actionId:crypto.randomUUID()})});
    const result=await response.json();if(!response.ok)throw Error(result.error);return true;
  }catch(error){notifyAction(error.message);return false;}finally{actionBusy=false;if(livePolling)setTimeout(()=>refreshLiveView().catch(error=>notifyAction(error.message)),50);}
}
function renderDecision(){
  mountControls();controls.hidden=false;const ui=live.ui;
  if(ui.ok==='Auto'&&/pay mana cost/i.test(ui.prompt)&&ui.choice?.title==='Select Mana to Produce'){
    const q=ui.choice,symbols={WHITE:'W',BLUE:'U',BLACK:'B',RED:'R',GREEN:'G',COLORLESS:'C'},cost=ui.prompt.match(/Pay Mana Cost:\s*([^\n]+)/i)?.[1]||'',counts=manaStatus?.(humanPlayer(),frame().players).counts;
    const optionsByNeed=q.options.filter(o=>symbols[o.label]&&cost.includes('{'+symbols[o.label]+'}')).sort((a,b)=>(counts?.[symbols[a.label]]?.untapped??0)-(counts?.[symbols[b.label]]?.untapped??0));
    const choice=optionsByNeed[0]||q.options.find(o=>o.label==='COLORLESS')||q.options[0];
    if(choice&&!actionBusy){prompt.textContent='Choosing mana for the unpaid cost…';options.replaceChildren();buttons.replaceChildren();closeCardMenu();gameAction({kind:'answer',choiceId:q.id,indices:[choice.index]},fresh=>fresh.ui.choice?.id===q.id);return;}
  }
  if(yieldTurn!==frame().turn)yieldTurn=null;
  const ordinaryPriority=!ui.choice&&!ui.nativeFallback&&ui.ok==='OK'&&ui.okEnabled&&/^Priority:/m.test(ui.prompt);
  const opponentTurn=turnPlayer()&&turnPlayer().playerId!==0;
  const safeToContinue=ordinaryPriority&&hasPriority()&&opponentTurn&&frame().stackSize===0&&(yieldTurn===frame().turn||!['END_OF_TURN','CLEANUP'].includes(frame().phase));
  if(safeToContinue){
    prompt.textContent='Following '+turnPlayer().name+'’s turn…';options.replaceChildren();buttons.replaceChildren();decisionArt.replaceChildren();lastDecision='';
    if(!actionBusy){const turn=frame().turn;gameAction({kind:'ok'},fresh=>fresh.state.turn===turn&&fresh.state.turnPlayerId!==0&&fresh.state.priorityPlayerId===0&&fresh.state.stackSize===0&&!fresh.ui.choice&&!fresh.ui.nativeFallback&&fresh.ui.ok==='OK'&&fresh.ui.okEnabled);}
    return;
  }
  // An active cost-payment input already represents an explicitly requested cast/activation.
  // This also resumes payment after a reload. Never activate sources at ordinary priority.
  const paying=ui.ok==='Auto'&&!ui.choice&&!ui.nativeFallback&&/pay mana cost/i.test(ui.prompt);
  if(!paying){paymentAttempt=null;paymentNotice='';}
  if(paying&&ui.okEnabled&&paymentAttempt!==ui.prompt&&!actionBusy){
    const payment=ui.prompt;paymentAttempt=payment;
    gameAction({kind:'ok'},fresh=>fresh.ui.ok==='Auto'&&fresh.ui.okEnabled&&!fresh.ui.choice&&!fresh.ui.nativeFallback&&fresh.ui.prompt===payment).then(ok=>{if(!ok)paymentAttempt=null;});
  }
  if(paying&&!ui.okEnabled&&paymentNotice!==ui.prompt){
    paymentNotice=ui.prompt;notifyAction('Cannot pay '+(ui.prompt.match(/Pay Mana Cost:\s*([^\n]+)/i)?.[1]||'this cost')+' automatically with currently usable mana sources. Cancel to return the card, or use an available mana ability.');
  }
  if(paying&&ui.okEnabled){
    prompt.textContent='Paying mana…';decisionArt.replaceChildren();options.replaceChildren();buttons.replaceChildren();lastDecision='';return;
  }
  const decisionKey=JSON.stringify([ui,frame()?.stackSize,pendingPlay?.cardId]);if(decisionKey===lastDecision)return;lastDecision=decisionKey;
  const priority=/^Priority:/m.test(ui.prompt);
  prompt.textContent=ui.nativeFallback||ui.choice?.title||(priority?(hasPriority()?(turnPlayer()?.playerId===0?'Your action · play a card or use a board ability.':'You may respond before play continues.'):'Waiting for the active player…'):ui.prompt);
  buttons.replaceChildren();decisionArt.replaceChildren();
  if(ui.choice){const q=ui.choice;
    if(q.title==='Choose an ability'&&cardMenu){const choices=cardMenu.querySelector('.quick-ability-options');choices.replaceChildren(...q.options.map(option=>button(option.label,()=>{closeCardMenu();gameAction({kind:'answer',choiceId:q.id,indices:[option.index]});},'ability-option')));}
    const card=frame().players.flatMap(p=>Object.values(p.zones).flatMap(z=>z.cards)).find(c=>c.cardId===(q.cardId??selectedCardId));
    if(card?.art){const img=el('img');img.src=card.art;img.alt=card.name;decisionArt.append(img);}
    // Compatibility with running adapters: Forge takes a sole offered ability for browser card selections.
    if(q.title==='Choose an ability'&&q.options.length===1&&q.autoSelect!==false){
      options.replaceChildren();prompt.textContent='Playing your card…';gameAction({kind:'answer',choiceId:q.id,indices:[q.options[0].index]}).then(ok=>{if(!ok)lastDecision='';});return;
    }
    if(choiceId!==q.id){choiceId=q.id;options.replaceChildren();
      if(q.mode==='draw')options.append(button('Draw card',drawStepCard,'primary-action'));
      else if(q.mode==='integer'){const n=el('input');n.type='number';n.min=q.min;n.max=q.max;n.value=q.min;n.id='choice-number';n.setAttribute('aria-label',q.title);options.append(n);}
      else if(['one','boolean','index'].includes(q.mode))for(const option of q.options)options.append(button(option.label,()=>gameAction({kind:'answer',choiceId:q.id,indices:[option.index]}),'ability-option'));
      else for(const option of q.options){const label=el('label','choice-option'),input=el('input');input.type='checkbox';input.name='game-choice';input.value=option.index;if(q.mode!=='ack')label.append(input);label.append(el('span','',option.label));options.append(label);}
    }
    if(q.mode==='integer')buttons.append(button('Apply amount',()=>gameAction({kind:'answer',choiceId:q.id,value:Number($('choice-number').value)})));
    else if(q.mode==='ack')buttons.append(button('Continue',()=>gameAction({kind:'answer',choiceId:q.id,indices:[]})));
    else if(q.mode==='many')buttons.append(button('Done selecting',()=>gameAction({kind:'answer',choiceId:q.id,indices:[...options.querySelectorAll('input:checked')].map(n=>Number(n.value))})));
    else if(q.min===0&&q.mode!=='draw')buttons.append(button('Cancel',()=>gameAction({kind:'answer',choiceId:q.id,indices:[]})));
  }else{
    choiceId=null;options.replaceChildren();
    const confirm=button(priority&&ui.ok==='OK'?(turnPlayer()?.playerId===0&&frame().stackSize===0?'Continue from '+String(frame().phase).replaceAll('_',' ').toLowerCase():'Pass priority'):ui.ok||'Continue',()=>gameAction({kind:'ok'}));confirm.title=priority?'Finish acting for now and let the other players respond.':'';confirm.disabled=!ui.okEnabled||!!ui.nativeFallback;buttons.append(confirm);
    if(ui.cancelEnabled){const yielding=priority&&ui.cancel==='End Turn'&&turnPlayer()?.playerId!==0;const cancel=button(priority&&ui.cancel==='End Turn'?(turnPlayer()?.playerId===0?'End my turn':'Yield through this turn'):ui.cancel||'Cancel',()=>{if(yielding){yieldTurn=frame().turn;gameAction({kind:'ok'});}else gameAction({kind:'cancel'});});cancel.title=yielding?'Skip empty stops this turn. Spells, abilities and required choices still allow a response.':'';cancel.disabled=!!ui.nativeFallback;buttons.append(cancel);}
    if(ui.selectables.length)buttons.append(el('span','fine','Select highlighted cards on the playmat.'));
    // Player selection belongs to an explicit target/defender prompt, never ordinary priority.
    const startingPlayer=/who would you like to start|starting player|start this game/i.test(ui.prompt);
    if(!priority&&(startingPlayer||(/select|choose|target|attack/i.test(ui.prompt)&&/player|opponent|defend/i.test(ui.prompt))))for(const p of frame().players.filter(p=>p.health.status!=='out'))buttons.append(button((startingPlayer?'Start with ':'Target ')+names[p.playerId],()=>gameAction({kind:'player',targetId:p.playerId})));
  }
}
async function startLive(){if(livePolling)return;livePolling=true;liveButton.disabled=true;await pollLive();}
async function refreshLiveView(){
  const response=await fetch('/api/game-view');const value=await response.json();if(!response.ok)throw Error(value.error);
    if(value.state?.players?.length){
      if(appliedMatch===value.matchId&&value.revision<appliedRevision)return;
      if(appliedMatch&&appliedMatch!==value.matchId){pendingCasts.clear();pendingPlay=null;}
      appliedMatch=value.matchId;appliedRevision=value.revision;live=value;data.pod=value.pod;for(const p of value.state.players)names[p.playerId]=p.playerId===0?`You · ${p.name}`:p.name;
      updatePendingCasts();
      document.body.classList.add('online-live');document.body.dataset.seats=value.state.players.length;document.querySelector('.preview').textContent='LIVE TABLE · LOCAL AI';document.querySelector('.scrubber').hidden=true;
      const key=JSON.stringify([value.state,value.ui.selectables,value.ui.prompt,[...pendingCasts.values()].map(c=>[c.cardId,c.stage])]);if(key!==lastState&&draggingCard===null&&!resizingBoard){lastState=key;for(const id of [0,1,2,3])$(`seat-${id}`).hidden=!value.state.players.some(p=>p.playerId===id);render();if($('focus').open)focusBoard(frame().players.find(p=>p.playerId===Number($('focus').dataset.seat)));}
      renderDecision();renderHistory();if(trackerTab==='tracker')renderTracker();liveButton.textContent='Live table connected';if(Date.now()>noticeUntil)$('notice').textContent='Drag from hand to play. Select your card for actions; inspect for a larger view. History records public activity.';
    }
}
async function pollLive(){
  if(!livePolling)return;
  try{await refreshLiveView();
  }catch(error){$('notice').textContent=error.message;liveButton.disabled=false;livePolling=false;return;}
  setTimeout(pollLive,pendingCasts.size?250:750);
}
window.addEventListener('crankmagic-game-ready',()=>{document.body.classList.remove('setup-screen');$('game-setup').close();if(window.parent!==window)window.parent.postMessage({type:'crankmagic-live'},location.origin);reportCanvasSize();startLive();});
if(new URLSearchParams(location.search).has('embedded')){document.body.classList.add('embedded');const heading=el('strong','embedded-title','CrankMagic Online'),sidebar=button('☰ Sidebar',()=>window.parent.postMessage({type:'crankmagic-sidebar'},location.origin)),editor=button('Deck editor',()=>window.parent.postMessage({type:'crankmagic-exit'},location.origin));document.querySelector('header').prepend(heading,sidebar,editor);}
if(!new URLSearchParams(location.search).has('replay')){document.body.classList.add('setup-screen');await openGameSetup();}
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==window.parent||window.parent===window)return;if(event.data?.type==='crankmagic-setup')openGameSetup(event.data.imported).catch(error=>{$('notice').textContent=error.message;});});
