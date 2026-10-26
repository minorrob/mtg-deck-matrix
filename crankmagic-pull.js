/* PLANNED CHANGES (Rob, 2026-10-25, C1–C8; the list once called Ready to add, reached from the deck page as before).
 *
 * One deck's changes as pairs: what to TAKE OUT OF BOX beside what to ADD TO BOX, one copy a side, from
 * crankmagic-change.js `planned` -- the model's own pairs (a Substitute and the Reserved card whose seat it holds; an
 * Upgrade and the Final it names), every Owned card that could go in, and the To Buy ones in the chain Rob set out
 * (To Buy · Not purchased > To Buy · Ordered > Owned), each saying what it is for (Final, Upgrade, Substitute, Bench).
 *
 *   C1  A tick only selects. Nothing changes until Swap.
 *   C2  Swap asks "Confirm additions and removals?" (C.review: the change previewed, then made on Confirm), one batch,
 *       one undo.
 *   C4  Two column groups; each side a tick, the card's thumbnail (its picture on a hover), its name, its colors and
 *       what it is under the name.
 *   C5  Take out says the card's role in the deck (Substitute, Final); Add the chain and the use ("To Buy - Upgrade").
 *   C6  Above: removed, added, and the deck's total after (the box now, less removed, plus added): green at exactly 100,
 *       red otherwise; a warning, never a block.
 *   C7  Any adds and any take-outs may be ticked, in any rows. An add whose own partner is not ticked is paired with a
 *       ticked take-out left over (crankmagic-change.js `pairUp`), and both wear the same colored dot.
 *   C8  Counts that do not match still swap, after the confirmation; the counter says so.
 *
 * A To Buy Final is already planned (Reserved): it is listed beside the Substitute holding its seat, and cannot be
 * ticked. Ordered cards are To Buy · Ordered here, not a separate Waiting list (Rob, 2026-10-25). */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,esc:e,button:b,note,commit,actions,views,$}=C;
const CH=()=>globalThis.CrankChange;
/* This sitting's ticks, per deck; leaving the page lets them go. */
let sel={deckId:'',in:new Set(),out:new Set()};
window.addEventListener('hashchange',()=>{if(C.route().view!=='pull')sel={deckId:'',in:new Set(),out:new Set()};});
const deckName=id=>{const d=C.state.decks.find(x=>x.id===id);return d?d.name:'another deck';};
const planOf=d=>CH().planned(C.state,d,{M,cardOf:C.card,deckName});
/* The colored dot of a re-paired pair (C7): a few hues that read on both themes, the same on both halves. */
const MARKS=['#e0a030','#4fa3e0','#d95fd0','#45c08a','#e0603f','#8f7be8'];
const picture=(u,size)=>{const c=C.card(u.cardId)||u.card||{},src=String(c.image||'');return size==='small'?src.replace('/normal/','/small/'):src;};
function cell(u,side){
  if(!u)return `<div class="cm-plan-side is-${side} is-empty" role="cell"></div>`;
  const c=C.card(u.cardId)||u.card||{},picked=sel[side].has(u.id),label=side==='out'?u.role:u.label,ordered=side==='in'&&u.chain==='ordered';
  const why=!u.selectable?(u.kind==='upgrade'?'Choose what it replaces first, on the deck page':'Reserved: it goes in when it arrives'):'';
  return `<div class="cm-plan-side is-${side}${picked?' is-picked':''}${u.selectable?'':' is-fixed'}" role="cell" data-plan-unit="${e(u.id)}">
    <input type="checkbox" class="cm-plan-tick" data-plan-pick="${e(u.id)}" data-side="${side}"${picked?' checked':''}${u.selectable?'':' disabled'} aria-label="${e(side==='out'?'Take out':'Add')} ${e(u.name)}${why?` (${e(why)})`:''}"${why?` title="${e(why)}"`:''}>
    <span class="cm-plan-mark" aria-hidden="true"></span>
    <button type="button" class="cm-plan-thumb" data-action="card" data-card="${e(u.cardId)}" data-peek="${e(picture(u,'normal'))}" aria-label="Open ${e(u.name)}">${picture(u,'small')?`<img src="${e(picture(u,'small'))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</button>
    <span class="cm-plan-text"><button type="button" class="cm-card-name cm-plan-name" data-action="card" data-card="${e(u.cardId)}">${e(u.name)}</button>
      <span class="cm-plan-sub">${C.colors(c.colorIdentity||[])}<span class="cm-plan-role">${e(label)}${ordered?'':''}</span>${u.where?`<span class="cm-plan-where">${e(u.where)}</span>`:''}${!u.selectable?'<span class="cm-plan-wait" aria-hidden="true">⏳</span>':''}</span></span></div>`;
}
/* C6: removed, added and the total after, from this sitting's ticks. */
function counts(p){const removed=sel.out.size,added=sel.in.size,total=p.boxTotal-removed+added;return {removed,added,total};}
function counterHTML(p){const {removed,added,total}=counts(p);
  return `<div class="cm-plan-counter${total===100?' is-right':' is-off'}" role="status" aria-live="polite"><span><b data-plan-n="removed">${removed}</b> Removed</span><span><b data-plan-n="added">${added}</b> Added</span><span class="cm-plan-total"><b data-plan-n="total">${total}</b> Total Deck Cards</span></div>`;}
views.pull=async params=>{const d=M.deck(C.state,params.get('deck')||'');if(!CH())throw Error('The Planned Changes module is not loaded.');
  if(sel.deckId!==d.id)sel={deckId:d.id,in:new Set(),out:new Set()};
  const p=planOf(d),ids=new Set(p.rows.flatMap(r=>[r.in&&r.in.id,r.out&&r.out.id].filter(Boolean)));
  for(const k of ['in','out'])for(const id of [...sel[k]])if(!ids.has(id))sel[k].delete(id);
  C.main.innerHTML=`<div class="cm-pull cm-plan" data-deck="${e(d.id)}"><header class="cm-page-head cm-pull-head"><div><a class="cm-crumb" href="#decks">Decks</a><a class="cm-crumb" href="#decks?deck=${e(d.id)}">${e(d.name)}</a><h1>Planned Changes</h1></div><div class="cm-actions">${b('Open deck','deck',{deck:d.id})}${b('Print','pull-print')}${b('Export','pull-export',{deck:d.id})}${b('Swap','plan-swap',{deck:d.id},true)}</div></header>
    ${counterHTML(p)}
    ${p.rows.length?`<div class="cm-plan-table" role="table" aria-label="Planned changes for ${e(d.name)}"><div class="cm-plan-head" role="row"><div role="columnheader">Take out of Box</div><div role="columnheader">Add to Box</div></div>
      ${p.rows.map(r=>`<div class="cm-plan-row" role="row" data-plan-row="${r.row}">${cell(r.out,'out')}${cell(r.in,'in')}</div>`).join('')}</div>`:note('Nothing planned: the box holds the list, and nothing is waiting to go in.')}</div>`;
  paint(p);
  $('.cm-plan').addEventListener('change',ev=>{const t=ev.target.closest('[data-plan-pick]');if(!t)return;const set=sel[t.dataset.side];if(t.checked)set.add(t.dataset.planPick);else set.delete(t.dataset.planPick);t.closest('.cm-plan-side').classList.toggle('is-picked',t.checked);paint(planOf(d));});
};
/* The counter and the C7 dots, drawn again on every tick without drawing the page again. */
function paint(p){const root=$('.cm-plan');if(!root)return;
  const {removed,added,total}=counts(p),counter=root.querySelector('.cm-plan-counter');
  if(counter){counter.classList.toggle('is-right',total===100);counter.classList.toggle('is-off',total!==100);counter.querySelector('[data-plan-n=removed]').textContent=removed;counter.querySelector('[data-plan-n=added]').textContent=added;counter.querySelector('[data-plan-n=total]').textContent=total;}
  for(const m of root.querySelectorAll('.cm-plan-mark')){m.style.removeProperty('--mark');m.closest('.cm-plan-side').classList.remove('is-repaired');m.removeAttribute('title');}
  let k=0;for(const pr of CH().pairUp(p.rows,sel.in,sel.out)){if(!pr.repaired)continue;const color=MARKS[k++%MARKS.length];
    for(const u of [pr.in,pr.out]){const side=root.querySelector(`[data-plan-unit="${CSS.escape(u.id)}"]`);if(!side)continue;side.classList.add('is-repaired');const m=side.querySelector('.cm-plan-mark');m.style.setProperty('--mark',color);m.title=`Paired with ${u===pr.in?pr.out.name:pr.in.name}`;}}
  const swap=root.querySelector('[data-action=plan-swap]');if(swap)swap.disabled=!(sel.in.size||sel.out.size);}
/* C2: Swap asks first, with what goes where; the model previews the whole batch before it is made. */
actions['plan-swap']=el=>{const d=M.deck(C.state,el.dataset.deck),p=planOf(d),pairs=CH().pairUp(p.rows,sel.in,sel.out);
  if(!pairs.length)throw Error('Tick what to take out and what to add, then Swap.');
  const commands=CH().swapCommands(d,pairs),{removed,added,total}=counts(p);
  const line=pr=>`<li>${pr.out?`<span class="cm-plan-confirm-out">${e(pr.out.name)}</span>`:'<span class="cm-muted">—</span>'} ⇄ ${pr.in?`<span class="cm-plan-confirm-in">${e(pr.in.name)}</span>`:'<span class="cm-muted">—</span>'}${pr.repaired?' <span class="cm-plan-confirm-mark" aria-label="re-paired">●</span>':''}</li>`;
  const warn=total!==100?`<p class="cm-plan-confirm-warn">${total} cards in the deck after this; a Commander deck is 100.</p>`:'';
  return C.review('Confirm additions and removals?',`<p>${removed} out · ${added} in</p><ul class="cm-plan-confirm">${pairs.map(line).join('')}</ul>${warn}`,commands.length===1?commands[0]:{type:'batch',commands,summary:`${d.name}: ${removed} out, ${added} in`});};
/* THE PICTURE ON A HOVER (C4): the thumbnail's card, large, beside the pointer and inside the window. */
let peekEl=null;
function peek(btn,x,y){const src=btn&&btn.dataset.peek;if(!src){peekEl?.remove();peekEl=null;return;}
  if(!peekEl){peekEl=document.createElement('div');peekEl.className='cm-plan-peek';peekEl.setAttribute('aria-hidden','true');document.body.append(peekEl);}
  if(peekEl.dataset.src!==src){peekEl.dataset.src=src;peekEl.innerHTML=`<img src="${e(src)}" alt="" referrerpolicy="no-referrer">`;}
  const w=244,h=340,left=x+w+24<innerWidth?x+16:Math.max(8,x-w-16),top=Math.min(Math.max(8,y-h/2),innerHeight-h-8);peekEl.style.left=`${left}px`;peekEl.style.top=`${top}px`;}
document.addEventListener('pointerover',ev=>{const t=ev.target.closest?.('.cm-plan .cm-plan-thumb');if(t)peek(t,ev.clientX,ev.clientY);});
document.addEventListener('pointerout',ev=>{const t=ev.target.closest?.('.cm-plan .cm-plan-thumb');if(t&&!t.contains(ev.relatedTarget))peek(null);});
document.addEventListener('focusin',ev=>{const t=ev.target.closest?.('.cm-plan .cm-plan-thumb');if(t){const r=t.getBoundingClientRect();peek(t,r.right,r.top+r.height/2);}});
document.addEventListener('focusout',ev=>{if(ev.target.closest?.('.cm-plan .cm-plan-thumb'))peek(null);});
window.addEventListener('hashchange',()=>peek(null));
actions['pull-print']=()=>print();
actions['pull-export']=el=>{const d=M.deck(C.state,el.dataset.deck),p=planOf(d);
  const rows=p.rows.map(r=>({out:r.out?r.out.name:'',role:r.out?r.out.role:'',in:r.in?r.in.name:'',category:r.in?r.in.label:'',where:r.in?r.in.where:''}));
  C.download(d.name.replace(/[^\w-]+/g,'-')+'-planned-changes.csv',C.E.csv(rows,[['out','Take out of Box'],['role','Role'],['in','Add to Box'],['category','Category'],['where','Where it is']].map(([key,label])=>({key,label}))),'text/csv');};
});
