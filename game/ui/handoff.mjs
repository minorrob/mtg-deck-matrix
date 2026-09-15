import {openGameSetup} from './setup.mjs';
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
      await openGameSetup(deck);window.opener.postMessage({type:'crankmagic-imported',nonce},event.origin);
      history.replaceState(null,'',location.pathname);
    }catch(error){document.getElementById('notice').textContent=`Deck import: ${error.message}. Your CrankMagic library is unchanged.`;}
    window.removeEventListener('message',receive);
  };
  window.addEventListener('message',receive);
  for(const origin of allowed)window.opener.postMessage({type:'crankmagic-ready',nonce},origin);
}
