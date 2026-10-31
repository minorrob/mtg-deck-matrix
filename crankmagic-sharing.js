/* Sharing uses the cloud's live owner library. It never imports someone else's inventory into this device. */
(globalThis.CrankFeatures ||= []).push(function(C){
  const {esc:e,button:b,actions,views}=C;
  let me=null;
  async function api(method,path,body){const r=await fetch('/api/social'+path,{method,credentials:'same-origin',redirect:'manual',cache:'no-store',headers:body===undefined?{}:{'content-type':'application/json','x-crankmagic':'sync'},body:body===undefined?undefined:JSON.stringify(body)});if(r.type==='opaqueredirect'||r.status===401)throw Error('Sign in to share with other CrankMagic players.');const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||'Sharing is unavailable. Try again when connected.');return v;}
  const roleOptions=r=>`<option value="reviewer"${r==='reviewer'?' selected':''}>Reviewer</option><option value="collaborator"${r==='collaborator'?' selected':''}>Collaborator</option>`;
  const pending=mail=>{const failed=mail.filter(x=>x.status!=='sent');if(!failed.length)return C.notice('Sharing saved. Email notifications sent.');C.modal('Sharing saved',`<p>Access is saved. ${e(failed[0].error||'Email delivery is pending.')}</p>${failed.map(x=>b('Retry notification','share-retry',{mail:x.id})).join('')}<div class="cm-form-footer">${b('Close','close')}</div>`);};
  actions['share-retry']=async el=>{const r=await api('POST','/notify',{id:el.dataset.mail});if(r.status!=='sent')throw Error(r.error||'Email is still pending.');el.remove();C.notice('Email notification sent.');};
  // An explicit selection is required. Typing after selection clears it; late responses cannot replace newer results.
  function userPicker(root,onPick,{allowEmail=false}={}){
    const input=root.querySelector('[data-user-query]'),list=root.querySelector('[role=listbox]'),status=root.querySelector('[data-search-status]');let serial=0,timer,active=-1,users=[];
    const select=i=>{const u=users[i];if(!u)return;serial++;input.value=allowEmail?u.email:`${u.name||u.email} · ${u.email}`;list.replaceChildren();input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');status.textContent='Selected '+(u.name||u.email);onPick(u);};
    input.addEventListener('input',()=>{onPick(null);const n=++serial;clearTimeout(timer);list.replaceChildren();input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;const term=input.value.trim();status.textContent=term.length<3?'Type at least 3 characters.':'Searching…';if(term.length<3)return;timer=setTimeout(async()=>{try{const result=await api('GET','/users?q='+encodeURIComponent(term));if(serial!==n||!root.isConnected)return;users=result.users;list.innerHTML=users.map((u,i)=>`<li role="option" aria-selected="false" id="share-person-${i}" data-person="${i}"><strong>${e(u.name||u.email.split('@')[0])}</strong><small>${e(u.email)}</small></li>`).join('');input.setAttribute('aria-expanded',String(!!users.length));status.textContent=users.length?`${users.length} matches. Choose a person.`:'No registered users found.';}catch(err){if(serial===n)status.textContent=err.message;}},220);});
    list.addEventListener('click',ev=>{const option=ev.target.closest('[data-person]');if(option)select(Number(option.dataset.person));});
    input.addEventListener('keydown',ev=>{if(ev.key==='Escape'){list.replaceChildren();input.setAttribute('aria-expanded','false');return;}if(!list.children.length)return;if(['ArrowDown','ArrowUp'].includes(ev.key)){ev.preventDefault();active=(active+(ev.key==='ArrowDown'?1:-1)+users.length)%users.length;for(const [i,el] of [...list.children].entries())el.setAttribute('aria-selected',String(i===active));input.setAttribute('aria-activedescendant','share-person-'+active);}if(ev.key==='Enter'&&active>=0){ev.preventDefault();select(active);}});
  }
  const picker=(label='Find a registered user',type='text')=>`<div class="cm-share-search"><label for="cm-share-query">${label}</label><input id="cm-share-query" data-user-query type="${type}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cm-share-results" placeholder="Name or email"><ul id="cm-share-results" role="listbox" aria-label="Registered users"></ul><small data-search-status role="status">Type at least 3 characters.</small></div>`;
  async function share(kind,sourceId){
    const waiting=C.modal(kind==='deck'?'Share deck':'Share library',`<div data-share-loading><p role="status">Loading sharing…</p><div class="cm-form-footer">${b('Cancel','close')}</div></div>`);
    const loading=waiting.querySelector('[data-share-loading]');let settings;
    try{settings=await api('GET',`/settings?kind=${kind}&source=${encodeURIComponent(sourceId||'library')}`);}
    catch(err){if(!loading.isConnected||!waiting.open)return;loading.innerHTML=`<p class="cm-error" role="alert">${e(err.message)}</p><div class="cm-form-footer">${b('Cancel','close')}${b('Retry','share-open-again',{kind,source:sourceId||'library'},true)}</div>`;C.notice(err.message,true,{stay:true,undo:false,action:{label:'Retry',run:()=>share(kind,sourceId)}});return;}
    if(!loading.isConnected||!waiting.open)return;
    let grants=settings.grants.map(x=>({...x})),selected=null;
    const link=()=>settings.id?new URL('#shared?'+new URLSearchParams({kind,item:settings.id}),location.href).href:'';

    const dialog=C.modal(kind==='deck'?'Share Deck':'Share Library',`<form id="cm-share-form">${kind==='deck'?`<label>Link<input data-share-link readonly value="${e(link())}" placeholder="Copy link to save access and create the link"></label><p class="cm-muted">Only people with access can open this link.</p>`:''}<div class="cm-share-options" role="tablist" aria-label="Sharing method"><button type="button" role="tab" aria-selected="true" data-share-tab="people">Registered users</button><button type="button" role="tab" aria-selected="false" data-share-tab="public">Make public</button>${kind==='deck'?'<button type="button" role="tab" aria-selected="false" data-share-tab="email">Email Deck</button>':''}</div><section data-share-panel="people">${picker()}<div class="cm-share-add"><label>Permission<select name="newRole">${roleOptions('reviewer')}</select></label><button type="button" class="v-button" data-add-person disabled>Add person</button></div><div data-share-grants></div></section><section data-share-panel="public" hidden><label class="cm-checkbox"><input name="public" type="checkbox"${settings.publicRole?' checked':''}> Available to every signed-in CrankMagic player</label><label>Public permission<select name="publicRole">${roleOptions(settings.publicRole||'reviewer')}</select></label><p class="cm-muted">Reviewers can view${kind==='deck'?' and play':''}. Collaborators can also change the owner’s ${kind}. Choose Collaborator only if everyone should be able to edit.</p></section>${kind==='deck'?'<section data-share-panel="email" hidden><p>Email a copy of this deck list. This does not grant access to edit the live deck.</p><label>Email address<input name="email" type="email" autocomplete="email" list="cm-share-email-options"></label><datalist id="cm-share-email-options"></datalist><button type="button" class="v-button" data-email-send disabled>Send</button><p data-email-status role="status"></p></section>':''}<p class="cm-muted">Reviewer: view${kind==='deck'?' and play':''}. Collaborator: view and edit. Only the owner manages access.</p><p class="cm-error" role="alert" hidden></p><div class="cm-form-footer">${b('Cancel','close')}${kind==='deck'?'<button class="v-button primary" type="button" data-copy-link>Copy link</button>':''}<button class="v-button${kind==='deck'?'':' primary'}" type="submit">Save access</button></div></form>`);
    dialog.classList.add('cm-sharing-dialog');const f=dialog.querySelector('form'),error=f.querySelector('.cm-error');
    const failed=(err,retry)=>{if(!dialog.open||!f.isConnected)return;error.textContent=err.message;error.hidden=false;C.notice(err.message,true,{stay:true,undo:false,action:{label:'Retry',run:()=>dialog.open&&f.isConnected?retry():share(kind,sourceId)}});};
    const draw=()=>{f.querySelector('[data-share-grants]').innerHTML=grants.map((u,i)=>`<div class="cm-share-grant"><span><strong>${e(u.name||u.email)}</strong><small>${e(u.email)}</small></span><select data-grant-role="${i}" aria-label="Permission for ${e(u.name||u.email)}">${roleOptions(u.role)}</select><button type="button" data-remove-person="${i}" aria-label="Remove ${e(u.name||u.email)}">&#215;</button></div>`).join('');};draw();
    userPicker(f.querySelector('.cm-share-search'),u=>{selected=u;f.querySelector('[data-add-person]').disabled=!u;});
    const save=async()=>{if(f.querySelector('[data-user-query]').value.trim()&&!selected)throw Error('Choose a registered user from the suggestions before saving.');if(selected&&!grants.some(x=>x.id===selected.id))grants.push({...selected,role:f.elements.newRole.value});const result=await api('PUT','/settings',{kind,sourceId,revision:settings.revision,publicRole:f.elements.public.checked?f.elements.publicRole.value:null,grants:grants.map(({id,role})=>({id,role}))});Object.assign(settings,result.settings);return result;};
    f.addEventListener('click',async ev=>{const el=ev.target.closest('button');if(!el)return;
      if(el.hasAttribute('data-copy-link')){el.disabled=true;error.hidden=true;try{await save();const input=f.querySelector('[data-share-link]');input.value=link();if(!navigator.clipboard?.writeText)throw Error('Select the link above and copy it. Clipboard access is unavailable in this browser.');await navigator.clipboard.writeText(input.value);C.notice('Link copied. Only people with access can open it.',false,{undo:false});}catch(err){failed(err,()=>el.click());}finally{el.disabled=false;}}
      if(el.dataset.shareTab){for(const tab of f.querySelectorAll('[data-share-tab]'))tab.setAttribute('aria-selected',String(tab===el));for(const panel of f.querySelectorAll('[data-share-panel]'))panel.hidden=panel.dataset.sharePanel!==el.dataset.shareTab;}
      if(el.hasAttribute('data-add-person')&&selected){if(!grants.some(x=>x.id===selected.id))grants.push({...selected,role:f.elements.newRole.value});selected=null;f.querySelector('[data-user-query]').value='';f.querySelector('[data-search-status]').textContent='Person added. You can add another.';el.disabled=true;draw();}
      if(el.dataset.removePerson!==undefined){grants.splice(Number(el.dataset.removePerson),1);draw();}
      if(el.hasAttribute('data-email-send')){el.disabled=true;error.hidden=true;try{const sent=await api('POST','/email',{sourceId,email:f.elements.email.value});f.querySelector('[data-email-status]').textContent=sent.status==='sent'?'Deck email sent.':sent.error;if(sent.status!=='sent')pending([sent]);}catch(err){failed(err,()=>el.click());}finally{el.disabled=!f.elements.email.validity.valid||!f.elements.email.value;}}
    });
    f.querySelector('[role=tablist]').addEventListener('keydown',ev=>{const tabs=[...f.querySelectorAll('[role=tab]')],i=tabs.indexOf(ev.target);if(i<0||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;ev.preventDefault();const next=ev.key==='Home'?0:ev.key==='End'?tabs.length-1:(i+(ev.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click();});
    let emailTimer;f.addEventListener('input',ev=>{if(ev.target===f.elements.email){const input=f.elements.email;f.querySelector('[data-email-send]').disabled=!input.value||!input.validity.valid;clearTimeout(emailTimer);const term=input.value;emailTimer=setTimeout(async()=>{if(term.length<3)return;try{const {users}=await api('GET','/users?q='+encodeURIComponent(term));if(input.value===term&&input.isConnected)f.querySelector('datalist').innerHTML=users.map(u=>`<option value="${e(u.email)}">${e(u.name||u.email)}</option>`).join('');}catch{}},220);}});
    f.addEventListener('change',ev=>{if(ev.target.dataset.grantRole!==undefined)grants[Number(ev.target.dataset.grantRole)].role=ev.target.value;});
    f.addEventListener('submit',async ev=>{ev.preventDefault();const submit=f.querySelector('[type=submit]');submit.disabled=true;error.hidden=true;try{const result=await save();C.actions.close();if(result.mail.length)pending(result.mail);else C.notice('Sharing saved.');}catch(err){failed(err,()=>f.requestSubmit(submit));}finally{submit.disabled=false;}});
  }
  actions['share-open-again']=el=>share(el.dataset.kind,el.dataset.source);
  actions['share-deck']=el=>share('deck',el.dataset.deck);
  actions['share-library']=()=>share('library','library');
  /* The decks shared with this person, as the Decks page's Shared chip draws them: each says how it is reached (`via`: a
     grant, or public only), so Include public decks can leave the public ones out (FLT-6). */
  C.sharedItems=async()=>(await api('GET','/shares?kind=deck')).items;
  C.sharedDecks=async()=>{const {items}=await api('GET','/shares?kind=deck');return items.map(item=>{const c=item.content,commanders=new Set(c.commanders.map(x=>x.id));return {id:item.id,name:c.name,commander:c.commanders.map(x=>x.name),cards:c.slots.filter(x=>!commanders.has(x.cardId)).flatMap(x=>Array(x.quantity).fill(c.cards.find(y=>y.id===x.cardId)?.name)).filter(Boolean),bracket:c.bracket};});};
  let opened=null;
  views.shared=async()=>{const params=C.route().params,kind=params.get('kind')==='library'?'library':'deck',id=params.get('item');
    /* Shared decks are a chip of the Decks page now (FLT-6); a shared deck still opens here, on its own page (NAV-6). */
    if(!id&&kind==='deck'){history.replaceState(null,'','#decks?stage=shared');return C.render();}C.main.innerHTML=C.pageHead(kind==='deck'?'Shared Decks':'Shared Libraries')+'<p role="status">Loading shared items…</p>';try{
    if(!id){const {items}=await api('GET','/shares?kind='+kind);if(C.route().view!=='shared')return;C.main.innerHTML=C.pageHead(kind==='deck'?'Shared Decks':'Shared Libraries',`<a class="v-button" href="#shared?kind=${kind==='deck'?'library':'deck'}">${kind==='deck'?'Shared Libraries':'Shared Decks'}</a>`)+`<p>Public items and items shared with you. Your permissions follow your account.</p><div class="cm-shared-grid">${items.map(x=>`<a class="cm-settings-card" href="#shared?kind=${kind}&item=${x.id}"><h2>${e(x.content.name)}</h2><p>${e(x.owner)} · ${x.access==='collaborator'?'Collaborator':'Reviewer'}</p>${kind==='deck'?`<p>${x.content.commanders.map(c=>e(c.name)).join(' + ')}</p>`:''}</a>`).join('')||'<p>Nothing has been shared with you yet.</p>'}</div>`;return;}
    opened=await api('GET','/shares/'+encodeURIComponent(id));if(C.route().params.get('item')!==id)return;const x=opened,c=x.content,editable=['owner','collaborator'].includes(x.access),cards=new Map(c.cards.map(c=>[c.id,c]));
    C.main.innerHTML=C.pageHead(c.name,`<a class="v-button" href="#shared?kind=${x.kind}">Back to shared ${x.kind==='deck'?'decks':'libraries'}</a>${x.kind==='deck'?'<a class="v-button primary" href="#table">Play</a>':''}`)+`<p>${e(x.owner)} · ${e(x.access)}${editable?' · Changes update the owner’s live item.':''}</p>${x.kind==='deck'?`<p>${c.commanders.map(c=>e(c.name)).join(' + ')}</p><p>${e(c.notes)}</p>${editable?b('Edit name and notes','shared-edit-name')+b('Add card','shared-add-card'):''}`:''}<div class="cm-shared-table"><table><thead><tr><th>Card</th><th>Quantity</th>${x.kind==='library'?'<th>Status</th>':''}${editable?'<th>Edit</th>':''}</tr></thead><tbody>${(c.slots||c.lots).map(row=>`<tr><td>${e(cards.get(row.cardId)?.name||'Card')}</td><td>${row.quantity}</td>${x.kind==='library'?`<td>${e(row.source)}${row.assigned?' · Assigned':''}</td>`:''}${editable?`<td>${b('Change quantity','shared-quantity',{record:row.id})}</td>`:''}</tr>`).join('')}</tbody></table></div>`;
    }catch(err){C.main.innerHTML=C.pageHead('Shared items')+`<p role="alert">${e(err.message)}</p><a class="v-button" href="/api/auth/login?to=%23shared">Sign in</a>`;}};
  actions['shared-add-card']=()=>{const x=opened;if(!x||x.kind!=='deck')return;C.cardPicker('Add a card to the shared deck',card=>C.form('Add '+card.name,C.field('Quantity','quantity','1','type="number" min="1" max="9999" required'),async v=>{await api('PATCH','/shares/'+x.id,{head:x.head,command:{type:'target',cardName:card.name,quantity:Number(v.quantity)}});await C.render();C.notice('Shared deck updated.');},'Save'));};
  actions['shared-edit-name']=()=>{const x=opened;if(!x)return;C.form('Edit shared deck',C.field('Deck name','name',x.content.name,'required maxlength="160"')+`<label class="cm-full">Notes<textarea name="notes" maxlength="5000">${e(x.content.notes)}</textarea></label>`,async v=>{await api('PATCH','/shares/'+x.id,{head:x.head,command:{type:'editDeck',...v}});await C.render();C.notice('Shared deck updated.');},'Save');};
  actions['shared-quantity']=el=>{const x=opened,row=(x.content.slots||x.content.lots).find(r=>r.id===el.dataset.record);if(!row)return;C.form('Change shared quantity',C.field('Quantity','quantity',row.quantity,`type="number" min="${x.kind==='deck'?0:1}" max="9999" required`)+`<p class="cm-full">This updates the owner’s ${x.kind}. ${row.assigned?'This record is assigned to a deck; review its quantity before saving.':''}</p>${row.assigned?'<label class="cm-full"><input type="checkbox" name="confirmed" required> I reviewed the assigned card.</label>':''}`,async v=>{await api('PATCH','/shares/'+x.id,{head:x.head,command:x.kind==='deck'?{type:'target',cardId:row.cardId,quantity:Number(v.quantity)}:{type:'quantity',lotId:row.id,quantity:Number(v.quantity),confirmed:v.confirmed==='on'}});await C.render();C.notice('Shared quantity updated.');},'Save');};
  /* ADMIN (Rob, 2026-10-26: "an admin option in the settings menu that only I can see ... a pop-up, much like the
     settings pop-up"). The Menu's Admin entry is drawn for the administrator alone (`isAdmin`, from the Worker's
     INVITE_ADMIN_ID) and every Admin request is refused for anyone else by the Worker, whatever a page shows. The window is
     the app's tabbed one (crankmagic-app.js `tabbed`): General, what this copy is set up to do and the settings that had
     no place before; Share, an invitation. More sections join it over time. */
  const yes=(v,label=v?'Ready':'Not configured')=>`<dd data-ok="${v?'yes':'no'}">${v?'✓':'✕'} ${e(label)}</dd>`;
  const LOOK_KEY='cm-look-strength';
  const lookNow=()=>{try{const v=localStorage.getItem(LOOK_KEY);return v===null?50:Math.round(Number(v)*100);}catch{return 50;}};
  async function drawGeneral(box){
    let status,version=null;
    try{[status,version]=await Promise.all([api('GET','/admin'),fetch('/version.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)]);}
    catch(err){box.innerHTML=`<p role="alert">${e(err.message)}</p>`;return;}
    if(!box.isConnected)return;
    box.innerHTML=`<h3>This copy</h3><dl class="cm-admin-status">
      <dt>Administrator</dt><dd>${e(me.email)}</dd>
      <dt>Address</dt><dd>${e(location.host)}</dd>
      ${version?`<dt>Build</dt><dd>${e(String(version.commit||version.source||'').slice(0,8))}${version.profile?' · '+e(version.profile):''}</dd>`:''}
      <dt>Invitation email</dt>${yes(status.emailReady)}
      <dt>Cloudflare Access</dt>${yes(status.accessReady,status.accessReady?`Ready · ${status.accessTargets} sign-in${status.accessTargets===1?'':'s'}`:'Not configured')}
      <dt>Invitation link</dt><dd>${e(status.linkOrigin)}</dd>
      <dt>AI features</dt>${yes(status.aiEveryone,status.aiEveryone?'Everyone signed in':'Not open to everyone')}
      <dt>Invitations</dt><dd>${status.invitations.total.toLocaleString('en-US')} sent · ${status.invitations.admitted.toLocaleString('en-US')} admitted</dd>
    </dl>
    <h3>This device</h3>
    <div class="cm-board-size"><label class="cm-settings-slider">3D camera glance <input type="range" min="0" max="100" step="1" value="${lookNow()}" data-admin-look aria-label="3D camera glance strength" aria-valuetext="${lookNow()}%"><output>${lookNow()}%</output></label><p class="cm-muted">How far a held card turns the 3D camera toward it · 0% – 100% · 50% is the default</p></div>`;
    const look=box.querySelector('[data-admin-look]');
    look.addEventListener('input',()=>{look.nextElementSibling.textContent=look.value+'%';look.setAttribute('aria-valuetext',look.value+'%');});
    look.addEventListener('change',()=>{try{localStorage.setItem(LOOK_KEY,String(Number(look.value)/100));}catch{}C.notice(`3D camera glance kept at ${look.value}% on this device.`);});
  }
  /* THE GROUP CHOICE (ROB-320; Rob, 2026-10-30): Game Theory Insider (AI-enabled) or General. Only the owner is offered Insider, and
     the Worker refuses it for anyone else whatever this page draws. */
  const shareForm=()=>`<form class="cm-admin-form" data-admin-share novalidate>
      <label>Invitee name<input name="name" required maxlength="80" autocomplete="off"></label>
      <label>Invitee email<input name="email" type="email" required maxlength="254" autocomplete="off"></label>
      ${me?.isAdmin===true?'<label class="cm-full">Group<select name="group"><option value="insider" selected>Game Theory Insider · AI</option><option value="general">General · no AI</option></select></label>':'<p class="cm-full cm-muted" data-invite-group="general">General · the full app, no AI</p>'}
      <p class="cm-full cm-muted">Send → sign-in confirmed ✓ → invitation email</p>
      <ol class="cm-admin-steps cm-full" data-admin-steps hidden aria-live="polite"></ol>
      <p class="cm-error cm-full" hidden role="alert"></p>
      <div class="cm-form-footer cm-full">${b('Cancel','close')}<button class="v-button primary" type="submit">Send</button></div>
    </form>`;
  const step=(state,text)=>`<li data-state="${state}">${e(text)}</li>`;
  function wireShare(f){
    const steps=f.querySelector('[data-admin-steps]'),error=f.querySelector('.cm-error'),send=f.querySelector('[type=submit]');
    f.addEventListener('submit',async ev=>{
      ev.preventDefault();error.hidden=true;
      if(!f.reportValidity())return;
      const v={name:f.elements.name.value.trim(),email:f.elements.email.value.trim()};
      if(f.elements.group)v.group=f.elements.group.value;
      send.disabled=true;steps.hidden=false;
      steps.innerHTML=step('busy','Adding to Cloudflare Access (staging and production)…')+step('wait','Invitation email');
      try{
        const r=await api('POST','/invite',v);
        const access=(r.access||[]).map(a=>step('done',`${a.domain||a.name} · ${a.added?'added':'already had access'} · confirmed`)).join('');
        const mail=r.status==='sent'?step('done',`Invitation emailed to ${v.email}`):step('fail',r.error||'The invitation email is pending.');
        steps.innerHTML=access+mail;
        /* Sent: the window closes and a dialog confirms it (Rob, 2026-10-30), so nobody presses Cancel on a finished window. */
        if(r.status==='sent')C.modal('Invitation sent',`<p data-invite-confirmation>Your email has been successfully sent</p><div class="cm-form-footer">${b('Confirm','close',{},true)}</div>`);
        else steps.insertAdjacentHTML('beforeend',`<li>${b('Retry email','share-retry',{mail:r.id})}</li>`);
      }catch(err){steps.innerHTML=step('fail',err.message)+step('wait','No email was sent');error.textContent=err.message;error.hidden=false;}
      finally{send.disabled=false;}
    });
  }
  function openAdmin(section){
    // Viewing operational data and admitting people remain separate server-verified permissions.
    const invite=me?.canInvite===true,admin=me?.isAdmin===true,read=C.adminAllowed?.()===true;
    if(!invite&&!read)throw Error('Sign in to invite someone.');
    /* ROB-320: anyone signed in may invite (five people, General), so a person who is not an administrator gets the invitation
       form alone, in a window of its own. Admin and its operational pages stay the administrator's. */
    if(!admin&&!read){
      const d=C.modal('Invite someone',shareForm());wireShare(d.querySelector('[data-admin-share]'));return d;
    }
    const general=admin?'<div data-admin-general><p class="cm-muted" role="status">Loading…</p></div>':'<p class="cm-muted">Operational information is read-only. Invitation permissions are managed separately.</p>';
    const tabs=[{id:'general',icon:'⚙',label:'General',html:general+(C.adminSectionLinks?.()||'')}];
    if(invite)tabs.push({id:'share',icon:'✉',label:'Share',html:shareForm()});
    const d=C.modal('Admin',`<div class="cm-admin">${C.tabbed({id:'admin',label:'Admin sections',active:section,tabs})}</div>`);
    d.classList.add('cm-tabbed-dialog','cm-admin-dialog');
    const status=d.querySelector('[data-admin-general]'),form=d.querySelector('[data-admin-share]');
    if(status)drawGeneral(status);if(form)wireShare(form);
    return d;
  }
  C.openAdminWindow=openAdmin;
  actions['invite-crankmagic']=()=>{openAdmin('share');};
  C.drawProfile=()=>{const box=document.getElementById('cm-settings-profile');if(!box)return;box.innerHTML=me?`<div class="cm-profile-summary">${me.avatar?`<img src="${e(me.avatar)}" alt="Your profile picture">`:'<span class="cm-profile-placeholder" aria-hidden="true">'+e((me.name||me.email)[0].toUpperCase())+'</span>'}<div><strong>${e(me.name||'Set your name')}</strong><p>${e(me.email)}</p></div></div><div class="cm-settings-row">${b('Edit profile','profile-edit')}${b('Change email address','profile-email')}</div>`:'<p>Sign in to set your name and profile picture.</p>';};
  actions['profile-edit']=()=>{if(!me)throw Error('Sign in to edit your profile.');let avatar=me.avatar,picture=Promise.resolve(),pictureError=null,generation=0;const form=C.form('Edit profile',C.field('Name','name',me.name,'maxlength="80" required')+'<label class="cm-full">Profile picture<input type="file" accept="image/png,image/jpeg,image/webp" data-profile-file></label><p class="cm-full cm-muted">Choose a photo; it will be cropped to a square.</p><button type="button" class="v-button" data-remove-avatar>Remove picture</button>',async v=>{await picture;if(pictureError)throw pictureError;me=await api('PUT','/profile',{name:v.name,avatar});C.drawProfile();C.notice('Profile saved.');},'Save');form.querySelector('[data-remove-avatar]').onclick=()=>{generation++;pictureError=null;avatar='';form.querySelector('[data-profile-file]').value='';};form.querySelector('[data-profile-file]').onchange=ev=>{const file=ev.target.files[0];if(!file)return;const version=++generation;pictureError=null;picture=(async()=>{try{if(file.size>8*1024*1024)throw Error('Choose an image smaller than 8 MB.');const image=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const side=Math.min(image.width,image.height);canvas.getContext('2d').drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,256,256);if(version===generation)avatar=canvas.toDataURL('image/webp',.8);image.close();}catch(err){if(version===generation){pictureError=err;C.notice(err.message,true);}}})();};};
  actions['profile-email']=()=>C.form('Change email address',C.field('New email address','email','','type="email" required')+'<p class="cm-full">We will send a verification link. Your current sign-in remains active until you verify the new address.</p>',async v=>{await api('POST','/profile/email',v);C.notice('Verification sent to the new address.');},'Send verification');
  views['verify-email']=()=>{const token=C.route().params.get('token')||'';C.main.innerHTML=C.pageHead('Verify email address')+'<p>Confirm this address change for your signed-in account. Your decks, library, sharing permissions and game identity will stay with your account.</p>'+b('Confirm email address','profile-email-confirm',{token});};
  actions['profile-email-confirm']=async el=>{const result=await api('POST','/profile/email/confirm',{token:el.dataset.token});C.modal('Email verified',`<p>Your sign-in is now ${e(result.email)}. Sign out, then sign in with this address.</p><a class="v-button primary" href="/cdn-cgi/access/logout">Sign out</a>`);};
  // The shared Admin module owns the single menu entry; invitations are its Share section.
  C.profileMenu=()=>'';
  actions['open-profile']=()=>{C.go('settings');let tries=0;const reach=()=>{const h=document.getElementById('cm-settings-h-profile');if(h){h.scrollIntoView({block:'start'});h.closest('section')?.querySelector('input,button')?.focus({preventScroll:true});return;}if(tries++<20)setTimeout(reach,50);};reach();};
  C.sharingAvailable=()=>!!me;
  C.sharingOwner=()=>me?.email||null;
  C.canInvite=()=>me?.canInvite===true;
  C.inviteAdmin=()=>me?.isAdmin===true;
  C.sharingReady=document.querySelector('meta[name="crankmagic-accounts"]')?.content==='on'?api('GET','/me').then(v=>{me=v;C.drawProfile();const menu=document.getElementById('cm-user-menu');if(menu){let div=menu.querySelector('[data-profile-menu]');if(!div){div=document.createElement('div');div.dataset.profileMenu='';(menu.querySelector('[aria-label="You"]')||menu).append(div);}div.innerHTML=C.profileMenu();}}).catch(()=>null):Promise.resolve(null);
});
