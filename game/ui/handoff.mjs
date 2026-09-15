const nonce=new URLSearchParams(location.hash.slice(1)).get('handoff');
const allowed=['http://127.0.0.1:8768','https://minorrob.github.io'];
if(nonce&&/^[a-f0-9-]{36}$/.test(nonce)&&window.opener){
  const expiry=Date.now()+120000;let accepted=false;
  const receive=async event=>{
    if(accepted||Date.now()>expiry||!allowed.includes(event.origin)||event.source!==window.opener||event.data?.type!=='crankmagic-deck'||event.data.nonce!==nonce)return;
    accepted=true;
    try{
      const catalog=await fetch('/api/setup').then(r=>r.json());
      const result=await fetch('/api/import-deck',{method:'POST',headers:{'Content-Type':'application/json','X-Commander-Token':catalog.token},body:JSON.stringify(event.data.deck)});
      const deck=await result.json();if(!result.ok)throw Error(deck.error);
      sessionStorage.setItem('crankmagic-imported-deck',JSON.stringify({expires:Date.now()+120000,deck}));
      sessionStorage.setItem('crankmagic-return-channel',JSON.stringify({schema:'CrankMagicReturnChannel@1',nonce,origin:event.origin,sourceDeckId:event.data.deck.sourceDeckId||null}));
      window.opener.postMessage({type:'crankmagic-imported',nonce},event.origin);
      location.replace('/app/#game');
    }catch(error){document.getElementById('notice').textContent=`Deck import: ${error.message}. Your CrankMagic library is unchanged.`;window.opener.postMessage({type:'crankmagic-import-error',nonce,error:error.message},event.origin);}
    window.removeEventListener('message',receive);
  };
  window.addEventListener('message',receive);
  for(const origin of allowed)window.opener.postMessage({type:'crankmagic-ready',nonce},origin);
}
