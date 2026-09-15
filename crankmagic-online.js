(globalThis.CrankFeatures ||= []).push(function(C){
  const {esc:e}=C;
  C.views.game=async()=>{
    const local=location.hostname==='127.0.0.1'&&['8768','8769'].includes(location.port);
    const decks=C.state.decks.filter(d=>!d.archived);
    const layout=C.main.closest('.cm-layout');layout.classList.add('cm-play-collapsed');
    if(local){
      C.main.innerHTML=C.pageHead('CrankMagic Online',`<button class="v-button" id="online-sidebar" aria-expanded="false">☰ Show sidebar</button><a class="v-button" href="#decks">Deck editor</a><button class="v-button" id="online-setup">Game setup</button>`)+
        `<div class="cm-online-toolbar"><label>Your CrankMagic deck <select id="online-deck">${decks.map(d=>`<option value="${e(d.id)}">${e(d.name)}</option>`).join('')}</select></label><button class="v-button" id="online-use" ${decks.length?'':'disabled'}>Use this deck</button><p id="online-status" role="status">${decks.length?'Your edits are copied into the next game when you select Use this deck.':'This browser has no saved decks yet. Game setup also offers the host’s saved decks for testing.'}</p></div><iframe class="cm-game-frame" title="CrankMagic Online game table" src="/?embedded=1" allow="fullscreen"></iframe>`;
      const frame=C.main.querySelector('iframe'),status=C.main.querySelector('#online-status');
      const reportViewport=()=>{if(!frame.classList.contains('cm-game-expanded'))frame.contentWindow.postMessage({type:'crankmagic-viewport',height:Math.max(400,window.innerHeight-(frame.getBoundingClientRect().top+window.scrollY))},location.origin);};
      frame.addEventListener('load',reportViewport);window.addEventListener('resize',reportViewport);
      C.main.querySelector('#online-sidebar').addEventListener('click',event=>{const closed=layout.classList.toggle('cm-play-collapsed');event.currentTarget.textContent=closed?'☰ Show sidebar':'☰ Hide sidebar';event.currentTarget.setAttribute('aria-expanded',String(!closed));});
      C.main.querySelector('#online-setup').addEventListener('click',()=>frame.contentWindow.postMessage({type:'crankmagic-setup'},location.origin));
      C.main.querySelector('#online-use').addEventListener('click',async()=>{
        const deck=C.state.decks.find(d=>d.id===C.main.querySelector('#online-deck').value);if(!deck)return;
        const commanderIds=new Set(deck.commanders),payload={schema:'CrankMagicDeckHandoff@1',name:deck.name,sourceDeckId:deck.id,sourceRevision:C.state.revision,commanders:deck.commanders.map(id=>C.card(id)?.name),rows:deck.slots.filter(r=>r.purpose==='main'&&!commanderIds.has(r.cardId)).map(r=>({name:C.card(r.cardId)?.name,quantity:r.quantity}))};
        status.textContent='Resolving the cards in your selected hundred…';
        try{const session=await fetch('/api/setup').then(r=>r.json()),response=await fetch('/api/import-deck',{method:'POST',headers:{'Content-Type':'application/json','X-Commander-Token':session.token},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)throw Error(result.error);frame.contentWindow.postMessage({type:'crankmagic-setup',imported:result},location.origin);status.textContent='Snapshot ready. Finish configuring the table below.';}catch(error){status.textContent=error.message;}
      });
      const onMessage=event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow)return;if(event.data?.type==='crankmagic-live'){C.main.classList.add('cm-playing');C.main.classList.remove('cm-setting-up');}if(event.data?.type==='crankmagic-mode'&&event.data.mode==='setup'){C.main.classList.remove('cm-playing');C.main.classList.add('cm-setting-up');}if(event.data?.type==='crankmagic-canvas-size'&&Number.isFinite(event.data.height)){frame.style.height=Math.max(300,Math.min(25000,event.data.height+2))+'px';}if(event.data?.type==='crankmagic-focus')frame.classList.toggle('cm-game-expanded',!!event.data.open);if(event.data?.type==='crankmagic-sidebar')C.main.querySelector('#online-sidebar').click();if(event.data?.type==='crankmagic-exit')location.hash='decks';};
      const resizeAfterMode=event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&['crankmagic-live','crankmagic-mode'].includes(event.data?.type))requestAnimationFrame(reportViewport);};
      window.addEventListener('message',resizeAfterMode);
      window.addEventListener('message',onMessage);return()=>{window.removeEventListener('message',onMessage);window.removeEventListener('message',resizeAfterMode);window.removeEventListener('resize',reportViewport);layout.classList.remove('cm-play-collapsed');C.main.classList.remove('cm-playing','cm-setting-up');};
    }
    C.main.innerHTML=C.pageHead('CrankMagic Online','<button class="v-button" id="online-sidebar" aria-expanded="false">☰ Show sidebar</button>')+`<section class="cm-online-hero"><img src="assets/crankmagic/crankmagic-logo-wand-v3-256.webp" alt="" width="100" height="100"><div><span class="v-eyebrow">YOUR COMMANDER TABLE</span><h1>CrankMagic <em>Online</em></h1><p>Your decks. Four playmats. Every decision in your hands.</p></div></section>
    <div class="cm-online-layout"><section class="v-panel cm-online-panel"><h2>Bring your hundred</h2><p>Build and refine your deck here in CrankMagic, then take a snapshot to your game. Changes made after launch belong to your next match.</p><label>Deck to play<select id="online-deck">${decks.map(d=>`<option value="${e(d.id)}">${e(d.name)}</option>`).join('')}</select></label><div class="cm-actions"><button class="v-button primary" id="online-open" ${decks.length?'':'disabled'}>Open CrankMagic Online ↗</button><a class="v-button" id="online-edit" href="#decks">Edit in CrankMagic</a></div><p id="online-status" role="status" class="cm-muted"></p></section>
    <section class="v-panel cm-online-panel"><h2>Powered by your local host</h2><p>The hybrid companion runs while your computer is on. Native AI works locally. API-powered players will use a key held by the local service, never browser storage or a shared deck export.</p><p><strong>Current build:</strong> the browser table supports opening choices, card selection, and live board updates through the local rules host. Complex prompts still use the Forge window.</p><a class="v-button" href="${local?'/':'http://127.0.0.1:8768/app/#game'}" target="_blank" rel="noopener">Open game setup ↗</a></section></div>`;
    C.main.querySelector('#online-sidebar').addEventListener('click',event=>{const closed=layout.classList.toggle('cm-play-collapsed');event.currentTarget.textContent=closed?'☰ Show sidebar':'☰ Hide sidebar';event.currentTarget.setAttribute('aria-expanded',String(!closed));});
    const choice=C.main.querySelector('#online-deck'),edit=C.main.querySelector('#online-edit'),status=C.main.querySelector('#online-status');
    const update=()=>edit.href='#decks?deck='+encodeURIComponent(choice.value);choice.addEventListener('change',update);update();
    let popup,nonce,expiry;
    C.main.querySelector('#online-open').addEventListener('click',()=>{
      const deck=C.state.decks.find(d=>d.id===choice.value);if(!deck)return;
      const commanderIds=new Set(deck.commanders);
      const rows=deck.slots.filter(r=>r.purpose==='main'&&!commanderIds.has(r.cardId)).map(r=>({name:C.card(r.cardId)?.name,quantity:r.quantity}));
      const commanders=deck.commanders.map(id=>C.card(id)?.name);
      if(rows.some(r=>!r.name)||commanders.some(n=>!n)){status.textContent='Resolve unknown cards in the deck editor first.';return;}
      nonce=crypto.randomUUID();expiry=Date.now()+120000;
      popup=window.open('http://127.0.0.1:8768/#handoff='+nonce,'crankmagic-online');
      if(!popup){status.textContent='Allow this requested game window to open, then try again.';return;}
      pending={schema:'CrankMagicDeckHandoff@1',name:deck.name,sourceDeckId:deck.id,sourceRevision:C.state.revision,commanders,rows};
      status.textContent='Opening the local companion. Start its server if the game page is unavailable.';
    });
    let pending;
    const receive=event=>{if(event.origin!=='http://127.0.0.1:8768'||event.source!==popup||Date.now()>expiry||event.data?.nonce!==nonce)return;
      if(event.data?.type==='crankmagic-ready'){popup.postMessage({type:'crankmagic-deck',nonce,deck:pending},event.origin);}
      if(event.data?.type==='crankmagic-imported'){status.textContent='Deck snapshot received. Finish setup in CrankMagic Online.';pending=null;}
    };
    window.addEventListener('message',receive);return()=>{window.removeEventListener('message',receive);layout.classList.remove('cm-play-collapsed');};
  };
  C.views.online=()=>{location.hash='game';};
});
