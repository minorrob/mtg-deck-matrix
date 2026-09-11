/* Every roster is the same semantic table projection. Source, allocation and
 * physical box have separate columns; hiding a column cannot change the model. */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,esc:e,button:b,field:f,select:s,note,form,modal,commit,actions,views,$}=C;let foldPrints=false;let filter={q:'',type:'',subtype:'',mechanic:'',color:'',source:'',placement:'',offer:'',min:'',max:'',price:'',group:''},sort={key:'name',dir:1},page=0,expanded=false,groupBy='',shopGroupBy='deck',shopMode='acquire',visibleRows=[],lastRows=[],collapsed=new Set(),collapsedKey='';
const columns=[['name','Card'],['type','Type'],['subtype','Subtype'],['mechanic','Mechanic'],['color','Color'],['rarity','Rarity'],['mana','Mana value'],['price','Price'],['cap','Cap'],['vendor','Vendor'],['paid','Paid'],['source','Source'],['placement','Allocation'],['deck','Deck'],['box','Physical location'],['purpose','Purpose'],['quantity','Quantity'],['printing','Printing'],['offer','Sell / Trade'],['groups','Groups']];
const defaults=['name','type','source','placement','deck','quantity','paid','printing'];let selected=null;
/* THE SHOP'S COLUMNS ARE THE MONEY COLUMNS, at every width. The desktop Shop showed the
   Collection's columns -- print, purpose, allocation -- and no price; the phone showed a
   price and a Buy button; the two disagreed about what shopping is. One set now, and the
   Columns dialog on the Shop edits this set rather than the Collection's. */
const SHOP_DEFAULTS=['name','color','type','price','cap','vendor','deck','quantity','paid'];let shopSelected=null;
const R=globalThis.CrankRules||{RULES:{capFloor:2,capPct:.1,localOnly:5,perCardMax:30,deckCap:225,pool:100},capFor:()=>null,localOnly:()=>false,BANDS:[],bandOf:()=>'under1'};
C.RULES=R.RULES;
/* A DRAFT IS A LIST OF PLANS, AND A PLAN THAT ALREADY HAS ITS COPIES IS ACCOUNTED FOR. A draft
   deck's slots show as Draft list rows -- the deck's cards, in the deck's group, at the status
   'draft' -- until copies filed under that group cover them, at which point the copy records
   are the rows and the plan row shrinks by that many and then goes. So marking a draft card
   Owned puts one owned row where the draft row was, rather than one of each. */
function plans(d){
  const pool=new Map(),filed=cardId=>d.groupId?C.state.lots.filter(l=>l.cardId===cardId&&!l.allocation&&l.groupIds.includes(d.groupId)).reduce((n,l)=>n+l.quantity,0):0;
  return d.slots.filter(r=>d.status==='draft'||!r.committed).map(r=>{
    let quantity=r.quantity;
    if(r.committed){const have=pool.has(r.cardId)?pool.get(r.cardId):filed(r.cardId),use=Math.min(have,quantity);pool.set(r.cardId,have-use);quantity-=use;}
    return quantity<1?null:{recordId:'plan:'+d.id+':'+r.id,kind:r.committed?'draft':'option',deckId:d.id,slotId:r.id,cardId:r.cardId,card:C.state.cards[r.cardId],quantity,source:'draft',placement:r.committed?'Draft list':'Suggestion',purpose:r.purpose,printing:r.printing,offer:'none',groupIds:d.groupId?[d.groupId]:[]};
  }).filter(Boolean);
}
function rows(params,shop){let all=M.projection(C.state);for(const d of C.state.decks.filter(d=>!d.archived))all.push(...plans(d));const gid=params.get('group')||filter.group;for(const g of C.state.groups)all.push(...g.entries.map(r=>({...r,recordId:'entry:'+g.id+':'+r.id,kind:'entry',card:C.state.cards[r.cardId],source:'draft',placement:'Draft list',purpose:'',offer:'none',groupIds:[g.id],deckId:'',groupId:g.id})));if(params.get('card'))all=all.filter(r=>r.cardId===params.get('card'));if(params.get('deck'))all=all.filter(r=>r.deckId===params.get('deck'));if(gid)all=all.filter(r=>r.groupIds.includes(gid));if(shop)all=all.filter(r=>r.kind==='need'||r.kind==='lot'&&(shopMode==='assemble'?!!r.allocation:r.source!=='owned'));return all;}
function value(r,key){const c=r.card;return ({name:c.name,type:c.typeLine.split('—')[0].trim(),subtype:c.typeLine.split('—')[1]?.trim()||'',mechanic:(c.mechanics.length?c.mechanics:c.keywords).join(', '),color:c.colorIdentity.join(''),rarity:({common:'Common',uncommon:'Uncommon',rare:'Rare',mythic:'Mythic',special:'Special',bonus:'Bonus',c:'Common',u:'Uncommon',r:'Rare',m:'Mythic',s:'Special',b:'Bonus'})[String(c.rarity||'').toLowerCase()]||'',mana:c.manaValue,price:c.price,cap:R.capFor(c.price),vendor:r.kind==='lot'?(r.order&&r.order.vendor||r.vendor||''):'',paid:r.kind==='lot'&&Number.isFinite(r.paid)?r.paid:null,source:C.source(r.source),placement:r.placement,deck:r.deckId?M.deck(C.state,r.deckId).name:'',box:r.kind==='lot'?C.readableLocation(r):'',purpose:r.purpose==='main'?'Main deck':r.purpose==='bracket'?'Bracket option':r.purpose==='upgrade'?'Upgrade':'',quantity:r.quantity,groups:r.groupIds.map(id=>C.state.groups.find(g=>g.id===id)?.name||'').join(', '),printing:[r.printing?.set,r.printing?.collector,r.printing?.finish,r.printing?.language,r.printing?.condition].filter(Boolean).join(' · ')||'Unspecified',offer:r.offer==='none'?'':r.offer==='held'?'Pending deal':'Sell / Trade'})[key];}
/* GROUPING IS NOT THE SAME QUESTION AS SORTING. The Color column prints a card's identity
   letters, which as a grouping would make a heading per colour pair and answer nothing:
   a reader grouping by colour wants their mono-white cards together and everything gold
   in one pile. So colour groups into the five, Colorless, and Multiple -- and the piles
   come out in WUBRG order rather than alphabetically, because that is the order a Magic
   player reads colours in. */
const COLOR_PILE=['White','Blue','Black','Red','Green','Multiple','Colorless'];
const COLOR_NAME={W:'White',U:'Blue',B:'Black',R:'Red',G:'Green'};
function groupLabel(r,key){
  if(key!=='color')return value(r,key);
  const ci=r.card.colorIdentity||[];
  return ci.length===0?'Colorless':ci.length>1?'Multiple':COLOR_NAME[ci[0]]||'Colorless';
}
function groupOrder(r,key){
  const label=groupLabel(r,key);
  /* The band for "no value" -- copies in no deck, no group -- is a to-do rather than a
     shelf, and it goes last however the rest are ordered. */
  if(key!=='color')return String(label??'')||'\uffff';
  const at=COLOR_PILE.indexOf(label);
  return String(at<0?COLOR_PILE.length:at).padStart(2,'0');
}
/* SIX FIGURES ABOUT WHAT YOU ARE LOOKING AT. They were computed from the whole library
   while every other number on the page followed the filters, so filtering to a hundred-card
   deck read "101 owned copies" above "100 copies" and one of the two had to be wrong. Both
   are right now: same rows, same question. "In deck box" is also named for what it counts
   -- copies whose physical box is a deck -- rather than for cards a deck list contains, and
   it is the one term the whole app uses for that fact. */
const STAT_FIGURES=[['owned','owned copies'],['ordered','ordered'],['wanted','wanted'],['watching','watching'],['toBuy','to buy'],['inDeck','in deck box'],['sellTrade','Sell / Trade']];
function statsHTML(shown,scoped){
  const t={owned:0,ordered:0,wanted:0,watching:0,toBuy:0,inDeck:0,sellTrade:0};
  for(const r of shown){
    if(r.kind==='need'){t.toBuy+=r.quantity;continue;}
    if(r.kind!=='lot')continue;
    if(r.source!=='owned'){if(Object.hasOwn(t,r.source))t[r.source]+=r.quantity;continue;}
    t.owned+=r.quantity;
    if(r.placement==='In deck box')t.inDeck+=r.quantity;
    if(r.offer!=='none')t.sellTrade+=r.quantity;
  }
  return `<div class="cm-stats">${STAT_FIGURES.map(([k,l])=>`<div><strong>${t[k]}</strong><span>${l}</span></div>`).join('')}</div>`+(scoped?'<p class="cm-status-line cm-stats-scope">Counting the records this view shows. Clear the filters for your whole library.</p>':'');
}
/* TICKING ROWS. Not a mode with a button to enter and leave -- the checkboxes are simply
   in the table, and the bar saying what you can do to them appears once one is ticked.
   A copy record can be ticked, and so can a draft-list row or a To buy requirement -- those
   two are not copies yet, so the only thing the bar does to them is Set status, which is
   what makes them copies. The box, bench, reservation and Sell / Trade actions take the
   ticked copy records and say so when there are none. A folded row is several copies
   pretending to be one, which is why the table refuses ticks while prints are folded. */
let picked=new Set(),pickScope='';
const pickable=r=>r.kind==='lot'||r.kind==='draft'||r.kind==='need';
const pickedIds=()=>[...picked].filter(id=>C.state.lots.some(l=>l.id===id));
function pickedSplit(){const lots=[],byDeck=new Map();for(const id of picked){if(C.state.lots.some(l=>l.id===id)){lots.push(id);continue;}const r=findRow(id);if(!r||(r.kind!=='draft'&&r.kind!=='need'))continue;if(!byDeck.has(r.deckId))byDeck.set(r.deckId,[]);byDeck.get(r.deckId).push(r);}return {lots,plans:[...byDeck]};}
/* THE STATUS LADDER. Watching, Wanted, Ordered, Incoming and Owned -- the rungs a card climbs
   before it is in hand, in order, each with the half-line that tells them apart. One list,
   used by the row menu, the ticked-rows bar and the deck page, so the words never drift. */
const LADDER=[['watching','Watching','keeping an eye on it'],['wanted','Wanted','on your to-buy list'],['ordered','Ordered','bought, not yet in hand'],['incoming','Incoming trade','arranged, on its way'],['owned','Owned','in hand — on the bench until placed']];
const rung=(label,why,attrs,current=false)=>`<button type="button" class="cm-rung${current?' is-current':''}" aria-label="${e(label)}" data-label="${e(label)}" ${attrs}><span class="cm-rung-label">${e(label)}</span><small>${e(why)}</small></button>`;
C.statusLadder=LADDER;
function batchBar(){
  const n=picked.size;
  if(!n)return '';
  return `<div class="cm-batch-bar"><strong>${n} record${n===1?'':'s'} ticked</strong>${b('Set status','batch-status',{},true,{caret:'down'})}${b('Ordered…','batch-order')}${b('Bought in store','batch-store')}${b('Arrived','batch-arrived')}${b('Add to a group','batch-group')}${b('Put in a deck box','batch-place')}${b('Move physically to Bench','batch-bench')}${b('Release reservation → To buy','batch-release')}${b('Offer for Sell / Trade','batch-offer')}<button type="button" class="cm-text-button" data-action="batch-clear">Clear</button></div>`;
}
function matches(r){const c=r.card,q=filter.q.toLowerCase();return (!q||[c.name,c.typeLine,c.oracleText,r.notes].join(' ').toLowerCase().includes(q))&&(!filter.type||c.typeLine.split('—')[0].includes(filter.type))&&(!filter.subtype||c.typeLine.toLowerCase().includes(filter.subtype.toLowerCase()))&&(!filter.mechanic||[c.oracleText,...c.mechanics,...c.keywords].join(' ').toLowerCase().includes(filter.mechanic.toLowerCase()))&&(!filter.color||(filter.color==='C'?c.colorIdentity.length===0:c.colorIdentity.includes(filter.color)))&&(!filter.source||r.source===filter.source)&&(!filter.placement||r.placement===filter.placement)&&(!filter.offer||(filter.offer==='bench'?r.kind==='lot'&&r.source==='owned'&&!r.allocation&&r.location?.kind!=='deck':filter.offer==='held'?r.offer==='held':r.offer==='available'))&&(filter.min===''||c.manaValue!==null&&c.manaValue>=Number(filter.min))&&(filter.max===''||c.manaValue!==null&&c.manaValue<=Number(filter.max))&&(filter.price===''||c.price!==null&&c.price<=Number(filter.price));}
/* SHOPPING A CONVENTION FLOOR. On a phone the Shop page is not a spreadsheet to study; it
   is a list held in one hand at a booth while the seller waits. So under 640px the page
   head, the six-stat ribbon and the Columns control all go, the three page buttons fold
   into one Tools menu, the two list modes become one List type menu, the search field
   hides behind a magnifying glass, and every row carries a real Buy button instead of a
   dropdown that costs two taps and a form. The desktop page is untouched: the same
   rows, the same filters, the same actions, only a narrower way in. */
const PHONE=matchMedia('(max-width:640px)');
const compactShop=shop=>!!shop&&PHONE.matches;
const GROUP_CHOICES=[['','No grouping'],['deck','Deck'],['vendor','Vendor'],['source','Source'],['type','Type'],['color','Color'],['placement','Allocation'],['groups','Groups']];
/* A row is buyable when money would change what it is: a deck requirement nothing fills
   yet, or a copy recorded as wanted, ordered or incoming. An owned copy is not. */
const buyable=r=>r.kind==='need'||r.kind==='lot'&&r.source!=='owned';
/* The five phone columns have about 345px between them, so Type and Rarity print the
   short forms a player already reads on a card: the type's last word (a Legendary
   Creature is a Creature when you are deciding whether to buy it) and rarity's initial,
   coloured the way the set symbol is. */
const TYPE_SHORT={Enchantment:'Enchant',Planeswalker:'Walker',Creature:'Creature',Artifact:'Artifact',Instant:'Instant',Sorcery:'Sorcery',Land:'Land',Battle:'Battle'};
const RARITY_LETTER={common:'C',uncommon:'U',rare:'R',mythic:'M',special:'S',bonus:'B',c:'C',u:'U',r:'R',m:'M',s:'S',b:'B'};
const shortType=c=>{const head=(c.typeLine||'').split('—')[0].trim().split(/\s+/).pop()||'';return TYPE_SHORT[head]||head;};
const shortRarity=c=>{const key=String(c.rarity||'').toLowerCase(),letter=RARITY_LETTER[key]||'';return letter?`<span class="cm-rarity cm-rarity-${letter}" title="${e(key[0].toUpperCase()+key.slice(1))}">${letter}</span>`:'';};
let searchOpen=false,phoneWatch=false;
function popAt(el,html){document.querySelectorAll('.cm-row-menu').forEach(m=>m.remove());const menu=document.createElement('div');menu.className='cm-menu cm-row-menu';menu.setAttribute('popover','auto');menu.innerHTML=html;document.body.append(menu);menu.showPopover();const rect=el.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,rect.right-menu.offsetWidth))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,rect.bottom+5))+'px';menu.addEventListener('click',ev=>{if(ev.target.closest('[data-action]'))menu.hidePopover();});return menu;}
views.collection=params=>show(params,false);views.shop=params=>show(params,true);
/* THE TWO NUMBERS YOU CORRECT MOST. What a card cost you and how many arrived are the
 * facts a receipt changes, and routing a two-character edit through a dialog was the whole
 * friction. On a real copy they are cells you click and type in. Everything else in the
 * row is read-only text, because everything else is either the card's own fact or a
 * decision with consequences the menu is there to explain.
 *
 * Paid is what YOU paid; Price is what the card goes for. They are different questions and
 * they get different columns -- one number doing both jobs is how a table starts lying. */
const EDITS={paid:'Paid',quantity:'Quantity'};
const canEdit=(r,k)=>r.kind==='lot'&&Object.hasOwn(EDITS,k);

/* ONE ROW PER CARD, WHATEVER THE PRINT.
 *
 * The roster is one row per copy lot, which is the truth: a foil Sol Ring bought in March
 * and a nonfoil one bought in July are two different pieces of cardboard with two
 * different prices. But somebody asking "do I own Sol Ring, and how many" does not want
 * that answered in four rows, and a page of near-identical names is unreadable.
 *
 * So this folds by card and totals the copies. Where the folded rows agree on a column,
 * that value stands; where they disagree it says Various, because printing a foil's set
 * code over four copies that are not all foil would be a lie the table tells confidently.
 * The per-copy rows are untouched underneath -- this is a way of looking, not a change.
 */
const FOLD_FIELDS=['source','placement','deckId','box','purpose','printing','offer','paid','quantity'];
function foldByCard(list){
  const by=new Map();
  for(const r of list){
    const seen=by.get(r.cardId);
    if(!seen){by.set(r.cardId,{row:r,parts:[r]});continue;}
    seen.parts.push(r);
  }
  return [...by.values()].map(({row,parts})=>{
    if(parts.length===1)return row;
    const mixed=new Set();
    const folded={...row,recordId:'fold:'+row.cardId,kind:'fold',parts:parts.length,
      quantity:parts.reduce((n,p)=>n+p.quantity,0),groupIds:[...new Set(parts.flatMap(p=>p.groupIds||[]))]};
    for(const key of FOLD_FIELDS){
      if(key==='quantity')continue;
      const first=JSON.stringify(parts[0][key]??null);
      if(parts.some(p=>JSON.stringify(p[key]??null)!==first))mixed.add(key);
    }
    /* deckId and box are two columns off one field each; name them the way the table does. */
    if(mixed.has('deckId'))mixed.add('deck');
    folded.mixed=mixed;
    return folded;
  });
}

function show(params,shop){selected=selected||C.state.preferences.columns||defaults;shopSelected=shopSelected||C.state.preferences.shopColumns||SHOP_DEFAULTS;const tight=compactShop(shop);
const cols=shop?shopSelected:selected;
/* Grouping is remembered per page: the Shop opens by deck, the Collection flat. */
const gbGet=()=>shop?shopGroupBy:groupBy,gbSet=v=>{if(shop)shopGroupBy=v;else groupBy=v;};
/* A tick is about the records in front of you; carrying it from a deck to a group, or from
   the Collection to the Shop, would act on rows the reader can no longer see. */
const scope=[shop?'shop':'collection',params.get('deck')||'',params.get('group')||'',params.get('card')||''].join('|');
if(params.get('placement')){filter.placement=params.get('placement');expanded=true;}
if(scope!==pickScope){pickScope=scope;picked.clear();}
/* Crossing the phone boundary changes which page is correct, not just how it looks, so
   the view is rebuilt rather than restyled. Registered once, and only while a roster
   page is on screen. */
if(!phoneWatch){phoneWatch=true;PHONE.addEventListener('change',()=>{if(['shop','collection'].includes(C.route().view))C.render();});}
const shopTools=`<div class="cm-shop-bar"><button type="button" class="v-button cm-shop-search-btn" data-action="shop-search" aria-label="Search cards" aria-expanded="${searchOpen}" title="Search cards"><span aria-hidden="true">\u{1F50D}</span></button>${b('Orders','shop-orders')}${b('Deck assembly','pull-picker')}${b(expanded?'Hide filters':(gbGet()?'Filters •':'Filters'),'roster-filters')}${b('Tools','shop-tools',{},false,{caret:'down'})}</div><label class="cm-search cm-shop-search" id="cm-shop-search"${searchOpen?'':' hidden'}>Search cards<input id="cm-roster-query" value="${e(filter.q)}" placeholder="Name, type or rules text"></label>`;
C.main.innerHTML=(tight?'':C.head(shop?'Fulfill your plans':'The master card roster',shop?'From wish list to deck box.':'What you have. What you need.',shop?'Manage orders, store purchases, receipts and physical assembly. Every action is reversible.':'Owned, ordered and to-buy copies, with their purpose, print and physical location.',b('Add cards','add-card',{},true)+b('Import list / library','import-list')+b('Export view','export-view')+(shop?b('Print buy list','print-buy-list'):''))+(shop?`<div class="cm-actions">${b('Acquisition list','shop-mode',{mode:'acquire'},true)}${b('Orders','shop-orders')}${b('Deck assembly','pull-picker')}</div>`:`<div class="cm-actions">${b('New collection group','new-group')}${params.get('group')?b('Manage group','manage-group',{group:params.get('group')})+b('Add planned card','add-group-entry',{group:params.get('group')})+b('Edit planned list','edit-group-entries',{group:params.get('group')}):''}</div>`)+`<div id="cm-roster-stats"></div>`)+`<div class="cm-actions">${params.get('card')?`<span class="cm-chip">Card: ${e((C.state.cards[params.get('card')]||C.catalog.get(params.get('card')))?.name||'Card')}</span>`:''}${params.get('deck')?`<span class="cm-chip">Deck: ${e(M.deck(C.state,params.get('deck')).name)}</span>`:''}${params.get('group')?`<span class="cm-chip">Group: ${e(C.state.groups.find(g=>g.id===params.get('group'))?.name)}</span>`:''}</div>`+(tight?shopTools:`<div class="cm-toolbar"><label class="cm-search">Search cards<input id="cm-roster-query" value="${e(filter.q)}" placeholder="Name, type or rules text"></label>${b(expanded?'Hide filters':'Filters','roster-filters')}${b('Columns','roster-columns')}${b('Clear filters','clear-filters')}${s('Collection group','groupPick',[['','All groups'],...C.state.groups.map(g=>[g.id,g.name])],params.get('group')||filter.group)}${s('Group rows by','groupBy',GROUP_CHOICES,gbGet())}<label class="cm-checkbox cm-fold-toggle"><input type="checkbox" name="foldPrints"${foldPrints?' checked':''}>One row per card</label></div>`)+`<div id="cm-filter-host"></div>${shop?'<div id="cm-shop-strip"></div>':''}<div id="cm-roster-table"></div>`;
if(expanded)$('#cm-filter-host').innerHTML=`<div class="cm-filter-panel">${tight?s('Group rows by','groupBy',GROUP_CHOICES,gbGet()):''}${s('Card type','type',[['','All types'],'Artifact','Creature','Enchantment','Instant','Land','Planeswalker','Sorcery','Battle'],filter.type)}${f('Subtype','subtype',filter.subtype)}${f('Mechanic / keyword','mechanic',filter.mechanic)}${s('Color identity','color',[['','All colors'],['W','White'],['U','Blue'],['B','Black'],['R','Red'],['G','Green'],['C','Colorless']],filter.color)}${s('Source','source',[['','All sources'],['owned','Owned'],['ordered','Ordered'],['incoming','Incoming trade'],['wanted','Wanted'],['watching','Watching'],['to-buy','To buy'],['draft','Draft / suggestion']],filter.source)}${s('Allocation / status','placement',[['','All allocations'],'In deck box','Reserved','Bench','Draft list','Suggestion'],filter.placement)}${s('Bench / Sell / Trade','offer',[['','All cards'],['bench','Unassigned bench'],['available','Sell / Trade'],['held','Pending deals']],filter.offer)}${f('Minimum mana value','min',filter.min,'type="number" min="0"')}${f('Maximum mana value','max',filter.max,'type="number" min="0"')}${f('Maximum price ($)','price',filter.price,'type="number" min="0" step="0.01"')}${s('Deck','deck',[['','All decks'],...C.state.decks.filter(d=>!d.archived).map(d=>[d.id,d.name])],params.get('deck')||'')}</div>`;
const scoped=()=>!!(params.get('card')||params.get('deck')||params.get('group')||Object.values(filter).some(v=>v!==''));
/* One cell, rendered. `tight` is the phone's Shop layout, which is why this lives inside
   the view rather than beside canEdit(): the same column reads differently there. */
const cell=(r,k)=>{
  const mixed=r.kind==='fold'&&r.mixed?.has(k==='deck'?'deckId':k);
  const body=mixed?'<span class="cm-muted">Various</span>'
    :k==='color'?C.colors(r.card.colorIdentity)
    :k==='price'?(!(r.card.price>0)?'<span class="cm-muted">—</span>':`<span class="cm-price">${C.money(r.card.price)}</span>`)
    :k==='cap'?capCell(r.card.price)
    :k==='vendor'?(value(r,k)?e(value(r,k)):'<span class="cm-muted">—</span>')
    :k==='paid'?(Number.isFinite(value(r,k))?C.money(value(r,k)):'<span class="cm-muted">—</span>')
    :tight&&k==='type'?e(shortType(r.card))
    :tight&&k==='rarity'?shortRarity(r.card)
    :e(value(r,k)??'Unknown');
  if(k==='color')return body;
  if(k==='source'&&!mixed)return C.pill(body,C.pillKind(r.source,r.placement));
  if(k==='placement'&&!mixed)return C.pill(body,C.pillKind(r.placement));
  if(!canEdit(r,k))return body;
  return `<button type="button" class="cm-cell-edit" data-action="cell-edit" data-record="${e(r.recordId)}" data-field="${e(k)}" title="Click to set ${e(EDITS[k])}">${body}</button>`;
};
const draw=()=>{const everything=rows(params,shop),matched=everything.filter(matches);lastRows=everything;const ribbon=$('#cm-roster-stats');if(ribbon)ribbon.innerHTML=statsHTML(matched,scoped());
const strip=$('#cm-shop-strip');if(strip)strip.innerHTML=stripHTML(matched);
/* A tick outlives a redraw only while its row still exists: a copy that was sold, a draft slot that was removed, a requirement that was filled all drop out. */
const live=new Set(everything.map(r=>r.recordId));for(const id of picked)if(!live.has(id))picked.delete(id);
const groupBy=gbGet();
visibleRows=(foldPrints?foldByCard(matched):matched).sort((a,b)=>{if(groupBy){const g=groupOrder(a,groupBy).localeCompare(groupOrder(b,groupBy));if(g)return g;}const av=value(a,sort.key),bv=value(b,sort.key);return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av??'').localeCompare(String(bv??''),undefined,{numeric:true}))*sort.dir||a.recordId.localeCompare(b.recordId);});
const shown=columns.filter(([k])=>cols.includes(k));
/* The phone Shop is a list held in one hand at a booth; it has no room for a column that
   only matters when you are sitting down with the whole library. */
const ticks=!tight&&!foldPrints,span=shown.length+1+(ticks?1:0);
const canTick=visibleRows.filter(pickable),allTicked=canTick.length>0&&canTick.every(r=>picked.has(r.recordId));
/* BANDS THAT FOLD. Grouping cut the rows into bands under a heading, and a heading was all it
   was: a library grouped by deck was six headings and six hundred rows, with no way to put
   five decks away while reading the sixth. Each heading is a toggle now, and a folded band
   drops out of the paging so the next one moves up rather than leaving a page of nothing.
   The folded set belongs to the grouping that made it: change the grouping and every band
   is open again. */
if(groupBy!==collapsedKey){collapsed.clear();collapsedKey=groupBy;}
const bands=[];if(groupBy)for(const r of visibleRows){const label=groupLabel(r,groupBy)||'Unassigned',last=bands[bands.length-1];if(last&&last.label===label)last.rows.push(r);else bands.push({label,rows:[r]});}
const items=groupBy?bands.flatMap(band=>[{band},...(collapsed.has(band.label)?[]:band.rows.map(row=>({row})))]):visibleRows.map(row=>({row}));
page=Math.min(page,Math.max(0,Math.ceil(items.length/60)-1));
/* On the Shop each band header also says what its To buy rows cost: Σ price × need over the
   requirement rows, so the per-deck subtotals add up to the strip above the table. */
const bandRow=band=>{const open=!collapsed.has(band.label),copies=band.rows.reduce((n,r)=>n+r.quantity,0),dollars=shop?band.rows.filter(r=>r.kind==='need').reduce((n,r)=>n+(r.card.price>0?r.card.price*r.quantity:0),0):0;return `<tr class="cm-group-row"><td colspan="${span}"><button type="button" class="cm-group-toggle" data-group-toggle="${e(band.label)}" aria-expanded="${open}"><span class="cm-group-caret" aria-hidden="true">${open?'▾':'▸'}</span><span>${e(band.label)}</span><small>${band.rows.length} record${band.rows.length===1?'':'s'} · ${copies} cop${copies===1?'y':'ies'}${shop?` · <b class="cm-band-dollars">${C.money(Math.round(dollars*100)/100)}</b> to buy`:''}</small></button></td></tr>`;};
const rowHTML=r=>`<tr class="cm-row-card${picked.has(r.recordId)?' cm-row-ticked':''}" data-record="${e(r.recordId)}" data-action="card" data-card="${e(r.cardId)}">${ticks?`<td class="cm-tick-cell">${pickable(r)?`<input type="checkbox" class="cm-row-tick" data-record="${e(r.recordId)}"${picked.has(r.recordId)?' checked':''} aria-label="Tick ${e(r.card.name)}">`:''}</td>`:''}${shown.map(([k])=>`<td${canEdit(r,k)?' class="cm-cell-live"':''}>${k==='name'?`<button class="cm-card-name" data-action="card" data-card="${e(r.cardId)}">${!tight&&r.card.image?`<img class="cm-card-thumb" src="${e(r.card.image)}" alt="" loading="lazy">`:''}<span>${e(r.card.name)}${(tight||r.kind==='fold')&&r.quantity>1?` <em>×${r.quantity}</em>`:''}</span></button>${tight?(shop?`<span class="cm-row-primary">${primary(r)}</span>`:''):`<small>${r.kind==='fold'?`${r.parts} records`:e(value(r,'purpose'))+(r.kind==='option'?' · Uncommitted suggestion':'')}</small>`}`:cell(r,k)}</td>`).join('')}<td class="cm-row-actions-cell">${r.kind==='fold'?'<span class="cm-muted">Untick One row per card to act on a copy</span>':`${shop&&!tight?primary(r):''}<button class="v-button compact cm-row-actions" data-action="row-actions" data-record="${e(r.recordId)}" aria-haspopup="menu"${tight?' aria-label="More actions"':''}>${tight?'':'Actions'}${C.caret('down')}</button>`}</td></tr>`;
const allFolded=bands.length>0&&bands.every(band=>collapsed.has(band.label));
const foldAll=groupBy&&bands.length?` · <button type="button" class="cm-text-button" data-groups="${allFolded?'expand':'collapse'}">${allFolded?'Expand all groups':'Collapse all groups'}</button>`:'';
$('#cm-roster-table').innerHTML=`${ticks?batchBar():''}<p class="cm-status-line">${visibleRows.length} record${visibleRows.length===1?'':'s'} · ${visibleRows.reduce((n,r)=>n+r.quantity,0)} copies or planned slots${foldPrints?' · one row per card, whatever the print':''} · ${shop?'Acquisition and assembly':'One record per copy lot or requirement'}${foldAll}</p><div class="cm-table-wrap"><table class="cm-table${tight?' cm-table-shop':''}"><thead><tr>${ticks?`<th scope="col" class="cm-tick-cell"><input type="checkbox" class="cm-tick-all"${allTicked?' checked':''} aria-label="Tick every matching record"></th>`:''}${shown.map(([k,l])=>`<th scope="col" aria-sort="${sort.key===k?(sort.dir===1?'ascending':'descending'):'none'}"><button data-sort="${k}">${l}${sort.key===k?` <span aria-hidden="true">${sort.dir===1?'↑':'↓'}</span>`:tight?'':' <span aria-hidden="true">↕</span>'}</button></th>`).join('')}<th scope="col">Actions</th></tr></thead><tbody>${items.slice(page*60,page*60+60).map(it=>it.band?bandRow(it.band):rowHTML(it.row)).join('')||`<tr><td colspan="${span}">No matching records. Add your cards or clear the filters.</td></tr>`}</tbody></table></div><div class="cm-paging"><span>Page ${page+1} of ${Math.max(1,Math.ceil(items.length/60))}</span><div class="cm-actions"><button class="v-button" data-page="-1" ${page===0?'disabled':''}>Previous</button><button class="v-button" data-page="1" ${(page+1)*60>=items.length?'disabled':''}>Next</button></div></div>`;$('#cm-roster-table').onclick=ev=>{
    const tick=ev.target.closest('.cm-row-tick'),all=ev.target.closest('.cm-tick-all');
    if(tick||all){
      /* The row itself opens the card. Stopping here keeps a tick a tick -- the document's
         [data-action] handler never sees it, so the page does not change under the reader. */
      ev.stopPropagation();
      if(tick){if(tick.checked)picked.add(tick.dataset.record);else picked.delete(tick.dataset.record);}
      else if(all.checked){for(const r of canTick.slice(0,500))picked.add(r.recordId);if(canTick.length>500)C.notice('Ticked the first 500 records — a batch changes at most 500 at once.');}
      else for(const r of canTick)picked.delete(r.recordId);
      draw();return;
    }
    const one=ev.target.closest('[data-group-toggle]'),every=ev.target.closest('[data-groups]');
    if(one){ev.stopPropagation();const label=one.dataset.groupToggle;if(collapsed.has(label))collapsed.delete(label);else collapsed.add(label);draw();return;}
    if(every){ev.stopPropagation();if(every.dataset.groups==='collapse')for(const band of bands)collapsed.add(band.label);else collapsed.clear();draw();return;}
    const so=ev.target.closest('[data-sort]'),pa=ev.target.closest('[data-page]');if(so){const key=so.dataset.sort;sort={key,dir:sort.key===key?-sort.dir:1};draw();}if(pa){page+=Number(pa.dataset.page);draw();}};};
$('#cm-roster-query').addEventListener('input',ev=>{filter.q=ev.target.value;page=0;draw();});$('[name=groupBy]')?.addEventListener('change',ev=>{gbSet(ev.target.value);page=0;draw();});$('[name=groupPick]')?.addEventListener('change',ev=>{filter.group=ev.target.value;C.go(shop?'shop':'collection',{deck:params.get('deck'),group:filter.group});});$('[name=foldPrints]')?.addEventListener('change',ev=>{foldPrints=ev.target.checked;page=0;draw();});$('#cm-filter-host').addEventListener('input',ev=>{if(ev.target.name==='deck')return;if(ev.target.name==='groupBy'){gbSet(ev.target.value);page=0;draw();return;}if(ev.target.name==='group'){filter.group=ev.target.value;C.go(shop?'shop':'collection',{deck:params.get('deck'),group:filter.group});return;}filter[ev.target.name]=ev.target.value;page=0;draw();});$('#cm-filter-host').addEventListener('change',ev=>{if(ev.target.name==='deck')C.go(shop?'shop':'collection',{deck:ev.target.value,group:params.get('group')});});draw();}
/* ONE RECEIPT FOR THE WHOLE BATCH. Each of these is the review dialog the single-record
   command already uses, handed every ticked record at once: one revision, one line in the
   history, one thing to undo. The ticks survive the change, because marking eleven cards
   received and then filing the same eleven into a group is one errand, not two. */
function batch(title,body,command){
  const lotIds=pickedIds();
  if(!lotIds.length)throw Error('Tick at least one copy record first — a draft-list row or a To buy requirement is not a copy yet; Set status is what those take.');
  C.review(title,body,{...command,lotIds});
}
actions['batch-clear']=()=>{picked.clear();C.render();};
/* THE SAME LADDER FOR A TICKED SET. Copy records change source; draft-list rows and To buy
   requirements become copies at that rung, filed with their deck -- one revision, one undo. */
actions['batch-status']=el=>{if(!picked.size)throw Error('Tick at least one row first.');popAt(el,`<p>Set ${picked.size} ticked record${picked.size===1?'':'s'} to</p>${LADDER.map(([id,label,why])=>rung(label,why,`data-action="batch-source" data-source="${id}"`)).join('')}`);};
actions['batch-source']=el=>{const source=el.dataset.source,label=C.source(source),{lots,plans}=pickedSplit();if(!lots.length&&!plans.length)throw Error('Tick at least one row first.');
  const commands=[];if(lots.length)commands.push({type:'bulk',op:'source',source,lotIds:lots,confirmed:true});
  for(const [deckId,rowsFor] of plans)commands.push({type:'acquireSlots',deckId,source,slotIds:rowsFor.map(r=>r.slotId),quantities:Object.fromEntries(rowsFor.map(r=>[r.slotId,r.quantity])),confirmed:true});
  const n=lots.length+plans.reduce((k,[,rowsFor])=>k+rowsFor.length,0);
  const what=source==='owned'?'Copy records become owned copies on the bench. Draft-list rows and To buy requirements become owned copies filed with their deck, reserved to it where the deck is finalized.'
    :M.PLANNED.includes(source)?`Copy records become ${label.toLowerCase()} — a plan, not a copy: box placements and reservations are cleared and the deck’s requirements return to To buy. Draft-list rows become ${label.toLowerCase()} copies filed with their deck.`
    :`Copy records become ${label.toLowerCase()}; an owned copy loses its box placement. Draft-list rows and To buy requirements become ${label.toLowerCase()} copies filed with their deck.`;
  C.review(`Set ${n} record${n===1?'':'s'} to ${label}`,note(what,source!=='owned'),commands.length===1?commands[0]:{type:'batch',commands,summary:`Set ${n} records to ${label}`});};
/* ONE ORDER FOR EVERYTHING TICKED. Eighty-five rows, one dialog -- vendor, reference, shipping,
   expected date -- and every ticked row becomes an ordered copy carrying that order: copy
   records change source, To buy requirements and draft rows become copies filed with their
   deck, shipping is spread per copy across all of them, and the sheet price is stamped as paid
   where nothing was recorded. Bought in store is the same with the store as vendor and the
   copies arriving in the same revision; Arrived is the ticked ordered copies landing on the
   bench with their reservations kept. */
const VENDORS=['Game Theory Wake Forest','Game Theory Raleigh','CCS Raleigh','TCGplayer','Card Kingdom','Trade','Other'];
C.VENDORS=VENDORS;
const priceOf=r=>Number.isFinite(r.card.price)&&r.card.price>=0?r.card.price:null;
function orderCommands({lots,plans},order,shipping,arrive){
  const rowsFor=lots.map(id=>findRow(id)).filter(Boolean);
  const copies=rowsFor.reduce((n,r)=>n+r.quantity,0)+plans.reduce((n,[,rs])=>n+rs.reduce((k,r)=>k+r.quantity,0),0);
  const record={...order,shipShare:copies&&shipping>0?Math.round(shipping/copies*10000)/10000:0};
  const commands=[];
  if(lots.length)commands.push({type:'order',lotIds:lots,order:record,shipping,paidByLot:Object.fromEntries(rowsFor.filter(r=>priceOf(r)!==null).map(r=>[r.recordId,priceOf(r)])),paidSource:'catalog',confirmed:true});
  for(const [deckId,rs] of plans)commands.push({type:'acquireSlots',deckId,source:arrive?'owned':'ordered',slotIds:rs.map(r=>r.slotId),quantities:Object.fromEntries(rs.map(r=>[r.slotId,r.quantity])),paidBySlot:Object.fromEntries(rs.filter(r=>priceOf(r)!==null).map(r=>[r.slotId,priceOf(r)])),paidSource:'catalog',order:record,confirmed:true});
  if(arrive&&lots.length)commands.push({type:'orderArrived',orderId:record.id});
  return {commands,copies};
}
const orderForm=(title,submitLabel,onSubmit,{store=false}={})=>form(title,
  s('Vendor','vendor',VENDORS.map(v=>[v,v]),store?VENDORS[0]:'TCGplayer')+f(store?'Receipt or note (optional)':'Order reference','ref','','maxlength="100"')+f('Shipping, spread across the lines ($)','shipping',store?'0':'','type="number" min="0" step="0.01"')+f(store?'Bought on':'Expected by','expectedBy',new Date().toISOString().slice(0,10),'type="date"'),
  onSubmit,submitLabel);
actions['batch-order']=()=>{const split=pickedSplit();if(!split.lots.length&&!split.plans.length)throw Error('Tick at least one row first.');
  orderForm('Order the ticked cards','Review order',v=>{const order={id:'order:'+C.uid(),vendor:v.vendor,ref:v.ref,expectedBy:v.expectedBy};const {commands,copies}=orderCommands(split,order,Number(v.shipping)||0,false);
    C.review(`Order ${copies} cop${copies===1?'y':'ies'} from ${v.vendor}`,note(`One order${v.ref?' · '+v.ref:''}: every ticked row becomes an ordered copy carrying it, the sheet price recorded as paid where nothing was, and ${C.money(Number(v.shipping)||0)} shipping spread per copy. Arrived → bench on the Orders tab lands the whole order at once.`),commands.length===1?commands[0]:{type:'batch',commands,summary:`Ordered ${copies} copies from ${v.vendor}`});});};
actions['batch-store']=()=>{const split=pickedSplit();if(!split.lots.length&&!split.plans.length)throw Error('Tick at least one row first.');
  orderForm('Bought in store','Review purchase',v=>{const order={id:'order:'+C.uid(),vendor:v.vendor,ref:v.ref||'in store',expectedBy:v.expectedBy};const {commands,copies}=orderCommands(split,order,Number(v.shipping)||0,true);
    C.review(`Bought ${copies} cop${copies===1?'y':'ies'} at ${v.vendor}`,note('Every ticked row becomes an owned copy on the bench, reserved where its deck is finalized, with the sheet price recorded as paid and the store as vendor.'),commands.length===1?commands[0]:{type:'batch',commands,summary:`Bought ${copies} copies at ${v.vendor}`});},{store:true});};
actions['batch-arrived']=()=>{const lotIds=pickedIds().filter(id=>{const l=C.state.lots.find(x=>x.id===id);return l&&(l.source==='ordered'||l.source==='incoming');});if(!lotIds.length)throw Error('Tick at least one ordered or incoming copy first.');
  const paidByLot=Object.fromEntries(lotIds.map(id=>{const r=findRow(id);return [id,r?priceOf(r):null];}).filter(([,p])=>p!==null));
  C.review(`${lotIds.length} record${lotIds.length===1?'':'s'} arrived`,note('The copies land on the bench, still reserved to their decks; the sheet price is recorded as paid where nothing was. Put them in their boxes from the pull sheet.'),{type:'bulk',op:'source',source:'owned',lotIds,paidByLot,paidSource:'catalog'});};
/* WHICH BOX A COPY SITS IN IS A FACT ABOUT THE COPY, so it is recorded here rather than as
   a deck-wide button on the deck page: tick the copies you sleeved and say where they went.
   Only copies already reserved for that deck can go in it -- the model refuses the rest by
   name, so a mistaken tick says which card and why instead of quietly moving it. */
actions['batch-place']=()=>{
  const lotIds=pickedIds();
  if(!lotIds.length)throw Error('Tick at least one copy record first.');
  const decks=C.state.decks.filter(d=>!d.archived&&d.status==='final');
  if(!decks.length)throw Error('Finalize a deck first — a draft holds no reservations to confirm.');
  form('Put these copies in a deck box',s('Deck','deckId',decks.map(d=>[d.id,d.name]),'')+f('Box label (optional)','box')+note('Records where these copies physically are. Ownership and reservations do not change. A ticked copy that is not reserved for this deck is refused by name.'),
    v=>C.review('Put these copies in a deck box',note(`${lotIds.length} record${lotIds.length===1?'':'s'} move into ${e(M.deck(C.state,v.deckId).name)}.`),{type:'bulk',op:'place',deckId:v.deckId,box:v.box,lotIds}),'Review placement');
};
actions['batch-bench']=()=>batch('Move these copies to the bench',note('Records the bench as where these copies physically are. Reservations are untouched — use Release reservation to give the deck requirements back to To buy.'),{type:'bulk',op:'bench'});
actions['batch-release']=()=>batch('Release these reservations',note('The deck requirements they filled become To buy again. The copies stay owned, in the same physical place.',true),{type:'bulk',op:'release'});
actions['batch-offer']=()=>batch('Offer these copies for Sell / Trade',note('Marks every ticked owned copy available to sell or trade. Reservations are untouched.'),{type:'bulk',op:'offer',offer:'available'});
actions['batch-group']=()=>{
  const lotIds=pickedIds();
  if(!lotIds.length)throw Error('Tick at least one copy record first.');
  if(!C.state.groups.length)throw Error('Create a collection group first.');
  form(`Add ${lotIds.length} record${lotIds.length===1?'':'s'} to a group`,s('Collection group','groupId',C.state.groups.map(g=>[g.id,g.name]),'')+note('Adds the ticked records to this group. Nothing leaves a group it is already in, and no ownership changes.'),
    v=>commit({type:'groupLots',groupId:v.groupId,lotIds}),'Add to group');
};
actions['shop-mode']=el=>{shopMode=el.dataset.mode;page=0;C.render();};actions['roster-filters']=()=>{expanded=!expanded;C.render();};actions['clear-filters']=()=>{for(const k of Object.keys(filter))filter[k]='';page=0;const view=C.route().view;if(view==='shop')shopGroupBy='deck';else groupBy='';C.go(view);};
actions['roster-columns']=()=>{const shop=C.route().view==='shop',current=shop?shopSelected:selected;form('Choose table columns',`<div class="cm-full cm-columns-grid">${columns.map(([k,l])=>`<label class="cm-checkbox"><input type="checkbox" name="${k}" ${current.includes(k)?'checked':''} ${k==='name'?'disabled':''}>${l}</label>`).join('')}</div>`,async data=>{const next=['name',...columns.filter(([k])=>k!=='name'&&data[k]).map(([k])=>k)];if(shop){shopSelected=next;await commit({type:'preferences',values:{shopColumns:next}});}else{selected=next;await commit({type:'preferences',values:{columns:next}});}},'Apply columns');};
/* DECK ASSEMBLY IS A PULL SHEET NOW. The Shop's second list was six hundred reserved copies in
   alphabetical order; assembling a deck at the table is one deck's sheet, grouped by where
   each card is sitting. So the button asks which deck and opens that deck's pull sheet. */
actions['pull-picker']=el=>{const decks=C.state.decks.filter(d=>!d.archived&&d.status==='final');if(!decks.length)throw Error('Finalize a deck first — a pull sheet lists a finalized deck’s reserved copies.');popAt(el,`<p>Pull sheet for</p>${decks.map(d=>{const r=M.readiness(C.state,d),n=r.pullFromBench+r.pullFromOtherBox+r.remove;return b(`${d.name}${n?` · ${n} to pull`:''}`,'deck-pull',{deck:d.id});}).join('')}`);};
/* The phone toolbar's menus. Each one is the control the desktop shows inline, folded
   into a tap so the bar stays one row on a 375px screen. */
actions['shop-tools']=el=>popAt(el,`<p>Cards</p>${b('Add cards','add-card')}${b('Import a list or library','import-list')}${b('Export this view (CSV)','export-view')}${b('Print buy list','print-buy-list')}${b('Columns','roster-columns')}<hr><p>Phone and computer</p>${b('Load an e-mailed backup…','restore')}${b('Send this library to e-mail…','share-export')}<hr>${b('Clear filters','clear-filters')}`);
/* The search field stays in the DOM whether or not it is showing, so the listener bound
   at render time keeps working and a typed query survives the toggle. */
actions['shop-search']=el=>{const row=$('#cm-shop-search');if(!row)return;searchOpen=row.hidden;row.hidden=!searchOpen;el.setAttribute('aria-expanded',String(searchOpen));if(searchOpen)$('#cm-roster-query').focus();};
/* ONE TAP, AT A BOOTH. The desktop's 'I bought this' opens a form -- quantity, source,
   print, box, notes -- which is right at a desk and wrong in a queue. Buy commits the
   same transaction for the whole row and says so; Undo in the header reverses it. */
/* THE PRIMARY ACTION IS ON THE ROW. A To buy row is bought or ordered; an ordered copy
   arrives. One tap, no dialog, and each stamps the sheet price as what was paid -- marked
   catalog, so a receipt can correct it later and the pool can count it now. The same
   transaction whatever the width; Undo in the header reverses it. */
const sheetPrice=r=>Number.isFinite(r.card.price)&&r.card.price>=0?r.card.price:null;
function primary(r){if(r.kind==='fold')return '';
  if(r.kind==='need'||r.kind==='lot'&&M.PLANNED.includes(r.source))return `<button class="v-button primary compact cm-row-buy" data-action="shop-buy" data-record="${e(r.recordId)}">Bought</button><button class="v-button compact cm-row-buy" data-action="shop-order" data-record="${e(r.recordId)}">Ordered</button>`;
  if(r.kind==='lot'&&(r.source==='ordered'||r.source==='incoming'))return `<button class="v-button primary compact cm-row-buy" data-action="shop-arrive" data-record="${e(r.recordId)}">Arrived</button>`;
  return '';}
async function oneTap(el,to){const r=findRow(el.dataset.record);if(!r)throw Error('That row changed. Refresh the view.');
  if(!buyable(r))throw Error('This copy is already recorded as owned.');
  const paid=sheetPrice(r);
  if(r.kind==='need')await commit({type:'acquire',cards:[r.card],lot:{cardId:r.cardId,quantity:r.quantity,source:to,printing:{...(r.printing||{})},location:{kind:'bench',box:''},notes:'',paid,paidSource:'catalog'},deckId:r.deckId,slotId:r.slotId});
  else{const l=M.lot(C.state,r.id);await commit({type:'source',source:to,lotId:l.id,quantity:l.quantity,paid,paidSource:'catalog',confirmed:true});}
  return r;}
actions['shop-buy']=async el=>{const r=await oneTap(el,'owned');C.notice(`${r.quantity>1?r.quantity+' × ':''}${r.card.name} ${r.quantity>1?'are':'is'} yours — on the bench until you put ${r.quantity>1?'them':'it'} in a deck box${sheetPrice(r)!==null?', '+C.money(sheetPrice(r))+' recorded as paid':''}. Undo is in the header menu.`);};
actions['shop-order']=async el=>{const r=await oneTap(el,'ordered');C.notice(`${r.card.name} marked Ordered${sheetPrice(r)!==null?' at '+C.money(sheetPrice(r)):''}. Arrived is on the row when it lands.`);};
actions['shop-arrive']=async el=>{const r=findRow(el.dataset.record);if(!r||r.kind!=='lot'||!(r.source==='ordered'||r.source==='incoming'))throw Error('Only an ordered or incoming copy can arrive.');const l=M.lot(C.state,r.id);await commit({type:'source',source:'owned',lotId:l.id,quantity:l.quantity,paid:sheetPrice(r),paidSource:'catalog',confirmed:true});C.notice(`${r.card.name} arrived — on the bench, still reserved. Put it in its deck box from the pull sheet.`);};
/* THE CAP CELL: what the listing is worth taking at. Under $2 the sheet price; above it the
   sheet plus 10%; at $5 and over the local store gets first refusal, and the cell says so. */
function capCell(price){const cap=R.capFor(price);if(cap===null)return '<span class="cm-muted">—</span>';return R.localOnly(price)?`<span class="cm-cap cm-cap-local">${C.money(cap)} <small>local only</small></span>`:`<span class="cm-cap">${C.money(cap)}</span>`;}
/* THE MONEY STRIP. Above the Shop's table only: how many to buy and what they cost at sheet
   prices, what is ordered and not yet paid for, and what is left of the season's pool --
   then the three price bands with counts and dollars, because "under a dollar" is the pile
   you buy without thinking and "over five" is the pile you take to the local store. The
   pool counts every `paid` stamped since preferences.poolStart, which defaults to the date
   the live collection was loaded. */
function poolStart(){const set=C.state.preferences.poolStart;if(set)return set;const live=C.state.lots.map(l=>l.provenance&&l.provenance.savedAt).filter(Boolean).sort().pop();return live||C.state.createdAt||'';}
function stripHTML(matched){const need=matched.filter(r=>r.kind==='need'),price=r=>r.card.price>0?r.card.price:0;
  const count=need.reduce((n,r)=>n+r.quantity,0),sheet=need.reduce((n,r)=>n+price(r)*r.quantity,0);
  const unpaid=matched.filter(r=>r.kind==='lot'&&(r.source==='ordered'||r.source==='incoming')&&!Number.isFinite(r.paid)).reduce((n,r)=>n+price(r)*r.quantity,0);
  const since=poolStart(),spent=C.state.lots.filter(l=>Number.isFinite(l.paid)&&(!since||(l.paidAt||'')>=since)).reduce((n,l)=>n+l.paid*l.quantity,0),left=R.RULES.pool-spent;
  const bands=(R.BANDS||[]).map(([key,label])=>{const rows=need.filter(r=>R.bandOf(r.card.price)===key);return {key,label,count:rows.reduce((n,r)=>n+r.quantity,0),dollars:rows.reduce((n,r)=>n+price(r)*r.quantity,0)};});
  const total=Math.max(1,count);
  return `<div class="cm-shop-strip"><p class="cm-shop-money">to buy <strong id="cm-shop-count">${count}</strong> · <strong id="cm-shop-total">${C.money(Math.round(sheet*100)/100)}</strong> at sheet prices · <strong>${C.money(Math.round(unpaid*100)/100)}</strong> ordered unpaid · <strong class="${left<0?'cm-over':''}">${C.money(Math.round(left*100)/100)}</strong> left in pool <small class="cm-muted">of ${C.money(R.RULES.pool)} since ${e(String(since).slice(0,10)||'the start')}</small></p><div class="cm-band-bar" role="img" aria-label="${e(bands.map(x=>`${x.label}: ${x.count} cards, ${C.money(Math.round(x.dollars*100)/100)}`).join('; '))}">${bands.map(x=>x.count?`<i class="cm-band-${x.key}" style="flex:${x.count/total} 1 0" title="${e(x.label)}"></i>`:'').join('')}</div><p class="cm-band-legend">${bands.map(x=>`<span><i class="cm-band-${x.key}"></i>${e(x.label)} · <b>${x.count}</b> · ${C.money(Math.round(x.dollars*100)/100)}</span>`).join('')}</p></div>`;}
/* THE PRINTED BUY LIST, by deck with subtotals -- shop-export.js draws it; this folds the
   visible To buy rows by card and says which decks want each one and how many. */
actions['print-buy-list']=()=>{if(!globalThis.MtgShopExport)throw Error('The print module is not loaded.');
  const by=new Map();for(const r of visibleRows.filter(r=>r.kind==='need')){const deck=r.deckId?M.deck(C.state,r.deckId).name:'Unassigned';const row=by.get(r.cardId)||{name:r.card.name,color:groupLabel(r,'color'),type:r.card.typeLine.split('—')[0].trim(),price:r.card.price,need:0,ordered:0,inHand:0,deckNames:[],needByDeck:{}};row.need+=r.quantity;row.needByDeck[deck]=(row.needByDeck[deck]||0)+r.quantity;if(!row.deckNames.includes(deck))row.deckNames.push(deck);by.set(r.cardId,row);}
  const [file]=MtgShopExport.build([...by.values()],{toBuy:true},{date:new Date().toISOString().slice(0,10),byDeck:true});
  const url=URL.createObjectURL(new Blob([file.content],{type:file.mime}));const tab=window.open(url,'_blank');if(!tab)C.download(file.filename,file.content,file.mime);setTimeout(()=>URL.revokeObjectURL(url),60000);};
function findRow(id){return visibleRows.find(r=>r.recordId===id)||lastRows.find(r=>r.recordId===id)||M.projection(C.state).find(r=>r.recordId===id);}

/* A COUNT AND A YES, NOT A DIALOG.
 *
 * Marking copies ordered, received or no-longer-wanted is one number and a confirmation
 * nobody was weighing -- and it cost a modal: the menu closed, a dialog opened over the
 * table, a paragraph explained what allocation does, and the answer was still "1". So the
 * three of them now open a strip beside the menu that launched it: fewer, the number,
 * more, and a green check that is the whole commit.
 *
 * It starts at 1, not at the whole lot. Marking one copy received is the common case, and
 * a default of "all of them" is the one mistake this control can make silently.
 *
 * The strip is a child of the menu so the browser treats it as a nested popover: clicking
 * it does not light-dismiss the menu behind it, and clicking anywhere else dismisses both.
 * That is the cancel path -- no confirmation of the cancel, because an untyped count is
 * not a decision anyone made.
 */
const count=(label,r,op,source='')=>b(label,'row-count',{record:r.recordId,op,source,max:r.quantity});

function stepperCommit(r,op,source,quantity){
  if(op==='acquire'){
    /* A need row has no lot yet, so the button's own label is the source and everything
       else takes the same defaults the Shop's one-tap Buy already commits. Set, collector,
       box and cost stay editable afterwards under Edit print & details. */
    return commit({type:'acquire',cards:[r.card],
      lot:{cardId:r.cardId,quantity,source,printing:{...(r.printing||{})},location:{kind:'bench',box:''},notes:'',paid:null},
      deckId:r.deckId,slotId:r.slotId});
  }
  /* A draft-list slot becomes a copy at this rung, filed with its deck; an uncommitted
     suggestion is not a slot the deck asks for, so its copy is simply filed with the group. */
  if(op==='plan'){const d=M.deck(C.state,r.deckId);
    if(r.kind==='draft')return commit({type:'acquireSlots',deckId:d.id,source,slotIds:[r.slotId],quantities:{[r.slotId]:quantity}});
    return commit({type:'acquire',cards:[r.card],lot:{cardId:r.cardId,quantity,source,printing:{...(r.printing||{})},location:{kind:'bench',box:''},notes:'',paid:null},...(d.groupId?{groupId:d.groupId}:{})});}
  /* A planned card in a group becomes a copy at this rung, and the plan shrinks by that many. */
  if(op==='entry')return commit({type:'batch',summary:`Recorded ${quantity} ${source} ${r.card.name} from the planned list`,commands:[{type:'acquire',cards:[r.card],lot:{cardId:r.cardId,quantity,source,printing:{...(r.printing||{})},location:{kind:'bench',box:''},notes:'',paid:null},groupId:r.groupId},{type:'removeGroupEntries',groupId:r.groupId,entryIds:[r.id],quantity}]});
  if(op==='entry-drop')return commit({type:'removeGroupEntries',groupId:r.groupId,entryIds:[r.id],quantity});
  if(r.kind!=='lot')throw Error('Select a physical or pending card record.');
  const l=M.lot(C.state,r.id);
  return commit({...(op==='cancel'?{type:'removePending'}:{type:'source',source}),lotId:l.id,quantity,confirmed:true});
}

actions['row-count']=el=>{
  const menu=el.closest('.cm-row-menu'),host=el.closest('.cm-menu')||menu,r=findRow(el.dataset.record);
  if(!r)throw Error('That row changed. Refresh the view.');
  const {op,source}=el.dataset,max=Math.max(1,Number(el.dataset.max)||1),label=el.dataset.label||el.textContent.trim();
  menu?.querySelectorAll('.cm-step').forEach(n=>n.remove());
  const step=document.createElement('div');
  step.className='cm-menu cm-step';step.setAttribute('popover','manual');
  step.innerHTML=`<button type="button" data-nudge="-1" aria-label="One fewer copy">◀</button>`
    +`<input type="number" value="1" min="1" max="${max}" step="1" inputmode="numeric" aria-label="${e(label)} — how many copies">`
    +`<button type="button" data-nudge="1" aria-label="One more copy">▶</button>`
    +`<button type="button" class="cm-step-ok" aria-label="${e(label)}">✓</button>`;
  (host||document.body).append(step);
  step.showPopover();
  const box=el.getBoundingClientRect(),bounds=(host||el).getBoundingClientRect();
  step.style.left=Math.max(8,Math.min(innerWidth-step.offsetWidth-8,bounds.left-step.offsetWidth-8))+'px';
  step.style.top=Math.max(8,Math.min(innerHeight-step.offsetHeight-8,box.top-3))+'px';
  const field=$('input',step),close=()=>{if(step.matches(':popover-open'))step.hidePopover();step.remove();};
  const clamp=()=>{const n=Math.round(Number(field.value)||1);field.value=String(Math.min(max,Math.max(1,n)));};
  field.focus();field.select();
  step.addEventListener('click',ev=>{
    const nudge=ev.target.closest('[data-nudge]');
    if(nudge){field.value=String(Number(field.value||1)+Number(nudge.dataset.nudge));clamp();field.focus();return;}
    if(!ev.target.closest('.cm-step-ok'))return;
    clamp();const quantity=Number(field.value);
    close();menu?.hidePopover();
    Promise.resolve(stepperCommit(r,op,source,quantity)).catch(error=>C.notice(error.message,true));
  });
  /* Left and right on the field are the same two buttons, so the count can be set without
     leaving the keyboard; Enter is the check and Escape is the click-outside. */
  field.addEventListener('keydown',ev=>{
    if(ev.key==='ArrowLeft'||ev.key==='ArrowRight'){ev.preventDefault();
      field.value=String(Number(field.value||1)+(ev.key==='ArrowRight'?1:-1));clamp();}
    else if(ev.key==='Enter'){ev.preventDefault();$('.cm-step-ok',step).click();}
    else if(ev.key==='Escape'){ev.preventDefault();close();menu?.hidePopover();}
  });
  field.addEventListener('change',clamp);
  menu?.addEventListener('toggle',ev=>{if(ev.newState==='closed')close();});
};
actions['pin-slot']=el=>{const r=M.slot(C.state,el.dataset.deck,el.dataset.slot);return C.commit({type:'pin',deckId:el.dataset.deck,slotId:r.id,pinned:!r.pinned});};
/* TYPE IT WHERE YOU READ IT. The cell becomes an input in place: Enter commits, Escape
   puts the old value back, and clicking away commits too -- because the reader has already
   moved on and asking them to come back and press something is the friction this removed.
   The input replaces the button rather than nesting inside it (a control inside a button is
   invalid, and browsers disagree about what it does), and the cell swallows the click so
   the row underneath does not open the card while you are typing in it. */
actions['cell-edit']=el=>{
  const r=findRow(el.dataset.record),field=el.dataset.field;
  if(!r||r.kind!=='lot')throw Error('Select a physical or pending card record.');
  if(!Object.hasOwn(EDITS,field))throw Error('That column cannot be edited here.');
  const cell=el.closest('td');
  if(!cell||cell.querySelector('input'))return;
  const l=M.lot(C.state,r.id),paid=field==='paid';
  const input=document.createElement('input');
  input.type='number';input.className='cm-cell-input';
  input.min=paid?'0':'1';input.step=paid?'0.01':'1';
  input.value=paid?(Number.isFinite(l.paid)?String(l.paid):''):String(l.quantity);
  input.setAttribute('aria-label',`${EDITS[field]} for ${r.card.name}`);
  if(paid)input.placeholder='Unknown';
  cell.textContent='';cell.append(input);
  cell.addEventListener('click',ev=>ev.stopPropagation());
  input.focus();input.select();
  let settled=false;
  const revert=()=>{if(settled)return;settled=true;C.render();};
  const save=async()=>{
    if(settled)return;settled=true;
    const raw=input.value.trim();
    try{
      if(paid)await commit({type:'editLot',lotId:l.id,paid:raw===''?null:Number(raw)});
      else await commit({type:'quantity',lotId:l.id,quantity:Number(raw),confirmed:true});
    }catch(error){C.notice(error.message,true);C.render();}
  };
  input.addEventListener('keydown',ev=>{
    if(ev.key==='Enter'){ev.preventDefault();save();}
    else if(ev.key==='Escape'){ev.preventDefault();revert();}
  });
  input.addEventListener('blur',save);
};
/* THE STATUS FLY-OUT. The rungs were separate entries scattered through the row menu under
   three different verbs, and a draft-list row had none of them at all: a deck saved from the
   Lab is a hundred plans, and the reader who already owned forty of them had nowhere to say
   so. Every row now carries Status, which pops out to the left with the ladder in order, the
   current rung marked, and Delete under a rule at the bottom.

   What a rung DOES depends on what the row is. A copy record changes its source. A To buy
   requirement, a draft-list slot or a planned group entry BECOMES a copy record at that rung,
   filed with its deck or group -- and reserved to its slot where the deck is finalized. Moving
   an owned copy back down is the one move that loses something (the box it sits in, the deck
   it is reserved to), so that one asks through a dialog that says what goes; every other
   move is the count strip. */
function statusMenu(r){
  const current=r.kind==='lot'?r.source:r.kind==='need'?'wanted':'';
  const items=LADDER.map(([id,label,why])=>{
    if(r.kind==='need'&&id==='watching')return '';
    if(id===current)return rung(label,r.kind==='need'?'this requirement is already on the to-buy list':'current status','disabled aria-current="true"',true);
    const loses=r.kind==='lot'&&r.source==='owned'&&(r.allocation||r.location?.kind==='deck');
    if(loses)return rung(label,'clears its box and reservation — asks first',`data-action="status-dialog" data-record="${e(r.recordId)}" data-source="${id}"`);
    const op=r.kind==='lot'?'source':r.kind==='need'?'acquire':r.kind==='entry'?'entry':'plan';
    return rung(label,why,`data-action="row-count" data-record="${e(r.recordId)}" data-op="${op}" data-source="${id}" data-max="${r.quantity}"`);
  }).join('');
  const del=r.kind==='lot'&&r.source==='owned'?`<button type="button" class="cm-danger" data-action="dispose-row" data-record="${e(r.recordId)}">Delete… (sold, traded, lost)</button>`
    :r.kind==='lot'?`<button type="button" class="cm-danger" data-action="row-count" data-record="${e(r.recordId)}" data-op="cancel" data-max="${r.quantity}" data-label="Delete this record">Delete this record</button>`
    :r.kind==='draft'?`<button type="button" class="cm-danger" data-action="drop-slot" data-record="${e(r.recordId)}">Delete from the draft list</button>`
    :r.kind==='option'?`<button type="button" class="cm-danger" data-action="remove-option" data-deck="${e(r.deckId)}" data-slot="${e(r.slotId)}">Delete this suggestion</button>`
    :r.kind==='entry'?`<button type="button" class="cm-danger" data-action="row-count" data-record="${e(r.recordId)}" data-op="entry-drop" data-max="${r.quantity}" data-label="Delete the planned card">Delete the planned card</button>`
    :'<p class="cm-menu-fine">A deck requirement is removed by replacing the card or editing the deck list.</p>';
  return `<p>Status</p>${items}<hr>${del}`;
}
/* A SUBMENU POPS OUT TO THE LEFT and stays while the pointer is in it. Hover opens it, so does
   a click (a phone has no hover) and Left arrow from the keyboard; leaving it, Escape, Right
   arrow, choosing an entry, or the menu closing shuts it. Opening one closes the other. On a
   screen too narrow to hold it beside the menu it lies over the menu instead. */
function wireSubmenu(menu,id){
  const toggle=$('#'+id+'-toggle',menu),sub=$('#'+id,menu);if(!toggle||!sub)return;let timer;
  const close=()=>{clearTimeout(timer);if(sub.matches(':popover-open'))sub.hidePopover();toggle.setAttribute('aria-expanded','false');};
  const open=()=>{clearTimeout(timer);
    for(const other of menu.querySelectorAll('.cm-side-submenu'))if(other!==sub&&other.matches(':popover-open'))other.hidePopover();
    for(const t of menu.querySelectorAll('.cm-submenu-toggle'))if(t!==toggle)t.setAttribute('aria-expanded','false');
    if(!sub.matches(':popover-open'))sub.showPopover();
    const bounds=menu.getBoundingClientRect(),t=toggle.getBoundingClientRect(),left=bounds.left-sub.offsetWidth-8;
    sub.style.left=(left<8?Math.max(8,Math.min(bounds.left,innerWidth-sub.offsetWidth-8)):left)+'px';
    sub.style.top=Math.max(8,Math.min(innerHeight-sub.offsetHeight-8,t.top))+'px';toggle.setAttribute('aria-expanded','true');};
  toggle.addEventListener('pointerenter',open);toggle.addEventListener('click',open);toggle.addEventListener('focus',open);
  toggle.addEventListener('pointerleave',()=>{timer=setTimeout(close,260);});
  toggle.addEventListener('keydown',ev=>{if(ev.key==='ArrowLeft'){ev.preventDefault();open();sub.querySelector('button:not([disabled])')?.focus();}});
  sub.addEventListener('pointerenter',()=>clearTimeout(timer));sub.addEventListener('pointerleave',()=>{timer=setTimeout(close,220);});
  sub.addEventListener('keydown',ev=>{if(ev.key==='Escape'||ev.key==='ArrowRight'){ev.preventDefault();close();toggle.focus();}});
  sub.addEventListener('click',ev=>{if(ev.target.closest('[data-action=row-count],.cm-step,[disabled]'))return;close();});
  menu.addEventListener('toggle',ev=>{if(ev.newState==='closed')close();});
}
actions['row-actions']=el=>{const r=findRow(el.dataset.record);if(!r)throw Error('That row changed. Refresh the view.');document.querySelectorAll('.cm-row-menu').forEach(m=>m.remove());const menu=document.createElement('div');menu.className='cm-menu cm-row-menu';menu.setAttribute('popover','auto');
  const flyout=(id,label,body)=>`<button type="button" id="${id}-toggle" class="cm-submenu-toggle" aria-expanded="false" aria-controls="${id}" aria-haspopup="menu">${e(label)} ${C.caret('left')}</button><div id="${id}" class="cm-menu cm-side-submenu" popover="manual">${body}</div>`;
  const slotId=r.slotId||r.allocation?.slotId,finals=C.state.decks.filter(d=>!d.archived&&d.status==='final');
  menu.innerHTML=`<p>${e(r.card.name)} · ${r.quantity}${r.kind==='draft'?' · Draft list':r.kind==='need'?' · To buy':''}</p>`
    +(r.kind==='fold'?'':flyout('cm-status-submenu','Status',statusMenu(r)))
    +(r.kind==='lot'&&r.source==='owned'?flyout('cm-put-submenu','Put in deck',finals.map(d=>b(d.name,'place-row',{record:r.recordId,deck:d.id})).join('')||'<p>Finalize a matching deck first.</p>')+b('Move physically to Bench','place-row',{record:r.recordId})+b('Sell / Trade','offer-row',{record:r.recordId}):'')
    +(r.kind==='lot'&&!M.PLANNED.includes(r.source)?b('Reserve for a deck','reserve-row',{record:r.recordId}):'')
    +(r.kind==='lot'&&r.allocation?b('Release reservation → To buy','release-row',{record:r.recordId}):'')
    +(r.kind==='lot'?b('Edit print & details','edit-row',{record:r.recordId})+b('Add / move to group','group-row',{record:r.recordId}):'')
    +(r.kind==='entry'?b('Move / copy to group','group-entry-row',{record:r.recordId}):'')
    +(r.deckId&&slotId?b(M.slot(C.state,r.deckId,slotId).pinned?'Unpin slot':'Pin slot','pin-slot',{deck:r.deckId,slot:slotId})+b('Replacements & options','replacement',{deck:r.deckId,slot:slotId}):'')
    +b('Add another copy','add-card',{card:r.cardId});
  document.body.append(menu);menu.showPopover();const rect=el.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,rect.right-menu.offsetWidth))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,rect.bottom+5))+'px';
  wireSubmenu(menu,'cm-status-submenu');wireSubmenu(menu,'cm-put-submenu');
  menu.addEventListener('click',ev=>{const hit=ev.target.closest('[data-action]');if(hit&&hit.dataset.action!=='row-count')menu.hidePopover();});};
/* THE ONE MOVE THAT LOSES SOMETHING. An owned copy sitting in a deck box, or reserved to a
   deck, corrected back below Owned: the box placement goes -- a copy you do not hold is not in
   a box -- and below Ordered the reservation goes too. So it asks, with the count, and says
   exactly that. */
actions['status-dialog']=el=>{const source=el.dataset.source,label=C.source(source),planned=M.PLANNED.includes(source);
  return quantityAction(el,'Change status to '+label,l=>note(`${l.location?.kind==='deck'?`These copies are physically in ${M.deck(C.state,l.location.deckId).name}; that placement is cleared, because a copy you do not hold is not in a box. `:''}${l.allocation?(planned?`They are reserved for ${M.deck(C.state,l.allocation.deckId).name}; ${label} is a plan rather than a copy, so the reservation is released and the deck’s requirement returns to To buy.`:`They stay reserved for ${M.deck(C.state,l.allocation.deckId).name} as ${label.toLowerCase()} copies.`):''}`,true),()=>({type:'source',source}));};
/* A draft-list row is a plan in a draft deck, so Delete edits the plan: the slot leaves the
   list and any suggestion linked to it goes with it. The commander stays. */
actions['drop-slot']=el=>{const r=findRow(el.dataset.record);if(!r||r.kind!=='draft')throw Error('Only a draft-list row can be removed here.');const d=M.deck(C.state,r.deckId);if(d.commanders.includes(r.cardId))throw Error('The commander stays in the list. Replace it, or change it in the Deck Lab.');
  C.review(`Remove ${r.card.name} from ${d.name}`,note(`${d.name} is a draft, so this edits the plan only; no copies change hands.`),{type:'editDeck',deckId:d.id,slots:d.slots.filter(x=>x.id!==r.slotId&&x.replaces!==r.slotId)});};
const printFields=p=>f('Set code','set',p?.set||'','maxlength="30"')+f('Collector number','collector',p?.collector||'','maxlength="40"')+s('Finish','finish',[['','Unspecified'],['nonfoil','Nonfoil'],['foil','Foil'],['etched','Etched']],p?.finish||'')+f('Language','language',p?.language||'')+f('Condition','condition',p?.condition||'')+`<label class="cm-checkbox"><input type="checkbox" name="signed" ${p?.signed?'checked':''}>Signed</label><label class="cm-checkbox"><input type="checkbox" name="altered" ${p?.altered?'checked':''}>Altered</label>`;
function printing(v,prior={}){return {...prior,set:v.set,collector:v.collector,finish:v.finish,language:v.language,condition:v.condition,signed:!!v.signed,altered:!!v.altered};}
async function acquire(c,{row,initialSource='owned'}={}){form('Record '+c.name,`<div class="cm-full">${note(row?'These copies will fulfill this deck requirement. Physical placement remains Bench until you confirm Put in deck.':'Record copies you own, ordered or arranged to receive — or mark a card Wanted to buy later, with no vendor chosen yet. A deck plan alone creates no ownership.')}</div>`+f('Quantity','quantity',row?.quantity||1,'type="number" min="1" max="1000000" required')+s('Source','source',[['owned','Owned'],['ordered','Ordered'],['incoming','Incoming trade'],['wanted','Wanted — not yet ordered'],['watching','Watching — keeping an eye on it']],initialSource)+printFields(row?.printing)+f('Box / location when owned','box')+f('Purchase cost (optional)','paid','','type="number" min="0" step="0.01"')+`<label class="cm-full">Notes<textarea name="notes"></textarea></label>`,async v=>{let exact=c,p=printing(v);if(p.set&&p.collector){exact=await C.catalog.resolve(c.name,{printing:p});if(!exact)throw Error('No exact printing found. Check the set and collector number.');p.id=exact.scryfallId;}await commit({type:'acquire',cards:[exact],lot:{cardId:exact.id,quantity:Number(v.quantity),source:v.source,printing:p,location:{kind:'bench',box:v.box},notes:v.notes,paid:v.paid===''?null:Number(v.paid)},...(row?{deckId:row.deckId,slotId:row.slotId}: {})});},'Record copies');}
actions['add-card']=el=>el.dataset.card?acquire(C.state.cards[el.dataset.card]||C.catalog.get(el.dataset.card)):C.cardPicker('Add to your library',c=>acquire(c));
function quantityAction(el,title,extra,build){const r=findRow(el.dataset.record);if(!r||r.kind!=='lot')throw Error('Select a physical or pending card record.');const l=M.lot(C.state,r.id);return form(title,`<div class="cm-full">${note(C.affected(l),!!l.allocation||l.location?.kind==='deck')}</div>`+f('Copies affected','quantity',l.quantity,`type="number" min="1" max="${l.quantity}" required`)+extra(l),v=>commit({...build(l,v),lotId:l.id,quantity:Number(v.quantity),confirmed:true}),'Confirm change');}
actions['place-row']=el=>quantityAction(el,el.dataset.deck?'Put in '+M.deck(C.state,el.dataset.deck).name:'Move physically to Bench',()=>f('Box label (optional)','box'),(_,v)=>({type:'place',deckId:el.dataset.deck||undefined,box:v.box}));
actions['reserve-row']=el=>quantityAction(el,'Reserve copies for a deck',l=>s('Target deck','deck',C.state.decks.filter(d=>d.status==='final'&&!d.archived&&d.slots.some(r=>r.committed&&M.compatible(l,r)&&M.shortfall(C.state,d,r)>0)).map(d=>[d.id,d.name]),'')+note('This changes the reservation and exposes any donor deck shortfall. The physical box stays unchanged. Locked and In deck donors require this explicit confirmation.',true),(l,v)=>{if(!v.deck)throw Error('No finalized deck has a compatible unfulfilled requirement. Accept a matching replacement first.');const d=M.deck(C.state,v.deck),r=d.slots.find(r=>r.committed&&M.compatible(l,r)&&M.shortfall(C.state,d,r)>=Number(v.quantity));if(!r)throw Error('This quantity exceeds the matching requirement. Reduce the quantity or choose another deck.');return {type:'allocate',deckId:d.id,slotId:r.id};});
actions['release-row']=el=>quantityAction(el,'Release these copies',()=>note('The reservation becomes unfulfilled (To buy). Owned copies remain owned, with the same last confirmed physical location.'),()=>({type:'release',destination:'bench'}));
actions['offer-row']=el=>quantityAction(el,'Sell / Trade collection',l=>s('Availability','offer',[['none','Remove from Sell / Trade'],['available','Available for sale / trade'],['held','Held for a pending deal']],l.offer)+note('Available offers remain candidates for builds. A pending deal releases a deck allocation and protects the copy from automatic reuse.'),(_,v)=>({type:'offer',offer:v.offer}));
actions['dispose-row']=el=>quantityAction(el,'Record copies leaving your library',()=>s('Reason','reason',[['sold','Sold'],['traded','Traded away'],['lost','Lost'],['gifted','Gifted'],['correction','Inventory correction']],'sold')+note('Confirm only after the copies have left your ownership. This reduces owned quantity and restores any unfulfilled deck needs.',true),(_,v)=>({type:'dispose',reason:v.reason}));
actions['edit-row']=el=>{const r=findRow(el.dataset.record),l=M.lot(C.state,r.id);form('Exact print & copy details',printFields(l.printing)+f('Price paid (optional)','paid',l.paid??'','type="number" min="0" step="0.01"')+`<label class="cm-full">Notes<textarea name="notes">${e(l.notes)}</textarea></label><label class="cm-checkbox cm-full"><input type="checkbox" name="keepBench" ${l.keepBench?'checked':''}>Keep on bench during automatic fulfillment</label>`,async v=>{const p=printing(v,l.printing);if(p.set&&p.collector){const c=await C.catalog.resolve(r.card.name,{printing:p});if(!c)throw Error('Printing not found.');p.id=c.scryfallId;}else if(p.set!==l.printing.set||p.collector!==l.printing.collector)p.id='';await commit({type:'editLot',lotId:l.id,printing:p,notes:v.notes,paid:v.paid===''?null:Number(v.paid),keepBench:!!v.keepBench});});};
actions['new-group']=()=>form('New Collection group',f('Group name','name','','required maxlength="100"'),async v=>{const id='group:'+C.uid();await commit({type:'createGroup',groupId:id,name:v.name});C.go('collection',{group:id});},'Create group');
actions['group-row']=el=>{const r=findRow(el.dataset.record);if(!C.state.groups.length)return actions['new-group']();form('Add or move to Collection group',s('Destination group','group',C.state.groups.map(g=>[g.id,g.name]),C.state.groups[0].id)+s('Remove previous membership (optional)','from',[['','Keep existing memberships'],...r.groupIds.map(id=>[id,C.state.groups.find(g=>g.id===id).name])],''),v=>commit({type:'groupLots',lotIds:[r.id],groupId:v.group,moveFrom:v.from||undefined}));};
actions['group-entry-row']=el=>{const r=findRow(el.dataset.record);if(C.state.groups.length<2)throw Error('Create another Collection group first.');form('Move or copy planned card',s('Destination group','to',C.state.groups.filter(g=>g.id!==r.groupId).map(g=>[g.id,g.name]),'')+s('Action','operation',[['move','Move planned entry'],['copy','Copy planned entry']],'move'),v=>commit({type:'moveGroupEntries',from:r.groupId,to:v.to,entryIds:[r.id],copy:v.operation==='copy'}));};
actions['manage-group']=el=>{const g=C.state.groups.find(g=>g.id===el.dataset.group);form('Manage '+g.name,f('Group name','name',g.name,'required')+`<div class="cm-full">${b('Import cards into this group','import-list',{group:g.id})}${b('Delete group','delete-group',{group:g.id})}</div>`,v=>commit({type:'renameGroup',groupId:g.id,name:v.name}));};actions['delete-group']=el=>C.review('Delete Collection group',note('Library copies remain owned. Group memberships and its draft entries will be removed.'),{type:'deleteGroup',groupId:el.dataset.group});
actions.replacement=el=>{const d=M.deck(C.state,el.dataset.deck),r=M.slot(C.state,d.id,el.dataset.slot);const main=r.purpose==='main'?r:M.slot(C.state,d.id,r.replaces),options=d.slots.filter(x=>x.replaces===main.id);modal('Options for '+C.state.cards[main.cardId].name,`${note('Suggestions stay outside the committed hundred until you accept a replacement. Released owned copies fulfill compatible needs elsewhere, then move to Bench allocation. Their physical box remains recorded.')}${options.map(o=>`<article><h3>${e(C.state.cards[o.cardId].name)}</h3><p>${e(o.purpose)}${o.targetBracket?' · B'+o.targetBracket:''} · ${o.committed?'Reserved option':'Suggestion'}</p>${b('Accept replacement','accept-option',{deck:d.id,slot:o.id})}${b('Remove option','remove-option',{deck:d.id,slot:o.id})}</article>`).join('')||'<p>No linked options yet.</p>'}<div class="cm-actions">${b('Choose a replacement','choose-replacement',{deck:d.id,slot:main.id},true)}${b('Add upgrade / bracket option','choose-option',{deck:d.id,slot:main.id})}</div>`);};
/* A REPLACEMENT IS FOR A PARTICULAR CARD. The picker used to open on the catalog's most
   popular cards, which offered The Restoration of Eiganjo for Abrade -- a suggestion with
   nothing to do with the card being replaced. It now ranks by likeness to that card and
   filters to the deck's colour identity, and the confirmation shows both cards, both
   prices and both TCGplayer pages side by side, because a swap decided from two names in
   a sentence is a swap decided blind. */
actions['choose-replacement']=el=>{
  const d=M.deck(C.state,el.dataset.deck),r=M.slot(C.state,d.id,el.dataset.slot);
  const out=C.state.cards[r.cardId]||C.catalog.get(r.cardId);
  if(!out)throw Error('That slot names a card the library no longer holds.');
  const identity=[...new Set(d.commanders.map(id=>C.state.cards[id]||C.catalog.get(id)).filter(Boolean).flatMap(c=>c.colorIdentity||[]))];
  C.cardPicker('Replace '+out.name,async c=>{
    /* Prices and art for the comparison, best effort: offline, the two cards are still
       shown with whatever the library already knows about them. */
    let a=out,b=c;
    try{[a,b]=await Promise.all([C.catalog.details(out),C.catalog.details(c)]);}catch{}
    C.review('Replace '+a.name+' with '+b.name,
      C.compareCards(a,b,{outLabel:'Out of the deck',intoLabel:'Into the deck'})
        +note('The main slot keeps its quantity. Reallocation never changes the number of cards you own.',true),
      {type:'swap',deckId:d.id,slotId:r.id,cardId:b.id,cards:[b],commander:d.commanders.includes(r.cardId)?r.cardId:undefined});
  },{like:out,colors:identity});
};
actions['choose-option']=el=>C.cardPicker('Choose an upgrade or bracket option',c=>{const d=M.deck(C.state,el.dataset.deck);form('Link '+c.name,s('Purpose','purpose',[['upgrade','Upgrade for this slot'],['bracket','Bracket bump option']],'upgrade')+s('Target bracket (bracket options only)','target',[1,2,3,4,5],Math.min(5,d.definition.baseBracket+1))+`<label class="cm-checkbox"><input type="checkbox" name="reserve">Reserve / add to acquisition plan now</label>`,v=>commit({type:'option',deckId:d.id,replaces:el.dataset.slot,cards:[c],option:{cardId:c.id,quantity:1,purpose:v.purpose,targetBracket:v.purpose==='bracket'?Number(v.target):null},reserve:!!v.reserve}));});
actions['accept-option']=el=>C.review('Accept linked option',note('Promotes this option into the main slot, retains any compatible reserved copy, and releases the previous card.'),{type:'acceptOption',deckId:el.dataset.deck,slotId:el.dataset.slot});actions['remove-option']=el=>C.review('Remove linked option',note('Owned copies remain owned. The optional requirement is removed.'),{type:'removeOption',deckId:el.dataset.deck,slotId:el.dataset.slot});
actions['export-view']=()=>{const shop=C.route().view==='shop',chosen=shop?shopSelected:selected;const rows=visibleRows.map(r=>Object.fromEntries(columns.map(([k])=>[k,value(r,k)])));
  /* The Shop's sheet carries its arithmetic: a subtotal line per deck and a total, in the
     same columns, so the file agrees with the strip above the table it came from. */
  if(shop){const need=visibleRows.filter(r=>r.kind==='need'),sub=new Map();for(const r of need){const deck=r.deckId?M.deck(C.state,r.deckId).name:'Unassigned';const s=sub.get(deck)||{n:0,d:0};s.n+=r.quantity;s.d+=(r.card.price>0?r.card.price:0)*r.quantity;sub.set(deck,s);}
    for(const [deck,s] of [...sub].sort())rows.push({name:`Subtotal · ${deck}`,deck,quantity:s.n,price:Math.round(s.d*100)/100});rows.push({name:'Total to buy',quantity:need.reduce((n,r)=>n+r.quantity,0),price:Math.round([...sub.values()].reduce((n,s)=>n+s.d,0)*100)/100});}
  const cols=columns.filter(([k])=>chosen.includes(k)||shop&&['price','cap','vendor','deck'].includes(k)).map(([key,label])=>({key,label}));C.download(shop?'CrankMagic-buy-list.csv':'CrankMagic-filtered-roster.csv',C.E.csv(rows,cols),'text/csv');C.notice('Exported the complete filtered view, including rows beyond the current page.');};
});
