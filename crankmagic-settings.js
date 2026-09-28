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
const THEMES=[['dark','Dark · Brass & Slate'],['light','Light · Felt & Cream'],['system','Match system']];

C.HELP.settings={title:'Settings',body:`<p>Your account, how the app looks, the price cap a deck is held to, and your library's data: backups, exports, history, and starting over.</p><p>A backup is an extra copy of the library, in a file you keep. Restoring one <strong>replaces</strong> the library with the file's.</p>`};

views.settings=async()=>{
  const p=C.state.preferences||{},choice=C.themeChoice(),still=Boolean(p.reduceMotion),rule=globalThis.CrankRules?globalThis.CrankRules.RULES.deckCap:null;
  const own=Number(p.defaultBudgetCap)>0?Number(p.defaultBudgetCap):null,version=document.querySelector('meta[name="crankmagic-version"]')?.content||'';
  C.main.innerHTML=C.pageHead('Settings','','settings','<p class="cm-decks-summary">Account, appearance, prices and data.</p>')
   +`<div class="cm-settings">`
   +card('account','Account',`<div id="cm-settings-account"><p class="cm-muted">Signing in is not offered on this copy of CrankMagic, so the library has no cloud copy here. Save a backup file below to keep an extra one.</p></div>`)
   +card('appearance','Appearance',
      `<p class="cm-settings-label">Theme</p><div class="cm-settings-row" role="group" aria-label="Theme">${THEMES.map(([k,label])=>`<button type="button" class="v-button cm-chip-toggle" data-action="set-theme" data-theme-choice="${k}" aria-pressed="${k===choice}">${e(label)}</button>`).join('')}</div>`
      +`<p class="cm-settings-label">Card size</p><div class="cm-settings-row">${C.cardScaleSlider({label:false})}</div>`
      +`<p class="cm-muted">The Table view's cards, the hover preview and the card inspector's picture. Remembered on this device; a phone's scale stops sooner so the largest card still fits.</p>`
      +`<p class="cm-settings-label">Motion</p><div class="cm-settings-row"><button type="button" class="v-button cm-chip-toggle" data-action="set-motion" aria-pressed="${still}">Reduce motion</button></div>`
      +`<p class="cm-muted">Stills the animated backgrounds and transitions. Your device's own setting does the same whatever this says.</p>`
      +`<div class="cm-settings-row">${b('Confirmations…','confirm-skips')}</div>`)
   +card('prices','Prices',
      `<p>Prices are in US dollars, from Scryfall's daily market prices.</p>`
      +`<form class="cm-settings-cap" data-settings-cap><label>Default budget cap ($)<input name="cap" type="number" min="1" step="1" inputmode="numeric" value="${own??''}" placeholder="${e(rule??'')}"></label>${b('Save cap','save-budget-cap',{},true)}</form>`
      +`<p class="cm-muted">A deck with no cap of its own is held to <strong>${e(money(C.deckCap()))}</strong>${own?'':` — the pod's rule`}. Clear the box to go back to the rule${rule?` (${e(money(rule))})`:''}.</p>`)
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
actions['set-motion']=async()=>{const on=!(C.state.preferences&&C.state.preferences.reduceMotion);await commit({type:'preferences',values:{reduceMotion:on}});notice(on?'Motion reduced: backgrounds and transitions hold still.':'Motion back on (your device’s own setting still applies).');};
/* The cap is read from its own form, whichever button or key submitted it. Empty goes back to the rule. */
actions['save-budget-cap']=async el=>{const form=el.closest('[data-settings-cap]'),raw=String(form?.elements.cap.value??'').trim(),n=raw===''?null:Number(raw);
  if(n!==null&&!(Number.isFinite(n)&&n>0))throw Error('A budget cap is a number of dollars above zero, or empty for the pod’s rule.');
  await commit({type:'preferences',values:{defaultBudgetCap:n}});notice(n===null?'Decks with no cap of their own follow the pod’s rule again.':`Decks with no cap of their own are held to ${money(n)}.`);};
document.addEventListener('submit',ev=>{const form=ev.target.closest?.('[data-settings-cap]');if(!form)return;ev.preventDefault();form.querySelector('[data-action="save-budget-cap"]')?.click();});
});
