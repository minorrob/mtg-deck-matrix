/* SETTINGS (R3.3; r3 wireframe 70-settings, INTAKE §4.7). One page for what the Menu used to carry on
   top of what it is for: the account, how the app looks and moves, the price every deck is held to,
   the library's data, and what this copy of CrankMagic is. The Menu keeps the few things reached for
   every day (the theme, a backup, help); everything else lives here, in the sections the design
   draws.

   The design also drew a second-currency switch. It is not here and never will be: prices are US dollars, only
   (AGENTS.md, "The United States, always"). Card size is a slider, never S, M or L (R3.9b; AGENTS.md, "Sizes are sliders, never
   steps"), remembered on this device; Delete account is drawn by crankmagic-account.js, which alone knows whether anyone is signed in. */
(globalThis.CrankFeatures ||= []).push(function(C){const {esc:e,button:b,actions,views,notice,commit}=C;
const money=n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
const card=(id,title,body,cls='')=>`<section class="cm-settings-card${cls?' '+cls:''}" aria-labelledby="cm-settings-h-${id}"><h2 id="cm-settings-h-${id}">${e(title)}</h2>${body}</section>`;
/* A THEME IS PICKED BY ITS LOOK (A1): a swatch card per theme, drawn in that theme's own tokens -- five bands (ground,
   panel, raised, line, ink), the accent as a dot, and the name in the theme's display face. The current one is ringed. */
const swatch=([k,label,line])=>{const [palette,face]=C.THEME_FACE[k];return `<button type="button" class="cm-theme-card" data-action="set-theme" data-theme-choice="${k}" aria-pressed="${k===C.themeChoice()}" aria-label="${e(label)}" aria-description="${e(line)}"><span class="cm-theme-swatch" data-palette="${palette}" data-theme="${face}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><b></b><strong>${e(label)}</strong></span><small>${e(line)}</small></button>`;};

C.HELP.settings={title:'Settings',body:`<p>Your account, how the app looks, the price cap a deck is held to, and your library's data: backups, exports, history, and starting over.</p><p>A backup is an extra copy of the library, in a file you keep. Restoring one <strong>replaces</strong> the library with the file's.</p>`};

views.settings=async()=>{
  const p=C.state.preferences||{},choice=C.themeChoice(),still=Boolean(p.reduceMotion),stepByStep=(p.play||{}).stepByStep===true,rule=globalThis.CrankRules?globalThis.CrankRules.RULES.deckCap:null;
  const overlay=Number.isFinite(Number((p.play||{}).overlay))?Math.min(100,Math.max(0,Number((p.play||{}).overlay))):60;
  const own=Number(p.defaultBudgetCap)>0?Number(p.defaultBudgetCap):null,version=document.querySelector('meta[name="crankmagic-version"]')?.content||'';
  C.main.innerHTML=C.pageHead('Settings','','settings','<p class="cm-decks-summary">Account, appearance, play, prices and data.</p>')
   +`<div class="cm-settings">`
   +card('account','Account',`<div id="cm-settings-account"><p class="cm-muted">Signing in is not offered on this copy of CrankMagic, so the library has no cloud copy here. Save a backup file below to keep an extra one.</p></div>`)
   +card('appearance','Appearance',
      `<p class="cm-settings-label">Theme</p><div class="cm-theme-cards" role="group" aria-label="Theme">${C.THEMES.map(swatch).join('')}</div>`
      +`<p class="cm-settings-label">Default card size</p><div class="cm-settings-row">${C.cardScaleSlider({label:false,scope:'default'})}</div><p class="cm-muted">The size cards are drawn at everywhere: the hover preview, the card inspector's picture, and any view you have not sized. The Table and the Play board have their own slider, which sets that view's size over this one. Remembered on this device; a phone's scale stops sooner so the largest card still fits.</p>`
      +`<p class="cm-settings-label">Motion</p><div class="cm-settings-row"><button type="button" class="v-button cm-chip-toggle" data-action="set-motion" aria-pressed="${still}">Reduce motion</button></div>`
      +`<p class="cm-muted">Stills the animated backgrounds and transitions. Your device's own setting does the same whatever this says.</p>`
      +`<div class="cm-settings-row">${b('Confirmations…','confirm-skips')}</div>`)
   +card('play','Play',
      `<div class="cm-settings-row"><button type="button" class="v-button cm-chip-toggle" data-action="set-step-by-step" aria-pressed="${stepByStep}">Stop at every step of my turn</button></div>`
      +`<p class="cm-settings-label">Overlay</p><div class="cm-settings-row"><label class="cm-settings-slider">Callouts over the table<input type="range" min="0" max="100" step="1" value="${overlay}" data-settings-overlay aria-label="Callouts over the table" aria-valuetext="${overlay===0?'off':overlay+'%'}"><output>${overlay===0?'Off':overlay+'%'}</output></label></div>`
      +`<p class="cm-muted">What just happened at the table, called out in a word over the board: an attack coming in, a hit, a spell countered, your turn. Off at the left; louder and longer toward the right. Reduce motion shows each one without its entrance.</p>`
      +`<p class="cm-muted">Off, a step of your turn with nothing in it for you to do passes by itself, and the table stops where there is something: a land to play, a spell you can pay for, an attack. On, it stops at every step (upkeep, draw, main, combat, the end step), and you move on from each one yourself. Either way your turn never ends by itself: in your end step the button reads End turn. At a table, from its next step.</p>`)
   +card('prices','Prices',
      `<p>Prices are in US dollars, from Scryfall's daily market prices.</p>`
      +`<form class="cm-settings-cap" data-settings-cap><label>Default budget cap ($)<input name="cap" type="number" min="1" step="1" inputmode="numeric" value="${own??''}" placeholder="${e(rule??'')}"></label>${b('Save cap','save-budget-cap',{},true)}</form>`
      +`<p class="cm-muted">A deck with no cap of its own is held to <strong>${e(money(C.deckCap()))}</strong>${own?'':` — the pod's rule`}. Clear the box to go back to the rule${rule?` (${e(money(rule))})`:''}.</p>`)
   +card('ai','AI Coach',`<p>What the AI may suggest, how much it says, and what the Coach may see at a table. Nothing here turns an AI feature on: those are invite-only.</p><div class="cm-settings-row">${b('AI Coach settings…','ai-settings')}</div>`)
   +card('data','Data',
      `<div class="cm-settings-stack">${b('Save a backup file','backup')}${b('Restore from a backup file','restore')}${b('Export as Excel','export-excel')}${b('Email the export…','share-export')}</div>`
      +`<p class="cm-settings-label">History</p><div class="cm-settings-stack">${b('See every change…','history')}${b('Undo last change','undo')}</div>`
      +`<div class="cm-settings-danger"><p class="cm-settings-label">Danger zone</p><div id="cm-settings-delete"></div>${b('Clear all data','clear',{},false,{cls:'cm-danger'})}<p class="cm-muted">Removes the library, decks, history and cached card data from this device. Save a backup first.</p></div>`)
   +card('about','About',`<p id="cm-save-status" class="cm-muted"></p><div id="cm-data-dates" class="cm-data-dates"></div>${version?'':'<p class="cm-muted">A development copy: no release version.</p>'}`
      +`<p class="cm-settings-links"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="THIRD-PARTY-NOTICES.md">Third-party notices</a><a href="LICENSE">License</a></p>`)
   +`</div>`;
  C.describeData();C.status?.();C.drawAccount?.();
};

actions['open-settings']=()=>C.go('settings');
/* AI COACH SETTINGS (AI-6, docs/plan-to-done-2026-09-30.md). One panel, two doors: Settings above, and the board's Tools.
   Six controls, nothing else, saved with the person's preferences (`aiCoach`) and synced with the library, so the Worker
   reads the advisor's from the library it holds (cloud/advise.mjs aiSettingsOf, whose defaults these are); the Coach's
   is sent with each question from the board. The model per job is Rob's, never the person's; the door's gates turn a
   feature on, never this. */
const AI_DEFAULTS={suggestUnowned:false,preferOwned:true,inBracket:true,length:'short',coachSees:'hand'};
const aiPrefs=()=>({...AI_DEFAULTS,...((C.state.preferences||{}).aiCoach||{})});
C.aiSettings=()=>{const v=aiPrefs(),box=(name,label,help)=>`<label class="cm-checkbox cm-full"><input type="checkbox" name="${name}"${v[name]?' checked':''}> ${e(label)}</label><p class="cm-muted cm-ai-help">${e(help)}</p>`,
  pick=(name,label,options,key=name)=>`<label class="cm-full">${e(label)}<select name="${name}">${options.map(([k,t])=>`<option value="${k}"${v[key]===k?' selected':''}>${e(t)}</option>`).join('')}</select></label>`;
  C.modal('AI Coach settings',`<form class="cm-ai-settings" id="cm-ai-settings">`
    +box('suggestUnowned','Suggest cards I don’t own','When on, the deck advisor may suggest cards you don’t own, each priced, within the deck’s own cost cap. Off, it suggests only cards you own or have listed.')
    +box('preferOwned','Prefer what I own first','The bench, then To buy and Watching, before anything else.')
    +box('inBracket','Stay inside the deck’s bracket','The advisor keeps to the game changers your deck’s bracket allows.')
    +pick('adviceLength','Advice length',[['short','Short: one line per change'],['detailed','Detailed: the why, with the role and the numbers']],'length')
    +pick('coachSees','What the Coach may see at the table',[['hand','My board and hand'],['board','My board only (my hand withheld)']])
    +`<div class="cm-full"><p class="cm-settings-label">Spending</p><p id="cm-ai-meter" class="cm-muted">Reading your AI spending…</p><p class="cm-muted"><a href="privacy.html#ai-features">What the AI features send, and what they never do</a></p></div>`
    +`<div class="cm-form-footer cm-full">${b('Cancel','close')}${b('Save','ai-settings-save',{},true)}</div></form>`);
  fetch('/api/ai-meter',{credentials:'same-origin',redirect:'manual',cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null).then(m=>{const el=document.getElementById('cm-ai-meter');if(!el)return;
    el.textContent=m&&m.open?`${m.spentCents}¢ of your ${m.capCents}¢ over the last 24 hours.`:'AI features are not open to you here, so nothing is spent.';});};
actions['ai-settings']=()=>C.aiSettings();
actions['ai-settings-save']=async()=>{const f=document.getElementById('cm-ai-settings');if(!f)return;
  const next={suggestUnowned:f.elements.suggestUnowned.checked,preferOwned:f.elements.preferOwned.checked,inBracket:f.elements.inBracket.checked,
    /* Not elements.length, which is the form's count of controls. */
    length:f.elements.adviceLength.value==='detailed'?'detailed':'short',coachSees:f.elements.coachSees.value==='board'?'board':'hand'};
  await commit({type:'preferences',values:{aiCoach:next}});actions.close();notice('AI Coach settings saved.');};
/* STOP AT EVERY STEP OF MY TURN (Rob, 2026-10-11): kept with the preferences (`play`), and told to the room by the board
   (crankmagic-board.js, prefer). */
actions['set-step-by-step']=async()=>{const play=(C.state.preferences||{}).play||{},on=play.stepByStep!==true;await commit({type:'preferences',values:{play:{...play,stepByStep:on}}});notice(on?'Your turn now stops at every step; you move on from each yourself.':'Steps of your turn with nothing to do pass by themselves again. Your turn still never ends without you.');};
/* THE OVERLAY (the callouts' loudness, 0 off to 100): a slider, previewed as it moves and saved when it is let go, with
   the rest of the Play preferences (crankmagic-board.js reads play.overlay). */
document.addEventListener('input',ev=>{const el=ev.target.closest?.('[data-settings-overlay]');if(!el)return;const n=Number(el.value);el.setAttribute('aria-valuetext',n===0?'off':n+'%');const out=el.parentElement.querySelector('output');if(out)out.textContent=n===0?'Off':n+'%';});
document.addEventListener('change',async ev=>{const el=ev.target.closest?.('[data-settings-overlay]');if(!el)return;const play=(C.state.preferences||{}).play||{},n=Math.min(100,Math.max(0,Math.round(Number(el.value)||0)));await commit({type:'preferences',values:{play:{...play,overlay:n}}},{renderView:false});notice(n===0?'Callouts off.':`Callouts at ${n}%.`);});
actions['set-motion']=async()=>{const on=!(C.state.preferences&&C.state.preferences.reduceMotion);await commit({type:'preferences',values:{reduceMotion:on}});notice(on?'Motion reduced: backgrounds and transitions hold still.':'Motion back on (your device’s own setting still applies).');};
/* The cap is read from its own form, whichever button or key submitted it. Empty goes back to the rule. */
actions['save-budget-cap']=async el=>{const form=el.closest('[data-settings-cap]'),raw=String(form?.elements.cap.value??'').trim(),n=raw===''?null:Number(raw);
  if(n!==null&&!(Number.isFinite(n)&&n>0))throw Error('A budget cap is a number of dollars above zero, or empty for the pod’s rule.');
  await commit({type:'preferences',values:{defaultBudgetCap:n}});notice(n===null?'Decks with no cap of their own follow the pod’s rule again.':`Decks with no cap of their own are held to ${money(n)}.`);};
document.addEventListener('submit',ev=>{const form=ev.target.closest?.('[data-settings-cap]');if(!form)return;ev.preventDefault();form.querySelector('[data-action="save-budget-cap"]')?.click();});
});
