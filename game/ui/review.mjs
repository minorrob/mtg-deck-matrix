import {defaultPlaymat,resolvePlaymat,readMatPreferences,paintMat} from '/playmats.mjs';
import {openGameSetup} from '/setup.mjs';
import '/handoff.mjs';
const $=id=>document.getElementById(id);
const data=await fetch('/match.json').then(r=>r.ok?r.json():{frames:[],log:[],pod:{seats:[]}}).catch(()=>({frames:[],log:[],pod:{seats:[]}}));
let live=null,livePolling=false,gameToken=null,lastState='',choiceId=null,actionBusy=false,noticeUntil=0,lastDecision='';
const names=['You · Chulane','Krenko','Atraxa','Shadrix'];
const levels=new Map([[1,3],[2,3],[3,3]]);
const visibleArtwork=new Map();for(const f of data.frames)for(const p of f.players)for(const z of Object.values(p.zones))for(const c of z.cards)if(c.name&&c.art)visibleArtwork.set(c.name,c.art);
let index=Math.max(0,data.frames.findIndex(f=>f.turn>=18 && f.phase==='MAIN1'));
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function button(text,fn,cls){const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;}
function frame(){return live?.state?.players?live.state:data.frames[index];}
function handCarousel(cards,id){
  const shell=el('div','hand-carousel'),track=el('div','cards hand-track');track.id=id;track.tabIndex=0;track.setAttribute('aria-label','Your hand cards');
  const previous=button('‹',()=>move(-1),'hand-arrow'),next=button('›',()=>move(1),'hand-arrow');
  previous.setAttribute('aria-label','Scroll your hand left');next.setAttribute('aria-label','Scroll your hand right');
  previous.setAttribute('aria-controls',id);next.setAttribute('aria-controls',id);
  function move(direction){track.scrollBy({left:direction*Math.max(140,track.clientWidth*.8),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
  function update(){previous.disabled=track.scrollLeft<=1;next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;}
  track.addEventListener('scroll',update,{passive:true});track.addEventListener('keydown',e=>{if(e.target!==track)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}});
  for(const card of cards)track.append(cardButton(card));if(!cards.length)track.append(el('p','empty','Your hand is empty.'));
  shell.append(previous,track,next);requestAnimationFrame(update);
  // Observe this mounted carousel only; disconnect when its host is re-rendered.
  const observer=new ResizeObserver(()=>{if(shell.isConnected)update();});observer.observe(track);shell.dispose=()=>observer.disconnect();
  return shell;
}
function disposeCarousels(host){for(const shell of host.querySelectorAll('.hand-carousel'))shell.dispose?.();}
function deckView(){
  const deck=data.pod.seats[0].deck,body=el('div');body.append(el('p','fine',`${deck.name} · ${deck.total} cards in the starting deck. This is the saved deck list, not library order or remaining-card information.`));
  for(const [label,entries] of [['Commander',deck.commanders],['Main deck',deck.library]]){const section=el('section'),list=el('div','cards');section.append(el('h3','',label));for(const c of [...entries].sort((a,b)=>a.name.localeCompare(b.name)))list.append(cardButton({...c,deckEntry:true,art:c.art?.normal||visibleArtwork.get(c.name)},c.quantity||1));section.append(list);body.append(section);}
  showDialog('Your deck · starting list',body);
}
const pileZones=[['Command','Command zone','mat-command'],['Exile','Exile','mat-exile'],['Library','Library','mat-library'],['Graveyard','Graveyard','mat-graveyard']];
function pileButton(p,zone,label,cls){
  const z=p.zones[zone],face=zone==='Command'?z.cards[0]:z.cards.at(-1),pile=button('',()=>{
    if(zone==='Library')showDialog(`${names[p.playerId]} · Library`,el('p','fine',`${z.count} cards remain. Library order and the top card are hidden.`));else zoneView(p,zone);
  },cls);
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
  const b=button('',()=>live&&!c.deckEntry&&live.ui.selectables.includes(c.cardId)?gameAction({kind:'card',targetId:c.cardId}):inspect(c,count),'card'+(c.tapped?' tapped':''));b.setAttribute('aria-label',`${c.name||'Face-down card'}${count>1?`, ${count} copies`:''}${c.tapped?', tapped':''}`);
  const fallback=()=>{const box=el('span','fallback');box.append(el('strong','',c.name||'Face-down card'),el('b','',c.token?'✦':'◇'),el('small','',c.token?'TOKEN':'Card image unavailable'));b.replaceChildren(box);};
  if(c.art){const image=el('img');image.src=c.art;image.alt=c.name||'Face-down card';image.loading='lazy';image.addEventListener('error',fallback,{once:true});b.append(image);}else fallback();
  if(count>1)b.append(el('span','count','×'+count));
  if((c.typeLine?.includes('Creature')||c.token)&&(c.power!==undefined||c.toughness!==undefined))b.append(el('span','badge',`${c.power??'?'}/${c.toughness??'?'}`));
  if(c.counters&&Object.keys(c.counters).length){const dice=el('span','counter-dice');for(const [type,n] of Object.entries(c.counters))dice.append(el('span','die',`${type} ${n}`));b.append(dice);}
  if(live&&!c.deckEntry){
    b.draggable=true;b.addEventListener('dragstart',event=>event.dataTransfer.setData('application/x-crankmagic-card',String(c.cardId)));
    b.addEventListener('dblclick',()=>gameAction({kind:'card',targetId:c.cardId}));
    b.addEventListener('contextmenu',event=>{event.preventDefault();inspect(c,count);});
    if(live.ui.selectables.includes(c.cardId))b.classList.add('selectable');
  }
  return b;
}
function inspect(c,count=1,initial=false){
  const box=$('inspector');box.replaceChildren();
  if(c.art){const img=el('img');img.src=c.art;img.alt=c.name;box.append(img);}
  box.append(el('h3','',c.name||'Face-down card'));
  if(c.typeLine)box.append(el('p','',c.typeLine));
  box.append(el('p','',c.deckEntry?`${count} ${count===1?'copy':'copies'} in your saved starting deck. This does not indicate which cards remain in the library.`:`${count>1?`${count} permanents with matching recorded attributes shown together. `:''}${c.tapped?'Tapped. ':''}${c.damage?`${c.damage} damage marked. `:''}Card instance ${c.cardId??'commander'}.`));
  box.append(el('p','',c.art?'Actual card printing. Rules state comes from the engine.':'This preview has no cached artwork for this token or card.'));
  if(live&&!c.deckEntry&&Number.isInteger(c.cardId))box.append(button('Play / activate / select',()=>{$('card-detail').close();gameAction({kind:'card',targetId:c.cardId});},'use-card'));
  if(!initial) {
    $('card-detail-body').replaceChildren(...[...box.children].map(n=>n.cloneNode(true)));
    $('card-detail-body').querySelector('.use-card')?.addEventListener('click',()=>{$('card-detail').close();gameAction({kind:'card',targetId:c.cardId});});
    $('card-detail').showModal();
  }
}
function showDialog(title,body){$('detail').classList.remove('mat-dialog');$('detail-title').textContent=title;$('detail-body').replaceChildren(body);if(!$('detail').open)$('detail').showModal();}
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
  if(window.parent!==window)window.parent.postMessage({type:'crankmagic-focus',open:true},location.origin);
  const dialog=$('focus');dialog.className=`focus-dialog tone-${p.playerId}`;
  dialog.dataset.seat=p.playerId;paintMat(dialog,seatMat(p.playerId));
  $('focus-title').textContent=names[p.playerId];
  const status=$('focus-status');status.replaceChildren();
  const h=p.health;
  status.append(button(`${h.status==='out'?'OUT · ':''}Life ${h.life} · Poison ${h.poison}/10 · Commander ${h.commanderDamageMax}/21`,()=>showHealth(p),'focus-health'));
  status.append(el('span','',`Turn ${frame().turn} · ${frame().phase.replaceAll('_',' ').toLowerCase()}`));
  for(const zone of ['Command','Library','Graveyard','Exile'])status.append(button(`${zone} ${p.zones[zone].count}`,()=>{
    if(zone==='Library')showDialog(`${names[p.playerId]} · Library`,el('p','fine',`${p.zones.Library.count} cards remain. Library order and the top card are hidden.`));
    else zoneView(p,zone);
  },'focus-zone-link'));
  status.append(button(`Your hand ${frame().players.find(player=>player.playerId===0).zones.Hand.count}`,()=>{$('focus-hand').scrollIntoView({behavior:'instant',block:'start'});},'focus-zone-link'));
  if(p.playerId!==0)status.append(el('span','',`Opponent hand ${p.zones.Hand.count} · hidden`));
  const content=$('focus-content');disposeCarousels(content);content.replaceChildren();
  const piles=el('section','focus-piles');piles.setAttribute('aria-label',`${names[p.playerId]} zone piles`);
  for(const [zone,label] of pileZones)piles.append(pileButton(p,zone,label,'focus-pile'));
  if(p.playerId===0)piles.append(button('Browse your starting deck',deckView,'deck-list-link'));
  content.append(piles);
  const board=el('div','focus-board');board.setAttribute('aria-label',`${names[p.playerId]} grouped battlefield`);
  const empty=[];
  for(const [name,cards] of boardGroups(p.zones.Battlefield.cards)){
    if(!cards.length){empty.push(name);continue;}
    const entries=groups(cards),section=el('section',`focus-group${name==='Mana · lands'?' focus-mana':''}`);
    section.style.flexGrow=Math.min(entries.length,4);section.style.flexBasis=`calc(${Math.min(entries.length,4)} * (var(--focus-card-width) + 16px) + 24px)`;
    section.setAttribute('aria-label',name);
    const heading=el('div','focus-group-heading');heading.append(el('h3','',name),el('span','',`${cards.length} ${cards.length===1?'permanent':'permanents'}`));
    const list=el('div','cards focus-cards');for(const {card,count} of entries)list.append(cardButton(card,count));
    section.append(heading,list);board.append(section);
  }
  if(!p.zones.Battlefield.cards.length)board.append(el('p','empty',h.status==='out'?'This player has been eliminated.':'No permanents on this battlefield yet.'));
  content.append(board);
  if(empty.length)content.append(el('p','focus-empty-groups',`Empty: ${empty.join(' · ')}`));
  content.append(el('p','focus-group-note','Grouped by recorded card type. Multi-type creatures stay with creatures; other artifacts stay with artifacts. Mana rocks appear under Artifacts.'));
  const you=frame().players.find(player=>player.playerId===0),hand=el('section','focus-hand');hand.id='focus-hand';hand.setAttribute('aria-label','Your hand');
  const heading=el('div','focus-group-heading');heading.append(el('h3','','Your hand'),el('span','',`${you.zones.Hand.count} cards · visible only to you`));
  const cards=handCarousel(you.zones.Hand.cards,'focus-hand-cards');
  hand.append(heading,cards);content.append(hand);
  if(!dialog.open){dialog.showModal();content.scrollTop=0;}
}
function seatMat(id){const appearance=live?.appearance?.find(s=>s.seatId===id),preference=readMatPreferences()[id];const requested=appearance?.playmat&&(!preference||preference===appearance.playmatChoice)?appearance.playmat:preference||defaultPlaymat(id);return resolvePlaymat(requested,live?.matchId||data.pod.podHash||'preview',id);}
window.addEventListener('crankmagic-playmat',()=>{if(live||data.frames.length){render();if($('focus').open)focusBoard(frame().players.find(p=>p.playerId===Number($('focus').dataset.seat)));}});
window.addEventListener('storage',event=>{if(event.key==='crankmagic-playmats-v1')window.dispatchEvent(new Event('crankmagic-playmat'));});
function matView(p){
  const mat=el('div',`player-mat${p.playerId===0?' personal-mat':' plain-mat'}`);
  paintMat(mat,seatMat(p.playerId));
  mat.setAttribute('aria-label',`${names[p.playerId]} playmat`);
  if(live&&p.playerId===0){mat.addEventListener('dragover',e=>e.preventDefault());mat.addEventListener('drop',e=>{e.preventDefault();const raw=e.dataTransfer.getData('application/x-crankmagic-card');if(/^\d+$/.test(raw))gameAction({kind:'card',targetId:Number(raw)});});}
  const lands=p.zones.Battlefield.cards.filter(c=>c.typeLine?.split('—')[0].includes('Land'));
  const nonlands=p.zones.Battlefield.cards.filter(c=>!lands.includes(c));
  for(const [name,cls,cards] of [['Battlefield','mat-battlefield',nonlands],['Lands','mat-lands',lands]]) {
    const zone=el('section',`mat-zone ${cls}`);zone.setAttribute('aria-label',`${names[p.playerId]} ${name}`);
    const list=el('div','cards mat-cards');
    for(const {card,count} of groups(cards))list.append(cardButton(card,count));
    if(!cards.length)list.append(el('span','mat-empty',p.health?.status==='out'?'Eliminated':'Empty'));
    zone.append(list,el('span','mat-zone-label',`${name} · ${cards.length}`));mat.append(zone);
  }
  const guide=el('div','mat-turn-guide');guide.setAttribute('aria-label','Turn sequence reminder');
  for(const phase of ['1. Untap','2. Upkeep','3. Draw','4. Main phase 1','5. Combat','6. Main phase 2','7. End / cleanup'])guide.append(el('span','',phase));
  mat.append(guide);
  const life=button('',()=>showHealth(p),'mat-life');life.setAttribute('aria-label',`${names[p.playerId]} life ${p.health.life}; inspect counters`);
  life.append(el('small','','Life'),el('strong','',p.health.life));mat.append(life);
  for(const [zone,label,cls] of pileZones)mat.append(pileButton(p,zone,label,`mat-pile ${cls}`));
  return mat;
}
function renderSeat(p){
  const box=$(`seat-${p.playerId}`);box.replaceChildren();
  const head=el('div','seat-heading');const title=el('div');title.append(el('div','seat-label',live?(p.playerId===0?'YOU · HUMAN':'AI · LOCAL PILOT'):(p.playerId===0?'YOUR DECK · RECORDED NATIVE PILOT':'AI OPPONENT · NATIVE PROBE')),el('div','seat-title',names[p.playerId]));
  head.append(title,el('span','seat-hand-count',`Hand ${p.zones.Hand.count}`),button('Focus board',()=>focusBoard(p)));box.append(head,matView(p));
  if(p.mana?.length){const gems=el('div','mana-gems');gems.setAttribute('aria-label','Floating mana');for(const m of p.mana){const gem=el('span','mana-gem',m.color);gem.title=`Source ${m.sourceId}${m.restricted?' · restricted mana':''}`;gems.append(gem);}box.append(gems);}
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
function renderCounter(){
  const counter=$('counter');counter.replaceChildren();
  for(const id of [1,2,0,3]){
    const p=frame().players.find(p=>p.playerId===id);if(!p)continue;const h=p.health;
    const b=button('',()=>showHealth(p),`counter-tile tone-${id}${h.status==='out'?' out':''}`);
    b.setAttribute('aria-label',`${names[id]} life ${h.life}, poison ${h.poison} of 10, commander damage ${h.commanderDamageMax} of 21`);
    b.append(el('span','who',names[id]),el('strong','life',h.life));const sub=el('span','subtotals');sub.append(el('span','',`☣ ${h.poison}/10`),el('span','',`CMD ${h.commanderDamageMax}/21`));b.append(sub);
    if(h.status==='out')b.append(el('span','out-label','OUT'));counter.append(b);
  }
}
function logText(e){const f=e.fields;switch(e.kind){case'GameEventSpellAbilityCast':return f.sa?.description||f.sa?.host?.name||'Spell or ability put on stack';case'GameEventSpellResolved':return `${f.spell?.host?.name||'Ability'} resolved${f.hasFizzled?' without effect':''}.`;case'GameEventPlayerDamaged':return `${f.source?.name} dealt ${f.amount} ${f.combat?'combat ':''}${f.infect?'infect ':''}damage to ${f.target?.name}.`;case'GameEventPlayerPoisoned':return `${f.receiver?.name||f.player?.name||'Player'} received poison.`;case'GameEventLandPlayed':return `${f.player?.name} played ${f.land?.name}.`;default:return e.kind;}}
function render(){
  document.querySelector('.focus-eyebrow').textContent=live?'FOCUSED BOARD · LIVE GAME':'FOCUSED BOARD · REPLAY';
  const f=frame();$('phase').textContent=`Turn ${f.turn} · ${String(!f.phase||f.phase==='null'?'Setup':f.phase).replaceAll('_',' ').toLowerCase()}`;$('position').textContent=live?'Live game':`Recorded phase ${index+1} / ${data.frames.length}`;$('timeline').value=index;
  $('prev').disabled=index===0;$('next').disabled=index===data.frames.length-1;
  for(const p of f.players)renderSeat(p);renderCounter();const you=f.players.find(p=>p.playerId===0);disposeCarousels($('hand-host'));$('hand-host').replaceChildren(handCarousel(you.zones.Hand.cards,'hand'));$('hand-count').textContent=`${you.zones.Hand.count} cards`;
  const events=live?[]:data.log.filter(e=>e.sequence<=f.sequence).slice(-16).reverse();$('event-count').textContent=live?'Private journal active':`${data.log.length} recorded`;$('events').replaceChildren(...events.map(e=>{const row=el('div','log-row');row.append(el('small','',`TURN ${e.turn} · ${e.eventId}`),el('span','',logText(e)));return row;}));
}
$('timeline').max=data.frames.length-1;$('timeline').addEventListener('input',e=>{index=+e.target.value;render();});$('prev').addEventListener('click',()=>{index=Math.max(0,index-1);render();});$('next').addEventListener('click',()=>{index=Math.min(data.frames.length-1,index+1);render();});
$('close-detail').addEventListener('click',()=>$('detail').close());$('clear-inspect').addEventListener('click',()=>$('inspector').replaceChildren(el('p','empty','Select any visible card to inspect it.')));
$('close-card').addEventListener('click',()=>$('card-detail').close());
$('close-focus').addEventListener('click',()=>$('focus').close());
$('focus').addEventListener('close',()=>{if(window.parent!==window)window.parent.postMessage({type:'crankmagic-focus',open:false},location.origin);});
$('focus-size').addEventListener('input',e=>{$('focus').style.setProperty('--focus-card-width',`${e.target.value}px`);$('focus-size-value').textContent=`${e.target.value} px`;});
$('view-hand').addEventListener('click',()=>zoneView(frame().players.find(p=>p.playerId===0),'Hand'));
$('view-deck').addEventListener('click',deckView);
$('notice').textContent='Real recorded engine states · Native AI proof · Human play, API pilots and measured reports are still being built.';
$('setup').textContent='Game setup';
$('setup').addEventListener('click',()=>openGameSetup().catch(error=>showDialog('Game setup',el('p','fine',error.message))));
if(data.frames.length){render();const c=data.pod.seats[0]?.deck.commanders[0];if(c)inspect({name:c.name,art:c.art.normal,typeLine:c.typeLine,cardId:'commander'},1,true);}

const liveButton=button('Join live table',startLive,'join-live');document.querySelector('header').append(liveButton);
const controls=el('section','live-controls');controls.hidden=true;controls.setAttribute('aria-label','Your game decision');document.querySelector('.replaybar').after(controls);
const prompt=el('p'),options=el('div','live-options'),buttons=el('div','live-buttons');controls.append(prompt,options,buttons);
async function gameAction(action){
  if(actionBusy||!live)return;actionBusy=true;
  try{if(!gameToken)gameToken=(await fetch('/api/setup').then(r=>r.json())).token;
    const response=await fetch('/api/game-action',{method:'POST',headers:{'Content-Type':'application/json','X-Commander-Token':gameToken},body:JSON.stringify({...action,revision:live.revision,actionId:crypto.randomUUID()})});
    const result=await response.json();if(!response.ok)throw Error(result.error);$('notice').textContent='Action sent to the rules engine.';
  }catch(error){$('notice').textContent=error.message;noticeUntil=Date.now()+6000;}finally{actionBusy=false;}
}
function renderDecision(){
  controls.hidden=false;const ui=live.ui;const decisionKey=JSON.stringify(ui);if(decisionKey===lastDecision)return;lastDecision=decisionKey;prompt.textContent=ui.nativeFallback||ui.choice?.title||ui.prompt;
  buttons.replaceChildren();
  if(ui.choice){const q=ui.choice;
    if(choiceId!==q.id){choiceId=q.id;options.replaceChildren();
      if(q.mode==='integer'){const n=el('input');n.type='number';n.min=q.min;n.max=q.max;n.value=q.min;n.id='choice-number';n.setAttribute('aria-label',q.title);options.append(n);}
      else for(const option of q.options){const label=el('label','choice-option'),input=el('input');input.type=q.max===1?'radio':'checkbox';input.name='game-choice';input.value=option.index;if(q.mode!=='ack')label.append(input);label.append(el('span','',option.label));options.append(label);}
    }
    buttons.append(button('Confirm choice',()=>{if(q.mode==='integer')gameAction({kind:'answer',choiceId:q.id,value:Number($('choice-number').value)});else gameAction({kind:'answer',choiceId:q.id,indices:[...options.querySelectorAll('input:checked')].map(n=>Number(n.value))});}));
  }else{choiceId=null;options.replaceChildren();const confirm=button(ui.ok||'OK',()=>gameAction({kind:'ok'})),cancel=button(ui.cancel||'Cancel',()=>gameAction({kind:'cancel'}));confirm.disabled=!ui.okEnabled||!!ui.nativeFallback;cancel.disabled=!ui.cancelEnabled||!!ui.nativeFallback;buttons.append(confirm,cancel);
    if(ui.selectables.length)buttons.append(el('span','fine','Highlighted cards can be selected.'));
    buttons.append(button('Choose a player',()=>{const body=el('div','live-buttons');for(const p of frame().players)body.append(button(names[p.playerId],()=>{$('detail').close();gameAction({kind:'player',targetId:p.playerId});}));showDialog('Select a player for the current decision',body);}));
  }
}
async function startLive(){if(livePolling)return;livePolling=true;liveButton.disabled=true;await pollLive();}
async function pollLive(){
  if(!livePolling)return;
  try{const response=await fetch('/api/game-view');const value=await response.json();if(!response.ok)throw Error(value.error);
    if(value.state?.players?.length){live=value;data.pod=value.pod;for(const p of value.state.players)names[p.playerId]=p.playerId===0?`You · ${p.name}`:p.name;
      document.body.classList.add('online-live');document.body.dataset.seats=value.state.players.length;document.querySelector('.preview').textContent='LIVE TABLE · LOCAL AI';document.querySelector('.scrubber').hidden=true;
      const key=JSON.stringify([value.state,value.ui.selectables]);if(key!==lastState){lastState=key;for(const id of [0,1,2,3])$(`seat-${id}`).hidden=!value.state.players.some(p=>p.playerId===id);render();if($('focus').open)focusBoard(frame().players.find(p=>p.playerId===Number($('focus').dataset.seat)));}
      renderDecision();liveButton.textContent='Live table connected';if(Date.now()>noticeUntil)$('notice').textContent='Drag a hand card onto your mat, double-click to use it, or right-click for its action. Complex choices may open in the engine window.';
    }
  }catch(error){$('notice').textContent=error.message;liveButton.disabled=false;livePolling=false;return;}
  setTimeout(pollLive,750);
}
window.addEventListener('crankmagic-game-ready',()=>{document.body.classList.remove('setup-screen');$('game-setup').close();if(window.parent!==window)window.parent.postMessage({type:'crankmagic-live'},location.origin);startLive();});
if(new URLSearchParams(location.search).has('embedded'))document.body.classList.add('embedded');
if(!new URLSearchParams(location.search).has('replay')){document.body.classList.add('setup-screen');await openGameSetup();}
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==window.parent||window.parent===window)return;if(event.data?.type==='crankmagic-setup')openGameSetup(event.data.imported).catch(error=>{$('notice').textContent=error.message;});});
