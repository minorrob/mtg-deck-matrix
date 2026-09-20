(globalThis.CrankFeatures ||= []).push(function(C){
  const {esc:e}=C;
  async function attachMatchReport(report){
    if(report?.schema!=='CrankMagicOnlineMatchReport@1'||typeof report.matchId!=='string'||!Number.isInteger(report.seatId))throw Error('The game returned an invalid match report.');
    const deckId=report.deck?.source?.deckId,deck=C.state.decks.find(d=>d.id===deckId&&!d.archived);if(!deck)throw Error('The deck used for this match is no longer in this library.');
    if(C.state.games.some(game=>game.online?.matchId===report.matchId&&game.online?.seatId===report.seatId))return 'already attached';
    const opponents=(report.opponents||[]).map(item=>(item.commanders||[]).join(' + ')+(item.kind==='ai'&&item.difficulty?` · AI difficulty ${item.difficulty}`:'')).join('; ');
    await C.commit({type:'game',gameId:`game:online:${report.matchId}:${report.seatId}`,deckId,outcome:report.outcome,playedAt:report.completedAt,finish:report.finish,pod:report.podSize,bracket:report.bracket,turns:report.turns,seat:report.seatId+1,opponents,notes:report.playerFeedback?.notes||'CrankMagic Online match. Open the report from game history for event telemetry and deck signals.',online:report});
    C.notice('Online game report attached to '+deck.name+'.');return 'attached';
  }
  // 2026-09-17: do not overwrite C.views.game. The classic lobby lives in crankmagic-game.js;
  // this module wraps it with the host check and keeps its own legacy view under #online.
  const lobbyView=C.views.game;
  let hostStatus={checked:false,available:false};
  async function checkLocalHost(){
    if(location.hostname!=='127.0.0.1'){hostStatus={checked:true,available:false};return;}
    try{
      const response=await fetch('http://127.0.0.1:8768/api/health',{signal:AbortSignal.timeout(2500),cache:'no-store'}),result=await response.json();
      hostStatus={checked:true,available:response.ok&&result.product==='CrankMagic Online'&&result.protocol===1};
    }catch{hostStatus={checked:true,available:false};}
  }
  C.views.game=async()=>{
    if(!hostStatus.checked)await checkLocalHost();
    if(lobbyView)await lobbyView();
    if(location.hostname==='127.0.0.1'&&!hostStatus.available){
      const banner=document.createElement('div');banner.className='cm-host-offline-banner';
      banner.innerHTML=`<div class="v-panel cm-host-status"><h3>Local host offline</h3><p>The CrankMagic Online helper is not running. Start it to enable online multiplayer games.</p><p><strong>To start:</strong> Run the PowerShell helper script or use Codex with: <code>Use $start-crankmagic to start my local game host</code></p><button class="v-button" id="host-recheck">Check again</button><a class="v-button" href="#online">Online setup →</a></div>`;
      C.main.insertBefore(banner,C.main.firstChild);
      banner.querySelector('#host-recheck').addEventListener('click',async()=>{hostStatus.checked=false;C.render();});
    }
  };
  C.views.online=async()=>{
    const local=location.hostname==='127.0.0.1';
    const decks=C.state.decks.filter(d=>!d.archived);
    const layout=C.main.closest('.cm-layout');layout.classList.add('cm-play-collapsed');
    if(local){
      C.main.innerHTML=`<header class="cm-page-head"><div class="cm-actions"><button class="v-button" id="online-sidebar" aria-expanded="false">☰ Show sidebar</button><a class="v-button" href="#decks">Deck editor</a><button class="v-button" id="online-setup">Game setup</button></div></header>`+
        `<div class="cm-online-toolbar"><label>Your CrankMagic deck <select id="online-deck">${decks.map(d=>`<option value="${e(d.id)}">${e(d.name)}</option>`).join('')}</select></label><button class="v-button" id="online-use" ${decks.length?'':'disabled'}>Use this deck</button><p id="online-status" role="status">${decks.length?'Your edits are copied into the next game when you select Use this deck.':'This browser has no saved decks yet. Game setup also offers the host’s saved decks for testing.'}</p></div><iframe class="cm-game-frame" title="CrankMagic Online game table" src="/?embedded=1" allow="fullscreen"></iframe>`;
      const frame=C.main.querySelector('iframe'),status=C.main.querySelector('#online-status');
      const reportViewport=()=>{if(!frame.classList.contains('cm-game-expanded'))frame.contentWindow.postMessage({type:'crankmagic-viewport',height:Math.max(400,window.innerHeight-(frame.getBoundingClientRect().top+window.scrollY))},location.origin);};
      frame.addEventListener('load',reportViewport);window.addEventListener('resize',reportViewport);
      C.main.querySelector('#online-sidebar').addEventListener('click',event=>{const closed=layout.classList.toggle('cm-play-collapsed');event.currentTarget.textContent=closed?'☰ Show sidebar':'☰ Hide sidebar';event.currentTarget.setAttribute('aria-expanded',String(!closed));});
      C.main.querySelector('#online-setup').addEventListener('click',()=>frame.contentWindow.postMessage({type:'crankmagic-setup'},location.origin));
      C.main.querySelector('#online-use').addEventListener('click',async()=>{
        const deck=C.state.decks.find(d=>d.id===C.main.querySelector('#online-deck').value);if(!deck)return;
        const commanderIds=new Set(deck.commanders),payload={schema:'CrankMagicDeckHandoff@1',name:deck.name,sourceDeckId:deck.id,sourceDeckVersion:deck.version,sourceRevision:C.state.revision,commanders:deck.commanders.map(id=>C.card(id)?.name),rows:deck.slots.filter(r=>r.purpose==='main'&&!commanderIds.has(r.cardId)).map(r=>({name:C.card(r.cardId)?.name,quantity:r.quantity}))};
        status.textContent='Resolving the cards in your selected hundred…';
        try{const session=await fetch('/api/setup').then(r=>r.json()),response=await fetch('/api/import-deck',{method:'POST',headers:{'Content-Type':'application/json','X-Commander-Token':session.token},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)throw Error(result.error);frame.contentWindow.postMessage({type:'crankmagic-setup',imported:result},location.origin);status.textContent='Snapshot ready. Finish configuring the table below.';}catch(error){status.textContent=error.message;}
      });
      const onMessage=event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow)return;if(event.data?.type==='crankmagic-live'){C.main.classList.add('cm-playing');C.main.classList.remove('cm-setting-up');}if(event.data?.type==='crankmagic-mode'&&event.data.mode==='setup'){C.main.classList.remove('cm-playing');C.main.classList.add('cm-setting-up');}if(event.data?.type==='crankmagic-canvas-size'&&Number.isFinite(event.data.height)){frame.style.height=Math.max(300,Math.min(25000,event.data.height+2))+'px';}if(event.data?.type==='crankmagic-focus')frame.classList.toggle('cm-game-expanded',!!event.data.open);if(event.data?.type==='crankmagic-sidebar')C.main.querySelector('#online-sidebar').click();if(event.data?.type==='crankmagic-exit')location.hash='decks';if(event.data?.type==='crankmagic-match-report')attachMatchReport(event.data.report).then(result=>frame.contentWindow.postMessage({type:'crankmagic-match-report-saved',matchId:event.data.report.matchId,result},location.origin)).catch(error=>frame.contentWindow.postMessage({type:'crankmagic-match-report-error',matchId:event.data.report?.matchId,error:error.message},location.origin));};
      const resizeAfterMode=event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&['crankmagic-live','crankmagic-mode'].includes(event.data?.type))requestAnimationFrame(reportViewport);};
      window.addEventListener('message',resizeAfterMode);
      window.addEventListener('message',onMessage);return()=>{window.removeEventListener('message',onMessage);window.removeEventListener('message',resizeAfterMode);window.removeEventListener('resize',reportViewport);layout.classList.remove('cm-play-collapsed');C.main.classList.remove('cm-playing','cm-setting-up');};
    }
    C.main.innerHTML=`<section class="cm-online-hero"><div><span class="v-eyebrow">YOUR COMMANDER TABLE</span><h1>CrankMagic <em>Online</em></h1><p>Your decks. Four playmats. Every decision in your hands.</p></div><button class="v-button cm-online-sidebar-toggle" id="online-sidebar" aria-expanded="false">☰ Show sidebar</button></section>
    <div class="cm-online-layout"><section class="v-panel cm-online-panel"><h2>Bring your hundred</h2><p>Build and refine your deck here in CrankMagic, then take a snapshot to your game. Changes made after launch belong to your next match.</p><label>Deck to play<select id="online-deck">${decks.map(d=>`<option value="${e(d.id)}">${e(d.name)}</option>`).join('')}</select></label><div class="cm-actions"><button class="v-button primary" id="online-open" ${decks.length?'':'disabled'}>Open CrankMagic Online ↗</button><a class="v-button" id="online-edit" href="#decks">Edit in CrankMagic</a></div><p id="online-status" role="status" class="cm-muted"></p></section>
    <section class="v-panel cm-online-panel"><h2>Powered by your local host</h2><p>The hybrid companion runs while your computer is on. Native AI works locally. API-powered players will use a key held by the local service, never browser storage or a shared deck export.</p><p><strong>Current build:</strong> the browser table supports opening choices, card selection, and live board updates through the local rules host. Complex prompts still use the Forge window.</p><a class="v-button" href="${local?'/':'http://127.0.0.1:8768/app/#game'}" target="_blank" rel="noopener">Open game setup ↗</a></section></div>`;
    C.main.querySelector('#online-sidebar').addEventListener('click',event=>{const closed=layout.classList.toggle('cm-play-collapsed');event.currentTarget.textContent=closed?'☰ Show sidebar':'☰ Hide sidebar';event.currentTarget.setAttribute('aria-expanded',String(!closed));});
    const choice=C.main.querySelector('#online-deck'),edit=C.main.querySelector('#online-edit'),status=C.main.querySelector('#online-status');
    const update=()=>edit.href=choice.value?'#decks?deck='+encodeURIComponent(choice.value):'#decks';choice.addEventListener('change',update);update();if(!decks.length){choice.closest('label').hidden=true;C.main.querySelector('#online-open').hidden=true;status.textContent='No decks are saved in this browser yet. Open game setup to use the host’s saved decks, or create one in the deck editor.';}
    let popup,nonce,expiry,launchTimer;
    const dialog=document.createElement('dialog');dialog.className='cm-launch-dialog';
    dialog.innerHTML=`<form method="dialog"><button class="v-button cm-launch-close" aria-label="Close startup instructions">×</button></form><h2>Start your local table</h2><p>Your deck stays in CrankMagic while we connect to the rules host on this computer.</p><p id="launch-health" role="status">Checking the local host…</p><h3>Start with Codex</h3><p>Ask Codex:</p><pre>Use $start-crankmagic to start my local game host and open Play.</pre><button class="v-button" id="launch-copy">Copy startup request</button><p>The host starts Forge when you launch a game. Keep this computer awake while playing.</p><div class="cm-actions"><button class="v-button" id="launch-check">Check again</button><button class="v-button primary" id="launch-continue" disabled>Continue to game ↗</button></div>`;
    document.body.append(dialog);let launchDeck=false;
    const health=dialog.querySelector('#launch-health'),proceed=dialog.querySelector('#launch-continue');
    const checkHost=async()=>{proceed.disabled=true;health.textContent='Checking the local host…';try{
      const response=await fetch('http://127.0.0.1:8768/api/health',{signal:AbortSignal.timeout(2500),cache:'no-store'}),result=await response.json();
      if(!response.ok||result.product!=='CrankMagic Online'||result.protocol!==1)throw Error('Incompatible host');
      health.textContent='Local host ready. Continue to open your table.';proceed.disabled=false;
    }catch{health.textContent='The local host is unavailable or your browser could not reach it. Start it with the request below, then check again.';}};
    const showLaunch=withDeck=>{launchDeck=withDeck;dialog.showModal();checkHost();};
    dialog.querySelector('#launch-check').addEventListener('click',checkHost);
    dialog.querySelector('#launch-copy').addEventListener('click',async event=>{try{await navigator.clipboard.writeText('Use $start-crankmagic to start my local game host and open Play.');event.currentTarget.textContent='Copied';}catch{health.textContent='Select and copy the startup request above.';}});
    const setupLink=C.main.querySelector('.cm-online-panel a[target="_blank"]');
    setupLink.addEventListener('click',event=>{event.preventDefault();showLaunch(false);});
    proceed.addEventListener('click',()=>{if(!launchDeck){window.open('http://127.0.0.1:8768/app/#game','crankmagic-online');dialog.close();return;}transferDeck();});
    C.main.querySelector('#online-open').addEventListener('click',()=>showLaunch(true));
    const transferDeck=()=>{
      const deck=C.state.decks.find(d=>d.id===choice.value);if(!deck)return;
      const commanderIds=new Set(deck.commanders);
      const rows=deck.slots.filter(r=>r.purpose==='main'&&!commanderIds.has(r.cardId)).map(r=>({name:C.card(r.cardId)?.name,quantity:r.quantity}));
      const commanders=deck.commanders.map(id=>C.card(id)?.name);
      if(rows.some(r=>!r.name)||commanders.some(n=>!n)){status.textContent='Resolve unknown cards in the deck editor first.';return;}
      nonce=crypto.randomUUID();expiry=Date.now()+120000;
      popup=window.open('http://127.0.0.1:8768/#handoff='+nonce,'crankmagic-online');
      if(!popup){status.textContent='Allow this requested game window to open, then try again.';return;}
      pending={schema:'CrankMagicDeckHandoff@1',name:deck.name,sourceDeckId:deck.id,sourceDeckVersion:deck.version,sourceRevision:C.state.revision,commanders,rows};
      status.textContent='Transferring your deck snapshot…';dialog.close();clearTimeout(launchTimer);
      launchTimer=setTimeout(()=>{pending=null;status.textContent='The deck transfer timed out. Keep this tab open and try again; your saved deck is unchanged.';},120000);
    };
    let pending;
    const receive=event=>{if(event.origin!=='http://127.0.0.1:8768'||event.source!==popup||event.data?.nonce!==nonce)return;
      if(event.data?.type==='crankmagic-match-report'){attachMatchReport(event.data.report).then(result=>popup.postMessage({type:'crankmagic-match-report-saved',matchId:event.data.report.matchId,result},event.origin)).catch(error=>popup.postMessage({type:'crankmagic-match-report-error',matchId:event.data.report?.matchId,error:error.message},event.origin));return;}
      if(Date.now()>expiry)return;
      if(event.data?.type==='crankmagic-ready'){popup.postMessage({type:'crankmagic-deck',nonce,deck:pending},event.origin);}
      if(event.data?.type==='crankmagic-imported'){status.textContent='Deck snapshot received. Finish setup in CrankMagic Online.';pending=null;clearTimeout(launchTimer);}
      if(event.data?.type==='crankmagic-import-error'){status.textContent='Deck import: '+event.data.error;pending=null;clearTimeout(launchTimer);}
    };
    window.addEventListener('message',receive);return()=>{window.removeEventListener('message',receive);clearTimeout(launchTimer);dialog.remove();layout.classList.remove('cm-play-collapsed');};
  };
  C.views.online=()=>{location.hash='game';};
});
