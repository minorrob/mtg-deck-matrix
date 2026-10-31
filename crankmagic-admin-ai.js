/* THE OWNER'S TWO ADMIN PANES (ROB-338; docs/program/admin-pane-contract.md): the AI model, and the AI-only game.
 *
 * Rob, 2026-10-30: the third group "is only for me ... the administrative controls. That is the model settings ... the ability to
 * run AI-only games and observe." They are sections of the Admin page (crankmagic-admin.js), drawn only for the owner: /api/me
 * says `group: "owner"`, and this file fetches nothing from the owner's routes before the Admin page has asked it to draw.
 * Hiding is a convenience; the Worker refuses everyone else on each route (cloud/worker.mjs adminModel, game/room/lounge.mjs observe).
 *
 *   AI model     what is in force and where it came from; the models the API lists for this key (those CrankMagic allows can be
 *                chosen, the rest say why not); Undo goes back to the model before the last change
 *   AI-only game two to four AI seats and no one else, private; the owner is taken to the table as its host and watches it
 *                as an observer, who sees the public table and cannot act (the same table as the New game pop-up's Observe switch)
 */
(globalThis.CrankFeatures ||= []).push(function(C){
  const {esc:e,button:b,actions}=C;
  const date=value=>{const d=new Date(value);return value&&!Number.isNaN(d.getTime())?d.toLocaleString('en-US'):'';};
  /* The Worker wants its header, and JSON, on every write (cloud/worker.mjs fromTheApp). */
  async function call(method,path,body){
    const init={method,credentials:'same-origin',redirect:'manual',cache:'no-store',headers:{}};
    if(method!=='GET'){init.headers={'content-type':'application/json','x-crankmagic':'sync'};init.body=JSON.stringify(body||{});}
    const r=await fetch(path,init);
    if(r.type==='opaqueredirect'||r.status===401)throw Error('Sign in to use Admin.');
    const value=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(value.error||'Admin is unavailable. Try again.');
    return value;
  }
  const label=m=>m.name&&m.name!==m.id?`${m.name} (${m.id})`:m.id;
  const SOURCE={stored:'your choice here',env:"the Worker's AI_MODEL setting",default:'the built-in default'};

  async function modelPane(){
    const data=await call('GET','/api/admin/ai-model');
    const inUse=data.models.find(m=>m.current),named=inUse?label(inUse):data.model.id;
    const rows=data.models.map(m=>`<tr><th scope="row">${e(m.name)}<br><span class="cm-muted">${e(m.id)}</span></th><td>${m.current?'<strong>In use</strong>':m.allowed?b('Use this model','admin-ai-model-set',{model:m.id}):`<span class="cm-muted">${e(m.reason)}</span>`}</td></tr>`).join('');
    const back=data.previous?b(`Undo: go back to ${data.previous}`,'admin-ai-model-undo'):'<span class="cm-muted">Nothing to undo yet: the model has not been changed here.</span>';
    return `<section class="v-panel" data-admin-ai-model><h2>AI model</h2>
      <p>In use: <strong>${e(named)}</strong>, from ${e(SOURCE[data.model.source]||data.model.source)}${data.updatedAt?` · changed ${e(date(data.updatedAt))}`:''}. A change is the model of the next AI call, and it is kept.</p>
      ${data.storage==='missing'?'<p class="cm-error" role="alert">This database has not had its AI settings migration (0011) applied, so a change cannot be kept yet.</p>':''}
      ${data.listError?`<p class="cm-error" role="alert">${e(data.listError)} The model in use is unchanged.</p>`:`<p class="cm-muted">These are the models Anthropic lists for this key. CrankMagic uses only the lowest-cost ones (Rob's rule), so the others are shown and cannot be chosen.</p>`}
      ${rows?`<div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>Model</th><th>Choice</th></tr></thead><tbody>${rows}</tbody></table></div>`:''}
      <p>${back}</p><p id="cm-admin-ai-status" role="status"></p></section>`;
  }
  async function changeModel(label_,run,done){
    const status=document.getElementById('cm-admin-ai-status');
    try{if(status)status.textContent=label_;const data=await run();C.notice(done(data),false,{undo:false});await C.render();}
    catch(error){if(status)status.textContent=error.message;C.notice(error.message,true,{undo:false});}
  }
  actions['admin-ai-model-set']=el=>changeModel('Changing the model…',()=>call('PUT','/api/admin/ai-model',{model:el.dataset.model}),data=>`The AI model is now ${data.model.id}. The next AI call uses it.`);
  actions['admin-ai-model-undo']=()=>changeModel('Going back…',()=>call('POST','/api/admin/ai-model/undo'),data=>`The AI model is back to ${data.model.id}.`);

  /* The narrowest sensible table (docs/program/admin-pane-contract.md §5): two AI seats at Normal, private, 40 life, any bracket, no
     house rules, the AI on Claude never offered (so an AI-only game spends nothing); the decks are picked for the AI seats as in the lobby. */
  const SEATS=[2,3,4];
  function gamePane(){
    return `<section class="v-panel" data-admin-ai-game><h2>AI-only game</h2>
      <p>Make a table with only AI seats and watch it play. You are the observer: you see the table as a spectator does, you decide nothing, and nothing you press at the table is played. You start it from its lobby, as any host does.</p>
      <p class="cm-muted">The seats are CrankMagic's own AI at Normal, not Claude, so this spends nothing. The table is private, with 40 life and no house rules.</p>
      <label>AI seats <select id="cm-admin-ai-seats" aria-label="AI seats">${SEATS.map(n=>`<option value="${n}">${n}</option>`).join('')}</select></label>
      <p>${b('Make the table and watch','admin-ai-game-start',{},true)}</p><p id="cm-admin-ai-game-status" role="status"></p></section>`;
  }
  let starting=false;
  actions['admin-ai-game-start']=async()=>{
    const status=document.getElementById('cm-admin-ai-game-status'),T=C.tableTools;
    if(starting)return;
    if(!T){if(status)status.textContent='Play is not loaded on this page. Reload, then try again.';return;}
    const seats=Number(document.getElementById('cm-admin-ai-seats')?.value)||SEATS[0];
    const order=C.lounge?.PERSONA_ORDER||[],personas=C.lounge?.PERSONAS||{};
    starting=true;
    try{
      if(status)status.textContent='Making the table…';
      const list=Array.from({length:seats},(_,i)=>{const p=personas[order[i]];return {kind:'ai',level:'normal',...(p?{name:p.name,persona:p.id}:{})};});
      const {table}=await T.api('POST','/api/tables',{hostName:'Observer',seats:list,privacy:'private',observe:true});
      T.keepSeat?.(table.tableId);
      await T.finishTableSetup(table,{startingLife:'40',bracketLimit:'',privacy:'private',houseRules:false,deck:''});
    }catch(error){if(status)status.textContent=error.message;C.notice(error.message,true,{undo:false});}
    finally{starting=false;}
  };

  (C.adminOwnerPanes||=[]).push({key:'ai-model',label:'AI model',render:modelPane},{key:'ai-game',label:'AI-only game',render:async()=>gamePane()});
});
