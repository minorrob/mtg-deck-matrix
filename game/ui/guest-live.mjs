// Lightweight guest live play — no workshop dependencies
// Used only for /play guest path
const $=id=>document.getElementById(id);

let seatSession=null;
try{seatSession=JSON.parse(sessionStorage.getItem('crankmagic-seat-session')||'null');}
catch{/* Corrupt session will be replaced by lobby */}

if(!seatSession?.capability){
  $('phase').textContent='Connection failed';
  $('notice').textContent='No valid seat session. Return to the table lobby and rejoin.';
  throw Error('Missing seat session');
}

// Minimal live poller for guest view
function createSimplePoller({read,apply,onError}){
  let running=false,timer=null,failures=0;
  async function tick(){
    if(!running)return;
    try{
      const value=await read();
      apply(value);
      failures=0;
      timer=setTimeout(tick,750);
    }catch(error){
      failures++;
      const fatal=[401,403,404,410].includes(error.status);
      onError(error,{fatal,failures});
      if(fatal){running=false;return;}
      timer=setTimeout(tick,Math.min(5000,500*2**Math.min(failures-1,3)));
    }
  }
  return {
    async start(){if(running)return;running=true;failures=0;await tick();},
    stop(){running=false;clearTimeout(timer);}
  };
}

const poller=createSimplePoller({
  read:async()=>{
    const response=await fetch('/match/view',{headers:{Authorization:'Bearer '+seatSession.capability}});
    const value=await response.json();
    if(!response.ok)throw Object.assign(Error(value.error||'Unable to read match'),{status:response.status});
    return value;
  },
  apply:value=>{
    if(!value.state?.players?.length){
      $('phase').textContent='Waiting for the game to finish starting…';
      $('notice').textContent='The match is being set up. This will only take a moment.';
      return;
    }
    // Live match connected
    $('preview').textContent='LIVE TABLE · INVITED SEAT';
    $('phase').textContent='Live game connected';
    const scrubber=document.querySelector('.scrubber');
    if(scrubber)scrubber.hidden=true;
    
    // Show minimal game state
    const viewerSeatId=value.viewerSeatId??seatSession.seatId;
    const human=value.state.players.find(p=>p.playerId===viewerSeatId);
    const turnPlayer=value.state.players.find(p=>p.playerId===value.state.turnPlayerId);
    
    let statusText='';
    if(value.state.gameOver){
      statusText='Game complete';
    }else if(value.ui.prompt){
      statusText=value.ui.prompt.slice(0,200);
    }else if(turnPlayer){
      statusText=turnPlayer.playerId===viewerSeatId?'Your turn':'Waiting for '+turnPlayer.name;
    }
    
    $('notice').textContent=statusText||'Connected to live game. Full UI requires the complete review interface.';
    
    // Minimal hand display
    if(human?.zones?.Hand?.cards){
      const handCount=human.zones.Hand.cards.length;
      const handLabel=document.querySelector('.hand-label strong');
      if(handLabel)handLabel.textContent=`Your hand (${handCount} cards)`;
    }
  },
  onError:(error,{fatal,failures})=>{
    $('phase').textContent=fatal?'Connection failed':'Reconnecting…';
    const msg=fatal?error.message+' Return to the table lobby.':'Connection interrupted. Reconnecting… (attempt '+failures+')';
    $('notice').textContent=msg;
    if(fatal){
      console.error('Guest live connection fatal:',error);
    }
  }
});

$('setup').textContent='Table lobby';
$('setup').addEventListener('click',()=>location.assign('/'));

// Start live connection
poller.start().catch(error=>{
  $('phase').textContent='Connection failed';
  $('notice').textContent='Failed to start live connection: '+error.message;
  console.error('Guest live start error:',error);
});
