/* THE PULL SHEET: one deck, grouped by where its cards are sitting right now.
 *
 * The deck page is organized by what the list asks for; the Collection by copy. Neither
 * answers the question at the table, which is "go and get these": the ones on the bench,
 * the ones in another deck's box, and the ones in this box that no longer belong. So this
 * is the deck's reserved copies cut by location -- colour, then name inside each group,
 * the way a binder is walked -- with a tick per row that records the walk as it happens.
 *
 * A tick is one `place`: the lot moves into the box, the model recomputes readiness, and
 * the row stays where it was, greyed, so a reader looking down at the cards does not lose
 * their place on the screen. Done rows are remembered only for this sitting; leave the
 * page and the sheet is simply what is left. Print gets black on white with boxes to tick.
 *
 * Reads readiness from collection-model.js (inBox, pullFromBench, pullFromOtherBox,
 * remove) and commits through the same commands the Collection uses. */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,esc:e,button:b,note,commit,go,actions,views,$}=C;
const PILE=['White','Blue','Black','Red','Green','Multiple','Colorless'],NAME={W:'White',U:'Blue',B:'Black',R:'Red',G:'Green'};
const pile=c=>{const ci=c.colorIdentity||[];return ci.length===0?'Colorless':ci.length>1?'Multiple':NAME[ci[0]]||'Colorless';};
const order=(a,b)=>PILE.indexOf(pile(a.card))-PILE.indexOf(pile(b.card))||a.card.name.localeCompare(b.card.name);
/* This sitting's ticks, per deck: lot id -> the row as it read when it was ticked. */
let done={deckId:'',rows:new Map()};
window.addEventListener('hashchange',()=>{if(C.route().view!=='pull')done={deckId:'',rows:new Map()};});
function sheet(d){
  const s=C.state,main=new Set(d.slots.filter(r=>r.purpose==='main').map(r=>r.id));
  const reserved=s.lots.filter(l=>l.source==='owned'&&l.allocation?.deckId===d.id&&main.has(l.allocation.slotId));
  const row=(l,group)=>({lotId:l.id,cardId:l.cardId,card:s.cards[l.cardId],quantity:l.quantity,group,box:l.location?.box||'',fromDeck:l.location?.kind==='deck'?M.deck(s,l.location.deckId):null});
  const groups={bench:[],other:[],remove:[]};
  for(const l of reserved){if(l.location?.kind==='deck'&&l.location.deckId===d.id)continue;if(l.location?.kind==='deck')groups.other.push(row(l,'other'));else groups.bench.push(row(l,'bench'));}
  for(const l of s.lots.filter(l=>l.source==='owned'&&l.location?.kind==='deck'&&l.location.deckId===d.id&&l.allocation?.deckId!==d.id))groups.remove.push(row(l,'remove'));
  /* Rows ticked this sitting stay in their group, greyed, at their old place in the order. */
  if(done.deckId===d.id)for(const r of done.rows.values()){if(!groups[r.group].some(x=>x.lotId===r.lotId))groups[r.group].push({...r,done:true});}
  for(const k of Object.keys(groups))groups[k].sort(order);
  const waiting={ordered:s.lots.filter(l=>(l.source==='ordered'||l.source==='incoming')&&l.allocation?.deckId===d.id&&main.has(l.allocation.slotId)).reduce((n,l)=>n+l.quantity,0),toBuy:M.readiness(s,d).toBuy};
  return {groups,waiting};
}
const GROUPS=[['bench','Pull from bench',r=>C.pill(`Bench${r.box?' · '+e(r.box):''}`,'pull'),'In box','place'],['other','Move from another box',r=>C.pill(`${e(r.fromDeck?r.fromDeck.name:'Another')} box`,'pull'),'Move here','place'],['remove','Remove from this box',()=>C.pill('Remove → bench','remove'),'To bench','bench']];
const live=rows=>rows.filter(r=>!r.done);
function rowHTML(r,[,,where,label,op]){const n=live([r]).length?r.quantity:0;
  return `<li class="cm-pull-row${r.done?' is-done':''}" data-lot="${e(r.lotId)}"><label class="cm-pull-tick"><input type="checkbox" data-pull-tick="${e(r.lotId)}" data-op="${op}" ${r.done?'checked disabled':''} aria-label="Found ${e(r.card.name)}"></label><span class="cm-pull-color">${C.colors(r.card.colorIdentity)}</span><button type="button" class="cm-card-name cm-pull-name" data-action="card" data-card="${e(r.cardId)}">${e(r.card.name)}${r.quantity>1?` <em>×${r.quantity}</em>`:''}</button><span class="cm-pull-where">${where(r)}</span>${r.done?'<span class="cm-pull-done">Done</span>':`<button type="button" class="v-button compact" data-action="pull-one" data-lot="${e(r.lotId)}" data-op="${op}">${label}</button>`}</li>`;}
views.pull=async params=>{const d=M.deck(C.state,params.get('deck')||'');if(done.deckId!==d.id)done={deckId:d.id,rows:new Map()};
  const {groups,waiting}=sheet(d),r=M.readiness(C.state,d),left=Object.values(groups).reduce((n,g)=>n+live(g).reduce((k,x)=>k+x.quantity,0),0);
  C.main.innerHTML=`<div class="cm-pull"><header class="cm-page-head cm-pull-head"><div><div class="v-eyebrow cm-eyebrow-warm">Pull sheet</div><h1>${e(d.name)}</h1><p class="cm-pull-counts"><span>${r.inBox} in box</span> · <span>${live(groups.bench).reduce((n,x)=>n+x.quantity,0)} from bench</span> · <span>${live(groups.other).reduce((n,x)=>n+x.quantity,0)} from other boxes</span> · <span>${live(groups.remove).reduce((n,x)=>n+x.quantity,0)} to remove</span> · <span>${waiting.ordered} ordered</span> · <span>${waiting.toBuy} to buy</span></p></div><div class="cm-actions">${b('Open deck','deck',{deck:d.id})}${b('Print','pull-print')}${b('Export','pull-export',{deck:d.id})}${left?b('Mark all found in box','pull-all',{deck:d.id},true):''}</div></header>`
    +(left||Object.values(groups).some(g=>g.length)?'':note('Nothing to pull: every owned copy reserved to this deck is in its box.'))
    +GROUPS.map(g=>{const rows=groups[g[0]];if(!rows.length)return '';const n=live(rows).reduce((k,x)=>k+x.quantity,0);return `<section class="cm-pull-group" data-group="${g[0]}"><h2>${e(g[1])} <span class="cm-pull-n">${n}</span></h2><ul class="cm-pull-list">${rows.map(x=>rowHTML(x,g)).join('')}</ul></section>`;}).join('')
    +`<section class="cm-pull-group cm-pull-waiting"><h2>Waiting</h2><p>${waiting.ordered} ordered or incoming · ${waiting.toBuy} to buy. ${b('Buy list for this deck','deck-buy-list',{deck:d.id})}</p></section></div>`;
  $('.cm-pull').addEventListener('change',ev=>{const tick=ev.target.closest('[data-pull-tick]');if(!tick||!tick.checked)return;tick.disabled=true;one(d,tick.dataset.pullTick,tick.dataset.op).catch(err=>{tick.checked=false;tick.disabled=false;C.notice(err.message,true);});});
};
/* One tick, one lot, one revision. The row is remembered before the commit so it can be
   drawn greyed in its old place after the page re-renders. */
async function one(d,lotId,op){const l=M.lot(C.state,lotId),{groups}=sheet(d),row=Object.values(groups).flat().find(x=>x.lotId===lotId);if(row)done.rows.set(lotId,{...row,done:false});
  await commit(op==='bench'?{type:'place',lotId,quantity:l.quantity,confirmed:true}:{type:'place',lotId,deckId:d.id,quantity:l.quantity,confirmed:true});}
actions['pull-one']=el=>{const d=M.deck(C.state,C.route().params.get('deck'));return one(d,el.dataset.lot,el.dataset.op);};
actions['pull-all']=el=>{const d=M.deck(C.state,el.dataset.deck),{groups}=sheet(d),into=[...live(groups.bench),...live(groups.other)].map(x=>x.lotId),out=live(groups.remove).map(x=>x.lotId);
  if(!into.length&&!out.length)throw Error('Nothing left to pull.');
  const commands=[];if(into.length)commands.push({type:'bulk',op:'place',deckId:d.id,lotIds:into,confirmed:true});if(out.length)commands.push({type:'bulk',op:'bench',lotIds:out,confirmed:true});
  for(const x of [...live(groups.bench),...live(groups.other),...live(groups.remove)])done.rows.set(x.lotId,{...x,done:false});
  C.review(`Mark all found in ${d.name}’s box`,note(`${into.length} record${into.length===1?'':'s'} go into the box${out.length?` and ${out.length} come out to the bench`:''}. Reservations do not change; this records where the cards are.`),commands.length===1?commands[0]:{type:'batch',commands,summary:`Assembled ${d.name}: ${into.length} in, ${out.length} out`});};
actions['pull-print']=()=>print();
actions['pull-export']=el=>{const d=M.deck(C.state,el.dataset.deck),{groups}=sheet(d);const rows=GROUPS.flatMap(g=>live(groups[g[0]]).map(x=>({group:g[1],name:x.card.name,color:pile(x.card),quantity:x.quantity,from:x.fromDeck?x.fromDeck.name+' box':x.box?'Bench · '+x.box:'Bench',action:g[3]})));
  C.download(d.name.replace(/[^\w-]+/g,'-')+'-pull-sheet.csv',C.E.csv(rows,[['group','Group'],['name','Card'],['color','Color'],['quantity','Copies'],['from','Where it is'],['action','Do']].map(([key,label])=>({key,label}))),'text/csv');};
});
