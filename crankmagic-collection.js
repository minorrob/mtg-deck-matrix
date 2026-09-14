/* Every roster is the same semantic table projection. Source, allocation and
 * physical box have separate columns; hiding a column cannot change the model. */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,esc:e,button:b,field:f,select:s,note,form,modal,commit,actions,views,$}=C;let foldPrints=false;let filter={q:'',type:'',subtype:'',mechanic:'',color:'',status:'',offer:'',min:'',max:'',price:'',group:'',flag:'',mana:''},sort={key:'name',dir:1},page=0,expanded=false,groupBy='',shopGroupBy='deck',visibleRows=[],lastRows=[],collapsed=new Set(),collapsedKey='';
const columns=[['name','Card'],['type','Type'],['status','Status'],['deck','Deck'],['subtype','Subtype'],['mechanic','Mechanic'],['color','Color'],['rarity','Rarity'],['mana','Mana value'],['price','Price'],['cap','Cap'],['vendor','Vendor'],['paid','Paid'],['source','Source'],['placement','Allocation'],['box','Physical location'],['purpose','Purpose'],['quantity','Quantity'],['printing','Printing'],['offer','Sell / Trade'],['groups','Groups']];
const defaults=['name','type','status','deck','quantity','paid'];let selected=null;
/* A column set saved before Status existed names Source and Allocation; it reads as Status
   in their place, and is only rewritten when the reader next changes columns. */
const withStatus=list=>{if(!Array.isArray(list))return null;if(list.includes('status'))return list;const at=list.findIndex(k=>k==='source'||k==='placement');if(at<0)return list;const out=list.filter(k=>k!=='source'&&k!=='placement');out.splice(at,0,'status');return out;};
/* THE SHOP'S COLUMNS ARE THE MONEY COLUMNS, at every width. The desktop Shop showed the
   Collection's columns -- print, purpose, allocation -- and no price; the phone showed a
   price and a Buy button; the two disagreed about what shopping is. One set now, and the
   Columns dialog on the Shop edits this set rather than the Collection's. */
const SHOP_DEFAULTS=['name','color','type','status','price','cap','deck','quantity','paid'];let shopSelected=null;
/* ONE ROW PER CARD is the Shop's default: a card three decks want is one line saying ×3 · D2,
   D3, D5, and Bought on it buys for all three. The Collection stays one row per copy lot.
   Both are remembered with the column preferences, as is the page size. */
let pageSize=60;
const foldFor=shop=>shop?(C.state.preferences.shopFold??true):(C.state.preferences.foldPrints??false);
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
    return quantity<1?null:{recordId:'plan:'+d.id+':'+r.id,kind:r.committed?'draft':'option',deckId:d.id,slotId:r.id,cardId:r.cardId,card:C.card(r.cardId),quantity,source:'draft',placement:r.committed?'Draft list':'Suggestion',purpose:r.purpose,pinned:!!r.pinned,option:!!r.option,optionWhy:r.optionWhy||'',printing:r.printing,offer:'none',groupIds:d.groupId?[d.groupId]:[]};
  }).filter(Boolean);
}
/* ONE COLUMN FOR THE STATE. Source (owned, ordered, watching) and Allocation (Physical deck,
   Substitute, Reserved, Bench) were two columns saying one thing between them. Status is that
   one thing: an owned copy's placement; Ordered; Watched; To buy for a requirement; Draft
   list, Suggestion or Planned for a row that is not a copy yet. The colour is the state. */
const statusOf=M.statusOf;   // the model's status vocabulary (M.STATUS); the words are spelled there and nowhere here
function rows(params,shop){let all=M.projection(C.state);for(const d of C.state.decks.filter(d=>!d.archived))all.push(...plans(d));const gid=params.get('group')||filter.group;for(const g of C.state.groups)all.push(...g.entries.map(r=>({...r,recordId:'entry:'+g.id+':'+r.id,kind:'entry',card:C.card(r.cardId),source:'draft',placement:'Draft list',purpose:'',offer:'none',groupIds:[g.id],deckId:'',groupId:g.id})));if(params.get('card'))all=all.filter(r=>r.cardId===params.get('card'));if(params.get('deck'))all=all.filter(r=>r.deckId===params.get('deck')||r.standInDeckId===params.get('deck'));if(gid)all=all.filter(r=>r.groupIds.includes(gid));if(shop)all=all.filter(r=>r.kind==='need'||r.kind==='lot'&&r.source!=='owned');for(const r of all)r.status=statusOf(r);return all;}
function value(r,key){const c=r.card;return ({name:c.name,type:c.typeLine.split('—')[0].trim(),subtype:c.typeLine.split('—')[1]?.trim()||'',mechanic:(c.mechanics.length?c.mechanics:c.keywords).join(', '),color:c.colorIdentity.join(''),rarity:({common:'Common',uncommon:'Uncommon',rare:'Rare',mythic:'Mythic',special:'Special',bonus:'Bonus',c:'Common',u:'Uncommon',r:'Rare',m:'Mythic',s:'Special',b:'Bonus'})[String(c.rarity||'').toLowerCase()]||'',mana:c.manaValue,price:c.price,cap:R.capFor(c.price),vendor:r.kind==='lot'?(r.order&&r.order.vendor||r.vendor||''):'',paid:r.kind==='lot'&&Number.isFinite(r.paid)?r.paid:null,source:C.source(r.source),placement:r.placement,status:r.status||statusOf(r),deck:r.deckId?M.deck(C.state,r.deckId).name:(r.standIn&&r.standInDeckId?M.deck(C.state,r.standInDeckId).name+' · substitute':''),box:r.kind==='lot'?C.readableLocation(r):'',purpose:r.purpose==='main'?'Main deck':r.purpose==='bracket'?'Bracket option':r.purpose==='upgrade'?'Upgrade':'',quantity:r.quantity,groups:r.groupIds.map(id=>C.state.groups.find(g=>g.id===id)?.name||'').join(', '),printing:[r.printing?.set,r.printing?.collector,r.printing?.finish,r.printing?.language,r.printing?.condition].filter(Boolean).join(' · ')||'Unspecified',offer:r.offer==='none'?'':r.offer==='held'?'Pending deal':'Sell / Trade'})[key];}
/* GROUPING IS NOT THE SAME QUESTION AS SORTING. The Color column prints a card's identity
   letters, which as a grouping would make a heading per colour pair and answer nothing:
   a reader grouping by colour wants their mono-white cards together and everything gold
   in one pile. So colour groups into the five, Colorless, and Multiple -- and the piles
   come out in WUBRG order rather than alphabetically, because that is the order a Magic
   player reads colours in. */
const G=globalThis.CrankGroupings;
const groupLabel=(r,key)=>G.label(r,key,value);
const groupOrder=(r,key)=>G.order(r,key,value,M.statusOrder);
/* SIX FIGURES ABOUT WHAT YOU ARE LOOKING AT. They were computed from the whole library
   while every other number on the page followed the filters, so filtering to a hundred-card
   deck read "101 owned copies" above "100 copies" and one of the two had to be wrong. Both
   are right now: same rows, same question. "Physical deck" is also named for what it counts
   -- copies whose physical box is a deck -- rather than for cards a deck list contains, and
   it is the one term the whole app uses for that fact. */
/* SEVEN NUMBERS, ONE ROW, IN THE ORDER A DECK IS BUILT: what the list claims, what you have,
   what is coming, what is missing, what you are considering. On every deck Reserved = Owned +
   Ordered + To Buy. Owned counts reserved copies; the Bench (owned, reserved by no deck) is the
   table itself and the caption under the row, never a number held against a deck, and Sell /
   Trade is a Bench flag rather than a count here. */
/* The status each figure filters on when clicked: the model's labels, or the list's own 'owned' shorthand. */
const KPI_STATUS={reserved:'Reserved',owned:'owned',subs:'Substitute',physical:'Physical deck',ordered:'Ordered',toBuy:'To buy',watched:'Watched'};
const STAT_FIGURES=[['reserved','Reserved','plan'],['owned','Owned','have'],['subs','Substitutes','subs'],['physical','Physical Deck','physical'],['ordered','Ordered','coming'],['toBuy','To Buy','missing'],['watched','Watched','considering']];
function statsHTML(shown,scoped){
  const t={reserved:0,owned:0,subs:0,physical:0,ordered:0,toBuy:0,watched:0};let bench=0,offered=0,orderedFree=0;
  for(const r of shown){
    if(r.kind==='need'){t.toBuy+=r.quantity;t.reserved+=r.quantity;continue;}
    if(r.kind==='option'||r.kind==='entry'){t.watched+=r.quantity;continue;}
    if(r.kind!=='lot')continue;
    if(r.source==='watching'){t.watched+=r.quantity;continue;}
    if(r.allocation)t.reserved+=r.quantity;
    if(r.source==='ordered'){t.ordered+=r.quantity;if(!r.allocation)orderedFree+=r.quantity;continue;}
    if(r.allocation)t.owned+=r.quantity;else{bench+=r.quantity;if(r.offer!=='none')offered+=r.quantity;}
    if(r.standIn)t.subs+=r.quantity;
    if(r.placement==='Physical deck'||r.placement==='Substitute')t.physical+=r.quantity;
  }
  /* The figures as one row of chips that filter the page: a click keeps the rows in that status, a second click lets them all back. */
  return `<div class="cm-kpis" role="group" aria-label="Counts, click to filter">${STAT_FIGURES.map(([k,l,g])=>{const st=KPI_STATUS[k];const on=!!st&&filter.status===st;return `<button type="button" class="cm-kpi cm-stat-${g}${on?' is-on':''}" data-action="kpi-status" data-status="${e(st||'')}" aria-pressed="${on}" title="${on?'Show every status':`Show only ${l}`}"><strong>${t[k].toLocaleString()}</strong><span>${l}</span></button>`;}).join('')}<span class="cm-kpi-note">${scoped?'Counting the rows this view shows.':[bench?`${bench} on the Bench${offered?` (${offered} Sell / Trade)`:''}`:'',orderedFree?`${orderedFree} ordered for no deck`:''].filter(Boolean).join(' · ')}</span></div>`;
}
/* TICKING ROWS. Not a mode with a button to enter and leave -- the checkboxes are simply
   in the table, and the bar saying what you can do to them appears once one is ticked.
   A copy record can be ticked, and so can a draft-list row or a To buy requirement -- those
   two are not copies yet, so the only thing the bar does to them is Set status, which is
   what makes them copies. The box, bench, reservation and Sell / Trade actions take the
   ticked copy records and say so when there are none. A folded row is several copies
   pretending to be one, which is why the table refuses ticks while prints are folded. */
let picked=new Set(),pickScope='';
const pickable=r=>r.kind==='lot'||r.kind==='draft'||r.kind==='need'||r.kind==='fold'&&r.partRows.some(p=>p.kind!=='fold'&&pickable(p));
const pickedIds=()=>[...picked].filter(id=>C.state.lots.some(l=>l.id===id));
function pickedSplit(){const lots=[],byDeck=new Map();for(const id of picked){if(C.state.lots.some(l=>l.id===id)){lots.push(id);continue;}const r=findRow(id);if(!r||(r.kind!=='draft'&&r.kind!=='need'))continue;if(!byDeck.has(r.deckId))byDeck.set(r.deckId,[]);byDeck.get(r.deckId).push(r);}return {lots,plans:[...byDeck]};}
/* THE STATUS LADDER. Watched, Ordered and Owned -- the rungs a card climbs
   before it is in hand, in order, each with the half-line that tells them apart. One list,
   used by the row menu, the ticked-rows bar and the deck page, so the words never drift. */
const LADDER=[['watching','Watched','considering it'],['ordered','Ordered','bought or trade arranged, not yet in hand'],['owned','Owned','in hand — on the Bench until placed']];
const rung=(label,why,attrs,current=false)=>`<button type="button" class="cm-rung${current?' is-current':''}" aria-label="${e(label)}" data-label="${e(label)}" ${attrs}><span class="cm-rung-label">${e(label)}</span><small>${e(why)}</small></button>`;
C.statusLadder=LADDER;
function batchBar(){
  const n=picked.size;
  if(!n)return '';
  return `<div class="cm-batch-bar"><strong>${n} record${n===1?'':'s'} ticked</strong>${b('Set status','batch-status',{},true,{caret:'down'})}${b('Ordered…','batch-order')}${b('Bought in store','batch-store')}${b('Arrived','batch-arrived')}${b('Add to a group','batch-group')}${b('Put in a physical deck','batch-place')}${b('Move physically to Bench','batch-bench')}${b('Release reservation → To buy','batch-release')}${b('Flag ▾','batch-flag')}${b('Offer for Sell / Trade','batch-offer')}<button type="button" class="cm-text-button" data-action="batch-clear">Clear</button></div>`;
}
function matches(r){const c=r.card,q=filter.q.toLowerCase();return (!q||[c.name,c.typeLine,c.oracleText,r.notes].join(' ').toLowerCase().includes(q))&&(!filter.type||c.typeLine.split('—')[0].includes(filter.type))&&(!filter.subtype||c.typeLine.toLowerCase().includes(filter.subtype.toLowerCase()))&&(!filter.mechanic||[c.oracleText,...c.mechanics,...c.keywords].join(' ').toLowerCase().includes(filter.mechanic.toLowerCase()))&&(!filter.color||(filter.color==='C'?c.colorIdentity.length===0:c.colorIdentity.includes(filter.color)))&&(!filter.status||(filter.status==='owned'?r.kind==='lot'&&r.source==='owned':(r.status||statusOf(r))===filter.status))&&(!filter.flag||(filter.flag==='option'?!!r.option:!!r.pinned))&&(!filter.mana||(globalThis.CrankFacets?CrankFacets.manaKinds(r.card):[]).includes(filter.mana))&&(!filter.offer||(filter.offer==='bench'?r.kind==='lot'&&r.source==='owned'&&!r.allocation&&r.location?.kind!=='deck':filter.offer==='held'?r.offer==='held':r.offer==='available'))&&(filter.min===''||c.manaValue!==null&&c.manaValue>=Number(filter.min))&&(filter.max===''||c.manaValue!==null&&c.manaValue<=Number(filter.max))&&(filter.price===''||c.price!==null&&c.price<=Number(filter.price));}
/* SHOPPING A CONVENTION FLOOR. On a phone the Shop page is not a spreadsheet to study; it
   is a list held in one hand at a booth while the seller waits. So under 640px the page
   head, the six-stat ribbon and the Columns control all go, the three page buttons fold
   into one Tools menu, the two list modes become one List type menu, the search field
   hides behind a magnifying glass, and every row carries a real Buy button instead of a
   dropdown that costs two taps and a form. The desktop page is untouched: the same
   rows, the same filters, the same actions, only a narrower way in. */
const PHONE=matchMedia('(max-width:640px)');
const compactShop=shop=>!!shop&&PHONE.matches;
const GROUP_CHOICES=G.CHOICES;
/* A row is buyable when money would change what it is: a deck requirement nothing fills
   yet, or a copy recorded as watched or ordered. An owned copy is not. */
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
function popAt(el,html){document.querySelectorAll('.cm-row-menu').forEach(m=>m.remove());const menu=document.createElement('div');menu.className='cm-menu cm-row-menu';menu.setAttribute('popover','auto');menu.innerHTML=html;document.body.append(menu);menu.showPopover();const place=()=>{if(!el.isConnected){if(menu.matches(':popover-open'))menu.hidePopover();return;}const rect=el.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight){if(menu.matches(':popover-open'))menu.hidePopover();return;}menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,rect.right-menu.offsetWidth))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,rect.bottom+5))+'px';menu.dispatchEvent(new Event('cm-moved'));};place();C.followAnchor(menu,place);menu.addEventListener('click',ev=>{if(ev.target.closest('[data-action]'))menu.hidePopover();});return menu;}
/* THE CARDS PAGE IS ONE PAGE WITH THREE TABS. Collection and Shop were the same table twice,
   with the counts row repeated on the Shop for a subset that read oddly. Library is every
   record; To buy is the same table cut to what money would change, with its strip; Orders is
   one row per order. The Spreadsheet is the Sheet view of Library. #collection and #shop still
   open it, so nothing bookmarked or written down breaks. */
const TABS=[['library','Library'],['buy','To buy'],['orders','Orders']];
const tabOf=()=>{const r=C.route();return r.view==='cards'?(r.params.get('tab')||'library'):r.view==='shop'?'buy':'library';},buyTab=()=>tabOf()==='buy';
const goCards=(tab,extra={})=>C.go('cards',{...extra,tab:tab==='library'?'':tab});
function tabCounts(){const all=M.projection(C.state);return {library:all.length,buy:all.filter(r=>r.kind==='need').reduce((n,r)=>n+r.quantity,0),orders:M.orders(C.state).length};}
/* THE THREE VIEWS, Rob's words: List (the rows), Sheet (the Master sheet), Table (the tabletop). They sit on the
   tab row under More, so every view can reach every other. A view a tab does not have is shown disabled and says why. */
const viewSwitch=(view,tab='library')=>{const has={table:true,sheet:tab==='library',tabletop:tab!=='orders'};const why={sheet:'The sheet reads the library',tabletop:'Orders have one view'};
  return `<div class="cm-seg cm-view-switch" role="group" aria-label="View">${[['table','List','open-roster'],['sheet','Sheet','open-sheet'],['tabletop','Table','open-tabletop']].map(([id,label,action])=>`<button type="button" aria-pressed="${view===id}"${view===id?'':has[id]?` data-action="${action}"`:` disabled title="${why[id]||''}"`}>${label}</button>`).join('')}</div>`;};
/* The head is the same on every tab -- Add cards, Import, one button for the tab's own work,
   More -- and the tabs under it say where you are. The phone's To buy layout keeps the tabs
   and drops the head, as it dropped the head before. */
function cardsHead(params,tab,view='table',{tight=false}={}){const n=tabCounts(),group=params.get('group')||'';
  const third=tab==='buy'?b('Print buy list','print-buy-list',{},false,{cls:'compact'}):tab==='orders'?b('Paste receipt','paste-receipt',{},false,{cls:'compact'}):view==='sheet'?b('Add a card row','sheet-add',{},false,{cls:'compact'}):b('New group','new-group',{},false,{cls:'compact'});
  const tabs=`<div class="cm-tabs cm-cards-tabs" role="tablist" aria-label="Cards">${TABS.map(([id,label])=>`<button type="button" role="tab" aria-selected="${id===tab}" data-action="cards-tab" data-tab="${id}">${label} <small>${n[id].toLocaleString()}</small></button>`).join('')}<div class="cm-tabs-views">${viewSwitch(view,tab)}</div></div>`;
  /* Add cards is the one thing done often, so it is the primary; Import and New group are done sometimes. All four are compact — the page's buttons share a row and a height (the geometry suite holds them to it), and Rob asked for smaller ones. */
  return (tight?'':C.pageHead('Cards',b('Add cards','add-card',{},true,{cls:'compact'})+b('Import list','import-list',{},false,{cls:'compact'})+third+b('More','roster-more',{tab,view,group},false,{caret:'down',cls:'compact'}),'cards'))+tabs;}
C.cardsHead=cardsHead;
C.SUBNAV.cards=()=>{const n=tabCounts(),r=C.route(),tab=r.view==='cards'?(r.params.get('tab')||'library'):tabOf(),sheet=r.view==='cards'&&r.params.get('view')==='sheet';
  return [{label:'Library',hash:'#cards',count:n.library,current:tab==='library'&&!sheet},{label:'To buy',hash:'#cards?tab=buy',count:n.buy,current:tab==='buy'},{label:'Orders',hash:'#cards?tab=orders',count:n.orders,current:tab==='orders'},{label:'Sheet',hash:'#cards?view=sheet',current:sheet}];};
/* Library and To buy each have a List and a Table; the Sheet reads the library only; Orders has its list. */
views.cards=params=>params.get('view')==='tabletop'&&params.get('tab')!=='orders'?tabletop(params,params.get('tab')==='buy'):params.get('tab')==='buy'?show(params,true):params.get('view')==='sheet'?sheet(params):show(params,false);
views.collection=params=>{const extra=Object.fromEntries(params);delete extra.sheet;goCards('library',params.get('sheet')?{...extra,view:'sheet'}:extra);};
views.shop=params=>{const extra=Object.fromEntries(params);delete extra.tab;goCards(params.get('tab')==='orders'?'orders':'buy',extra);};
actions['cards-tab']=el=>goCards(el.dataset.tab);
actions['kpi-status']=el=>{const st=el.dataset.status;if(!st)return;filter.status=filter.status===st?'':st;page=0;C.render();};
/* The × on a scope chip drops that one scope -- the card, the deck or the group -- and keeps
   the rest of the address as it is. */
actions['clear-scope']=el=>{const r=C.route(),extra=Object.fromEntries(r.params),tab=extra.tab||'library';delete extra.tab;delete extra[el.dataset.key];if(el.dataset.key==='group')filter.group='';goCards(tab,extra);};
actions['roster-more']=el=>{const {tab,view,group}=el.dataset,finals=C.state.decks.filter(d=>!d.archived&&d.status==='final');
  popAt(el,`${view==='sheet'?b('Export CSV','sheet-csv'):tab==='orders'?'':b('Export view','export-view')}${group?`<hr>${b('Manage group','manage-group',{group})}${b('Add planned card','add-group-entry',{group})}${b('Edit planned list','edit-group-entries',{group})}`:''}${finals.length?`<hr><p>Ready to add for</p>${finals.map(d=>{const r=M.readiness(C.state,d),k=r.pullFromBench+r.pullFromOtherBox+r.remove;return b(`${d.name}${k?` · ${k}`:''}`,'deck-pull',{deck:d.id});}).join('')}`:''}`);};
C.HELP.cards={title:'Cards',body:`<p><strong>Library</strong> is every record: one row per copy lot or requirement — owned, ordered and to-buy copies with their status, deck, print and physical location. Click a row for the card; the verb beside it is the one its status calls for, and ⋯ is everything else.</p><p><strong>Status</strong> is one column: Physical deck, Substitute, Reserved and Bench for owned copies; Ordered; Watched; To buy for what a finalized deck still needs; Draft list, Suggestion and Planned for rows that are not copies yet. The colour is the state wherever it appears.</p><p>The counts row reads in the order a deck is built. On every deck <strong>Reserved = Owned + Ordered + To buy</strong>; Owned counts reserved copies; the Bench is what you own that no deck has reserved, and Sell / Trade is a flag on Bench copies. With a filter set, the row counts only what the table shows.</p><p><strong>To buy</strong> is the same table cut to what your decks still need, priced, with the cap the rules allow; Bought and Arrived are one tap on the row, and the strip above says what finishing costs. <strong>Orders</strong> is one row per order — what was paid, what has landed — with Arrived → bench and Paste receipt. <strong>Sheet</strong> is the Master spreadsheet read from the library: T is what a deck’s list claims, A what is physically in it; click a number and type.</p><p>Five filters are in view with search and group beside them; More filters holds subtype, mechanic, flags, offers, mana value and price. Paid and Quantity are cells you click and type in. Ready to add, for walking owned copies into a deck, is under More.</p>`};
/* THE SPREADSHEET. Rob's Master sheet, read from the library instead of kept beside it: one
   row per card; Own, Ordered, Bench and To buy across it; and for every deck two columns --
   T, how many the list wants, and A, how many are physically in its box, with a small +n
   where more are reserved than sleeved. Click a number, type, Enter. The library works out
   what has to move and asks first whenever a copy is taken from somewhere: a raised T
   reserves free copies and takes reserved ones from other decks (they stay in their boxes
   until moved, and those decks' Ready to add lists say so); an A typed to 1 releases the copy from
   wherever it was, reserves it here and puts it in this box, recording a new owned copy when
   the library holds none. A plain raise of Own or Ordered just saves. The copies rule holds
   throughout: one of a card per deck except basics and the cards whose text allows more.
   Enter commits and moves down, Tab commits and moves right, Escape puts the number back,
   the arrow keys walk the cells, and a digit typed on a focused cell starts editing with it. */
let sheetQ='',sheetOnly='',sheetDeck='',sheetSort={key:'name',dir:1},sheetAll=false,sheetFocus=null,sheetScroll=null;const sheetExtras=new Map(),SHEET_PAGE=200;
const SHEET_SHOW=[['','All cards'],['listed','In a deck list'],['short','Short of a target'],['pending','Reserved, not in the physical deck yet'],['subs','Substitutes in a physical deck'],['owned','Owned copies'],['bench','On the bench'],['loose','In no deck list']];
const cellKey=(cardId,col,deckId)=>`${cardId}|${col}|${deckId||''}`;
function sheetRows(m){
  const rows=[...m.rows];
  for(const [id,c] of sheetExtras)if(!rows.some(r=>r.cardId===id))rows.push({cardId:id,card:c,own:0,ordered:0,planned:0,inBox:0,subs:0,bench:0,toBuy:0,extra:true,perDeck:Object.fromEntries(m.decks.map(d=>[d.id,{t:0,a:0,boxed:0,sub:0,slotId:null,lotIds:[],option:false,pinned:false}]))});
  const q=sheetQ.trim().toLowerCase(),decks=m.decks;
  const keep=r=>{
    if(q&&!(r.card.name+' '+(r.card.typeLine||'')).toLowerCase().includes(q))return false;
    if(sheetDeck&&!(r.perDeck[sheetDeck]&&(r.perDeck[sheetDeck].t>0||r.perDeck[sheetDeck].a>0)))return false;
    const cells=decks.map(d=>r.perDeck[d.id]);
    switch(sheetOnly){
      case 'listed':return cells.some(p=>p.t>0);
      case 'short':return cells.some((p,i)=>decks[i].status==='final'&&p.t>p.a);
      case 'pending':return cells.some(p=>p.a>p.boxed);
      case 'subs':return cells.some(p=>p.sub>0);
      case 'owned':return r.own>0;
      case 'bench':return r.bench>0;
      case 'loose':return !cells.some(p=>p.t>0);
      default:return true;
    }
  };
  const val=r=>{const k=sheetSort.key;if(k==='name')return r.card.name;if(k.startsWith('deck|')){const [,id,col]=k.split('|'),p=r.perDeck[id];return p?(col==='boxed'?p.boxed+p.sub:p[col]):0;}return r[k]||0;};
  return rows.filter(keep).sort((a,b)=>{const av=val(a),bv=val(b);const c=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),undefined,{sensitivity:'base'});return c*sheetSort.dir||a.card.name.localeCompare(b.card.name,undefined,{sensitivity:'base'});});
}
function sheetNeighbour(btn,dx,dy){
  const tr=btn.closest('tr');if(!tr)return null;
  const cells=[...tr.querySelectorAll('.cm-sheet-cell')],i=cells.indexOf(btn);
  if(dx){const n=cells[i+dx];return n?n.dataset.cell:null;}
  if(dy){let row=tr;for(let k=0;k<Math.abs(dy)&&row;k++)row=dy>0?row.nextElementSibling:row.previousElementSibling;if(!row||!row.dataset.card)return null;const col=btn.dataset.cell.split('|').slice(1).join('|');const n=[...row.querySelectorAll('.cm-sheet-cell')].find(c=>c.dataset.cell.split('|').slice(1).join('|')===col);return n?n.dataset.cell:null;}
  return null;
}
/* A typed number becomes the commands the library needs. A plain raise saves; anything that
   takes a copy from somewhere, or removes one, goes through the review dialog with the
   plan's own notes in it. */
async function sheetApply(edit){
  const p=M.plan(C.state,edit);
  if(p.refused){C.notice(p.refused,true);await C.render();return;}
  if(!p.command){C.notice(p.notes[0]||'No change.');await C.render();return;}
  const y=scrollY,focus=sheetFocus;
  if(!p.review){await C.commit(p.command);scrollTo(0,y);return;}
  await C.render();scrollTo(0,y);sheetFocus=focus;
  const name=(C.card(edit.cardId)||edit.card)?.name||'',deckName=edit.deckId?M.deck(C.state,edit.deckId).name+' · ':'';
  const what={own:'owned copies',ordered:'ordered copies',t:'copies the list claims',boxed:'copies in the physical deck',a:'copies filling claims'}[edit.column];
  C.review(`${name}: ${deckName}${what} → ${edit.value}`,`<ul class="cm-sheet-notes">${p.notes.map(n=>`<li>${e(n)}</li>`).join('')}</ul>`,p.command);
}
function sheetEdit(btn,seed=''){
  const [cardId,col,deckId]=btn.dataset.cell.split('|'),cell=btn.closest('td');
  if(!cell||cell.querySelector('input'))return;
  const current=Number(btn.dataset.value)||0,label=btn.getAttribute('aria-label')||'';
  const around={down:sheetNeighbour(btn,0,1),up:sheetNeighbour(btn,0,-1),right:sheetNeighbour(btn,1,0),left:sheetNeighbour(btn,-1,0)};
  /* The editor takes the cell's width as it is, so the column does not jump when a number
     is being typed. A deck cell also knows how many copies the deck may carry -- one, unless
     the card is a basic land or its text allows more -- and refuses a larger number as it is
     typed rather than after Enter. */
  const card=C.card(cardId)||sheetExtras.get(cardId),cap=deckId&&['t','a','boxed'].includes(col)&&card?M.maxCopies(card):Infinity;
  const width=Math.round(cell.getBoundingClientRect().width);cell.style.width=cell.style.minWidth=cell.style.maxWidth=width+'px';
  const input=document.createElement('input');
  input.type='number';input.min='0';input.step='1';input.inputMode='numeric';input.className='cm-cell-input cm-sheet-input';if(Number.isFinite(cap))input.max=String(cap);
  input.value=seed||String(current);input.setAttribute('aria-label',label);input.style.width=width+'px';
  const capped=()=>{const v=Number(input.value);if(Number.isFinite(cap)&&v>cap){input.value=String(cap);C.notice(`${card.name}: a deck can carry ${cap===1?'one copy':cap+' copies'}. Only basic lands and cards whose text allows more can repeat.`,true);}};
  input.addEventListener('input',capped);
  cell.textContent='';cell.append(input);cell.addEventListener('click',ev=>ev.stopPropagation());
  input.focus();if(!seed)input.select();
  let settled=false;
  const back=()=>{if(settled)return;settled=true;sheetFocus=btn.dataset.cell;C.render();};
  const save=async next=>{
    if(settled)return;settled=true;
    capped();const raw=input.value.trim(),value=raw===''?0:Number(raw);
    sheetFocus=next||btn.dataset.cell;
    if(!Number.isInteger(value)||value<0){C.notice('Type a whole number, 0 or more.',true);C.render();return;}
    if(value===current){C.render();return;}
    try{await sheetApply({cardId,column:col,deckId:deckId||null,value,card:sheetExtras.get(cardId)});}
    catch(error){C.notice(error.message,true);C.render();}
  };
  input.addEventListener('keydown',ev=>{
    if(ev.key==='Enter'){ev.preventDefault();save(ev.shiftKey?around.up:around.down);}
    else if(ev.key==='Tab'){ev.preventDefault();save(ev.shiftKey?around.left:around.right);}
    else if(ev.key==='Escape'){ev.preventDefault();back();}
  });
  input.addEventListener('blur',()=>save(null));
}
/* THE TABLETOP (docs/crankmagic-tabletop-plan.md, TB1: the table at rest). The same rows the
   list shows, under the same search and filters, as piles on a mat: the status piles down
   front in the model's order, the Bench along the back, the group piles behind under one
   grouping. crankmagic-tabletop.js computes the piles (pure, tested) and draws the mat;
   this view feeds it the rows, the filters and the reader's grouping choice. */
let tabletopGroupBy=C.state.preferences.tabletopGroupBy||'type';
/* The table's own state between draws: the open pile, its page and card size, the ticks while it is laid out, the selection on the stage and the pile it came from. */
const ttUI={open:null,from:null,page:0,size:'M',ticked:new Set(),selection:new Set()};
/* The card size is a fact about the screen it was chosen on, so it is remembered per device and not in the library. */
try{const s=localStorage.getItem('cm-tabletop-size');if(s&&['S','M','L'].includes(s))ttUI.size=s;}catch(err){/* a private window; M then */}
let tabletopStatusOrder=C.state.preferences.tabletopStatusOrder==='count'?'count':'workflow';
let ttModel=null;
function tabletop(params,shop=false){
  const TT=globalThis.CrankTabletop,tab=shop?'buy':'library';
  C.main.innerHTML=cardsHead(params,tab,'tabletop')
   +`<div class="cm-toolbar"><label class="cm-search">Search cards<input id="cm-tt-query" value="${e(filter.q)}" placeholder="Card name, type or rules text"></label>${s('Status','ttStatus',[['','Any status'],['owned','Owned (any)'],...M.STATUS.map(x=>[x.label,x.label])],filter.status)}${s('Card type','ttType',[['','All types'],'Artifact','Creature','Enchantment','Instant','Land','Planeswalker','Sorcery','Battle'],filter.type)}${s('Color','ttColor',[['','Any colour'],['W','White'],['U','Blue'],['B','Black'],['R','Red'],['G','Green'],['C','Colorless']],filter.color)}${s('Deck','ttDeck',[['','Any deck'],...C.state.decks.filter(d=>!d.archived).map(d=>[d.id,d.name])],params.get('deck')||'')}${b('Clear filters','clear-filters')}</div>`
   +`<p class="cm-status-line" id="cm-tt-status"></p><div id="cm-tt-host" class="cm-tt-host"></div>`;
  const draw=()=>{
    if(!TT){$('#cm-tt-host').innerHTML='<p class="cm-muted">The tabletop module has not loaded yet.</p>';return;}
    const all=rows(params,shop).filter(matches).map(r=>({...r,status:statusOf(r)}));lastRows=all;
    const model=TT.table(all,{groupBy:tabletopGroupBy,statuses:M.STATUS,statusOrder:M.statusOrder,value,maxGroupPiles:16,statusSort:tabletopStatusOrder});ttModel=model;
    $('#cm-tt-status').textContent=`${model.total.toLocaleString()} cop${model.total===1?'y':'ies'} on the table (${model.rows.toLocaleString()} rows) · Bench ${model.bench.count.toLocaleString()} · ${model.ghosts.toLocaleString()} ghost${model.ghosts===1?'':'s'}`+(Object.values(filter).some(v=>v!=='')||params.get('deck')?' · filtered':'');
    /* A selection that the filters no longer show is dropped; an open pile that vanished (a grouping change) closes. */
    const ids=new Set(all.map(r=>r.recordId));for(const id of [...ttUI.selection])if(!ids.has(id))ttUI.selection.delete(id);for(const id of [...ttUI.ticked])if(!ids.has(id))ttUI.ticked.delete(id);
    if(ttUI.open&&!TT.findPile(model,ttUI.open))ttUI.open=null;if(ttUI.from&&!TT.findPile(model,ttUI.from))ttUI.from=null;
    const rest=()=>{ttUI.open=null;ttUI.from=null;ttUI.page=0;ttUI.ticked.clear();ttUI.selection.clear();};
    TT.mount($('#cm-tt-host'),model,{
      onGroupBy:v=>{tabletopGroupBy=v;if(ttUI.open&&ttUI.open.startsWith('group:'))rest();C.commit({type:'preferences',values:{tabletopGroupBy:v}},{renderView:false}).catch(()=>{});draw();},
      onOpen:id=>{if(!id){rest();}else{ttUI.selection.clear();ttUI.ticked.clear();ttUI.from=null;if(ttUI.open!==id)ttUI.page=0;ttUI.open=id;}draw();queueMicrotask(()=>$('#cm-tt-host .cm-tt-strip button, #cm-tt-host .cm-tt-mat')?.focus?.({preventScroll:true}));},
      onPage:n=>{ttUI.page=Math.max(0,n|0);draw();queueMicrotask(()=>$('#cm-tt-host .cm-tt-grid .cm-tt-card[data-tt=card]')?.focus?.({preventScroll:true}));},
      onSize:s=>{ttUI.size=s;ttUI.page=0;try{localStorage.setItem('cm-tabletop-size',s);}catch(err){/* not remembered, still applied */}draw();queueMicrotask(()=>$(`#cm-tt-host [data-tt=size][data-size=${s}]`)?.focus?.({preventScroll:true}));},
      onStatusOrder:v=>{tabletopStatusOrder=v==='count'?'count':'workflow';C.commit({type:'preferences',values:{tabletopStatusOrder}},{renderView:false}).catch(()=>{});draw();},
      onPrint:pileId=>{const pile=TT.findPile(model,pileId);if(!pile)return;document.querySelectorAll('.cm-tt-printsheet').forEach(x=>x.remove());const wrap=document.createElement('div');wrap.innerHTML=TT.printSheet(pile,{describe:r=>({status:r.status||statusOf(r),price:r.card&&r.card.price!=null?C.money(r.card.price):'',deck:value(r,'deck')}),library:'CrankMagic'});const sheet=wrap.firstElementChild;document.body.append(sheet);document.body.classList.add('cm-tt-printing');
        const done=()=>{document.body.classList.remove('cm-tt-printing');sheet.remove();removeEventListener('afterprint',done);};addEventListener('afterprint',done);setTimeout(()=>{if(sheet.isConnected)done();},60000);
        try{window.print();}catch(err){done();C.notice('This browser could not open the print dialog.',true);}},
      onTick:id=>{if(ttUI.ticked.has(id))ttUI.ticked.delete(id);else ttUI.ticked.add(id);draw();queueMicrotask(()=>$(`#cm-tt-host .cm-tt-card[data-record="${CSS.escape(id)}"]`)?.focus?.({preventScroll:true}));},
      onSelect:list=>{ttUI.selection=new Set(list);ttUI.from=ttUI.open;ttUI.open=null;ttUI.ticked.clear();draw();queueMicrotask(()=>$('#cm-tt-host .cm-tt-stage-actions button')?.focus?.({preventScroll:true}));},
      onClear:()=>{rest();draw();},
      onMenu:(record,el)=>{actions['row-actions'](el);},
      onDrop:(pileId,ids)=>{try{tabletopDrop(pileId,ids);}catch(err){C.notice(err.message,true);}},
      onMoveTo:(ids,el)=>{const rows=ids.map(id=>findRow(id)).filter(Boolean);const piles=[ttModel.bench,...ttModel.statusPiles,...ttModel.groupPiles];
        popAt(el,`<p>Move ${rows.length} card${rows.length===1?'':'s'} to</p>${piles.map(p=>{const a=TT.accepts(p,rows);return `<button type="button" data-action="tabletop-drop" data-pile="${e(p.id)}"${a.ok?'':' disabled'} title="${e(a.ok?a.why:a.why)}">${e(p.label)}${a.ok?` <small>${e(a.label)}</small>`:''}</button>`;}).join('')}`);},
      describe:r=>({status:r.status||statusOf(r),price:r.card&&r.card.price!=null?C.money(r.card.price):'',deck:value(r,'deck')})
    },{...ttUI,viewportHeight:innerHeight});
  };
  draw();
  const host=C.main;
  host.querySelector('#cm-tt-query')?.addEventListener('input',ev=>{filter.q=ev.target.value;draw();});
  for(const [name,key] of [['ttStatus','status'],['ttType','type'],['ttColor','color']]){host.querySelector(`[name=${name}]`)?.addEventListener('change',ev=>{filter[key]=ev.target.value;draw();});}
  host.querySelector('[name=ttDeck]')?.addEventListener('change',ev=>goCards(tab,{view:'tabletop',...(ev.target.value?{deck:ev.target.value}:{})}));
  if(!TT)return;
  actions['tabletop-drop']=el=>tabletopDrop(el.dataset.pile,[...ttUI.selection]);
  /* Escape is the table at rest from anywhere on the page — a redraw can leave the focus on the body, where the mat's own key handler cannot hear it. Not while a dialog or a menu is open, and not from a field. */
  const onKey=ev=>{const r=C.route();if(r.view!=='cards'||r.params.get('view')!=='tabletop'){removeEventListener('keydown',onKey);return;}if(ev.key!=='Escape'||ev.defaultPrevented||!(ttUI.open||ttUI.selection.size))return;if(document.querySelector('dialog[open]')||[...document.querySelectorAll('[popover]')].some(p=>p.matches(':popover-open'))||ev.target.closest?.('input,select,textarea'))return;ev.preventDefault();ttUI.open=null;ttUI.from=null;ttUI.page=0;ttUI.ticked.clear();ttUI.selection.clear();draw();};
  addEventListener('keydown',onKey);
  /* The mat is sized from the host's width, so a resize redraws it. */
  let last=host.clientWidth;const onResize=()=>{if(C.route().view!=='cards'||C.route().params.get('view')!=='tabletop'){removeEventListener('resize',onResize);return;}if(Math.abs(host.clientWidth-last)>40){last=host.clientWidth;draw();}};
  addEventListener('resize',onResize);
}
/* A DROP IS THE STATUS FLY-OUT'S COMMAND (plan §2.3): the contract in crankmagic-tabletop.js
   says which action a pile takes for these rows; here that action becomes the same command
   the row menu and the ticked-rows bar send, through the same receipt (C.review) for anything
   that changes a deck or money, and a plain save for filing into a group. */
function tabletopDrop(pileId,ids){
  const TT=globalThis.CrankTabletop,pile=TT.findPile(ttModel,pileId),rows=ids.map(id=>findRow(id)).filter(Boolean);
  const a=TT.accepts(pile,rows);if(!a.ok){C.notice(a.why,true);return;}
  const lots=rows.filter(r=>r.kind==='lot'),lotIds=lots.map(r=>r.id),plans=rows.filter(r=>r.kind==='need'||r.kind==='draft');
  const byDeck=new Map();for(const r of plans){if(!byDeck.has(r.deckId))byDeck.set(r.deckId,[]);byDeck.get(r.deckId).push(r);}
  const n=rows.length,names=rows.slice(0,4).map(r=>r.card.name).join(', ')+(n>4?` and ${n-4} more`:'');
  const finals=C.state.decks.filter(d=>!d.archived&&d.status==='final');
  const [action,arg]=a.action.split(':');
  if(action==='source'){const source=arg,label=C.source(source),commands=[];
    if(lotIds.length)commands.push({type:'bulk',op:'source',source,lotIds,confirmed:true});
    for(const [deckId,rowsFor] of byDeck)commands.push({type:'acquireSlots',deckId,source,slotIds:rowsFor.map(r=>r.slotId),quantities:Object.fromEntries(rowsFor.map(r=>[r.slotId,r.quantity])),confirmed:true});
    C.review(`Set ${n} record${n===1?'':'s'} to ${label}`,note(`${names}. ${a.why}`,source!=='owned'),commands.length===1?commands[0]:{type:'batch',commands,summary:`Set ${n} records to ${label}`});return;}
  if(action==='bench'){C.review('Move these copies to the Bench',note(`${names}. ${a.why}`,lots.some(r=>r.location?.kind==='deck')),{type:'bulk',op:'bench',lotIds});return;}
  if(action==='release'){C.review('Release these reservations',note(`${names}. ${a.why}`,true),{type:'bulk',op:'release',lotIds});return;}
  if(action==='place'||action==='standin'){if(!finals.length)throw Error('Finalize a deck first — a draft holds no physical copies.');
    const standin=action==='standin',preferred=lots.map(r=>r.allocation?.deckId).find(Boolean)||'';
    form(standin?'Substitute in a physical deck':'Put these copies in a physical deck',s('Deck','deckId',finals.map(d=>[d.id,d.name]),preferred)+f('Box label (optional)','box')+(standin?'':`<label class="cm-checkbox cm-full"><input type="checkbox" name="asStandIn"> Allow substitutes: a copy this deck's list does not call for goes in unreserved, filling a seat until the real card arrives</label>`)+note(standin?`${names} go in without a reservation; the deck counts them as substitutes and Ready to add asks for them back when the real card is ready.`:`${names}. Records where these copies physically are. Ownership does not change. A copy that is not reserved for this deck is refused by name unless substitutes are allowed; one the list calls for is reserved on the way in.`),
      v=>C.review(standin?'Substitute in a physical deck':'Put these copies in a physical deck',note(`${names} move into ${e(M.deck(C.state,v.deckId).name)}${standin||v.asStandIn?', as substitutes where the list does not call for them':''}.`),{type:'bulk',op:'place',deckId:v.deckId,box:v.box,lotIds,...(standin||v.asStandIn?{asStandIn:true}:{})}),'Review placement');return;}
  if(action==='reserve'){
    const build=deckId=>{const d=M.deck(C.state,deckId),commands=[],misses=[];
      for(const r of lots){const l=M.lot(C.state,r.id);const slot=d.slots.find(x=>x.committed&&M.compatible(l,x)&&M.shortfall(C.state,d,x)>=l.quantity);if(!slot){misses.push(r.card.name);continue;}commands.push({type:'allocate',lotId:l.id,quantity:l.quantity,deckId:d.id,slotId:slot.id,confirmed:true});}
      if(!commands.length)throw Error(`${d.name}’s list does not call for ${misses.join(', ')}, or already has ${misses.length===1?'it':'them'}.`);
      C.review(`Reserve ${commands.length} cop${commands.length===1?'y':'ies'} for ${d.name}`,note(`${misses.length?`Not reserved — the list does not call for them, or has them: ${misses.join(', ')}. `:''}The physical box stays unchanged; a donor deck’s shortfall shows on its page.`,true),commands.length===1?commands[0]:{type:'batch',commands,summary:`Reserved ${commands.length} copies for ${d.name}`});};
    const fixed=pile.key==='deck'?finals.find(d=>d.name===pile.label):null;
    if(pile.key==='deck'&&!fixed)throw Error(`${pile.label} is not a finalized deck; only a finalized deck holds reservations.`);
    if(fixed)return build(fixed.id);
    const decks=finals.filter(d=>lots.some(r=>{const l=M.lot(C.state,r.id);return d.slots.some(x=>x.committed&&M.compatible(l,x)&&M.shortfall(C.state,d,x)>0);}));
    if(!decks.length)throw Error('No finalized deck has an unfulfilled requirement for these cards.');
    form('Reserve for a deck',s('Deck','deckId',decks.map(d=>[d.id,d.name]),'')+note('Only a deck whose list calls for the card and still lacks it can take the reservation; the physical box stays unchanged.'),v=>build(v.deckId),'Review');return;}
  if(action==='group'){const g=C.state.groups.find(g=>g.name===pile.label);if(!g)throw Error('That group is gone; refresh the view.');commit({type:'groupLots',groupId:g.id,lotIds}).catch(err=>C.notice(err.message,true));return;}
  throw Error('That drop is not wired yet.');
}
function sheet(params){
  const m=M.matrix(C.state),decks=m.decks;
  C.main.innerHTML=cardsHead(params,'library','sheet')
   +`<div class="cm-toolbar"><label class="cm-search">Search cards<input id="cm-sheet-query" value="${e(sheetQ)}" placeholder="Card name or type"></label>${s('Show','sheetOnly',SHEET_SHOW,sheetOnly)}${s('Deck','sheetDeck',[['','All decks'],...decks.map(d=>[d.id,d.name])],sheetDeck)}</div>`
   +`<p class="cm-status-line" id="cm-sheet-status"></p><div id="cm-sheet-table"></div>`;
  const host=$('#cm-sheet-table'),zero='<span class="cm-sheet-zero">0</span>',alt=i=>i%2?' cm-sheet-alt':'';
  const draw=()=>{
    const rows=sheetRows(m),shown=sheetAll?rows:rows.slice(0,SHEET_PAGE),filtered=!!(sheetQ.trim()||sheetOnly||sheetDeck);
    $('#cm-sheet-status').innerHTML=`${rows.length} card${rows.length===1?'':'s'}${filtered?' matching':''} · whole library: ${m.own} owned, ${m.ordered} ordered, ${m.toBuy} to buy`
      +(rows.length>shown.length?` · <button type="button" class="cm-text-button" data-sheet-all="1">Show all ${rows.length} rows</button>`:sheetAll&&rows.length>SHEET_PAGE?` · <button type="button" class="cm-text-button" data-sheet-all="0">Show the first ${SHEET_PAGE}</button>`:'');
    const sortBtn=(key,label,title='')=>`<button type="button" class="cm-sheet-sort" data-sheet-sort="${e(key)}" title="${e(title||'Sort by '+label)}">${e(label)}${sheetSort.key===key?`<span aria-hidden="true">${sheetSort.dir>0?'▲':'▼'}</span>`:''}</button>`;
    const ariaSort=key=>sheetSort.key===key?` aria-sort="${sheetSort.dir>0?'ascending':'descending'}"`:'';
    const live=(r,col,deckId,n,{cls='',mark='',label='',title=''})=>`<td class="cm-sheet-num cm-sheet-live${cls}"><button type="button" class="cm-sheet-cell" data-cell="${e(cellKey(r.cardId,col,deckId))}" data-value="${n}" aria-label="${e(label)}" title="${e(title||'Click, or type a digit, to change')}">${n||zero}${mark}</button></td>`;
    const ro=(n,cls='',title='')=>`<td class="cm-sheet-num${cls}"${title?` title="${e(title)}"`:''}>${n||zero}</td>`;
    const head=`<thead><tr><th rowspan="2" class="cm-sheet-name"${ariaSort('name')}>${sortBtn('name','Card')}</th><th rowspan="2"${ariaSort('own')}>${sortBtn('own','Own','Owned copies, wherever they are')}</th><th rowspan="2"${ariaSort('ordered')}>${sortBtn('ordered','Ordered','Bought, not yet in hand')}</th><th rowspan="2"${ariaSort('bench')}>${sortBtn('bench','Bench','Owned copies in no physical deck')}</th><th rowspan="2"${ariaSort('toBuy')}>${sortBtn('toBuy','To buy','Copies finalized decks list that nothing covers')}</th>`
      +decks.map((d,i)=>`<th colspan="2" class="cm-sheet-deck${alt(i)}"><span class="cm-sheet-deck-name">${e(d.name)}</span><small>${d.status==='final'?(d.target===100?'final · 100':`final · ${d.target} cards`):`draft · ${d.target} cards`}</small></th>`).join('')
      +`</tr><tr>`+decks.map((d,i)=>`<th class="${alt(i).trim()}"${ariaSort('deck|'+d.id+'|t')}>${sortBtn('deck|'+d.id+'|t','T','Reserved: how many copies the list claims')}</th><th class="${alt(i).trim()}"${ariaSort('deck|'+d.id+'|boxed')}>${sortBtn('deck|'+d.id+'|boxed','A','Physical: in the deck, substitutes included')}</th>`).join('')+`</tr></thead>`;
    const body=shown.map(r=>`<tr data-card="${e(r.cardId)}"><th scope="row" class="cm-sheet-name"><button type="button" class="cm-text-button cm-card-name" data-action="card" data-card="${e(r.cardId)}" title="${e(r.card.typeLine||'')}">${e(r.card.name)}</button>${r.extra?' <span class="cm-badge">New row</span>':''}</th>`
      +live(r,'own','',r.own,{label:`Owned copies of ${r.card.name}`})+live(r,'ordered','',r.ordered,{label:`Ordered copies of ${r.card.name}`})+ro(r.bench)+ro(r.toBuy,r.toBuy?' is-short':'')
      +decks.map((d,i)=>{const p=r.perDeck[d.id],short=d.status==='final'&&p.t>p.a,pend=p.a-p.boxed;
        const marks=(p.option?'<span class="cm-sheet-opt" title="Flagged as an option: first to swap out">●</span>':'')+(p.pinned?'<span class="cm-sheet-opt cm-sheet-pinned" title="Pinned: kept whatever a swap suggests">■</span>':'');
        return live(r,'t',d.id,p.t,{cls:alt(i)+(short?' is-short':''),mark:marks,label:`${d.name}: copies of ${r.card.name} in the list`,title:short?`${d.name} lists ${p.t}, ${p.a} covered`:''})
          +(d.status==='final'?live(r,'boxed',d.id,p.boxed+p.sub,{cls:alt(i)+(p.boxed&&p.boxed>=p.t?' is-done':''),mark:(pend>0?`<sup class="cm-sheet-pend" title="${pend} more reserved to ${e(d.name)}, owned and ready to add">+${pend}</sup>`:'')+(p.sub?`<sup class="cm-sheet-sub" title="${p.sub} cop${p.sub===1?'y':'ies'} of ${e(r.card.name)} standing in as ${p.sub===1?'a substitute':'substitutes'} in ${e(d.name)}: physically there, not called for by its list">ˢ${p.sub}</sup>`:''),label:`${d.name}: copies of ${r.card.name} physically in the deck`})
            :`<td class="cm-sheet-num cm-sheet-muted${alt(i)}" title="A draft holds no copies; finalize it first">—</td>`);}).join('')+`</tr>`).join('');
    const foot=`<tfoot><tr><th scope="row" class="cm-sheet-name">Whole library</th><td>${m.own}</td><td>${m.ordered}</td><td>${m.rows.reduce((n,r)=>n+r.bench,0)}</td><td class="${m.toBuy?'is-short':''}">${m.toBuy}</td>`
      +decks.map((d,i)=>{const t=m.totals[d.id];return `<td class="${(t.t!==100?'is-short':'')+alt(i)}" title="${e(d.name)} lists ${t.t} cards">${t.t}</td><td class="${alt(i).trim()}" title="${t.boxed+t.sub} cards in the physical deck: ${t.boxed} of the list${t.sub?` and ${t.sub} substitute${t.sub===1?'':'s'}`:''}; ${t.a} reserved">${t.boxed+t.sub}${t.a>t.boxed?`<sup class="cm-sheet-pend">+${t.a-t.boxed}</sup>`:''}${t.sub?`<sup class="cm-sheet-sub">ˢ${t.sub}</sup>`:''}</td>`;}).join('')+`</tr></tfoot>`;
    host.innerHTML=`<div class="cm-sheet-wrap"><table class="cm-table cm-sheet" aria-label="Collection spreadsheet">${head}<tbody>${body||`<tr><td colspan="${5+decks.length*2}" class="cm-muted cm-sheet-empty">No cards match. Clear the search, or add a card row.</td></tr>`}</tbody>${foot}</table></div>`;
    const wrap=$('.cm-sheet-wrap',host);
    if(sheetScroll){wrap.scrollLeft=sheetScroll[0];wrap.scrollTop=sheetScroll[1];}
    wrap.addEventListener('scroll',()=>{sheetScroll=[wrap.scrollLeft,wrap.scrollTop];},{passive:true});
    if(sheetFocus){const el=wrap.querySelector(`[data-cell="${CSS.escape(sheetFocus)}"]`);sheetFocus=null;if(el){el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',inline:'nearest'});}}
  };
  draw();
  $('#cm-sheet-query').addEventListener('input',ev=>{sheetQ=ev.target.value;draw();});
  $('[name=sheetOnly]').addEventListener('change',ev=>{sheetOnly=ev.target.value;draw();});
  $('[name=sheetDeck]').addEventListener('change',ev=>{sheetDeck=ev.target.value;draw();});
  /* "Show all N rows" sits in the status line above the table, so it needs its own listener;
     the table host's never heard it, and the link did nothing. */
  $('#cm-sheet-status').addEventListener('click',ev=>{const all=ev.target.closest('[data-sheet-all]');if(all){sheetAll=all.dataset.sheetAll==='1';draw();}});
  host.addEventListener('click',ev=>{
    const all=ev.target.closest('[data-sheet-all]');if(all){sheetAll=all.dataset.sheetAll==='1';draw();return;}
    const so=ev.target.closest('[data-sheet-sort]');if(so){const key=so.dataset.sheetSort;sheetSort={key,dir:sheetSort.key===key?-sheetSort.dir:(key==='name'?1:-1)};draw();return;}
    const cell=ev.target.closest('.cm-sheet-cell');if(cell){ev.stopPropagation();sheetEdit(cell);}
  });
  host.addEventListener('keydown',ev=>{
    const cell=ev.target.closest('.cm-sheet-cell');if(!cell||ev.altKey||ev.ctrlKey||ev.metaKey)return;
    if(/^[0-9]$/.test(ev.key)){ev.preventDefault();sheetEdit(cell,ev.key);return;}
    const dx=ev.key==='ArrowLeft'?-1:ev.key==='ArrowRight'?1:0,dy=ev.key==='ArrowUp'?-1:ev.key==='ArrowDown'?1:0;
    if(dx||dy){const next=sheetNeighbour(cell,dx,dy);if(next){ev.preventDefault();host.querySelector(`[data-cell="${CSS.escape(next)}"]`)?.focus();}}
  });
}
/* The view switch keeps the tab it is on: List and Table for Library and To buy, the Sheet for the library. */
const tabHere=()=>{const r=C.route();return r.view==='cards'&&['library','buy','orders'].includes(r.params.get('tab'))?r.params.get('tab'):'library';};
actions['open-sheet']=()=>goCards('library',{view:'sheet'});
actions['open-tabletop']=()=>goCards(tabHere()==='orders'?'library':tabHere(),{view:'tabletop'});
actions['open-roster']=()=>goCards(tabHere());
actions['sheet-add']=()=>C.cardPicker('Add a card row to the spreadsheet',c=>{$('#cm-dialog').close();sheetExtras.set(c.id,c);sheetQ=c.name;sheetOnly='';sheetDeck='';sheetFocus=cellKey(c.id,'own','');C.render();C.notice(`${c.name} has a row. Type a number into it to record copies or list it in a deck.`);});
/* The Master's column order, so the file drops straight back into the workbook. */
actions['sheet-csv']=()=>{const m=M.matrix(C.state),rows=sheetRows(m),decks=m.decks,cell=v=>/[",\r\n]/.test(String(v))?'"'+String(v).replace(/"/g,'""')+'"':String(v);
  const lines=[['Card','Own','Buy Count','Ordered','Bench',...decks.map(d=>d.name+' T'),...decks.map(d=>d.name+' A')],...rows.map(r=>[r.card.name,r.own,r.toBuy,r.ordered,r.bench,...decks.map(d=>r.perDeck[d.id].t),...decks.map(d=>r.perDeck[d.id].boxed+r.perDeck[d.id].sub)])].map(l=>l.map(cell).join(','));
  C.download(`CrankMagic-spreadsheet-${new Date().toISOString().slice(0,10)}.csv`,lines.join('\r\n'),'text/csv;charset=utf-8');C.notice(`Exported ${rows.length} row${rows.length===1?'':'s'}: Card, Own, Buy Count, Ordered, Bench, then T and A per deck. A is what is physically in the deck, substitutes included, like the Master's Actual.`);};
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
const FOLD_FIELDS=['status','source','placement','deckId','box','purpose','printing','offer','paid','quantity'];
function foldByCard(list,within=''){
  const by=new Map();
  for(const r of list){
    const key=r.cardId+(within==='deck'?'|'+(r.deckId||''):'');
    const seen=by.get(key);
    if(!seen){by.set(key,{row:r,parts:[r]});continue;}
    seen.parts.push(r);
  }
  return [...by.values()].map(({row,parts})=>{
    if(parts.length===1)return row;
    const mixed=new Set();
    const folded={...row,recordId:'fold:'+row.cardId+'|'+(row.deckId||''),kind:'fold',parts:parts.length,partRows:parts,
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

function show(params,shop){/* `shop` is the To buy tab: the same table cut to what money would change. */
selected=selected||withStatus(C.state.preferences.columns)||defaults;shopSelected=shopSelected||withStatus(C.state.preferences.shopColumns)||SHOP_DEFAULTS;const tight=compactShop(shop),tab=shop?'buy':'library';
const cols=shop?shopSelected:selected;
/* Grouping is remembered per page: the Shop opens by deck, the Collection flat. */
const gbGet=()=>shop?shopGroupBy:groupBy,gbSet=v=>{if(shop)shopGroupBy=v;else groupBy=v;};
/* A tick is about the records in front of you; carrying it from a deck to a group, or from
   the Collection to the Shop, would act on rows the reader can no longer see. */
const scope=[tab,params.get('deck')||'',params.get('group')||'',params.get('card')||''].join('|');
if(params.get('placement')){filter.status=params.get('placement');expanded=true;}
if(scope!==pickScope){pickScope=scope;picked.clear();}
/* Crossing the phone boundary changes which page is correct, not just how it looks, so
   the view is rebuilt rather than restyled. Registered once, and only while a roster
   page is on screen. */
if(!phoneWatch){phoneWatch=true;PHONE.addEventListener('change',()=>{if(C.route().view==='cards')C.render();});}
const shopTools=`<div class="cm-shop-bar"><button type="button" class="v-button cm-shop-search-btn" data-action="shop-search" aria-label="Search cards" aria-expanded="${searchOpen}" title="Search cards"><span aria-hidden="true">\u{1F50D}</span></button>${b('Ready to add','pull-picker')}${b(expanded?'Hide filters':(gbGet()?'Filters •':'Filters'),'roster-filters')}${b('Tools','shop-tools',{},false,{caret:'down'})}</div><label class="cm-search cm-shop-search" id="cm-shop-search"${searchOpen?'':' hidden'}>Search cards<input id="cm-roster-query" value="${e(filter.q)}" placeholder="Name, type or rules text"></label>`;
C.main.innerHTML=cardsHead(params,tab,'table',{tight})+(shop?'':'<div id="cm-roster-stats"></div>')+`<div class="cm-actions">${[['card','Card',params.get('card')?(C.card(params.get('card'))||C.catalog.get(params.get('card')))?.name||'Card':''],['deck','Deck',params.get('deck')?M.deck(C.state,params.get('deck')).name:''],['group','Group',params.get('group')?C.state.groups.find(g=>g.id===params.get('group'))?.name||'':'']].filter(([,,v])=>v).map(([k,l,v])=>`<span class="cm-chip cm-scope-chip">${l}: ${e(v)}<button type="button" class="cm-chip-x" data-action="clear-scope" data-key="${k}" aria-label="Remove the ${l} filter" title="Remove this filter">×</button></span>`).join('')}</div>`+(tight?shopTools:`<div class="cm-toolbar"><label class="cm-search">Search cards<input id="cm-roster-query" value="${e(filter.q)}" placeholder="Name, type or rules text"></label>${b(expanded?'Hide filters':(activeFilters().length?`Filters (${activeFilters().length})`:'Filters'),'roster-filters')}${b('Columns','roster-columns')}${b('Clear filters','clear-filters')}${s('Collection group','groupPick',[['','All groups'],...C.state.groups.map(g=>[g.id,g.name])],params.get('group')||filter.group)}${s('Group rows by','groupBy',GROUP_CHOICES,gbGet())}</div>`)+`<div id="cm-filter-chips"></div><div id="cm-filter-host"></div>${shop?'<div id="cm-shop-strip"></div>':''}<div id="cm-roster-table"></div>`;
foldPrints=foldFor(shop);pageSize=C.state.preferences.pageSize==='all'?Infinity:(Number(C.state.preferences.pageSize)||60);
/* FIVE FILTERS IN VIEW, THE REST ONE CLICK AWAY (search and group sit in the toolbar): type,
   mana, colour, status, deck. Subtype, mechanic, flags, offers, mana value and
   price fold under More filters, which opens itself whenever one of them is set, so a filter
   can never act from behind a closed fold. */
const MORE_FILTERS=['subtype','mechanic','flag','offer','min','max','price'],moreSet=MORE_FILTERS.filter(k=>filter[k]!=='').length;
if(expanded)$('#cm-filter-host').innerHTML=`<div class="cm-filter-panel">${tight?s('Group rows by','groupBy',GROUP_CHOICES,gbGet()):''}${s('Card type','type',[['','All types'],'Artifact','Creature','Enchantment','Instant','Land','Planeswalker','Sorcery','Battle'],filter.type)}${s('Mana','mana',[['','Any'],'Mana rock','Mana dork','Mana source','Ramp spell','Land','Basic land'],filter.mana)}${s('Color identity','color',[['','All colors'],['W','White'],['U','Blue'],['B','Black'],['R','Red'],['G','Green'],['C','Colorless']],filter.color)}${s('Status','status',[['','Any status'],['owned','Owned (any)'],'Physical deck','Substitute','Reserved','Bench','Ordered','Watched','To buy','Draft list','Suggestion','Planned'],filter.status)}${s('Deck','deck',[['','All decks'],...C.state.decks.filter(d=>!d.archived).map(d=>[d.id,d.name])],params.get('deck')||'')}<details class="cm-more-filters"${moreSet?' open':''}><summary>More filters${moreSet?` (${moreSet} set)`:''}</summary><div>${f('Subtype','subtype',filter.subtype)}${f('Mechanic / keyword','mechanic',filter.mechanic)}${s('Slot flag','flag',[['','Any flag'],['option','Option — first to swap out'],['pinned','Pinned — keep']],filter.flag)}${s('Bench / Sell / Trade','offer',[['','All cards'],['bench','Unassigned bench'],['available','Sell / Trade'],['held','Pending deals']],filter.offer)}${f('Minimum mana value','min',filter.min,'type="number" min="0"')}${f('Maximum mana value','max',filter.max,'type="number" min="0"')}${f('Maximum price ($)','price',filter.price,'type="number" min="0" step="0.01"')}</div></details></div>`;
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
    :k==='paid'?(Number.isFinite(value(r,k))?C.money(value(r,k)):r.kind==='lot'&&r.card.price>0?`<span class="cm-muted cm-paid-list" title="No paid amount recorded; the list price stands in. Click to set what you paid.">≈ ${C.money(r.card.price)}</span>`:'<span class="cm-muted">$ —</span>')
    :tight&&k==='type'?e(shortType(r.card))
    :tight&&k==='rarity'?shortRarity(r.card)
    :e(value(r,k)??'Unknown');
  /* Status wears the state's colour and the badges; Source and Allocation, kept for the
     Columns dialog, read the same way. */
  const stateCol=k==='status'||k==='placement';
  const standInBadge=stateCol&&r.standIn&&r.placement!=='Substitute'?` <span class="cm-badge cm-badge-standin" title="Physically in ${e(M.deck(C.state,r.standInDeckId).name)}, a substitute there until a real copy takes its seat">Substitute in ${e(M.deck(C.state,r.standInDeckId).name)}</span>`:'';
  if(stateCol&&(r.option||r.pinned))return (mixed?body:C.pill(body,C.pillKind(value(r,k),r.placement)))+standInBadge+(r.option?` <span class="cm-badge cm-badge-option" title="${e(r.optionWhy||'First candidate to swap out')}">Option</span>`:'')+(r.pinned?' <span class="cm-badge" title="Pinned: kept whatever the Lab or a swap suggests">Pinned</span>':'');
  if(k==='color')return body;
  if(k==='source'&&!mixed)return C.pill(body,C.pillKind(r.source,r.placement));
  if(stateCol&&!mixed)return C.pill(body,C.pillKind(value(r,k),r.placement))+standInBadge;
  if(!canEdit(r,k))return body;
  return `<button type="button" class="cm-cell-edit" data-action="cell-edit" data-record="${e(r.recordId)}" data-field="${e(k)}" title="Click to set ${e(EDITS[k])}">${body}</button>`;
};
const draw=()=>{const everything=rows(params,shop),matched=everything.filter(matches);lastRows=everything;const ribbon=$('#cm-roster-stats');if(ribbon)ribbon.innerHTML=statsHTML(matched,scoped());
const strip=$('#cm-shop-strip');if(strip)strip.innerHTML=stripHTML(matched);
const chips=$('#cm-filter-chips');if(chips)chips.innerHTML=chipsHTML();
/* The fold's summary counts the filters set behind it, and a filter typed there changes the count without a re-render. */
const fold=$('.cm-more-filters>summary');if(fold){const n=MORE_FILTERS.filter(k=>filter[k]!=='').length;fold.textContent=n?`More filters (${n} set)`:'More filters';}
/* A tick outlives a redraw only while its row still exists: a copy that was sold, a draft slot that was removed, a requirement that was filled all drop out. */
const live=new Set(everything.map(r=>r.recordId));for(const id of picked)if(!live.has(id))picked.delete(id);
const groupBy=gbGet();
visibleRows=(foldPrints?foldByCard(matched,groupBy):matched).sort((a,b)=>{if(groupBy){const g=groupOrder(a,groupBy).localeCompare(groupOrder(b,groupBy));if(g)return g;}const av=value(a,sort.key),bv=value(b,sort.key);return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av??'').localeCompare(String(bv??''),undefined,{numeric:true}))*sort.dir||a.recordId.localeCompare(b.recordId);});
const shown=columns.filter(([k])=>cols.includes(k));
/* The phone Shop is a list held in one hand at a booth; it has no room for a column that
   only matters when you are sitting down with the whole library. */
/* A folded row ticks as its copies: the box on the row stands for every pickable part. */
const ticks=!tight,span=shown.length+1+(ticks?1:0);
const tickIds=r=>r.kind==='fold'?r.partRows.filter(pickable).map(p=>p.recordId):[r.recordId];
const canTick=visibleRows.filter(pickable),allTicked=canTick.length>0&&canTick.every(r=>tickIds(r).every(id=>picked.has(id)));
const isPicked=r=>tickIds(r).length>0&&tickIds(r).every(id=>picked.has(id));
/* BANDS THAT FOLD. Grouping cut the rows into bands under a heading, and a heading was all it
   was: a library grouped by deck was six headings and six hundred rows, with no way to put
   five decks away while reading the sixth. Each heading is a toggle now, and a folded band
   drops out of the paging so the next one moves up rather than leaving a page of nothing.
   The folded set belongs to the grouping that made it: change the grouping and every band
   is open again. */
if(groupBy!==collapsedKey){collapsed.clear();collapsedKey=groupBy;}
const bands=[];if(groupBy)for(const r of visibleRows){const label=groupLabel(r,groupBy)||'Unassigned',last=bands[bands.length-1];if(last&&last.label===label)last.rows.push(r);else bands.push({label,rows:[r]});}
const items=groupBy?bands.flatMap(band=>[{band},...(collapsed.has(band.label)?[]:band.rows.map(row=>({row})))]):visibleRows.map(row=>({row}));
page=Math.min(page,Math.max(0,Math.ceil(items.length/pageSize)-1));
/* On the Shop each band header also says what its To buy rows cost: Σ price × need over the
   requirement rows, so the per-deck subtotals add up to the strip above the table. */
const bandRow=band=>{const open=!collapsed.has(band.label),copies=band.rows.reduce((n,r)=>n+r.quantity,0),dollars=shop?band.rows.flatMap(r=>r.kind==='fold'?r.partRows:[r]).filter(r=>r.kind==='need').reduce((n,r)=>n+(r.card.price>0?r.card.price*r.quantity:0),0):0;return `<tr class="cm-group-row"><td colspan="${span}"><button type="button" class="cm-group-toggle" data-group-toggle="${e(band.label)}" aria-expanded="${open}"><span class="cm-group-caret" aria-hidden="true">${open?'▾':'▸'}</span><span>${e(band.label)}</span><small>${band.rows.length} record${band.rows.length===1?'':'s'} · ${copies} cop${copies===1?'y':'ies'}${shop?` · <b class="cm-band-dollars">${C.money(Math.round(dollars*100)/100)}</b> to buy`:''}</small></button></td></tr>`;};
const rowHTML=r=>`<tr class="cm-row-card${isPicked(r)?' cm-row-ticked':''}" data-record="${e(r.recordId)}" data-action="card" data-card="${e(r.cardId)}">${ticks?`<td class="cm-tick-cell">${pickable(r)?`<input type="checkbox" class="cm-row-tick" data-record="${e(r.recordId)}"${isPicked(r)?' checked':''} aria-label="Tick ${e(r.card.name)}">`:''}</td>`:''}${shown.map(([k])=>`<td class="cm-col-${k}${canEdit(r,k)?' cm-cell-live':''}">${k==='name'?`<button class="cm-card-name" data-action="card" data-card="${e(r.cardId)}"><span data-art="${e(r.card.image||'')}">${e(r.card.name)}${(tight||r.kind==='fold')&&r.quantity>1?` <em>×${r.quantity}</em>`:''}</span></button>${tight?(shop?`<span class="cm-row-primary">${primary(r)}</span>`:''):`<small>${r.kind==='fold'?foldCaption(r):e(value(r,'purpose'))+(r.kind==='option'?' · Uncommitted suggestion':'')}</small>`}`:cell(r,k)}</td>`).join('')}<td class="cm-row-actions-cell">${r.kind==='fold'?`${!tight?primary(r):''}<span class="cm-muted cm-fold-note">${r.parts} records</span>`:`${!tight?primary(r):''}<button class="v-button compact cm-row-actions" data-action="row-actions" data-record="${e(r.recordId)}" aria-haspopup="menu" aria-label="Actions" title="Actions">⋯</button>`}</td></tr>`;
const allFolded=bands.length>0&&bands.every(band=>collapsed.has(band.label));
const foldAll=groupBy&&bands.length?` · <button type="button" class="cm-text-button" data-groups="${allFolded?'expand':'collapse'}">${allFolded?'Expand all groups':'Collapse all groups'}</button>`:'';
const pagingHTML=()=>`<div class="cm-paging"><span>${Number.isFinite(pageSize)?`Page ${page+1} of ${Math.max(1,Math.ceil(items.length/pageSize))}`:`All ${items.length} rows`} · ${visibleRows.length.toLocaleString()} record${visibleRows.length===1?'':'s'}${foldAll}</span><div class="cm-actions"><button class="v-button" data-page="-1" ${page===0||!Number.isFinite(pageSize)?'disabled':''}>Previous</button><button class="v-button" data-page="1" ${!Number.isFinite(pageSize)||(page+1)*pageSize>=items.length?'disabled':''}>Next</button></div></div>`;
const longer=Number.isFinite(pageSize)&&items.length>pageSize;
$('#cm-roster-table').innerHTML=`${ticks?batchBar():''}${longer?pagingHTML():`<p class="cm-status-line">${visibleRows.length.toLocaleString()} record${visibleRows.length===1?'':'s'}${foldAll}</p>`}<div class="cm-table-wrap"><table class="cm-table${tight?' cm-table-shop':''}"><thead><tr>${ticks?`<th scope="col" class="cm-tick-cell"><input type="checkbox" class="cm-tick-all"${allTicked?' checked':''} aria-label="Tick every matching record"></th>`:''}${shown.map(([k,l])=>`<th scope="col" class="cm-col-${k}" aria-sort="${sort.key===k?(sort.dir===1?'ascending':'descending'):'none'}"><button data-sort="${k}">${l}${sort.key===k?` <span aria-hidden="true">${sort.dir===1?'↑':'↓'}</span>`:tight?'':' <span class="cm-sort-idle" aria-hidden="true">↕</span>'}</button></th>`).join('')}<th scope="col">Actions</th></tr></thead><tbody>${(Number.isFinite(pageSize)?items.slice(page*pageSize,page*pageSize+pageSize):items).map(it=>it.band?bandRow(it.band):rowHTML(it.row)).join('')||`<tr><td colspan="${span}">No matching records. Add your cards or clear the filters.</td></tr>`}</tbody></table></div>${pagingHTML()}`;$('#cm-roster-table').onclick=ev=>{
    const tick=ev.target.closest('.cm-row-tick'),all=ev.target.closest('.cm-tick-all');
    if(tick||all){
      /* The row itself opens the card. Stopping here keeps a tick a tick -- the document's
         [data-action] handler never sees it, so the page does not change under the reader. */
      ev.stopPropagation();
      if(tick){const r=findRow(tick.dataset.record);for(const id of r?tickIds(r):[tick.dataset.record]){if(tick.checked)picked.add(id);else picked.delete(id);}}
      else if(all.checked){let n=0;for(const r of canTick)for(const id of tickIds(r)){if(n++<500)picked.add(id);}if(n>500)C.notice('Ticked the first 500 records — a batch changes at most 500 at once.');}
      else for(const r of canTick)for(const id of tickIds(r))picked.delete(id);
      draw();return;
    }
    const one=ev.target.closest('[data-group-toggle]'),every=ev.target.closest('[data-groups]');
    if(one){ev.stopPropagation();const label=one.dataset.groupToggle;if(collapsed.has(label))collapsed.delete(label);else collapsed.add(label);draw();return;}
    if(every){ev.stopPropagation();if(every.dataset.groups==='collapse')for(const band of bands)collapsed.add(band.label);else collapsed.clear();draw();return;}
    const so=ev.target.closest('[data-sort]'),pa=ev.target.closest('[data-page]');if(so){const key=so.dataset.sort;sort={key,dir:sort.key===key?-sort.dir:1};draw();}if(pa){page+=Number(pa.dataset.page);draw();}};};
$('#cm-roster-query').addEventListener('input',ev=>{filter.q=ev.target.value;page=0;draw();});$('[name=groupBy]')?.addEventListener('change',ev=>{gbSet(ev.target.value);page=0;draw();});$('[name=groupPick]')?.addEventListener('change',ev=>{filter.group=ev.target.value;goCards(tab,{deck:params.get('deck'),group:filter.group});});$('#cm-filter-host').addEventListener('input',ev=>{if(ev.target.name==='deck')return;if(ev.target.name==='groupBy'){gbSet(ev.target.value);page=0;draw();return;}if(ev.target.name==='group'){filter.group=ev.target.value;goCards(tab,{deck:params.get('deck'),group:filter.group});return;}filter[ev.target.name]=ev.target.value;page=0;draw();});$('#cm-filter-host').addEventListener('change',ev=>{if(ev.target.name==='deck')goCards(tab,{deck:ev.target.value,group:params.get('group')});});draw();}
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
actions['batch-arrived']=()=>{const lotIds=pickedIds().filter(id=>{const l=C.state.lots.find(x=>x.id===id);return l&&l.source==='ordered';});if(!lotIds.length)throw Error('Tick at least one ordered copy first.');
  const paidByLot=Object.fromEntries(lotIds.map(id=>{const r=findRow(id);return [id,r?priceOf(r):null];}).filter(([,p])=>p!==null));
  C.review(`${lotIds.length} record${lotIds.length===1?'':'s'} arrived`,note('The copies land on the bench, still reserved to their decks; the sheet price is recorded as paid where nothing was. Add them to their decks from Ready to add.'),{type:'bulk',op:'source',source:'owned',lotIds,paidByLot,paidSource:'catalog'});};
/* WHICH BOX A COPY SITS IN IS A FACT ABOUT THE COPY, so it is recorded here rather than as
   a deck-wide button on the deck page: tick the copies you sleeved and say where they went.
   Only copies already reserved for that deck can go in it -- the model refuses the rest by
   name, so a mistaken tick says which card and why instead of quietly moving it. */
actions['batch-place']=()=>{
  const lotIds=pickedIds();
  if(!lotIds.length)throw Error('Tick at least one copy record first.');
  const decks=C.state.decks.filter(d=>!d.archived&&d.status==='final');
  if(!decks.length)throw Error('Finalize a deck first — a draft holds no reservations to confirm.');
  form('Put these copies in a physical deck',s('Deck','deckId',decks.map(d=>[d.id,d.name]),'')+f('Box label (optional)','box')+`<label class="cm-checkbox cm-full"><input type="checkbox" name="asStandIn"> Allow substitutes: a copy this deck's list does not call for goes in unreserved, filling a seat until the real card arrives</label>`+note('Records where these copies physically are. Ownership does not change. A ticked copy that is not reserved for this deck is refused by name unless substitutes are allowed; one the list calls for is reserved on the way in.'),
    v=>C.review('Put these copies in a physical deck',note(`${lotIds.length} record${lotIds.length===1?'':'s'} move into ${e(M.deck(C.state,v.deckId).name)}${v.asStandIn?', as substitutes where the list does not call for them':''}.`),{type:'bulk',op:'place',deckId:v.deckId,box:v.box,lotIds,...(v.asStandIn?{asStandIn:true}:{})}),'Review placement');
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
actions['roster-filters']=()=>{expanded=!expanded;C.render();};actions['clear-filters']=()=>{for(const k of Object.keys(filter))filter[k]='';page=0;const buy=buyTab();if(buy)shopGroupBy='deck';else groupBy='';goCards(buy?'buy':'library');};
actions['roster-columns']=()=>{const shop=buyTab(),current=shop?shopSelected:selected;form('Choose table columns',`<div class="cm-full cm-columns-grid">${columns.map(([k,l])=>`<label class="cm-checkbox"><input type="checkbox" name="${k}" ${current.includes(k)?'checked':''} ${k==='name'?'disabled':''}>${l}</label>`).join('')}</div><label class="cm-checkbox cm-full"><input type="checkbox" name="__fold" ${foldFor(shop)?'checked':''}>One row per card, whatever the print or deck</label>${s('Rows per page','__pageSize',[['60','60'],['120','120'],['all','All']],C.state.preferences.pageSize||'60')}`,async data=>{const next=['name',...columns.filter(([k])=>k!=='name'&&data[k]).map(([k])=>k)];const values={pageSize:data.__pageSize,[shop?'shopFold':'foldPrints']:!!data.__fold};if(shop){shopSelected=next;values.shopColumns=next;}else{selected=next;values.columns=next;}page=0;await commit({type:'preferences',values});},'Apply columns');};
/* ACTIVE FILTERS AS CHIPS under the search: each one removable on its own, Clear all beside
   them, and the Filters button says how many are on. */
const FILTER_NAMES={q:'Search',type:'Type',subtype:'Subtype',mechanic:'Mechanic',color:'Color',status:'Status',offer:'Bench / Sell / Trade',min:'Min mana value',max:'Max mana value',price:'Max price',group:'Group'};
const activeFilters=()=>Object.entries(filter).filter(([k,v])=>v!==''&&k!=='group');
function chipsHTML(){const on=activeFilters();if(!on.length)return '';const label=(k,v)=>k==='color'?({W:'White',U:'Blue',B:'Black',R:'Red',G:'Green',C:'Colorless'}[v]||v):k==='status'?(v==='owned'?'Owned':v):k==='price'?'$'+v:v;
  return `<div class="cm-fchips">${on.map(([k,v])=>`<button type="button" class="cm-fchip" data-action="clear-filter" data-key="${e(k)}" aria-label="Remove filter ${e(FILTER_NAMES[k]||k)}">${e(FILTER_NAMES[k]||k)}: <strong>${e(label(k,v))}</strong> <span aria-hidden="true">✕</span></button>`).join('')}<button type="button" class="cm-text-button" data-action="clear-filters">Clear all</button></div>`;}
actions['clear-filter']=el=>{filter[el.dataset.key]='';page=0;C.render();};
/* The folded row's caption: how many copies, for which decks. */
const foldCaption=r=>{const decks=[...new Set(r.partRows.map(p=>p.deckId?shortDeck(M.deck(C.state,p.deckId)):''))].filter(Boolean);return `×${r.quantity}${decks.length?' · '+decks.map(e).join(', '):''} · ${r.parts} records`;};
/* DECK ASSEMBLY IS THE READY TO ADD LIST NOW. The Shop's second list was six hundred reserved copies in
   alphabetical order; assembling a deck at the table is one deck's sheet, grouped by where
   each card is sitting. So the button asks which deck and opens that deck's Ready to add list. */
actions['pull-picker']=el=>{const decks=C.state.decks.filter(d=>!d.archived&&d.status==='final');if(!decks.length)throw Error('Finalize a deck first — Ready to add lists a finalized deck’s owned, reserved copies.');popAt(el,`<p>Ready to add for</p>${decks.map(d=>{const r=M.readiness(C.state,d),n=r.pullFromBench+r.pullFromOtherBox+r.remove;return b(`${d.name}${n?` · ${n} ready to add`:''}`,'deck-pull',{deck:d.id});}).join('')}`);};
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
/* THE ROW'S ONE OBVIOUS VERB, BY STATE. A To buy row is bought (or ordered); an ordered
   copy arrives; an owned copy reserved to a deck but not in its box goes in the box; an
   unassigned bench copy is reserved. A copy already in its box has nothing obvious left to do
   and gets no button. The menu keeps everything else, in sections. */
const shortDeck=d=>{const m=d.name.match(/^(D\d+)\b/);return m?m[1]:d.name.length>18?d.name.slice(0,17)+'…':d.name;};
function primary(r){if(r.kind==='fold'){const parts=r.partRows;if(parts.every(p=>p.kind==='need'||p.kind==='lot'&&M.PLANNED.includes(p.source)))return `<button class="v-button primary compact cm-row-buy" data-action="shop-buy" data-record="${e(r.recordId)}">Bought</button>`;if(parts.every(p=>p.kind==='lot'&&p.source==='ordered'))return `<button class="v-button primary compact cm-row-buy" data-action="shop-arrive" data-record="${e(r.recordId)}">Arrived</button>`;return '';}
  if(r.kind==='need'||r.kind==='lot'&&M.PLANNED.includes(r.source))return `<button class="v-button primary compact cm-row-buy" data-action="shop-buy" data-record="${e(r.recordId)}">Bought</button>`;
  if(r.kind==='lot'&&r.source==='ordered')return `<button class="v-button primary compact cm-row-buy" data-action="shop-arrive" data-record="${e(r.recordId)}">Arrived</button>`;
  if(r.kind==='lot'&&r.source==='owned'&&r.allocation&&r.placement!=='Physical deck'){const d=M.deck(C.state,r.allocation.deckId);return `<button class="v-button primary compact cm-row-buy" data-action="place-now" data-record="${e(r.recordId)}" title="Record that this copy is in ${e(d.name)}’s physical deck">Put in ${e(shortDeck(d))}</button>`;}
  if(r.kind==='lot'&&r.placement==='Substitute')return `<button class="v-button compact cm-row-buy" data-action="place-row" data-record="${e(r.recordId)}" title="Move this substitute back to the Bench">To bench</button>`;
  if(r.kind==='lot'&&r.source==='owned'&&!r.allocation&&r.location?.kind!=='deck')return `<button class="v-button compact cm-row-buy" data-action="reserve-row" data-record="${e(r.recordId)}">Reserve…</button>`;
  return '';}
/* One tap: the whole lot into the box it is reserved for. */
actions['place-now']=async el=>{const r=findRow(el.dataset.record);if(!r||r.kind!=='lot'||!r.allocation)throw Error('Only a copy reserved to a deck can go into its physical deck.');const l=M.lot(C.state,r.id),d=M.deck(C.state,l.allocation.deckId);await commit({type:'place',lotId:l.id,deckId:d.id,quantity:l.quantity,confirmed:true});C.notice(`${r.card.name} is in ${d.name}’s physical deck.`);};
/* A folded row buys for every deck that wants the card: one command per part, one batch. */
function tapCommand(r,to){const paid=sheetPrice(r);if(r.kind==='need')return {type:'acquire',cards:[r.card],lot:{cardId:r.cardId,quantity:r.quantity,source:to,printing:{...(r.printing||{})},location:{kind:'bench',box:''},notes:'',paid,paidSource:'catalog'},deckId:r.deckId,slotId:r.slotId};const l=M.lot(C.state,r.id);return {type:'source',source:to,lotId:l.id,quantity:l.quantity,paid,paidSource:'catalog',confirmed:true};}
async function oneTap(el,to){const r=findRow(el.dataset.record);if(!r)throw Error('That row changed. Refresh the view.');
  const parts=r.kind==='fold'?r.partRows.filter(buyable):[r];if(!parts.length||!buyable(r)&&r.kind!=='fold')throw Error('This copy is already recorded as owned.');
  const commands=parts.map(p=>tapCommand(p,to));
  await commit(commands.length===1?commands[0]:{type:'batch',commands,summary:`${to==='owned'?'Bought':'Ordered'} ${r.card.name} for ${parts.length} decks`});
  return r;}
actions['shop-buy']=async el=>{const r=await oneTap(el,'owned');C.notice(`${r.quantity>1?r.quantity+' × ':''}${r.card.name} ${r.quantity>1?'are':'is'} yours — on the Bench until you put ${r.quantity>1?'them':'it'} in a physical deck${sheetPrice(r)!==null?', '+C.money(sheetPrice(r))+' recorded as paid':''}. Undo is in the header menu.`);};
actions['shop-order']=async el=>{const r=await oneTap(el,'ordered');C.notice(`${r.card.name} marked Ordered${sheetPrice(r)!==null?' at '+C.money(sheetPrice(r)):''}. Arrived is on the row when it lands.`);};
actions['shop-arrive']=async el=>{const r=findRow(el.dataset.record);const parts=r&&r.kind==='fold'?r.partRows:[r];if(!r||!parts.every(p=>p&&p.kind==='lot'&&p.source==='ordered'))throw Error('Only an ordered copy can arrive.');const commands=parts.map(p=>({type:'source',source:'owned',lotId:p.id,quantity:p.quantity,paid:sheetPrice(p),paidSource:'catalog',confirmed:true}));await commit(commands.length===1?commands[0]:{type:'batch',commands,summary:`${r.card.name} arrived for ${parts.length} decks`});C.notice(`${r.card.name} arrived — on the bench, still reserved. Add it to its physical deck from Ready to add.`);};
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
  const unpaid=matched.filter(r=>r.kind==='lot'&&r.source==='ordered'&&!Number.isFinite(r.paid)).reduce((n,r)=>n+price(r)*r.quantity,0);
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
/* KEEP, OR FIRST TO GO. Pin says this card stays whatever the Lab or a swap suggests; Option
   says the opposite: when a card has to come out of the hundred, start here. The flag moves
   nothing -- the card stays in the list, reserved, in its box -- and one excludes the other. */
function slotFlagButtons(deckId,slotId){const r=M.slot(C.state,deckId,slotId);return b(r.pinned?'Unpin slot':'Pin slot','pin-slot',{deck:deckId,slot:slotId})+(r.purpose==='main'?b(r.option?'Clear option flag':'Flag as option (first to swap out)','flag-slot',{deck:deckId,slot:slotId}):'');}
actions['flag-slot']=el=>{const d=M.deck(C.state,el.dataset.deck),r=M.slot(C.state,d.id,el.dataset.slot);
  if(r.option)return C.commit({type:'flag',deckId:d.id,slotId:r.id,option:false});
  return form('Flag as an option to swap out',`<div class="cm-full">${note(`${e(C.card(r.cardId).name)} stays in ${e(d.name)}, reserved and in its box. The flag marks it as a first candidate when a card has to come out; Pinned is the opposite flag, and setting one clears the other.`)}</div>`+f('Why (optional)','why','','maxlength="300" placeholder="Redundant with…"'),v=>C.commit({type:'flag',deckId:d.id,slotId:r.id,option:true,why:v.why}),'Flag as option');};
/* The same two flags for a ticked set: every ticked row that belongs to a deck list. */
function pickedSlots(){const out=new Map();for(const id of picked){const l=C.state.lots.find(l=>l.id===id);const ref=l?l.allocation:(()=>{const r=findRow(id);return r&&r.deckId&&r.slotId?{deckId:r.deckId,slotId:r.slotId}:null;})();if(ref)out.set(ref.deckId+'|'+ref.slotId,ref);}return [...out.values()];}
actions['batch-flag']=el=>{if(!picked.size)throw Error('Tick at least one row first.');popAt(el,`<p>Flags for the ticked rows</p>${b('Flag as option (first to swap out)','batch-flag-set',{flag:'option'})}${b('Clear option flag','batch-flag-set',{flag:'clear'})}${b('Pin (keep)','batch-flag-set',{flag:'pin'})}${b('Unpin','batch-flag-set',{flag:'unpin'})}`);};
actions['batch-flag-set']=el=>{const flag=el.dataset.flag,refs=pickedSlots().filter(ref=>flag==='pin'||flag==='unpin'||M.slot(C.state,ref.deckId,ref.slotId).purpose==='main');
  if(!refs.length)throw Error('Tick rows that belong to a deck list first — a bench copy has no slot to flag.');
  const commands=refs.map(ref=>flag==='pin'||flag==='unpin'?{type:'pin',deckId:ref.deckId,slotId:ref.slotId,pinned:flag==='pin'}:{type:'flag',deckId:ref.deckId,slotId:ref.slotId,option:flag==='option'});
  const label={option:'Flag as option',clear:'Clear the option flag on',pin:'Pin',unpin:'Unpin'}[flag];
  C.review(`${label} ${refs.length} card${refs.length===1?'':'s'}`,note(flag==='option'?'Nothing moves. The flagged cards stay in their lists, reserved and in their boxes; they are the first candidates when a card has to come out.':'Nothing moves; only the flag changes.'),{type:'batch',commands,summary:`${label} ${refs.length} deck card${refs.length===1?'':'s'}`});};
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
  const current=r.kind==='lot'?r.source:'';
  const items=LADDER.map(([id,label,why])=>{
    if(r.kind==='need'&&id==='watching')return '';
    if(id===current)return rung(label,r.kind==='need'?'this requirement is already on the to-buy list':'current status','disabled aria-current="true"',true);
    const loses=r.kind==='lot'&&r.source==='owned'&&(r.allocation||r.location?.kind==='deck');
    if(loses)return rung(label,'takes it out of its physical deck and clears the reservation — asks first',`data-action="status-dialog" data-record="${e(r.recordId)}" data-source="${id}"`);
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
  menu.addEventListener('toggle',ev=>{if(ev.newState==='closed')close();});menu.addEventListener('cm-moved',close);
}
actions['row-actions']=el=>{const r=findRow(el.dataset.record);if(!r)throw Error('That row changed. Refresh the view.');document.querySelectorAll('.cm-row-menu').forEach(m=>m.remove());const menu=document.createElement('div');menu.className='cm-menu cm-row-menu';menu.setAttribute('popover','auto');
  const flyout=(id,label,body)=>`<button type="button" id="${id}-toggle" class="cm-submenu-toggle" aria-expanded="false" aria-controls="${id}" aria-haspopup="menu">${e(label)} ${C.caret('left')}</button><div id="${id}" class="cm-menu cm-side-submenu" popover="manual">${body}</div>`;
  const slotId=r.slotId||r.allocation?.slotId,finals=C.state.decks.filter(d=>!d.archived&&d.status==='final');
  /* FOUR SECTIONS, NOT FOURTEEN ITEMS. Status is the ladder; Where it is moves the physical
     copy; Plan is what the deck asks of it; Record is the copy's own facts. A section with
     nothing that applies is not drawn, and Sell / Trade sits under the rule at the bottom
     with the other things that take a card out of play. */
  const section=(title,items)=>{const body=items.filter(Boolean).join('');return body?`<p class="cm-menu-section">${e(title)}</p>${body}`:'';};
  const owned=r.kind==='lot'&&r.source==='owned';
  menu.innerHTML=`<p>${e(r.card.name)} · ${r.quantity}${r.kind==='draft'?' · Draft list':r.kind==='need'?' · To buy':''}</p>`
    +(r.kind==='fold'?'':flyout('cm-status-submenu','Status',statusMenu(r)))
    +section('Where it is',[owned?flyout('cm-put-submenu','Put in physical deck',finals.map(d=>b(d.name,'place-row',{record:r.recordId,deck:d.id})).join('')||'<p>Finalize a matching deck first.</p>'):'',owned?flyout('cm-standin-submenu','Put in a physical deck as a substitute',finals.filter(d=>!(r.location?.kind==='deck'&&r.location.deckId===d.id)).map(d=>b(d.name,'standin-row',{record:r.recordId,deck:d.id})).join('')||'<p>Finalize a deck first.</p>'):'',owned&&r.location?.kind==='deck'?b('Move physically to Bench','place-row',{record:r.recordId}):''])
    +section('Plan',[r.kind==='lot'&&!M.PLANNED.includes(r.source)?b('Reserve for a deck','reserve-row',{record:r.recordId}):'',r.kind==='lot'&&r.allocation?b('Release reservation → To buy','release-row',{record:r.recordId}):'',r.deckId&&slotId?b('Replacements & options','replacement',{deck:r.deckId,slot:slotId}):'',r.deckId&&slotId?slotFlagButtons(r.deckId,slotId):''])
    +section('Record',[r.kind==='lot'?b('Edit print & details','edit-row',{record:r.recordId}):'',b('Add another copy','add-card',{card:r.cardId}),r.kind==='lot'?b('Add / move to group','group-row',{record:r.recordId}):'',r.kind==='entry'?b('Move / copy to group','group-entry-row',{record:r.recordId}):''])
    +(owned?`<hr>${b('Sell / Trade','offer-row',{record:r.recordId})}`:'');
  document.body.append(menu);menu.showPopover();const place=()=>{if(!el.isConnected){if(menu.matches(':popover-open'))menu.hidePopover();return;}const rect=el.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight){if(menu.matches(':popover-open'))menu.hidePopover();return;}menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,rect.right-menu.offsetWidth))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,rect.bottom+5))+'px';menu.dispatchEvent(new Event('cm-moved'));};place();C.followAnchor(menu,place);
  wireSubmenu(menu,'cm-status-submenu');wireSubmenu(menu,'cm-put-submenu');wireSubmenu(menu,'cm-standin-submenu');
  menu.addEventListener('click',ev=>{const hit=ev.target.closest('[data-action]');if(hit&&hit.dataset.action!=='row-count')menu.hidePopover();});};
/* THE ONE MOVE THAT LOSES SOMETHING. An owned copy sitting in a physical deck, or reserved to a
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
async function acquire(c,{row,initialSource='owned'}={}){form('Record '+c.name,`<div class="cm-full">${note(row?'These copies will fulfill this deck requirement. Physical placement remains Bench until you confirm Put in deck.':'Record copies you own, ordered or arranged to receive — or mark a card Watched while you decide. A deck plan alone creates no ownership.')}</div>`+f('Quantity','quantity',row?.quantity||1,'type="number" min="1" max="1000000" required')+s('Source','source',[['owned','Owned'],['ordered','Ordered'],['watching','Watched — considering it']],initialSource)+printFields(row?.printing)+f('Box / location when owned','box')+f('Purchase cost (optional)','paid','','type="number" min="0" step="0.01"')+`<label class="cm-full">Notes<textarea name="notes"></textarea></label>`,async v=>{let exact=c,p=printing(v);if(p.set&&p.collector){exact=await C.catalog.resolve(c.name,{printing:p});if(!exact)throw Error('No exact printing found. Check the set and collector number.');p.id=exact.scryfallId;}await commit({type:'acquire',cards:[exact],lot:{cardId:exact.id,quantity:Number(v.quantity),source:v.source,printing:p,location:{kind:'bench',box:v.box},notes:v.notes,paid:v.paid===''?null:Number(v.paid)},...(row?{deckId:row.deckId,slotId:row.slotId}: {})});},'Record copies');}
actions['add-card']=el=>el.dataset.card?acquire(C.card(el.dataset.card)||C.catalog.get(el.dataset.card)):C.cardPicker('Add to your library',c=>acquire(c));
function quantityAction(el,title,extra,build){const r=findRow(el.dataset.record);if(!r||r.kind!=='lot')throw Error('Select a physical or pending card record.');const l=M.lot(C.state,r.id);return form(title,`<div class="cm-full">${note(C.affected(l),!!l.allocation||l.location?.kind==='deck')}</div>`+f('Copies affected','quantity',l.quantity,`type="number" min="1" max="${l.quantity}" required`)+extra(l),v=>commit({...build(l,v),lotId:l.id,quantity:Number(v.quantity),confirmed:true}),'Confirm change');}
actions['place-row']=el=>quantityAction(el,el.dataset.deck?'Put in '+M.deck(C.state,el.dataset.deck).name:'Move physically to Bench',()=>f('Box label (optional)','box'),(_,v)=>({type:'place',deckId:el.dataset.deck||undefined,box:v.box}));
/* A SUBSTITUTE fills a seat while the real card is bought or on its way: the copy goes into the
   box without a reservation, the deck counts it, and Ready to add asks for it back when a
   real copy is ready. A copy the list does call for is reserved on the way in instead. */
actions['standin-row']=el=>{const d=M.deck(C.state,el.dataset.deck);return quantityAction(el,'Substitute in '+d.name,()=>`<div class="cm-full">${note(`Goes into ${e(d.name)} without a reservation, filling a seat while the real card is bought or on its way. ${e(d.name)} counts it as a substitute and Ready to add asks for it back when a real copy is ready. If the list does call for this card, it is reserved on the way in instead.`)}</div>`+f('Box label (optional)','box'),(_,v)=>({type:'place',deckId:d.id,box:v.box,asStandIn:true}));};
actions['reserve-row']=el=>quantityAction(el,'Reserve copies for a deck',l=>s('Target deck','deck',C.state.decks.filter(d=>d.status==='final'&&!d.archived&&d.slots.some(r=>r.committed&&M.compatible(l,r)&&M.shortfall(C.state,d,r)>0)).map(d=>[d.id,d.name]),'')+note('This changes the reservation and exposes any donor deck shortfall. The physical box stays unchanged. Locked and In deck donors require this explicit confirmation.',true),(l,v)=>{if(!v.deck)throw Error('No finalized deck has a compatible unfulfilled requirement. Accept a matching replacement first.');const d=M.deck(C.state,v.deck),r=d.slots.find(r=>r.committed&&M.compatible(l,r)&&M.shortfall(C.state,d,r)>=Number(v.quantity));if(!r)throw Error('This quantity exceeds the matching requirement. Reduce the quantity or choose another deck.');return {type:'allocate',deckId:d.id,slotId:r.id};});
actions['release-row']=el=>quantityAction(el,'Release these copies',()=>note('The reservation becomes unfulfilled (To buy). Owned copies remain owned, with the same last confirmed physical location.'),()=>({type:'release',destination:'bench'}));
actions['offer-row']=el=>quantityAction(el,'Sell / Trade collection',l=>s('Availability','offer',[['none','Remove from Sell / Trade'],['available','Available for sale / trade'],['held','Held for a pending deal']],l.offer)+note('Available offers remain candidates for builds. A pending deal releases a deck allocation and protects the copy from automatic reuse.'),(_,v)=>({type:'offer',offer:v.offer}));
actions['dispose-row']=el=>quantityAction(el,'Record copies leaving your library',()=>s('Reason','reason',[['sold','Sold'],['traded','Traded away'],['lost','Lost'],['gifted','Gifted'],['correction','Inventory correction']],'sold')+note('Confirm only after the copies have left your ownership. This reduces owned quantity and restores any unfulfilled deck needs.',true),(_,v)=>({type:'dispose',reason:v.reason}));
actions['edit-row']=el=>{const r=findRow(el.dataset.record),l=M.lot(C.state,r.id);form('Exact print & copy details',printFields(l.printing)+f('Price paid (optional)','paid',l.paid??'','type="number" min="0" step="0.01"')+`<label class="cm-full">Notes<textarea name="notes">${e(l.notes)}</textarea></label><label class="cm-checkbox cm-full"><input type="checkbox" name="keepBench" ${l.keepBench?'checked':''}>Keep on bench during automatic fulfillment</label>`,async v=>{const p=printing(v,l.printing);if(p.set&&p.collector){const c=await C.catalog.resolve(r.card.name,{printing:p});if(!c)throw Error('Printing not found.');p.id=c.scryfallId;}else if(p.set!==l.printing.set||p.collector!==l.printing.collector)p.id='';await commit({type:'editLot',lotId:l.id,printing:p,notes:v.notes,paid:v.paid===''?null:Number(v.paid),keepBench:!!v.keepBench});});};
actions['new-group']=()=>form('New Collection group',f('Group name','name','','required maxlength="100"'),async v=>{const id='group:'+C.uid();await commit({type:'createGroup',groupId:id,name:v.name});goCards('library',{group:id});},'Create group');
actions['group-row']=el=>{const r=findRow(el.dataset.record);if(!C.state.groups.length)return actions['new-group']();form('Add or move to Collection group',s('Destination group','group',C.state.groups.map(g=>[g.id,g.name]),C.state.groups[0].id)+s('Remove previous membership (optional)','from',[['','Keep existing memberships'],...r.groupIds.map(id=>[id,C.state.groups.find(g=>g.id===id).name])],''),v=>commit({type:'groupLots',lotIds:[r.id],groupId:v.group,moveFrom:v.from||undefined}));};
actions['group-entry-row']=el=>{const r=findRow(el.dataset.record);if(C.state.groups.length<2)throw Error('Create another Collection group first.');form('Move or copy planned card',s('Destination group','to',C.state.groups.filter(g=>g.id!==r.groupId).map(g=>[g.id,g.name]),'')+s('Action','operation',[['move','Move planned entry'],['copy','Copy planned entry']],'move'),v=>commit({type:'moveGroupEntries',from:r.groupId,to:v.to,entryIds:[r.id],copy:v.operation==='copy'}));};
actions['manage-group']=el=>{const g=C.state.groups.find(g=>g.id===el.dataset.group);form('Manage '+g.name,f('Group name','name',g.name,'required')+`<div class="cm-full">${b('Import cards into this group','import-list',{group:g.id})}${b('Delete group','delete-group',{group:g.id})}</div>`,v=>commit({type:'renameGroup',groupId:g.id,name:v.name}));};actions['delete-group']=el=>C.review('Delete Collection group',note('Library copies remain owned. Group memberships and its draft entries will be removed.'),{type:'deleteGroup',groupId:el.dataset.group});
actions.replacement=el=>{const d=M.deck(C.state,el.dataset.deck),r=M.slot(C.state,d.id,el.dataset.slot);const main=r.purpose==='main'?r:M.slot(C.state,d.id,r.replaces),options=d.slots.filter(x=>x.replaces===main.id);modal('Options for '+C.card(main.cardId).name,`${note('Suggestions stay outside the committed hundred until you accept a replacement. Released owned copies fulfill compatible needs elsewhere, then move to Bench allocation. Where each one physically is stays recorded.')}${options.map(o=>`<article><h3>${e(C.card(o.cardId).name)}</h3><p>${e(o.purpose)}${o.targetBracket?' · B'+o.targetBracket:''} · ${o.committed?'Reserved option':'Suggestion'}</p>${b('Accept replacement','accept-option',{deck:d.id,slot:o.id})}${b('Remove option','remove-option',{deck:d.id,slot:o.id})}</article>`).join('')||'<p>No linked options yet.</p>'}<div class="cm-actions">${b('Choose a replacement','choose-replacement',{deck:d.id,slot:main.id},true)}${b('Add upgrade / bracket option','choose-option',{deck:d.id,slot:main.id})}</div>`);};
/* A REPLACEMENT IS FOR A PARTICULAR CARD. The picker used to open on the catalog's most
   popular cards, which offered The Restoration of Eiganjo for Abrade -- a suggestion with
   nothing to do with the card being replaced. It now ranks by likeness to that card and
   filters to the deck's colour identity, and the confirmation shows both cards, both
   prices and both TCGplayer pages side by side, because a swap decided from two names in
   a sentence is a swap decided blind. */
actions['choose-replacement']=el=>{
  const d=M.deck(C.state,el.dataset.deck),r=M.slot(C.state,d.id,el.dataset.slot);
  const out=C.card(r.cardId)||C.catalog.get(r.cardId);
  if(!out)throw Error('That slot names a card the library no longer holds.');
  const identity=[...new Set(d.commanders.map(id=>C.card(id)||C.catalog.get(id)).filter(Boolean).flatMap(c=>c.colorIdentity||[]))];
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
actions['export-view']=()=>{const shop=buyTab(),chosen=shop?shopSelected:selected;const rows=visibleRows.map(r=>Object.fromEntries(columns.map(([k])=>[k,value(r,k)])));
  /* The Shop's sheet carries its arithmetic: a subtotal line per deck and a total, in the
     same columns, so the file agrees with the strip above the table it came from. */
  if(shop){const need=visibleRows.filter(r=>r.kind==='need'),sub=new Map();for(const r of need){const deck=r.deckId?M.deck(C.state,r.deckId).name:'Unassigned';const s=sub.get(deck)||{n:0,d:0};s.n+=r.quantity;s.d+=(r.card.price>0?r.card.price:0)*r.quantity;sub.set(deck,s);}
    for(const [deck,s] of [...sub].sort())rows.push({name:`Subtotal · ${deck}`,deck,quantity:s.n,price:Math.round(s.d*100)/100});rows.push({name:'Total to buy',quantity:need.reduce((n,r)=>n+r.quantity,0),price:Math.round([...sub.values()].reduce((n,s)=>n+s.d,0)*100)/100});}
  const cols=columns.filter(([k])=>chosen.includes(k)||shop&&['price','cap','vendor','deck'].includes(k)).map(([key,label])=>({key,label}));C.download(shop?'CrankMagic-buy-list.csv':'CrankMagic-filtered-roster.csv',C.E.csv(rows,cols),'text/csv');C.notice('Exported the complete filtered view, including rows beyond the current page.');};
});

/* A HOVER PREVIEW INSTEAD OF A 26px THUMBNAIL. The thumbnails in every row were too small to
   read and set the row height; the art now appears beside the name while the pointer rests
   on it. One element, moved rather than made, and never on a touch screen. */
(function(){if(matchMedia('(hover:none)').matches)return;let box=null,img=null,timer=null,token=0;
  const ensure=()=>{if(box)return;box=document.createElement('div');box.className='cm-hover-art';box.hidden=true;box.innerHTML='<span class="cm-spinner" aria-hidden="true"></span><img alt="">';img=box.querySelector('img');img.addEventListener('load',()=>box.classList.remove('is-loading'));img.addEventListener('error',()=>{box.classList.remove('is-loading');box.hidden=true;});document.body.append(box);};
  const hide=()=>{clearTimeout(timer);token++;if(box)box.hidden=true;};
  const place=name=>{const r=name.getBoundingClientRect();box.style.left=Math.min(innerWidth-190,r.right+12)+'px';box.style.top=Math.max(8,Math.min(innerHeight-260,r.top-40))+'px';};
  /* The image is fetched when the row does not carry one yet -- a spinner stands in until it
     lands -- and the address is kept on the row so the next hover is instant. */
  document.addEventListener('mouseover',ev=>{const name=ev.target.closest('.cm-table .cm-card-name');if(!name)return hide();clearTimeout(timer);const my=++token;
    timer=setTimeout(async()=>{ensure();place(name);box.hidden=false;box.classList.add('is-loading');img.removeAttribute('src');
      let src=name.querySelector('[data-art]')?.dataset.art||'';
      if(!src){const id=name.closest('tr')?.dataset.card,c=id?(C.card(id)||C.catalog.get(id)):null;
        try{const full=c?await C.catalog.details(c,{onFail:()=>{}}):null;src=(full&&full.image)||(c&&c.image)||'';}catch{src=(c&&c.image)||'';}
        if(my!==token)return;
        if(!src){box.classList.remove('is-loading');box.hidden=true;return;}
        const holder=name.querySelector('[data-art]');if(holder)holder.dataset.art=src;}
      img.src=src;if(img.complete&&img.naturalWidth)box.classList.remove('is-loading');},160);});
  document.addEventListener('mouseout',ev=>{if(ev.target.closest('.cm-table .cm-card-name'))hide();});
  window.addEventListener('scroll',hide,{passive:true});})();
