/* ORDERS, CAPTURED PER ORDER -- never a screen per card.
 *
 * An order is one thing you did: eighty-five cards from one vendor on one day, with one
 * reference and one shipping charge. The library recorded it as eighty-five unrelated
 * ordered copies, so "did that order arrive" was eighty-five ticks and "what did I pay
 * TCGplayer" was a sum nobody added up. Every copy now carries its order (collection-model's
 * `order` command writes it), and this tab reads the orders back: one row each, what was
 * paid including the shipping share, how many copies have arrived, and the house-rule
 * warnings as counts and markers rather than dialogs that block. Arrived → bench is one
 * command over the order id -- one revision, one undo, reservations kept. Paste receipt
 * takes an order confirmation as text and corrects only the lines it names, marked
 * `receipt`. Edit changes the vendor, reference and date on every line at once.
 *
 * Loaded after crankmagic-collection.js: it wraps views.shop so #shop?tab=orders is this tab
 * and everything else is the Shop as before. */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,E,esc:e,button:b,field:f,select:s,note,form,modal,commit,go,actions,views,$}=C;
const R=globalThis.CrankRules;
const shopView=views.shop;
views.shop=params=>params.get('tab')==='orders'?ordersView(params):shopView(params);
actions['shop-orders']=()=>go('shop',{tab:'orders'});actions['shop-acquire']=()=>go('shop');
const when=iso=>{const t=Date.parse(iso||'');return Number.isFinite(t)?new Date(t).toLocaleDateString(undefined,{dateStyle:'medium'}):(iso||'—');};
const fold=n=>String(n||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
/* The rule markers on a line: over $30, over the 110% cap, $5 and over from a mail-order vendor. */
const flags=(l,vendor)=>R?R.warnings({price:C.state.cards[l.cardId]&&C.state.cards[l.cardId].price,paid:l.paid,vendor}):[];
function ordersView(){const orders=M.orders(C.state);
  C.main.innerHTML=C.head('Fulfill your plans','Orders, one per order.','Every ordered copy carries the order it came from: what was paid, when it is due, and whether it has landed. Arrived → bench lands the whole order at once.',b('Paste receipt','paste-receipt')+b('Import list / library','import-list'))
    +`<div class="cm-actions">${b('Acquisition list','shop-acquire')}${b('Orders','shop-orders',{},true)}${b('Deck assembly','pull-picker')}</div>`
    +(orders.length?`<div class="cm-table-wrap"><table class="cm-table cm-orders"><thead><tr><th scope="col">Vendor</th><th scope="col">Reference</th><th scope="col">Placed</th><th scope="col">Expected</th><th scope="col">Lines</th><th scope="col">Copies</th><th scope="col">Paid</th><th scope="col">Arrived</th><th scope="col">Rules</th><th scope="col">Actions</th></tr></thead><tbody>${orders.map(o=>{const warn=o.lots.flatMap(l=>flags(l,o.vendor)),count=new Map();for(const w of warn)count.set(w,(count.get(w)||0)+1);const done=o.arrived>=o.copies;
      return `<tr class="cm-order-row" data-order="${e(o.id)}"><td><strong>${e(o.vendor||'—')}</strong></td><td>${e(o.ref||'—')}</td><td>${e(when(o.placedAt))}</td><td>${e(o.expectedBy||'—')}</td><td>${o.lots.length}</td><td>${o.copies}</td><td><span class="cm-price">${C.money(o.paid+o.shipping)}</span>${o.shipping?` <small class="cm-muted">incl. ${C.money(o.shipping)} shipping</small>`:''}</td><td>${C.pill(done?'All arrived':`${o.arrived} / ${o.copies}`,done?'inbox':'ordered')}</td><td>${count.size?[...count].map(([w,n])=>C.pill(`${n} ${e(w)}`,'remove')).join(' '):'<span class="cm-muted">—</span>'}</td><td class="cm-row-actions-cell">${done?'':b('Arrived → bench','order-arrived',{order:o.id},true,{cls:'compact'})}${b('Paste receipt','paste-receipt',{order:o.id},false,{cls:'compact'})}${b('Edit','order-edit',{order:o.id},false,{cls:'compact'})}${b('Lines','order-lines',{order:o.id},false,{cls:'compact'})}</td></tr>`;}).join('')}</tbody></table></div>`
    :`<div class="cm-orders">${note('No orders yet. Tick rows on the Acquisition list and choose Ordered… — one dialog for the whole order — or Bought in store.')}</div>`);}
actions['order-arrived']=el=>{const o=M.orders(C.state).find(x=>x.id===el.dataset.order);if(!o)throw Error('That order is no longer in the library.');
  C.review(`Arrived: ${o.vendor}${o.ref?' · '+o.ref:''}`,note(`${o.copies-o.arrived} cop${o.copies-o.arrived===1?'y':'ies'} land on the bench, still reserved to their decks. One change, one undo. Put them in their boxes from each deck’s pull sheet.`),{type:'orderArrived',orderId:o.id});};
actions['order-edit']=el=>{const o=M.orders(C.state).find(x=>x.id===el.dataset.order);if(!o)throw Error('That order is no longer in the library.');
  form('Edit order',s('Vendor','vendor',(C.VENDORS||[o.vendor]).map(v=>[v,v]).concat(C.VENDORS&&C.VENDORS.includes(o.vendor)?[]:[[o.vendor,o.vendor]]),o.vendor)+f('Order reference','ref',o.ref,'maxlength="100"')+f('Expected by','expectedBy',o.expectedBy||'','type="date"'),v=>commit({type:'editOrder',orderId:o.id,order:{vendor:v.vendor,ref:v.ref,expectedBy:v.expectedBy}}));};
actions['order-lines']=el=>{const o=M.orders(C.state).find(x=>x.id===el.dataset.order);if(!o)throw Error('That order is no longer in the library.');
  modal(`${o.vendor}${o.ref?' · '+o.ref:''}`,`<div class="cm-table-wrap"><table class="cm-table"><thead><tr><th scope="col">Card</th><th scope="col">Copies</th><th scope="col">Sheet</th><th scope="col">Paid</th><th scope="col">Status</th><th scope="col">Rules</th></tr></thead><tbody>${o.lots.map(l=>{const c=C.state.cards[l.cardId];return `<tr><td><button type="button" class="cm-card-name" data-action="card" data-card="${e(l.cardId)}">${e(c.name)}</button></td><td>${l.quantity}</td><td>${C.money(c.price)}</td><td>${Number.isFinite(l.paid)?C.money(l.paid)+(l.paidSource?` <small class="cm-muted">${e(l.paidSource)}</small>`:''):'—'}</td><td>${C.pill(C.source(l.source),C.pillKind(l.source,''))}</td><td>${flags(l,o.vendor).map(w=>C.pill(e(w),'remove')).join(' ')||'—'}</td></tr>`;}).join('')}</tbody></table></div>`);};
/* PASTE RECEIPT. The confirmation e-mail, a CSV, whatever the vendor sent: parsed into name,
   count and price, matched by name against the order's lines (or every ordered copy when no
   order is named), previewed with the unmatched lines shown, and committed as one `receipt`. */
function receiptFlow(text='',orderId=''){const orders=M.orders(C.state);
  form('Paste an order confirmation',`<div class="cm-full">${note('Lines with a card name and a price are read; the last dollar figure on a line is taken as the line total. Matched by name against the order’s copies. Unmatched lines are shown and skipped, never guessed.')}</div>`+s('Order','order',[['','Any ordered or owned copy'],...orders.map(o=>[o.id,`${o.vendor}${o.ref?' · '+o.ref:''} · ${o.copies} copies`])],orderId)+`<label class="cm-full">Receipt text or CSV<textarea name="text" rows="10" placeholder="1 Sol Ring $1.57">${e(text)}</textarea></label>`,
    async v=>{const lines=E.parseReceipt(v.text);if(!lines.length)throw Error('No lines with a card name and a price were found.');
      const pool=v.order?C.state.lots.filter(l=>l.order&&l.order.id===v.order):C.state.lots.filter(l=>l.source!=='wanted'&&l.source!=='watching');
      const matched=[],unmatched=[];for(const line of lines){const key=fold(line.name);const l=pool.find(x=>fold(C.state.cards[x.cardId].name)===key||fold(C.state.cards[x.cardId].name.split(' // ')[0])===key);if(l)matched.push({line,lot:l});else unmatched.push(line);}
      if(!matched.length)throw Error(`None of the ${lines.length} lines matched a copy${v.order?' on that order':''}: ${unmatched.slice(0,4).map(x=>x.name).join(', ')}.`);
      C.review(`Apply ${matched.length} receipt line${matched.length===1?'':'s'}`,`<div class="cm-table-wrap"><table class="cm-table"><thead><tr><th scope="col">Card</th><th scope="col">Was</th><th scope="col">Receipt</th></tr></thead><tbody>${matched.map(({line,lot})=>`<tr><td>${e(C.state.cards[lot.cardId].name)}</td><td>${Number.isFinite(lot.paid)?C.money(lot.paid):'—'}</td><td>${C.money(line.price)}</td></tr>`).join('')}</tbody></table></div>`+(unmatched.length?note(`${unmatched.length} line${unmatched.length===1?'':'s'} skipped: ${unmatched.slice(0,6).map(x=>x.name).join(', ')}${unmatched.length>6?'…':''}`,true):''),{type:'receipt',lines:matched.map(({line,lot})=>({lotId:lot.id,paid:line.price}))});},'Match lines');}
C.receiptFlow=receiptFlow;
actions['paste-receipt']=el=>receiptFlow('',el&&el.dataset.order||'');
});
