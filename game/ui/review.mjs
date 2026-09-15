const $=id=>document.getElementById(id);
const data=await fetch('/match.json').then(r=>{if(!r.ok) throw new Error('No local replay found');return r.json();});
const names=['You · Chulane','Krenko','Atraxa','Shadrix'];
const levels=new Map([[1,3],[2,3],[3,3]]);
let index=Math.max(0,data.frames.findIndex(f=>f.turn>=18 && f.phase==='MAIN1'));
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function button(text,fn,cls){const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;}
function frame(){return data.frames[index];}
function groups(cards){
  const m=new Map();
  for(const c of cards){const key=JSON.stringify([c.name,c.tapped,c.counters,c.power,c.toughness,c.damage,c.owner,c.controller,c.faceDown,c.art]);if(m.has(key))m.get(key).count++;else m.set(key,{card:c,count:1});}
  return [...m.values()];
}
function cardButton(c,count=1){
  const b=button('',()=>inspect(c,count),'card'+(c.tapped?' tapped':''));b.setAttribute('aria-label',`${c.name||'Face-down card'}${count>1?`, ${count} copies`:''}${c.tapped?', tapped':''}`);
  const fallback=()=>{const box=el('span','fallback');box.append(el('strong','',c.name||'Face-down card'),el('b','',c.token?'✦':'◇'),el('small','',c.token?'TOKEN':'Card image unavailable'));b.replaceChildren(box);};
  if(c.art){const image=el('img');image.src=c.art;image.alt=c.name||'Face-down card';image.loading='lazy';image.addEventListener('error',fallback,{once:true});b.append(image);}else fallback();
  if(count>1)b.append(el('span','count','×'+count));
  if(c.typeLine?.includes('Creature')||c.token)b.append(el('span','badge',`${c.power??'?'}/${c.toughness??'?'}`));
  return b;
}
function inspect(c,count=1,initial=false){
  const box=$('inspector');box.replaceChildren();
  if(c.art){const img=el('img');img.src=c.art;img.alt=c.name;box.append(img);}
  box.append(el('h3','',c.name||'Face-down card'));
  if(c.typeLine)box.append(el('p','',c.typeLine));
  box.append(el('p','',`${count>1?`${count} permanents with matching recorded attributes shown together. `:''}${c.tapped?'Tapped. ':''}${c.damage?`${c.damage} damage marked. `:''}Card instance ${c.cardId??'commander'}.`));
  box.append(el('p','',c.art?'Actual card printing. Rules state comes from the engine.':'This preview has no cached artwork for this token or card.'));
  if(!initial && ($('detail').open||matchMedia('(max-width:940px)').matches)) {
    $('card-detail-body').replaceChildren(...[...box.children].map(n=>n.cloneNode(true)));
    $('card-detail').showModal();
  }
}
function showDialog(title,body){$('detail').classList.remove('mat-dialog');$('detail-title').textContent=title;$('detail-body').replaceChildren(body);if(!$('detail').open)$('detail').showModal();}
function zoneView(p,zone){const body=el('div');const z=p.zones[zone];body.append(el('p','fine',`${z.count} cards · recorded turn ${frame().turn}`));const cards=el('div','cards');for(const {card,count} of groups(z.cards))cards.append(cardButton(card,count));if(!z.cards.length)cards.append(el('p','empty','This zone has no visible cards.'));body.append(cards);showDialog(`${names[p.playerId]} · ${zone}`,body);}
function matView(p){
  const mat=el('div',`player-mat${p.playerId===0?' personal-mat':' plain-mat'}`);
  mat.setAttribute('aria-label',`${names[p.playerId]} playmat`);
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
  for(const [zone,label,cls] of [['Command','Command zone','mat-command'],['Exile','Exile','mat-exile'],['Library','Library','mat-library'],['Graveyard','Graveyard','mat-graveyard']]) {
    const z=p.zones[zone],face=zone==='Command'?z.cards[0]:z.cards.at(-1),pile=button('',()=>{
      if(zone==='Library') {const body=el('p','fine',`${z.count} cards remain. Library order and the top card are hidden.`);showDialog(`${names[p.playerId]} · Library`,body);}
      else zoneView(p,zone);
    },`mat-pile ${cls}`);
    pile.setAttribute('aria-label',`${names[p.playerId]} ${label}, ${z.count} cards`);
    if(zone==='Library'&&z.count) {const back=el('span','library-back');back.append(el('span','','✦'));pile.append(back);}
    else if(face?.art) {const art=el('img');art.src=face.art;art.alt=face.name;art.loading='lazy';pile.append(art);}
    else pile.append(el('span','pile-empty',z.count?'◇':'—'));
    pile.append(el('span','pile-count',z.count),el('span','mat-zone-label',label));mat.append(pile);
  }
  return mat;
}
function renderSeat(p){
  const box=$(`seat-${p.playerId}`);box.replaceChildren();
  const head=el('div','seat-heading');const title=el('div');title.append(el('div','seat-label',p.playerId===0?'YOUR DECK · RECORDED NATIVE PILOT':'AI OPPONENT · NATIVE PROBE'),el('div','seat-title',names[p.playerId]));
  head.append(title,el('span','seat-hand-count',`Hand ${p.zones.Hand.count}`),button('Focus mat',()=>{showDialog(`${names[p.playerId]} · playmat`,matView(p));$('detail').classList.add('mat-dialog');}));box.append(head,matView(p));
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
    const p=frame().players.find(p=>p.playerId===id),h=p.health;
    const b=button('',()=>showHealth(p),`counter-tile tone-${id}${h.status==='out'?' out':''}`);
    b.setAttribute('aria-label',`${names[id]} life ${h.life}, poison ${h.poison} of 10, commander damage ${h.commanderDamageMax} of 21`);
    b.append(el('span','who',names[id]),el('strong','life',h.life));const sub=el('span','subtotals');sub.append(el('span','',`☣ ${h.poison}/10`),el('span','',`CMD ${h.commanderDamageMax}/21`));b.append(sub);
    if(h.status==='out')b.append(el('span','out-label','OUT'));counter.append(b);
  }
}
function logText(e){const f=e.fields;switch(e.kind){case'GameEventSpellAbilityCast':return f.sa?.description||f.sa?.host?.name||'Spell or ability put on stack';case'GameEventSpellResolved':return `${f.spell?.host?.name||'Ability'} resolved${f.hasFizzled?' without effect':''}.`;case'GameEventPlayerDamaged':return `${f.source?.name} dealt ${f.amount} ${f.combat?'combat ':''}${f.infect?'infect ':''}damage to ${f.target?.name}.`;case'GameEventPlayerPoisoned':return `${f.receiver?.name||f.player?.name||'Player'} received poison.`;case'GameEventLandPlayed':return `${f.player?.name} played ${f.land?.name}.`;default:return e.kind;}}
function render(){
  const f=frame();$('phase').textContent=`Turn ${f.turn} · ${f.phase.replaceAll('_',' ').toLowerCase()}`;$('position').textContent=`Recorded phase ${index+1} / ${data.frames.length}`;$('timeline').value=index;
  $('prev').disabled=index===0;$('next').disabled=index===data.frames.length-1;
  for(const p of f.players)renderSeat(p);renderCounter();const you=f.players.find(p=>p.playerId===0);$('hand').replaceChildren(...you.zones.Hand.cards.map(c=>cardButton(c)));$('hand-count').textContent=`${you.zones.Hand.count} cards`;
  const events=data.log.filter(e=>e.sequence<=f.sequence).slice(-16).reverse();$('event-count').textContent=`${data.log.length} recorded`;$('events').replaceChildren(...events.map(e=>{const row=el('div','log-row');row.append(el('small','',`TURN ${e.turn} · ${e.eventId}`),el('span','',logText(e)));return row;}));
}
$('timeline').max=data.frames.length-1;$('timeline').addEventListener('input',e=>{index=+e.target.value;render();});$('prev').addEventListener('click',()=>{index=Math.max(0,index-1);render();});$('next').addEventListener('click',()=>{index=Math.min(data.frames.length-1,index+1);render();});
$('close-detail').addEventListener('click',()=>$('detail').close());$('clear-inspect').addEventListener('click',()=>$('inspector').replaceChildren(el('p','empty','Select any visible card to inspect it.')));
$('close-card').addEventListener('click',()=>$('card-detail').close());
$('view-hand').addEventListener('click',()=>zoneView(frame().players.find(p=>p.playerId===0),'Hand'));
$('notice').textContent='Real recorded engine states · Native AI proof · Human play, API pilots and measured reports are still being built.';
$('setup').addEventListener('click',()=>{
  const body=el('div');body.append(el('p','fine','Choose the intended difficulty for each API opponent. These settings export with your pod; the recorded proof used Forge-native pilots. The API pilots are not connected yet.'));
  for(const id of [1,2,3]){const row=el('div','pilot-row');const label=el('div');label.append(el('strong','',names[id]),el('small','',data.pod.seats[id].deck.name));const select=el('select');select.setAttribute('aria-label',`${names[id]} AI difficulty`);for(const p of data.difficulties){const option=el('option','',`${p.level} · ${p.label}`);option.value=p.level;select.append(option);}select.value=levels.get(id);select.addEventListener('change',()=>levels.set(id,+select.value));row.append(label,select);body.append(row);}
  body.append(el('p','fine','1 Learner → 5 Expert increases planning effort. Every level uses the same rules and sees only its own permitted information. Reassess after each draw; take actions only at legal decision points.'));
  const actions=el('div','setup-actions');actions.append(button('Export pod settings',()=>{
    const pod=structuredClone(data.pod);for(const seat of pod.seats)seat.pilot=seat.seatId===0?{kind:'human'}:{kind:'api',difficulty:levels.get(seat.seatId)};
    const url=URL.createObjectURL(new Blob([JSON.stringify(pod,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='commander-pod-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }));body.append(actions);showDialog('Your pod · AI difficulty',body);
});
render();const c=data.pod.seats[0].deck.commanders[0];inspect({name:c.name,art:c.art.normal,typeLine:c.typeLine,cardId:'commander'},1,true);
