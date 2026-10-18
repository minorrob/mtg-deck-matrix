/* SETTINGS (R3.3; r3 wireframe 70-settings, INTAKE §4.7). One page for what the Menu used to carry on
   top of what it is for: the account, how the app looks and moves, the account's budget against the decks',
   the library's data, and what this copy of CrankMagic is. The Menu keeps the few things reached for
   every day (the theme, a backup, help); everything else lives here, in the sections the design
   draws.

   The design also drew a second-currency switch. It is not here and never will be: prices are US dollars, only
   (AGENTS.md, "The United States, always"). Card size is a slider, never S, M or L (R3.9b; AGENTS.md, "Sizes are sliders, never
   steps"), remembered on this device; Delete account is drawn by crankmagic-account.js, which alone knows whether anyone is signed in. */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,esc:e,button:b,actions,views,notice,commit}=C;
const money=n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
const card=(id,title,body,cls='')=>`<section class="cm-settings-card${cls?' '+cls:''}" aria-labelledby="cm-settings-h-${id}"><h2 id="cm-settings-h-${id}">${e(title)}</h2>${body}</section>`;
/* THE ACCOUNT'S BUDGET (Rob, 2026-10-18; docs/budgets.md). The player sets it here and it is set against what the decks
   plan to spend: each live deck at its own budget, or at its cost (the list at recorded prices) when that is more, and
   a deck with no budget at its cost. A deck never inherits this figure, and nothing is refused for either: both only
   inform. The figures are the model's (M.budgets), so the Decks page's line under the tiles says the same. */
const cents=n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const budgetCard=a=>{const n=v=>e(cents(v));
  const head=a.budget===null?`Your decks plan <strong>${n(a.planned)}</strong> together. Set a budget to compare.`
    :`Your decks plan <strong>${n(a.planned)}</strong> of <strong>${n(a.budget)}</strong> · <strong class="${a.over?'cm-over':''}">${n(Math.abs(a.left))} ${a.over?'over':'left'}</strong>`;
  const rows=a.decks.map(x=>`<tr${x.over?' class="cm-over"':''}><th scope="row">${e(x.name)}</th><td>${x.budget===null?'—':n(x.budget)}</td><td${x.unpriced?` title="${x.unpriced} cop${x.unpriced===1?'y has':'ies have'} no price"`:''}>${x.unpriced?'≈ ':''}${n(x.cost)}</td><td>${n(x.counted)}</td></tr>`).join('');
  return `<form class="cm-settings-cap" data-settings-budget><label>Account budget ($)<input name="budget" type="number" min="1" step="1" inputmode="numeric" value="${a.budget??''}" placeholder="None"></label>${b('Save budget','save-account-budget',{},true)}</form>`
    +`<p class="cm-settings-budget-sum">${head}</p>`
    +(a.decks.length?`<table class="cm-settings-budgets"><thead><tr><th scope="col">Deck</th><th scope="col">Budget</th><th scope="col">Cost</th><th scope="col">Counts</th></tr></thead><tbody>${rows}</tbody></table>`:'')
    +`<p class="cm-muted">Only informs: nothing is refused for money. A deck's budget is its own, in its Deck Definition, and does not inherit this one. A deck counts at its budget, or at its cost when that is more.</p>`;};
/* A THEME IS PICKED BY ITS LOOK (A1): a swatch card per theme, drawn in that theme's own tokens -- five bands (ground,
   panel, raised, line, ink), the accent as a dot, and the name in the theme's display face. The current one is ringed. */
const swatch=([k,label,line])=>{const [palette,face]=C.THEME_FACE[k];return `<button type="button" class="cm-theme-card" data-action="set-theme" data-theme-choice="${k}" aria-pressed="${k===C.themeChoice()}" aria-label="${e(label)}" aria-description="${e(line)}"><span class="cm-theme-swatch" data-palette="${palette}" data-theme="${face}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><b></b><strong>${e(label)}</strong></span><small>${e(line)}</small></button>`;};

C.HELP.settings={title:'Settings',body:`<p>Your account, how the app looks, your account's budget against your decks', and your library's data: backups, exports, history, and starting over.</p><p>A backup is an extra copy of the library, in a file you keep. Restoring one <strong>replaces</strong> the library with the file's.</p>`};

views.settings=async()=>{
  const p=C.state.preferences||{},choice=C.themeChoice(),still=Boolean(p.reduceMotion),acct=M.budgets(C.state),version=document.querySelector('meta[name="crankmagic-version"]')?.content||'';
  C.main.innerHTML=C.pageHead('Settings','','settings','<p class="cm-decks-summary">Account, appearance, play, prices and data.</p>')
   +`<div class="cm-settings">`
   +card('account','Account',`<div id="cm-settings-account"><p class="cm-muted">Signing in is not offered on this copy of CrankMagic, so the library has no cloud copy here. Save a backup file below to keep an extra one.</p></div>`)
   +card('profile','Profile','<div id="cm-settings-profile"><p>Sign in to set your name and profile picture.</p></div>')
   +card('appearance','Appearance',
      `<p class="cm-settings-label">Theme</p><div class="cm-theme-cards" role="group" aria-label="Theme">${C.THEMES.map(swatch).join('')}</div>`
      +`<p class="cm-settings-label">Default card size</p><div class="cm-settings-row">${C.cardScaleSlider({label:false,scope:'default'})}</div><p class="cm-muted">The size cards are drawn at everywhere: the hover preview, the card inspector's picture, and any view you have not sized. The Table and the Play board have their own slider, which sets that view's size over this one. Remembered on this device; a phone's scale stops sooner so the largest card still fits.</p>`
      +`<p class="cm-settings-label">Motion</p><div class="cm-settings-row"><button type="button" class="v-button cm-chip-toggle" data-action="set-motion" aria-pressed="${still}">Reduce motion</button></div>`
      +`<p class="cm-muted">Stills the animated backgrounds and transitions. Your device's own setting does the same whatever this says.</p>`
      +(globalThis.CrankStage?`<p class="cm-settings-label">Table design</p><div class="cm-settings-row"><label class="cm-settings-select">Table <select data-settings-table aria-label="Table design">${CrankStage.appearances.tables.map(t=>`<option value="${e(t.id)}"${CrankStage.tableDesign(tableChoice()).id===t.id?' selected':''}>${e(t.name)}</option>`).join('')}</select></label></div><p class="cm-muted">The table the game is played on, for this device. The same choice is in the Camera menu at the table.</p>`:'')
      +`<div class="cm-settings-row">${b('Confirmations…','confirm-skips')}</div>`)
   +C.settingsPlayCard(card)
   +card('prices','Prices',
      `<p>Prices are in US dollars, from Scryfall's daily market prices.</p>`)
   +card('budget','Budget',budgetCard(acct))
   +card('ai','AI Coach',`<p>What the AI may suggest, how much it says, and what the Coach may see at a table. Nothing here turns an AI feature on: those are invite-only.</p><div class="cm-settings-row">${b('AI Coach settings…','ai-settings')}</div>`)
   +card('data','Data',
      `<div class="cm-settings-stack">${b('Save a backup file','backup')}${b('Restore from a backup file','restore')}${b('Export as Excel','export-excel')}${b('Email the export…','share-export')}</div>`
      +`<p class="cm-settings-label">History</p><div class="cm-settings-stack">${b('See every change…','history')}${b('Undo last change','undo')}</div>`
      +`<div class="cm-settings-danger"><p class="cm-settings-label">Danger zone</p><div id="cm-settings-delete"></div>${b('Clear all data','clear',{},false,{cls:'cm-danger'})}<p class="cm-muted">Removes the library, decks, history and cached card data from this device. Save a backup first.</p></div>`)
   +card('about','About',`<p id="cm-save-status" class="cm-muted"></p><div id="cm-data-dates" class="cm-data-dates"></div>${version?'':'<p class="cm-muted">A development copy: no release version.</p>'}`
      +`<p class="cm-settings-links"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="THIRD-PARTY-NOTICES.md">Third-party notices</a><a href="LICENSE">License</a></p>`)
   +`</div>`;
  C.describeData();C.status?.();C.drawAccount?.();C.drawProfile?.();
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
actions['set-motion']=async()=>{const on=!(C.state.preferences&&C.state.preferences.reduceMotion);await commit({type:'preferences',values:{reduceMotion:on}});notice(on?'Motion reduced: backgrounds and transitions hold still.':'Motion back on (your device’s own setting still applies).');};
/* The account's budget is read from its own form, whichever button or key submitted it. Empty is no budget. */
actions['save-account-budget']=async el=>{const form=el.closest('[data-settings-budget]'),raw=String(form?.elements.budget.value??'').trim(),n=raw===''?null:Number(raw);
  if(n!==null&&!(Number.isFinite(n)&&n>0))throw Error('An account budget is a number of dollars above zero, or empty for none.');
  await commit({type:'preferences',values:{accountBudget:n}});const a=M.budgets(C.state);
  notice(n===null?'No account budget now. Each deck keeps its own.':`Account budget ${cents(n)}. Your decks plan ${cents(a.planned)}: ${cents(Math.abs(a.left))} ${a.over?'over':'left'}.`);};
const tableChoice=()=>{try{return localStorage.getItem('cm-stage-table')||'';}catch{return '';}};
document.addEventListener('change',ev=>{const el=ev.target.closest?.('[data-settings-table]');if(!el||!globalThis.CrankStage)return;const design=CrankStage.tableDesign(el.value);if(design.id!==el.value)return;try{localStorage.setItem('cm-stage-table',design.id);}catch{}notice(`Table: ${design.name}.`);});
document.addEventListener('submit',ev=>{const form=ev.target.closest?.('[data-settings-budget]');if(!form)return;ev.preventDefault();form.querySelector('[data-action="save-account-budget"]')?.click();});
});
