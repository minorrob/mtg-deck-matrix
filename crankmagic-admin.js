/* Administrator views use the existing verified account and read-only server endpoints.
 * A hidden menu row is convenience; /api/admin authorizes every request independently. */
(globalThis.CrankFeatures ||= []).push(function(C){
  const {esc:e,button:b,actions,views}=C;
  const enabled=document.querySelector('meta[name="crankmagic-accounts"]')?.content==='on';
  let person=null,checking=null,generation=0;
  async function read(path){const r=await fetch(path,{credentials:'same-origin',redirect:'manual',cache:'no-store'});
    if(r.type==='opaqueredirect'||r.status===401)throw Error('Sign in to open Admin.');
    const value=await r.json().catch(()=>({}));if(!r.ok)throw Error(value.error||'Admin is unavailable. Try again.');return value;}
  const menu=()=>person?.admin===true?'<a class="v-button" href="#admin" data-action="open-admin" data-admin-link>Admin</a>':'';
  function drawMenu(){const target=document.getElementById('cm-user-menu');if(!target)return;
    target.querySelector('[data-admin-menu]')?.remove();if(person?.admin===true){const slot=document.createElement('div');slot.dataset.adminMenu='';slot.innerHTML=menu();target.append(slot);}}
  async function identity(force=false){if(!enabled)return false;if(checking)return checking;if(person&&!force)return person.admin===true;
    checking=read('/api/me').then(value=>{person={admin:value.admin===true};drawMenu();return person.admin;}).catch(error=>{person={admin:false,error:error.message};drawMenu();return false;}).finally(()=>{checking=null;});return checking;}
  C.adminMenu=menu;C.adminReady=identity();
  document.getElementById('cm-user-menu')?.addEventListener('beforetoggle',drawMenu);
  const number=n=>Number(n||0).toLocaleString('en-US');
  const dollars=cents=>(Number(cents||0)/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
  const date=value=>{if(/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))){const [year,month,day]=value.split('-').map(Number),d=new Date(year,month-1,day);return d.getFullYear()===year&&d.getMonth()===month-1&&d.getDate()===day?d.toLocaleDateString('en-US'):'Unavailable';}const d=new Date(value);return value&&!Number.isNaN(d.getTime())?d.toLocaleString('en-US'):'Unavailable';};
  const link=(section,label)=>`<a class="v-button" href="#admin?section=${section}">${e(label)}</a>`;
  const sections=[['home','Overview'],['people','People and invites'],['features','Feature switches'],['spend','AI spend'],['health','Release and health']];
  const heading=section=>C.pageHead('Admin','<a class="v-button" href="#settings">Settings</a>')+`<nav class="cm-tabs cm-admin-nav" aria-label="Admin">${sections.map(([key,label])=>`<a class="v-button" href="#admin${key==='home'?'':'?section='+key}"${key===section?' aria-current="page"':''}>${e(label)}</a>`).join('')}</nav>`;
  actions['open-admin']=()=>C.go('admin');
  actions['admin-retry']=()=>C.render();
  views.admin=async()=>{
    const render=++generation,params=C.route().params,routeKey=params.toString(),active=()=>render===generation&&C.route().view==='admin'&&C.route().params.toString()===routeKey,section=sections.some(([key])=>key===params.get('section'))?params.get('section'):'home';
    C.main.innerHTML=heading(section)+'<p role="status">Checking administrator access…</p>';
    const allowed=await identity(true);if(!active())return;
    if(!allowed){C.main.innerHTML=C.pageHead('Admin')+(person?.error?`<section class="v-panel"><p class="cm-error" role="alert">${e(person.error)}</p>${b('Retry','admin-retry',{},true)}</section>`:'<section class="v-panel"><h2>Administrator access required</h2><p>This account cannot open Admin.</p><a class="v-button" href="#settings">Settings</a></section>');return;}
    C.main.innerHTML=heading(section)+'<p role="status">Loading…</p>';
    try{
      let body='';
      if(section==='home'){const data=await read('/api/admin');body=`<section class="v-panel"><h2>Overview</h2><p>${number((data.features||[]).filter(x=>x.value==='on').length)} features enabled · ${data.invitationsEnabled?'Invitations enabled':'Invitations unavailable'}</p><div class="cm-admin-cards">${sections.slice(1).map(([key,label])=>link(key,label)).join('')}</div></section>`;}
      if(section==='features'){const data=await read('/api/admin/features');body=`<section class="v-panel"><h2>Feature switches</h2><p class="cm-muted">Read-only. Changes are made in the Worker configuration.</p><div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>Feature</th><th>Current</th><th>Code default</th><th>Source</th></tr></thead><tbody>${(data.features||[]).map(x=>`<tr><th scope="row">${e(x.key)}</th><td>${e(x.value)}</td><td>${e(x.defaultValue)}</td><td>${e(x.source)}</td></tr>`).join('')}</tbody></table></div></section>`;}
      if(section==='people'){const q=new URLSearchParams();for(const key of ['before','after'])if(params.get(key))q.set(key,params.get(key));const data=await read('/api/admin/invites'+(q.size?'?'+q:''));await C.sharingReady;
        const invite=C.canInvite?.()?b('Invite to CrankMagic','invite-crankmagic'):'';
        body=`<section class="v-panel"><h2>People and invites</h2>${invite}${data.invites?.length?`<div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>Name</th><th>Email</th><th>Created</th><th>Admission</th><th>Email delivery</th></tr></thead><tbody>${data.invites.map(x=>`<tr><th scope="row">${e(x.name||'—')}</th><td>${e(x.email)}</td><td>${e(date(x.createdAt))}</td><td>${e(x.status)}</td><td>${e(x.deliveryStatus||'Not queued')}</td></tr>`).join('')}</tbody></table></div>`:'<p>No invitations yet.</p>'}${data.next?`<a class="v-button" href="#admin?${e(new URLSearchParams({section:'people',before:data.next.before,after:data.next.after}).toString())}">More invitations</a>`:''}</section>`;}
      if(section==='spend'){const data=await read('/api/admin/spend');body=`<section class="v-panel"><h2>AI spend · last 24 hours</h2><p><strong>${e(dollars(data.spentCents))}</strong> · ${number(data.calls)} calls</p><p>${data.capCents===null?'No overall cap configured.':`Overall cap: ${e(dollars(data.capCents))}`}</p><p class="cm-muted">${e(date(data.since))} to ${e(date(data.until))}</p></section>`;}
      if(section==='health'){const data=await read('/api/admin/health'),release=data.release;body=`<section class="v-panel"><h2>Release and health</h2>${release?`<dl><dt>Source commit</dt><dd>${e(release.commit||'Unavailable')}</dd><dt>Profile</dt><dd>${e(release.profile||'Unavailable')}</dd><dt>Build date</dt><dd>${e(date(release.date))}</dd></dl>`:'<p>Release details unavailable.</p>'}</section>`;}
      if(active())C.main.innerHTML=heading(section)+body;
    }catch(err){if(active())C.main.innerHTML=heading(section)+`<section class="v-panel"><p class="cm-error" role="alert">${e(err.message)}</p>${b('Retry','admin-retry',{},true)}</section>`;}
  };
});
