/* MAKE THE CHANGE (Rob, 14 September): the Change List for one physical deck -- what to pull
 * from the box and what to put in, as a checklist of "Remove this card → Put this card in"
 * rows, with the box read against the mana formula and the top-level counts before and after
 * so an irrational deck is warned about before a card moves.
 *
 * The rows come from crankmagic-change.js (pure; held to the live library in Node) over the
 * same projection and readiness the Cards page and the deck page read. A tick is one
 * revision through the commands the Collection uses -- the copy coming out goes to the
 * Bench, the copy going in is placed in this deck -- so Undo takes it back and every other
 * view agrees. Rows waiting on an order or the buy list are listed but cannot be ticked;
 * they say what they wait for. Done rows stay on the sheet for the sitting, greyed, first,
 * so a reader looking down at the cards keeps their place.
 *
 * Three readings above the list: the box now, after what can be done now, after everything
 * arrives -- and the list as written, which is what the box is becoming. Each reads Cards,
 * Lands against what the formula asks, Ramp, Draw, Removal, Wipes and Game Changers against
 * the floors in crankmagic-rules.js; a reading that breaks one says so in amber.
 *
 * Export writes the same rows and readings as an Excel workbook (two sheets) through the
 * writer the library export uses; Print gets black on white with boxes to tick. */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,esc:e,button:b,note,commit,go,actions,views,$}=C;
const CH=()=>globalThis.CrankChange,MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const deckName=id=>{const d=C.state.decks.find(x=>x.id===id);return d?d.name:'another deck';};
const opts=()=>({M,cardOf:C.card,rules:globalThis.CrankRules||{},classify:globalThis.MtgCardClassify?globalThis.MtgCardClassify.classify:null,deckName});
C.changePlan=d=>CH()?CH().plan(C.state,d,opts()):null;
/* This sitting's ticks, per deck: a key for the row -> the row as it read when ticked. */
let done={deckId:'',rows:new Map()};
const keyOf=r=>`${r.out?r.out.lotId+':'+r.out.cardId:''}>${r.in?(r.in.lotId||'')+':'+r.in.cardId:''}`;
window.addEventListener('hashchange',()=>{if(C.route().view!=='change')done={deckId:'',rows:new Map()};});
const say=r=>r.action==='swap'?'Remove, then put in':r.action==='remove'?'Remove':'Put in';
const cardBtn=(u,cls)=>`<button type="button" class="cm-card-name ${cls}" data-action="card" data-card="${e(u.cardId)}">${e(u.name)}</button>`;
function rowHTML(r,i){const waiting=!r.available,cls=`cm-change-row${r.done?' is-done':''}${waiting?' is-waiting':''}`;
  return `<li class="${cls}" data-row="${e(keyOf(r))}"><span class="cm-change-step">${i}</span><label class="cm-change-tick"><input type="checkbox" data-change-tick="${e(keyOf(r))}" ${r.done?'checked disabled':waiting?'disabled':''} aria-label="${e(say(r))}: ${e(r.out?r.out.name:'')}${r.out&&r.in?' → ':''}${e(r.in?r.in.name:'')}"></label><span class="cm-change-out">${r.out?`<em>Remove</em> ${cardBtn(r.out,'cm-change-name')}`:'<span class="cm-muted">— nothing comes out</span>'}</span><span class="cm-change-arrow" aria-hidden="true">→</span><span class="cm-change-in">${r.in?`<em>Put in</em> ${cardBtn(r.in,'cm-change-name')} ${C.pill(e(r.in.where),waiting?'ordered':'pull')}`:'<span class="cm-muted">— nothing goes in</span>'}</span><span class="cm-change-why">${r.done?'Done':waiting?`Waiting · ${e(r.why)}`:e(r.why)}</span></li>`;}
const FIG=[['total','Cards'],['lands','Lands'],['ramp','Ramp'],['draw','Draw'],['removal','Removal'],['wipe','Wipes'],['gameChangers','Game Changers'],['avg','Avg mana value']];
function readingHTML(label,j,sub){const t=j.tally,bad=new Set(j.warnings.map(w=>w.kind)),tone=k=>bad.has(k==='wipe'?'wipe':k)?' is-warn':'';
  return `<section class="cm-change-reading${j.warnings.length?' has-warnings':''}"><h3>${e(label)}</h3>${sub?`<p class="cm-muted">${e(sub)}</p>`:''}<dl>${FIG.map(([k,l])=>`<div class="cm-change-fig${tone(k)}"><dt>${e(l)}</dt><dd>${k==='lands'?`${t.lands} <small>of ${j.land.target}</small>`:k==='total'?`${t.total} <small>of ${CH().TOTAL}</small>`:k==='gameChangers'?`${t.gameChangers} <small>of ${Number.isFinite((globalThis.CrankRules||{}).GC_LIMIT)?globalThis.CrankRules.GC_LIMIT:2}</small>`:e(String(t[k]))}</dd></div>`).join('')}</dl>${j.warnings.length?`<ul class="cm-change-warnings">${j.warnings.map(w=>`<li>${e(w.says)}</li>`).join('')}</ul>`:'<p class="cm-change-ok">Reads as a rational hundred.</p>'}</section>`;}
views.change=async params=>{const d=M.deck(C.state,params.get('deck')||'');if(!CH())throw Error('The Change List module is not loaded.');
  if(done.deckId!==d.id)done={deckId:d.id,rows:new Map()};
  /* A row ticked this sitting stays on the sheet, greyed and first, once the library no longer
     lists it; a tick whose review was cancelled is still live and draws as live. */
  const p=C.changePlan(d),keys=new Set(p.rows.map(keyOf)),finished=[...done.rows.values()].filter(r=>!keys.has(keyOf(r)));
  const rows=[...finished.map(r=>({...r,done:true})),...p.rows],doable=p.rows.filter(r=>r.available).length,waiting=p.rows.filter(r=>!r.available).length;
  const rd=p.readings,formula=rd.list.land.says;
  C.main.innerHTML=`<div class="cm-change"><header class="cm-page-head cm-change-head"><div><a class="cm-crumb" href="#decks">Decks</a><a class="cm-crumb" href="#decks?deck=${e(d.id)}">${e(d.name)}</a><h1>Make the change</h1><p class="cm-change-counts"><span>${rows.length} row${rows.length===1?'':'s'}</span> · <span>${doable} can be done now</span> · <span>${waiting} waiting on orders or the buy list</span>${p.staying.length?` · <span>${p.staying.length} substitute${p.staying.length===1?'':'s'} stay for now</span>`:''}</p></div><div class="cm-actions">${b('Open deck','deck',{deck:d.id})}${b('Ready to add','deck-pull',{deck:d.id})}${b('Export Excel','change-export',{deck:d.id})}${b('Print','change-print')}${doable?b(`Do all available (${doable})`,'change-all',{deck:d.id},true):''}${C.helpButton('change')}</div></header>`
    +`<section class="cm-change-readings" aria-label="The box before and after"><p class="cm-change-formula">${e(`The formula: ${formula}.`)}</p><div class="cm-change-reading-grid">${readingHTML('The box now',rd.now,`${p.readiness.sleeved} sleeved`)}${readingHTML('After what can be done now',rd.afterNow,`${doable} row${doable===1?'':'s'}`)}${readingHTML('After everything arrives',rd.afterAll,`${waiting} more`)}${readingHTML('The list as written',rd.list,'what the box is becoming')}</div></section>`
    +(rows.length?`<ol class="cm-change-list">${rows.map((r,i)=>rowHTML(r,i+1)).join('')}</ol>`:note('Nothing to change: the physical deck already holds what the list calls for, and nothing it still needs is in hand.'))
    +(p.staying.length?`<section class="cm-change-staying"><h2>Substitutes that stay for now <span class="cm-change-n">${p.staying.length}</span></h2><p class="cm-muted">Each fills a seat until the card it stands in for arrives; nothing on the way is paired with it yet.</p><ul>${p.staying.map(u=>`<li>${cardBtn(u,'cm-change-name')} <span class="cm-muted">— ${e(u.why)}</span></li>`).join('')}</ul></section>`:'')
    +`</div>`;
  $('.cm-change').addEventListener('change',ev=>{const tick=ev.target.closest('[data-change-tick]');if(!tick||!tick.checked)return;tick.disabled=true;one(d,tick.dataset.changeTick).catch(err=>{tick.checked=false;tick.disabled=false;C.notice(err.message,true);});});
};
/* One row, one revision: the copy coming out goes to the Bench, the copy going in is placed
   in this deck; a swap is both in one batch, so one Undo takes the whole row back. */
const commandsFor=(d,r)=>{const out=[];if(r.out)out.push({type:'place',lotId:r.out.lotId,quantity:r.out.quantity,confirmed:true});if(r.in&&r.in.lotId)out.push({type:'place',lotId:r.in.lotId,deckId:d.id,quantity:r.in.quantity,...(r.in.slotId?{slotId:r.in.slotId}:{}),confirmed:true});return out;};
const batch=(commands,summary)=>commands.length===1?commands[0]:{type:'batch',commands,summary};
async function one(d,key){const p=C.changePlan(d),r=p.rows.find(x=>keyOf(x)===key);if(!r)throw Error('That row is no longer on the list; the library changed.');if(!r.available)throw Error(`Waiting: ${r.why}.`);
  const commands=commandsFor(d,r);if(!commands.length)throw Error('Nothing to move on this row.');
  done.rows.set(key,{...r,done:false});
  await commit(batch(commands,`${say(r)}: ${r.out?r.out.name:''}${r.out&&r.in?' → ':''}${r.in?r.in.name:''} (${d.name})`));}
actions['deck-change']=el=>go('change',{deck:el.dataset.deck});
actions['change-print']=()=>print();
actions['change-all']=el=>{const d=M.deck(C.state,el.dataset.deck),p=C.changePlan(d),rows=p.rows.filter(r=>r.available&&!done.rows.has(keyOf(r)));if(!rows.length)throw Error('Nothing can be done now.');
  const commands=rows.flatMap(r=>commandsFor(d,r)),outs=rows.filter(r=>r.out).length,ins=rows.filter(r=>r.in&&r.in.lotId).length;
  for(const r of rows)done.rows.set(keyOf(r),{...r,done:false});
  C.review(`Make the change in ${d.name}`,note(`${outs} cop${outs===1?'y comes':'ies come'} out to the Bench and ${ins} go${ins===1?'es':''} into the physical deck. Reservations do not change; this records where the cards are. Rows waiting on orders or the buy list stay on the list.`),{type:'batch',commands,summary:`Made the change in ${d.name}: ${ins} in, ${outs} out`});};
actions['change-export']=el=>{const d=M.deck(C.state,el.dataset.deck),p=C.changePlan(d);if(!globalThis.MtgXlsxWriter)throw Error('The Excel writer is not loaded.');
  C.download(d.name.replace(/[^\w-]+/g,'-')+'-change-list.xlsx',MtgXlsxWriter.build(CH().sheets(p)),MIME);C.notice(`Change list exported: ${p.rows.length} rows and four readings.`);};
C.HELP.change={title:'Make the change',body:`<p>The change list for one physical deck: what to pull from the box and what to put in, one physical swap per row. <strong>Remove this card</strong> is a substitute the list does not call for; <strong>Put this card in</strong> is a copy the list reserved that is sitting on the Bench or in another deck’s box. A row you can do now has a tick; a row waiting on an order or the buy list says so and cannot be ticked until the card lands.</p><p>A tick is one change to the library — the copy coming out goes to the Bench, the copy going in is placed here — so Undo takes it back and every other view agrees. <strong>Do all available</strong> makes every ready row in one change.</p><p>The four readings hold the box to the mana formula (start at 38 lands and sub one out for every two cheap ramp pieces, never below 33; one back for a high curve) and to the floors the rules keep (removal, wipes, ramp, draw, Game Changers), before and after. A reading in amber names what is off. <strong>Export Excel</strong> writes the rows and the readings as a workbook; <strong>Print</strong> gives boxes to tick.</p>`};
});
