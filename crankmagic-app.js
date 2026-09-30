/* Shared production shell. All visible mutations follow a committed transaction;
 * browser navigation never creates holdings and static reference data stays opt-in.
 * Feature modules receive this context rather than keeping a second state store. */
(async function(){'use strict';
const M=CrankCollection,E=CrankExchange,$=(s,r=document)=>r.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const main=$('#cm-main'),dialog=$('#cm-dialog'),actions={},views={};let state=M.empty(),repo,catalog,glossary,disposeView=null,renderSeq=0,noticeTimer,committing=false;
/* THE SITTING LIVES ON THE SHELL, NOT IN A VIEW (Rob, 14 September; plan §2.6). One sandbox
   beside the state and the catalog, so List, Sheet and Table read one pending truth and
   cannot be "independently manipulated out of sync with one another". */
const sandbox=globalThis.CrankSandbox?globalThis.CrankSandbox.create({model:M}):null;
const uid=()=>crypto.randomUUID(),money=n=>n===null||n===undefined?'Unknown':'$'+Number(n).toFixed(2),source=s=>({owned:'Owned',ordered:'Ordered',watching:'Watched',trade:'Ordered · trade',"to-buy":'To buy',draft:'Draft list'}[s]||s);
/* Color identity as the game draws it -- the mana symbols -- rather than five colored
   dots. A colourless identity keeps a single gray pip so the cell is never empty. */
function colors(ci){const list=ci||[];return `<span class="cm-colors" aria-label="${esc(list.join(', ')||'Colorless')}">${list.map(x=>/^[WUBRG]$/.test(x)?`<img class="cm-pip" src="assets/mana/${x}.svg?v=1" alt="" title="${esc({W:'White',U:'Blue',B:'Black',R:'Red',G:'Green'}[x])}">`:`<i class="cm-color ${esc(x)}" title="${esc(x)}"></i>`).join('')||'<i class="cm-color C" title="Colorless"></i>'}</span>`;}
/* The printed cost only: a card with a second face shows the cost in its top-right corner, not
   the adventure's or the back's too (CrankCatalog.frontCost). Pass the type line so a split card
   or a Room keeps both of its halves. */
function mana(raw,typeLine=''){const cost=globalThis.CrankCatalog&&CrankCatalog.frontCost?CrankCatalog.frontCost(raw,typeLine):raw;return `<span class="cm-mana" aria-label="Mana cost ${esc(cost||'unknown')}">${(String(cost||'').match(/\{[^}]+\}/g)||[]).map(x=>/^[WUBRG23]$/.test(x.slice(1,-1))?`<img src="assets/mana/${x.slice(1,-1)}.svg?v=1" alt="${esc(x)}" width="19" height="19">`:`<span class="cm-mana-symbol" title="${esc(x)}">${esc(x.slice(1,-1))}</span>`).join('')}</span>`;}
/* THE CARET IS DRAWN, NOT TYPED. A ▾ from one font and a ⌄ from another sat at different
   baselines and decided the height of the button carrying them; the SVG is 10px whatever the
   label's font does, and aria-hidden so the accessible name stays the words alone. `left`
   is the fly-out's, pointing at where the submenu opens. */
function caret(dir='down'){return `<svg class="cm-caret${dir==='left'?' cm-caret-left':''}" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2 3.5 5 6.5 8 3.5"/></svg>`;}
function button(label,action,data={},primary=false,{caret:dir='',cls=''}={}){return `<button type="button" class="v-button${primary?' primary':''}${cls?' '+cls:''}" data-action="${esc(action)}" ${Object.entries(data).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${esc(label)}${dir?caret(dir):''}</button>`;}
/* ONE PILL PER RUNG. Every place that names a status -- the roster's Source and Allocation
   cells, the card pop-up, the deck page, the Ready to add list -- draws it through here, so the
   color for "in the box" is the same color everywhere. `pillKind` is the mapping from the
   model's words to the seven tokens; a word it does not know wears the draft gray. */
const PILL_KIND={...Object.fromEntries(M.STATUS.map(s=>[s.label,s.tone])),...Object.fromEntries(M.STATE_LABELS.map(l=>[l,M.stateTone(l)])),Owned:'pull',owned:'pull',ordered:'ordered','to-buy':'buy',watching:'watch',draft:'draft',remove:'remove'};
function pillKind(key,placement){if((key==='owned'||key==='Owned')&&placement==='Physical deck')return 'inbox';return PILL_KIND[key]||'draft';}
function pill(text,kind,attrs=''){return `<span class="cm-pill ${esc(kind)}" ${attrs}>${text}</span>`;}
/* THE READINESS BAR: a deck's target as one line, cut into what is in the box, what you own
   but are ready to add, what is on its way, and what still has to be bought. */
/* Stand-ins are drawn hatched OVER the seats they fill -- from the end of the in-box segment,
   as wide as the seats they cover -- because they are not progress toward the list, only a
   playable box in the meantime. */
function readinessBar(r){const inBox=r.inBox??r.placed??0,pull=(r.pullFromBench||0)+(r.pullFromOtherBox||0),way=r.ordered||0,seg=[['inbox',inBox,'in box'],['pull',pull,'ready to add'],['ordered',way,'on the way'],['buy',r.toBuy||0,'to buy']];
  const whole=seg.reduce((n,[,k])=>n+k,0)||r.target||1,standIn=Math.min(r.standIns||0,Math.max(0,whole-inBox));
  const say=esc(seg.map(([,n,l])=>`${n} ${l}`).join(', ')+(standIn?`, ${standIn} substitute${standIn===1?'':'s'} filling seats`:'')+` of ${r.target}`);
  return `<div class="cm-readiness" role="img" aria-label="${say}" title="${say}">${seg.map(([k,n])=>n>0?`<i class="${k}" style="flex:${n} 1 0"></i>`:'').join('')}${standIn?`<b class="standin" style="left:${inBox/whole*100}%;width:${standIn/whole*100}%"></b>`:''}</div>`;}
/* A MENU FOLLOWS ITS BUTTON. Popovers sit in the top layer at fixed coordinates, so a page that
   scrolled under an open menu left the menu floating where the button used to be. It is placed
   again on every scroll and resize while open, and closes when its button leaves the viewport
   or the document. */
function followAnchor(menu,place){const on=()=>place();addEventListener('scroll',on,{capture:true,passive:true});addEventListener('resize',on);menu.addEventListener('toggle',ev=>{if(ev.newState==='closed'){removeEventListener('scroll',on,{capture:true});removeEventListener('resize',on);}});}
function options(items,value){return items.map(x=>{const [v,l]=Array.isArray(x)?x:[x,x];return `<option value="${esc(v)}"${String(v)===String(value)?' selected':''}>${esc(l)}</option>`;}).join('');}
/* A REQUIRED FIELD WEARS A MOUNTAIN. The red asterisk of every form on the web, except it
   is the red asterisk every form on the web uses, because that is the one mark a reader
   already knows without being taught it. It briefly wore the Mountain pip instead -- red is
   the game's own color for "not optional" -- but a symbol a reader has to decode is a worse
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
const labeled=(label,attrs)=>requires(attrs)?`<span class="cm-req-label">${esc(label)}${REQUIRED_PIP}</span>`:esc(label);
function field(label,name,value='',attrs=''){return `<label>${labeled(label,attrs)}<input name="${esc(name)}" value="${esc(value)}" ${requires(attrs)?'aria-required="true"':''} ${attrs}></label>`;}
function select(label,name,items,value,attrs=''){return `<label>${labeled(label,attrs)}<select name="${esc(name)}" aria-label="${esc(label)}" ${requires(attrs)?'aria-required="true"':''} ${attrs}>${options(items,value)}</select></label>`;}
/* This app's public address: the directory of the page's canonical link. tools/release-pages.mjs
   rewrites that link to wherever a release is published; a page without one falls back to the
   address the app was first published at. */
function canonicalBase(){try{return new URL('./',document.querySelector('link[rel="canonical"]').href).href;}catch{return 'https://crankmagic.com/';}}
function note(text,warn=false){return `<div class="cm-note${warn?' cm-warning':''}">${esc(text)}</div>`;}
function head(kicker,title,description,controls=''){return `<header class="cm-page-head"><div><div class="v-eyebrow cm-eyebrow-warm">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="cm-actions">${controls}</div></header>`;}
/* THE PAGE NAME IS THE HEADING. Every page used to open on three lines -- an eyebrow, a
   tagline and a subline -- before its own name appeared anywhere ("What you have. What you
   need." is a slogan, not a heading). The name is the h1 now, the actions sit beside it, and
   what the subline used to say waits behind one "?" per page, in HELP, for the reader who
   wants it. head() above survives only for the recovery screen, where its three lines are
   all information. */
const HELP={};
/* THE NAV OPENS THE PAGE YOU ARE ON. Each top-level entry can name its sub-pages -- Library
   its tabs, Decks its decks -- through SUBNAV, a function per view returning
   [{label, hash, count?, current}]. render() draws them under the entry whose group the
   current view belongs to; a deck's Ready to add list and the How page belong to Decks, and
   the two redirect routes to Library. On a phone the nav is a row, and the page's own tabs do
   this job, so the list is hidden there by the stylesheet. */
const SUBNAV={},NAV_GROUP={how:'decks',pull:'decks',change:'decks',collection:'cards',shop:'cards'};
function subnav(group){document.querySelectorAll('.cm-subnav').forEach(el=>el.remove());const items=SUBNAV[group]?.()||[],host=document.querySelector(`[data-nav="${group}"]`);if(!items.length||!host)return;
  const list=document.createElement('ul');list.className='cm-subnav';list.setAttribute('aria-label',`${host.textContent.trim()} pages`);
  /* A sub-nav row may name a tint -- a deck row carries its commander's first color, as an
     8px dot (Track V.3, the guide's step 2). It is a --mana-* token name, never a literal, so
     the dot follows the theme with everything else; a row without one draws no dot. */
  /* A row may be an action instead of a page (Library › Upload cards): it keeps the row's look, and the click
     handler runs the action instead of following the link. */
  list.innerHTML=items.map(it=>`<li><a href="${esc(it.hash)}" title="${esc(it.label)}"${it.action?` data-action="${esc(it.action)}" role="button"`:''}${it.current?' class="is-current" aria-current="location"':''}${it.tint?` style="--dot:var(--mana-${esc(it.tint)})"`:''}><span>${esc(it.label)}</span>${it.count!==undefined?`<small>${esc(String(it.count))}</small>`:''}</a></li>`).join('');
  host.insertAdjacentElement('afterend',list);}
function helpButton(key){return `<button type="button" class="v-button cm-help-btn" data-action="page-help" data-help="${esc(key)}" aria-label="About this page" title="About this page">?</button>`;}
/* A page head is the name, one muted summary sentence with the two or three figures that
   matter, and at most three controls (the guide's "One head, one primary"). The summary is
   already-escaped HTML because it carries its own <b> around those figures; every caller builds
   it from the model rather than from a string a reader can reach. */
/* An EMPTY name asks for the brand instead of a title: the slot is filled after render by moving
   the live brand block out of the shell, so the logo, the wordmark and its mist arrive together
   and the canvas keeps animating. Only the local copy uses it (Rob, 2026-09-24). */
function pageHead(name,controls='',help='',summary=''){const title=name?`<h1>${esc(name)}</h1>`:`<div class="cm-page-brand" id="cm-brand-slot"></div><span class="cm-page-online">Online</span>`;return `<header class="cm-page-head"><div class="cm-page-title"><div class="cm-page-name">${title}${help?helpButton(help):''}</div>${summary}</div>${controls?`<div class="cm-actions">${controls}</div>`:''}</header>`;}
/* A NOTICE CAN CARRY ONE ACTION (r3, 72-toast-error): a save offers Undo, a failure that may pass
   offers Retry. The message is set as text and the button is built, so nothing in either is read as
   markup. A save's own notice offers Undo, and so does any notice its flow raises straight after it,
   while that save is still the last change: the undo it offers is the one History would give. */
let undoRevision=null,undoAt=0;
const UNDO={label:'Undo',run:()=>actions.undo()};
function notice(message,error=false,{action=null,stay=false,undo=true}={}){const el=$('#cm-notice');if(!action&&!error&&undo&&undoRevision===state.revision&&Date.now()-undoAt<3000)action=UNDO;
  const text=document.createElement('span');text.className='cm-toast-text';text.textContent=message;el.replaceChildren(text);
  if(action){const b=document.createElement('button');b.type='button';b.className='cm-toast-action';b.textContent=action.label;b.addEventListener('click',async()=>{el.hidden=true;clearTimeout(noticeTimer);try{await action.run();}catch(error){if(error.name!=='AbortError')notice(error.message,true);}});el.append(b);}
  el.classList.toggle('error',error);el.hidden=false;clearTimeout(noticeTimer);if(!stay)noticeTimer=setTimeout(()=>el.hidden=true,error?18000:7000);}
/* A NEW VERSION, OFFERED (M-18): the service worker installs a new version and waits; this says so, and stays until
   answered. Reload asks the waiting worker to take over, and the page reloads once it has -- never before the click. */
function offerUpdate(reg){if(!reg)return;/* a browser that answers the registration with nothing (service workers blocked) has no update to offer, and is told nothing */let asked=false;const offer=()=>{if(!reg.waiting||!navigator.serviceWorker.controller)return;notice('A new version of CrankMagic is ready.',false,{stay:true,action:{label:'Reload',run:()=>{asked=true;reg.waiting?.postMessage({type:'skip-waiting'});}}});};
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(asked)location.reload();});
  offer();reg.addEventListener('updatefound',()=>{const w=reg.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed')offer();});});}
/* CLOSING A SUB-DIALOG GOES BACK, IT DOES NOT THROW THE WHOLE THING AWAY.
 *
 * Rob, 2026-09-24: "in any of the menu screens in any of the create, load, import, etc. when a
 * pop-up is up clicking outside of it or pressing the close button returns to the prior pop-up,
 * not closing the entire thing and starting over."
 *
 * A caller that opens a dialog FROM another one passes how to get back. Closing then calls that
 * instead of closing, and because the parent sets its own `back` when it reopens, this handles any
 * depth without a stack to keep in step. No `back` means the dialog is the top of its journey and
 * × closes, as it always did.
 *
 * The content is rebuilt by re-running the opener rather than by stashing innerHTML: these dialogs
 * bind listeners imperatively -- the card picker's input, the Load pane's hover preview -- and
 * restoring markup would bring back a dead copy of them. */
let modalBack=null;
/* A DIALOG HOLDING WORK THAT CLOSING WOULD LOSE (Rob, 2026-09-28: the import's review, after minutes of resolving,
   closed on a stray click and took everything with it). guardModal() sets the question the close control, the
   backdrop and Escape ask first; the next modal() clears it. onLeave runs when the person does leave. */
let modalGuard=null;
function guardModal(message,onLeave=null){modalGuard={message,onLeave};}
/* NEW GROUP NAME ONLY FOR A NEW GROUP (Rob, 2026-09-28): an existing group already has its name, so the field shows
   only while the Collection group choice is "Create a new group". For any form with both. */
/* A GROUP SAYS WHAT IT IS (docs/plan-groups.md, G3). Beside its name, a group that is a place
   -- the Bench, a deck's box, the To sell / trade pile -- names its template, so a list of groups
   reads as places and lists at a glance. A General group is just its name. */
function groupLabel(g){const t=g&&g.template&&g.template!=='general'?M.TEMPLATE_LABELS[g.template]:'';return !t||t.toLowerCase()===String(g.name).trim().toLowerCase()?g.name:`${g.name} · ${t}`;}
function newGroupName(root){const sel=root&&root.querySelector('[name=group]'),label=root&&root.querySelector('[name=name]')?.closest('label');if(!sel||!label)return root;const sync=()=>{label.hidden=sel.value!=='';};sel.addEventListener('change',sync);sync();return root;}
function modal(title,body,back=null){if(dialog.open)dialog.close();modalGuard=null;modalBack=typeof back==='function'?back:null;dialog.className='';dialog.innerHTML=`<div class="cm-dialog-head"><h2 id="cm-dialog-title">${esc(title)}</h2><button type="button" class="cm-dialog-close" data-action="close" aria-label="${back?'Back':'Close dialog'}">${back?'‹':'×'}</button></div>${body}`;dialog.setAttribute('aria-labelledby','cm-dialog-title');dialog.showModal();
  /* showModal() focuses the first focusable thing in the body and scrolls it into view, which put
     a card's art under the sticky title (UAT M-14). Focus the close button without scrolling, and
     open at the top. */
  const closeBtn=dialog.querySelector('.cm-dialog-close');if(closeBtn)closeBtn.focus({preventScroll:true});dialog.scrollTop=0;return dialog;}
function form(title,body,submit,label='Save changes',back=null){const d=modal(title,`<form class="cm-form"><div class="cm-form-grid">${body}</div><p class="cm-error" hidden role="alert"></p><div class="cm-form-footer">${button('Cancel','close')}<button class="v-button primary" type="submit">${esc(label)}</button></div></form>`,back);const baseRevision=state.revision,f=$('form',d);f.addEventListener('submit',async e=>{e.preventDefault();if(!f.reportValidity())return;const b=$('[type=submit]',f),error=$('.cm-error',f);b.disabled=true;error.hidden=true;try{if(baseRevision!==state.revision)throw Error('The library changed while this form was open. Close it and review the current records before retrying.');await submit(Object.fromEntries(new FormData(f)),f);if(dialog.contains(f)&&dialog.open)dialog.close();}catch(err){error.textContent=err.message;error.hidden=false;}finally{b.disabled=false;}});return f;}
/* #new IS AN HREF IN THE DECKS VIEW, so it has to be a real address. It was not: route() falls
   back to 'decks' for any unknown view, so a bookmark, a shared link, a middle-click or an
   open-in-new-tab landed on Decks with no wizard and no message, while a plain click worked
   because a handler intercepted it. Found by a UAT on 2026-09-22. The view is still Decks; the
   wizard opens over it once the page has drawn. */
/* THE BARE ADDRESS (R3.8; Rob, M1·3). `/` with no route is the landing page for a visitor with nothing in this browser, and
   Decks for everyone else; the account module sends a signed-in person on to Decks as soon as it knows. Any #route is
   the app, always, so a link into it never meets the landing page. */
/* THE FRONT DOOR (Rob, 2026-09-29: "when I go to crankmagic.com that should go to the landing page"): an address with
   no route opens the landing page, whatever the library holds and whoever is signed in. It was a first visit's only. */
/* A table's invitation link, #table/<id>/<code> (M5): the table view, with the id and the code as its params. */
function route(){const raw=location.hash.slice(1)||({'graph.html':'discover'}[location.pathname.split('/').pop()]||(views.welcome?'welcome':'decks'));const link=/^table\/([a-z0-9]{8,40})\/([A-Za-z0-9_-]{20,100})$/.exec(raw);if(link&&views.table)return {view:'table',params:new URLSearchParams({id:link[1],code:link[2]})};const [view,q='']=raw.split('?');return {view:views[view]?view:'decks',params:new URLSearchParams(q)};}
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
  /* A release says which commit it is (tools/release-pages.mjs writes the meta); main does not. */
  const version=document.querySelector('meta[name="crankmagic-version"]')?.content||'';
  if(menu)menu.innerHTML='<p>Card data</p>'+rows.map(([label,n])=>`<p class="cm-data-row${n!==null&&n>=STALE_DAYS?' cm-data-stale':''}"><span>${esc(label)}</span><span>${esc(ageWord(n))}</span></p>`).join('')
    +(version?`<p class="cm-data-row cm-version"><span>Version</span><span>${esc(version)}</span></p>`:'');
  const note=$('#cm-data-age');
  if(!note)return;
  note.hidden=worst===null;
  note.className='cm-data-age'+(worst!==null&&worst>=STALE_DAYS?' cm-data-stale':'');
  note.textContent=worst===null?'':worst>=STALE_DAYS
    ?`Card data ${ageWord(worst)} — prices and legality may have moved.`
    :`Card data ${ageWord(worst)}.`;
}
/* THE LOCAL COPY IS A GAME HOST, NOT THE WORKSHOP. Rob, 2026-09-24: "don't show any of the left
   side bar. It is completely not required in the local version for the user to see and try to use
   in the localhost." Decks, Library and Explore are the cloud app's job; this copy runs tables. */
const isLocal=()=>location.hostname==='127.0.0.1'||location.hostname==='localhost';
/* The brand block is MOVED into the Play header rather than copied. crankmagic-brand.js holds the
   live canvas and drives it on a rAF, so the element that animates is the one in the shell -- a
   clone would be a still frame. Moving keeps it alive; what kills it is main.innerHTML, so it is
   put back in the sidebar before every render and re-taken afterwards by whoever wants it. */
function rescueBrand(){
  const block=document.querySelector('.v-brand-block'),home=document.querySelector('.cm-sidebar');
  if(block&&home&&block.parentElement!==home)home.prepend(block);
}
/* THE THEME IS ONE OF FOUR (Rob, 2026-09-28; docs/plan-appearance.md A1). No modes and no Match system: Moss & Iron,
   Brass & Slate, Felt & Cream or Steel & Cobalt, saved with the library's preferences so it follows the account. Each is
   a palette and a face on the tokens (crankmagic-design.css): Felt & Cream is Brass & Slate's light face. The values saved
   before A1 are read, never rewritten: dark was Brass & Slate, light Felt & Cream, and Match system or nothing at all is
   the new default, Moss & Iron (decision A1). */
const THEMES=[['moss-iron','Moss & Iron','The armory · default'],['brass-slate','Brass & Slate','Warm graphite, a brass accent'],['felt-cream','Felt & Cream','Card-table felt and cream'],['steel-cobalt','Steel & Cobalt','The forge: cobalt and cyan']];
const THEME_FACE={'moss-iron':['moss-iron','dark'],'brass-slate':['brass-slate','dark'],'felt-cream':['brass-slate','light'],'steel-cobalt':['steel-cobalt','dark']};
function themeChoice(){const t=state.preferences&&state.preferences.theme;return THEME_FACE[t]?t:t==='dark'?'brass-slate':t==='light'?'felt-cream':'moss-iron';}
function applyTheme(){const choice=themeChoice(),[palette,face]=THEME_FACE[choice],root=document.documentElement,app=document.getElementById('matrix-v2');
  for(const el of [root,app]){if(el.dataset.palette!==palette)el.dataset.palette=palette;if(el.dataset.theme!==face)el.dataset.theme=face;}
  root.style.colorScheme=face;
  /* The browser's own chrome takes the theme's ground. */
  const meta=document.querySelector('meta[name="theme-color"]'),bg=getComputedStyle(app).getPropertyValue('--color-bg').trim();if(meta&&bg&&meta.content!==bg)meta.content=bg;
  document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===choice)));}
/* REDUCE MOTION IS A SAVED PREFERENCE TOO (r3, 70-settings), on top of the device's own setting, never
   instead of it: either one stills the page. It is written on <html> so the stylesheet can stop every
   transition and animation at once, and CrankMotion answers the pieces that animate from script (the
   rail's aether, the sea field, the Explore trace, the table's recombine), which ask it each time they
   would move and hear a crankmotion event when it changes. */
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
globalThis.CrankMotion={reduced:()=>document.documentElement.dataset.motion==='reduce'||motionQuery.matches,
  onChange(fn){motionQuery.addEventListener('change',fn);addEventListener('crankmotion',fn);return ()=>{motionQuery.removeEventListener('change',fn);removeEventListener('crankmotion',fn);};}};
/* CARD SIZE (R3.9b; AGENTS.md, "Sizes are sliders, never steps"). One continuous scale, a percent of each card
   surface's own base size, remembered per device because it is a fact about the screen. A phone's range stops lower
   than a desktop's so the largest card still fits it; the smallest keeps every caption at 10px or more. The value is
   clamped to the range of the screen it is read on. `--card-scale` carries it to the CSS. */
const CARD_SCALE={key:'cm-card-scale',def:100,min:60,max:160,phoneMax:130};
const cardScaleRange=()=>[CARD_SCALE.min,matchMedia('(max-width:760px)').matches?CARD_SCALE.phoneMax:CARD_SCALE.max];
const clampScale=v=>{const [lo,hi]=cardScaleRange(),n=Math.round(Number(v));return Number.isFinite(n)&&n>0?Math.min(hi,Math.max(lo,n)):CARD_SCALE.def;};
/* THE DEFAULT AND EACH VIEW'S OWN (Rob, 2026-09-28; docs/plan-groups.md G8). The card size set in Settings is the
   default everywhere; a view's own slider sets that view's size, which supersedes the default there and nowhere else,
   until Use default lets it go. Both are remembered per device. The view is the place cards are drawn at a size: the
   Table and the Play board today, and any view that draws a slider with scope 'view'. */
const scaleView=()=>{const r=route();return r.view==='cards'&&r.params.get('view')==='tabletop'?'table':r.view==='table'||r.view==='game'?'board':r.view;};
const viewKey=(v=scaleView())=>CARD_SCALE.key+':'+v;
const readScale=k=>{try{return localStorage.getItem(k);}catch(err){return null;}};
/* The Table view's old S, M and L carry over once, to the nearest point on the scale. */
function defaultScale(){let v=readScale(CARD_SCALE.key);if(v===null){const old=readScale('cm-tabletop-size');if(old)v={S:66,M:100,L:146}[old]??null;}return clampScale(v??CARD_SCALE.def);}
const viewScale=(v=scaleView())=>{const x=readScale(viewKey(v));return x===null?null:clampScale(x);};
/* The size cards are drawn at here: this view's own, or the default. */
function cardScale(){return viewScale()??defaultScale();}
function applyCardScale(v=cardScale()){document.documentElement.style.setProperty('--card-scale',String(clampScale(v)/100));}
function setCardScale(v,{save=true,scope='view'}={}){const n=clampScale(v);
  if(scope==='default'){if(viewScale()===null)applyCardScale(n);if(save)try{localStorage.setItem(CARD_SCALE.key,String(n));localStorage.removeItem('cm-tabletop-size');}catch(err){/* applied, not remembered */}return n;}
  applyCardScale(n);if(save)try{localStorage.setItem(viewKey(),String(n));}catch(err){/* applied, not remembered */}return n;}
/* Use default: the view lets its own size go and draws at the default again. */
function clearViewScale(){try{localStorage.removeItem(viewKey());}catch(err){/* nothing to forget */}const n=defaultScale();applyCardScale(n);return n;}
/* The slider every card-size control draws: the scale's two ends named, the value beside it. `data-card-scale`
   is the one hook: dragging previews on every page at once, letting go remembers it. */
function cardScaleSlider({label=true,scope='view'}={}){const [lo,hi]=cardScaleRange(),mine=scope==='view'?viewScale():null,v=scope==='default'?defaultScale():cardScale(),name=scope==='default'?'Default card size':'Card size';
  /* A view's slider says whether it is using the default or its own size, and offers the way back. */
  const own=scope==='view'?(mine===null?'<small class="cm-size-note">default</small>':`<button type="button" class="cm-size-reset" data-card-scale-reset title="Go back to the default size from Settings">Use default</button>`):'';
  return `<label class="cm-size-slider">${label?`<span class="cm-size-label">${name}</span>`:''}<span class="cm-size-end" aria-hidden="true">${lo}%</span><input type="range" min="${lo}" max="${hi}" step="1" value="${v}" data-card-scale="${scope}" aria-label="${name}" aria-valuetext="${v}%"><span class="cm-size-end" aria-hidden="true">${hi}%</span><output>${v}%</output>${own}</label>`;}
document.addEventListener('click',e=>{const el=e.target.closest?.('[data-card-scale-reset]');if(!el)return;e.preventDefault();const n=clearViewScale();document.dispatchEvent(new CustomEvent('cm-card-scale',{detail:{scale:n,live:false}}));render();});
document.addEventListener('input',e=>{const el=e.target.closest?.('[data-card-scale]');if(!el)return;const n=setCardScale(el.value,{save:false,scope:el.dataset.cardScale==='default'?'default':'view'});el.setAttribute('aria-valuetext',n+'%');const out=el.parentElement.querySelector('output');if(out)out.textContent=n+'%';document.dispatchEvent(new CustomEvent('cm-card-scale',{detail:{scale:n,live:true}}));});
document.addEventListener('change',e=>{const el=e.target.closest?.('[data-card-scale]');if(!el)return;const n=setCardScale(el.value,{scope:el.dataset.cardScale==='default'?'default':'view'});document.dispatchEvent(new CustomEvent('cm-card-scale',{detail:{scale:n,live:false}}));});
matchMedia('(max-width:760px)').addEventListener?.('change',()=>applyCardScale());
function applyMotion(){const on=Boolean(state.preferences&&state.preferences.reduceMotion),was=document.documentElement.dataset.motion==='reduce';
  if(on)document.documentElement.dataset.motion='reduce';else delete document.documentElement.dataset.motion;
  document.querySelectorAll('[data-action="set-motion"]').forEach(b=>b.setAttribute('aria-pressed',String(on)));
  if(on!==was)dispatchEvent(new Event('crankmotion'));}
/* A DATE A READER SEES IS WRITTEN THE US WAY (AGENTS.md, "The United States, always"): "Sep 25, 2026",
   whatever the browser's own locale, never a bare ISO 2026-09-25. ISO stays for keys and files. */
const usDate=v=>{const t=M.localDate(v);return t?t.toLocaleDateString('en-US',{dateStyle:'medium'}):'';};
const usDateTime=v=>{const t=M.localDate(v);return t?t.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}):'';};
/* A deck with no cap of its own is held to this one: the reader's default when Settings has one, the
   pod's rule ($225) otherwise. */
const deckCap=()=>{const v=Number(state.preferences&&state.preferences.defaultBudgetCap);return Number.isFinite(v)&&v>0?v:(globalThis.CrankRules?globalThis.CrankRules.RULES.deckCap:null);};
async function render(){if(!catalog)return;rescueBrand();document.getElementById('matrix-v2').classList.toggle('cm-local',isLocal());describeData();applyTheme();applyMotion();applyCardScale();disposeView?.();disposeView=null;glossary?.hide();const seq=++renderSeq,r=route();/* The landing page stands alone: no rail, its own header (crankmagic-landing.js). */document.getElementById('matrix-v2').classList.toggle('cm-landing-on',r.view==='welcome');const group=NAV_GROUP[r.view]||r.view;document.querySelectorAll('[data-nav]').forEach(el=>el.setAttribute('aria-current',el.dataset.nav===group?'page':'false'));try{subnav(group);}catch(e){console.error(e);}try{const cleanup=await views[r.view](r.params);if(seq===renderSeq)disposeView=cleanup||null;else cleanup?.();}catch(err){if(seq===renderSeq)main.innerHTML=head('Unable to open this view','Your saved library is intact',err.message,button('Decks','home'));}status();openNewDeckIfAsked();}
function status(){const line=$('#cm-save-status');if(repo&&line)line.textContent=`Library revision ${state.revision}${navigator.onLine?'':' · offline'}`;}
/* A SITTING IS RE-VALIDATED WHENEVER THE LIBRARY MOVES (plan §2.7). Another tab confirming,
   a restored backup, or this tab's own save can leave a staged move with nothing to act on;
   the fold names those and drops them rather than letting them fail at Confirm. */
function restage(){if(!sandbox||!sandbox.open)return sandbox&&sandbox.revalidate(state);const {dropped}=sandbox.revalidate(state);if(dropped.length)notice(`${dropped.length} staged move${dropped.length===1?'':'s'} no longer appl${dropped.length===1?'ies':'y'} and ${dropped.length===1?'was':'were'} dropped: ${dropped.map(d=>d.cardName).join(', ')}.`,true);return {dropped};}
async function refresh(){state=await repo.getState();for(const c of Object.values(state.cards))catalog?.overlay(c);restage();await render();}
async function commit(command,{renderView=true}={}){if(committing)throw Object.assign(Error('A save is already in progress. Please wait for its receipt.'),{retryable:true});committing=true;{const line=$('#cm-save-status');if(line)line.textContent='Saving…';}try{const result=await repo.commit({id:uid(),...command},state.revision);state=result.state;for(const c of Object.values(state.cards))catalog.overlay(c);restage();undoRevision=state.revision;undoAt=Date.now();notice(result.summary);if(renderView)await render();else status();return result;}catch(error){state=await repo.getState();status();throw error;}finally{committing=false;}}
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
      commands:[...missing.filter(g=>g.template!=='bench'||!state.groups.some(x=>x.template==='bench')).map(g=>({type:'createGroup',groupId:g.id,name:g.name,template:g.template})),
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
function readableLocation(l){return l.location?.kind==='deck'?`Physically in ${M.deck(state,l.location.deckId).name} (${l.location.box||'physical deck'})`:l.source==='owned'?`Bench${l.location?.box?' · '+l.location.box:''}`:M.PLANNED.includes(l.source)?'Not acquired':'Not received';}
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
  return `<p>In ${esc(d.name)}: <strong>${move(a.target,b.target)}</strong> planned · <strong>${move(a.owned,b.owned)}</strong> owned &amp; reserved · <strong>${move(a.placed,b.placed)}</strong> in the physical deck · <strong>${move(a.toBuy,b.toBuy)}</strong> to buy</p>`;
}
function review(title,body,command,options={}){const planned={id:uid(),confirmed:true,...command};const preview=M.apply(state,planned);const before=M.counters(state),after=M.counters(preview.state);return form(title,`<div class="cm-full">${body}${note(preview.summary)}${effectsHTML(preview.event.effects,preview.state)}${deckLine(command.deckId,preview.state)}<p class="cm-muted">Across your whole library: owned ${before.owned} → ${after.owned} · ordered ${before.ordered} → ${after.ordered} · to buy ${before.toBuy} → ${after.toBuy}</p>${options.remember?skipBox():''}</div>`,async v=>{if(options.remember&&v&&v.__skipConfirm)await setSkip(options.remember,true);await commit(planned);if(options.after)await options.after();},'Confirm change');}
/* Every confirmation the reader has switched off, so it can be switched back on. */
actions['confirm-skips']=()=>{const skips=state.preferences.confirmSkips||{},names={archive:'Archiving a deck',deleteDeck:'Deleting an archived deck permanently'};const on=Object.keys(names).filter(k=>skips[k]);modal('Confirmations',`<p>${on.length?'These steps no longer ask before they act:':'Every step still asks before it acts.'}</p>${on.map(k=>`<p>${esc(names[k])} ${button('Ask me again','confirm-restore',{name:k})}</p>`).join('')}${note('A confirmation you turned off is turned off on this device only, with the rest of your view preferences.')}`);};
actions['confirm-restore']=async el=>{await setSkip(el.dataset.name,false);notice('That step will ask again before it acts.');actions['confirm-skips']();};
function effectsHTML(effects,after){if(!effects?.length)return '';const label=l=>l?`${l.quantity} ${source(l.source)} · ${l.allocation?(after.decks.find(d=>d.id===l.allocation.deckId)?.name||'Deck'):'Unassigned'} · ${l.location?.kind==='deck'?'physically in '+(after.decks.find(d=>d.id===l.location.deckId)?.name||'physical deck'):l.source==='owned'?'Bench':'not received'}`:'No record';return `<details class="cm-details"><summary>${effects.length} copy / allocation changes</summary><ul>${effects.slice(0,100).map(change=>`<li><strong>${esc(after.cards[(change.after||change.before).cardId]?.name||'Card')}</strong>: ${esc(label(change.before))} → ${esc(label(change.after))}</li>`).join('')}</ul>${effects.length>100?'<p>First 100 shown. Export a full backup or enriched workbook for every audit detail.</p>':''}</details>`;}
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
/* `colors` arrives renamed: the option names the deck's color identity and the module
   already has a colors() that draws mana pips, and shadowing it emptied the picker. */
async function cardPicker(title,onPick,{commander=false,like=null,colors:identity=null,back=null,label='Card name or a Scryfall link',paste=null,query=''}={}){const d=modal(title,`<label>${esc(label)}<input id="cm-card-query" autocomplete="off" placeholder="The name on the card, or the one the rules use"></label><div class="cm-commander-results" id="cm-card-results"></div><div class="cm-actions">${button('Search exact name / link','picker-resolve')}${button('Record an unlisted card','picker-manual')}</div><p class="cm-muted">Suggestions never change ownership. The name printed on a Secret Lair or a Universes Beyond card works too. If the exact name cannot be found, provide the card’s Scryfall link.</p><p class="cm-error" hidden></p>`,back);d.classList.add('cm-picker-dialog');const input=$('#cm-card-query',d),results=$('#cm-card-results',d);const choose=async c=>{if(commander&&!c.commander)throw Error('That card is not a verified commander.');await onPick(c);};/* With a card to match, the list is ranked by likeness to it and each row says why it is
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
  }input.addEventListener('input',show);/* A name typed before the picker opened (the landing page's Step one) arrives searched. */if(query){input.value=query;show();}/* A LIST PASTED INTO THE SEARCH (Add cards, r3 wireframe 43): a single line is a name to search; more than one is a list, and goes where lists go. */if(paste)input.addEventListener('paste',e=>{const text=e.clipboardData?.getData('text')||'';if(text.trim().split(/\r?\n/).filter(l=>l.trim()).length<2)return;e.preventDefault();paste(text);});results.addEventListener('click',e=>{const b=e.target.closest('[data-pick-card]');if(b)choose(catalog.get(b.dataset.pickCard)).catch(error=>{const el=$('.cm-error',d);el.hidden=false;el.textContent=error.message;});});actions['picker-resolve']=async()=>{const c=await catalog.resolve(input.value);if(!c)throw Error('No exact match. Check the name or provide its Scryfall card link.');if(!state.cards[c.id])await commit({type:'cards',cards:[c]},{renderView:false});await choose(c);};actions['picker-manual']=()=>manualCard(input.value,choose);show();input.focus();}
function manualCard(query,onPick){const url=/^https:\/\//i.test(query)?query:'';return form('Record an unlisted card',`<div class="cm-full">${note('Use the printed card or a reliable source. This identity is labeled user-entered and stays out of automatic deck construction until exact catalog verification succeeds.',true)}</div>${field('Card name','name',url?'':query,'required maxlength="250"')}${field('Source link','url',url,'type="url" required')}${field('Card type / subtype','typeLine','','required maxlength="500"')}${field('Mana cost (symbols, e.g. {2}{U})','manaCost','','maxlength="80"')}${field('Mana value','manaValue','','type="number" min="0" max="1000"')}${field('Power / toughness (optional)','stats','','placeholder="4/4" maxlength="25"')}<label class="cm-full">Rules text<textarea name="oracleText" required maxlength="20000"></textarea></label><div class="cm-full cm-actions">${['W','U','B','R','G'].map(color=>`<label class="cm-checkbox"><input type="checkbox" name="color${color}">${color}</label>`).join('')}</div><label class="cm-checkbox cm-full"><input name="commander" type="checkbox">Appears eligible as a commander (unverified)</label>`,async v=>{const sourceURL=CrankCatalog.safeURL(v.url);if(!sourceURL)throw Error('Use an HTTPS source link.');const existing=catalog.exact(v.name);if(existing)throw Error('That card already exists. Select its exact catalog record.');const [power,toughness]=v.stats.split('/');const c=catalog.add({name:v.name,typeLine:v.typeLine,manaCost:v.manaCost,manaValue:v.manaValue===''?null:Number(v.manaValue),power:power||null,toughness:toughness||null,oracleText:v.oracleText,colorIdentity:['W','U','B','R','G'].filter(x=>v['color'+x]),commander:!!v.commander,verified:false,legalities:{commander:'unverified'},source:'User-entered · '+sourceURL,url:sourceURL,updatedAt:new Date().toISOString(),price:null});await commit({type:'cards',cards:[c]},{renderView:false});await onPick(c);},'Save supplemental identity');}
/* What a commander is FOR, in a few lines a reader can act on: the play styles its text
   earns in the shared vocabulary, what it triggers on and causes, and its own trigger
   lines. Nothing here is a claim about strength; it is the card, sorted. */
/* THE APP'S OWN VOCABULARY, beside the rules glossary rather than inside it (Rob, 14 September).
   data/commander-glossary.json is a glossary of Magic: every entry there carries a rules citation,
   and tools/check-glossary.mjs enforces it. "Reserved", "Substitute" and "Primary Purpose" are
   CrankMagic's words, not the game's, so they would have no citation to give. They join the
   glossary at the moment it is created instead, which gives them the same hover, the same
   keyboard behavior and the same "Show term definitions" switch, and leaves the rules file a
   rules file. Every definition is one sentence, in the app's own terms, saying what the word
   means HERE. */
const COLLECTION_TERMS=[
  ['physical-deck','Physical deck','A copy that is sleeved in that deck’s box right now. It is where a card is, not what a list asks for.',['In physical deck']],
  ['substitute','Substitute','A copy sitting in a deck’s box that the deck’s list does not call for. It fills a seat until the real card is bought or arrives.',['Substitutes','Stand-in']],
  ['reserved','Reserved','A copy earmarked for one deck’s list but not yet in its box. Reserved equals owned plus ordered plus to buy on every deck.',[]],
  ['bench','Bench','Cards you own that no deck has reserved and none is shortlisting. The spare pile everything else is drawn from.',[]],
  ['watched','Watched','A card you are considering for a deck: filed in that deck’s collection group, reserving nothing and moving nothing. You may own a copy or not.',['Watching']],
  ['to-buy','To buy','A seat in a finalized deck’s list that nothing you hold fills yet. It is what the deck asks you to buy.',[]],
  ['ordered','Ordered','A copy you have paid for that has not arrived. It counts toward a deck the way an owned copy does, and cannot be put in a box.',[]],
  ['draft-list','Draft list','A deck’s hundred before it is finalized. Since every deck reserves the copies you own as its cards go in, and lists the rest To buy, a draft’s cards read as Reserved or To buy; Finalize only marks the list settled.',[]],
  ['suggestion','Suggestion','A card linked to a deck as an option or an upgrade rather than as part of its hundred.',['Suggestions']],
  ['planned','Planned','A card written into a collection group as a line on a list. It is a plan, not a copy you hold.',[]],
  ['collection-group','Collection group','A named set of records. Every deck owns one, which is how a card is shortlisted for that deck without being reserved.',['Groups']],
  ['group-piles-by','Group piles by','Which reading of a card sorts the table’s source shelves — its type, its color, what it is for. It changes how the cards are arranged, never what they are.',[]],
  ['status-piles','Status piles','The destinations along the foot of the table: where a card ends up, as against the shelves, which are where it comes from.',[]],
  ['primary-purpose','Primary Purpose','The one job a card is in a deck for, decided by a fixed ladder — finisher, extra turn, board wipe, multiplier, and so on down to its body and its tribe.',['Purpose']],
  ['card-type','Card type','The card’s first type line word — Creature, Instant, Land — before any dash.',[]],
  ['price-band','Price band','Which money bracket a card’s recorded price falls in, so a hundred can be read by what it costs.',[]],
  ['role','Role','What a card does for a deck: removal, ramp, draw, a board wipe. A card can hold several.',['Roles']],
  ['mechanic','Mechanic','A named way a card works — sacrifice, tokens, untap, blink — read from its rules text rather than from its type.',['Mechanics']],
  ['sitting','Sitting','The moves you have staged on the table and not confirmed. Nothing in a sitting is written to the library, every lens shows it, and Confirm writes the whole of it as one change that one Undo takes back.',['Staged','Pending moves']],
].map(([id,term,definition,aliases])=>({id,term,category:'collection',definition,aliases,references:[]}));
/* TERMS ARE UNDERLINED ON REQUEST. The glossary dotted every rules line and typed 21 buttons
   into the deck page's prose. It is off unless preferences.terms says otherwise; the words are
   the same either way, only the underlines and their definitions come and go. */
const termsOn=()=>!!state?.preferences?.terms;
const glossaryView={html:text=>glossary&&termsOn()?glossary.html(text):esc(text),/* A CONTROL'S LABEL ALWAYS CARRIES ITS DEFINITION (Rob, 14 September). The switch above exists
   to stop the glossary dotting every line of rules text; one word a reader is choosing with —
   "Primary Purpose", "Status piles" — is not rules text, and asking them to find a preference
   before a label will explain itself is the wrong trade. */
label:text=>glossary?glossary.html(text):esc(text),hide(){glossary?.hide();},get entries(){return glossary?.entries||[];}};
function termsToggle(data={}){return button(termsOn()?'Hide term definitions':'Show term definitions','toggle-terms',data,false,{cls:'compact'});}
function playsAs(c){const out=[];const styles=CrankCatalog.playStyles(c);if(styles.length)out.push('Core mechanics: '+esc(styles.slice(0,6).join(' · ')));const tr=(c.triggers||[]).map(t=>t.replace(/-/g,' '));if(tr.length)out.push('Triggers on: '+esc(tr.join(', ')));const ca=(c.causes||[]).map(t=>t.replace(/-/g,' '));if(ca.length)out.push('Sets up: '+esc(ca.join(', ')));const mu=(c.multiplies||[]).map(t=>t.replace(/-/g,' '));if(mu.length)out.push('Multiplies: '+esc(mu.join(', ')));const gr=(c.grants||[]);if(gr.length)out.push((c.extends||[]).length?'Grants and spreads: '+esc(gr.join(', ')):'Grants: '+esc(gr.join(', ')));const roles=(c.roles||[]).filter(r=>!['creatures','lands','artifacts','enchantments','instants','sorceries','planeswalkers'].includes(r));if(roles.length)out.push('Roles: '+esc(roles.join(', ')));for(const line of String(c.oracleText||'').split('\n').filter(l=>/^(When|Whenever|At the beginning)|:/.test(l)).slice(0,3))out.push(glossaryView.html(line));return out;}
/* THE CARD'S STANDING IN YOUR LIBRARY, IN TWO ROWS. Status is the states its copies are in,
   each with its count: Owned, and of those how many are in a physical deck, standing in as a
   substitute, reserved and waiting, or on the Bench; then Ordered, Watched, what finalized
   decks still need to buy, and a draft deck's or a group's plans, because those are rows the
   Collection shows. Assignment is the decks: one chip per deck the card is reserved to,
   physically in, or wanted by, colored by that state on the same scale the counts row and
   the tables use, so a chip's color reads as its state wherever it appears. */
function standing(id){
  const rows=M.projection(state).filter(r=>r.cardId===id);
  const by=pred=>rows.filter(pred).reduce((n,r)=>n+r.quantity,0);
  const draft=[],planned=[];
  /* A draft's missing cards are To buy rows since G3d (D4: every deck reserves and has a buy list), so they are
     counted with the needs, not again here. */
  for(const g of state.groups)for(const r of g.entries.filter(r=>r.cardId===id))planned.push({group:g,quantity:r.quantity});
  const lot=pred=>by(r=>r.kind==='lot'&&pred(r));
  /* THE CARD'S STANDING IN CARD STATES (docs/card-states.md): every record of this card -- its copies, the decks'
     needs, draft lists, group entries -- asked the model's cardState, then counted by the state's word. Owned
     leads; then the roles a card for a deck has outside its box -- Upgrade, it replaces a card in the box; Reserved,
     it takes an empty seat -- and the two slot flags keep their chips. */
  const records=[...rows,...draft.map(x=>({kind:'draft',deckId:x.deck.id,purpose:'main',quantity:x.quantity})),...planned.map(x=>({kind:'entry',groupId:x.group.id,quantity:x.quantity}))].map(((read)=>r=>({r,st:read(r)}))(M.stateReader(state)));
  const count=f=>records.filter(({st})=>f(st)).reduce((n,{r})=>n+r.quantity,0);
  const status=[['Owned',count(st=>st.stage==='owned')],...M.STATE_LABELS.map(l=>[l,count(st=>M.stateLabel(st)===l)]),['Upgrade',count(st=>!!st.deckId&&!st.inBox&&st.role==='upgrade')],['Reserved',count(st=>!!st.deckId&&!st.inBox&&st.role==='reserved')],['Option',lot(r=>r.option)],['Pinned',lot(r=>r.pinned)]];
  /* One chip per deck and state: the deck the record is for, named with its state's word -- a stage while not
     owned, the role in the box once owned, To add while not -- and, outside the box, its role ("To buy · upgrade"). */
  const decks=new Map(),add=(deckId,label,kind,q)=>{const d=deckId&&state.decks.find(x=>x.id===deckId);if(!d||!q)return;const key=d.id+'|'+label,cur=decks.get(key)||{name:d.name,label,kind,quantity:0};cur.quantity+=q;decks.set(key,cur);};
  for(const {r,st} of records){if(!st.deckId)continue;const l=M.stateLabel(st);add(st.deckId,!st.inBox&&(st.role==='upgrade'||st.role==='reserved')?`${l} · ${M.roleLabel(st.role).toLowerCase()}`:l,M.stateTone(l),r.quantity);}
  const open=`data-action="library-card" data-card="${esc(id)}"`;
  const chips=list=>list.filter(([,n])=>n>0).map(([l,n])=>`<button type="button" class="cm-pill ${esc(pillKind(l))}" ${open} title="Open Library filtered to this card">${esc(l)} <strong>${n}</strong></button>`).join('')||'<span class="cm-muted">none</span>';
  const assignment=[...decks.values()].map(x=>`<button type="button" class="cm-pill ${esc(x.kind)}" ${open} title="${esc(x.label)} · ${x.quantity} — open Library filtered to this card">${esc(x.name)}${x.quantity>1?` <strong>${x.quantity}</strong>`:''}</button>`).concat(planned.map(x=>`<button type="button" class="cm-pill draft" ${open} title="Planned in the group ${esc(x.group.name)}">${esc(x.group.name)} · planned${x.quantity>1?` <strong>${x.quantity}</strong>`:''}</button>`)).join('');
  return `<div class="cm-standing"><p><span class="cm-standing-label">Status</span>${chips(status)}</p><p><span class="cm-standing-label">Assignment</span>${assignment||'<span class="cm-muted">no deck</span>'}</p></div>`;
}
/* THE TERMS THE GRAPH READS OFF THIS CARD, grouped as the Explore filters name them. They
   were the bulk of the graph's card pop-up; here they sit under the rules text they come
   from, and Explore connections opens the card on the graph where each one is a filter. */
const TERM_GROUPS=[['roles','Role'],['mechanics','Mechanic'],['tribes','Tribe'],['causes','Causes'],['triggers','Triggers on'],['produces','Produces'],['requires','Requires'],['multiplies','Multiplies'],['grants','Grants'],['extends','Extends'],['wants','Wants tribe'],['makes','Makes tribe'],['wantsStat','Wants stat'],['offersStat','Offers stat']];
function graphTerms(c){const G=globalThis.CrankGraph;if(!G||typeof G.termsOf!=='function')return '';const t=G.termsOf(c);if(!t)return '';const p=globalThis.MtgCardClassify&&MtgCardClassify.purposeOf?MtgCardClassify.purposeOf(c):null;
  const rows=TERM_GROUPS.filter(([k])=>(t[k]||[]).length).map(([k,label])=>`<div class="cm-inspector-terms-row"><span>${esc(label)}</span>${t[k].map(v=>`<span class="cm-chip${p&&p.key===k&&p.value===v?' cm-chip-primary':''}"${p&&p.key===k&&p.value===v?` title="Primary Purpose — ${esc(p.label)}: ${esc(p.why)}"`:''}>${esc(v)}</span>`).join('')}</div>`);
  return rows.length?`<div class="cm-inspector-terms"><h3>Terms the graph reads</h3>${rows.join('')}<p class="cm-muted">Each is a filter on Explore; Explore connections opens this card there.</p></div>`:'';}
async function inspector(id){let c=cardOf(id);if(!c)throw Error('Card not found.');c=await catalog.details(c);modal(c.name,`<div class="cm-inspector"><div class="cm-inspector-art">${c.image?`<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy">`:'<div class="cm-note">Card image unavailable offline</div>'}${priceBlock(c)}</div><div><p>${mana(c.manaCost,c.typeLine)} ${c.power!==null?esc(c.power+'/'+c.toughness):''}</p><p>${glossaryView.html(c.typeLine)}</p><div class="cm-oracle">${glossaryView.html(c.oracleText||'Full rules text has not been cached for this card.')}</div><p class="cm-terms-row">${termsToggle({card:id})}</p>${graphTerms(c)}${c.commander?`<div class="cm-plays-as"><h3>Plays as</h3><ul>${playsAs(c).map(x=>`<li>${x}</li>`).join('')||'<li>Rules text is needed to say; fetch it with Verify or open the card link.</li>'}</ul></div>`:''}<p class="cm-muted">${esc(c.source)} · ${c.verified?'Verified catalog identity':'Unverified identity'}</p></div></div><h3>Your copies and commitments</h3><div>${standing(id)}</div><div class="cm-actions">${button('Add copies','add-card',{card:id},true)}${button('View library records','library-card',{card:id})}${button('Explore connections','discover-card',{card:id})}${state.cards[id]&&!state.cards[id].verified?button('Verify supplemental identity','verify-identity',{card:id}):''}</div>`);}
/* THE JOIN. A library card is a reference (schema 3); its facts live on the Card record at the
   catalog. Read a card here and nowhere else: the record when the catalog has it, the library's
   own copy for a card the record set does not carry. */
const cardOf=id=>(catalog&&catalog.get(id))||state.cards[id]||null;
const cardsOf=()=>Object.keys(state.cards).map(cardOf).filter(Boolean);
const C={M,E,$,esc,uid,isLocal,money,cardScale,setCardScale,cardScaleRange,cardScaleSlider,card:cardOf,cards:cardsOf,source,colors,mana,button,caret,pill,pillKind,readinessBar,followAnchor,options,field,select,note,head,pageHead,helpButton,HELP,SUBNAV,termsOn,termsToggle,notice,modal,guardModal,newGroupName,groupLabel,form,go,route,render,refresh,commit,download,review,skipping,setSkip,cardPicker,compareCards,buyLink,kingdomLink,priceBlock,feedbackLink,manualCard,inspector,affected,readableLocation,actions,views,main,get state(){return state;},get repo(){return repo;},get catalog(){return catalog;},get glossary(){return glossaryView;},get sandbox(){return sandbox;},restage,setState(value){state=value;},describeData,themeChoice,THEMES,THEME_FACE,deckCap,applyMotion,status,usDate,usDateTime};
actions['verify-identity']=el=>{const old=cardOf(el.dataset.card);cardPicker('Choose the verified identity for '+old.name,async chosen=>{const verified=await catalog.details(chosen);if(!verified.verified)throw Error('This identity still needs an authoritative catalog match. Use its exact Scryfall link.');review('Verify supplemental card identity',note(`${old.name} → ${verified.name}. All current copies, groups and deck slots will use the verified identity. Ownership, exact printings and physical locations stay the same. Earlier report fingerprints remain historical.`,true),{type:'verifyIdentity',cardId:old.id,card:verified});});};
/* A HELP BODY MAY BE A FUNCTION. The Library help reads its definitions from the glossary as
   it opens, so the drawing, the hover and the help page always say the same sentence. */
/* HELP SLIDES IN FROM THE RIGHT (r3, 07-help-panel) and leaves the page visible beside it. The
   glossary is one step on, and closing it comes back here. */
actions['page-help']=el=>{const h=HELP[el.dataset.help];if(!h)return;const key=el.dataset.help;
  modal('Help — '+h.title,`<div class="cm-help-body">${typeof h.body==='function'?h.body():h.body}</div><div class="cm-help-foot"><button type="button" class="cm-link" data-action="open-glossary" data-help="${esc(key)}">Open the glossary →</button>${button('Got it','close',{},true)}</div>`);
  dialog.classList.add('cm-slideover');};
/* THE GLOSSARY (r3, 76-glossary): the app's own words, one sentence each, the statuses in the
   colors they wear everywhere else. Rules terms stay on their hover; this is the vocabulary a
   reader meets in CrankMagic and nowhere else. */
const TERM_TONE={'physical-deck':'--st-physical','substitute':'--st-standin','reserved':'--st-reserved','bench':'--st-pull','ordered':'--st-ordered','watched':'--st-watch','to-buy':'--st-buy','draft-list':'--st-draft'};
actions['open-glossary']=el=>{const key=el&&el.dataset.help,back=key&&HELP[key]?()=>actions['page-help'](el):null;
  const rows=COLLECTION_TERMS.map(t=>`<div class="cm-gloss-row"><span class="cm-gloss-term"${TERM_TONE[t.id]?` style="--tone:var(${TERM_TONE[t.id]})"`:''}>${esc(t.term)}</span><span>${esc(t.definition)}</span></div>`).join('');
  modal('Glossary',`<div class="cm-glossary">${rows}</div><div class="cm-form-footer">${button('Close','close')}</div>`,back);};
/* The Menu's Help opens the help of the page underneath, which is what "help" means from there;
   a page with no help opens the glossary. */
actions['menu-help']=()=>{const b=$('#cm-main [data-action="page-help"]');if(b&&HELP[b.dataset.help])actions['page-help'](b);else actions['open-glossary']();};
actions['toggle-terms']=async el=>{await commit({type:'preferences',values:{terms:!termsOn()}});syncTermsItem();if(el.dataset.card)await inspector(el.dataset.card);};
/* THE GLOSSARY SWITCH IN THE MENU'S HELP (Rob, 2026-09-29: "a toggle to turn on the glossary function ... hover over
   game terms to see what they mean in an info box that disappears after moving the cursor off it"). The same
   preference the deck page's switch sets; the menu item says whether it is on each time the menu opens. */
function syncTermsItem(){const item=$('#cm-menu-terms');if(!item)return;item.setAttribute('aria-pressed',String(termsOn()));const word=item.querySelector('.cm-menu-state');if(word)word.textContent=termsOn()?'On':'Off';}
$('#cm-user-menu')?.addEventListener('beforetoggle',syncTermsItem);
/* REFRESH (Rob, 2026-09-29: a hard refresh in the Menu, under Sync now). The app's files come back from the site,
   not this browser's copies: the service worker is asked to look for a new version, its caches of the app's files
   are emptied, a new version waiting is let in, and the page reloads. The library lives in IndexedDB and is not
   touched. */
actions['app-refresh']=async()=>{try{const regs=navigator.serviceWorker?await navigator.serviceWorker.getRegistrations():[];await Promise.all(regs.map(r=>r.update().catch(()=>{})));const keys=globalThis.caches?await caches.keys():[];await Promise.all(keys.filter(k=>k.startsWith('crankmagic-public:')).map(k=>caches.delete(k)));const reg=regs.find(r=>r.waiting);if(reg)await new Promise(done=>{navigator.serviceWorker.addEventListener('controllerchange',done,{once:true});reg.waiting.postMessage({type:'skip-waiting'});setTimeout(done,3000);});}catch{}location.reload();};
actions.close=()=>{if(modalGuard&&!confirm(modalGuard.message))return;const guard=modalGuard;modalGuard=null;guard?.onLeave?.();const back=modalBack;modalBack=null;if(back)back();else dialog.close();};
/* Clicking the backdrop is the same gesture as the corner control: it goes back if there is
   somewhere to go, and closes otherwise. A <dialog> reports a backdrop click as a click on the
   dialog itself, which is why the target test is the element and not a child. */
dialog.addEventListener('click',event=>{if(event.target===dialog)actions.close();});
/* Esc closes the dialog natively, which would skip the journey. Cancel it and go back instead. */
dialog.addEventListener('cancel',event=>{if(modalBack||modalGuard){event.preventDefault();actions.close();}});actions.home=()=>go('decks');actions.card=el=>inspector(el.dataset.card);actions['library-card']=el=>{dialog.close();go('cards',{card:el.dataset.card});};actions['discover-card']=el=>{dialog.close();go('discover',{card:el.dataset.card});};actions['reset-picks']=()=>commit({type:'preferences',values:{comparisonPicks:[]}});
/* Choosing a theme applies at once, before the save, so the page never waits on the library to recolor. */
actions['set-theme']=async el=>{const choice=el.dataset.themeChoice,t=THEMES.find(x=>x[0]===choice);if(!t||choice===themeChoice())return;
  document.getElementById('matrix-v2').animate?.([{opacity:.85},{opacity:1}],{duration:200});
  await commit({type:'preferences',values:{theme:choice}},{renderView:false});applyTheme();notice(`${t[1]} theme.`);render();};
actions.backup=async()=>{download('CrankMagic-backup-'+M.today()+'.json',JSON.stringify(await E.backup(await backupData()),null,2));notice('Full backup exported. Keep it outside browser storage.');};
/* EMAIL THE EXPORT. The use case is a phone at a convention: cards marked owned as they
   are bought, then the library sent home. No browser can attach a file to a mailto: draft,
   so on a phone this opens the share sheet with the export attached -- Mail, Messages,
   Drive, AirDrop -- which is the honest version of "email it". Where the share sheet
   cannot take files, the export is downloaded and a pre-addressed draft opens telling the
   reader to attach it. The file is prepared when the menu opens so the share call still
   sits inside the tap that asked for it, which Safari requires. */
let shareFile=null;
async function exportFile(){const data=await E.backup(await backupData());return new File([JSON.stringify(data,null,2)],'CrankMagic-export-'+M.today()+'.json',{type:'application/json'});}
/* THE ONE PUBLIC ADDRESS. Rob, 2026-09-24: "I don't want just anyone to see my personal email."
   admin@crankmagic.com forwards to him (Cloudflare Email Routing); nothing the app shows names any
   other address, and tools/release-pages.mjs refuses a release that does. */
const CONTACT='admin@crankmagic.com';
/* SEND FEEDBACK. A mailto, opened the same way the export's email is: no form to fill in
   here, no message stored anywhere, and it works from a phone and a desktop alike because
   the mail client is the one the reader already uses. */
function feedbackLink(){
  const where=location.hash?location.hash.replace('#',''):'decks';
  const body=`\n\n---\nWhere I was: ${where}\nScreen: ${innerWidth}x${innerHeight}\n`;
  return 'mailto:'+CONTACT+'?subject='+encodeURIComponent('CrankMagic Feedback')+'&body='+encodeURIComponent(body);
}
/* A clicked anchor rather than location.href: iOS Safari refuses some scripted navigations
   to a mailto and does nothing at all, which reads as a dead button. */
actions['send-feedback']=()=>{const a=document.createElement('a');a.href=feedbackLink();a.rel='noopener';document.body.appendChild(a);a.click();a.remove();};
actions['share-export']=async()=>{const file=shareFile||await exportFile();shareFile=null;const when=M.today();const body=`CrankMagic library export ${when}. On your computer, open CrankMagic → User Functions → Restore from a backup file and choose ${file.name}.`;
if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'CrankMagic export '+when,text:body});notice('Export handed to your share sheet.');return;}catch(err){if(err.name==='AbortError')return;}}
download(file.name,await file.text());location.href='mailto:?subject='+encodeURIComponent('CrankMagic export '+when)+'&body='+encodeURIComponent('The export file '+file.name+' was just downloaded. Attach it to this email. '+body);notice('This browser cannot attach a file to an email by itself: the export was downloaded and an email draft opened — attach the file to it.',true);};
/* Undo holds the same guard a save does. The repository announces the new revision to this tab's own
   listeners before undo() returns, while `state` still holds the old one, and the listener took that for
   another tab's change: it refreshed and said so, on top of "Last change undone", in whichever order
   the two landed (tests/shell-r3.mjs records every notice to hold this). */
actions.undo=async()=>{if(committing)throw Object.assign(Error('A save is already in progress. Please wait for its receipt.'),{retryable:true});committing=true;try{state=await repo.undo(state.revision);}finally{committing=false;}await render();notice('Last change undone.');};
actions.history=async()=>{const rows=await repo.history();modal('History & undo',`${note('History records completed transactions. Undo reverses the last compound change when no later change has intervened.')}${button('Undo last change','undo')}<label style="margin-top:16px">Filter history<input id="cm-history-filter" placeholder="Card, deck or operation"></label><div id="cm-history-rows"></div>`);const draw=()=>{$('#cm-history-rows').innerHTML=rows.filter(r=>(r.summary+' '+r.type).toLowerCase().includes($('#cm-history-filter').value.toLowerCase())).slice(0,200).map(r=>`<article><h3>${esc(r.summary)}</h3><p class="cm-muted">${esc(usDateTime(r.at)||r.at)} · revision ${r.revision} · ${esc(r.type)}</p>${effectsHTML(r.effects,state)}</article>`).join('')||'<p>No matching history.</p>';};$('#cm-history-filter').addEventListener('input',draw);draw();};
actions.clear=()=>form('Clear all CrankMagic data',`<div class="cm-full">${note('This permanently removes the library, decks, history, undo data and cached public card data from this browser. Export a backup first. It does not delete files you exported.',true)}${button('Export backup first','backup')}</div>${field('Type CLEAR to confirm','confirm','','required autocomplete="off"')}<label class="cm-checkbox"><input type="checkbox" name="legacy">Also remove this app’s legacy storage keys</label>`,async data=>{if(data.confirm!=='CLEAR')throw Error('Type CLEAR exactly.');state=await repo.clear(state.revision);if(data.legacy)for(const key of MtgUserState.keys())localStorage.removeItem(key);catalog=await CrankCatalog.create({repository:repo,client:CrankCardClient.create(),link:MtgCardLink,urls:CrankAssets,savedCards:{}});await render();notice('Local library and history cleared. Exported files remain under your control.');},'Clear local data');
document.addEventListener('error',e=>{const img=e.target;if(img.matches?.('.cm-commander>img,.cm-inspector>img,.cm-graph-art')){const p=document.createElement('p');p.className='cm-image-fallback';p.textContent='Card image unavailable. Rules and saved card records remain available.';img.replaceWith(p);}},true);
/* A SECOND CLICK ON A MENU'S OWN BUTTON CLOSES IT (Rob, 24 September: "when I click More
   again, it is not closing the menu"). A menu is an auto popover, and the browser dismisses
   one on the press itself, before the click reaches the button -- so the click found no menu
   and opened a fresh one. The press is read here instead: a press on the button of the menu
   that is open marks it, and the click that follows only closes. Every .cm-menu an action
   opens is tied to the button that opened it below, so no menu has to remember to. */
let pressedMenuButton=null;
const openMenu=()=>document.querySelector('.cm-menu[popover=auto]:popover-open');
addEventListener('pointerdown',e=>{const m=openMenu();pressedMenuButton=m&&m.cmAnchor&&m.cmAnchor.contains(e.target)?m.cmAnchor:null;},true);
document.addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el||el.disabled)return;const fn=actions[el.dataset.action];if(!fn)return;e.preventDefault();
  const open=openMenu(),again=pressedMenuButton===el||(open&&open.cmAnchor===el);pressedMenuButton=null;
  if(again){if(open)open.hidePopover();return;}
  try{const run=fn(el,e),opened=openMenu();if(opened&&!opened.cmAnchor)opened.cmAnchor=el;await run;}catch(error){if(error.name!=='AbortError')notice(error.message,true,{action:mayPass(error)&&el.isConnected?{label:'Retry',run:()=>fn(el,e)}:null});}});
/* Retry is offered only for a failure that trying again could fix -- the network, a save that was
   busy -- never for a rule the reader has not met yet, which would fail the same way twice. */
function mayPass(error){return Boolean(error.retryable)||!navigator.onLine||(error.name==='TypeError'&&/fetch|network|load failed/i.test(error.message));}
/* SHARE. The QR code hands the app to someone with no server: it is drawn in the page (crankmagic-qr.js), so it
   works offline and at a table. (Share by email left the Menu, Rob, 2026-09-29.) The link is the public one, not
   whatever address this copy happens to be open on: the page's canonical link, which tools/release-pages.mjs sets
   to the address a release is published at. */
const APP_URL=canonicalBase();
$('#cm-share-menu')?.addEventListener('beforetoggle',e=>{if(e.newState==='open'){const r=$('#cm-share-button').getBoundingClientRect(),m=$('#cm-share-menu');m.style.right='auto';m.style.left=Math.max(8,Math.min(r.left,innerWidth-248))+'px';m.style.top=(r.bottom+8)+'px';}});
$('#cm-share-menu')?.addEventListener('click',e=>{if(e.target.closest('a,button'))$('#cm-share-menu').hidePopover();});
actions['share-qr']=()=>{if(typeof CrankQR==='undefined')throw Error('The QR code module has not loaded yet. Try again in a moment.');
  modal('Scan to open CrankMagic',`<div class="cm-qr"><div class="cm-qr-code">${CrankQR.svg(APP_URL,{label:'QR code that opens '+APP_URL})}</div><p class="cm-qr-link"><a href="${esc(APP_URL)}" rel="noopener">${esc(APP_URL)}</a></p><div class="cm-actions cm-qr-actions">${button('Copy link','share-copy')}</div>${note('Point a phone camera at the code and tap the link it offers. Turn the screen brightness up if it does not catch.')}</div>`);};
actions['share-copy']=async()=>{try{await navigator.clipboard.writeText(APP_URL);notice('Link copied.');}catch{notice('Copying did not work in this browser. Select the link and copy it by hand.',true);}};
/* Menu moved to the foot of the rail (Track V.3), so the popover rises from its button rather
   than dropping from a header that is no longer there: left-aligned to the button, its bottom
   just above it, and never taller than the space above, which is what stops it running off the
   top of a phone. Anchored in viewport coordinates because .cm-menu is position:fixed. */
$('#cm-user-menu').addEventListener('beforetoggle',e=>{if(e.newState==='open'){describeData();const r=$('#cm-user-functions').getBoundingClientRect(),m=$('#cm-user-menu');
  const below=window.innerHeight-r.bottom;
  m.style.left=Math.max(8,Math.min(r.left,window.innerWidth-226))+'px';m.style.right='auto';
  if(below>=320){m.style.top=(r.bottom+8)+'px';m.style.bottom='auto';m.style.maxHeight=(below-24)+'px';}
  else{m.style.top='auto';m.style.bottom=(window.innerHeight-r.top+8)+'px';m.style.maxHeight=(r.top-24)+'px';}
  if(repo)exportFile().then(f=>{shareFile=f;}).catch(()=>{shareFile=null;});}});$('#cm-user-menu').addEventListener('click',e=>{if(e.target.closest('[data-action]'))$('#cm-user-menu').hidePopover();});
/* A NEW VIEW STARTS AT THE TOP. The hash changed and render() replaced the page, but the
   scroll offset stayed where the last page left it -- open a deck from the bottom of the
   Collection and you landed halfway down its page. A change of view resets; a change of
   parameters inside the same view (a filter, a card) keeps the reader's place. */
/* A NEW PAGE STARTS AT THE TOP. Opening a deck from the bottom of the Decks grid used to keep
   the grid's scroll offset, so the deck page appeared already scrolled to its middle: the
   hash changed but the view name did not. The key that decides "new page" is the view plus
   the deck it shows and the Cards tab or Sheet it is on; a filter on the same page keeps
   the reader where they are. */
const routeKey=()=>{const r=route();return r.view+(r.view==='decks'?'|'+(r.params.get('deck')||''):'')+'|'+(r.params.get('tab')||'')+'|'+(r.params.get('view')||'');};
let lastKey=routeKey();
window.addEventListener('hashchange',()=>{const key=routeKey();if(key!==lastKey)scrollTo(0,0);lastKey=key;
  /* A notice is about the page it was raised on; on the next page it is stale and it hides the
     tiles (UAT M-16). An error stays until its own timer, because it may be the only record. */
  const stale=$('#cm-notice');if(stale&&!stale.classList.contains('error')){stale.hidden=true;clearTimeout(noticeTimer);}
  render();main.focus({preventScroll:true});openNewDeckIfAsked();});window.addEventListener('online',status);window.addEventListener('offline',status);
/* The wizard opens after the view has drawn, for a hashchange and for a cold load alike, so the
   address behaves the same however a reader arrives at it. */
let newDeckOpened=false;
function openNewDeckIfAsked(){if(location.hash!=='#new'){newDeckOpened=false;return;}if(newDeckOpened)return;newDeckOpened=true;queueMicrotask(()=>actions['new-deck']?.());}
/* A DEEP LINK TO A DECK shows a hero-shaped skeleton while the library opens, not "Deck not
   found": the deck cannot be found before there is a library to find it in. */
if(/^#decks\?.*deck=/.test(location.hash))main.innerHTML='<section class="cm-deck-hero cm-skeleton" aria-busy="true"><div class="cm-deck-hero-copy"><a class="cm-crumb" href="#decks">Decks</a><h1>Opening your library…</h1><p class="cm-muted">The deck page follows once the local records are read.</p></div></section>';
/* A START THAT NEVER ENDS SAYS SO (Rob, 2026-09-29, on a work computer with a VPN: "stays stuck on Opening your
   library ... it never stops"). A network that refuses a download gets an error below; one that holds it -- a VPN
   or a work filter scanning a file of several megabytes -- left this placeholder up forever, saying nothing. After
   SLOW_START ms it says what is happening and offers Reload, and keeps waiting, since a slow download may still land. */
const SLOW_START=globalThis.CRANK_SLOW_START_MS||15000;
setTimeout(()=>{const starting=main.querySelector('.cm-starting');if(!starting||starting.querySelector('.cm-starting-slow'))return;starting.insertAdjacentHTML('beforeend','<div class="cm-note cm-warning cm-starting-slow" role="alert"><p><strong>This is taking longer than it should.</strong> CrankMagic downloads its card catalog, a few megabytes, as it starts. A VPN or a work network can hold that download back or block it. It is still trying.</p><p>If it stays stuck, turn the VPN off or try another network, then reload.</p><div class="cm-actions"><button type="button" class="v-button" id="cm-starting-reload">Reload</button></div></div>');starting.querySelector('#cm-starting-reload').addEventListener('click',()=>location.reload());},SLOW_START);
try{repo=await CrankRepository.open();state=await repo.getState();await seedStarterGroups();await ensureDeckGroups();catalog=await CrankCatalog.create({repository:repo,client:CrankCardClient.create(),link:MtgCardLink,urls:CrankAssets,savedCards:state.cards});let terms=[];try{terms=CrankAssets.expect(await catalog.load(CrankAssets.glossary),'glossary').entries;}catch(e){notice(e.message,true);}glossary=CrankGlossary.create(terms.concat(COLLECTION_TERMS));M.setRecordSource(id=>catalog.get(id)||null);
/* WIRE LOBBY DRAFT HELPERS. Hosted Play calls C.ensureLobbyDraft and C.attachDeckReport;
   the wrappers inject catalogExact, commit and state dependencies so Hosted Play only passes
   public API params (seatLabel, commanders, cards, existingDeckId / deckId, report). */
if(globalThis.CrankCollectionLobbyDraft){C.ensureLobbyDraft=options=>CrankCollectionLobbyDraft.ensureLobbyDraft({...options,catalogExact:name=>catalog?.exact?.(name)||null,commit:(...args)=>commit(...args),state});C.attachDeckReport=options=>CrankCollectionLobbyDraft.attachDeckReport({...options,commit:(...args)=>commit(...args),state});if(globalThis.CrankCollection){CrankCollection.ensureLobbyDraft=C.ensureLobbyDraft;CrankCollection.attachDeckReport=C.attachDeckReport;}}
for(const module of globalThis.CrankFeatures||[])module(C);
/* PLAY, COMING SOON. The production release is the workshop without Play -- Rob, 2026-09-24: "on
   that tab it should say 'Coming Soon'". tools/release-pages.mjs leaves the Play modules out of the
   release and marks its pages <meta name="crankmagic-play" content="coming-soon">; the tab stays and
   says so. Registered after the features, so it wins over any Play a feature registered. A release with PLAY IN
   THE CLOUD (content="cloud", staging since 2026-09-29) has no local game host: its Play tab is the table's page. */
if(document.querySelector('meta[name="crankmagic-play"]')?.content==='coming-soon')views.game=views.online=()=>{main.innerHTML=head('Play','Coming Soon','Playing your decks against friends and AI opponents is on its way. Building, testing, exploring and collecting are all here now.',button('Go to your decks','home',{},true));};
else if(document.querySelector('meta[name="crankmagic-play"]')?.content==='cloud'&&views.table)views.game=views.online=()=>views.table(new URLSearchParams());/* THE SITTING COMES BACK WITH THE PAGE (plan §2.7), re-validated against the library as it is
   now; what no longer applies is named rather than lost quietly. The warning on the way out is
   the other half: a sitting is per device, so a closed tab is the one way to lose one. */
if(sandbox){const back=sandbox.load(state);if(back.dropped.length)notice(`${back.dropped.length} staged move${back.dropped.length===1?'':'s'} no longer appl${back.dropped.length===1?'ies':'y'} and ${back.dropped.length===1?'was':'were'} dropped: ${back.dropped.map(d=>d.cardName).join(', ')}.`,true);else if(back.restored)notice(`${back.restored} move${back.restored===1?'':'s'} still staged from your last sitting. Review and confirm, or discard, on the Cards page.`);
 addEventListener('beforeunload',event=>{if(!sandbox.open)return;event.preventDefault();event.returnValue='';});const strip=Object.values(state.cards).filter(c=>(c.shipped!==true&&catalog.get(c.id)?.shipped)||(c.shipped===true&&!c.oracleId&&catalog.get(c.id)?.oracleId)).map(c=>c.id);if(strip.length){try{const result=await repo.commit({id:uid(),type:'reconcileCards',ids:strip},state.revision);state=result.state;}catch(error){notice('The library could not be reconciled with the card records: '+error.message,true);}}}repo.subscribe(async info=>{if(info.closed)return notice('Local database was upgraded in another tab. Reload before editing.',true);if(!committing&&info.revision!==state.revision){await refresh();notice('Library refreshed after a change in another tab. Review any open form before saving.');}});await render();if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});if('serviceWorker' in navigator)navigator.serviceWorker.register('crankmagic-sw.js?v=402',{scope:'./'}).then(offerUpdate).catch(error=>notice('Offline app caching is unavailable: '+error.message,true));}
catch(error){main.innerHTML=head('Local library needs attention','Your data has not been changed',error.message)+note('CrankMagic requires HTTPS or localhost and browser storage. If a saved record is damaged, download its original contents and restore a verified backup.',true);if(repo){const raw=await repo.exportData();main.innerHTML+='<div class="cm-actions">'+button('Download original recovery record','recovery-export')+button('Restore a verified backup','recovery-restore')+'</div>';$('#cm-user-menu').innerHTML=button('Download original recovery record','recovery-export')+button('Restore a verified backup','recovery-restore');actions['recovery-export']=()=>download('CrankMagic-recovery-original.json',JSON.stringify({format:'crankmagic-recovery-record',capturedAt:new Date().toISOString(),...raw},null,2));actions['recovery-restore']=()=>form('Recover from a verified backup','<label class="cm-full">CrankMagic JSON backup<input name="file" type="file" accept=".json" required></label>'+field('Type RECOVER to confirm replacement','confirm','','required')+note('The damaged original record is retained in the restored library’s legacy archive. No quantities are inferred from it.'),async(v,f)=>{if(v.confirm!=='RECOVER')throw Error('Type RECOVER exactly.');const file=f.elements.file.files[0];if(file.size>100000000)throw Error('Backup exceeds 100 MB.');const payload=await E.readBackup(await file.text());await repo.recover(payload,raw.state);location.reload();},'Recover library');}}

})();
