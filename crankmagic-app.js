/* Shared production shell. All visible mutations follow a committed transaction;
 * browser navigation never creates holdings and static reference data stays opt-in.
 * Feature modules receive this context rather than keeping a second state store. */
(async function(){'use strict';
const M=CrankCollection,E=CrankExchange,$=(s,r=document)=>r.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const main=$('#cm-main'),dialog=$('#cm-dialog'),actions={},views={};let state=M.empty(),repo,catalog,glossary,disposeView=null,renderSeq=0,noticeTimer,committing=false,mirror=null;
const uid=()=>crypto.randomUUID(),money=n=>n===null||n===undefined?'Unknown':'$'+Number(n).toFixed(2),source=s=>({owned:'Owned',ordered:'Ordered',incoming:'Incoming trade',wanted:'Wanted',watching:'Watching',"to-buy":'To buy',draft:'Draft list'}[s]||s);
/* Colour identity as the game draws it -- the mana symbols -- rather than five coloured
   dots. A colourless identity keeps a single grey pip so the cell is never empty. */
function colors(ci){const list=ci||[];return `<span class="cm-colors" aria-label="${esc(list.join(', ')||'Colorless')}">${list.map(x=>/^[WUBRG]$/.test(x)?`<img class="cm-pip" src="assets/mana/${x}.svg?v=1" alt="" title="${esc({W:'White',U:'Blue',B:'Black',R:'Red',G:'Green'}[x])}">`:`<i class="cm-color ${esc(x)}" title="${esc(x)}"></i>`).join('')||'<i class="cm-color C" title="Colorless"></i>'}</span>`;}
function mana(cost){return `<span class="cm-mana" aria-label="Mana cost ${esc(cost||'unknown')}">${(String(cost||'').match(/\{[^}]+\}/g)||[]).map(x=>/^[WUBRG23]$/.test(x.slice(1,-1))?`<img src="assets/mana/${x.slice(1,-1)}.svg?v=1" alt="${esc(x)}" width="19" height="19">`:`<span class="cm-mana-symbol" title="${esc(x)}">${esc(x.slice(1,-1))}</span>`).join('')}</span>`;}
/* THE CARET IS DRAWN, NOT TYPED. A ▾ from one font and a ⌄ from another sat at different
   baselines and decided the height of the button carrying them; the SVG is 10px whatever the
   label's font does, and aria-hidden so the accessible name stays the words alone. `left`
   is the fly-out's, pointing at where the submenu opens. */
function caret(dir='down'){return `<svg class="cm-caret${dir==='left'?' cm-caret-left':''}" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2 3.5 5 6.5 8 3.5"/></svg>`;}
function button(label,action,data={},primary=false,{caret:dir='',cls=''}={}){return `<button type="button" class="v-button${primary?' primary':''}${cls?' '+cls:''}" data-action="${esc(action)}" ${Object.entries(data).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${esc(label)}${dir?caret(dir):''}</button>`;}
/* ONE PILL PER RUNG. Every place that names a status -- the roster's Source and Allocation
   cells, the card pop-up, the deck page, the pull sheet -- draws it through here, so the
   colour for "in the box" is the same colour everywhere. `pillKind` is the mapping from the
   model's words to the seven tokens; a word it does not know wears the draft grey. */
const PILL_KIND={'In deck box':'inbox',Reserved:'pull',Bench:'pull',Unassigned:'draft','Draft list':'draft',Suggestion:'draft',Planned:'draft',Owned:'pull',owned:'pull',Ordered:'ordered',ordered:'ordered','Incoming trade':'ordered',incoming:'ordered',Wanted:'buy',wanted:'buy','to-buy':'buy','To buy':'buy',Watching:'watch',watching:'watch',draft:'draft',remove:'remove'};
function pillKind(key,placement){if((key==='owned'||key==='Owned')&&placement==='In deck box')return 'inbox';return PILL_KIND[key]||'draft';}
function pill(text,kind,attrs=''){return `<span class="cm-pill ${esc(kind)}" ${attrs}>${text}</span>`;}
/* THE READINESS BAR: a deck's target as one line, cut into what is in the box, what you own
   but have to pull, what is on its way, and what still has to be bought. */
function readinessBar(r){const pull=(r.pullFromBench||0)+(r.pullFromOtherBox||0),way=(r.ordered||0)+(r.incoming||0),seg=[['inbox',r.inBox??r.placed??0,'in box'],['pull',pull,'to pull'],['ordered',way,'on the way'],['buy',r.toBuy||0,'to buy']];
  return `<div class="cm-readiness" role="img" aria-label="${esc(seg.map(([,n,l])=>`${n} ${l}`).join(', ')+` of ${r.target}`)}">${seg.map(([k,n])=>n>0?`<i class="${k}" style="flex:${n} 1 0"></i>`:'').join('')}</div>`;}
function readinessLegend(r){const pull=(r.pullFromBench||0)+(r.pullFromOtherBox||0),way=(r.ordered||0)+(r.incoming||0);return `<p class="cm-readiness-legend"><span><i class="inbox"></i>${r.inBox??r.placed??0} in box</span><span><i class="pull"></i>${pull} to pull</span><span><i class="ordered"></i>${way} on the way</span><span><i class="buy"></i>${r.toBuy||0} to buy</span></p>`;}
function options(items,value){return items.map(x=>{const [v,l]=Array.isArray(x)?x:[x,x];return `<option value="${esc(v)}"${String(v)===String(value)?' selected':''}>${esc(l)}</option>`;}).join('');}
/* A REQUIRED FIELD WEARS A MOUNTAIN. The red asterisk of every form on the web, except it
   is the red asterisk every form on the web uses, because that is the one mark a reader
   already knows without being taught it. It briefly wore the Mountain pip instead -- red is
   the game's own colour for "not optional" -- but a symbol a reader has to decode is a worse
   asterisk than an asterisk, however apt.

   It is driven by the field's OWN `required`, so the mark and the constraint cannot drift
   apart: you cannot get the mark without the validation, or the validation without the mark.
   `data-required` is the mark alone, for the case HTML cannot express -- a field that is
   required only in the sense that ONE of a set must be filled, where marking each `required`
   would demand all of them. The glyph is decorative; `aria-required` carries the meaning. */
const REQUIRED_PIP='<span class="cm-req" aria-hidden="true" title="Required">*</span>';
const requires=attrs=>/(^|\s)(required|data-required)(\s|=|$)/.test(attrs);
/* The mark is wrapped WITH its label text in one span: `label` is display:grid in this
   stylesheet, so a bare glyph beside a bare text node is a second grid ROW, and the mark
   landed on a line of its own under the words it belongs to. */
const labelled=(label,attrs)=>requires(attrs)?`<span class="cm-req-label">${esc(label)}${REQUIRED_PIP}</span>`:esc(label);
function field(label,name,value='',attrs=''){return `<label>${labelled(label,attrs)}<input name="${esc(name)}" value="${esc(value)}" ${requires(attrs)?'aria-required="true"':''} ${attrs}></label>`;}
function select(label,name,items,value,attrs=''){return `<label>${labelled(label,attrs)}<select name="${esc(name)}" aria-label="${esc(label)}" ${requires(attrs)?'aria-required="true"':''} ${attrs}>${options(items,value)}</select></label>`;}
function note(text,warn=false){return `<div class="cm-note${warn?' cm-warning':''}">${esc(text)}</div>`;}
function head(kicker,title,description,controls=''){return `<header class="cm-page-head"><div><div class="v-eyebrow cm-eyebrow-warm">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="cm-actions">${controls}</div></header>`;}
function notice(message,error=false){const el=$('#cm-notice');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.hidden=true,error?18000:7000);}
function modal(title,body){if(dialog.open)dialog.close();dialog.innerHTML=`<div class="cm-dialog-head"><h2 id="cm-dialog-title">${esc(title)}</h2><button type="button" class="cm-dialog-close" data-action="close" aria-label="Close dialog">×</button></div>${body}`;dialog.setAttribute('aria-labelledby','cm-dialog-title');dialog.showModal();return dialog;}
function form(title,body,submit,label='Save changes'){const d=modal(title,`<form class="cm-form"><div class="cm-form-grid">${body}</div><p class="cm-error" hidden role="alert"></p><div class="cm-form-footer">${button('Cancel','close')}<button class="v-button primary" type="submit">${esc(label)}</button></div></form>`);const baseRevision=state.revision,f=$('form',d);f.addEventListener('submit',async e=>{e.preventDefault();if(!f.reportValidity())return;const b=$('[type=submit]',f),error=$('.cm-error',f);b.disabled=true;error.hidden=true;try{if(baseRevision!==state.revision)throw Error('The library changed while this form was open. Close it and review the current records before retrying.');await submit(Object.fromEntries(new FormData(f)),f);if(dialog.contains(f)&&dialog.open)dialog.close();}catch(err){error.textContent=err.message;error.hidden=false;}finally{b.disabled=false;}});return f;}
function route(){const raw=location.hash.slice(1)||({'graph.html':'discover'}[location.pathname.split('/').pop()]||'decks'),[view,q='']=raw.split('?');return {view:views[view]?view:'decks',params:new URLSearchParams(q)};}
function go(view,params={}){const q=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==''&&v!==null&&v!==undefined));const hash='#'+view+(q.size?'?'+q:'');if(location.hash===hash)render();else location.hash=hash;}
/* HOW OLD THESE FACTS ARE. Every data file stamps itself with the moment it was baked, and
   none of that ever reached the reader: a price from three days ago and one from three
   months ago looked exactly alike, and a legality check against a stale list looks like a
   legality check. Four ages, in the sidebar and in the menu. Thirty days is the line,
   because by then a set has usually been printed and a ban list has usually moved. */
const DATA_AGES=[['catalog','Card catalog'],['prices','Prices'],['ranks','Popularity'],['graph','Relationship graph']];
const STALE_DAYS=30;
const daysSince=iso=>{const t=Date.parse(iso||'');return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/86400000)):null;};
const ageWord=n=>n===null?'not loaded yet':n===0?'refreshed today':n===1?'1 day old':`${n} days old`;
function describeData(){
  const dates=catalog?.dates?.()||{};
  const rows=DATA_AGES.map(([key,label])=>[label,daysSince(dates[key])]);
  const known=rows.map(([,n])=>n).filter(n=>n!==null);
  const worst=known.length?Math.max(...known):null;
  const menu=$('#cm-data-dates');
  if(menu)menu.innerHTML='<p>Card data</p>'+rows.map(([label,n])=>`<p class="cm-data-row${n!==null&&n>=STALE_DAYS?' cm-data-stale':''}"><span>${esc(label)}</span><span>${esc(ageWord(n))}</span></p>`).join('');
  const note=$('#cm-data-age');
  if(!note)return;
  note.hidden=worst===null;
  note.className='cm-data-age'+(worst!==null&&worst>=STALE_DAYS?' cm-data-stale':'');
  note.textContent=worst===null?'':worst>=STALE_DAYS
    ?`Card data ${ageWord(worst)} — prices and legality may have moved.`
    :`Card data ${ageWord(worst)}.`;
}
async function render(){if(!catalog)return;describeData();disposeView?.();disposeView=null;glossary?.hide();const seq=++renderSeq,r=route();document.querySelectorAll('[data-nav]').forEach(el=>el.setAttribute('aria-current',el.dataset.nav===r.view?'page':'false'));try{const cleanup=await views[r.view](r.params);if(seq===renderSeq)disposeView=cleanup||null;else cleanup?.();}catch(err){if(seq===renderSeq)main.innerHTML=head('Unable to open this view','Your saved library is intact',err.message,button('My Decks','home'));}status();}
function status(){if(repo)$('#cm-save-status').textContent=`Saved locally · revision ${state.revision}${navigator.onLine?'':' · offline'}`;}
async function refresh(){state=await repo.getState();for(const c of Object.values(state.cards))catalog?.add(c);await render();}
async function commit(command,{renderView=true}={}){if(committing)throw Error('A save is already in progress. Please wait for its receipt.');committing=true;$('#cm-save-status').textContent='Saving…';try{const result=await repo.commit({id:uid(),...command},state.revision);state=result.state;for(const c of Object.values(state.cards))catalog.add(c);notice(result.summary);if(renderView)await render();else status();await writeMirror();return result;}catch(error){state=await repo.getState();status();throw error;}finally{committing=false;}}
function download(name,content,type='application/json'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
/* THE STARTER GROUPS REACH A LIBRARY THAT PREDATES THEM, ONCE. A new library gets Main
   Deck, Bench, To Trade and To Buy from Model.empty(), which already carries the flag --
   so this does nothing on a fresh open and costs no write. A library made before they
   existed has no flag, gets the ones it is missing, and is flagged, which is what lets
   deleting them stick: the seed asks the flag, not the group list. Committed through the
   repository rather than commit() so it is silent -- opening the app is not a change the
   reader made and does not deserve a receipt. */
async function seedStarterGroups(){
  if(state.preferences?.starterGroups)return;
  const missing=M.starterGroups().filter(g=>!state.groups.some(x=>x.id===g.id||x.name===g.name));
  try{
    const result=await repo.commit({id:uid(),type:'batch',summary:'Added the starter Collection groups',
      commands:[...missing.map(g=>({type:'createGroup',groupId:g.id,name:g.name})),
        {type:'preferences',values:{starterGroups:true}}]},state.revision);
    state=result.state;
  }catch{/* A library that will not take them still opens; it simply has no starter groups. */}
}

/* EVERY DECK HAS A COLLECTION GROUP, INCLUDING THE ONES MADE BEFORE THAT WAS TRUE. A deck
   saved from the Lab used to opt out of its group, so its cards had no home in the
   Collection and the group filter could not reach them. Repaired once, silently, the way
   the starter groups arrive: each unarchived deck without a group gets one named for it --
   or is attached to a group that already carries its name -- and the flag says it is done. */
async function ensureDeckGroups(){
  if(state.preferences?.deckGroups)return;
  const bare=state.decks.filter(d=>!d.archived&&!d.groupId).slice(0,45);
  const commands=bare.flatMap(d=>{const found=state.groups.find(g=>g.name===d.name&&!state.decks.some(x=>x.groupId===g.id));
    if(found)return [{type:'editDeck',deckId:d.id,groupId:found.id}];
    const gid='group:'+uid();return [{type:'createGroup',groupId:gid,name:d.name},{type:'editDeck',deckId:d.id,groupId:gid}];});
  try{
    const result=await repo.commit({id:uid(),type:'batch',summary:'Gave every deck a collection group',
      commands:[...commands,{type:'preferences',values:{deckGroups:true}}]},state.revision);
    state=result.state;
  }catch{/* A library that will not take the repair still opens; the deck page offers Attach a group. */}
}

async function backupData(){const data=await repo.exportData(),legacy=MtgUserState.snapshot(localStorage);if(legacy.keys.length)data.state.legacy={...data.state.legacy,latestSnapshot:legacy};return data;}
async function writeMirror(){if(!mirror)return;try{if(await mirror.queryPermission({mode:'readwrite'})!=='granted')return notice('Library saved locally; backup mirror needs permission again.',true);const data=await E.backup(await backupData()),w=await mirror.createWritable();await w.write(JSON.stringify(data));await w.close();}catch(e){notice('Library saved locally. Backup mirror failed: '+e.message,true);}}
function readableLocation(l){return l.location?.kind==='deck'?`Physically in ${M.deck(state,l.location.deckId).name} (${l.location.box||'deck box'})`:l.source==='owned'?`Bench${l.location?.box?' · '+l.location.box:''}`:M.PLANNED.includes(l.source)?'Not acquired':'Not received';}
function affected(l){return `${source(l.source)} · ${l.quantity} copies · ${readableLocation(l)}${l.allocation?' · Reserved to '+M.deck(state,l.allocation.deckId).name:''}${l.offer!=='none'?' · Sell / Trade: '+l.offer:''}${l.allocation&&M.deck(state,l.allocation.deckId).locked?' · Locked deck':''}`;}
/* A CONFIRMATION READ EVERY TIME IS A CONFIRMATION NOBODY READS. Archiving a deck and
   deleting an archived one are both reversible-ish and both asked every time; the reader
   who has archived ten decks is clicking through the tenth without looking, which is
   worse than not asking. So a step that carries `remember` offers to stop asking, records
   the choice in preferences, and says where to turn it back on -- never a trapdoor. */
const skipping=name=>Boolean((state.preferences.confirmSkips||{})[name]);
async function setSkip(name,on){await commit({type:'preferences',values:{confirmSkips:{...(state.preferences.confirmSkips||{}),[name]:!!on}}},{renderView:false});}
function skipBox(){return `<label class="cm-checkbox cm-full"><input type="checkbox" name="__skipConfirm">Don’t show this message again</label>`;}
/* TWO LENSES ON ONE LEDGER, AND EACH SAYS WHICH IT IS. There is one set of records; these
   figures are the same records counted over different scopes. The library line used to be
   the only one and it carried no label, so confirming a change to a hundred-card deck read
   "Owned 101 → 101" directly under a deck that says 100, and the two looked like a
   contradiction rather than two answers to two questions. A command that names a deck now
   shows that deck's line first -- what the reader is actually looking at -- and the library
   total after it, named. */
function deckLine(deckId,next){
  if(!deckId||!state.decks.some(d=>d.id===deckId)||!next.decks.some(d=>d.id===deckId))return '';
  const d=M.deck(state,deckId),a=M.readiness(state,d),b=M.readiness(next,M.deck(next,deckId));
  const move=(x,y)=>x===y?String(x):`${x} → ${y}`;
  return `<p>In ${esc(d.name)}: <strong>${move(a.target,b.target)}</strong> planned · <strong>${move(a.owned,b.owned)}</strong> owned &amp; reserved · <strong>${move(a.placed,b.placed)}</strong> in deck box · <strong>${move(a.toBuy,b.toBuy)}</strong> to buy</p>`;
}
function review(title,body,command,options={}){const planned={id:uid(),confirmed:true,...command};const preview=M.apply(state,planned);const before=M.counters(state),after=M.counters(preview.state);return form(title,`<div class="cm-full">${body}${note(preview.summary)}${effectsHTML(preview.event.effects,preview.state)}${deckLine(command.deckId,preview.state)}<p class="cm-muted">Across your whole library: owned ${before.owned} → ${after.owned} · ordered ${before.ordered} → ${after.ordered} · to buy ${before.toBuy} → ${after.toBuy}</p>${options.remember?skipBox():''}</div>`,async v=>{if(options.remember&&v&&v.__skipConfirm)await setSkip(options.remember,true);await commit(planned);},'Confirm change');}
/* Every confirmation the reader has switched off, so it can be switched back on. */
actions['confirm-skips']=()=>{const skips=state.preferences.confirmSkips||{},names={archive:'Archiving a deck',deleteDeck:'Deleting an archived deck permanently'};const on=Object.keys(names).filter(k=>skips[k]);modal('Confirmations',`<p>${on.length?'These steps no longer ask before they act:':'Every step still asks before it acts.'}</p>${on.map(k=>`<p>${esc(names[k])} ${button('Ask me again','confirm-restore',{name:k})}</p>`).join('')}${note('A confirmation you turned off is turned off on this device only, with the rest of your view preferences.')}`);};
actions['confirm-restore']=async el=>{await setSkip(el.dataset.name,false);notice('That step will ask again before it acts.');actions['confirm-skips']();};
function effectsHTML(effects,after){if(!effects?.length)return '';const label=l=>l?`${l.quantity} ${source(l.source)} · ${l.allocation?(after.decks.find(d=>d.id===l.allocation.deckId)?.name||'Deck'):'Unassigned'} · ${l.location?.kind==='deck'?'physically in '+(after.decks.find(d=>d.id===l.location.deckId)?.name||'deck box'):l.source==='owned'?'Bench':'not received'}`:'No record';return `<details class="cm-details"><summary>${effects.length} copy / allocation changes</summary><ul>${effects.slice(0,100).map(change=>`<li><strong>${esc(after.cards[(change.after||change.before).cardId]?.name||'Card')}</strong>: ${esc(label(change.before))} → ${esc(label(change.after))}</li>`).join('')}</ul>${effects.length>100?'<p>First 100 shown. Export a full backup or enriched workbook for every audit detail.</p>':''}</details>`;}
/* A TCGplayer page for a card. The graph rows carry a real product link; anything else
   gets the site's own search, which is a worse link than a product page and a much better
   one than none. */
function buyLink(c){return c&&c.buy?c.buy:'https://www.tcgplayer.com/search/magic/product?productLineName=magic&q='+encodeURIComponent(c&&c.name||'');}
/* Card Kingdom has no product ids here, so it gets its own search by name, which lands on
   the card. Two vendors rather than one because a card that is out of stock at one is not
   an unbuyable card. */
function kingdomLink(c){return 'https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D='+encodeURIComponent(c&&c.name||'');}
/* Under the picture, where a reader looking at a card asks what it costs and where to get
   it -- not beside a second row of mana pips repeating the cost already printed above. */
function priceBlock(c){
  const when=c.priceSource==='Scryfall cheapest paper printing'
    ? 'lowest-cost paper printing'+(c.cheapestSet?' · '+c.cheapestSet:'')+(c.printings?' · of '+c.printings:'')+(c.priceUpdated?' · '+c.priceUpdated:'')
    : (c.priceUpdated||'Snapshot date not supplied');
  return `<div class="cm-inspector-buy"><p class="cm-inspector-price"><strong>${money(c.price)}</strong> <small>${esc(when)}</small></p>
    <a class="cm-text-button" href="${esc(buyLink(c))}" target="_blank" rel="noopener">Buy on TCGplayer ↗</a>
    <a class="cm-text-button" href="${esc(kingdomLink(c))}" target="_blank" rel="noopener">Buy on Card Kingdom ↗</a></div>`;
}
/* Two cards, side by side, each with its price and where to buy it. A swap decided from
   two names in a sentence is a swap decided blind. */
function compareCards(out,into,{outLabel='Replacing',intoLabel='With'}={}){
  const side=(c,label)=>`<figure class="cm-swap-card"><figcaption>${esc(label)}</figcaption>${c.image?`<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy">`:'<div class="cm-note">No image cached</div>'}<strong>${esc(c.name)}</strong><span class="cm-muted">${esc(c.typeLine||'')}</span><span>${money(c.price)}${c.priceSource==='Scryfall cheapest paper printing'&&c.cheapestSet?` <small class="cm-muted">${esc(c.cheapestSet)}</small>`:''}</span><a class="v-button" href="${esc(buyLink(c))}" target="_blank" rel="noopener">Open on TCGplayer ↗</a></figure>`;
  const a=Number(out.price),b=Number(into.price);
  const diff=a>0&&b>0?`<p class="cm-muted">${b>a?'Costs '+money(b-a)+' more':b<a?'Saves '+money(a-b):'The same price'} than the card it replaces.</p>`:'<p class="cm-muted">One of these has no recorded price, so the cost of the swap is unknown.</p>';
  return `<div class="cm-swap-compare">${side(out,outLabel)}<div class="cm-swap-arrow" aria-hidden="true">→</div>${side(into,intoLabel)}</div>${diff}`;
}
/* `colors` arrives renamed: the option names the deck's colour identity and the module
   already has a colors() that draws mana pips, and shadowing it emptied the picker. */
async function cardPicker(title,onPick,{commander=false,like=null,colors:identity=null}={}){const d=modal(title,`<label>Card name or a Scryfall link<input id="cm-card-query" autocomplete="off" placeholder="The name on the card, or the one the rules use"></label><div class="cm-commander-results" id="cm-card-results"></div><div class="cm-actions">${button('Search exact name / link','picker-resolve')}${button('Record an unlisted card','picker-manual')}</div><p class="cm-muted">Suggestions never change ownership. The name printed on a Secret Lair or a Universes Beyond card works too. If the exact name cannot be found, provide the card’s Scryfall link.</p><p class="cm-error" hidden></p>`);const input=$('#cm-card-query',d),results=$('#cm-card-results',d);const choose=async c=>{if(commander&&!c.commander)throw Error('That card is not a verified commander.');await onPick(c);};/* With a card to match, the list is ranked by likeness to it and each row says why it is
     there. Without one it is the old name search. */
  function show(){
    const rows=like?catalog.similar(like,{colors:identity,query:input.value,limit:30})
      :catalog.search(input.value,{commander,limit:30}).map(c=>({card:c,why:''}));
    /* WHY THIS ROW. Typing the name printed on a Secret Lair returns a card with a
       different name on it, and a row that only says "Jodah, the Unifier" looks like the
       search ignored what was typed. Name the printed name that matched. */
    const q=CrankCatalog.folded(input.value);
    const printedAs=c=>q&&(c.flavorNames||[]).find(f=>CrankCatalog.folded(f).includes(q))||'';
    results.innerHTML=rows.map(({card:c,why})=>`<button type="button" class="cm-commander-result" data-pick-card="${esc(c.id)}"><strong>${esc(c.name)}</strong>${colors(c.colorIdentity)}<span>${printedAs(c)?`printed as ${esc(printedAs(c))}`:esc(why||(c.mechanics[0]||c.keywords[0]||c.typeLine.split('—')[0]).slice(0,28))}</span>${like?`<span class="cm-swap-price">${money(c.price)}</span>`:''}</button>`).join('')
      ||'<p class="cm-muted">Nothing in the catalog matches. Try a name, or use Search exact name / link.</p>';
  }input.addEventListener('input',show);results.addEventListener('click',e=>{const b=e.target.closest('[data-pick-card]');if(b)choose(catalog.get(b.dataset.pickCard)).catch(error=>{const el=$('.cm-error',d);el.hidden=false;el.textContent=error.message;});});actions['picker-resolve']=async()=>{const c=await catalog.resolve(input.value);if(!c)throw Error('No exact match. Check the name or provide its Scryfall card link.');if(!state.cards[c.id])await commit({type:'cards',cards:[c]},{renderView:false});await choose(c);};actions['picker-manual']=()=>manualCard(input.value,choose);show();input.focus();}
function manualCard(query,onPick){const url=/^https:\/\//i.test(query)?query:'';return form('Record an unlisted card',`<div class="cm-full">${note('Use the printed card or a reliable source. This identity is labeled user-entered and stays out of automatic deck construction until exact catalog verification succeeds.',true)}</div>${field('Card name','name',url?'':query,'required maxlength="250"')}${field('Source link','url',url,'type="url" required')}${field('Card type / subtype','typeLine','','required maxlength="500"')}${field('Mana cost (symbols, e.g. {2}{U})','manaCost','','maxlength="80"')}${field('Mana value','manaValue','','type="number" min="0" max="1000"')}${field('Power / toughness (optional)','stats','','placeholder="4/4" maxlength="25"')}<label class="cm-full">Rules text<textarea name="oracleText" required maxlength="20000"></textarea></label><div class="cm-full cm-actions">${['W','U','B','R','G'].map(color=>`<label class="cm-checkbox"><input type="checkbox" name="color${color}">${color}</label>`).join('')}</div><label class="cm-checkbox cm-full"><input name="commander" type="checkbox">Appears eligible as a commander (unverified)</label>`,async v=>{const sourceURL=CrankCatalog.safeURL(v.url);if(!sourceURL)throw Error('Use an HTTPS source link.');const existing=catalog.exact(v.name);if(existing)throw Error('That card already exists. Select its exact catalog record.');const [power,toughness]=v.stats.split('/');const c=catalog.add({name:v.name,typeLine:v.typeLine,manaCost:v.manaCost,manaValue:v.manaValue===''?null:Number(v.manaValue),power:power||null,toughness:toughness||null,oracleText:v.oracleText,colorIdentity:['W','U','B','R','G'].filter(x=>v['color'+x]),commander:!!v.commander,verified:false,legalities:{commander:'unverified'},source:'User-entered · '+sourceURL,url:sourceURL,updatedAt:new Date().toISOString(),price:null});await commit({type:'cards',cards:[c]},{renderView:false});await onPick(c);},'Save supplemental identity');}
/* What a commander is FOR, in a few lines a reader can act on: the play styles its text
   earns in the shared vocabulary, what it triggers on and causes, and its own trigger
   lines. Nothing here is a claim about strength; it is the card, sorted. */
function playsAs(c){const out=[];const styles=CrankCatalog.playStyles(c);if(styles.length)out.push('Core mechanics: '+esc(styles.slice(0,6).join(' · ')));const tr=(c.triggers||[]).map(t=>t.replace(/-/g,' '));if(tr.length)out.push('Triggers on: '+esc(tr.join(', ')));const ca=(c.causes||[]).map(t=>t.replace(/-/g,' '));if(ca.length)out.push('Sets up: '+esc(ca.join(', ')));const mu=(c.multiplies||[]).map(t=>t.replace(/-/g,' '));if(mu.length)out.push('Multiplies: '+esc(mu.join(', ')));const gr=(c.grants||[]);if(gr.length)out.push((c.extends||[]).length?'Grants and spreads: '+esc(gr.join(', ')):'Grants: '+esc(gr.join(', ')));const roles=(c.roles||[]).filter(r=>!['creatures','lands','artifacts','enchantments','instants','sorceries','planeswalkers'].includes(r));if(roles.length)out.push('Roles: '+esc(roles.join(', ')));for(const line of String(c.oracleText||'').split('\n').filter(l=>/^(When|Whenever|At the beginning)|:/.test(l)).slice(0,3))out.push(glossary.html(line));return out;}
/* THE CARD'S STANDING IN YOUR LIBRARY, IN TWO LINES. Status is where its copies sit on the
   ladder -- how many Owned, Ordered, Incoming, Wanted, Watching -- plus what finalized decks
   still want (To buy). Assignment is where those copies are: in a deck box, reserved to a
   deck, on the bench, or unassigned, with a draft deck's plans and a group's planned cards
   alongside because those are the rows the Collection would show. The per-record lines
   underneath name the deck and the box. */
function standing(id){
  const rows=M.projection(state).filter(r=>r.cardId===id);
  const by=pred=>rows.filter(pred).reduce((n,r)=>n+r.quantity,0);
  const draft=[],planned=[];
  for(const d of state.decks.filter(d=>!d.archived&&d.status==='draft')){
    const filed=d.groupId?state.lots.filter(l=>l.cardId===id&&!l.allocation&&l.groupIds.includes(d.groupId)).reduce((n,l)=>n+l.quantity,0):0;let left=filed;
    for(const r of d.slots.filter(r=>r.cardId===id&&r.committed)){const use=Math.min(left,r.quantity);left-=use;if(r.quantity-use>0)draft.push({deck:d,quantity:r.quantity-use});}
  }
  for(const g of state.groups)for(const r of g.entries.filter(r=>r.cardId===id))planned.push({group:g,quantity:r.quantity});
  const status=[['Owned','owned'],['Ordered','ordered'],['Incoming trade','incoming'],['Wanted','wanted'],['Watching','watching']].map(([l,k])=>[l,by(r=>r.kind==='lot'&&r.source===k)]).concat([['To buy',by(r=>r.kind==='need')]]);
  const assignment=[['In deck box',by(r=>r.kind==='lot'&&r.placement==='In deck box')],['Reserved',by(r=>r.kind==='lot'&&r.placement==='Reserved')],['Bench',by(r=>r.kind==='lot'&&r.placement==='Bench')],['Unassigned',by(r=>r.kind==='lot'&&r.placement==='Unassigned')],['Draft list',draft.reduce((n,x)=>n+x.quantity,0)],['Planned',planned.reduce((n,x)=>n+x.quantity,0)]];
  /* Each chip opens the Collection filtered to the card, so a count is also a way in. */
  const chips=list=>list.filter(([,n])=>n>0).map(([l,n])=>`<button type="button" class="cm-pill ${esc(pillKind(l))}" data-action="library-card" data-card="${esc(id)}" title="Open the Collection filtered to this card">${esc(l)} <strong>${n}</strong></button>`).join('')||'<span class="cm-muted">none</span>';
  const line=parts=>parts.filter((p,i)=>p&&p!==parts[i-1]).map(esc).join(' · ');
  const lines=[...rows.map(r=>`<p>${line([source(r.source),String(r.quantity),r.placement,r.deckId?M.deck(state,r.deckId).name:'',r.kind==='lot'?readableLocation(r):''])}</p>`),...draft.map(x=>`<p>Draft list · ${x.quantity} · ${esc(x.deck.name)}</p>`),...planned.map(x=>`<p>Planned · ${x.quantity} · ${esc(x.group.name)}</p>`)];
  return `<div class="cm-standing"><p><span class="cm-standing-label">Status</span>${chips(status)}</p><p><span class="cm-standing-label">Assignment</span>${chips(assignment)}</p></div>${lines.join('')||'<p>No library copies or commitments.</p>'}`;
}
async function inspector(id){let c=state.cards[id]||catalog.get(id);if(!c)throw Error('Card not found.');c=await catalog.details(c);modal(c.name,`<div class="cm-inspector"><div class="cm-inspector-art">${c.image?`<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy">`:'<div class="cm-note">Card image unavailable offline</div>'}${priceBlock(c)}</div><div><p>${mana(c.manaCost)} ${c.power!==null?esc(c.power+'/'+c.toughness):''}</p><p>${glossary.html(c.typeLine)}</p><div class="cm-oracle">${glossary.html(c.oracleText||'Full rules text has not been cached for this card.')}</div>${c.commander?`<div class="cm-plays-as"><h3>Plays as</h3><ul>${playsAs(c).map(x=>`<li>${x}</li>`).join('')||'<li>Rules text is needed to say; fetch it with Verify or open the card link.</li>'}</ul></div>`:''}<p class="cm-muted">${esc(c.source)} · ${c.verified?'Verified catalog identity':'Unverified identity'}</p></div></div><h3>Your copies and commitments</h3><div>${standing(id)}</div><div class="cm-actions">${button('Add copies','add-card',{card:id},true)}${button('View library records','library-card',{card:id})}${button('Explore connections','discover-card',{card:id})}${state.cards[id]&&!state.cards[id].verified?button('Verify supplemental identity','verify-identity',{card:id}):''}</div>`);}
const C={M,E,$,esc,uid,money,source,colors,mana,button,caret,pill,pillKind,readinessBar,readinessLegend,options,field,select,note,head,notice,modal,form,go,route,render,refresh,commit,download,review,skipping,setSkip,cardPicker,compareCards,buyLink,kingdomLink,priceBlock,feedbackLink,manualCard,inspector,affected,readableLocation,actions,views,main,get state(){return state;},get repo(){return repo;},get catalog(){return catalog;},get glossary(){return glossary;},setState(value){state=value;}};
actions['verify-identity']=el=>{const old=state.cards[el.dataset.card];cardPicker('Choose the verified identity for '+old.name,async chosen=>{const verified=await catalog.details(chosen);if(!verified.verified)throw Error('This identity still needs an authoritative catalog match. Use its exact Scryfall link.');review('Verify supplemental card identity',note(`${old.name} → ${verified.name}. All current copies, groups and deck slots will use the verified identity. Ownership, exact printings and physical locations stay the same. Earlier report fingerprints remain historical.`,true),{type:'verifyIdentity',cardId:old.id,card:verified});});};
actions.close=()=>dialog.close();actions.home=()=>go('decks');actions.card=el=>inspector(el.dataset.card);actions['library-card']=el=>{dialog.close();go('collection',{card:el.dataset.card});};actions['discover-card']=el=>{dialog.close();go('discover',{card:el.dataset.card});};actions['reset-picks']=()=>commit({type:'preferences',values:{comparisonPicks:[]}});
actions.backup=async()=>{download('CrankMagic-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(await E.backup(await backupData()),null,2));notice('Full backup exported. Keep it outside browser storage.');};
/* E-MAIL THE EXPORT. The use case is a phone at a convention: cards marked owned as they
   are bought, then the library sent home. No browser can attach a file to a mailto: draft,
   so on a phone this opens the share sheet with the export attached -- Mail, Messages,
   Drive, AirDrop -- which is the honest version of "e-mail it". Where the share sheet
   cannot take files, the export is downloaded and a pre-addressed draft opens telling the
   reader to attach it. The file is prepared when the menu opens so the share call still
   sits inside the tap that asked for it, which Safari requires. */
let shareFile=null;
async function exportFile(){const data=await E.backup(await backupData());return new File([JSON.stringify(data,null,2)],'CrankMagic-export-'+new Date().toISOString().slice(0,10)+'.json',{type:'application/json'});}
/* SEND FEEDBACK. A mailto, opened the same way the export's e-mail is: no form to fill in
   here, no message stored anywhere, and it works from a phone and a desktop alike because
   the mail client is the one the reader already uses. */
function feedbackLink(){
  const where=location.hash?location.hash.replace('#',''):'decks';
  const body=`\n\n---\nWhere I was: ${where}\nScreen: ${innerWidth}x${innerHeight}\n`;
  return 'mailto:minor.rob@gmail.com?subject='+encodeURIComponent('CrankMagic Feedback')+'&body='+encodeURIComponent(body);
}
/* A clicked anchor rather than location.href: iOS Safari refuses some scripted navigations
   to a mailto and does nothing at all, which reads as a dead button. */
actions['send-feedback']=()=>{const a=document.createElement('a');a.href=feedbackLink();a.rel='noopener';document.body.appendChild(a);a.click();a.remove();};
actions['share-export']=async()=>{const file=shareFile||await exportFile();shareFile=null;const when=new Date().toISOString().slice(0,10);const body=`CrankMagic library export ${when}. On your computer, open CrankMagic → User Functions → Restore from a backup file and choose ${file.name}.`;
if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'CrankMagic export '+when,text:body});notice('Export handed to your share sheet.');return;}catch(err){if(err.name==='AbortError')return;}}
download(file.name,await file.text());location.href='mailto:?subject='+encodeURIComponent('CrankMagic export '+when)+'&body='+encodeURIComponent('The export file '+file.name+' was just downloaded. Attach it to this e-mail. '+body);notice('This browser cannot attach a file to an e-mail by itself: the export was downloaded and an e-mail draft opened — attach the file to it.',true);};
actions.mirror=async()=>{if(!window.showSaveFilePicker){notice('This browser cannot keep a file up to date automatically. Use Save a backup file instead.');return;}mirror=await showSaveFilePicker({suggestedName:'CrankMagic-mirror.json',types:[{description:'CrankMagic backup',accept:{'application/json':['.json']}}]});await repo.writeMeta('mirror',mirror);await writeMirror();notice('Backup mirror connected for this session. Every successful change will update it.');};
actions.undo=async()=>{state=await repo.undo(state.revision);await render();await writeMirror();notice('Last change undone.');};
actions.history=async()=>{const rows=await repo.history();modal('History & undo',`${note('History records completed transactions. Undo reverses the last compound change when no later change has intervened.')}${button('Undo last change','undo')}<label style="margin-top:16px">Filter history<input id="cm-history-filter" placeholder="Card, deck or operation"></label><div id="cm-history-rows"></div>`);const draw=()=>{$('#cm-history-rows').innerHTML=rows.filter(r=>(r.summary+' '+r.type).toLowerCase().includes($('#cm-history-filter').value.toLowerCase())).slice(0,200).map(r=>`<article><h3>${esc(r.summary)}</h3><p class="cm-muted">${esc(r.at)} · revision ${r.revision} · ${esc(r.type)}</p>${effectsHTML(r.effects,state)}</article>`).join('')||'<p>No matching history.</p>';};$('#cm-history-filter').addEventListener('input',draw);draw();};
actions.clear=()=>form('Clear all CrankMagic data',`<div class="cm-full">${note('This permanently removes the library, decks, history, undo data and cached public card data from this browser. Export a backup first. It does not delete files you exported.',true)}${button('Export backup first','backup')}</div>${field('Type CLEAR to confirm','confirm','','required autocomplete="off"')}<label class="cm-checkbox"><input type="checkbox" name="legacy">Also remove this app’s legacy storage keys</label>`,async data=>{if(data.confirm!=='CLEAR')throw Error('Type CLEAR exactly.');state=await repo.clear(state.revision);if(data.legacy)for(const key of MtgUserState.keys())localStorage.removeItem(key);mirror=null;catalog=await CrankCatalog.create({repository:repo,client:CrankCardClient.create(),link:MtgCardLink,urls:CrankAssets,savedCards:{}});await render();notice('Local library and history cleared. Exported files remain under your control.');},'Clear local data');
document.addEventListener('error',e=>{const img=e.target;if(img.matches?.('.cm-commander>img,.cm-inspector>img,.cm-graph-art')){const p=document.createElement('p');p.className='cm-image-fallback';p.textContent='Card image unavailable. Rules and saved card records remain available.';img.replaceWith(p);}},true);
document.addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el||el.disabled)return;const fn=actions[el.dataset.action];if(!fn)return;e.preventDefault();try{await fn(el,e);}catch(error){if(error.name!=='AbortError')notice(error.message,true);}});
$('#cm-user-menu').addEventListener('beforetoggle',e=>{if(e.newState==='open'){describeData();const r=$('#cm-user-functions').getBoundingClientRect(),m=$('#cm-user-menu');m.style.right='16px';m.style.left='auto';m.style.top=(r.bottom+8)+'px';if(repo)exportFile().then(f=>{shareFile=f;}).catch(()=>{shareFile=null;});}});$('#cm-user-menu').addEventListener('click',e=>{if(e.target.closest('[data-action]'))$('#cm-user-menu').hidePopover();});
/* A NEW VIEW STARTS AT THE TOP. The hash changed and render() replaced the page, but the
   scroll offset stayed where the last page left it -- open a deck from the bottom of the
   Collection and you landed halfway down its page. A change of view resets; a change of
   parameters inside the same view (a filter, a card) keeps the reader's place. */
let lastView=route().view;
window.addEventListener('hashchange',()=>{const view=route().view;if(view!==lastView)scrollTo(0,0);lastView=view;render();main.focus({preventScroll:true});});window.addEventListener('online',status);window.addEventListener('offline',status);
/* A DEEP LINK TO A DECK shows a hero-shaped skeleton while the library opens, not "Deck not
   found": the deck cannot be found before there is a library to find it in. */
if(/^#decks\?.*deck=/.test(location.hash))main.innerHTML='<section class="cm-deck-hero cm-skeleton" aria-busy="true"><div class="cm-deck-hero-copy"><div class="v-eyebrow cm-eyebrow-warm">My Decks / Deck overview</div><h1>Opening your library…</h1><p class="cm-muted">The deck page follows once the local records are read.</p></div></section>';
try{repo=await CrankRepository.open();state=await repo.getState();await seedStarterGroups();await ensureDeckGroups();catalog=await CrankCatalog.create({repository:repo,client:CrankCardClient.create(),link:MtgCardLink,urls:CrankAssets,savedCards:state.cards});let terms=[];try{terms=(await catalog.load(CrankAssets.glossary)).entries;}catch(e){notice(e.message,true);}glossary=CrankGlossary.create(terms);for(const module of globalThis.CrankFeatures||[])module(C);repo.subscribe(async info=>{if(info.closed)return notice('Local database was upgraded in another tab. Reload before editing.',true);if(!committing&&info.revision!==state.revision){await refresh();notice('Library refreshed after a change in another tab. Review any open form before saving.');}});await render();if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});if('serviceWorker' in navigator)navigator.serviceWorker.register('crankmagic-sw.js?v=106',{scope:'./'}).catch(error=>notice('Offline app caching is unavailable: '+error.message,true));}
catch(error){main.innerHTML=head('Local library needs attention','Your data has not been changed',error.message)+note('CrankMagic requires HTTPS or localhost and browser storage. If a saved record is damaged, download its original contents and restore a verified backup.',true);if(repo){const raw=await repo.exportData();main.innerHTML+='<div class="cm-actions">'+button('Download original recovery record','recovery-export')+button('Restore a verified backup','recovery-restore')+'</div>';$('#cm-user-menu').innerHTML=button('Download original recovery record','recovery-export')+button('Restore a verified backup','recovery-restore');actions['recovery-export']=()=>download('CrankMagic-recovery-original.json',JSON.stringify({format:'crankmagic-recovery-record',capturedAt:new Date().toISOString(),...raw},null,2));actions['recovery-restore']=()=>form('Recover from a verified backup','<label class="cm-full">CrankMagic JSON backup<input name="file" type="file" accept=".json" required></label>'+field('Type RECOVER to confirm replacement','confirm','','required')+note('The damaged original record is retained in the restored library’s legacy archive. No quantities are inferred from it.'),async(v,f)=>{if(v.confirm!=='RECOVER')throw Error('Type RECOVER exactly.');const file=f.elements.file.files[0];if(file.size>100000000)throw Error('Backup exceeds 100 MB.');const payload=await E.readBackup(await file.text());await repo.recover(payload,raw.state);location.reload();},'Recover library');}}

})();
